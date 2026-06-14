import { createAdminClient } from "@/lib/supabase/server";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res
      .status(405)
      .json({ success: false, message: `Método ${req.method} no permitido` });
  }

  const { token } = req.query;

  if (!token) {
    return res
      .status(400)
      .json({ success: false, message: "Token de sesión requerido." });
  }

  try {
    const supabase = createAdminClient();

    // 1. Consultar la sesión del formulario
    const { data: sesion, error: sesionErr } = await supabase
      .from("sesiones_formulario")
      .select("*")
      .eq("token", token)
      .single();

    if (sesionErr || !sesion) {
      console.warn(`[validar-token] Token inválido o no encontrado: ${token}`);
      return res
        .status(404)
        .json({ success: false, message: "Enlace no válido. Solicita uno nuevo." });
    }

    // 2. Verificar si ya fue usado
    if (sesion.usado) {
      console.warn(`[validar-token] Intento de re-uso de token: ${token}`);
      return res
        .status(403)
        .json({ success: false, message: "Este enlace ya fue utilizado. Por favor, solicita uno nuevo en WhatsApp." });
    }

    // 3. Verificar si expiró
    const expiraAt = new Date(sesion.expira_at);
    const ahora = new Date();
    if (expiraAt < ahora) {
      return res
        .status(400)
        .json({ success: false, message: "Este enlace ha expirado. Solicita uno nuevo por WhatsApp." });
    }

    // 4. Obtener información del cliente asociado
    const { data: cliente, error: clienteErr } = await supabase
      .from("clientes")
      .select("*")
      .eq("id", sesion.cliente_id)
      .single();

    if (clienteErr || !cliente) {
      return res
        .status(404)
        .json({ success: false, message: "Cliente asociado no encontrado." });
    }

    // 4.5. Buscar ventana activa de pedidos
    const nowISO = new Date().toISOString();
    const { data: ventanaActiva, error: ventanaErr } = await supabase
      .from("ventanas_pedido")
      .select("*")
      .eq("activa", true)
      .gt("fecha_cierre", nowISO)
      .order("fecha_cierre", { ascending: true })
      .limit(1)
      .maybeSingle();

    let pedidoPendiente = null;
    if (ventanaActiva) {
      // Buscar si el cliente tiene un pedido Pendiente en esta ventana
      const { data: pedPend, error: pedErr } = await supabase
        .from("pedidos")
        .select("id, total_neto, flete, total_pagar")
        .eq("cliente_id", sesion.cliente_id)
        .eq("ventana_id", ventanaActiva.id)
        .eq("estado", "Pendiente")
        .maybeSingle();

      if (!pedErr && pedPend) {
        // Buscar items del pedido
        const { data: items, error: itemsErr } = await supabase
          .from("items_pedido")
          .select(`
            id,
            producto_id,
            cantidad,
            precio_unitario,
            total_item,
            productos (nombre, formato_venta)
          `)
          .eq("pedido_id", pedPend.id);

        if (!itemsErr && items) {
          pedidoPendiente = {
            ...pedPend,
            items: items.map(it => ({
              id: it.producto_id,
              nombre: it.productos?.nombre || "Producto",
              formato_venta: it.productos?.formato_venta || "",
              cantidad: it.cantidad,
              precioUnitario: it.precio_unitario,
              totalItem: it.total_item
            }))
          };
        } else {
          pedidoPendiente = pedPend;
        }
      }
    }

    return res.status(200).json({
      success: true,
      usado: sesion.usado || false,
      cliente_id: sesion.cliente_id,
      cliente: {
        id: cliente.id,
        nombre_tienda: cliente.nombre_tienda,
        nombre_contacto: cliente.nombre_contacto,
        whatsapp: cliente.whatsapp,
        sector: cliente.sector,
        latitud: cliente.latitud,
        longitud: cliente.longitud,
        tipo_negocio: cliente.tipo_negocio,
      },
      ventanaActiva,
      pedidoPendiente,
    });
  } catch (err) {
    console.error("[validar-token] Error general:", err);
    return res.status(500).json({
      success: false,
      message: "Error interno al validar el token de sesión.",
      error: err.message,
    });
  }
}
