// kb.js
const { embedText } = require('./gemini');
const { supabaseAdmin } = require('./auth/supabase');
const { getWhatsAppAccountById } = require('./services/whatsappAccountService');

// Simple text chunking: split into ~800-char blocks
function chunkText(text, maxLen = 800) {
    const sentences = text.split(/(?<=[\.!\?])\s+/);
    const chunks = [];
    let current = '';

    for (const s of sentences) {
        if ((current + ' ' + s).length > maxLen) {
            if (current.trim()) chunks.push(current.trim());
            current = s;
        } else {
            current += ' ' + s;
        }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
}

/**
 * Add text to knowledge base by saving to Supabase tables
 * @param {string} title - Title of the knowledge base source
 * @param {string} text - Text content to chunk and embed
 * @param {string} waAccountId - WhatsApp account ID
 * @param {string} orgId - Organization ID (optional, will be fetched if not provided)
 * @param {string} createdBy - User ID who created this (optional)
 * @param {string} sourceType - Type of source ('text' or 'pdf', default: 'text')
 * @param {string} originalFilename - Original filename if from file upload (optional)
 * @returns {Promise<number>} Number of chunks added
 */
async function addTextToKB(title, text, waAccountId, orgId = null, createdBy = null, sourceType = 'text', originalFilename = null) {
    if (!supabaseAdmin) {
        throw new Error('Supabase admin client not configured');
    }

    // Get org_id from wa_account_id if not provided
    if (!orgId && waAccountId) {
        const account = await getWhatsAppAccountById(waAccountId);
        if (!account) {
            throw new Error(`WhatsApp account not found: ${waAccountId}`);
        }
        orgId = account.org_id;
    }

    if (!orgId) {
        throw new Error('org_id is required. Provide it directly or ensure wa_account_id is valid.');
    }

    const chunks = chunkText(text);
    let added = 0;

    // Create kb_source record
    const { data: source, error: sourceError } = await supabaseAdmin
        .from('kb_sources')
        .insert({
            org_id: orgId,
            wa_account_id: waAccountId || null,
            title,
            source_type: sourceType,
            original_filename: originalFilename || null,
            status: 'processing',
            chunk_count: 0,
            created_by: createdBy || null,
        })
        .select()
        .single();

    if (sourceError) {
        console.error('❌ Error creating kb_source:', sourceError);
        throw new Error(`Failed to create knowledge base source: ${sourceError.message}`);
    }

    console.log(`📚 Created KB source: ${source.id} for "${title}"`);

    // Process chunks and create embeddings
    const chunkRecords = [];
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (!chunk.trim()) continue;

        try {
            const embedding = await embedText(chunk); // calls Gemini embeddings

            if (!embedding || embedding.length === 0) {
                console.warn(`⚠️ Failed to generate embedding for chunk ${i + 1}, skipping`);
                continue;
            }

            chunkRecords.push({
                org_id: orgId,
                source_id: source.id,
                chunk_index: i,
                text: chunk,
                embedding: embedding, // Pass as array - Supabase will handle vector conversion
                metadata: {},
            });

            added++;
        } catch (error) {
            console.error(`❌ Error processing chunk ${i + 1}:`, error);
            // Continue with other chunks even if one fails
        }
    }

    // Insert all chunks in batch
    if (chunkRecords.length > 0) {
        // Insert chunks - Supabase will handle vector type conversion from array
        const { data: insertedChunks, error: batchError } = await supabaseAdmin
            .from('kb_chunks')
            .insert(chunkRecords)
            .select();

        if (batchError) {
            console.error('❌ Error inserting chunks in batch:', batchError);
            // Fallback: try inserting one by one
            let insertedCount = 0;
            for (const chunkRecord of chunkRecords) {
                try {
                    const { error: chunkError } = await supabaseAdmin
                        .from('kb_chunks')
                        .insert(chunkRecord);

                    if (chunkError) {
                        console.error(`❌ Error inserting chunk ${chunkRecord.chunk_index}:`, chunkError);
                    } else {
                        insertedCount++;
                    }
                } catch (error) {
                    console.error(`❌ Error inserting chunk ${chunkRecord.chunk_index}:`, error);
                }
            }
            added = insertedCount;
        } else {
            added = insertedChunks ? insertedChunks.length : 0;
        }

        // Update source with final chunk count
        await supabaseAdmin
            .from('kb_sources')
            .update({
                chunk_count: added,
                status: added > 0 ? 'ready' : 'error',
            })
            .eq('id', source.id);

        console.log(`✅ Added ${added} chunks to KB source: ${source.id}`);
        return added;
    } else {
        // No chunks were successfully processed
        await supabaseAdmin
            .from('kb_sources')
            .update({
                status: 'error',
            })
            .eq('id', source.id);

        return 0;
    }
}

module.exports = {
    chunkText,
    addTextToKB,
};
