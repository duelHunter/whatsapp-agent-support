const { addTextToKB } = require('./kb');
const { searchKB } = require('./rag');
const { generateAIReply } = require('./ai');
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
const bookService = require('./services/bookService');
const orderService = require('./services/orderService');
const { supabaseAdmin } = require('./auth/supabase');
const { runAgent } = require('./agent');

const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const multer = require('multer');
const { PDFParse } = require('pdf-parse');
const http = require('http');

dotenv.config();

// -------------------- Multer setup(pdf upload) --------------------
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// Media upload: images + documents up to 16 MB
const ALLOWED_MEDIA_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const mediaUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 16 * 1024 * 1024 }, // 16 MB
    fileFilter: (_req, file, cb) => {
        cb(null, ALLOWED_MEDIA_TYPES.has(file.mimetype));
    },
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
        methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
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
    '/api/whatsapp-accounts',
    '/api/bot/status',
    '/api/bot/toggle',
    '/api/messages/send-media',
], cors({ origin: origins }));

app.use(express.json());
 
function getOrgId(req) {
    return req.headers['x-org-id'] || req.body?.org_id || req.query?.org_id || req.headers['x-wa-account-id'];
}

app.get('/', (req, res) => {
    res.send('WhatsApp AI Bot (Gemini) backend is running ✅');
});

// GET /api/bot/status — returns current bot auto-reply state
app.get('/api/bot/status', requireAuth, (req, res) => {
    res.json({ ok: true, botEnabled: waService.botEnabled });
});

