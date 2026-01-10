const { embedText } = require('./gemini');
const { supabaseAdmin } = require('./auth/supabase');
const { getWhatsAppAccountById } = require('./services/whatsappAccountService');

// Cosine similarity calculation (fallback if vector search not available)
function cosineSim(a, b) {
  if (!a || !b || a.length !== b.length) return -1; 

  let dot = 0;
  let na = 0;
  let nb = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }

  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-10);
}

/**
 * Search knowledge base using Supabase pgvector similarity search
 * @param {string} query - Search query text
 * @param {object} options - Search options
 * @param {number} options.topK - Number of top results to return (default: 3)
 * @param {string} options.waAccountId - Filter by WhatsApp account ID (optional)
 * @param {string} options.orgId - Organization ID (optional, will be fetched if waAccountId provided)
 * @returns {Promise<Array>} Array of matching chunks with scores
 */
async function searchKB(query, { topK = 3, waAccountId = null, orgId = null } = {}) {
  if (!supabaseAdmin) {
    console.error('❌ Supabase admin client not configured');
    return [];
  }

  // Get org_id from wa_account_id if not provided
  if (!orgId && waAccountId) {
    const account = await getWhatsAppAccountById(waAccountId);
    if (account) {
      orgId = account.org_id;
    }
  }

  if (!orgId) {
    console.warn('⚠️ No org_id available for KB search');
    return [];
  }

  // Generate query embedding
  const queryEmbedding = await embedText(query);
  if (!queryEmbedding || queryEmbedding.length === 0) {
    console.error('❌ Failed to generate query embedding');
    return [];
  }

  try {
    // Try to use RPC function for vector similarity search (more efficient)
    // If it doesn't exist, fall back to in-memory computation
    const { data: rpcResults, error: rpcError } = await supabaseAdmin
      .rpc('search_kb_chunks', {
        query_embedding: queryEmbedding,
        match_threshold: 0.0,
        match_count: topK * 3, // Fetch more to allow filtering
        filter_org_id: orgId,
        filter_wa_account_id: waAccountId || null,
      });

    if (!rpcError && rpcResults && Array.isArray(rpcResults)) {
      // Filter by wa_account_id if needed (RPC might not filter correctly)
      const filtered = waAccountId
        ? rpcResults.filter(r => r.wa_account_id === waAccountId)
        : rpcResults;
      
      return filtered.slice(0, topK).map(r => ({
        id: r.id,
        text: r.text,
        title: r.title || 'Unknown',
        wa_account_id: r.wa_account_id || null,
        score: r.similarity || r.score || 0,
        chunk_index: r.chunk_index,
        metadata: r.metadata || {},
      }));
    }

    // Fallback: Fetch chunks and compute similarity in memory
    console.log('📝 Using in-memory similarity computation (consider creating search_kb_chunks RPC function for better performance)');
    
    let queryBuilder = supabaseAdmin
      .from('kb_chunks')
      .select(`
        id,
        text,
        chunk_index,
        embedding,
        metadata,
        kb_sources!inner (
          id,
          title,
          wa_account_id,
          org_id
        )
      `)
      .eq('kb_sources.org_id', orgId)
      .eq('kb_sources.status', 'ready')
      .limit(500); // Limit to prevent memory issues with large KBs

    // Filter by wa_account_id if provided
    if (waAccountId) {
      queryBuilder = queryBuilder.eq('kb_sources.wa_account_id', waAccountId);
    }

    const { data: chunks, error } = await queryBuilder;

    if (error) {
      console.error('❌ Error fetching KB chunks:', error);
      return [];
    }

    if (!chunks || chunks.length === 0) {
      return [];
    }

    // Compute similarity scores
    const scored = chunks
      .map(chunk => {
        // Handle embedding - it might be returned as array or string
        let embedding = chunk.embedding;
        if (typeof embedding === 'string') {
          try {
            embedding = JSON.parse(embedding);
          } catch (e) {
            console.warn('⚠️ Could not parse embedding string:', e);
            return null;
          }
        }
        
        if (!Array.isArray(embedding) || embedding.length !== queryEmbedding.length) {
          return null;
        }

        const score = cosineSim(queryEmbedding, embedding);
        return {
          id: chunk.id,
          text: chunk.text,
          title: chunk.kb_sources?.title || 'Unknown',
          wa_account_id: chunk.kb_sources?.wa_account_id || null,
          score,
          chunk_index: chunk.chunk_index,
          metadata: chunk.metadata || {},
        };
      })
      .filter(c => c !== null && c.score > 0) // Filter out invalid results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored;

  } catch (error) {
    console.error('❌ Error in searchKB:', error);
    return [];
  }
}

module.exports = {
  cosineSim,
  searchKB,
};
