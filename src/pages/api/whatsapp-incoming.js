import { createAdminClient } from "../../lib/supabase/server";

// ============================================================
// MEJORA 5: Cache en memoria del catálogo de productos
// Se invalida cada 5 minutos para reflejar cambios de precios
// ============================================================
let catalogoCache = { text: null, ts: 0 };
const CATALOGO_CACHE_TTL = 5 * 60 * 1000; // 5 minutos

// ============================================================
// COLA DE DEBOUNCE (AGRUPACIÓN EN RÁFAGA DE MENSAJES DE WHATSAPP)
// ============================================================
const ráfagaColas = new Map();
const DEBOUNCE_MS = 2000;


// ============================================================
// MEJORA 4: Genera y guarda un resumen de conversación
// Se llama de forma asíncrona (fire & forget) sin bloquear la respuesta al usuario
// ============================================================
async function generarYGuardarResumen(supabase, phoneClean, historialTextoParaResumen, geminiKey, modelName) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Eres un asistente que resume conversaciones de WhatsApp de ventas mayoristas de forma ultra concisa.\nResume la siguiente conversación en máximo 3 líneas en español, en tercera persona.\nCaptura solo: temas consultados, productos mencionados y decisiones tomadas. No incluyas saludos ni datos personales.\n\nConversación:\n${historialTextoParaResumen}\n\nResumen conciso:`
            }]
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 250 }
        })
      }
    );
    if (!res.ok) return;
    const data = await res.json();
    const resumenTexto = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!resumenTexto) return;
    await supabase.from("mensajes_chat").insert([{
      whatsapp: phoneClean,
      remitente: "resumen",
      contenido: resumenTexto
    }]);
    console.log(`[whatsapp-incoming] ✅ Resumen de conversación generado para ${phoneClean}`);
  } catch (e) {
    console.error("[whatsapp-incoming] Error al generar resumen de conversación:", e.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res
      .status(405)
      .json({ success: false, message: `Método ${req.method} no permitido` });
  }

  // 🔐 Validar secreto del puente Baileys (WA_BRIDGE_SECRET)
  // Si la variable está definida, el header debe coincidir exactamente.
  // Si no está definida (primera configuración), se omite la validación con advertencia.
  const bridgeSecret = process.env.WA_BRIDGE_SECRET;
  if (bridgeSecret && bridgeSecret.trim() !== "") {
    const providedSecret = req.headers["x-wa-bridge-secret"];
    if (providedSecret !== bridgeSecret) {
      console.warn("[whatsapp-incoming] 🚫 Solicitud rechazada: secreto de bridge inválido o ausente.");
      return res.status(401).json({ success: false, message: "No autorizado." });
    }
  } else {
    console.warn("[whatsapp-incoming] ⚠️ WA_BRIDGE_SECRET no configurado. Autenticación del puente desactivada.");
  }

  const { phone, jid, senderPn, image } = req.body;
  let { message, audio } = req.body;


  if (!phone || (!message && !audio && !image)) {
    return res
      .status(400)
      .json({ success: false, message: "Campos 'phone' y alguno de 'message', 'audio' o 'image' son requeridos." });
  }

  console.log(`[whatsapp-incoming] Mensaje de ${phone} (JID: ${jid}, senderPn: ${senderPn}): ${audio ? '[Nota de Voz]' : (image ? '[Foto]' : `"${message}"`)}`);

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
      .select("id, nombre_contacto, nombre_tienda, whatsapp, whatsapp_lid, bot_silenciado_hasta, registro_completo")
      .or(orConditions);

    if (clientError) {
      console.error("[whatsapp-incoming] Error buscando cliente:", clientError.message);
      return res.status(500).json({ success: false, error: clientError.message });
    }

    const cliente = clientes && clientes.length > 0 ? clientes[0] : null;

    // 1.2. Buscar si el remitente es un trabajador activo
    const { data: trabajadores, error: workerError } = await supabase
      .from("trabajadores")
      .select("id, nombre, whatsapp, rol, activo")
      .eq("activo", true)
      .or(`whatsapp.eq.${phoneClean},whatsapp.eq.${phoneWithPlus}`);

    if (workerError) {
      console.error("[whatsapp-incoming] Error buscando trabajador:", workerError.message);
    }

    const trabajador = trabajadores && trabajadores.length > 0 ? trabajadores[0] : null;

    // 1.3. Clasificación de perfiles de usuario
    const esTrabajador = trabajador && trabajador.activo;
    const esClienteRegistrado = cliente && cliente.registro_completo === true;
    const esPreRegistro = cliente && cliente.registro_completo === false;
    const esNoRegistrado = !esTrabajador && !esClienteRegistrado;

    // 1.5. Validar si el número (registrado o no) está silenciado en la tabla whatsapp_bloqueos
    const { data: bloqueo, error: bloqueoErr } = await supabase
      .from("whatsapp_bloqueos")
      .select("silenciado_hasta, motivo")
      .eq("whatsapp", phoneClean)
      .maybeSingle();

    if (!esTrabajador && !bloqueoErr && bloqueo && new Date(bloqueo.silenciado_hasta) > new Date()) {
      console.log(`[whatsapp-incoming] Remitente ${phoneClean} está silenciado en whatsapp_bloqueos hasta ${bloqueo.silenciado_hasta} por: ${bloqueo.motivo}. Ignorando mensaje.`);
      return res.status(200).json({ success: true, message: "Bot silenciado temporalmente por desviación." });
    }

    // 💡 Simular estado de escribiendo/grabando en WhatsApp
    const destJid = jid || `${phoneClean}@s.whatsapp.net`;
    const presenceState = audio ? 'recording' : 'composing';
    const bridgeUrl = process.env.WA_BRIDGE_URL || "http://localhost:3015";
    fetch(`${bridgeUrl}/presence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: destJid, state: presenceState })
    }).catch(err => console.error("[whatsapp-incoming] Error enviando presencia:", err.message));

    // --- LÓGICA DE DEBOUNCE / RÁFAGA ---
    let sesion = ráfagaColas.get(phoneClean);
    const esPrimerMensaje = !sesion;

    if (esPrimerMensaje) {
      let resolveFunction;
      const promise = new Promise((resolve) => {
        resolveFunction = resolve;
      });
      sesion = {
        messages: [],
        audios: [],
        image: null,
        resolve: resolveFunction,
        promise: promise,
        timer: null
      };
      ráfagaColas.set(phoneClean, sesion);
    }

    if (message && message.trim()) {
      sesion.messages.push(message.trim());
    }
    if (audio && audio.data) {
      sesion.audios.push(audio);
    }
    if (image && image.data) {
      sesion.image = image;
    }

    if (sesion.timer) {
      clearTimeout(sesion.timer);
    }

    sesion.timer = setTimeout(() => {
      sesion.resolve();
    }, DEBOUNCE_MS);

    if (!esPrimerMensaje) {
      return res.status(200).json({ success: true, message: "Agrupado en ráfaga de mensajes" });
    }

    // Esperar a que la ráfaga termine
    await sesion.promise;

    // Consolidar variables de la ráfaga
    let tieneAudioRáfaga = false;
    let tieneMensajesTexto = false;
    let imageConsolidada = null;
    const sesionConsolidada = ráfagaColas.get(phoneClean);
    if (sesionConsolidada) {
      message = sesionConsolidada.messages.join("\n");
      audio = sesionConsolidada.audios[0] || null;
      imageConsolidada = sesionConsolidada.image || null;
      tieneAudioRáfaga = sesionConsolidada.audios.length > 0;
      tieneMensajesTexto = sesionConsolidada.messages.length > 0;
      
      console.log(`[whatsapp-incoming] 🚀 Ráfaga consolidada para ${phoneClean}: ${sesionConsolidada.messages.length} textos, ${sesionConsolidada.audios.length} audios, ${sesionConsolidada.image ? '1 imagen' : '0 imágenes'}.`);
      
      // Remover de la cola global asegurando que no borremos una nueva sesión paralela
      const s = ráfagaColas.get(phoneClean);
      if (s && s.promise === sesion.promise) {
        ráfagaColas.delete(phoneClean);
      }
    }

    // MEJORA 1: Registrar mensaje de entrada en el historial
    // Para notas de voz, guardamos placeholder temporal que se actualizará con la transcripción real
    let textoMensaje = audio ? "[Nota de Voz]" : message;
    if (tieneAudioRáfaga && tieneMensajesTexto) {
      textoMensaje = `[Nota de Voz] ${message}`;
    }
    if (imageConsolidada) {
      textoMensaje = `[Foto] ${textoMensaje}`.trim();
    }

    let mensajeChatId = null;
    try {
      const { data: msgInsertado } = await supabase
        .from("mensajes_chat")
        .insert([{
          whatsapp: phoneClean,
          remitente: "usuario",
          contenido: textoMensaje
        }])
        .select("id")
        .single();
      if (msgInsertado) mensajeChatId = msgInsertado.id;
    } catch (histErr) {
      console.error("[whatsapp-incoming] Error guardando mensaje consolidado en historial:", histErr.message);
    }

    // --- BYPASS RÁPIDO PARA SOPORTE HUMANO ---
    const msgLowerSoporte = message ? message.toLowerCase().trim() : "";
    const esSolicitudSoporte =
      msgLowerSoporte.includes("soporte") ||
      msgLowerSoporte.includes("humano") ||
      msgLowerSoporte.includes("atencion humana") ||
      msgLowerSoporte.includes("atención humana") ||
      msgLowerSoporte.includes("hablar con alguien") ||
      msgLowerSoporte.includes("hablar con un humano") ||
      msgLowerSoporte.includes("hablar con una persona") ||
      msgLowerSoporte.includes("asesor") ||
      msgLowerSoporte.includes("ejecutivo") ||
      msgLowerSoporte.includes("ayuda humana");

    if (esSolicitudSoporte) {
      const veinticuatroHorasMas = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      
      // Guardar bloqueo de forma universal en whatsapp_bloqueos
      const { error: errorBloqueo } = await supabase
        .from("whatsapp_bloqueos")
        .upsert({
          whatsapp: phoneClean,
          silenciado_hasta: veinticuatroHorasMas,
          motivo: "Solicitud de soporte humano (Bypass directo)"
        });

      if (cliente) {
        await supabase
          .from("clientes")
          .update({ bot_silenciado_hasta: veinticuatroHorasMas })
          .eq("id", cliente.id);
      }

      let responseText = `Entendido. He pausado mis respuestas automáticas por 24 horas para que un asesor de LukeDelivery revise tu chat y te contacte directamente. ¡Te escribiremos pronto! 📦`;
      if (esTrabajador) {
        responseText = `Entendido, ${trabajador.nombre}. Como eres ${trabajador.rol} del equipo, he pausado las respuestas automáticas para ti por 24 horas. Si necesitas algo urgente, por favor comunícate directamente con la administración.`;
      } else if (esClienteRegistrado) {
        responseText = `Entendido, ${cliente.nombre_contacto}. He pausado mis respuestas automáticas por 24 horas para que un asesor de LukeDelivery revise tu chat y te contacte directamente. ¡Que tengas un buen día! 📦`;
      } else if (esPreRegistro) {
        responseText = `Entendido, ${cliente.nombre_contacto}. Veo que estás en proceso de registro de tu tienda. He pausado mis respuestas automáticas por 24 horas para que un asesor de soporte te guíe directamente a completar tu cuenta.`;
      }

      // Registrar en historial
      try {
        await supabase
          .from("mensajes_chat")
          .insert([{
            whatsapp: phoneClean,
            remitente: "asistente",
            contenido: responseText
          }]);
      } catch (histErr) {
        console.error("[whatsapp-incoming] Error guardando respuesta de soporte en historial:", histErr.message);
      }

      // Enviar respuesta a WhatsApp
      const destinatario = jid || `${phoneClean}@s.whatsapp.net`;
      await fetch(`${bridgeUrl}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: destinatario, text: responseText })
      }).catch(err => console.error("[whatsapp-incoming] Error enviando respuesta de soporte:", err.message));

      return res.status(200).json({ success: true, responseText });
    }


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
    // IMPORTANTE: debe ser compra ACTIVA, no consulta de estado de pedido existente.
    // Palabras como "cuándo llegará mi pedido" NO son intención de compra.
    const msgLower = message ? message.toLowerCase().trim() : "";

    // Palabras que indican que es una CONSULTA de estado (no una compra)
    const esConsultaEstado =
      // Tiempo / cuándo llega
      msgLower.includes("cuando") ||
      msgLower.includes("cuándo") ||
      msgLower.includes("llegará") ||
      msgLower.includes("llegara") ||
      msgLower.includes("llego") ||
      msgLower.includes("llegó") ||
      msgLower.includes("llega") ||
      // Estado del pedido existente
      msgLower.includes("estado") ||
      msgLower.includes("seguimiento") ||
      msgLower.includes("track") ||
      msgLower.includes("mi pedido") ||
      // Tengo / existe (cliente preguntando por su pedido o stock)
      msgLower.includes("tengo") ||
      msgLower.includes("existe") ||
      msgLower.includes("tienen") ||
      msgLower.includes("hay ") ||       // "¿Hay aceite?" — ojo: espacio para evitar "hay que"
      msgLower === "hay" ||
      msgLower.includes("disponible") ||
      msgLower.includes("saldo") ||
      // Ubicación
      msgLower.includes("donde") ||
      msgLower.includes("dónde");

    // Frases de registro o compra ACTIVA (el cliente quiere registrarse o HACER un pedido nuevo)
    const esFraseCompraActiva =
      msgLower === "pedido" ||
      msgLower === "compra" ||
      msgLower === "catalogo" ||
      msgLower === "catálogo" ||
      msgLower === "oferta" ||
      msgLower === "ofertas" ||
      msgLower === "registro" ||
      msgLower === "registrarme" ||
      msgLower === "registrar" ||
      msgLower === "registrarse" ||
      msgLower.includes("hacer pedido") ||
      msgLower.includes("hacer un pedido") ||
      msgLower.includes("quiero pedir") ||
      msgLower.includes("quiero comprar") ||
      msgLower.includes("quiero hacer") ||
      msgLower.includes("hacer compra") ||
      msgLower.includes("necesito pedir") ||
      msgLower.includes("ver catalogo") ||
      msgLower.includes("ver catálogo") ||
      msgLower.includes("ver ofertas") ||
      msgLower.includes("comprar") ||
      msgLower.includes("catálogo") ||
      msgLower.includes("catalogo") ||
      msgLower.includes("oferta") ||
      msgLower.includes("quiero registrar") ||
      msgLower.includes("cómo me registro") ||
      msgLower.includes("como me registro") ||
      msgLower.includes("enlace de registro") ||
      msgLower.includes("link de registro") ||
      msgLower.includes("enlace para registrarme") ||
      msgLower.includes("link para registrarme");

    // Es intención de pedido SOLO si es frase activa, no es consulta de estado, y NO es un trabajador del equipo
    const esIntencionPedido = esFraseCompraActiva && !esConsultaEstado && !esTrabajador;

    let responseText = "";
    let audioBase64ParaEnviar = null;

    if (esIntencionPedido) {
      if (cliente) {
        // Validar si hay una ventana activa antes de generar enlace
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
          console.error("[whatsapp-incoming] Error buscando ventana activa:", ventanaErr.message);
        }

        if (!ventanaActiva) {
          // Buscar próxima ventana activa
          const { data: proximaVentana } = await supabase
            .from("ventanas_pedido")
            .select("*")
            .eq("activa", true)
            .order("fecha_cierre", { ascending: true })
            .limit(1)
            .maybeSingle();

          if (proximaVentana) {
            const fechaApertura = new Date(proximaVentana.fecha_cierre).toLocaleString("es-CL", {
              dateStyle: "short",
              timeStyle: "short"
            });
            responseText = `¡Hola ${cliente.nombre_contacto}! En este momento la toma de pedidos está cerrada 📦 para despachar la ruta actual. La próxima ventana de pedidos se abrirá el ${fechaApertura}. ¡Te esperamos!`;
          } else {
            responseText = `¡Hola ${cliente.nombre_contacto}! En este momento la toma de pedidos está cerrada 📦 para despachar la ruta actual. Te avisaremos por aquí en cuanto habilitemos una nueva ventana de despachos.`;
          }
        } else {
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
            const esPalabraRegistro = 
              msgLower.includes("registr") || 
              msgLower.includes("inscrib") || 
              msgLower.includes("cuenta");
            
            if (esPalabraRegistro) {
              responseText = `¡Hola ${cliente.nombre_contacto}! 👋 Veo que ya estás registrado en LukeDelivery. Para armar tu pedido, abre este enlace seguro (expira en 2 horas):\n\n👉 https://lukeapp.me/pedido?token=${sesion.token}`;
            } else {
              responseText = `¡Hola ${cliente.nombre_contacto}! 👋 Abre este enlace para armar tu pedido de catálogo de ofertas de forma segura. El enlace expira en 2 horas:\n\n👉 https://lukeapp.me/pedido?token=${sesion.token}`;
            }
          }
        }
      } else {
        // Invitación a registro si no existe, pasando el número real y el LID de WhatsApp si está disponible
        let registrationUrl = `https://lukeapp.me/registro?phone=${phoneClean}`;
        if (lidClean) {
          registrationUrl += `&lid=${lidClean}`;
        }
        responseText = `¡Hola! Aún no estás registrado en LukeDelivery 📦. Te invito a registrarte gratis y sin compromiso de compra. Al entrar, podrás ver todo nuestro catálogo de ofertas al costo para mirar tranquilo 👇\n\n👉 ${registrationUrl}`;
      }
    } else {
      // 2. No es intención directa de pedido: Consultamos a Gemini con el catálogo de productos
      // MEJORA 5: Cache en memoria del catálogo (5 minutos) — evita consulta DB en cada mensaje
      let catalogoTexto = "No hay productos disponibles actualmente.";
      const ahoraCatalogo = Date.now();
      if (catalogoCache.text && (ahoraCatalogo - catalogoCache.ts) < CATALOGO_CACHE_TTL) {
        catalogoTexto = catalogoCache.text;
        console.log("[whatsapp-incoming] 📦 Catálogo obtenido desde cache (sin consulta DB).");
      } else {
        const { data: productos, error: prodError } = await supabase
          .from("productos")
          .select("nombre, formato_venta, precio, disponible")
          .eq("disponible", true);
        if (!prodError && productos && productos.length > 0) {
          catalogoTexto = productos
            .map(p => `- ${p.nombre} (${p.formato_venta}): $${p.precio.toLocaleString("es-CL")}`)
            .join("\n");
          catalogoCache = { text: catalogoTexto, ts: ahoraCatalogo };
          console.log(`[whatsapp-incoming] 📦 Catálogo cargado desde DB y guardado en cache (${productos.length} productos).`);
        }
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
6. Todos los precios están expresados en Pesos Chilenos (CLP, $). Bajo ninguna circunstancia uses dólares (USD, $ USD) ni menciones transacciones en dólares. Si hablas de precios o dinero, exprésalo siempre en pesos chilenos y antepón el signo $.
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

        const margenConfig = dbConfigs ? dbConfigs.find(c => c.clave === "margen_ganancia") : null;
        const margenPercent = margenConfig ? margenConfig.valor : "20";

        // Consultar ventana activa de pedidos para inyectar en el prompt
        const nowISO = new Date().toISOString();
        const { data: ventanaActiva } = await supabase
          .from("ventanas_pedido")
          .select("*")
          .eq("activa", true)
          .gt("fecha_cierre", nowISO)
          .order("fecha_cierre", { ascending: true })
          .limit(1)
          .maybeSingle();

        let infoVentanaPrompt = "";
        if (ventanaActiva) {
          const formatFechaEntrega = (fechaStr) => {
            const fecha = new Date(fechaStr);
            const ahora = new Date();
            const fechaClean = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
            const ahoraClean = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
            const diffDays = Math.round((fechaClean - ahoraClean) / (1000 * 60 * 60 * 24));
            const diasSemana = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
            const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
            const diaNombre = diasSemana[fecha.getDay()];
            const diaMes = fecha.getDate();
            const mesNombre = meses[fecha.getMonth()];
            const hora = fecha.getHours();
            const jornada = hora < 13 ? "la mañana" : "la tarde";
            const fechaFormateada = `${diaMes} de ${mesNombre}`;
            if (diffDays === 0) return `hoy ${diaNombre} ${fechaFormateada} durante ${jornada}`;
            if (diffDays === 1) return `mañana ${diaNombre} ${fechaFormateada} durante ${jornada}`;
            return `el ${diaNombre} ${fechaFormateada} durante ${jornada}`;
          };

          infoVentanaPrompt = `
- La toma de pedidos está ABIERTA en la ventana actual: "${ventanaActiva.nombre}".
- Los pedidos de esta ventana se entregarán: ${formatFechaEntrega(ventanaActiva.fecha_entrega)}.
- La hora de cierre para esta ventana de pedidos es: ${new Date(ventanaActiva.fecha_cierre).toLocaleString("es-CL")}.
`;
        } else {
          const { data: proximaVentana } = await supabase
            .from("ventanas_pedido")
            .select("*")
            .eq("activa", true)
            .order("fecha_cierre", { ascending: true })
            .limit(1)
            .maybeSingle();

          if (proximaVentana) {
            const fechaApertura = new Date(proximaVentana.fecha_cierre).toLocaleString("es-CL");
            infoVentanaPrompt = `
- La toma de pedidos está CERRADA actualmente.
- Si el usuario te pide comprar, dile amablemente que estamos cerrados y que la próxima ventana de pedidos abre el: ${fechaApertura}.
`;
          } else {
            infoVentanaPrompt = `
- La toma de pedidos está CERRADA actualmente y no hay ventanas próximas programadas.
- Si el usuario te pide comprar o hacer un pedido, dile amablemente que estamos cerrados por despacho y le avisaremos en cuanto abramos.
`;
          }
        }

        promptSistema += `

Reglas de Negocio Críticas (No negociables):
1. El margen de ganancia actual para calcular los precios de venta a partir del precio de costo es del ${margenPercent}%.
2. Si eres un administrador (esAdmin = true) y pides agregar un producto al catálogo dando únicamente el precio de costo, NO preguntes por el precio de venta. Llama inmediatamente a la función "crear_producto" omitiendo el parámetro "precio" (el sistema calculará automáticamente el precio de venta agregando el ${margenPercent}% de margen).
3. Si el administrador proporciona explícitamente tanto el precio de costo como el precio de venta, llama a "crear_producto" pasando ambos parámetros.
4. Información del estado de Ventanas de Pedidos y despachos:
${infoVentanaPrompt}
`;

        // MEJORA 2: Contexto enriquecido según el perfil del usuario en el prompt de Gemini
        if (esTrabajador) {
          promptSistema += `
          
--- PERFIL DEL REMITENTE ---
El usuario con el que estás interactuando es un TRABAJADOR de LukeDelivery.
- Nombre: ${trabajador.nombre}
- Rol en la empresa: ${trabajador.rol}

Instrucciones para atender a este trabajador:
1. Salúdalo amigablemente por su nombre (${trabajador.nombre}) y haz referencia a su rol de manera cercana.
2. Dado que es parte del equipo, no le des links de compra ni le sugieras registrar su almacén (a menos que él te pida explícitamente el link de registro para un tercero).
3. Responde de manera profesional a sus consultas del catálogo o de inventario.
`;
        } else if (esClienteRegistrado) {
          const { data: pedidosRecientes } = await supabase
            .from("pedidos")
            .select("id, created_at, estado")
            .eq("cliente_id", cliente.id)
            .order("created_at", { ascending: false })
            .limit(5);
          const totalPedidos = pedidosRecientes ? pedidosRecientes.length : 0;
          const ultimoPedido = pedidosRecientes && pedidosRecientes.length > 0
            ? new Date(pedidosRecientes[0].created_at).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" })
            : null;
          promptSistema += `
          
--- PERFIL DEL REMITENTE ---
El usuario con el que estás interactuando es un CLIENTE ALMACENERO REGISTRADO.
- Nombre del Dueño: ${cliente.nombre_contacto}
- Nombre de su Tienda/Negocio: ${cliente.nombre_tienda || "No especificada"}
- Pedidos registrados (últimos 5 consultados): ${totalPedidos}${ultimoPedido ? `\n- Último pedido: ${ultimoPedido}` : ""}

Instrucciones para atender a este cliente:
1. Llámalo por su nombre (${cliente.nombre_contacto}) de forma natural en la conversación.
2. Trátalo como un comerciante aliado. Si quiere comprar o ver ofertas, recuérdale que puede escribir "pedido" en cualquier momento para enviarle su link seguro de compra.
`;
        } else {
          // Es usuario no registrado o en proceso de pre-registro
          let registrationUrl = `https://lukeapp.me/registro?phone=${phoneClean}`;
          if (lidClean) {
            registrationUrl += `&lid=${lidClean}`;
          }

          if (esPreRegistro) {
            promptSistema += `
            
--- PERFIL DEL REMITENTE ---
El usuario es un CLIENTE EN PROCESO DE REGISTRO (Pre-registro temporal creado por ti).
- Nombre del Dueño: ${cliente.nombre_contacto}
- Nombre de la Tienda: ${cliente.nombre_tienda || "No especificada"}

Instrucciones para atender a este cliente:
1. Llámalo por su nombre (${cliente.nombre_contacto}) de forma amigable.
2. Explícale que ya has tomado sus datos principales, pero para poder ver los precios del catálogo y habilitar sus compras es estrictamente necesario que termine de configurar la geolocalización y sector de su negocio accediendo a este link: ${registrationUrl}
3. DEBES incluir este enlace exacto (${registrationUrl}) de forma visible en tu respuesta para que complete su cuenta.
`;
          } else {
            promptSistema += `
            
--- PERFIL DEL REMITENTE ---
El usuario actual NO está registrado en LukeDelivery.

Instrucciones para atender a este usuario:
1. Si te pregunta por productos, precios, ofertas o catálogo en su nota de voz o mensaje, NO le recites la lista de productos ni le des los precios detallados del catálogo. En su lugar, invítalo muy cordialmente a registrarse usando el siguiente enlace de registro: ${registrationUrl}
2. Explícale claramente que:
   - El registro es totalmente gratuito y sin ningún compromiso de compra.
   - Una vez registrado y al acceder a la sección de pedidos, podrá ver todo el catálogo completo de ofertas al costo.
   - El ingreso no implica compra obligatoria, puede mirar y cotizar con total tranquilidad.
3. DEBES incluir este enlace exacto (${registrationUrl}) en tu respuesta de forma visible para que el usuario pueda registrarse. Nunca le digas "te enviaré el enlace", entrégalo en este mismo mensaje.
4. Recuerda que si el usuario te proporciona su Nombre de contacto y Nombre de su Tienda voluntariamente, debes invocar la herramienta "guardar_datos_registro_temporal" para iniciar su pre-registro y hacer su proceso más simple.
`;
          }
        }

        // Subir imagen de trabajador si existe
        let urlImagenPublicaTemp = null;
        if (esTrabajador && imageConsolidada && imageConsolidada.data) {
          try {
            console.log(`[whatsapp-incoming] Decodificando y subiendo imagen de trabajador a Supabase Storage...`);
            const imageBuffer = Buffer.from(imageConsolidada.data, 'base64');
            const fileExt = imageConsolidada.mimeType ? imageConsolidada.mimeType.split('/')[1] : 'jpeg';
            const randomId = Math.random().toString(36).substring(2, 10);
            const fileName = `whatsapp_${Date.now()}_${randomId}.${fileExt}`;
            
            const { error: uploadError } = await supabase
              .storage
              .from('productos')
              .upload(fileName, imageBuffer, {
                contentType: imageConsolidada.mimeType || 'image/jpeg',
                upsert: true
              });
            
            if (uploadError) {
              console.error("[whatsapp-incoming] Error subiendo imagen a storage:", uploadError.message);
            } else {
              const { data: publicUrlData } = supabase
                .storage
                .from('productos')
                .getPublicUrl(fileName);
              
              urlImagenPublicaTemp = publicUrlData?.publicUrl;
              console.log(`[whatsapp-incoming] Imagen subida exitosamente. URL Pública: ${urlImagenPublicaTemp}`);
            }
          } catch (storageErr) {
            console.error("[whatsapp-incoming] Excepción subiendo imagen a storage:", storageErr.message);
          }
        }

        if (urlImagenPublicaTemp) {
          promptSistema += `
          
--- IMAGEN ADJUNTADA ---
El usuario trabajador ha adjuntado una fotografía en este mensaje.
La imagen ha sido subida y está disponible de forma pública en la siguiente URL.
Si vas a llamar a las herramientas 'crear_producto' o 'actualizar_detalles_producto' para crear o modificar un producto relacionado con esta foto, DEBES usar exactamente esta URL para los parámetros 'url_imagen_retail' o 'nueva_url_imagen':
${urlImagenPublicaTemp}
`;
        }

        // MEJORAS 3 y 4: Historial con filtro de 30 días y soporte de resúmenes de conversación
        const treintaDiasAtras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: historialCompleto } = await supabase
          .from("mensajes_chat")
          .select("id, remitente, contenido, created_at")
          .eq("whatsapp", phoneClean)
          .gte("created_at", treintaDiasAtras)
          .order("created_at", { ascending: false })
          .limit(25);

        // Separar resúmenes automáticos del historial normal
        const resumenes = historialCompleto ? historialCompleto.filter(m => m.remitente === "resumen") : [];
        const ultimoResumen = resumenes.length > 0 ? resumenes[0] : null;
        const historialSinResumen = historialCompleto ? historialCompleto.filter(m => m.remitente !== "resumen") : [];

        // Excluir el mensaje actual (idx 0) y tomar los últimos 15 como ventana de contexto
        const historialPrevio = historialSinResumen.slice(1, 16);
        const historialCronologico = [...historialPrevio].reverse();

        // Construir texto de historial; si existe resumen previo, se incluye como contexto anterior
        let historialTexto = "";
        if (ultimoResumen) {
          historialTexto += `[Contexto resumido de conversaciones anteriores]\n${ultimoResumen.contenido}\n\n`;
        }
        historialTexto += historialCronologico.length > 0
          ? historialCronologico.map(m => {
              let roleName = "Usuario";
              if (m.remitente === "asistente") {
                roleName = "Jaime";
              } else if (esTrabajador) {
                roleName = trabajador.rol || "Trabajador";
              } else if (esClienteRegistrado) {
                roleName = "Cliente";
              } else {
                roleName = "Usuario No Registrado";
              }
              return `${roleName}: ${m.contenido}`;
            }).join("\n")
          : "No hay mensajes recientes.";
        if (!historialTexto.trim()) historialTexto = "No hay historial de conversación reciente.";

        // MEJORA 4: Si hay >18 mensajes sin resumen reciente, generar resumen en background (fire & forget)
        const totalMsgSinResumen = historialSinResumen.length;
        const tieneResumenReciente = ultimoResumen &&
          (Date.now() - new Date(ultimoResumen.created_at).getTime()) < 2 * 60 * 60 * 1000;
        if (totalMsgSinResumen > 18 && !tieneResumenReciente) {
          console.log(`[whatsapp-incoming] 📝 Generando resumen de conversación en background para ${phoneClean} (${totalMsgSinResumen} mensajes acumulados).`);
          generarYGuardarResumen(supabase, phoneClean, historialTexto, geminiKey, modelName).catch(() => {});
        }

        // 3. Validar si el remitente es un trabajador activo y su rol para habilitar herramientas
        const esAdmin = esTrabajador && (trabajador.rol === "Administrador" || trabajador.rol === "Vendedor");

        // 4. Declarar herramientas basicas y de administrador
        const basicTools = [
          {
            name: "silenciar_usuario_por_desviacion",
            description: "Silencia o bloquea al usuario actual si sus mensajes o notas de voz se desvían de forma insistente o vulgar del propósito comercial del bot (insultos, bromas, preguntas políticas, chistes, charla casual persistente, etc.).",
            parameters: {
              type: "OBJECT",
              properties: {
                motivo: {
                  type: "STRING",
                  description: "Una breve descripción de por qué se silencia al usuario (ej. 'charla casual persistente', 'lenguaje vulgar')."
                }
              },
              required: ["motivo"]
            }
          },
          {
            name: "solicitar_soporte_humano",
            description: "Pausa las respuestas del bot y solicita la intervención de un asesor u operador humano. Usa esta función cuando el usuario pida hablar con una persona, un agente, ayuda humana o soporte técnico.",
            parameters: {
              type: "OBJECT",
              properties: {}
            }
          },
          {
            name: "guardar_datos_registro_temporal",
            description: "Guarda temporalmente los datos básicos del cliente (nombre del dueño y de la tienda) en la base de datos para iniciar su pre-registro de forma amigable. Llama a esta función cuando un usuario no registrado se presente y dé sus datos, o cuando le preguntes por ellos para iniciar el registro.",
            parameters: {
              type: "OBJECT",
              properties: {
                nombre_contacto: {
                  type: "STRING",
                  description: "El nombre completo o de pila del dueño o contacto del almacén (ej: 'Juan Pérez')"
                },
                nombre_tienda: {
                  type: "STRING",
                  description: "El nombre del negocio o almacén (ej: 'Almacén Don Tito')"
                },
                tipo_negocio: {
                  type: "STRING",
                  enum: ["Almacén", "Minimarket", "Botillería", "Fiambrería"],
                  description: "El tipo de negocio o giro (opcional)."
                }
              },
              required: ["nombre_contacto", "nombre_tienda"]
            }
          },
          {
            name: "consultar_pedidos_cliente",
            description: "Recupera la lista de pedidos activos y recientes realizados por el usuario actual (almacenero) para informarle sobre su estado (Pendiente, Preparando, En Ruta, Entregado, Cancelado), el total a pagar, el flete, y el detalle de los productos. No requiere parámetros.",
            parameters: {
              type: "OBJECT",
              properties: {}
            }
          }
        ];

        const tools = [
          {
            functionDeclarations: [
              ...basicTools,
              ...(esAdmin ? [
                {
                  name: "actualizar_precio_producto",
                  description: "Actualiza el precio de venta y/o el precio de costo de un producto en el catálogo. Usa esta función cuando el administrador indique que el precio (de venta o de costo/mayorista) de un producto cambió, varió o debe ser modificado. Si solo se indica el precio de costo, calcula automáticamente el nuevo precio de venta aplicando el margen configurado.",
                  parameters: {
                    type: "OBJECT",
                    properties: {
                      nombre_producto: {
                        type: "STRING",
                        description: "El nombre aproximado o exacto del producto a modificar (ej. 'Malla de Papas 25kg')"
                      },
                      nuevo_precio: {
                        type: "INTEGER",
                        description: "El nuevo precio de VENTA (al público) como número entero en pesos chilenos (opcional). Si no se especifica pero sí se indica nuevo_precio_costo, se calculará automáticamente."
                      },
                      nuevo_precio_costo: {
                        type: "INTEGER",
                        description: "El nuevo precio de COSTO (mayorista) como número entero en pesos chilenos (opcional). Si se indica este parámetro y no se indica nuevo_precio, el precio de venta se recalcula automáticamente con el margen configurado."
                      }
                    },
                    required: ["nombre_producto"]
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
                        description: "El precio de venta al público como entero en pesos (opcional). Solo suministrar si el usuario lo indica explícitamente en el mensaje. Si no se indica, no lo envíes."
                      },
                      precio_costo: {
                        type: "INTEGER",
                        description: "El precio de costo del mayorista como entero en pesos (ej. 10000)"
                      },
                      categoria_logistica: {
                        type: "STRING",
                        enum: ["Pesado", "Estándar"],
                        description: "La categoría logística. Opcional. Usa 'Pesado' si pesa más de 5kg o es muy grande/voluminoso, de lo contrario no la envíes (el sistema la asumirá como 'Estándar')."
                      },
                      url_imagen_retail: {
                        type: "STRING",
                        description: "La URL directa de la imagen del producto (opcional). Solo suministrar si el usuario la provee explícitamente en el mensaje."
                      }
                    },
                    required: ["nombre", "formato_venta", "precio_costo"]
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
                },
                {
                  name: "actualizar_detalles_producto",
                  description: "Actualiza los detalles de un producto en el catálogo (formato de venta, imagen, categoría logística, etc.). Usa esta función cuando el administrador pida cambiar la cantidad por caja, el formato, la imagen o fotos de un producto.",
                  parameters: {
                    type: "OBJECT",
                    properties: {
                      nombre_producto: {
                        type: "STRING",
                        description: "El nombre aproximado o exacto del producto a modificar (ej. 'Chocman')"
                      },
                      nuevo_nombre: {
                        type: "STRING",
                        description: "El nuevo nombre para el producto (opcional)."
                      },
                      nuevo_formato_venta: {
                        type: "STRING",
                        description: "El nuevo formato de venta o unidades (opcional, ej. 'Caja 32 unidades')"
                      },
                      nueva_url_imagen: {
                        type: "STRING",
                        description: "La nueva URL de la imagen del producto (opcional)."
                      },
                      nueva_categoria_logistica: {
                        type: "STRING",
                        enum: ["Pesado", "Estándar"],
                        description: "La nueva categoría logística (opcional)."
                      }
                    },
                    required: ["nombre_producto"]
                  }
                }
              ] : [])
            ]
          }
        ];

        const parts = [];

        if (imageConsolidada && imageConsolidada.data) {
          parts.push({
            inlineData: {
              mimeType: imageConsolidada.mimeType || "image/jpeg",
              data: imageConsolidada.data
            }
          });
        }

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

