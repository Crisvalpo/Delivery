export default async function handler(req, res) {
  let status = "disconnected";
  let qr = null;
  let errorMsg = null;

  try {
    const response = await fetch("http://localhost:3015/qr");
    if (response.ok) {
      const data = await response.json();
      status = data.status || "disconnected";
      qr = data.qr || null;
    } else {
      errorMsg = `El puente de WhatsApp respondió con estado HTTP ${response.status}`;
    }
  } catch (err) {
    console.error("Error al obtener el QR del puente local:", err.message);
    errorMsg = `No se pudo conectar al puente de WhatsApp en el puerto 3015 (¿está corriendo en PM2?).`;
  }

  // Si estamos en un re-direccionamiento manual
  const autoRefreshSeconds = 8;

  res.setHeader("Content-Type", "text/html; charset=utf-8");

  // Si hay un error de conexión con el puente
  if (errorMsg && status === "disconnected") {
    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Puente WhatsApp Desconectado - LukeDelivery</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
          :root {
            --bg: #0f172a;
            --card-bg: rgba(30, 41, 59, 0.75);
            --text: #f8fafc;
            --text-muted: #94a3b8;
            --danger: #ef4444;
            --primary: #6366f1;
          }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Outfit', sans-serif;
            background: radial-gradient(circle at top, #1e1b4b, var(--bg));
            color: var(--text);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }
          .container {
            max-width: 480px;
            width: 100%;
            background: var(--card-bg);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 24px;
            padding: 40px 30px;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
          }
          .status-badge {
            display: inline-flex;
            align-items: center;
            padding: 8px 16px;
            border-radius: 100px;
            font-size: 13px;
            font-weight: 600;
            margin-bottom: 24px;
            text-transform: uppercase;
            background: rgba(239, 68, 68, 0.15);
            color: var(--danger);
            border: 1px solid rgba(239, 68, 68, 0.3);
          }
          h1 { font-size: 24px; font-weight: 700; margin-bottom: 12px; }
          p { color: var(--text-muted); font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
          .error-box {
            background: rgba(239, 68, 68, 0.08);
            border: 1px dashed rgba(239, 68, 68, 0.3);
            border-radius: 16px;
            padding: 16px;
            font-size: 14px;
            color: #fca5a5;
            margin-bottom: 24px;
            text-align: left;
            word-break: break-word;
          }
          .btn {
            background: linear-gradient(135deg, var(--primary), #4f46e5);
            color: white;
            border: none;
            padding: 12px 24px;
            font-size: 14px;
            font-weight: 600;
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.2s ease;
            text-decoration: none;
            display: inline-block;
          }
          .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
          }
        </style>
        <script>
          setTimeout(() => window.location.reload(), 10000);
        </script>
      </head>
      <body>
        <div class="container">
          <div class="status-badge">ERROR DE PUENTE</div>
          <h1>Puente Offline</h1>
          <p>El puente de WhatsApp no está respondiendo en este momento. Puede estar reiniciándose o apagado.</p>
          <div class="error-box">
            <strong>Detalle:</strong> ${errorMsg}
          </div>
          <button onclick="window.location.reload()" class="btn">Reintentar Ahora</button>
          <p style="margin-top: 15px; font-size: 12px; color: var(--text-muted);">
            Esta página se recargará automáticamente cada 10 segundos.
          </p>
        </div>
      </body>
      </html>
    `);
  }

  // Generar HTML principal
  let mainContentHtml = "";

  if (status === "connected") {
    mainContentHtml = `
      <div class="status-badge status-connected">CONECTADO</div>
      <div class="success-icon">🎉</div>
      <h1>¡WhatsApp Vinculado!</h1>
      <p>La pasarela de WhatsApp Web (Baileys) está activa y funcionando correctamente en <strong>luke-delivery</strong>.</p>
      <p style="color: #34d399; font-weight: 600;">Ya puedes recibir y enviar pedidos desde WhatsApp de forma normal.</p>
      <div style="margin-top: 20px;">
        <span style="font-size: 13px; color: var(--text-muted);">Estado del Servicio: <strong>Operacional</strong></span>
      </div>
    `;
  } else if (status === "connecting" && !qr) {
    mainContentHtml = `
      <div class="status-badge status-scanning">CONECTANDO</div>
      <div class="spinner"></div>
      <h1>Conectando...</h1>
      <p>El puente está estableciendo conexión. Si es la primera vez o se perdió la sesión, en unos segundos aparecerá el código QR.</p>
    `;
  } else if (qr) {
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}&margin=10`;
    mainContentHtml = `
      <div class="status-badge status-scanning">ESPERANDO ESCANEO</div>
      <h1>Vincular WhatsApp</h1>
      <p>Escanea este código QR desde WhatsApp en tu celular (Dispositivos vinculados > Vincular un dispositivo).</p>
      
      <div class="qr-wrapper">
        <img src="${qrImageUrl}" alt="Código QR de WhatsApp" class="qr-image" />
      </div>

      <p style="font-size: 13px; color: #fbbf24; font-weight: 600;">
        ⚠️ El código QR expira y cambia periódicamente.
      </p>

      <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 15px;">
        Se actualizará en <span id="timer">${autoRefreshSeconds}</span> segundos...
      </div>
      
      <button onclick="window.location.reload()" class="btn">Recargar QR</button>
    `;
  } else {
    // Desconectado pero sin QR listo
    mainContentHtml = `
      <div class="status-badge status-disconnected">DESCONECTADO</div>
      <div class="spinner"></div>
      <h1>Iniciando puente...</h1>
      <p>Esperando a que Baileys genere un nuevo código QR para vincular. Por favor espera.</p>
    `;
  }

  return res.status(200).send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Vinculación de WhatsApp - LukeDelivery</title>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap" rel="stylesheet">
      <style>
        :root {
          --bg: #0f172a;
          --card-bg: rgba(30, 41, 59, 0.75);
          --text: #f8fafc;
          --text-muted: #94a3b8;
          --primary: #6366f1;
          --success: #10b981;
          --warning: #f59e0b;
          --danger: #ef4444;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Outfit', sans-serif;
          background: radial-gradient(circle at top, #1e1b4b, var(--bg));
          color: var(--text);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          max-width: 450px;
          width: 100%;
          background: var(--card-bg);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 24px;
          padding: 40px 30px;
          text-align: center;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        }
        .logo {
          font-size: 24px;
          font-weight: 700;
          margin-bottom: 20px;
          background: linear-gradient(135deg, #818cf8, #34d399);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        h1 { font-size: 24px; font-weight: 600; margin-bottom: 12px; }
        p { color: var(--text-muted); font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
        .qr-wrapper {
          width: 260px;
          height: 260px;
          margin: 0 auto 24px auto;
          background: white;
          padding: 12px;
          border-radius: 20px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .qr-image { width: 100%; height: 100%; object-fit: contain; }
        .status-badge {
          display: inline-flex;
          align-items: center;
          padding: 8px 16px;
          border-radius: 100px;
          font-size: 12px;
          font-weight: 700;
          margin-bottom: 24px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .status-connected {
          background: rgba(16, 185, 129, 0.15);
          color: var(--success);
          border: 1px solid rgba(16, 185, 129, 0.3);
        }
        .status-disconnected {
          background: rgba(239, 68, 68, 0.15);
          color: var(--danger);
          border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .status-scanning {
          background: rgba(245, 158, 11, 0.15);
          color: var(--warning);
          border: 1px solid rgba(245, 158, 11, 0.3);
          animation: pulse 2s infinite ease-in-out;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        .btn {
          background: linear-gradient(135deg, var(--primary), #4f46e5);
          color: white;
          border: none;
          padding: 12px 24px;
          font-size: 14px;
          font-weight: 600;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          text-decoration: none;
          display: inline-block;
        }
        .btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
        }
        .success-icon { font-size: 60px; margin: 20px 0; }
        .spinner {
          border: 4px solid rgba(255, 255, 255, 0.1);
          width: 50px;
          height: 50px;
          border-radius: 50%;
          border-left-color: var(--primary);
          animation: spin 1s linear infinite;
          margin: 40px auto;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">LukeDelivery B2B</div>
        ${mainContentHtml}
      </div>

      <script>
        // Recarga automática
        const status = "${status}";
        if (status !== "connected") {
          let seconds = ${autoRefreshSeconds};
          const timerEl = document.getElementById("timer");
          if (timerEl) {
            const interval = setInterval(() => {
              seconds--;
              timerEl.textContent = seconds;
              if (seconds <= 0) {
                clearInterval(interval);
                window.location.reload();
              }
            }, 1000);
          } else {
            // Si no hay timer visible (por ejemplo en estado de cargando), recargar en 10s
            setTimeout(() => window.location.reload(), 10000);
          }
        }
      </script>
    </body>
    </html>
  `);
}
