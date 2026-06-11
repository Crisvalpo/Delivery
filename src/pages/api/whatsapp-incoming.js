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
        // 1. Obtener el prompt de sistema y parámetros dinámicos de Supabase
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

        // 2. Validar si el remitente es un trabajador activo y su rol para habilitar herramientas
        const { data: trabajador } = await supabase
          .from("trabajadores")
          .select("nombre, rol")
          .eq("whatsapp", phoneClean)
          .eq("activo", true)
          .maybeSingle();

        const esAdmin = trabajador && (trabajador.rol === "Administrador" || trabajador.rol === "Vendedor");

        // 3. Declarar herramientas (Function Declarations) de Gemini si es administrador
        const tools = esAdmin ? [
          {
            functionDeclarations: [
              {
                name: "actualizar_precio_producto",
                description: "Actualiza el precio de venta de un producto en el catálogo. Usa esta función cuando el administrador indique que el precio de un producto cambió, varió o debe ser modificado.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    nombre_producto: {
                      type: "STRING",
                      description: "El nombre aproximado o exacto del producto a modificar (ej. 'Malla de Papas 25kg')"
                    },
                    nuevo_precio: {
                      type: "INTEGER",
                      description: "El nuevo precio de venta como número entero en pesos chilenos (sin puntos ni signos, ej. 10000)"
                    }
                  },
                  required: ["nombre_producto", "nuevo_precio"]
                }
              },
              {
                name: "crear_producto",
                description: "Agrega un nuevo producto al catálogo de LukeDelivery. Usa esta función cuando el administrador pida registrar o agregar un nuevo producto indicando sus detalles. El bot puede preguntar por la URL de la imagen del producto, pero si no se provee, no envíes este parámetro.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    nombre: {
                      type: "STRING",
                      description: "Nombre del producto (ej. 'Malla de Papas 25kg')"
                    },
                    formato_venta: {
                      type: "STRING",
                      description: "El formato de venta (ej. 'Saco 25kg', 'Bolsa 1u')"
                    },
                    precio: {
                      type: "INTEGER",
                      description: "El precio de venta al público como entero en pesos (ej. 12000)"
                    },
                    precio_costo: {
                      type: "INTEGER",
                      description: "El precio de costo del mayorista como entero en pesos (ej. 10000)"
                    },
                    categoria_logistica: {
                      type: "STRING",
                      enum: ["Pesado", "Estándar"],
                      description: "La categoría logística. Usa 'Pesado' si pesa más de 5kg o es muy grande/voluminoso, de lo contrario usa 'Estándar'."
                    },
                    url_imagen_retail: {
                      type: "STRING",
                      description: "La URL directa de la imagen del producto (opcional). Solo suministrar si el usuario la provee explícitamente en el mensaje."
                    }
                  },
                  required: ["nombre", "formato_venta", "precio", "precio_costo", "categoria_logistica"]
                }
              },
              {
                name: "cambiar_disponibilidad_producto",
                description: "Habilita o deshabilita la disponibilidad de un producto en el catálogo. Usa esta función cuando el administrador indique deshabilitar, habilitar, agotar, activar o desactivar la venta de un producto.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    nombre_producto: {
                      type: "STRING",
                      description: "El nombre del producto."
                    },
                    disponible: {
                      type: "BOOLEAN",
                      description: "Establece true para marcarlo como disponible/activo para la venta, o false para marcarlo como agotado/deshabilitado/inactivo."
                    }
                  },
                  required: ["nombre_producto", "disponible"]
                }
              },
              {
                name: "eliminar_producto",
                description: "Realiza un borrado lógico (desactivación) de un producto del catálogo. Usa esta función cuando el administrador pida eliminar o borrar un producto del catálogo.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    nombre_producto: {
                      type: "STRING",
                      description: "El nombre del producto a eliminar."
                    }
                  },
                  required: ["nombre_producto"]
                }
              }
            ]
          }
        ] : undefined;

        const parts = [];

        if (audio && audio.data) {
          parts.push({
            inlineData: {
              mimeType: audio.mimeType || "audio/ogg",
              data: audio.data
            }
          });

          parts.push({
            text: `
${promptSistema}

Aquí tienes el catálogo de productos disponibles actualmente en la base de datos:
${catalogoTexto}

Por favor, escucha la nota de voz anterior del usuario y respóndele de forma atenta, amigable y muy concisa siguiendo tus normas y el catálogo.
Respuesta del asistente:`
          });
        } else {
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
          console.log(`[whatsapp-incoming] Llamando a Gemini (${audio ? 'Audio' : 'Texto'}) con modelo: ${modelName}, temp: ${temperature}. Admin: ${esAdmin}`);
          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                contents: [{ parts: parts }],
                tools: tools,
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
          const candidatePart = geminiData.candidates?.[0]?.content?.parts?.[0];

          if (candidatePart?.functionCall) {
            const { name, args } = candidatePart.functionCall;
            let dbResult = "";
            console.log(`[whatsapp-incoming] Interceptada llamada a funcion: ${name} con args:`, args);

            try {
              if (name === "actualizar_precio_producto") {
                const { nombre_producto, nuevo_precio } = args;
                const { error } = await supabase
                  .from("productos")
                  .update({ precio: nuevo_precio })
                  .ilike("nombre", `%${nombre_producto}%`);
                
                dbResult = error 
                  ? `Error al actualizar: ${error.message}` 
                  : `Éxito: El precio del producto que coincide con "${nombre_producto}" ha sido actualizado a $${nuevo_precio.toLocaleString("es-CL")} con éxito.`;
              } 
              else if (name === "crear_producto") {
                const { nombre, formato_venta, precio, precio_costo, categoria_logistica, url_imagen_retail } = args;
                const finalImgUrl = url_imagen_retail && url_imagen_retail.trim()
                  ? url_imagen_retail.trim()
                  : "https://cdn.pesco.cl/wp-content/uploads/2021/03/producto_sin_imagen.png";

                const { error } = await supabase
                  .from("productos")
                  .insert([{
                    nombre,
                    formato_venta,
                    precio,
                    precio_costo,
                    categoria_logistica,
                    url_imagen_retail: finalImgUrl,
                    disponible: true,
                    activo: true
                  }]);

                dbResult = error
                  ? `Error al crear: ${error.message}`
                  : `Éxito: El producto "${nombre}" (${formato_venta}) ha sido agregado al catálogo con un precio de venta de $${precio.toLocaleString("es-CL")} y costo de $${precio_costo.toLocaleString("es-CL")}. ${!url_imagen_retail ? "Se ha asignado una imagen por defecto, recuerda que el usuario puede proporcionar una URL para actualizarla." : ""}`;
              }
              else if (name === "cambiar_disponibilidad_producto") {
                const { nombre_producto, disponible } = args;
                const { error } = await supabase
                  .from("productos")
                  .update({ disponible: disponible })
                  .ilike("nombre", `%${nombre_producto}%`);

                dbResult = error
                  ? `Error al cambiar disponibilidad: ${error.message}`
                  : `Éxito: La disponibilidad del producto que coincide con "${nombre_producto}" ha sido cambiada a ${disponible ? "Disponible" : "Agotado/Deshabilitado"}.`;
              }
              else if (name === "eliminar_producto") {
                const { nombre_producto } = args;
                const { error } = await supabase
                  .from("productos")
                  .update({ activo: false })
                  .ilike("nombre", `%${nombre_producto}%`);

                dbResult = error
                  ? `Error al eliminar: ${error.message}`
                  : `Éxito: El producto que coincide con "${nombre_producto}" ha sido desactivado del catálogo con éxito.`;
              }
            } catch (dbErr) {
              console.error("[whatsapp-incoming] Error en ejecución de DB para functionCall:", dbErr.message);
              dbResult = `Error de base de datos interno: ${dbErr.message}`;
            }

            console.log(`[whatsapp-incoming] Resultado de DB para Gemini: ${dbResult}`);

            // Llamada de seguimiento a Gemini
            try {
              const finalRes = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    contents: [
                      { role: "user", parts: parts },
                      { role: "model", parts: [candidatePart] },
                      { role: "function", parts: [{ functionResponse: { name: name, response: { result: dbResult } } }] }
                    ],
                    tools: tools,
                    generationConfig: {
                      temperature: temperature,
                    }
                  }),
                }
              );

              if (!finalRes.ok) {
                throw new Error(`Second Gemini call failed with status ${finalRes.status}`);
              }

              const finalData = await finalRes.json();
              responseText =
                finalData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
                `Operación realizada en el catálogo. Detalle: ${dbResult}`;
            } catch (finalErr) {
              console.error("[whatsapp-incoming] Error en segunda llamada a Gemini:", finalErr.message);
              responseText = `Operación completada en el catálogo. Detalle: ${dbResult}`;
            }
          } else {
            responseText =
              candidatePart?.text?.trim() ||
              `¡Hola! Si deseas realizar un pedido, responde con la palabra "pedido".`;
          }
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
