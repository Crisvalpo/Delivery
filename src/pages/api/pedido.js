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
      .select("id, nombre, formato_venta, precio, precio_costo, tipo_bulto")
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

      if (db.tipo_bulto === "Pesado") {
        bultosPesados += cant;
      }

      items.push({
        id: db.id,
        nombre: db.nombre,
        formato_venta: db.formato_venta,
        precioUnitario: db.precio,
        cantidad: cant,
        totalItem: db.precio * cant,
        categoria: db.tipo_bulto,
      });
    }

    // 4.5. Validar ventana activa
    const nowISO = new Date().toISOString();
    const { data: ventanaActiva, error: ventanaErr } = await supabase
      .from("ventanas_pedido")
      .select("*")
      .eq("activa", true)
      .gt("fecha_cierre", nowISO)
      .order("fecha_cierre", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (ventanaErr) {
      console.error("[LukeDelivery API] Error al buscar ventana activa:", ventanaErr);
      return res.status(500).json({
        success: false,
        message: "Error al validar la ventana de pedidos activa."
      });
    }

    if (!ventanaActiva) {
      return res.status(400).json({
        success: false,
        message: "La toma de pedidos está cerrada temporalmente para preparar el reparto. Volveremos a abrir pronto."
      });
    }

    // 6b. Buscar si existe un pedido pendiente para la misma ventana
    const { data: pedidoExistente, error: checkErr } = await supabase
      .from("pedidos")
      .select("*")
      .eq("cliente_id", finalClienteId)
      .eq("ventana_id", ventanaActiva.id)
      .eq("estado", "Pendiente")
      .maybeSingle();

    if (checkErr) {
      console.error("[LukeDelivery API] Error al verificar pedido existente:", checkErr);
      return res.status(500).json({
        success: false,
        message: "Error al verificar pedido existente para esta ventana."
      });
    }

    // 4. Validación de seguridad: regla del furgón (solo si es el pedido inicial)
    const esPedidoInicial = !pedidoExistente;
    if (esPedidoInicial && totalNeto < MONTO_MINIMO) {
      return res.status(400).json({
        success: false,
        message: `Pedido de $${totalNeto.toLocaleString("es-CL")} no alcanza el mínimo de $${MONTO_MINIMO.toLocaleString("es-CL")}.`,
      });
    }

    // 5. Cálculo del flete base para pedido inicial
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

    let pedidoId;
    let esFusion = false;

    if (pedidoExistente) {
      pedidoId = pedidoExistente.id;
      esFusion = true;

      // Iterar e insertar o actualizar items_pedido
      for (const it of items) {
        const { data: itemExistente, error: itemCheckErr } = await supabase
          .from("items_pedido")
          .select("*")
          .eq("pedido_id", pedidoId)
          .eq("producto_id", it.id)
          .maybeSingle();

        if (itemCheckErr) {
          console.error("[LukeDelivery API] Error al verificar item existente:", itemCheckErr);
          return res.status(500).json({
            success: false,
            message: "Error al verificar ítems existentes en el pedido anterior."
          });
        }

        if (itemExistente) {
          const nuevaCant = itemExistente.cantidad + it.cantidad;
          const { error: updErr } = await supabase
            .from("items_pedido")
            .update({
              cantidad: nuevaCant,
              total_item: it.precioUnitario * nuevaCant,
              estado: "pendiente"
            })
            .eq("id", itemExistente.id);

          if (updErr) {
            console.error("[LukeDelivery API] Error al actualizar item_pedido:", updErr);
            return res.status(500).json({
              success: false,
              message: "Error al actualizar la cantidad del ítem en la base de datos."
            });
          }
        } else {
          const { error: insErr } = await supabase
            .from("items_pedido")
            .insert({
              pedido_id: pedidoId,
              producto_id: it.id,
              cantidad: it.cantidad,
              precio_unitario: it.precioUnitario,
              total_item: it.totalItem,
              estado: "pendiente"
            });

          if (insErr) {
            console.error("[LukeDelivery API] Error al insertar nuevo item_pedido:", insErr);
            return res.status(500).json({
              success: false,
              message: "Error al insertar el nuevo ítem en la base de datos."
            });
          }
        }
      }
    } else {
      // Inserción normal de cabecera de pedido
      const { data: pedidoData, error: pedidoErr } = await supabase
        .from("pedidos")
        .insert({
          cliente_id: finalClienteId,
          total_neto: totalNeto,
          flete,
          total_pagar: totalPagar,
          total_costo: totalCosto,
          estado: "Pendiente",
          ventana_id: ventanaActiva.id
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

      pedidoId = pedidoData.id;

      // Insertar el detalle del pedido
      const dbItems = items.map((it) => ({
        pedido_id: pedidoId,
        producto_id: it.id,
        cantidad: it.cantidad,
        precio_unitario: it.precioUnitario,
        total_item: it.totalItem,
        estado: "pendiente"
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

    // Consultar la cabecera y los ítems finales consolidados de la base de datos (con los cálculos del trigger)
    const { data: pedidoActualizado, error: updPedidoErr } = await supabase
      .from("pedidos")
      .select("*")
      .eq("id", pedidoId)
      .single();

    if (updPedidoErr) {
      console.error("[LukeDelivery API] Error al consultar pedido consolidado:", updPedidoErr);
      return res.status(500).json({
        success: false,
        message: "Error al consultar los totales consolidados del pedido."
      });
    }

    const { data: itemsActualizados, error: updItemsErr } = await supabase
      .from("items_pedido")
      .select(`
        id, 
        producto_id, 
        cantidad, 
        precio_unitario, 
        total_item, 
        estado, 
        productos (nombre, formato_venta, tipo_bulto)
      `)
      .eq("pedido_id", pedidoId);

    if (updItemsErr) {
      console.error("[LukeDelivery API] Error al consultar items consolidados:", updItemsErr);
      return res.status(500).json({
        success: false,
        message: "Error al consultar los detalles consolidados del pedido."
      });
    }

    // Mapear los items actualizados al formato que espera el payload
    const itemsPayload = itemsActualizados.map((it) => ({
      id: it.producto_id,
      nombre: it.productos?.nombre || "Producto",
      formato_venta: it.productos?.formato_venta || "",
      precioUnitario: it.precio_unitario,
      cantidad: it.cantidad,
      totalItem: it.total_item,
      categoria: it.productos?.tipo_bulto || "Normal",
      estado: it.estado
    }));

    // 7. Payload consolidado
    const payload = {
      pedido_id: pedidoId,
      timestamp: new Date().toISOString(),
      cliente,
      items: itemsPayload,
      totalNeto: pedidoActualizado.total_neto,
      totalCosto: pedidoActualizado.total_costo,
      flete: pedidoActualizado.flete,
      totalPagar: pedidoActualizado.total_pagar,
      fusionado: esFusion
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

    if (!n8nOk) {
      console.warn("[LukeDelivery API] Continuando sin confirmación de n8n (modo piloto)");
    }

    // 9. Respuesta exitosa
    return res.status(200).json({
      success: true,
      message: esFusion ? "Pedido fusionado con éxito." : "Pedido creado con éxito.",
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
