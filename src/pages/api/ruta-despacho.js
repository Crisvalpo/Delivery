import { createAdminClient } from "../../lib/supabase/server";
import { validateAdminSecret, sendUnauthorized } from "../../lib/admin-auth";

/**
 * Envía un mensaje de WhatsApp proactivo vía el wa-bridge.
 * No lanza excepción si el bridge no está disponible.
 */
async function enviarNotificacionWA(whatsapp, mensaje) {
  const bridgeUrl = process.env.WA_BRIDGE_URL;
  if (!bridgeUrl) {
    console.warn("[ruta-despacho] WA_BRIDGE_URL no configurada. Omitiendo notificación WA.");
    return false;
  }

  // Limpiar número: solo dígitos
  const numero = whatsapp.replace(/[^0-9]/g, "");
  if (!numero) {
    console.warn("[ruta-despacho] Número de WhatsApp inválido, omitiendo notificación.");
    return false;
  }

  try {
    const res = await fetch(`${bridgeUrl}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: numero, text: mensaje }),
      signal: AbortSignal.timeout(8000), // timeout de 8s
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.warn(`[ruta-despacho] wa-bridge respondió ${res.status}: ${errBody.substring(0, 200)}`);
      return false;
    }

    console.log(`[ruta-despacho] Notificación WA enviada a ${numero}`);
    return true;
  } catch (err) {
    console.warn("[ruta-despacho] No se pudo enviar notificación WA:", err.message);
    return false;
  }
}

export default async function handler(req, res) {
  if (!validateAdminSecret(req)) {
    return sendUnauthorized(res);
  }

  const supabase = createAdminClient();

  // ─── GET: Lista de pedidos del día (Preparado + En Ruta) ────────────────────
  if (req.method === "GET") {
    try {
      // Buscar ventana activa o la más reciente que tuvo pedidos
      const nowISO = new Date().toISOString();
      let { data: ventana } = await supabase
        .from("ventanas_pedido")
        .select("*")
        .eq("activa", true)
        .order("fecha_entrega", { ascending: true })
        .limit(1)
        .maybeSingle();

      // Si no hay ventana abierta, usar la más reciente (para ver entregas de la ruta actual)
      if (!ventana) {
        const { data: ultima } = await supabase
          .from("ventanas_pedido")
          .select("*")
          .order("fecha_entrega", { ascending: false })
          .limit(1)
          .maybeSingle();
        ventana = ultima;
      }

      if (!ventana) {
        return res.status(200).json({ success: true, pedidos: [], ventana: null });
      }

      // Traer pedidos Preparado o En Ruta de esa ventana
      const { data: pedidos, error: pedErr } = await supabase
        .from("pedidos")
        .select(`
          id,
          estado,
          total_neto,
          flete,
          total_pagar,
          created_at,
          clientes (
            id,
            nombre_tienda,
            nombre_contacto,
            whatsapp,
            sector,
            notas_campo,
            latitud,
            longitud,
            tipo_negocio
          ),
          items_pedido (
            cantidad,
            precio_unitario,
            total_item,
            estado,
            productos (
              nombre,
              formato_venta,
              tipo_bulto
            )
          ),
          bultos_despacho (
            id,
            codigo_bulto,
            estado,
            entregado_at
          )
        `)
        .in("estado", ["Preparado", "En Ruta", "Entregado"])
        .eq("ventana_id", ventana.id)
        .order("created_at", { ascending: true });

      if (pedErr) throw pedErr;

      return res.status(200).json({
        success: true,
        ventana,
        pedidos: pedidos || [],
      });
    } catch (err) {
      console.error("[ruta-despacho] Error en GET:", err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ─── POST: Actualizar estado + notificación WA ──────────────────────────────
  if (req.method === "POST") {
    const { pedido_id, nuevo_estado } = req.body;

    if (!pedido_id || !["En Ruta", "Entregado"].includes(nuevo_estado)) {
      return res.status(400).json({
        success: false,
        message: "Se requiere 'pedido_id' y 'nuevo_estado' válido (En Ruta | Entregado).",
      });
    }

    try {
      // 1. Actualizar estado del pedido
      const { error: updateErr } = await supabase
        .from("pedidos")
        .update({ estado: nuevo_estado })
        .eq("id", pedido_id);

      if (updateErr) throw updateErr;

      // 2. Obtener datos del pedido y cliente para la notificación
      const { data: pedido, error: pedErr } = await supabase
        .from("pedidos")
        .select(`
          id,
          total_pagar,
          flete,
          clientes (
            nombre_contacto,
            nombre_tienda,
            whatsapp
          )
        `)
        .eq("id", pedido_id)
        .single();

      if (pedErr) throw pedErr;

      const cliente = pedido.clientes;
      let mensajeWA = null;
      let waEnviado = false;

      if (cliente?.whatsapp) {
        const totalFormateado = pedido.total_pagar?.toLocaleString("es-CL") ?? "0";

        if (nuevo_estado === "En Ruta") {
          mensajeWA =
            `🚐 ¡Hola ${cliente.nombre_contacto}! Tu pedido de *${cliente.nombre_tienda}* ya está en camino.\n\n` +
            `📦 Total a pagar al recibir: *$${totalFormateado}*\n\n` +
            `¡Nos vemos en un ratito! 👋`;
        } else if (nuevo_estado === "Entregado") {
          mensajeWA =
            `✅ ¡Listo ${cliente.nombre_contacto}! Tu pedido fue entregado con éxito en *${cliente.nombre_tienda}*.\n\n` +
            `Gracias por preferirnos. Cuando necesites reponer, ¡escríbele a Jaime! 😊`;
        }

        if (mensajeWA) {
          waEnviado = await enviarNotificacionWA(cliente.whatsapp, mensajeWA);
        }
      }

      return res.status(200).json({
        success: true,
        message: `Pedido actualizado a '${nuevo_estado}'.`,
        wa_enviado: waEnviado,
      });
    } catch (err) {
      console.error("[ruta-despacho] Error en POST:", err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ success: false, message: `Método ${req.method} no permitido` });
}
