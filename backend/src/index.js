const {  addTextToKB } = require('./kb');
const { searchKB } = require('./rag');
const { generateAIReply } = require('./gemini');

const express = require('express');
const dotenv = require('dotenv');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cors = require('cors');
const multer = require('multer');
const { PDFParse } = require('pdf-parse');

dotenv.config();

// -------------------- Multer setup(pdf upload) --------------------
const upload = multer({
    storage: multer.memoryStorage(), // keep in RAM
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit, tweak if needed
  });

// -------------------- Express setup --------------------

const app = express();

// --- CORS (allow frontend at localhost:3000 and others during dev) ---
const origins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : '*';
app.use(
    cors({
        origin: origins,
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type'],
    })
);
// Preflight for known routes (avoid path-to-regexp wildcard crash)
app.options(['/', '/kb/add-text'], cors({ origin: origins }));

app.use(express.json());

app.get('/', (req, res) => {
    res.send('WhatsApp AI Bot (Gemini) backend is running ✅');
});
// POST /kb/add-text { title, text }
app.post('/kb/add-text', async (req, res) => {
    try {
        const { title, text } = req.body;
        if (!title || !text) {
            return res.status(400).json({ error: 'title and text are required' });
        }

        const addedChunks = await addTextToKB(title, text);

        return res.json({ ok: true, addedChunks });
    } catch (error) {
        console.error('❌ Error in /kb/add-text:', error);
        res.status(500).json({ error: 'Failed to add knowledge base text' });
    }
});

// POST /kb/upload-pdf
// Expects: multipart/form-data with field "file" (PDF) and optional "title"
app.post('/kb/upload-pdf', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ ok: false, error: 'No file uploaded' });
      }
  
      if (req.file.mimetype !== 'application/pdf') {
        return res.status(400).json({ ok: false, error: 'Only PDF files are supported' });
      }
  
      const title =
        (req.body && req.body.title) ||
        req.file.originalname.replace(/\.pdf$/i, '') ||
        'Untitled PDF';
  
      console.log('📄 Received PDF for KB:', {
        filename: req.file.originalname,
        size: req.file.size,
        title,
      });
  
      // Extract text from PDF buffer using PDFParse class
      const parser = new PDFParse({ data: req.file.buffer });
      const pdfData = await parser.getText();
      const text = (pdfData.text || '').trim();
  
      if (!text) {
        return res.status(400).json({ ok: false, error: 'No extractable text in PDF' });
      }
  
      // Reuse helper to chunk + embed + save
      const addedChunks = await addTextToKB(title, text);
  
      return res.json({
        ok: true,
        title,
        addedChunks,
        pages: pdfData.numpages || pdfData.numPages || null,
      });
    } catch (err) {
      console.error('Error in /kb/upload-pdf:', err);
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });  


const PORT = process.env.PORT || 4000;

// -------------------- WhatsApp client setup --------------------

const waClient = new Client({
    authStrategy: new LocalAuth(), // keeps session, so you don't scan every time
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

waClient.on('qr', (qr) => {
    console.log('📲 Scan this QR code with your WhatsApp:');
    qrcode.generate(qr, { small: true });
});

waClient.on('ready', () => {
    console.log('✅ WhatsApp client is ready');
});

waClient.on('authenticated', () => {
    console.log('🔐 WhatsApp authenticated');
});

waClient.on('auth_failure', (msg) => {
    console.error('❌ Auth failure:', msg);
});

waClient.on('disconnected', (reason) => {
    console.log('⚠️ WhatsApp client disconnected:', reason);
});

// -------------------- Message handler (AI replies) --------------------

waClient.on('message', async (msg) => {
    try {
        console.log(`💬 From ${msg.from}: ${msg.body}`);

        const text = msg.body?.trim();
        if (!text) return;

        // Simple health-check command
        if (text.toLowerCase() === 'ping') {
            await msg.reply('pong 🏓 (Gemini AI is online)');
            return;
        }

        // Generate AI reply using Gemini
        const kbMatches = await searchKB(text, 3);
        const aiReply = await generateAIReply({
            userMessage: text,
            kbMatches,
        });
        await msg.reply(aiReply);
    } catch (err) {
        console.error('❌ Error handling message:', err);
        try {
            await msg.reply("Sorry, something went wrong on my side.");
        } catch (_) { }
    }
});

// -------------------- Start everything --------------------

waClient.initialize();

app.listen(PORT, () => {
    console.log(`🚀 Server listening on http://localhost:${PORT}`);
});
