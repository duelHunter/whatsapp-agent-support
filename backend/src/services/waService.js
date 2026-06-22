const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const { supabaseAdmin } = require('../auth/supabase');
const { saveIncomingMessage, saveOutgoingMessage } = require('./messageStore');
const {
    updateWhatsAppStatus,
    getFirstWhatsAppAccount
} = require('./whatsappAccountService');
const { runAgent } = require('../agentGemini');
const orderService = require('./orderService');

/**
 * WhatsApp Service
 * Manages WhatsApp client initialization, event handling, and message processing
 */
class WhatsAppService {
    constructor() {
        this.client = null;
        this.setWaState = null;
        this.searchKB = null;
        this.generateAIReply = null;
        // Multi-tenant context
        this.orgId = null;
        this.waAccountId = null;
        // Track recently sent bot messages to avoid duplicate DB entries
        this.recentlySentMsgIds = new Set();
        // Whether the bot should auto-reply (admin-toggleable, persisted in DB)
        this.botEnabled = true;
    }

    /**
     * Initialize the service with dependencies
     * @param {Function} setWaState - Function to update WhatsApp state via socket
     * @param {Function} searchKB - Function to search knowledge base
     * @param {Function} generateAIReply - Function to generate AI replies
     */
    init(setWaState, searchKB, generateAIReply) {
        this.setWaState = setWaState;
        this.searchKB = searchKB;
        this.generateAIReply = generateAIReply;

        // Create WhatsApp client
        this.client = new Client({
            authStrategy: new LocalAuth(), // keeps session, so you don't scan every time
            puppeteer: {
                headless: true, // production should be headless
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process', // May help with stability
                    '--disable-gpu'
                ],
                timeout: 60000, // 60 seconds timeout
            },
            webVersionCache: {
                type: 'remote',
                remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1039651969-alpha.html',
            },
        });

