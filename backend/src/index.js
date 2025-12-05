const express = require('express');
const dotenv = require('dotenv');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

dotenv.config();

// -------------------- Gemini AI (via REST API) --------------------

async function generateAIReply(userMessage) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('❌ GEMINI_API_KEY is missing in .env');
        return "Server error: Gemini API key is not configured.";
    }

    const model = process.env.GEMINI_MODEL;

    try {
        const url =
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const body = {
            contents: [
                {
                    role: 'user',
                    parts: [
                        {
                            text:
                                "You are a helpful, friendly WhatsApp customer support assistant. " +
                                "Reply clearly and concisely.\n\n" +
                                "User message: " + userMessage
                        }
                    ]
                }
            ]
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error('❌ Gemini HTTP error:', res.status, errText);
            return "Sorry, I'm having trouble talking to the AI service right now.";
        }

        const data = await res.json();

        const text =
            data?.candidates?.[0]?.content?.parts
                ?.map((p) => p.text || '')
                .join(' ')
                .trim() || null;

        if (!text) {
            console.error('⚠️ Gemini response had no text:', JSON.stringify(data, null, 2));
            return "Sorry, I couldn't figure out a good reply.";
        }

        return text;
    } catch (error) {
        console.error('❌ Error calling Gemini:', error);
        return "Sorry, I'm having some technical issues responding right now.";
    }
}

// -------------------- Express setup --------------------

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.send('WhatsApp AI Bot (Gemini) backend is running ✅');
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
        const aiReply = await generateAIReply(text);
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
