const { addTextToKB } = require('./kb');
const { searchKB } = require('./rag');
const { generateAIReply } = require('./gemini');
const requireAuth = require('./middleware/requireAuth');
const requireRole = require('./middleware/requireRole');
const { initSocket, setWaState, getWaState } = require('./services/socketService');
const waService = require('./services/waService');

const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const multer = require('multer');
const { PDFParse } = require('pdf-parse');
const http = require('http');

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
        allowedHeaders: ['Content-Type', 'Authorization', 'x-wa-account-id'],
    })
);
// Preflight for known routes (avoid path-to-regexp wildcard crash)
app.options(['/', '/kb/add-text', '/kb/upload-pdf', '/api/conversations', '/api/messages'], cors({ origin: origins }));

app.use(express.json());

function getWaAccountId(req) {
    return req.headers['x-wa-account-id'] || req.body?.wa_account_id || req.query?.wa_account_id;
}

app.get('/', (req, res) => {
    res.send('WhatsApp AI Bot (Gemini) backend is running ✅');
});

// GET /api/conversations - Get all conversations for the user's organization
app.get('/api/conversations', requireAuth, async (req, res) => {
    try {
        const waAccountId = getWaAccountId(req);
        if (!waAccountId) {
            return res.status(400).json({ error: 'wa_account_id header or query is required' });
        }

        const { supabaseAdmin } = require('./auth/supabase');
        if (!supabaseAdmin) {
            return res.status(500).json({ error: 'Database not configured' });
        }

        // Get user's organization from memberships
        const { data: memberships, error: membershipError } = await supabaseAdmin
            .from('memberships')
            .select('org_id')
            .eq('user_id', req.auth.user.id)
            .limit(1)
            .maybeSingle();

        if (membershipError || !memberships) {
            return res.status(403).json({ error: 'User is not a member of any organization' });
        }

        const orgId = memberships.org_id;

        // Fetch conversations with contact details
        const { data: conversations, error: convError } = await supabaseAdmin
            .from('conversations')
            .select(`
                id,
                status,
                last_message_at,
                last_message_preview,
                created_at,
                contacts:contact_id (
                    id,
                    wa_number,
                    name
                )
            `)
            .eq('org_id', orgId)
            .eq('wa_account_id', waAccountId)
            .order('last_message_at', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false });

        if (convError) {
            console.error('❌ Error fetching conversations:', convError);
            return res.status(500).json({ error: 'Failed to fetch conversations' });
        }

        return res.json({ ok: true, conversations: conversations || [] });
    } catch (error) {
        console.error('❌ Error in /api/conversations:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/messages/:conversationId - Get messages for a specific conversation
app.get('/api/messages/:conversationId', requireAuth, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const waAccountId = getWaAccountId(req);
        if (!waAccountId) {
            return res.status(400).json({ error: 'wa_account_id header or query is required' });
        }

        const { supabaseAdmin } = require('./auth/supabase');
        if (!supabaseAdmin) {
            return res.status(500).json({ error: 'Database not configured' });
        }

        // Get user's organization from memberships
        const { data: memberships, error: membershipError } = await supabaseAdmin
            .from('memberships')
            .select('org_id')
            .eq('user_id', req.auth.user.id)
            .limit(1)
            .maybeSingle();

        if (membershipError || !memberships) {
            return res.status(403).json({ error: 'User is not a member of any organization' });
        }

        const orgId = memberships.org_id;

        // Verify conversation belongs to user's org and wa_account
        const { data: conversation, error: convCheckError } = await supabaseAdmin
            .from('conversations')
            .select('id, org_id, wa_account_id')
            .eq('id', conversationId)
            .eq('org_id', orgId)
            .eq('wa_account_id', waAccountId)
            .single();

        if (convCheckError || !conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        // Fetch messages
        const { data: messages, error: messagesError } = await supabaseAdmin
            .from('messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true });

        if (messagesError) {
            console.error('❌ Error fetching messages:', messagesError);
            return res.status(500).json({ error: 'Failed to fetch messages' });
        }

        return res.json({ ok: true, messages: messages || [] });
    } catch (error) {
        console.error('❌ Error in /api/messages:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /kb/add-text { title, text }
app.post('/kb/add-text', requireAuth, requireRole(['owner', 'admin']), async (req, res) => {
    try {
        const { title, text } = req.body;
        if (!title || !text) {
            return res.status(400).json({ error: 'title and text are required' });
        }

        const waAccountId = getWaAccountId(req);
        if (!waAccountId) {
            return res.status(400).json({ error: 'wa_account_id header or body is required' });
        }

        const addedChunks = await addTextToKB(title, text, waAccountId);

        return res.json({ ok: true, addedChunks });
    } catch (error) {
        console.error('❌ Error in /kb/add-text:', error);
        res.status(500).json({ error: 'Failed to add knowledge base text' });
    }
});

// POST /kb/upload-pdf
// Expects: multipart/form-data with field "file" (PDF) and optional "title"
app.post('/kb/upload-pdf', requireAuth, requireRole(['owner', 'admin']), upload.single('file'), async (req, res) => {
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

      const waAccountId = getWaAccountId(req);
      if (!waAccountId) {
        return res.status(400).json({ ok: false, error: 'wa_account_id header or body is required' });
      }
  
      console.log('📄 Received PDF for KB:', {
        filename: req.file.originalname,
        size: req.file.size,
        title,
        waAccountId,
      });
  
      // Extract text from PDF buffer using PDFParse class
      const parser = new PDFParse({ data: req.file.buffer });
      const pdfData = await parser.getText();
      const text = (pdfData.text || '').trim();
  
      if (!text) {
        return res.status(400).json({ ok: false, error: 'No extractable text in PDF' });
      }
  
      // Reuse helper to chunk + embed + save
      const addedChunks = await addTextToKB(title, text, waAccountId);
  
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


// HTTP server (needed for socket.io)
const server = http.createServer(app);

// Initialize socket.io (creates Server internally and sets up event handlers)
initSocket(server, process.env.CORS_ORIGIN?.split(",").map(s => s.trim()) || "*");

// -------------------- WhatsApp service setup --------------------

// Initialize WhatsApp service with dependencies
waService.init(setWaState, searchKB, generateAIReply);

// -------------------- Start everything --------------------

// Handle uncaught errors from WhatsApp client (e.g., file lock errors on Windows during logout)
process.on('uncaughtException', (error) => {
    // Catch EBUSY errors for both Cookies and Cookies-journal files (Windows file lock issue)
    if (error.message && 
        error.message.includes('EBUSY') && 
        (error.message.includes('Cookies-journal') || error.message.includes('Cookies') || error.message.includes('.wwebjs_auth'))) {
        console.warn('⚠️ File lock error during logout cleanup (Windows issue) - ignoring:', error.message);
        // This is a known Windows issue where files are locked during cleanup
        // The session will be cleared on next startup, so we can safely ignore this
            return;
        }
    // Re-throw other uncaught exceptions
    throw error;
});

// Initialize WhatsApp client with error handling
(async () => {
    // Load organization and account context from database
    await waService.loadContext();
    
    // Initialize WhatsApp client
    await waService.initialize();
})();

// Use server.listen() instead of app.listen() to ensure socket.io and Express share the same HTTP server
server.listen(PORT, () => {
    console.log(`🚀 Server listening on http://localhost:${PORT}`);
});
