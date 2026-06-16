import { createAdminClient } from "../../lib/supabase/server";
import { validateAdminSecret, sendUnauthorized } from "../../lib/admin-auth";

/**
 * Envía un mensaje de WhatsApp proactivo vía el wa-bridge.
 */
async function enviarNotificacionWA(whatsapp, mensaje) {
  const bridgeUrl = process.env.WA_BRIDGE_URL;
  if (!bridgeUrl) {
    console.warn("[bultos] WA_BRIDGE_URL no configurada. Omitiendo notificación WA.");
    return false;
  }

  const numero = whatsapp.replace(/[^0-9]/g, "");
  if (!numero) {
    console.warn("[bultos] Número de WhatsApp inválido, omitiendo notificación.");
    return false;
  }

  try {
    const res = await fetch(`${bridgeUrl}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: numero, text: mensaje }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.warn(`[bultos] wa-bridge respondió ${res.status}: ${errBody.substring(0, 200)}`);
      return false;
    }

    console.log(`[bultos] Notificación WA enviada a ${numero}`);
    return true;
  } catch (err) {
    console.warn("[bultos] No se pudo enviar notificación WA:", err.message);
    return false;
  }
}

export default async function handler(req, res) {
  if (!validateAdminSecret(req)) {
    return sendUnauthorized(res);
  }

  const supabase = createAdminClient();

  // ─── GET: Obtener bultos de un pedido ───────────────────────────────────────
  if (req.method === "GET") {
    const { pedido_id } = req.query;

    if (!pedido_id) {
      return res.status(400).json({ success: false, message: "Se requiere 'pedido_id'." });
    }

    try {
      const { data: bultos, error } = await supabase
        .from("bultos_despacho")
        .select("*")
        .eq("pedido_id", pedido_id)
        .order("codigo_bulto", { ascending: true });

      if (error) throw error;

      return res.status(200).json({ success: true, bultos: bultos || [] });
    } catch (err) {
      console.error("[bultos API] Error en GET:", err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ─── POST: Acciones de crear y escanear bultos ──────────────────────────────
  if (req.method === "POST") {
    const { accion } = req.body;

    if (!accion || !["crear", "escanear"].includes(accion)) {
      return res.status(400).json({ success: false, message: "Se requiere una 'accion' válida (crear | escanear)." });
    }

    // A. CREAR BULTOS
    if (accion === "crear") {
      const { pedido_id, cantidad_bultos } = req.body;
      const cant = parseInt(cantidad_bultos);

      if (!pedido_id || isNaN(cant) || cant <= 0) {
        return res.status(400).json({ success: false, message: "Parámetros inválidos para crear bultos." });
      }

      try {
        // 1. Eliminar bultos anteriores para evitar duplicados si se recrean
        const { error: delErr } = await supabase
          .from("bultos_despacho")
          .delete()
          .eq("pedido_id", pedido_id);

        if (delErr) throw delErr;

        // 2. Crear bultos correlativos
        const pedidoIdShort = pedido_id.slice(0, 8).toUpperCase();
        const nuevosBultos = [];

        for (let i = 1; i <= cant; i++) {
          nuevosBultos.push({
            pedido_id,
            codigo_bulto: `LDP-${pedidoIdShort}-B${i}`,
            estado: "preparado"
          });
        }

        const { data: bultosCreados, error: insErr } = await supabase
          .from("bultos_despacho")
          .insert(nuevosBultos)
          .select();

        if (insErr) throw insErr;

        return res.status(200).json({ success: true, bultos: bultosCreados });
      } catch (err) {
        console.error("[bultos API] Error en POST crear:", err.message);
        return res.status(500).json({ success: false, error: err.message });
      }
    }

    // B. ESCANEAR / ENTREGAR BULTO
    if (accion === "escanear") {
      const { codigo_bulto, repartidor_id } = req.body;

      if (!codigo_bulto) {
        return res.status(400).json({ success: false, message: "Se requiere 'codigo_bulto'." });
      }

      try {
        // 1. Buscar el bulto actual
        const { data: bulto, error: findErr } = await supabase
          .from("bultos_despacho")
          .select("*")
          .eq("codigo_bulto", codigo_bulto.trim())
          .maybeSingle();

        if (findErr) throw findErr;
        if (!bulto) {
          return res.status(404).json({ success: false, message: `Bulto con código '${codigo_bulto}' no encontrado.` });
        }

        // 2. Si ya está entregado, retornar inmediatamente
        if (bulto.estado === "entregado") {
          return res.status(200).json({
            success: true,
            message: "El bulto ya se encontraba marcado como entregado.",
            bulto,
            pedido_completado: false
          });
        }

        // 3. Marcar el bulto como entregado
        const { data: bultoActualizado, error: updErr } = await supabase
          .from("bultos_despacho")
          .update({
            estado: "entregado",
            entregado_at: new Date().toISOString(),
            repartidor_id: repartidor_id || null
          })
          .eq("id", bulto.id)
          .select()
          .single();

        if (updErr) throw updErr;

        // 4. Verificar si todos los bultos del pedido han sido entregados
        const { data: todosLosBultos, error: listErr } = await supabase
          .from("bultos_despacho")
          .select("estado")
          .eq("pedido_id", bulto.pedido_id);

        if (listErr) throw listErr;

        const todosEntregados = todosLosBultos.every(b => b.estado === "entregado");
        let pedidoCompletado = false;
        let waEnviado = false;

        if (todosEntregados) {
          // 5. Entregar pedido completo
          const { error: updPedErr } = await supabase
            .from("pedidos")
            .update({ estado: "Entregado" })
            .eq("id", bulto.pedido_id);

          if (updPedErr) throw updPedErr;
          pedidoCompletado = true;

          // 6. Obtener datos del cliente para notificar por WhatsApp
          const { data: pedido, error: pedErr } = await supabase
            .from("pedidos")
            .select(`
              id,
              total_pagar,
              clientes (
                nombre_contacto,
                nombre_tienda,
                whatsapp
              )
            `)
            .eq("id", bulto.pedido_id)
            .single();

          if (!pedErr && pedido && pedido.clientes?.whatsapp) {
            const cliente = pedido.clientes;
            const totalFormateado = pedido.total_pagar?.toLocaleString("es-CL") ?? "0";
            const mensajeWA =
              `✅ ¡Listo ${cliente.nombre_contacto}! Tu pedido de *${cliente.nombre_tienda}* ha sido entregado en su totalidad tras escanear todos sus bultos correspondientes.\n\n` +
              `¡Muchas gracias por tu compra! Escríbele a Jaime cuando necesites reponer. 😊`;
            
            waEnviado = await enviarNotificacionWA(cliente.whatsapp, mensajeWA);
          }
        }

        const bultosPendientes = todosLosBultos.filter(b => b.estado !== "entregado").length;

        return res.status(200).json({
          success: true,
          message: "Bulto marcado como entregado.",
          bulto: bultoActualizado,
          pedido_completado: pedidoCompletado,
          bultos_pendientes: bultosPendientes,
          wa_enviado: waEnviado
        });
      } catch (err) {
        console.error("[bultos API] Error en POST escanear:", err.message);
        return res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ success: false, message: `Método ${req.method} no permitido` });
}
