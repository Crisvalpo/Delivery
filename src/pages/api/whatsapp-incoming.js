import { createAdminClient } from "../../lib/supabase/server";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res
      .status(405)
      .json({ success: false, message: `Método ${req.method} no permitido` });
  }

  const { phone, jid, message, audio, senderPn } = req.body;

  if (!phone || (!message && !audio)) {
    return res
      .status(400)
      .json({ success: false, message: "Campos 'phone' y alguno de 'message' o 'audio' son requeridos." });
  }

  console.log(`[whatsapp-incoming] Mensaje de ${phone} (JID: ${jid}, senderPn: ${senderPn}): ${audio ? '[Nota de Voz]' : `"${message}"`}`);

  // Preferir senderPn si está disponible, sino usar phone
  let searchPhone = phone;
  if (senderPn && typeof senderPn === 'string') {
    searchPhone = senderPn.split('@')[0].split(':')[0];
  }

  const phoneClean = searchPhone.replace(/\+/g, "").trim();
  const phoneWithPlus = "+" + phoneClean;

  // Si el remitente viene con @lid, guardamos el LID limpio (que es el "phone" original)
  const isLid = jid && jid.endsWith('@lid');
  const lidClean = isLid ? phone.trim() : null;

  try {
    const supabase = createAdminClient();

    // 1. Buscar si el cliente existe (buscando por whatsapp, whatsapp con + o whatsapp_lid si es LID)
    let orConditions = `whatsapp.eq.${phoneClean},whatsapp.eq.${phoneWithPlus}`;
    if (lidClean) {
      orConditions += `,whatsapp_lid.eq.${lidClean}`;
    }

    const { data: clientes, error: clientError } = await supabase
      .from("clientes")
      .select("id, nombre_contacto, nombre_tienda, whatsapp, whatsapp_lid")
      .or(orConditions);

    if (clientError) {
      console.error("[whatsapp-incoming] Error buscando cliente:", clientError.message);
      return res.status(500).json({ success: false, error: clientError.message });
    }

    const cliente = clientes && clientes.length > 0 ? clientes[0] : null;

    // Si encontramos al cliente pero no tenía el LID registrado, lo registramos ahora de forma automática (self-healing)
    if (cliente && lidClean && cliente.whatsapp_lid !== lidClean) {
      console.log(`[whatsapp-incoming] Guardando LID ${lidClean} para cliente registrado ${cliente.nombre_contacto}`);
      const { error: updateLidError } = await supabase
        .from("clientes")
        .update({ whatsapp_lid: lidClean })
        .eq("id", cliente.id);

      if (updateLidError) {
        console.error("[whatsapp-incoming] Error guardando whatsapp_lid:", updateLidError.message);
      } else {
        cliente.whatsapp_lid = lidClean; // actualizar en memoria
      }
    }

    // Normalizar mensaje para detectar intención de compra
    const msgLower = message.toLowerCase().trim();
    const esIntencionPedido = 
      msgLower.includes("pedido") || 
      msgLower.includes("comprar") || 
      msgLower.includes("compra") || 
      msgLower.includes("catalogo") || 
      msgLower.includes("catálogo") || 
      msgLower.includes("oferta");

    let responseText = "";

    if (esIntencionPedido) {
      if (cliente) {
        // Generar sesión de formulario temporal
        const { data: sesion, error: sesionError } = await supabase
          .from("sesiones_formulario")
          .insert({ cliente_id: cliente.id })
          .select("token")
          .single();

        if (sesionError) {
          console.error("[whatsapp-incoming] Error creando sesión:", sesionError.message);
          responseText = `¡Hola ${cliente.nombre_contacto}! Tuvimos un detalle técnico al generar tu enlace de compra. Por favor, intenta de nuevo escribiendo "pedido" en unos momentos.`;
        } else {
          responseText = `¡Hola ${cliente.nombre_contacto}! 👋 Abre este enlace para armar tu pedido de catálogo de ofertas de forma segura. El enlace expira en 2 horas:\n\n👉 https://lukeapp.me/pedido?token=${sesion.token}`;
        }
      } else {
        // Invitación a registro si no existe, usando el identificador original (puede ser LID o número)
        const rawPhoneClean = phone.replace(/\+/g, "").trim();
        responseText = `¡Hola! Aún no estás registrado en LukeDelivery 📦. Para registrarte y ver nuestro catálogo de ofertas al costo, ingresa aquí:\n\n👉 https://lukeapp.me/registro?phone=${rawPhoneClean}`;
      }
    } else {
      // 2. No es intención directa de pedido: Consultamos a Gemini con el catálogo de productos
      const { data: productos, error: prodError } = await supabase
        .from("productos")
        .select("nombre, formato_venta, precio, disponible")
        .eq("disponible", true);

      let catalogoTexto = "No hay productos disponibles actualmente.";
      if (!prodError && productos && productos.length > 0) {
        catalogoTexto = productos
          .map(p => `- ${p.nombre} (${p.formato_venta}): $${p.precio.toLocaleString("es-CL")}`)
          .join("\n");
      }

      const geminiKey = process.env.GEMINI_API_KEY;

      if (!geminiKey) {
        // Fallback si no está configurada la API key
        if (cliente) {
          responseText = `¡Hola ${cliente.nombre_contacto}! Si deseas realizar un pedido, responde con la palabra "pedido" para enviarte tu enlace seguro.`;
        } else {
          responseText = `¡Hola! Bienvenido a LukeDelivery. Si deseas registrarte y ver nuestro catálogo, responde con la palabra "pedido".`;
        }
      } else {
        // Obtener el prompt de sistema y parámetros dinámicos de Supabase, con fallbacks
        let promptSistema = `
Actúas como "Jaime", el asistente virtual amable de LukeDelivery B2B, un sistema de distribución mayorista para almacenes en Placilla y Curauma (Chile).
Tu objetivo es responder de forma muy breve, atenta y concisa a los clientes (dueños de almacén) vía WhatsApp.

Normas de comportamiento:
1. Responde en español de Chile, de forma cercana y amigable (ej: "¡Hola!", "¡Qué tal!").
2. Si te preguntan por precios, stock, formatos o disponibilidad de algún producto, dales la información del catálogo de arriba. Si no está en la lista o te preguntan por algo que no tenemos, diles amablemente que no lo tenemos por ahora.
3. Mantén tus respuestas muy cortas (máximo 2 párrafos cortos, preferiblemente menos) ya que se leerán en una pantalla de WhatsApp.
4. Si el usuario muestra intenciones claras de querer comprar o hacer un pedido, recuérdale que puede escribir "pedido" en cualquier momento para enviarle su enlace de compra seguro.
5. NO inventes productos ni precios que no estén en la lista.
`;
        let modelName = "gemini-2.5-flash";
        let temperature = 0.2;

        const { data: dbConfigs } = await supabase
          .from("configuracion_bot")
          .select("clave, valor");

        if (dbConfigs) {
          const promptConfig = dbConfigs.find(c => c.clave === "prompt_sistema");
          const modelConfig = dbConfigs.find(c => c.clave === "model_name");
          const tempConfig = dbConfigs.find(c => c.clave === "temperature");

          if (promptConfig && promptConfig.valor) promptSistema = promptConfig.valor;
          if (modelConfig && modelConfig.valor) modelName = modelConfig.valor;
          if (tempConfig && tempConfig.valor) {
            const parsedTemp = parseFloat(tempConfig.valor);
            if (!isNaN(parsedTemp)) temperature = parsedTemp;
          }
        }

        const parts = [];

        if (audio && audio.data) {
          // Agregar la parte de audio
          parts.push({
            inlineData: {
              mimeType: audio.mimeType || "audio/ogg",
              data: audio.data
            }
          });

          // Agregar las instrucciones correspondientes
          parts.push({
            text: `
${promptSistema}

Aquí tienes el catálogo de productos disponibles actualmente en la base de datos:
${catalogoTexto}

Por favor, escucha la nota de voz anterior del usuario y respóndele de forma atenta, amigable y muy concisa siguiendo tus normas y el catálogo.
Respuesta del asistente:`
          });
        } else {
          // Si es solo texto
          parts.push({
            text: `
${promptSistema}

Aquí tienes el catálogo de productos disponibles actualmente en la base de datos:
${catalogoTexto}

Mensaje del usuario: "${message}"
Respuesta del asistente:`
          });
        }

        try {
          console.log(`[whatsapp-incoming] Llamando a Gemini (${audio ? 'Audio' : 'Texto'}) con modelo: ${modelName}, temp: ${temperature}`);
          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                contents: [{ parts: parts }],
                generationConfig: {
                  temperature: temperature,
                }
              }),
            }
          );

          if (!geminiRes.ok) {
            throw new Error(`Gemini API returned status ${geminiRes.status}`);
          }

          const geminiData = await geminiRes.json();
          responseText =
            geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
            `¡Hola! Si quieres hacer un pedido, escribe "pedido" y te enviaré el link.`;
        } catch (geminiErr) {
          console.error("[whatsapp-incoming] Error llamando a Gemini:", geminiErr.message);
          responseText = `¡Hola! Gusto en saludarte. Si quieres realizar un pedido, escribe "pedido" para generar tu enlace seguro.`;
        }
      }
    }

    // 3. Enviar el mensaje de vuelta al cliente usando el JID completo (mismo chat de origen)
    const destinatario = jid || `${phoneClean}@s.whatsapp.net`;
    console.log(`[whatsapp-incoming] Enviando respuesta a ${destinatario}`);

    const sendRes = await fetch("http://localhost:3015/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: destinatario,
        text: responseText,
      }),
    });

    if (!sendRes.ok) {
      console.error("[whatsapp-incoming] Error enviando mensaje a través del puente:", sendRes.status);
    }

    return res.status(200).json({ success: true, responseText });
  } catch (error) {
    console.error("[whatsapp-incoming] Error general en el handler:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
