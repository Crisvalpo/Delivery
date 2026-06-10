import { createAdminClient } from "@/lib/supabase/server";

const MONTO_MINIMO = 35000;
const FLETE_BASE = 3000;
const RECARGO_PESADO = 500;

export default async function handler(req, res) {
  // Solo POST
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res
      .status(405)
      .json({ success: false, message: `Método ${req.method} no permitido` });
  }

  const { cliente_id, token, productos_seleccionados } = req.body;

  // Validación de datos
  if (
    (!cliente_id && !token) ||
    !Array.isArray(productos_seleccionados) ||
    productos_seleccionados.length === 0
  ) {
    return res
      .status(400)
      .json({ success: false, message: "Datos incompletos o inválidos." });
  }

  const identityInfo = token ? `token ${token}` : `cliente ${cliente_id}`;
  console.log(
    `[LukeDelivery API] Pedido de ${identityInfo} con ${productos_seleccionados.length} ítems`
  );

  try {
    const supabase = createAdminClient();

    let finalClienteId = cliente_id;

    // Validar token si viene en el request
    if (token) {
      const { data: sesion, error: sesionErr } = await supabase
        .from("sesiones_formulario")
        .select("*")
        .eq("token", token)
        .single();

      if (sesionErr || !sesion) {
        return res
          .status(400)
          .json({ success: false, message: "Token de sesión no válido." });
      }

      if (sesion.usado) {
        return res
          .status(400)
          .json({ success: false, message: "Este enlace ya fue utilizado para realizar un pedido." });
      }

      const expiraAt = new Date(sesion.expira_at);
      if (expiraAt < new Date()) {
        return res
          .status(400)
          .json({ success: false, message: "El enlace de esta sesión ha expirado." });
      }

      finalClienteId = sesion.cliente_id;
    }

    // 1. Consulta eficiente: una sola query con filtro IN
    const ids = productos_seleccionados.map((p) => p.id);
    const { data: dbProds, error: prodErr } = await supabase
      .from("productos")
      .select("id, nombre, formato_venta, precio, precio_costo, categoria_logistica")
      .in("id", ids);

    if (prodErr) {
      console.error("[LukeDelivery API] Error DB:", prodErr);
      return res
        .status(500)
        .json({ success: false, message: "Error al consultar productos." });
    }

    if (!dbProds || dbProds.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Productos no encontrados." });
    }

    // 2. Mapear para acceso O(1)
    const prodMap = Object.fromEntries(dbProds.map((p) => [p.id, p]));

    // 3. Recálculo en servidor (NUNCA confiar en precios del cliente)
    let totalNeto = 0;
    let totalCosto = 0;
    let bultosPesados = 0;
    const items = [];

    for (const item of productos_seleccionados) {
      const db = prodMap[item.id];
      if (!db) continue;

      const cant = parseInt(item.cantidad, 10);
      if (isNaN(cant) || cant <= 0) continue;

      totalNeto += db.precio * cant;
      totalCosto += db.precio_costo * cant;

      if (db.categoria_logistica === "Pesado") {
        bultosPesados += cant;
      }

      items.push({
        id: db.id,
        nombre: db.nombre,
        formato_venta: db.formato_venta,
        precioUnitario: db.precio,
        cantidad: cant,
        totalItem: db.precio * cant,
        categoria: db.categoria_logistica,
      });
    }

    // 4. Validación de seguridad: regla del furgón
    if (totalNeto < MONTO_MINIMO) {
      return res.status(400).json({
        success: false,
        message: `Pedido de $${totalNeto.toLocaleString("es-CL")} no alcanza el mínimo de $${MONTO_MINIMO.toLocaleString("es-CL")}.`,
      });
    }

    // 5. Cálculo del flete
    const flete = FLETE_BASE + RECARGO_PESADO * bultosPesados;
    const totalPagar = totalNeto + flete;

    // 6. Info del cliente (best-effort)
    let cliente = { id: finalClienteId, nombre_tienda: "Cliente Piloto" };
    const { data: dbCliente } = await supabase
      .from("clientes")
      .select("*")
      .eq("id", finalClienteId)
      .single();

    if (dbCliente) cliente = dbCliente;

    // 6b. Persistencia del Pedido en Supabase
    const { data: pedidoData, error: pedidoErr } = await supabase
      .from("pedidos")
      .insert({
        cliente_id: finalClienteId,
        total_neto: totalNeto,
        flete,
        total_pagar: totalPagar,
        total_costo: totalCosto,
        estado: "Pendiente",
      })
      .select("id")
      .single();

    if (pedidoErr) {
      console.error("[LukeDelivery API] Error al guardar cabecera de pedido:", pedidoErr);
      return res.status(500).json({
        success: false,
        message: "Error al guardar el pedido en la base de datos.",
        error: pedidoErr.message,
      });
    }

    const pedidoId = pedidoData.id;

    // Insertar el detalle del pedido
    const dbItems = items.map((it) => ({
      pedido_id: pedidoId,
      producto_id: it.id,
      cantidad: it.cantidad,
      precio_unitario: it.precioUnitario,
      total_item: it.totalItem,
    }));

    const { error: itemsErr } = await supabase
      .from("items_pedido")
      .insert(dbItems);

    if (itemsErr) {
      console.error("[LukeDelivery API] Error al guardar ítems del pedido:", itemsErr);
      return res.status(500).json({
        success: false,
        message: "Error al guardar los detalles del pedido en la base de datos.",
        error: itemsErr.message,
      });
    }

    // Si usamos un token y el pedido se guardó correctamente, marcarlo como usado
    if (token) {
      const { error: tokenUpdateErr } = await supabase
        .from("sesiones_formulario")
        .update({ usado: true })
        .eq("token", token);

      if (tokenUpdateErr) {
        console.error("[LukeDelivery API] Error al marcar token como usado:", tokenUpdateErr);
      }
    }

    // 7. Payload consolidado
    const payload = {
      pedido_id: pedidoId,
      timestamp: new Date().toISOString(),
      cliente,
      items,
      totalNeto,
      totalCosto,
      bultosPesados,
      flete,
      totalPagar,
    };

    console.log("[LukeDelivery API] Enviando a n8n:", JSON.stringify(payload, null, 2));

    // 8. Puente con n8n
    const n8nUrl =
      process.env.N8N_WEBHOOK_URL ||
      "http://localhost:5678/webhook/nuevo-pedido";

    let n8nOk = false;
    try {
      const n8nRes = await fetch(n8nUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      n8nOk = n8nRes.ok;
      if (!n8nOk) {
        console.warn("[LukeDelivery API] n8n respondió:", n8nRes.status);
      }
    } catch (n8nErr) {
      console.warn("[LukeDelivery API] n8n no disponible:", n8nErr.message);
    }

    // Para el piloto: si n8n no está levantado, igual respondemos OK al cliente
    // En producción cambiar esto a un error 502
    if (!n8nOk) {
      console.warn("[LukeDelivery API] Continuando sin confirmación de n8n (modo piloto)");
    }

    // 9. Respuesta exitosa
    return res.status(200).json({
      success: true,
      message: "Pedido calculado correctamente.",
      ...payload,
    });
  } catch (err) {
    console.error("[LukeDelivery API] Error general:", err);
    return res.status(500).json({
      success: false,
      message: "Error interno al procesar el pedido.",
      error: err.message,
    });
  }
}
