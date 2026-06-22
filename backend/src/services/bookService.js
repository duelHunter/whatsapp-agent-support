const { supabaseAdmin } = require('../auth/supabase');

async function listBooks(orgId, { page = 1, limit = 20, search, category } = {}) {
    let qb = supabaseAdmin
        .from('books')
        .select('*', { count: 'exact' })
        .eq('org_id', orgId)
        .eq('is_active', true)
        .order('title');

    if (search) {
        qb = qb.or(`title.ilike.%${search}%,author.ilike.%${search}%,isbn.ilike.%${search}%`);
    }
    if (category) {
        qb = qb.ilike('category', category);
    }

    const from = (page - 1) * limit;
    qb = qb.range(from, from + limit - 1);

    const { data, error, count } = await qb;
    if (error) throw error;
    return { books: data || [], total: count || 0 };
}

async function getBook(orgId, bookId) {
    const { data, error } = await supabaseAdmin
        .from('books')
        .select('*')
        .eq('id', bookId)
        .eq('org_id', orgId)
        .single();

    if (error) throw error;
    return data;
}

async function createBook(orgId, bookData) {
    const { data, error } = await supabaseAdmin
        .from('books')
        .insert({
            org_id: orgId,
            title: bookData.title,
            author: bookData.author,
            isbn: bookData.isbn || null,
            category: bookData.category || null,
            description: bookData.description || null,
            price: bookData.price,
            stock: bookData.stock || 0,
            image_url: bookData.image_url || null,
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

async function updateBook(orgId, bookId, updates) {
    const allowed = ['title', 'author', 'isbn', 'category', 'description', 'price', 'stock', 'image_url'];
    const filtered = {};
    for (const key of allowed) {
        if (updates[key] !== undefined) filtered[key] = updates[key];
    }
    filtered.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
        .from('books')
        .update(filtered)
        .eq('id', bookId)
        .eq('org_id', orgId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

async function deleteBook(orgId, bookId) {
    const { error } = await supabaseAdmin
        .from('books')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', bookId)
        .eq('org_id', orgId);

    if (error) throw error;
    return { success: true };
}

async function getCategories(orgId) {
    const { data, error } = await supabaseAdmin
        .from('books')
        .select('category')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .not('category', 'is', null);

    if (error) throw error;

    const unique = [...new Set((data || []).map(r => r.category))].sort();
    return unique;
}

module.exports = {
    listBooks,
    getBook,
    createBook,
    updateBook,
    deleteBook,
    getCategories,
};
