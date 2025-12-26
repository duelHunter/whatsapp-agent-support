const { supabaseAdmin } = require('../auth/supabase');

/**
 * Message Store Service
 * Handles persistence of WhatsApp messages and conversations to Supabase
 * 
 * Architecture:
 * - Contact → Conversation → Messages
 * - All entities linked to organization and WhatsApp account
 * - Non-blocking: failures are logged but don't stop message flow
 */

/**
 * Find or create a contact for a WhatsApp number
 * @param {string} orgId - Organization UUID
 * @param {string} waAccountId - WhatsApp account UUID
 * @param {string} waNumber - WhatsApp phone number (format: 1234567890@c.us)
 * @param {string|null} name - Contact name (if available)
 * @returns {Promise<object|null>} Contact object or null on error
 */
async function findOrCreateContact(orgId, waAccountId, waNumber, name = null) {
    try {
        if (!supabaseAdmin) {
            throw new Error('Supabase admin client not configured');
        }

        // Try to find existing contact
        const { data: existingContact, error: findError } = await supabaseAdmin
            .from('contacts')
            .select('*')
            .eq('org_id', orgId)
            .eq('wa_account_id', waAccountId)
            .eq('wa_number', waNumber)
            .maybeSingle();

        if (findError && findError.code !== 'PGRST116') {
            // PGRST116 = no rows returned (expected if contact doesn't exist)
            throw findError;
        }

        if (existingContact) {
            // Update last_seen_at and name if provided
            const updates = { last_seen_at: new Date().toISOString() };
            if (name) {
                updates.name = name;
            }

            const { error: updateError } = await supabaseAdmin
                .from('contacts')
                .update(updates)
                .eq('id', existingContact.id);

            if (updateError) {
                console.warn('⚠️ Failed to update contact last_seen_at:', updateError.message);
            }

            return existingContact;
        }

        // Create new contact
        const { data: newContact, error: insertError } = await supabaseAdmin
            .from('contacts')
            .insert({
                org_id: orgId,
                wa_account_id: waAccountId,
                wa_number: waNumber,
                name: name,
                first_seen_at: new Date().toISOString(),
                last_seen_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (insertError) {
            throw insertError;
        }

        console.log(`✅ Created new contact: ${waNumber}`);
        return newContact;

    } catch (error) {
        console.error('❌ Error in findOrCreateContact:', error);
        return null;
    }
}

/**
 * Find or create a conversation for a contact
 * @param {string} orgId - Organization UUID
 * @param {string} waAccountId - WhatsApp account UUID
 * @param {string} contactId - Contact UUID
 * @returns {Promise<object|null>} Conversation object or null on error
 */
async function findOrCreateConversation(orgId, waAccountId, contactId) {
    try {
        if (!supabaseAdmin) {
            throw new Error('Supabase admin client not configured');
        }

        // Try to find existing conversation
        const { data: existingConv, error: findError } = await supabaseAdmin
            .from('conversations')
            .select('*')
            .eq('org_id', orgId)
            .eq('wa_account_id', waAccountId)
            .eq('contact_id', contactId)
            .maybeSingle();

        if (findError && findError.code !== 'PGRST116') {
            throw findError;
        }

        if (existingConv) {
            return existingConv;
        }

        // Create new conversation
        const { data: newConv, error: insertError } = await supabaseAdmin
            .from('conversations')
            .insert({
                org_id: orgId,
                wa_account_id: waAccountId,
                contact_id: contactId,
                status: 'open',
                created_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (insertError) {
            throw insertError;
        }

        console.log(`✅ Created new conversation for contact: ${contactId}`);
        return newConv;

    } catch (error) {
        console.error('❌ Error in findOrCreateConversation:', error);
        return null;
    }
}

/**
 * Update conversation's last message metadata
 * @param {string} conversationId - Conversation UUID
 * @param {string} messageBody - Message text for preview
 * @returns {Promise<void>}
 */
async function updateConversationLastMessage(conversationId, messageBody) {
    try {
        if (!supabaseAdmin) {
            return;
        }

        const preview = messageBody?.substring(0, 100) || '(no text)';

        const { error } = await supabaseAdmin
            .from('conversations')
            .update({
                last_message_at: new Date().toISOString(),
                last_message_preview: preview,
            })
            .eq('id', conversationId);

        if (error) {
            console.warn('⚠️ Failed to update conversation last_message_at:', error.message);
        }
    } catch (error) {
        console.error('❌ Error in updateConversationLastMessage:', error);
    }
}

/**
 * Save an incoming WhatsApp message
 * @param {object} params
 * @param {string} params.orgId - Organization UUID
 * @param {string} params.waAccountId - WhatsApp account UUID
 * @param {string} params.contactPhone - Contact's WhatsApp number (e.g., "1234567890@c.us")
 * @param {string} params.contactName - Contact's display name (optional)
 * @param {string} params.body - Message text
 * @param {object} params.rawMessage - Raw WhatsApp message object (for debugging)
 * @returns {Promise<object|null>} Saved message object or null on error
 */
async function saveIncomingMessage({ orgId, waAccountId, contactPhone, contactName, body, rawMessage }) {
    try {
        console.log(`💾 Saving incoming message from ${contactPhone}...`);

        // 1. Find or create contact
        const contact = await findOrCreateContact(orgId, waAccountId, contactPhone, contactName);
        if (!contact) {
            throw new Error('Failed to find or create contact');
        }

        // 2. Find or create conversation
        const conversation = await findOrCreateConversation(orgId, waAccountId, contact.id);
        if (!conversation) {
            throw new Error('Failed to find or create conversation');
        }

        // 3. Save the message
        const { data: message, error: insertError } = await supabaseAdmin
            .from('messages')
            .insert({
                org_id: orgId,
                conversation_id: conversation.id,
                wa_account_id: waAccountId,
                direction: 'inbound',
                sender_type: 'user',
                wa_message_id: rawMessage?.id?.id || rawMessage?.id || null,
                body: body,
                message_type: rawMessage?.type || 'text',
                ai_used: false,
                created_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (insertError) {
            throw insertError;
        }

        // 4. Update conversation metadata
        await updateConversationLastMessage(conversation.id, body);

        console.log(`✅ Saved incoming message: ${message.id}`);
        return message;

    } catch (error) {
        console.error('❌ Error saving incoming message:', error);
        return null;
    }
}

/**
 * Save an outgoing WhatsApp message (bot or agent reply)
 * @param {object} params
 * @param {string} params.orgId - Organization UUID
 * @param {string} params.waAccountId - WhatsApp account UUID
 * @param {string} params.contactPhone - Contact's WhatsApp number
 * @param {string} params.body - Message text
 * @param {boolean} params.aiUsed - Whether AI was used to generate this message
 * @param {string} params.aiModel - AI model name (e.g., "gemini-2.0-flash-exp")
 * @param {number} params.aiLatencyMs - AI response latency in milliseconds
 * @param {object} params.rawMessage - Raw WhatsApp message object (optional)
 * @returns {Promise<object|null>} Saved message object or null on error
 */
async function saveOutgoingMessage({ 
    orgId, 
    waAccountId, 
    contactPhone, 
    body, 
    aiUsed = false, 
    aiModel = null, 
    aiLatencyMs = null,
    rawMessage = null 
}) {
    try {
        console.log(`💾 Saving outgoing message to ${contactPhone}...`);

        // 1. Find or create contact
        const contact = await findOrCreateContact(orgId, waAccountId, contactPhone, null);
        if (!contact) {
            throw new Error('Failed to find or create contact');
        }

        // 2. Find or create conversation
        const conversation = await findOrCreateConversation(orgId, waAccountId, contact.id);
        if (!conversation) {
            throw new Error('Failed to find or create conversation');
        }

        // 3. Save the message
        const { data: message, error: insertError } = await supabaseAdmin
            .from('messages')
            .insert({
                org_id: orgId,
                conversation_id: conversation.id,
                wa_account_id: waAccountId,
                direction: 'outbound',
                sender_type: aiUsed ? 'bot' : 'agent',
                wa_message_id: rawMessage?.id?.id || rawMessage?.id || null,
                body: body,
                message_type: 'text',
                ai_used: aiUsed,
                ai_model: aiModel,
                ai_latency_ms: aiLatencyMs,
                created_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (insertError) {
            throw insertError;
        }

        // 4. Update conversation metadata
        await updateConversationLastMessage(conversation.id, body);

        console.log(`✅ Saved outgoing message: ${message.id}`);
        return message;

    } catch (error) {
        console.error('❌ Error saving outgoing message:', error);
        return null;
    }
}

module.exports = {
    saveIncomingMessage,
    saveOutgoingMessage,
    findOrCreateContact,
    findOrCreateConversation,
};

