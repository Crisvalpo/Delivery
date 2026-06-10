import { createAdminClient } from "@/lib/supabase/server";

export default async function handler(req, res) {
  try {
    const supabase = createAdminClient();

    // 1. Obtener un cliente de la base de datos para la prueba
    const { cliente_id } = req.query;
    let targetClienteId = cliente_id;

    if (!targetClienteId) {
      const { data: cliente, error: cliErr } = await supabase
        .from("clientes")
        .select("id, nombre_tienda")
        .limit(1)
        .single();

      if (cliErr || !cliente) {
        return res
          .status(404)
          .json({ success: false, message: "No se encontraron clientes en la base de datos para realizar la prueba." });
      }
      targetClienteId = cliente.id;
    }

    // 2. Insertar un token de prueba en sesiones_formulario
    const { data: sesion, error: sesionErr } = await supabase
      .from("sesiones_formulario")
      .insert({
        cliente_id: targetClienteId,
        expira_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 horas de validez
      })
      .select("*")
      .single();

    if (sesionErr || !sesion) {
      console.error("[crear-token-prueba] Error DB:", sesionErr);
      return res
        .status(500)
        .json({ success: false, message: "Error al crear la sesión de prueba en Supabase.", error: sesionErr });
    }

    // 3. Construir el enlace para abrir en el navegador
    const host = req.headers.host || "localhost:3000";
    const protocol = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
    const testUrl = `${protocol}://${host}/pedido?token=${sesion.token}`;

    return res.status(200).json({
      success: true,
      message: "Token de prueba generado correctamente.",
      token: sesion.token,
      cliente_id: targetClienteId,
      expira_at: sesion.expira_at,
      url_pedido_prueba: testUrl,
    });
  } catch (err) {
    console.error("[crear-token-prueba] Error general:", err);
    return res.status(500).json({
      success: false,
      message: "Error interno al generar el token de prueba.",
      error: err.message,
    });
  }
}
