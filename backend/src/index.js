const { loadKB, saveKB, chunkText, cosineSim } = require('./kb');

const express = require('express');
const dotenv = require('dotenv');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

dotenv.config();

async function searchKB(query, topK = 3) {
    const kb = loadKB();
    if (!kb.chunks.length) return [];

    const queryEmbedding = await embedText(query);

    const scored = kb.chunks.map((chunk) => {
        const score = cosineSim(queryEmbedding, chunk.embedding);
        return { ...chunk, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
}

// -------------------- Gemini AI (via REST API) --------------------

async function generateAIReply(userMessage) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('❌ GEMINI_API_KEY is missing in .env');
        return "Server error: Gemini API key is not configured.";
    }

    const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest';

    try {
        // 1️⃣ Get top KB snippets
        const kbMatches = await searchKB(userMessage, 3);

        const kbContextText = kbMatches
            .map(
                (m, i) =>
                    `Snippet ${i + 1} (from "${m.title}", score: ${m.score.toFixed(3)}):\n${m.text}`
            )
            .join('\n\n');

        const systemPrompt =
            "You are a helpful customer support assistant for this business.\n" +
            "Use the provided knowledge base snippets as the main source of truth.\n" +
            "If the answer is not clearly in the snippets, you can answer from general knowledge, " +
            "but try to relate to the business context when possible.\n\n" +
            (kbMatches.length
                ? `Knowledge base snippets:\n${kbContextText}\n\n`
                : "No knowledge base snippets are available for this question.\n\n");

        const url =
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const body = {
            contents: [
                {
                    parts: [
                        { text: systemPrompt },
                        { text: `User question: ${userMessage}` }
                    ]
                }
            ]
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
        console.error('❌ Error calling Gemini with KB:', error);
        return "Sorry, I'm having some technical issues responding right now.";
    }
}

//--------------------Embedding----------------------
async function embedText(text) {
    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_EMBED_MODEL || 'text-embedding-004';

    const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`;

    const body = {
        content: {
            parts: [{ text }]
        }
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
        console.error('❌ Gemini embedding HTTP error:', res.status, errText);
        throw new Error('Embedding request failed');
    }

    const data = await res.json();
    const embedding = data?.embedding?.values;
    if (!embedding) {
        console.error('⚠️ No embedding in response:', JSON.stringify(data, null, 2));
        throw new Error('No embedding returned');
    }
    return embedding; // array of numbers
}


// -------------------- Express setup --------------------

const app = express();
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

        const kb = loadKB();
        const chunks = chunkText(text, 800);
        console.log(`📚 Adding document "${title}" with ${chunks.length} chunks`);

        for (const chunk of chunks) {
            const embedding = await embedText(chunk);
            kb.chunks.push({
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                title,
                text: chunk,
                embedding
            });
        }

        saveKB(kb);

        res.json({
            ok: true,
            addedChunks: chunks.length
        });
    } catch (error) {
        console.error('❌ Error in /kb/add-text:', error);
        res.status(500).json({ error: 'Failed to add knowledge base text' });
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
