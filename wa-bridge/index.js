const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  downloadMediaMessage
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const PORT = process.env.PORT || 3015;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'http://localhost:3010/api/whatsapp-incoming';

let sock = null;
let connectionState = 'disconnected';
let latestQr = null;

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`Usando versión de Baileys: ${version.join('.')}, última: ${isLatest}`);

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' })
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      latestQr = qr;
      console.log('\n--- ESCANEA ESTE CÓDIGO QR PARA CONECTAR WHATSAPP ---');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      connectionState = 'disconnected';
      const shouldReconnect = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
        : true;
      console.log('Conexión cerrada debido a:', lastDisconnect?.error, ', reconectando:', shouldReconnect);
      if (shouldReconnect) {
        connectToWhatsApp();
      }
    } else if (connection === 'open') {
      connectionState = 'connected';
      latestQr = null; // Clear QR code since we are connected
      console.log('¡Conexión establecida con éxito con WhatsApp!');
    } else if (connection === 'connecting') {
      connectionState = 'connecting';
      console.log('Conectando a WhatsApp...');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // Escuchar mensajes entrantes
  sock.ev.on('messages.upsert', async (m) => {
    if (m.type !== 'notify') return;
    for (const msg of m.messages) {
      if (msg.key.fromMe) continue; // Ignorar mensajes enviados por la propia cuenta

      const senderNumber = msg.key.remoteJid; // ej: 56912345678@s.whatsapp.net o LID@lid
      
      // Obtener el número limpio del bot (sin device ID :X ni @domain)
      const getCleanId = (jid) => jid ? jid.split('@')[0].split(':')[0] : null;
      
      const mePhone = sock.user?.id ? getCleanId(sock.user.id) : null;
      const meLid = sock.user?.lid ? getCleanId(sock.user.lid) : null;
      const senderClean = getCleanId(senderNumber);

      // Si es un mensaje de nosotros mismos (sincronizado o chat propio), ignorar
      const isFromMe = (mePhone && senderClean === mePhone) || 
                       (meLid && senderClean === meLid);

      if (isFromMe) {
        console.log(`[wa-bridge] Ignorando mensaje propio de ${senderNumber}`);
        continue;
      }

      const messageText = msg.message?.conversation || 
                          msg.message?.extendedTextMessage?.text || 
                          '';

      const isAudio = !!msg.message?.audioMessage;

      if (!messageText.trim() && !isAudio) continue;

      let audioData = null;
      if (isAudio) {
        console.log(`[wa-bridge] Mensaje de audio recibido de ${senderNumber}. Descargando media...`);
        try {
          const buffer = await downloadMediaMessage(
            msg,
            'buffer',
            {},
            { 
              logger: pino({ level: 'silent' }),
              reuploadRequest: sock.updateMediaMessage
            }
          );
          audioData = {
            data: buffer.toString('base64'),
            mimeType: msg.message.audioMessage.mimetype || 'audio/ogg; codecs=opus'
          };
          console.log(`[wa-bridge] Audio descargado y codificado en Base64 con éxito.`);
        } catch (downloadErr) {
          console.error('[wa-bridge] Error descargando audioMessage:', downloadErr.message);
        }
      } else {
        console.log(`Mensaje recibido de ${senderNumber}: "${messageText}"`);
      }

      if (senderNumber.endsWith('@lid')) {
        console.log(`[wa-bridge] [LID DETECTADO] Estructura completa de mensaje LID:`, JSON.stringify(msg, null, 2));
      }

      // Enviar webhook a n8n (ahora apunta a Next.js)
      try {
        const response = await fetch(N8N_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: senderClean,
            jid: senderNumber,
            message: messageText,
            audio: audioData,
            timestamp: msg.messageTimestamp,
            // Enviamos información adicional por si viene el senderPn
            senderPn: msg.key.senderPn || null
          })
        });
        console.log(`Webhook enviado a n8n, respuesta: ${response.status}`);
      } catch (err) {
        console.error('Error enviando webhook a n8n:', err.message);
      }
    }
  });
}

// --- API Endpoints ---

// Obtener QR
app.get('/qr', (req, res) => {
  res.json({ success: true, qr: latestQr, status: connectionState });
});

// Obtener estado
app.get('/status', (req, res) => {
  res.json({ success: true, status: connectionState });
});

// Enviar mensaje
app.post('/send', async (req, res) => {
  const { to, text, audioBase64 } = req.body;
  
  if (!to) {
    return res.status(400).json({ success: false, message: 'Falta destinatario (to)' });
  }

  if (connectionState !== 'connected' || !sock) {
    return res.status(503).json({ success: false, message: 'WhatsApp no está conectado' });
  }

  try {
    const formattedNum = to.includes('@') ? to : `${to.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    let sentMsg;

    if (audioBase64) {
      // Convertir Base64 proveniente de Gemini a Buffer
      const audioBuffer = Buffer.from(audioBase64, 'base64');
      sentMsg = await sock.sendMessage(formattedNum, {
        audio: audioBuffer,
        mimetype: 'audio/mp4', // Formato compatible AAC/MP4 para notas de voz
        ptt: true // Fuerza el indicador de micrófono azul (nota de voz nativa)
      });
    } else {
      if (!text) {
        return res.status(400).json({ success: false, message: 'Falta texto para enviar' });
      }
      sentMsg = await sock.sendMessage(formattedNum, { text: text });
    }
    
    res.json({ success: true, message: 'Mensaje enviado con éxito', data: sentMsg });
  } catch (err) {
    console.error('Error al enviar en wa-bridge:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Iniciar Express
app.listen(PORT, () => {
  console.log(`Servidor Express de pasarela corriendo en el puerto ${PORT}`);
  connectToWhatsApp();
});
