const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

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

      const senderNumber = msg.key.remoteJid; // ej: 56912345678@s.whatsapp.net
      const messageText = msg.message?.conversation || 
                          msg.message?.extendedTextMessage?.text || 
                          '';

      if (!messageText.trim()) continue;

      console.log(`Mensaje recibido de ${senderNumber}: "${messageText}"`);

      // Enviar webhook a n8n (ahora apunta a Next.js)
      try {
        const response = await fetch(N8N_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: senderNumber.split('@')[0],
            jid: senderNumber,
            message: messageText,
            timestamp: msg.messageTimestamp
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
  const { to, text } = req.body;
  
  if (!to || !text) {
    return res.status(400).json({ success: false, message: 'Falta to o text' });
  }

  if (connectionState !== 'connected' || !sock) {
    return res.status(503).json({ success: false, message: 'WhatsApp no está conectado' });
  }

  try {
    const formattedNum = to.includes('@') ? to : `${to.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    const sentMsg = await sock.sendMessage(formattedNum, { text: text });
    res.json({ success: true, message: 'Mensaje enviado', data: sentMsg });
  } catch (err) {
    console.error('Error enviando mensaje:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Iniciar Express
app.listen(PORT, () => {
  console.log(`Servidor Express de pasarela corriendo en el puerto ${PORT}`);
  connectToWhatsApp();
});
