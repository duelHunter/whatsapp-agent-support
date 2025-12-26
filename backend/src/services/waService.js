const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const { supabaseAdmin } = require('../auth/supabase');
const { saveIncomingMessage, saveOutgoingMessage } = require('./messageStore');

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
                headless: true,
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
                remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2413.51-beta.html',
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
     * Looks for the first available WhatsApp account or creates a placeholder
     */
    async loadContext() {
        try {
            if (!supabaseAdmin) {
                console.warn('⚠️ Cannot load context: Supabase not configured');
                return;
            }

            // Get first WhatsApp account (in production, this should be more sophisticated)
            const { data: accounts, error } = await supabaseAdmin
                .from('whatsapp_accounts')
                .select('id, org_id')
                .limit(1)
                .maybeSingle();

            if (error) {
                console.error('❌ Error loading WhatsApp account context:', error);
                return;
            }

            if (accounts) {
                this.setContext(accounts.org_id, accounts.id);
            } else {
                console.warn('⚠️ No WhatsApp account found in database. Messages will not be persisted until context is set.');
            }
        } catch (error) {
            console.error('❌ Error in loadContext:', error);
        }
    }

    /**
     * Update WhatsApp account status in database
     * @param {string} status - Status: 'connected', 'disconnected', 'pending_qr', 'error'
     */
    async updateAccountStatus(status) {
        try {
            if (!supabaseAdmin || !this.waAccountId) {
                return;
            }

            const updates = { status };
            
            if (status === 'pending_qr') {
                updates.last_qr_at = new Date().toISOString();
            } else if (status === 'connected') {
                updates.last_connected_at = new Date().toISOString();
            }

            const { error } = await supabaseAdmin
                .from('whatsapp_accounts')
                .update(updates)
                .eq('id', this.waAccountId);

            if (error) {
                console.error('❌ Error updating account status:', error);
            } else {
                console.log(`✅ Updated account status to: ${status}`);
            }
        } catch (error) {
            console.error('❌ Error in updateAccountStatus:', error);
        }
    }

    /**
     * Update WhatsApp account phone number in database
     */
    async updateAccountPhoneNumber() {
        try {
            if (!supabaseAdmin || !this.waAccountId || !this.client) {
                return;
            }

            const info = this.client.info;
            if (!info || !info.wid) {
                return;
            }

            const phoneNumber = info.wid.user; // e.g., "1234567890"
            const displayName = info.pushname || null;

            const updates = { phone_number: phoneNumber };
            if (displayName) {
                updates.display_name = displayName;
            }

            const { error } = await supabaseAdmin
                .from('whatsapp_accounts')
                .update(updates)
                .eq('id', this.waAccountId);

            if (error) {
                console.error('❌ Error updating account phone number:', error);
            } else {
                console.log(`✅ Updated account phone: ${phoneNumber}`);
            }
        } catch (error) {
            console.error('❌ Error in updateAccountPhoneNumber:', error);
        }
    }

    /**
     * Setup all WhatsApp client event handlers
     */
    setupEventHandlers() {
        // QR code event
        this.client.on('qr', async (qr) => {
            console.log('📲 Scan this QR code with your WhatsApp:');
            // print the qr code to console
            qrcode.generate(qr, { small: true });

            // convert to image for dashboard (await the Promise)
            const qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, scale: 6 });
            console.log('QR code image URL generated');
            this.setWaState({ connected: false, qrDataUrl, lastError: null });
            
            // Update account status in database
            await this.updateAccountStatus('pending_qr');
        });

        // Ready event
        this.client.on('ready', async () => {
            console.log('✅ WhatsApp client is ready');
            this.setWaState({ connected: true, qrDataUrl: null, lastError: null });
            
            // Update account status in database
            await this.updateAccountStatus('connected');
            
            // Get and update phone number
            await this.updateAccountPhoneNumber();
        });

        // Authenticated event
        this.client.on('authenticated', () => {
            console.log('🔐 WhatsApp authenticated');
        });

        // Auth failure event
        this.client.on('auth_failure', (msg) => {
            console.error('❌ Auth failure:', msg);
            this.setWaState({ connected: false, lastError: msg });
        });

        // Disconnected event
        this.client.on('disconnected', async (reason) => {
            console.log('⚠️ WhatsApp client disconnected:', reason);
            this.setWaState({ connected: false, lastError: reason, qrDataUrl: null });
            
            // Update account status in database
            await this.updateAccountStatus('disconnected');
            
            // Handle LOGOUT - properly destroy client and delete session files
            if (reason === 'LOGOUT') {
                await this.handleLogout();
            }
        });

        // Error event
        this.client.on('error', (error) => {
            console.error('❌ WhatsApp client error:', error);
            this.setWaState({ connected: false, lastError: error.message || String(error), qrDataUrl: null });
        });

        // Message event
        this.client.on('message', async (msg) => {
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
        const aiStartTime = Date.now();
        let savedIncoming = null;

        try {
            console.log(`💬 From ${msg.from}: ${msg.body}`);
            console.log("msg is", msg);

            const text = msg.body?.trim();
            if (!text) return;

            // Get contact info
            const contactName = msg.notifyName || null;

            // Save incoming message (non-blocking - don't wait for completion)
            if (this.orgId && this.waAccountId) {
                saveIncomingMessage({
                    orgId: this.orgId,
                    waAccountId: this.waAccountId,
                    contactPhone: msg.from,
                    contactName: contactName,
                    body: text,
                    rawMessage: msg,
                }).catch(error => {
                    console.error('❌ Failed to save incoming message (non-blocking):', error);
                });
            } else {
                console.warn('⚠️ Cannot save message: org/account context not set');
            }

            // Simple health-check command
            if (text.toLowerCase() === 'ping') {
                const reply = 'pong 🏓 (Gemini AI is online)';
                await msg.reply(reply);
                
                // Save ping response (non-blocking)
                if (this.orgId && this.waAccountId) {
                    saveOutgoingMessage({
                        orgId: this.orgId,
                        waAccountId: this.waAccountId,
                        contactPhone: msg.from,
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
            await msg.reply(aiReply);

            // Save outgoing AI reply (non-blocking)
            if (this.orgId && this.waAccountId) {
                saveOutgoingMessage({
                    orgId: this.orgId,
                    waAccountId: this.waAccountId,
                    contactPhone: msg.from,
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
                await msg.reply(errorReply);

                // Save error response (non-blocking)
                if (this.orgId && this.waAccountId) {
                    saveOutgoingMessage({
                        orgId: this.orgId,
                        waAccountId: this.waAccountId,
                        contactPhone: msg.from,
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
     * Get the WhatsApp client instance
     */
    getClient() {
        return this.client;
    }
}

// Export singleton instance
const waService = new WhatsAppService();
module.exports = waService;

