const { addTextToKB } = require('./kb');
const { searchKB } = require('./rag');
const { generateAIReply } = require('./gemini');
const requireAuth = require('./middleware/requireAuth');
const requireRole = require('./middleware/requireRole');
const { initSocket, setWaState, getWaState } = require('./services/socketService');
const waService = require('./services/waService');
const { 
    createWhatsAppAccount, 
    getWhatsAppAccountsByOrg,
    getWhatsAppAccountById,
    getWhatsAppAccountStats,
    disconnectWhatsAppAccount
} = require('./services/whatsappAccountService');

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
        allowedHeaders: ['Content-Type', 'Authorization', 'x-wa-account-id', 'x-org-id'],
    })
);
// Preflight for known routes (avoid path-to-regexp wildcard crash)
app.options([
    '/', 
    '/kb/add-text', 
    '/kb/upload-pdf', 
    '/api/conversations', 
    '/api/messages',
    '/api/whatsapp-accounts'
], cors({ origin: origins }));

app.use(express.json());
 
function getOrgId(req) {
    return req.headers['x-org-id'] || req.body?.org_id || req.query?.org_id || req.headers['x-wa-account-id'];
}

app.get('/', (req, res) => {
    res.send('WhatsApp AI Bot (Gemini) backend is running ✅');
});