        this.setupEventHandlers();
    }

    /**
     * Set the organization and WhatsApp account context for this client
     * This should be called after authentication or on startup
     * @param {string} orgId - Organization UUID
     * @param {string} waAccountId - WhatsApp account UUID
     */
    setContext(orgId, waAccountId) {
        this.orgId = orgId;
        this.waAccountId = waAccountId;
        console.log(`📋 WhatsApp context set: org=${orgId}, account=${waAccountId}`);
    }

    /**
     * Load WhatsApp account context from database
     * Gets the first available WhatsApp account and sets up context
     * In production, this should be more sophisticated (select by config, etc.)
     */
    async loadContext() {
        try {
            if (!supabaseAdmin) {
                console.warn('⚠️ Cannot load context: Supabase not configured');
                return false;
            }

            // Use whatsappAccountService to get first account
            const account = await getFirstWhatsAppAccount();

            if (account) {
                this.setContext(account.id, account.id);
                // Read persisted bot_enabled (falls back to true if column doesn't exist yet)
                this.botEnabled = account.bot_enabled !== undefined && account.bot_enabled !== null
                    ? account.bot_enabled
                    : true;
                if (this.setWaState) {
                    this.setWaState({ botEnabled: this.botEnabled });
                }
                console.log(`📋 Loaded WhatsApp account: ${account.display_name} (${account.phone_number || 'not connected'}), bot=${this.botEnabled ? 'enabled' : 'disabled'}`);
                return true;
            } else {
                console.warn('⚠️ No organization found in database.');
                return false;
            }
        } catch (error) {
            console.error('❌ Error in loadContext:', error);
            return false;
        }
    }

    /**
     * Update WhatsApp account status in database using whatsappAccountService
     * @param {string} status - Status: 'connected', 'disconnected', 'pending_qr', 'error'
     * @param {string} errorMessage - Optional error message for 'error' status
     */
    async updateAccountStatus(status, errorMessage = null) {
        try {
            if (!this.waAccountId) {
                console.warn('⚠️ Cannot update account status: waAccountId not set');
                return;
            }

            // Use whatsappAccountService to update status
            await updateWhatsAppStatus({
                accountId: this.waAccountId,
                status: status,
                errorMessage: errorMessage
            });

        } catch (error) {
            console.error('❌ Error in updateAccountStatus:', error);
        }
    }

    /**
     * Update WhatsApp account phone number and display name in database
     * Called when client connects and we have phone number info
     */
    async updateAccountPhoneNumber() {
        try {
            if (!this.waAccountId || !this.client) {
                return;
            }

            const info = this.client.info;
            if (!info || !info.wid) {
                console.warn('⚠️ No WhatsApp info available to update phone number');
                return;
            }

            const phoneNumber = info.wid.user; // e.g., "1234567890"
            const displayName = info.pushname || null;

            // Use whatsappAccountService to update phone and name
            await updateWhatsAppStatus({
                accountId: this.waAccountId,
                status: 'connected', // Already connected at this point
                phoneNumber: phoneNumber,
                displayName: displayName
            });
            console.log(`📱 QR Scanned successfully. Connected phone number: ${phoneNumber}`);
            console.log(`✅ Updated account info: ${displayName || 'No name'} (${phoneNumber})`);

        } catch (error) {
            console.error('❌ Error in updateAccountPhoneNumber:', error);
        }
    }

    /**
     * Enable or disable the auto-reply bot.
     * Persists to DB (organizations.bot_enabled) if the column exists.
     * Always updates in-memory state and broadcasts via Socket.IO.
     * @param {boolean} value
     */
    async setBotEnabled(value) {
        this.botEnabled = value;
        console.log(`🤖 Bot auto-reply ${value ? 'enabled' : 'disabled'}`);

        if (this.waAccountId && supabaseAdmin) {
            const { error } = await supabaseAdmin
                .from('organizations')
                .update({ bot_enabled: value })
                .eq('id', this.waAccountId);
            if (error) {
                // Column may not exist yet — warn and continue
                console.warn('⚠️ Could not persist bot_enabled to DB:', error.message);
            }
        }

        if (this.setWaState) {
            this.setWaState({ botEnabled: value });
        }
    }

    /**
     * Setup all WhatsApp client event handlers
     */
    setupEventHandlers() {
        // QR code event
        // Triggered when WhatsApp needs authentication via QR scan
        // This happens on first setup or when session expires
        this.client.on('qr', async (qr) => {
            console.log('📲 Scan this QR code with your WhatsApp:');
            // print the qr code to console
            qrcode.generate(qr, { small: true });

            // convert to image for dashboard (await the Promise)
            const qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, scale: 6 });
            console.log('QR code image URL generated');
            this.setWaState({ connected: false, qrDataUrl, lastError: null });
            
            // Update database: mark account as pending QR scan
            // Updates last_qr_at timestamp so admins know when QR was generated
            await this.updateAccountStatus('pending_qr');
        });

        // Ready event
        // Triggered when WhatsApp is fully authenticated and ready to send/receive messages
        // This is the final "success" state after QR scan or session restore
        this.client.on('ready', async () => {
            console.log('✅ WhatsApp client is ready');
            this.setWaState({ connected: true, qrDataUrl: null, lastError: null });
            
            // Update database: mark account as connected
            // Updates last_connected_at timestamp for monitoring
            await this.updateAccountStatus('connected');
            
            // Get and update phone number + display name from WhatsApp
            // This populates the whatsapp_accounts.phone_number field
            await this.updateAccountPhoneNumber();
        });

        // Authenticated event
        // Triggered when authentication succeeds (before 'ready')
        this.client.on('authenticated', async (session) => {
            console.log('🔐 WhatsApp authenticated. Stopping QR generation.');
            
            // Immediately clear QR code to stop frontend from showing it while waiting for 'ready'
            this.setWaState({ connected: false, qrDataUrl: null, lastError: null });
            
            // Update database: mark account as 'connected' immediately upon scanning
            await this.updateAccountStatus('connected');

            // WORKAROUND: If 'ready' event doesn't fire due to WhatsApp updates, 
            // poll for client.info
            let pollCount = 0;
            const infoInterval = setInterval(async () => {
                pollCount++;
                if (this.client && this.client.info && this.client.info.wid) {
                    console.log('✅ Client info found via polling workaround.');
                    clearInterval(infoInterval);
                    this.setWaState({ connected: true, qrDataUrl: null, lastError: null });
                    await this.updateAccountPhoneNumber();
                } else if (pollCount > 30) {
                    // Stop after 60 seconds
                    clearInterval(infoInterval);
                }
            }, 2000);
        });

        // Auth failure event
        // Triggered when QR scan fails or authentication is rejected
        this.client.on('auth_failure', async (msg) => {
            console.error('❌ Auth failure:', msg);
            this.setWaState({ connected: false, lastError: msg });
            
            // Update database: mark account as having an error
            // This helps admins know there's an authentication problem
            await this.updateAccountStatus('error', String(msg));
        });

        // Disconnected event
        // Triggered when WhatsApp connection is lost (network, logout, etc.)
        this.client.on('disconnected', async (reason) => {
            console.log('⚠️ WhatsApp client disconnected:', reason);
            this.setWaState({ connected: false, lastError: reason, qrDataUrl: null });
            
            // Update database: mark account as disconnected
            // This lets the admin dashboard show real-time connection status
            await this.updateAccountStatus('disconnected');
            
            // Handle LOGOUT - properly destroy client and delete session files
            if (reason === 'LOGOUT') {
                await this.handleLogout();
            }
        });

        // Error event
        // Triggered on general client errors (not auth-specific)
        this.client.on('error', async (error) => {
            console.error('❌ WhatsApp client error:', error);
            this.setWaState({ connected: false, lastError: error.message || String(error), qrDataUrl: null });
            
            // Update database: mark account as having an error
            // Non-blocking: error recording shouldn't crash the client
            await this.updateAccountStatus('error', error.message || String(error)).catch(err => {
                console.warn('⚠️ Could not update error status in database:', err.message);
            });
        });

        // Message event
        // Using 'message_create' instead of just 'message' because 'message' 
        // doesn't fire when you send a message to yourself (testing) or from linked devices.
        this.client.on('message_create', async (msg) => {
            console.log('📩 New message detected:', msg.body);
            console.log("msg.from", msg.from);
            
            // Ignore status updates and group chats
            const isStatus = msg.from === 'status@broadcast';
            const isPrivateChat = msg.from.endsWith('@c.us');
        
            // if (!isPrivateChat || isStatus) return;
            
            if (msg.fromMe || isStatus) return; 

            await this.handleMessage(msg);
        });
    }

    /**
     * Handle logout: destroy client, clean up session files, and reinitialize
     */
    async handleLogout() {
        console.log('📤 Logout detected - destroying client and cleaning up session files...');
        
        try {
            // Properly destroy the client to release all resources and file handles
            await this.client.destroy();
            console.log('✅ Client destroyed - resources released');
        } catch (destroyError) {
            console.warn('⚠️ Error destroying client (may already be destroyed):', destroyError.message);
        }
        
        // Wait longer for all processes and file handles to be fully released (Windows needs more time)
        setTimeout(async () => {
            try {
                const authDir = path.join(process.cwd(), '.wwebjs_auth');
                const cacheDir = path.join(process.cwd(), '.wwebjs_cache');
                
                // Delete session directories with retry logic
                await this.deleteDirSafely(authDir);
                await this.deleteDirSafely(cacheDir);
                
                console.log('✅ Session cleanup completed - reinitializing...');
                
                // Wait a bit more before reinitializing to ensure files are released
                setTimeout(async () => {
                    try {
                        console.log('🔄 Reinitializing WhatsApp client after logout...');
                        await this.client.initialize();
                    } catch (error) {
                        console.error('❌ Failed to reinitialize after logout:', error);
                        this.setWaState({ 
                            connected: false, 
                            lastError: `Reinitialization failed: ${error.message || String(error)}`, 
                            qrDataUrl: null 
                        });
                    }
                }, 2000); // 2 second delay before reinitializing
                
            } catch (error) {
                console.error('❌ Error during logout cleanup:', error);
                // Still try to reinitialize even if cleanup had errors
                setTimeout(async () => {
                    try {
                        console.log('🔄 Reinitializing WhatsApp client (cleanup had errors)...');
                        await this.client.initialize();
                    } catch (initError) {
                        console.error('❌ Failed to reinitialize after logout:', initError);
                        this.setWaState({ 
                            connected: false, 
                            lastError: `Reinitialization failed: ${initError.message || String(initError)}`, 
                            qrDataUrl: null 
                        });
                    }
                }, 2000);
            }
        }, 5000); // Increased to 5 seconds to allow browser process to fully close and release file handles
    }

    /**
     * Delete a file with retries (for locked files on Windows)
     */
    async deleteFileWithRetry(filePath, maxRetries = 5, delay = 1000) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    return true;
                }
                return true; // File doesn't exist
            } catch (err) {
                if (i < maxRetries - 1) {
                    // Wait before retrying
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    // Final attempt failed - file is likely locked
                    console.warn(`⚠️ Could not delete ${filePath} after ${maxRetries} attempts: ${err.message}`);
                    return false;
                }
            }
        }
        return false;
    }

    /**
     * Safely delete a directory with retries
     */
    async deleteDirSafely(dirPath) {
        if (!fs.existsSync(dirPath)) {
            return;
        }
        
        try {
            // Recursively delete files and subdirectories with retries
            const deleteRecursive = async (dir) => {
                if (!fs.existsSync(dir)) return;
                
                const files = fs.readdirSync(dir);
                for (const file of files) {
                    const filePath = path.join(dir, file);
                    try {
                        const stat = fs.statSync(filePath);
                        if (stat.isDirectory()) {
                            await deleteRecursive(filePath);
                            // Try to remove empty directory with retries
                            for (let i = 0; i < 3; i++) {
                                try {
                                    fs.rmdirSync(filePath);
                                    break;
                                } catch (e) {
                                    if (i < 2) {
                                        await new Promise(resolve => setTimeout(resolve, 500));
                                    }
                                }
                            }
                        } else {
                            // Try to delete file with retries
                            await this.deleteFileWithRetry(filePath, 3, 500);
                        }
                    } catch (err) {
                        // File may be locked - log but continue
                        console.warn(`⚠️ Could not delete ${filePath}: ${err.message}`);
                    }
                }
                
                // Try to remove the directory itself with retries
                for (let i = 0; i < 3; i++) {
                    try {
                        fs.rmdirSync(dir);
                        break;
                    } catch (e) {
                        if (i < 2) {
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }
                    }
                }
            };
            
            await deleteRecursive(dirPath);
            console.log(`✅ Cleaned up ${dirPath} (some locked files may remain)`);
        } catch (err) {
            console.warn(`⚠️ Error cleaning up ${dirPath}: ${err.message}`);
        }
    }

    /**
     * Handle incoming WhatsApp messages
     */
    async handleMessage(msg) {
        console.log('🔍 lalala:', msg);
        console.log(`handleMessage function is called 💬 From ${msg.from}: ${msg.body}`);
        const aiStartTime = Date.now();
        let savedIncoming = null;

        try {
            console.log(`💬 From ${msg.from}: ${msg.body}`);
            console.log("msg is", msg);

            const text = msg.body?.trim();
            if (!text) return;

            // IF THIS MESSAGE WAS SENT BY US (fromMe = true)
            if (msg.fromMe) {
                // If we recently sent it via AI/Bot, we already saved it using saveOutgoingMessage
                if (this.recentlySentMsgIds && this.recentlySentMsgIds.has(msg.id._serialized)) {
                    this.recentlySentMsgIds.delete(msg.id._serialized);
                    return; // Already saved, and we don't want to reply to ourselves
                }
                let contactPhoneTo = msg.to.split('@')[0];
                try {
                    const contactTo = await msg.getContact();
                    if (contactTo && contactTo.number) {
                        contactPhoneTo = contactTo.number;
                    }
                } catch (err) {
                    console.error("Error fetching contact details for outgoing:", err);
                }

                // Otherwise, it was a manual reply typed from the phone or WhatsApp Web
                // We should save it as an outgoing message to the database
                if (this.orgId && this.waAccountId) {
                    saveOutgoingMessage({
                        orgId: this.orgId,
                        waAccountId: this.waAccountId,
                        contactPhone: contactPhoneTo,
                        body: text,
                        aiUsed: false,
                        rawMessage: msg,
                    }).catch(error => {
                        console.error('❌ Failed to save manual outgoing message:', error);
                    });
                }
                
                // Do not generate an AI reply to our own manual messages
                return;
            }

            // -- AT THIS POINT WE KNOW IT'S AN INCOMING MESSAGE FROM A CUSTOMER --

            // Get contact info
            let contactPhone = msg.from.split('@')[0];
            let contactName = msg.notifyName || null;
            
            try {
                const contact = await msg.getContact();
                if (contact && contact.number) {
                    contactPhone = contact.number;
                }
                if (contact && (contact.name || contact.pushname)) {
                    contactName = contact.name || contact.pushname || contactName;
                }
            } catch (err) {
                console.error("Error fetching contact details:", err);
            }

            // Save incoming message (non-blocking - don't wait for completion)
            if (this.orgId && this.waAccountId) {
                saveIncomingMessage({
                    orgId: this.orgId,
                    waAccountId: this.waAccountId,
                    contactPhone: contactPhone,
                    contactName: contactName,
                    body: text,
                    rawMessage: msg,
                }).catch(error => {
                    console.error('❌ Failed to save incoming message (non-blocking):', error);
                });
            } else {
                console.warn('⚠️ Cannot save message: org/account context not set');
            }

            // If bot auto-reply is disabled, stop here — message is saved, no AI reply
            if (!this.botEnabled) {
                console.log('🔕 Bot is disabled — message saved, auto-reply skipped');
                return;
            }

            // Check if this org uses the ordering agent
            if (this.orgId) {
                const { data: orgConfig } = await supabaseAdmin
                    .from('organizations')
                    .select('agent_mode')
                    .eq('id', this.orgId)
                    .single();

                if (orgConfig?.agent_mode === 'ordering_agent') {
                    await this.handleAgentMessage(msg, text, contactPhone, contactName);
                    return;
                }
            }

            // Simple health-check command
            if (text.toLowerCase() === 'ping') {
                const reply = 'pong 🏓 (Gemini AI is online)';
                const sentMsg = await msg.reply(reply);
                
                // Save ping response (non-blocking)
                if (this.orgId && this.waAccountId) {
                    if (sentMsg) this.recentlySentMsgIds.add(sentMsg.id._serialized);
                    saveOutgoingMessage({
                        orgId: this.orgId,
                        waAccountId: this.waAccountId,
                        contactPhone: contactPhone,
                        body: reply,
                        aiUsed: false,
                        rawMessage: null,
                    }).catch(error => {
                        console.error('❌ Failed to save ping response (non-blocking):', error);
                    });
                }
                return;
            }

            // Generate AI reply using Gemini
            const kbSearchStart = Date.now();
            const kbMatches = await this.searchKB(text, { topK: 3 });
            
            const aiGenerateStart = Date.now();
            const aiReply = await this.generateAIReply({
                userMessage: text,
                kbMatches,
            });
            
            const aiEndTime = Date.now();
            const totalAiLatency = aiEndTime - aiStartTime;

            // Send reply
            const sentMsg = await msg.reply(aiReply);

            // Save outgoing AI reply (non-blocking)
            if (this.orgId && this.waAccountId) {
                if (sentMsg) this.recentlySentMsgIds.add(sentMsg.id._serialized);
                saveOutgoingMessage({
                    orgId: this.orgId,
                    waAccountId: this.waAccountId,
                    contactPhone: contactPhone,
                    body: aiReply,
                    aiUsed: true,
                    aiModel: 'gemini-2.0-flash-exp', // Update this if you change models
                    aiLatencyMs: totalAiLatency,
                    rawMessage: null,
                }).catch(error => {
                    console.error('❌ Failed to save outgoing message (non-blocking):', error);
                });
            }

        } catch (err) {
            console.error('❌ Error handling message:', err);
            try {
                const errorReply = "Sorry, something went wrong on my side.";
                const sentMsg = await msg.reply(errorReply);

                // Save error response (non-blocking)
                if (this.orgId && this.waAccountId) {
                    if (sentMsg) this.recentlySentMsgIds.add(sentMsg.id._serialized);
                    saveOutgoingMessage({
                        orgId: this.orgId,
                        waAccountId: this.waAccountId,
                        contactPhone: contactPhone,
                        body: errorReply,
                        aiUsed: false,
                        rawMessage: null,
                    }).catch(error => {
                        console.error('❌ Failed to save error response (non-blocking):', error);
                    });
                }
            } catch (_) { }
        }
    }

    /**
     * Initialize the WhatsApp client
     */
    async initialize() {
        try {
            await this.client.initialize();
        } catch (error) {
            console.error('❌ Failed to initialize WhatsApp client:', error);
            this.setWaState({ 
                connected: false, 
                lastError: `Initialization failed: ${error.message || String(error)}`, 
                qrDataUrl: null 
            });
            // Don't crash the server - allow it to continue running
        }
    }

    /**
     * Send a manual message from the dashboard
     * @param {string} orgId - Organization UUID
     * @param {string} conversationId - Conversation UUID
     * @param {string} text - Message text
     * @returns {Promise<object>} Saved message object
     */
    async handleAgentMessage(msg, text, contactPhone, contactName) {
        const aiStartTime = Date.now();
        try {
            const contactId = await orderService.getContactIdByPhone(this.orgId, contactPhone);
            if (!contactId) {
                console.warn('⚠️ Agent: contact not found for', contactPhone);
                await msg.reply("Sorry, something went wrong. Please try again.");
                return;
            }

            const conversationId = await orderService.getConversationByContact(this.orgId, contactId);

            // Handle media — check if it's a payment receipt
            if (msg.hasMedia && (msg.type === 'image' || msg.type === 'document')) {
                const pendingOrder = await orderService.getPendingPaymentOrder(this.orgId, contactId);
                if (pendingOrder) {
                    try {
                        const media = await msg.downloadMedia();
                        await orderService.submitReceipt({
                            orderId: pendingOrder.id,
                            messageId: null,
                            waMessageId: msg.id._serialized,
                            mediaType: msg.type,
                            mediaMimeType: media?.mimetype || 'application/octet-stream',
                            mediaData: media?.data ? Buffer.from(media.data, 'base64') : null,
                        });

                        const reply = `Thank you! We've received your payment receipt for order #${pendingOrder.order_number}. Our team will verify it shortly and confirm your order.`;
                        const sentMsg = await msg.reply(reply);
                        if (sentMsg) this.recentlySentMsgIds.add(sentMsg.id._serialized);

                        saveOutgoingMessage({
                            orgId: this.orgId,
                            waAccountId: this.waAccountId || this.orgId,
                            contactPhone,
                            body: reply,
                            aiUsed: false,
                            rawMessage: null,
                        }).catch(err => console.error('❌ Failed to save receipt response:', err));

                        return;
                    } catch (err) {
                        console.error('❌ Failed to process receipt:', err);
                    }
                }
            }

            // Build conversation history from DB
            const { data: recentMessages } = await supabaseAdmin
                .from('messages')
                .select('direction, body, sender_type')
                .eq('conversation_id', conversationId)
                .order('created_at', { ascending: true })
                .limit(20);

            const conversationHistory = (recentMessages || [])
                .filter(m => m.body)
                .map(m => ({
                    role: m.direction === 'inbound' ? 'user' : 'model',
                    parts: [{ text: m.body }],
                }));

            // Run the agent
            const agentReply = await runAgent({
                conversationHistory,
                userMessage: text,
                toolContext: {
                    orgId: this.orgId,
                    contactId,
                    conversationId,
                },
            });

            const aiEndTime = Date.now();
            const totalAiLatency = aiEndTime - aiStartTime;

            const sentMsg = await msg.reply(agentReply);

            if (this.orgId && this.waAccountId) {
                if (sentMsg) this.recentlySentMsgIds.add(sentMsg.id._serialized);
                saveOutgoingMessage({
                    orgId: this.orgId,
                    waAccountId: this.waAccountId || this.orgId,
                    contactPhone,
                    body: agentReply,
                    aiUsed: true,
                    aiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest',
                    aiLatencyMs: totalAiLatency,
                    rawMessage: null,
                }).catch(err => console.error('❌ Failed to save agent response:', err));
            }

        } catch (err) {
            console.error('❌ Error in handleAgentMessage:', err);
            try {
                const errorReply = "Sorry, something went wrong. Please try again.";
                const sentMsg = await msg.reply(errorReply);
                if (sentMsg) this.recentlySentMsgIds.add(sentMsg.id._serialized);

                saveOutgoingMessage({
                    orgId: this.orgId,
                    waAccountId: this.waAccountId || this.orgId,
                    contactPhone,
                    body: errorReply,
                    aiUsed: false,
                    rawMessage: null,
                }).catch(e => console.error('❌ Failed to save error response:', e));
            } catch (_) { }
        }
    }

    async sendManualMessage(orgId, conversationId, text) {
        if (!this.client) {
            throw new Error('WhatsApp client is not ready');
        }

        const { getContactPhoneByConversation, saveOutgoingMessage } = require('./messageStore');

        // 1. Get the phone number for this conversation
        const phone = await getContactPhoneByConversation(conversationId, orgId);
        if (!phone) {
            throw new Error('Contact phone not found for this conversation');
        }

        let sentMsg;
        try {
            const waNumberId = phone.includes('@') ? phone : `${phone}@c.us`;
            sentMsg = await this.client.sendMessage(waNumberId, text);
        } catch (sendErr) {
            console.warn(`⚠️ Failed to send via @c.us, retrying with @lid. Error: ${sendErr.message}`);
            try {
                // If it fails (e.g. No LID for user), retry with @lid
                const waNumberLid = phone.includes('@') ? phone : `${phone}@lid`;
                sentMsg = await this.client.sendMessage(waNumberLid, text);
            } catch (retryErr) {
                console.error("❌ Failed to send via @lid as well:", retryErr);
                throw retryErr;
            }
        }

        if (sentMsg) {
             this.recentlySentMsgIds.add(sentMsg.id._serialized);
        }

        // 2. Save outgoing message to database
        const dbMessage = await saveOutgoingMessage({
            orgId: orgId,
            waAccountId: this.waAccountId || orgId, // fallback to orgId if merged
            contactPhone: phone,
            body: text,
            aiUsed: false,
            rawMessage: sentMsg
        });

        return dbMessage;
    }

    /**
     * Send a media file (image, PDF, document) from the dashboard
     * @param {string} orgId
     * @param {string} conversationId
     * @param {Buffer} fileBuffer - Raw file bytes
     * @param {string} mimeType   - e.g. 'image/png', 'application/pdf'
     * @param {string} filename   - Original filename (shown to recipient)
     * @param {string} caption    - Optional caption text
     */
    async sendManualMediaMessage(orgId, conversationId, fileBuffer, mimeType, filename, caption = '') {
        if (!this.client) throw new Error('WhatsApp client is not ready');

        const { getContactPhoneByConversation, saveOutgoingMessage } = require('./messageStore');

        const phone = await getContactPhoneByConversation(conversationId, orgId);
        if (!phone) throw new Error('Contact phone not found for this conversation');

        const media = new MessageMedia(mimeType, fileBuffer.toString('base64'), filename);
        const waId = phone.includes('@') ? phone : `${phone}@c.us`;

        let sentMsg;
        try {
            sentMsg = await this.client.sendMessage(waId, media, { caption });
        } catch (sendErr) {
            console.warn(`⚠️ Media send via @c.us failed, retrying with @lid: ${sendErr.message}`);
            const waIdLid = phone.includes('@') ? phone : `${phone}@lid`;
            sentMsg = await this.client.sendMessage(waIdLid, media, { caption });
        }

        if (sentMsg) this.recentlySentMsgIds.add(sentMsg.id._serialized);

        // Derive a human-readable message_type from the mime type
        const messageType = mimeType.startsWith('image/') ? 'image' : 'document';

        // body stores the caption; if empty, store the filename so the bubble has something to show
        const body = caption.trim() || filename;

        const dbMessage = await saveOutgoingMessage({
            orgId,
            waAccountId: this.waAccountId || orgId,
            contactPhone: phone,
            body,
            messageType,
            aiUsed: false,
            rawMessage: sentMsg,
        });

        return dbMessage;
    }

    /**
     * Get the WhatsApp client instance
     */
    getClient() {
        return this.client;
    }
}

// Export singleton instance
const waService = new WhatsAppService();
module.exports = waService;

