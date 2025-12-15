const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

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
        });

        // Ready event
        this.client.on('ready', () => {
            console.log('✅ WhatsApp client is ready');
            this.setWaState({ connected: true, qrDataUrl: null, lastError: null });
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
            const kbMatches = await this.searchKB(text, { topK: 3 });
            const aiReply = await this.generateAIReply({
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