// POST /api/messages/send
app.post('/api/messages/send', requireAuth, async (req, res) => {
    try {
        const orgId = getOrgId(req);
        console.log('Received request to send message:', { orgId, body: req.body });
        if (!orgId) return res.status(400).json({ ok: false, error: 'Missing organization ID' });

        const { conversationId, text } = req.body;
        if (!conversationId || !text) {
            return res.status(400).json({ ok: false, error: 'conversationId and text are required' });
        }

        const waService = require('./services/waService');
        const dbMessage = await waService.sendManualMessage(orgId, conversationId, text);

        res.json({ ok: true, message: dbMessage });
    } catch (err) {
        console.error('Error sending message manually:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// GET /api/analytics/summary - Get summary stats for the dashboard
app.get('/api/analytics/summary', requireAuth, async (req, res) => {
    try {
        const orgId = getOrgId(req);
        if (!orgId) {
            return res.status(400).json({ error: 'x-org-id header or query is required' });
        }

        const { supabaseAdmin } = require('./auth/supabase');
        if (!supabaseAdmin) {
            return res.status(500).json({ error: 'Database not configured' });
        }

        // Get user's organization from memberships to verify access
        const { data: memberships, error: membershipError } = await supabaseAdmin
            .from('memberships')
            .select('org_id')
            .eq('user_id', req.auth.user.id)
            .limit(1)
            .maybeSingle();

        if (membershipError || !memberships) {
            return res.status(403).json({ error: 'User is not a member of any organization' });
        }

        if (memberships.org_id !== orgId) {
            return res.status(403).json({ error: 'Access to this organization denied' });
        }

        // Fetch counts using exact counting
        const [{ count: totalConversations }, { count: incomingMessages }, { count: outgoingMessages }] = await Promise.all([
            supabaseAdmin.from('conversations').select('*', { count: 'exact', head: true }).eq('org_id', orgId),
            supabaseAdmin.from('messages').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('direction', 'inbound'),
            supabaseAdmin.from('messages').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('direction', 'outbound' )
        ]);

        const totalMessages = (incomingMessages || 0) + (outgoingMessages || 0);

        return res.json({ 
            ok: true, 
            summary: {
                totalMessages,
                incomingMessages: incomingMessages || 0,
                outgoingMessages: outgoingMessages || 0,
                totalConversations: totalConversations || 0
            }
        });
    } catch (error) {
        console.error('❌ Error in /api/analytics/summary:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/analytics/messages/daily - Get daily message counts for charting
app.get('/api/analytics/messages/daily', requireAuth, async (req, res) => {
    try {
        const orgId = getOrgId(req);
        if (!orgId) {
            return res.status(400).json({ error: 'x-org-id header or query is required' });
        }

        const { supabaseAdmin } = require('./auth/supabase');
        if (!supabaseAdmin) {
            return res.status(500).json({ error: 'Database not configured' });
        }

        const { data: memberships, error: membershipError } = await supabaseAdmin
            .from('memberships')
            .select('org_id')
            .eq('user_id', req.auth.user.id)
            .limit(1)
            .maybeSingle();

        if (membershipError || !memberships) {
            return res.status(403).json({ error: 'User is not a member of any organization' });
        }

        if (memberships.org_id !== orgId) {
            return res.status(403).json({ error: 'Access to this organization denied' });
        }

        const dateRange = req.query.dateRange || '7days';
        const now = new Date();
        let startDate = new Date();
        let days = 7;

        if (dateRange === 'today') {
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            days = 1;
        } else if (dateRange === '30days') {
            startDate = new Date(now);
            startDate.setDate(startDate.getDate() - 29);
            startDate.setHours(0, 0, 0, 0);
            days = 30;
        } else {
            startDate = new Date(now);
            startDate.setDate(startDate.getDate() - 6);
            startDate.setHours(0, 0, 0, 0);
            days = 7;
        }

        const { data: messages, error: msgError } = await supabaseAdmin
            .from('messages')
            .select('direction, created_at')
            .eq('org_id', orgId)
            .gte('created_at', startDate.toISOString())
            .lte('created_at', now.toISOString());

        if (msgError) {
            console.error('❌ Error fetching daily messages:', msgError);
            return res.status(500).json({ error: 'Failed to fetch message data' });
        }

        // Build map covering every day in the range (days with no messages default to 0)
        const dailyMap = {};
        for (let i = 0; i < days; i++) {
            const d = new Date(startDate);
            d.setDate(d.getDate() + i);
            const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            dailyMap[label] = { date: label, incoming: 0, outgoing: 0, total: 0 };
        }

        for (const msg of messages || []) {
            const label = new Date(msg.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            if (dailyMap[label]) {
                if (msg.direction === 'inbound') dailyMap[label].incoming++;
                else dailyMap[label].outgoing++;
                dailyMap[label].total++;
            }
        }

        return res.json({ ok: true, data: Object.values(dailyMap) });
    } catch (error) {
        console.error('❌ Error in /api/analytics/messages/daily:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/conversations - Get all conversations for the user's organization
app.get('/api/conversations', requireAuth, async (req, res) => {
    try {
        const orgId = getOrgId(req);
        if (!orgId) {
            return res.status(400).json({ error: 'x-org-id header or query is required' });
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

        // Verify request orgId matches user's membership orgId
        if (memberships.org_id !== orgId) {
            return res.status(403).json({ error: 'Access to this organization denied' });
        }

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
        const orgId = getOrgId(req);
        if (!orgId) {
            return res.status(400).json({ error: 'x-org-id header or query is required' });
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

        if (memberships.org_id !== orgId) {
             return res.status(403).json({ error: 'Access to this organization denied' });
        }

        // Verify conversation belongs to user's org
        const { data: conversation, error: convCheckError } = await supabaseAdmin
            .from('conversations')
            .select('id, org_id')
            .eq('id', conversationId)
            .eq('org_id', orgId)
            .single();

        if (convCheckError || !conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        // Fetch messages
        const { data: messages, error: messagesError } = await supabaseAdmin
            .from('messages')
            .select(`
                id,
                conversation_id,
                direction,
                sender_type,
                body,
                message_type,
                ai_used,
                created_at
            `)
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

// ==================== WhatsApp Account Management ====================

// GET /api/whatsapp-accounts - Get all WhatsApp accounts for user's organization
app.get('/api/whatsapp-accounts', requireAuth, async (req, res) => {
    try {
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

        // Get WhatsApp accounts for this organization
        const accounts = await getWhatsAppAccountsByOrg(orgId);

        if (accounts === null) {
            return res.status(500).json({ error: 'Failed to fetch WhatsApp accounts' });
        }

        return res.json({ ok: true, accounts });
    } catch (error) {
        console.error('❌ Error in /api/whatsapp-accounts:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/whatsapp-accounts/:accountId - Get specific WhatsApp account details
app.get('/api/whatsapp-accounts/:accountId', requireAuth, async (req, res) => {
    try {
        const { accountId } = req.params;

        const account = await getWhatsAppAccountById(accountId);

        if (!account) {
            return res.status(404).json({ error: 'WhatsApp account not found' });
        }

        // Verify user has access to this account's organization
        const { supabaseAdmin } = require('./auth/supabase');
        const { data: memberships } = await supabaseAdmin
            .from('memberships')
            .select('org_id')
            .eq('user_id', req.auth.user.id)
            .eq('org_id', account.id)
            .maybeSingle();

        if (!memberships) {
            return res.status(403).json({ error: 'Access denied' });
        }

        return res.json({ ok: true, account });
    } catch (error) {
        console.error('❌ Error in /api/whatsapp-accounts/:accountId:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/whatsapp-accounts/:accountId/stats - Get statistics for a WhatsApp account
app.get('/api/whatsapp-accounts/:accountId/stats', requireAuth, requireRole(['admin']), async (req, res) => {
    try {
        const { accountId } = req.params;

        // Get account first to verify access
        const account = await getWhatsAppAccountById(accountId);
        if (!account) {
            return res.status(404).json({ error: 'WhatsApp account not found' });
        }

        // Verify user has access
        const { supabaseAdmin } = require('./auth/supabase');
        const { data: memberships } = await supabaseAdmin
            .from('memberships')
            .select('org_id')
            .eq('user_id', req.auth.user.id)
            .eq('org_id', account.id)
            .maybeSingle();

        if (!memberships) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Get statistics
        const stats = await getWhatsAppAccountStats(accountId);

        if (!stats) {
            return res.status(500).json({ error: 'Failed to fetch statistics' });
        }

        return res.json({ ok: true, stats });
    } catch (error) {
        console.error('❌ Error in /api/whatsapp-accounts/:accountId/stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/whatsapp-accounts - Create a new WhatsApp account
app.post('/api/whatsapp-accounts', requireAuth, requireRole(['admin']), async (req, res) => {
    try {
        const { display_name, notes } = req.body;

        if (!display_name) {
            return res.status(400).json({ error: 'display_name is required' });
        }

        const { supabaseAdmin } = require('./auth/supabase');
        if (!supabaseAdmin) {
            return res.status(500).json({ error: 'Database not configured' });
        }

        // Get user's organization
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

        // Create WhatsApp account
        const account = await createWhatsAppAccount({
            orgId: orgId,
            displayName: display_name,
            notes: notes || null
        });

        if (!account) {
            return res.status(500).json({ error: 'Failed to create WhatsApp account' });
        }

        return res.json({ ok: true, account });
    } catch (error) {
        console.error('❌ Error in POST /api/whatsapp-accounts:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/whatsapp-accounts/:accountId/disconnect - Disconnect a WhatsApp account
app.post('/api/whatsapp-accounts/:accountId/disconnect', requireAuth, requireRole(['admin']), async (req, res) => {
    try {
        const { accountId } = req.params;

        // Verify account exists and user has access
        const account = await getWhatsAppAccountById(accountId);
        if (!account) {
            return res.status(404).json({ error: 'WhatsApp account not found' });
        }

        const { supabaseAdmin } = require('./auth/supabase');
        const { data: memberships } = await supabaseAdmin
            .from('memberships')
            .select('org_id')
            .eq('user_id', req.auth.user.id)
            .eq('org_id', account.id)
            .maybeSingle();

        if (!memberships) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Disconnect account
        const success = await disconnectWhatsAppAccount(accountId);

        if (!success) {
            return res.status(500).json({ error: 'Failed to disconnect account' });
        }

        return res.json({ ok: true, message: 'Account disconnected successfully' });
    } catch (error) {
        console.error('❌ Error in POST /api/whatsapp-accounts/:accountId/disconnect:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /kb/add-text { title, text }
app.post('/kb/add-text', requireAuth, requireRole(['admin']), async (req, res) => {
    try {
        const { title, text } = req.body;
        if (!title || !text) {
            return res.status(400).json({ error: 'title and text are required' });
        }

        const orgId = getOrgId(req);
        if (!orgId) {
            return res.status(400).json({ error: 'x-org-id header or body is required' });
        }

        // Get user's organization from memberships
        const { supabaseAdmin } = require('./auth/supabase');
        if (!supabaseAdmin) {
            return res.status(500).json({ error: 'Database not configured' });
        }

        const { data: memberships, error: membershipError } = await supabaseAdmin
            .from('memberships')
            .select('org_id')
            .eq('user_id', req.auth.user.id)
            .limit(1)
            .maybeSingle();

        if (membershipError || !memberships) {
            return res.status(403).json({ error: 'User is not a member of any organization' });
        }

        if (memberships.org_id !== orgId) {
            return res.status(403).json({ error: 'Access to this organization denied' });
        }
        
        const createdBy = req.auth.user.id;

        //convert text kb to chunks and save to pgvector db
        const addedChunks = await addTextToKB(title, text, orgId, createdBy, 'text');

        return res.json({ ok: true, addedChunks });
    } catch (error) {
        console.error('❌ Error in /kb/add-text:', error);
        res.status(500).json({ error: error.message || 'Failed to add knowledge base text' });
    }
});

// POST /kb/upload-pdf
// Expects: multipart/form-data with field "file" (PDF) and optional "title"
app.post('/kb/upload-pdf', requireAuth, requireRole(['admin']), upload.single('file'), async (req, res) => {
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

      const orgId = getOrgId(req);
      if (!orgId) {
        return res.status(400).json({ ok: false, error: 'x-org-id header or body is required' });
      }

      // Get user's organization from memberships
      const { supabaseAdmin } = require('./auth/supabase');
      if (!supabaseAdmin) {
        return res.status(500).json({ ok: false, error: 'Database not configured' });
      }

      const { data: memberships, error: membershipError } = await supabaseAdmin
          .from('memberships')
          .select('org_id')
          .eq('user_id', req.auth.user.id)
          .limit(1)
          .maybeSingle();

      if (membershipError || !memberships) {
        return res.status(403).json({ ok: false, error: 'User is not a member of any organization' });
      }

      if (memberships.org_id !== orgId) {
        return res.status(403).json({ ok: false, error: 'Access to this organization denied' });
      }

      const createdBy = req.auth.user.id;
  
      console.log('📄 Received PDF for KB:', {
        filename: req.file.originalname,
        size: req.file.size,
        title,
        orgId,
      });
  
      // Extract text from PDF buffer using PDFParse class
      const parser = new PDFParse({ data: req.file.buffer });
      const pdfData = await parser.getText();
      const text = (pdfData.text || '').trim();
  
      if (!text) {
        return res.status(400).json({ ok: false, error: 'No extractable text in PDF' });
      }
  
      // Reuse helper to chunk + embed + save
      const addedChunks = await addTextToKB(title, text, orgId, createdBy, 'pdf', req.file.originalname);
  
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