Historial de conversación reciente:
${historialTexto}

INSTRUCCIÓN IMPORTANTE PARA ESTA NOTA DE VOZ (MEJORA 1):
Tu respuesta DEBE seguir EXACTAMENTE este formato de dos secciones, sin excepción:
TRANSCRIPCIÓN: [transcribe aquí literalmente lo que dijo el usuario en la nota de voz, sin añadir nada]
RESPUESTA: [escribe aquí tu respuesta al usuario, siguiendo tus normas, el catálogo y el historial. Si el usuario se desvía de forma insistente (tras haberle advertido amablemente) o vulgar del propósito comercial, utiliza la herramienta de silenciado. No silencies ante saludos o cortesías iniciales.]`
          });
        } else {
          parts.push({
            text: `
${promptSistema}

Aquí tienes el catálogo de productos disponibles actualmente en la base de datos:
${catalogoTexto}

Historial de conversación reciente:
${historialTexto}

Mensaje del usuario: "${message}"
Respuesta del asistente (si el usuario se desvía de forma insistente (tras haberle advertido amablemente) o vulgar/ofensiva de las consultas comerciales o de compras de LukeDelivery, debes invocar la herramienta de silenciado. NO uses esta herramienta ante saludos educados, preguntas de cortesía iniciales o consultas legítimas):`
          });
        }

        const generationConfig = {
          temperature: temperature,
        };

        const tieneAudioEntrante = !!(audio && audio.data);
        audioBase64ParaEnviar = null;

        try {
          // --- PASO 1: Llamada de COMPRENSIÓN ---
          // Siempre usamos el modelo de texto para procesar el mensaje (con tools si es admin).
          // Si la entrada es audio, Gemini la transcribe y genera texto de respuesta.
          // Nunca mezclamos 'tools' con generación de audio en la misma llamada.
          console.log(`[whatsapp-incoming] Llamando a Gemini (${tieneAudioEntrante ? 'Audio-entrada' : 'Texto'}) con modelo: ${modelName}, temp: ${temperature}. Admin: ${esAdmin}`);
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
                generationConfig: generationConfig
              }),
            }
          );

          if (!geminiRes.ok) {
            const errBody = await geminiRes.text();
            throw new Error(`Gemini API returned status ${geminiRes.status}: ${errBody.substring(0, 200)}`);
          }

          const geminiData = await geminiRes.json();
          const candidateParts = geminiData.candidates?.[0]?.content?.parts || [];
          const functionCalls = candidateParts.filter(p => p.functionCall);

          if (functionCalls.length > 0) {
            console.log(`[whatsapp-incoming] Se detectaron ${functionCalls.length} llamadas a funciones en paralelo.`);
            const functionResponses = [];
            const dbResultsSummary = [];

            for (const part of functionCalls) {
              const { name, args } = part.functionCall;
              let dbResult = "";
              console.log(`[whatsapp-incoming] Procesando llamada a función: ${name} con args:`, args);

              try {
                if (name === "silenciar_usuario_por_desviacion") {
                  if (esTrabajador) {
                    dbResult = `Error: El remitente es un trabajador activo del equipo de LukeDelivery (${trabajador.nombre}) y los trabajadores NUNCA deben ser silenciados o bloqueados bajo ninguna circunstancia. Explícale amigablemente el desvío comercial si corresponde, pero omite cualquier mensaje de bloqueo y continúa asistiéndolo de manera normal.`;
                  } else {
                    const { motivo } = args;
                    const cincoHorasMas = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();
                    
                    // Guardar bloqueo de forma universal en whatsapp_bloqueos (registrados y no registrados)
                    const { error: errorBloqueo } = await supabase
                      .from("whatsapp_bloqueos")
                      .upsert({
                        whatsapp: phoneClean,
                        silenciado_hasta: cincoHorasMas,
                        motivo: motivo
                      });

                    // Por retrocompatibilidad, si es un cliente registrado, también actualizamos su campo en clientes
                    if (cliente) {
                      await supabase
                        .from("clientes")
                        .update({ bot_silenciado_hasta: cincoHorasMas })
                        .eq("id", cliente.id);
                    }

                    dbResult = errorBloqueo
                      ? `Error al silenciar en bloqueos: ${errorBloqueo.message}`
                      : `Éxito: El usuario ha sido bloqueado en Supabase hasta ${cincoHorasMas} debido a: ${motivo}. Debes avisarle claramente al usuario en tu respuesta que debido a que sus consultas se desvían de las compras, tu sistema se pausará y no podrás responderle en las próximas 5 horas.`;
                  }
                }
                else if (name === "solicitar_soporte_humano") {
                  const veinticuatroHorasMas = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                  
                  // Guardar bloqueo de forma universal en whatsapp_bloqueos
                  const { error: errorBloqueo } = await supabase
                    .from("whatsapp_bloqueos")
                    .upsert({
                      whatsapp: phoneClean,
                      silenciado_hasta: veinticuatroHorasMas,
                      motivo: "Solicitud de soporte humano (vía IA)"
                    });

                  if (cliente) {
                    await supabase
                      .from("clientes")
                      .update({ bot_silenciado_hasta: veinticuatroHorasMas })
                      .eq("id", cliente.id);
                  }

                  dbResult = errorBloqueo
                    ? `Error al pausar el bot: ${errorBloqueo.message}`
                    : `Éxito: El bot ha sido silenciado en Supabase por 24 horas (hasta ${veinticuatroHorasMas}) debido a solicitud de soporte humano. Debes informarle amablemente al usuario que has pausado tus respuestas automáticas y que un asesor de LukeDelivery se contactará con él a la brevedad.`;
                }
                else if (name === "guardar_datos_registro_temporal") {
                  const { nombre_contacto, nombre_tienda, tipo_negocio } = args;
                  
                  let orConditions = `whatsapp.eq.${phoneClean},whatsapp.eq.${phoneWithPlus}`;
                  if (lidClean) orConditions += `,whatsapp_lid.eq.${lidClean}`;
                  
                  const { data: existentes } = await supabase
                    .from("clientes")
                    .select("id, registro_completo")
                    .or(orConditions);
                  
                  const clienteExistente = existentes && existentes.length > 0 ? existentes[0] : null;
                  
                  if (clienteExistente && clienteExistente.registro_completo) {
                    dbResult = `Error: El cliente con este número ya se encuentra completamente registrado en el sistema.`;
                  } else {
                    const finalGiro = tipo_negocio || "Almacén";
                    const dataObj = {
                      nombre_contacto: nombre_contacto.trim(),
                      nombre_tienda: nombre_tienda.trim(),
                      whatsapp: phoneWithPlus,
                      whatsapp_lid: lidClean || null,
                      tipo_negocio: finalGiro,
                      prioridad_territorial: "Media",
                      registro_completo: false,
                      notas_campo: "Pre-registro conversacional mediante Jaime (Bot)"
                    };

                    let error;
                    if (clienteExistente) {
                      const { error: err } = await supabase
                        .from("clientes")
                        .update(dataObj)
                        .eq("id", clienteExistente.id);
                      error = err;
                    } else {
                      const { error: err } = await supabase
                        .from("clientes")
                        .insert([dataObj]);
                      error = err;
                    }

                    const registrationUrl = lidClean 
                      ? `https://lukeapp.me/registro?phone=${phoneClean}&lid=${lidClean}`
                      : `https://lukeapp.me/registro?phone=${phoneClean}`;

                    dbResult = error
                      ? `Error al guardar datos preliminares: ${error.message}`
                      : `Éxito: Los datos de registro temporal fueron guardados en Supabase. Ahora debes invitar muy amablemente a ${nombre_contacto} a abrir el enlace para confirmar su geolocalización y activar su cuenta: ${registrationUrl}`;
                  }
                }
                else if (name === "consultar_pedidos_cliente") {
                  if (!cliente) {
                    dbResult = "Error: El usuario actual no está registrado como cliente en el sistema. Debe registrarse primero.";
                  } else {
                    const { data: pedidos, error: errPedidos } = await supabase
                      .from("pedidos")
                      .select(`
                        id,
                        estado,
                        total_neto,
                        flete,
                        total_pagar,
                        created_at,
                        ventana_id,
                        ventanas_pedido (
                          nombre,
                          fecha_entrega
                        ),
                        items_pedido (
                          cantidad,
                          precio_unitario,
                          estado,
                          productos (
                            nombre,
                            formato_venta
                          )
                        )
                      `)
                      .eq("cliente_id", cliente.id)
                      .order("created_at", { ascending: false })
                      .limit(5);

                    if (errPedidos) {
                      dbResult = `Error consultando pedidos: ${errPedidos.message}`;
                    } else if (!pedidos || pedidos.length === 0) {
                      dbResult = "No tienes ningún pedido registrado actualmente en el sistema.";
                    } else {
                      dbResult = pedidos.map((p, idx) => {
                        const fecha = new Date(p.created_at).toLocaleDateString("es-CL", { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
                        const itemsTexto = p.items_pedido && p.items_pedido.length > 0
                          ? p.items_pedido.map(it => {
                              const prodNombre = it.productos ? it.productos.nombre : "Producto";
                              const prodFormato = it.productos ? it.productos.formato_venta : "";
                              const estadoText = it.estado === 'no_disponible' ? '(Sin stock - NO enviado)' : '';
                              return `- ${it.cantidad}x ${prodNombre} (${prodFormato}) ${estadoText}`;
                            }).join("\n")
                          : "Sin items";
                        
                        let entregaTexto = "No definida";
                        if (p.ventanas_pedido) {
                          const fechaEnt = new Date(p.ventanas_pedido.fecha_entrega);
                          const diasSemana = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
                          const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
                          const diaNombre = diasSemana[fechaEnt.getDay()];
                          const diaMes = fechaEnt.getDate();
                          const mesNombre = meses[fechaEnt.getMonth()];
                          const hora = fechaEnt.getHours();
                          const jornada = hora < 13 ? "la mañana" : "la tarde";
                          entregaTexto = `${diaNombre} ${diaMes} de ${mesNombre} durante ${jornada}`;
                        }

                        return `Pedido #${idx + 1} (ID: ${p.id}):
  - Estado: ${p.estado}
  - Fecha Creación: ${fecha}
  - Fecha Estimada de Entrega: ${entregaTexto}
  - Total Neto: $${p.total_neto.toLocaleString("es-CL")}
  - Flete: $${p.flete.toLocaleString("es-CL")}
  - Total a Pagar: $${p.total_pagar.toLocaleString("es-CL")}
  - Items:
  ${itemsTexto}`;
                      }).join("\n\n");
                    }
                  }
                }
                else if (name === "actualizar_precio_producto") {
                  const { nombre_producto, nuevo_precio, nuevo_precio_costo } = args;

                  if (!nuevo_precio && !nuevo_precio_costo) {
                    dbResult = "Error: Debes indicar al menos el nuevo precio de venta (nuevo_precio) o el nuevo precio de costo (nuevo_precio_costo).";
                  } else {
                    const updates = {};

                    // Si se indica precio de costo, lo guardamos
                    if (nuevo_precio_costo !== undefined && nuevo_precio_costo !== null) {
                      updates.precio_costo = nuevo_precio_costo;
                    }

                    // Si se indica precio de venta explicitamente, usarlo
                    if (nuevo_precio !== undefined && nuevo_precio !== null) {
                      updates.precio = nuevo_precio;
                    } else if (nuevo_precio_costo !== undefined && nuevo_precio_costo !== null) {
                      // Solo se indicó el costo: recalcular precio de venta con margen configurado
                      const margenCfg = dbConfigs ? dbConfigs.find(c => c.clave === "margen_ganancia") : null;
                      const margenPct = margenCfg ? parseFloat(margenCfg.valor) : 20;
                      updates.precio = Math.round(nuevo_precio_costo * (1 + margenPct / 100));
                    }

                    const { error } = await supabase
                      .from("productos")
                      .update(updates)
                      .ilike("nombre", `%${nombre_producto}%`);

                    if (error) {
                      dbResult = `Error al actualizar: ${error.message}`;
                    } else {
                      const partes = [];
                      if (updates.precio_costo !== undefined) partes.push(`precio de costo: $${updates.precio_costo.toLocaleString("es-CL")}`);
                      if (updates.precio !== undefined) partes.push(`precio de venta: $${updates.precio.toLocaleString("es-CL")}`);
                      const autoCalc = (nuevo_precio === undefined || nuevo_precio === null) && (nuevo_precio_costo !== undefined && nuevo_precio_costo !== null)
                        ? " (precio de venta calculado automáticamente con el margen configurado)"
                        : "";
                      dbResult = `Éxito: El producto "${nombre_producto}" fue actualizado. Cambios: ${partes.join(" y ")}${autoCalc}.`;
                    }
                  }
                } 
                else if (name === "crear_producto") {
                  const { nombre, formato_venta, precio, precio_costo, categoria_logistica, url_imagen_retail } = args;
                  
                  let precioVentaFinal = precio;
                  let margenAplicado = null;

                  if (!precioVentaFinal) {
                    const margenConfig = dbConfigs ? dbConfigs.find(c => c.clave === "margen_ganancia") : null;
                    const margenPercent = margenConfig ? parseFloat(margenConfig.valor) : 20; // 20% default
                    margenAplicado = margenPercent;
                    precioVentaFinal = Math.round(precio_costo * (1 + margenPercent / 100));
                  }

                  const finalImgUrl = url_imagen_retail && url_imagen_retail.trim()
                    ? url_imagen_retail.trim()
                    : "https://cdn.pesco.cl/wp-content/uploads/2021/03/producto_sin_imagen.png";

                  const finalLogistica = categoria_logistica || "Estándar";

                  const { error } = await supabase
                    .from("productos")
                    .insert([{
                      nombre,
                      formato_venta,
                      precio: precioVentaFinal,
                      precio_costo,
                      categoria_logistica: finalLogistica,
                      url_imagen_retail: finalImgUrl,
                      disponible: true,
                      activo: true
                    }]);

                  dbResult = error
                    ? `Error al crear: ${error.message}`
                    : `Éxito: El producto "${nombre}" (${formato_venta}) ha sido agregado al catálogo con un precio de costo de $${precio_costo.toLocaleString("es-CL")} y precio de venta de $${precioVentaFinal.toLocaleString("es-CL")}${margenAplicado !== null ? ` (calculado automáticamente agregando un ${margenAplicado}% de margen de ganancia configurado en la app)` : ""}. ${!url_imagen_retail ? "Se ha asignado una imagen por defecto, recuerda que el usuario puede proporcionar una URL para actualizarla." : ""}`;
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
                else if (name === "actualizar_detalles_producto") {
                  const { nombre_producto, nuevo_nombre, nuevo_formato_venta, nueva_url_imagen, nueva_categoria_logistica } = args;
                  
                  const updates = {};
                  if (nuevo_nombre !== undefined) updates.nombre = nuevo_nombre;
                  if (nuevo_formato_venta !== undefined) updates.formato_venta = nuevo_formato_venta;
                  if (nueva_url_imagen !== undefined) updates.url_imagen_retail = nueva_url_imagen;
                  if (nueva_categoria_logistica !== undefined) updates.categoria_logistica = nueva_categoria_logistica;

                  if (Object.keys(updates).length === 0) {
                    dbResult = "Error: No se especificaron campos válidos para actualizar.";
                  } else {
                    const { error } = await supabase
                      .from("productos")
                      .update(updates)
                      .ilike("nombre", `%${nombre_producto}%`);

                    dbResult = error
                      ? `Error al actualizar detalles: ${error.message}`
                      : `Éxito: Los detalles del producto que coincide con "${nombre_producto}" se han actualizado correctamente en Supabase. Campos modificados: ${Object.keys(updates).join(", ")}.`;
                  }
                }
              } catch (dbErr) {
                console.error("[whatsapp-incoming] Error en ejecución de DB para functionCall:", dbErr.message);
                dbResult = `Error de base de datos interno: ${dbErr.message}`;
              }

              console.log(`[whatsapp-incoming] Resultado de DB para Gemini (${name}): ${dbResult}`);
              
              functionResponses.push({
                functionResponse: {
                  name: name,
                  response: { result: dbResult }
                }
              });
              dbResultsSummary.push(`${name}: ${dbResult}`);
            }

            // Llamada de seguimiento a Gemini (solo texto, sin audio) pasando todas las respuestas de función
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
                      { role: "model", parts: candidateParts },
                      { role: "function", parts: functionResponses }
                    ],
                    tools: tools,
                    generationConfig: { temperature: temperature }
                  }),
                }
              );

              if (!finalRes.ok) {
                throw new Error(`Second Gemini call failed with status ${finalRes.status}`);
              }

              const finalData = await finalRes.json();
              const finalParts = finalData.candidates?.[0]?.content?.parts || [];
              let finalResponseText = "";
              for (const part of finalParts) {
                if (part.text) finalResponseText += part.text + " ";
              }
              responseText = finalResponseText.trim() || `Operaciones completadas. Resumen:\n${dbResultsSummary.join("\n")}`;
            } catch (finalErr) {
              console.error("[whatsapp-incoming] Error en segunda llamada a Gemini:", finalErr.message);
              responseText = `Operaciones completadas en el catálogo. Resumen:\n${dbResultsSummary.join("\n")}`;
            }
          } else {
            let extractedText = "";
            for (const part of candidateParts) {
              if (part.text) extractedText += part.text + " ";
            }
            responseText = extractedText.trim() || `¡Hola! Si deseas realizar un pedido, responde con la palabra "pedido".`;
          }

          // MEJORA 1: Extraer transcripción real del audio y actualizar mensajes_chat
          if (tieneAudioEntrante && responseText) {
            const matchTranscripcion = responseText.match(/^TRANSCRIPCI[\u00d3O]N:\s*(.+?)(?:\r?\n|$)/i);
            const matchRespuesta = responseText.match(/RESPUESTA:\s*([\s\S]+)$/i);
            if (matchTranscripcion && matchRespuesta) {
              const transcripcionTexto = matchTranscripcion[1].trim();
              const respuestaLimpia = matchRespuesta[1].trim();
              // Actualizar el placeholder "[Nota de Voz]" con la transcripción real en mensajes_chat
              if (mensajeChatId && transcripcionTexto) {
                try {
                  await supabase
                    .from("mensajes_chat")
                    .update({ contenido: `[Nota de Voz]: ${transcripcionTexto}` })
                    .eq("id", mensajeChatId);
                  console.log(`[whatsapp-incoming] 🎤 Transcripción guardada (ID ${mensajeChatId}): "${transcripcionTexto.substring(0, 80)}"`);
                } catch (trErr) {
                  console.error("[whatsapp-incoming] Error actualizando transcripción en DB:", trErr.message);
                }
              }
              responseText = respuestaLimpia;
            } else {
              console.warn("[whatsapp-incoming] ⚠️ Gemini no siguió el formato TRANSCRIPCIÓN/RESPUESTA. Se usará el texto completo como respuesta.");
            }
          }

          // --- PASO 2: Síntesis de voz (TTS) si la entrada fue audio ---
          // Solo si el usuario envió nota de voz, convertimos la respuesta de texto a audio.
          // Excepción crítica: si la respuesta contiene un enlace (link) como URL de registro o pedido,
          // forzamos el envío de texto para que el usuario pueda hacer clic sobre él.
          const contieneLink = responseText.includes("http://") || responseText.includes("https://") || responseText.includes("lukeapp.me");
          if (tieneAudioEntrante && responseText && contieneLink) {
            console.log("[whatsapp-incoming] 🔗 La respuesta contiene un enlace. Se enviará como texto para permitir hacer clic.");
          }
          if (tieneAudioEntrante && responseText && !contieneLink) {
            try {
              const ttsModelName = "gemini-2.5-flash-preview-tts";
              console.log(`[whatsapp-incoming] Convirtiendo respuesta a audio con modelo TTS: ${ttsModelName}`);
              const ttsRes = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${ttsModelName}:generateContent?key=${geminiKey}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    contents: [{ parts: [{ text: responseText }] }],
                    generationConfig: {
                      responseModalities: ["AUDIO"],
                      speechConfig: {
                        voiceConfig: {
                          prebuiltVoiceConfig: { voiceName: "Charon" }
                        }
                      }
                    }
                  })
                }
              );

              if (!ttsRes.ok) {
                const ttsErrBody = await ttsRes.text();
                console.error(`[whatsapp-incoming] Error en llamada TTS (${ttsRes.status}): ${ttsErrBody.substring(0, 300)}`);
              } else {
                const ttsData = await ttsRes.json();
                const ttsParts = ttsData.candidates?.[0]?.content?.parts || [];
                for (const part of ttsParts) {
                  if (part.inlineData && part.inlineData.mimeType && part.inlineData.mimeType.startsWith('audio/')) {
                    audioBase64ParaEnviar = part.inlineData.data;
                    console.log(`[whatsapp-incoming] Audio TTS generado correctamente (${part.inlineData.mimeType}).`);
                    break;
                  }
                }
                if (!audioBase64ParaEnviar) {
                  console.warn("[whatsapp-incoming] TTS no retornó audio. Enviando respuesta de texto.");
                }
              }
            } catch (ttsErr) {
              console.error("[whatsapp-incoming] Error en síntesis TTS:", ttsErr.message);
              // El fallback es enviar texto, que ya está en responseText
            }
          }

          // Registrar el mensaje de respuesta en el historial de chats
          try {
            await supabase
              .from("mensajes_chat")
              .insert([{
                whatsapp: phoneClean,
                remitente: "asistente",
                contenido: responseText
              }]);
          } catch (histErr) {
            console.error("[whatsapp-incoming] Error guardando respuesta en historial:", histErr.message);
          }
        } catch (geminiErr) {
          console.error("[whatsapp-incoming] Error llamando a Gemini:", geminiErr.message);
          responseText = `¡Hola! Gusto en saludarte. Si quieres realizar un pedido, escribe "pedido" para generar tu enlace seguro.`;
        }
      }
    }

    // 3. Enviar el mensaje de vuelta al cliente usando el JID completo (mismo chat de origen)
    const destinatario = jid || `${phoneClean}@s.whatsapp.net`;
    console.log(`[whatsapp-incoming] Enviando respuesta a ${destinatario} (${audioBase64ParaEnviar ? 'Nota de voz' : 'Texto'})`);

    const sendRes = await fetch("http://localhost:3015/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: destinatario,
        text: audioBase64ParaEnviar ? "" : responseText,
        audioBase64: audioBase64ParaEnviar
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
