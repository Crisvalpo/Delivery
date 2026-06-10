export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res
      .status(405)
      .json({ success: false, message: `Método ${req.method} no permitido` });
  }

  const { whatsapp, nombre } = req.body;

  if (!whatsapp) {
    return res
      .status(400)
      .json({ success: false, message: "El número de WhatsApp es requerido." });
  }

  // Formatear el número de WhatsApp para Chile (+569...)
  let cleanNumber = whatsapp.trim().replace(/\s+/g, "").replace(/\+/g, "");
  
  if (cleanNumber.startsWith("09")) {
    cleanNumber = "569" + cleanNumber.substring(2);
  } else if (cleanNumber.startsWith("9") && cleanNumber.length === 9) {
    cleanNumber = "56" + cleanNumber;
  } else if (!cleanNumber.startsWith("56") && cleanNumber.length === 9) {
    cleanNumber = "569" + cleanNumber;
  }

  const nombreFormateado = nombre && nombre.trim() ? nombre.trim() : "amigo/a";

  const messageText = `¡Hola ${nombreFormateado}! Te saluda Cristian de *LukeDelivery B2B* 📦. 

Fue un gusto conversar contigo hoy sobre nuestro modelo de distribución al costo real de distribuidor. 

Te comparto el enlace para que puedas registrar tu negocio y activar tu catálogo de compras de forma totalmente gratuita y segura:

👉 https://delivery.lukeapp.me/registro

Una vez registrado, podrás simular tus pedidos con flete transparente y ver el ahorro real para tu almacén. ¡Cualquier duda, me escribes por aquí!`;

  try {
    const response = await fetch("http://localhost:3015/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: cleanNumber,
        text: messageText,
      }),
    });

    const data = await response.json();

    if (response.ok && data.success) {
      return res.status(200).json({
        success: true,
        message: "Invitación de registro enviada con éxito.",
        data,
      });
    } else {
      console.error("[enviar-invitacion] Error del puente:", data);
      return res.status(response.status || 500).json({
        success: false,
        message: data.message || "El puente de WhatsApp no pudo enviar el mensaje.",
      });
    }
  } catch (err) {
    console.error("[enviar-invitacion] Error conectando al puente:", err.message);
    return res.status(500).json({
      success: false,
      message: "No se pudo conectar con la pasarela de WhatsApp (puerto 3015).",
      error: err.message,
    });
  }
}