// PATCH /api/bot/toggle — admin only: flip the auto-reply flag
app.patch('/api/bot/toggle', requireAuth, requireRole(['admin']), async (req, res) => {
    try {
        const newValue = !waService.botEnabled;
        await waService.setBotEnabled(newValue);
        console.log(`🤖 Bot toggled to: ${newValue ? 'enabled' : 'disabled'}`);
        res.json({ ok: true, botEnabled: newValue });
    } catch (error) {
        console.error('❌ Error toggling bot:', error);
        res.status(500).json({ error: 'Failed to toggle bot' });
    }
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

// POST /api/messages/send-media — send an image or document from the dashboard
app.post('/api/messages/send-media', requireAuth, mediaUpload.single('file'), async (req, res) => {
    try {
        const orgId = getOrgId(req);
        if (!orgId) return res.status(400).json({ ok: false, error: 'Missing organization ID' });

        if (!req.file) return res.status(400).json({ ok: false, error: 'No file uploaded or unsupported type' });

        const { conversationId, caption = '' } = req.body;
        if (!conversationId) return res.status(400).json({ ok: false, error: 'conversationId is required' });

        const dbMessage = await waService.sendManualMediaMessage(
            orgId,
            conversationId,
            req.file.buffer,
            req.file.mimetype,
            req.file.originalname,
            caption
        );

        res.json({ ok: true, message: dbMessage });
    } catch (err) {
        console.error('❌ Error sending media message:', err);
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
        const [
            { count: totalConversations },
            { count: incomingMessages },
            { count: outgoingMessages },
            { count: aiMessages },
            { count: humanMessages },
        ] = await Promise.all([
            supabaseAdmin.from('conversations').select('*', { count: 'exact', head: true }).eq('org_id', orgId),
            supabaseAdmin.from('messages').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('direction', 'inbound'),
            supabaseAdmin.from('messages').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('direction', 'outbound'),
            supabaseAdmin.from('messages').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('direction', 'outbound').eq('ai_used', true),
            supabaseAdmin.from('messages').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('direction', 'outbound').eq('ai_used', false),
        ]);

        const totalMessages = (incomingMessages || 0) + (outgoingMessages || 0);

        return res.json({
            ok: true,
            summary: {
                totalMessages,
                incomingMessages: incomingMessages || 0,
                outgoingMessages: outgoingMessages || 0,
                totalConversations: totalConversations || 0,
                aiMessages: aiMessages || 0,
                humanMessages: humanMessages || 0,
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


// ==================== BOOK MANAGEMENT ROUTES ====================

app.get('/api/books', requireAuth, async (req, res) => {
    try {
        const orgId = req.headers['x-org-id'] || req.body?.orgId;
        const { page, limit, search, category } = req.query;
        const result = await bookService.listBooks(orgId, {
            page: parseInt(page) || 1,
            limit: parseInt(limit) || 20,
            search,
            category,
        });
        res.json({ ok: true, ...result });
    } catch (err) {
        console.error('Error in GET /api/books:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.get('/api/books/categories', requireAuth, async (req, res) => {
    try {
        const orgId = req.headers['x-org-id'] || req.body?.orgId;
        const categories = await bookService.getCategories(orgId);
        res.json({ ok: true, categories });
    } catch (err) {
        console.error('Error in GET /api/books/categories:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.get('/api/books/:id', requireAuth, async (req, res) => {
    try {
        const orgId = req.headers['x-org-id'] || req.body?.orgId;
        const book = await bookService.getBook(orgId, req.params.id);
        res.json({ ok: true, book });
    } catch (err) {
        console.error('Error in GET /api/books/:id:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/api/books', requireAuth, requireRole(['admin']), async (req, res) => {
    try {
        const orgId = req.headers['x-org-id'] || req.body?.orgId;
        const book = await bookService.createBook(orgId, req.body);
        res.json({ ok: true, book });
    } catch (err) {
        console.error('Error in POST /api/books:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.patch('/api/books/:id', requireAuth, requireRole(['admin']), async (req, res) => {
    try {
        const orgId = req.headers['x-org-id'] || req.body?.orgId;
        const book = await bookService.updateBook(orgId, req.params.id, req.body);
        res.json({ ok: true, book });
    } catch (err) {
        console.error('Error in PATCH /api/books/:id:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.delete('/api/books/:id', requireAuth, requireRole(['admin']), async (req, res) => {
    try {
        const orgId = req.headers['x-org-id'] || req.body?.orgId;
        await bookService.deleteBook(orgId, req.params.id);
        res.json({ ok: true });
    } catch (err) {
        console.error('Error in DELETE /api/books/:id:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ==================== ORDER MANAGEMENT ROUTES ====================

app.get('/api/orders', requireAuth, async (req, res) => {
    try {
        const orgId = req.headers['x-org-id'] || req.body?.orgId;
        const { status, page, limit } = req.query;
        const result = await orderService.listOrders(orgId, {
            status,
            page: parseInt(page) || 1,
            limit: parseInt(limit) || 20,
        });
        res.json({ ok: true, ...result });
    } catch (err) {
        console.error('Error in GET /api/orders:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.get('/api/orders/:id', requireAuth, async (req, res) => {
    try {
        const order = await orderService.getOrderById(req.params.id);
        res.json({ ok: true, order });
    } catch (err) {
        console.error('Error in GET /api/orders/:id:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.patch('/api/orders/:id/status', requireAuth, requireRole(['admin']), async (req, res) => {
    try {
        const { status, admin_notes } = req.body;
        await orderService.updateOrderStatus(req.params.id, status, admin_notes);
        res.json({ ok: true });
    } catch (err) {
        console.error('Error in PATCH /api/orders/:id/status:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/api/orders/:id/approve-receipt', requireAuth, requireRole(['admin']), async (req, res) => {
    try {
        await orderService.approveReceipt(req.params.id, req.user?.id);

        // Auto-notify customer via WhatsApp
        try {
            const order = await orderService.getOrderById(req.params.id);
            if (order?.conversation_id) {
                await waService.sendManualMessage(
                    order.org_id,
                    order.conversation_id,
                    `✅ Your payment for order #${order.order_number} has been confirmed! We'll ship your order soon. Thank you for your purchase!`
                );
            }
        } catch (notifyErr) {
            console.error('⚠️ Failed to auto-notify customer:', notifyErr);
        }

        res.json({ ok: true });
    } catch (err) {
        console.error('Error in POST /api/orders/:id/approve-receipt:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/api/orders/:id/reject-receipt', requireAuth, requireRole(['admin']), async (req, res) => {
    try {
        const { notes } = req.body;
        await orderService.rejectReceipt(req.params.id, req.user?.id, notes);

        // Auto-notify customer via WhatsApp
        try {
            const order = await orderService.getOrderById(req.params.id);
            if (order?.conversation_id) {
                await waService.sendManualMessage(
                    order.org_id,
                    order.conversation_id,
                    `We couldn't verify the payment receipt for order #${order.order_number}. Please send a clearer photo of your bank transfer receipt, or contact us for help.`
                );
            }
        } catch (notifyErr) {
            console.error('⚠️ Failed to auto-notify customer:', notifyErr);
        }

        res.json({ ok: true });
    } catch (err) {
        console.error('Error in POST /api/orders/:id/reject-receipt:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.get('/api/orders/:id/receipt', requireAuth, async (req, res) => {
    try {
        const { data: receipt } = await supabaseAdmin
            .from('payment_receipts')
            .select('id, media_type, media_mime_type, media_data, status, created_at, notes')
            .eq('order_id', req.params.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (!receipt) {
            return res.status(404).json({ ok: false, error: 'No receipt found' });
        }

        if (req.query.download === 'true' && receipt.media_data) {
            res.setHeader('Content-Type', receipt.media_mime_type || 'application/octet-stream');
            res.setHeader('Content-Disposition', `inline; filename="receipt.${receipt.media_type === 'image' ? 'jpg' : 'pdf'}"`);
            return res.send(Buffer.from(receipt.media_data));
        }

        const { media_data, ...meta } = receipt;
        meta.has_media = !!media_data;
        res.json({ ok: true, receipt: meta });
    } catch (err) {
        console.error('Error in GET /api/orders/:id/receipt:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ==================== AGENT SETTINGS ROUTE ====================

app.patch('/api/settings/agent', requireAuth, requireRole(['admin']), async (req, res) => {
    try {
        const orgId = req.headers['x-org-id'] || req.body?.orgId;
        const { agent_mode, bank_transfer_details } = req.body;

        const updates = {};
        if (agent_mode) updates.agent_mode = agent_mode;
        if (bank_transfer_details !== undefined) updates.bank_transfer_details = bank_transfer_details;

        const { error } = await supabaseAdmin
            .from('organizations')
            .update(updates)
            .eq('id', orgId);

        if (error) throw error;
        res.json({ ok: true });
    } catch (err) {
        console.error('Error in PATCH /api/settings/agent:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.get('/api/settings/agent', requireAuth, async (req, res) => {
    try {
        const orgId = req.headers['x-org-id'] || req.body?.orgId;
        const { data, error } = await supabaseAdmin
            .from('organizations')
            .select('agent_mode, bank_transfer_details')
            .eq('id', orgId)
            .single();

        if (error) throw error;
        res.json({ ok: true, ...data });
    } catch (err) {
        console.error('Error in GET /api/settings/agent:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ==================== CHAT TESTER ROUTE ====================

app.post('/api/chat-test', requireAuth, async (req, res) => {
    try {
        const orgId = req.headers['x-org-id'] || req.body?.orgId;
        const { message, history } = req.body;

        if (!message) {
            return res.status(400).json({ ok: false, error: 'message is required' });
        }

        const { data: orgConfig } = await supabaseAdmin
            .from('organizations')
            .select('agent_mode')
            .eq('id', orgId)
            .single();

        if (orgConfig?.agent_mode === 'ordering_agent') {
            const result = await runAgent({
                conversationHistory: history || [],
                userMessage: message,
                toolContext: { orgId, contactId: null, conversationId: null },
                returnToolLogs: true,
            });
            return res.json({
                ok: true,
                mode: 'ordering_agent',
                reply: result.reply,
                toolLogs: result.toolLogs,
            });
        }

        // KB-only mode
        const kbMatches = await searchKB(message, { topK: 3, orgId });
        const reply = await generateAIReply({ userMessage: message, kbMatches });
        return res.json({
            ok: true,
            mode: 'kb_only',
            reply,
            kbMatches: kbMatches.map(m => ({
                title: m.title,
                score: m.score,
                text: m.text?.substring(0, 200),
            })),
            toolLogs: [],
        });
    } catch (err) {
        console.error('Error in POST /api/chat-test:', err);
        res.status(500).json({ ok: false, error: err.message });
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
