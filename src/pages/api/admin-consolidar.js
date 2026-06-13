import { createAdminClient } from "../../lib/supabase/server";
import { validateAdminSecret, sendUnauthorized } from "../../lib/admin-auth";

export default async function handler(req, res) {
  // 🔐 Validar secreto del administrador
  if (!validateAdminSecret(req)) {
    return sendUnauthorized(res);
  }

  const supabase = createAdminClient();

  // 1. Buscar la ventana activa actual
  const nowISO = new Date().toISOString();
  const { data: ventanaActiva, error: ventErr } = await supabase
    .from("ventanas_pedido")
    .select("*")
    .eq("activa", true)
    .gt("fecha_cierre", nowISO)
    .order("fecha_cierre", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (ventErr) {
    console.error("[admin-consolidar] Error buscando ventana activa:", ventErr.message);
    return res.status(500).json({ success: false, error: ventErr.message });
  }

  if (!ventanaActiva) {
    return res.status(200).json({ success: true, message: "No hay ninguna ventana de pedidos activa actualmente.", items: [] });
  }

  // --- Método GET: Consultar ítems agrupados ---
  if (req.method === "GET") {
    try {
      // Consultamos todos los items_pedido de los pedidos en estado 'Pendiente' o 'Preparado' de la ventana activa
      const { data: items, error: itemsErr } = await supabase
        .from("items_pedido")
        .select(`
          producto_id,
          cantidad,
          estado,
          productos (
            nombre,
            formato_venta
          ),
          pedidos!inner (
            estado,
            ventana_id
          )
        `)
        .in("pedidos.estado", ["Pendiente", "Preparado"])
        .eq("pedidos.ventana_id", ventanaActiva.id);

      if (itemsErr) throw itemsErr;

      // Agrupar en memoria en Node.js
      const agrupado = {};
      items.forEach((it) => {
        const prod = it.productos;
        if (!prod) return;
        
        if (!agrupado[it.producto_id]) {
          agrupado[it.producto_id] = {
            producto_id: it.producto_id,
            nombre: prod.nombre,
            formato_venta: prod.formato_venta,
            cantidad_total: 0,
            estado: it.estado,
          };
        }
        agrupado[it.producto_id].cantidad_total += it.cantidad;

        // Regla de consolidación de estado:
        // Si hay algún ítem 'pendiente', el estado consolidado del producto es 'pendiente'.
        // Si no hay pendientes, pero hay al menos un 'conseguido', es 'conseguido'.
        // Si todos son 'no_disponible', entonces es 'no_disponible'.
        const estadoActual = agrupado[it.producto_id].estado;
        if (it.estado === "pendiente") {
          agrupado[it.producto_id].estado = "pendiente";
        } else if (it.estado === "conseguido" && estadoActual !== "pendiente") {
          agrupado[it.producto_id].estado = "conseguido";
        } else if (it.estado === "no_disponible" && estadoActual !== "pendiente" && estadoActual !== "conseguido") {
          agrupado[it.producto_id].estado = "no_disponible";
        }
      });

      const itemsConsolidados = Object.values(agrupado).sort((a, b) => b.cantidad_total - a.cantidad_total);

      return res.status(200).json({
        success: true,
        ventana: ventanaActiva,
        items: itemsConsolidados,
      });
    } catch (err) {
      console.error("[admin-consolidar] Error en GET:", err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // --- Método POST: Actualizar estado de ítems de forma masiva ---
  if (req.method === "POST") {
    const { producto_id, accion } = req.body;

    if (!producto_id || !["pendiente", "conseguido", "no_disponible"].includes(accion)) {
      return res.status(400).json({
        success: false,
        message: "Campos 'producto_id' y 'accion' (pendiente | conseguido | no_disponible) son requeridos.",
      });
    }

    try {
      // 1. Obtener los IDs de pedidos pendientes o preparados de la ventana activa
      const { data: pedidos, error: pedErr } = await supabase
        .from("pedidos")
        .select("id")
        .in("estado", ["Pendiente", "Preparado"])
        .eq("ventana_id", ventanaActiva.id);

      if (pedErr) throw pedErr;

      if (!pedidos || pedidos.length === 0) {
        return res.status(200).json({
          success: true,
          message: "No hay pedidos pendientes o preparados en la ventana activa para actualizar.",
        });
      }

      const pedidoIds = pedidos.map((p) => p.id);

      // 2. Actualizar el estado de los items_pedido correspondientes
      const { error: updateErr } = await supabase
        .from("items_pedido")
        .update({ estado: accion })
        .in("pedido_id", pedidoIds)
        .eq("producto_id", producto_id);

      if (updateErr) throw updateErr;

      return res.status(200).json({
        success: true,
        message: `Estado de mercadería actualizado a '${accion}' con éxito.`,
      });
    } catch (err) {
      console.error("[admin-consolidar] Error en POST:", err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ success: false, message: `Método ${req.method} no permitido` });
}
