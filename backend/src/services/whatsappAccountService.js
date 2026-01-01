const { supabaseAdmin } = require('../auth/supabase');

/**
 * WhatsApp Account Service
 * Manages WhatsApp account records in the database
 * 
 * Lifecycle:
 * 1. Account created → status: 'pending_qr' (waiting for QR scan)
 * 2. QR generated → status: 'pending_qr' (user needs to scan)
 * 3. Authenticated → status: 'connected' (active connection)
 * 4. Disconnected → status: 'disconnected' (connection lost)
 * 5. Auth failure → status: 'error' (authentication failed)
 */

/**
 * Create a new WhatsApp account for an organization
 * This should be called BEFORE initializing whatsapp-web.js client
 * 
 * @param {object} params
 * @param {string} params.orgId - Organization UUID
 * @param {string} params.displayName - Human-readable name for this account
 * @param {string} params.notes - Optional notes about this account
 * @returns {Promise<object|null>} Created WhatsApp account or null on error
 */
async function createWhatsAppAccount({ orgId, displayName = 'WhatsApp Bot', notes = null }) {
    try {
        if (!supabaseAdmin) {
            throw new Error('Supabase admin client not configured');
        }

        console.log(`📱 Creating WhatsApp account for org: ${orgId}`);

        const { data: account, error } = await supabaseAdmin
            .from('whatsapp_accounts')
            .insert({
                org_id: orgId,
                display_name: displayName,
                phone_number: null, // Will be populated when connected
                status: 'pending_qr', // Initial status: waiting for QR scan
                notes: notes,
                created_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (error) {
            throw error;
        }

        console.log(`✅ WhatsApp account created: ${account.id}`);
        return account;

    } catch (error) {
        console.error('❌ Error creating WhatsApp account:', error);
        return null;
    }
}

/**
 * Update WhatsApp account status and metadata
 * Called during whatsapp-web.js lifecycle events
 * 
 * @param {object} params
 * @param {string} params.accountId - WhatsApp account UUID
 * @param {string} params.status - New status: 'connected', 'disconnected', 'pending_qr', 'error'
 * @param {string} params.phoneNumber - WhatsApp phone number (optional)
 * @param {string} params.displayName - Display name from WhatsApp (optional)
 * @param {string} params.errorMessage - Error message if status is 'error' (optional)
 * @returns {Promise<object|null>} Updated account or null on error
 */
async function updateWhatsAppStatus({ 
    accountId, 
    status, 
    phoneNumber = null, 
    displayName = null,
    errorMessage = null 
}) {
    try {
        if (!supabaseAdmin) {
            throw new Error('Supabase admin client not configured');
        }

        if (!accountId) {
            throw new Error('accountId is required');
        }

        if (!status) {
            throw new Error('status is required');
        }

        // Validate status enum
        const validStatuses = ['connected', 'disconnected', 'pending_qr', 'error'];
        if (!validStatuses.includes(status)) {
            throw new Error(`Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
        }

        console.log(`📱 Updating WhatsApp account ${accountId} to status: ${status}`);

        // Build update object
        const updates = { status };

        // Add timestamp fields based on status
        if (status === 'pending_qr') {
            updates.last_qr_at = new Date().toISOString();
        } else if (status === 'connected') {
            updates.last_connected_at = new Date().toISOString();
        }

        // Update phone number if provided
        if (phoneNumber) {
            updates.phone_number = phoneNumber;
        }

        // Update display name if provided
        if (displayName) {
            updates.display_name = displayName;
        }

        // Store error message in notes if provided
        if (errorMessage && status === 'error') {
            updates.notes = `Error: ${errorMessage}`;
        }

        const { data: account, error } = await supabaseAdmin
            .from('whatsapp_accounts')
            .update(updates)
            .eq('id', accountId)
            .select()
            .single();

        if (error) {
            throw error;
        }

        console.log(`✅ WhatsApp account status updated: ${status}`);
        return account;

    } catch (error) {
        console.error('❌ Error updating WhatsApp account status:', error);
        return null;
    }
}

/**
 * Get WhatsApp account(s) for an organization
 * 
 * @param {string} orgId - Organization UUID
 * @param {boolean} connectedOnly - If true, only return connected accounts
 * @returns {Promise<Array|null>} Array of WhatsApp accounts or null on error
 */
async function getWhatsAppAccountsByOrg(orgId, connectedOnly = false) {
    try {
        if (!supabaseAdmin) {
            throw new Error('Supabase admin client not configured');
        }

        if (!orgId) {
            throw new Error('orgId is required');
        }

        let query = supabaseAdmin
            .from('whatsapp_accounts')
            .select('*')
            .eq('org_id', orgId);

        if (connectedOnly) {
            query = query.eq('status', 'connected');
        }

        const { data: accounts, error } = await query.order('created_at', { ascending: false });

        if (error) {
            throw error;
        }

        return accounts || [];

    } catch (error) {
        console.error('❌ Error fetching WhatsApp accounts:', error);
        return null;
    }
}

/**
 * Get a single WhatsApp account by ID
 * 
 * @param {string} accountId - WhatsApp account UUID
 * @returns {Promise<object|null>} WhatsApp account or null
 */
async function getWhatsAppAccountById(accountId) {
    try {
        if (!supabaseAdmin) {
            throw new Error('Supabase admin client not configured');
        }

        if (!accountId) {
            throw new Error('accountId is required');
        }

        const { data: account, error } = await supabaseAdmin
            .from('whatsapp_accounts')
            .select('*')
            .eq('id', accountId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                // No rows returned
                return null;
            }
            throw error;
        }

        return account;

    } catch (error) {
        console.error('❌ Error fetching WhatsApp account:', error);
        return null;
    }
}

/**
 * Get the first available WhatsApp account (for single-account setups)
 * Useful during development or for simple single-account deployments
 * 
 * @returns {Promise<object|null>} First WhatsApp account or null
 */
async function getFirstWhatsAppAccount() {
    try {
        if (!supabaseAdmin) {
            throw new Error('Supabase admin client not configured');
        }

        const { data: account, error } = await supabaseAdmin
            .from('whatsapp_accounts')
            .select('*')
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

        if (error) {
            throw error;
        }

        return account;

    } catch (error) {
        console.error('❌ Error fetching first WhatsApp account:', error);
        return null;
    }
}

/**
 * Delete a WhatsApp account (soft delete by setting status to 'disconnected')
 * Hard deletion is handled by database cascade on org deletion
 * 
 * @param {string} accountId - WhatsApp account UUID
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
async function disconnectWhatsAppAccount(accountId) {
    try {
        if (!supabaseAdmin) {
            throw new Error('Supabase admin client not configured');
        }

        console.log(`📱 Disconnecting WhatsApp account: ${accountId}`);

        const { error } = await supabaseAdmin
            .from('whatsapp_accounts')
            .update({ 
                status: 'disconnected',
                notes: 'Manually disconnected'
            })
            .eq('id', accountId);

        if (error) {
            throw error;
        }

        console.log(`✅ WhatsApp account disconnected: ${accountId}`);
        return true;

    } catch (error) {
        console.error('❌ Error disconnecting WhatsApp account:', error);
        return false;
    }
}

/**
 * Get statistics for a WhatsApp account
 * Useful for admin dashboards
 * 
 * @param {string} accountId - WhatsApp account UUID
 * @returns {Promise<object|null>} Statistics object or null
 */
async function getWhatsAppAccountStats(accountId) {
    try {
        if (!supabaseAdmin) {
            throw new Error('Supabase admin client not configured');
        }

        // Get account details
        const account = await getWhatsAppAccountById(accountId);
        if (!account) {
            return null;
        }

        // Get conversation count
        const { count: conversationCount } = await supabaseAdmin
            .from('conversations')
            .select('id', { count: 'exact', head: true })
            .eq('wa_account_id', accountId);

        // Get message count
        const { count: messageCount } = await supabaseAdmin
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('wa_account_id', accountId);

        // Get contact count
        const { count: contactCount } = await supabaseAdmin
            .from('contacts')
            .select('id', { count: 'exact', head: true })
            .eq('wa_account_id', accountId);

        return {
            account_id: accountId,
            status: account.status,
            phone_number: account.phone_number,
            display_name: account.display_name,
            total_conversations: conversationCount || 0,
            total_messages: messageCount || 0,
            total_contacts: contactCount || 0,
            last_connected_at: account.last_connected_at,
            created_at: account.created_at,
        };

    } catch (error) {
        console.error('❌ Error fetching WhatsApp account stats:', error);
        return null;
    }
}

module.exports = {
    createWhatsAppAccount,
    updateWhatsAppStatus,
    getWhatsAppAccountsByOrg,
    getWhatsAppAccountById,
    getFirstWhatsAppAccount,
    disconnectWhatsAppAccount,
    getWhatsAppAccountStats,
};


