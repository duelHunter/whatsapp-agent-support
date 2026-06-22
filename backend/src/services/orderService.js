const { supabaseAdmin } = require('../auth/supabase');

async function searchBooks(orgId, query, category) {
    let qb = supabaseAdmin
        .from('books')
        .select('id, title, author, isbn, category, price, stock, description')
        .eq('org_id', orgId)
        .eq('is_active', true);

    if (category) {
        qb = qb.ilike('category', category);
    }

    if (query) {
        qb = qb.or(`title.ilike.%${query}%,author.ilike.%${query}%`);
    }

    qb = qb.order('title').limit(10);

    const { data, error } = await qb;
    if (error) throw error;
    return data || [];
}

async function getBookDetails(orgId, bookId) {
    const { data, error } = await supabaseAdmin
        .from('books')
        .select('*')
        .eq('id', bookId)
        .eq('org_id', orgId)
        .eq('is_active', true)
        .single();

    if (error) throw error;
    return data;
}

async function getOrCreateDraftOrder(orgId, contactId, conversationId) {
    const { data: existing, error: findErr } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('org_id', orgId)
        .eq('contact_id', contactId)
        .eq('status', 'draft')
        .maybeSingle();

    if (findErr) throw findErr;
    if (existing) return existing;

    const { data: created, error: createErr } = await supabaseAdmin
        .from('orders')
        .insert({
            org_id: orgId,
            contact_id: contactId,
            conversation_id: conversationId,
            status: 'draft',
            subtotal: 0,
        })
        .select()
        .single();

    if (createErr) throw createErr;
    return created;
}

async function getCart(orgId, contactId) {
    const { data: order, error: orderErr } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('org_id', orgId)
        .eq('contact_id', contactId)
        .eq('status', 'draft')
        .maybeSingle();

    if (orderErr) throw orderErr;
    if (!order) return { order: null, items: [], subtotal: 0 };

    const { data: items, error: itemsErr } = await supabaseAdmin
        .from('order_items')
        .select('id, quantity, unit_price, book_id, books(title, author)')
        .eq('order_id', order.id);

    if (itemsErr) throw itemsErr;

    return {
        order_id: order.id,
        order_number: order.order_number,
        items: (items || []).map(i => ({
            order_item_id: i.id,
            book_id: i.book_id,
            title: i.books?.title,
            author: i.books?.author,
            quantity: i.quantity,
            unit_price: Number(i.unit_price),
            line_total: Number(i.unit_price) * i.quantity,
        })),
        subtotal: Number(order.subtotal),
    };
}

async function addToCart(orgId, contactId, conversationId, bookId, quantity = 1) {
    const book = await getBookDetails(orgId, bookId);
    if (!book) return { error: 'Book not found' };
    if (book.stock < quantity) return { error: `Only ${book.stock} copies available` };

    const order = await getOrCreateDraftOrder(orgId, contactId, conversationId);

    const { data: existingItem } = await supabaseAdmin
        .from('order_items')
        .select('*')
        .eq('order_id', order.id)
        .eq('book_id', bookId)
        .maybeSingle();

    if (existingItem) {
        const newQty = existingItem.quantity + quantity;
        if (book.stock < newQty) return { error: `Only ${book.stock} copies available (${existingItem.quantity} already in cart)` };

        await supabaseAdmin
            .from('order_items')
            .update({ quantity: newQty })
            .eq('id', existingItem.id);
    } else {
        await supabaseAdmin
            .from('order_items')
            .insert({
                order_id: order.id,
                book_id: bookId,
                quantity,
                unit_price: book.price,
            });
    }

    await recalculateSubtotal(order.id);
    return await getCart(orgId, contactId);
}

async function updateCartItem(orderItemId, quantity) {
    const { data: item, error: findErr } = await supabaseAdmin
        .from('order_items')
        .select('*, books(stock)')
        .eq('id', orderItemId)
        .single();

    if (findErr) return { error: 'Item not found' };
    if (item.books?.stock < quantity) return { error: `Only ${item.books.stock} copies available` };

    await supabaseAdmin
        .from('order_items')
        .update({ quantity })
        .eq('id', orderItemId);

    await recalculateSubtotal(item.order_id);
    return { success: true, order_id: item.order_id };
}

async function removeFromCart(orderItemId) {
    const { data: item, error: findErr } = await supabaseAdmin
        .from('order_items')
        .select('order_id')
        .eq('id', orderItemId)
        .single();

    if (findErr) return { error: 'Item not found' };

    await supabaseAdmin
        .from('order_items')
        .delete()
        .eq('id', orderItemId);

    await recalculateSubtotal(item.order_id);
    return { success: true, order_id: item.order_id };
}

async function confirmOrder(orgId, contactId) {
    const { data: order, error: findErr } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('org_id', orgId)
        .eq('contact_id', contactId)
        .eq('status', 'draft')
        .maybeSingle();

    if (findErr) throw findErr;
    if (!order) return { error: 'No active cart found' };

    const { data: items } = await supabaseAdmin
        .from('order_items')
        .select('*')
        .eq('order_id', order.id);

    if (!items || items.length === 0) return { error: 'Cart is empty' };

    const { error: updateErr } = await supabaseAdmin
        .from('orders')
        .update({
            status: 'pending_payment',
            status_changed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('id', order.id);

    if (updateErr) throw updateErr;

    const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('bank_transfer_details, display_name')
        .eq('id', orgId)
        .single();

    return {
        order_id: order.id,
        order_number: order.order_number,
        subtotal: Number(order.subtotal),
        status: 'pending_payment',
        bank_transfer_details: org?.bank_transfer_details || 'Please contact us for bank transfer details.',
        business_name: org?.display_name || 'Our Store',
    };
}

async function cancelOrder(orderId) {
    const { data: order, error: findErr } = await supabaseAdmin
        .from('orders')
        .select('status')
        .eq('id', orderId)
        .single();

    if (findErr) return { error: 'Order not found' };
    if (order.status === 'delivered' || order.status === 'cancelled') {
        return { error: `Cannot cancel an order that is already ${order.status}` };
    }

    const { error: updateErr } = await supabaseAdmin
        .from('orders')
        .update({
            status: 'cancelled',
            status_changed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);

    if (updateErr) throw updateErr;
    return { success: true, order_id: orderId };
}

async function getOrderStatus(orgId, contactId, orderId) {
    let qb = supabaseAdmin
        .from('orders')
        .select('id, order_number, status, subtotal, notes, shipping_address, created_at, updated_at, status_changed_at');

    if (orderId) {
        qb = qb.eq('id', orderId);
    } else {
        qb = qb.eq('org_id', orgId).eq('contact_id', contactId).neq('status', 'draft').order('created_at', { ascending: false }).limit(1);
    }

    const { data, error } = await qb.maybeSingle();
    if (error) throw error;
    if (!data) return { error: 'No orders found' };

    const { data: items } = await supabaseAdmin
        .from('order_items')
        .select('quantity, unit_price, books(title, author)')
        .eq('order_id', data.id);

    return {
        order_id: data.id,
        order_number: data.order_number,
        status: data.status,
        subtotal: Number(data.subtotal),
        items: (items || []).map(i => ({
            title: i.books?.title,
            author: i.books?.author,
            quantity: i.quantity,
            unit_price: Number(i.unit_price),
        })),
        created_at: data.created_at,
    };
}

async function getOrderHistory(orgId, contactId) {
    const { data, error } = await supabaseAdmin
        .from('orders')
        .select('id, order_number, status, subtotal, created_at')
        .eq('org_id', orgId)
        .eq('contact_id', contactId)
        .neq('status', 'draft')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) throw error;
    return data || [];
}

async function submitReceipt({ orderId, messageId, waMessageId, mediaType, mediaMimeType, mediaData }) {
    const { error: receiptErr } = await supabaseAdmin
        .from('payment_receipts')
        .insert({
            order_id: orderId,
            message_id: messageId,
            wa_message_id: waMessageId,
            media_type: mediaType,
            media_mime_type: mediaMimeType,
            media_data: mediaData,
            status: 'pending',
        });

    if (receiptErr) throw receiptErr;

    const { error: orderErr } = await supabaseAdmin
        .from('orders')
        .update({
            status: 'receipt_submitted',
            status_changed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);

    if (orderErr) throw orderErr;
    return { success: true };
}

async function approveReceipt(orderId, reviewedBy) {
    const { error: receiptErr } = await supabaseAdmin
        .from('payment_receipts')
        .update({
            status: 'approved',
            reviewed_by: reviewedBy,
            reviewed_at: new Date().toISOString(),
        })
        .eq('order_id', orderId)
        .eq('status', 'pending');

    if (receiptErr) throw receiptErr;

    const { error: orderErr } = await supabaseAdmin
        .from('orders')
        .update({
            status: 'confirmed',
            status_changed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);

    if (orderErr) throw orderErr;
    return { success: true };
}

async function rejectReceipt(orderId, reviewedBy, notes) {
    const { error: receiptErr } = await supabaseAdmin
        .from('payment_receipts')
        .update({
            status: 'rejected',
            reviewed_by: reviewedBy,
            reviewed_at: new Date().toISOString(),
            notes,
        })
        .eq('order_id', orderId)
        .eq('status', 'pending');

    if (receiptErr) throw receiptErr;

    const { error: orderErr } = await supabaseAdmin
        .from('orders')
        .update({
            status: 'pending_payment',
            status_changed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);

    if (orderErr) throw orderErr;
    return { success: true };
}

async function updateOrderStatus(orderId, newStatus, adminNotes) {
    const updates = {
        status: newStatus,
        status_changed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    if (adminNotes) updates.admin_notes = adminNotes;

    const { error } = await supabaseAdmin
        .from('orders')
        .update(updates)
        .eq('id', orderId);

    if (error) throw error;
    return { success: true };
}

async function recalculateSubtotal(orderId) {
    const { data: items, error } = await supabaseAdmin
        .from('order_items')
        .select('quantity, unit_price')
        .eq('order_id', orderId);

    if (error) throw error;

    const subtotal = (items || []).reduce((sum, i) => sum + (Number(i.unit_price) * i.quantity), 0);

    await supabaseAdmin
        .from('orders')
        .update({ subtotal, updated_at: new Date().toISOString() })
        .eq('id', orderId);
}

async function getPendingPaymentOrder(orgId, contactId) {
    const { data, error } = await supabaseAdmin
        .from('orders')
        .select('id, order_number, subtotal')
        .eq('org_id', orgId)
        .eq('contact_id', contactId)
        .eq('status', 'pending_payment')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    return data;
}

async function getContactIdByPhone(orgId, phone) {
    const { data, error } = await supabaseAdmin
        .from('contacts')
        .select('id')
        .eq('org_id', orgId)
        .eq('wa_number', phone)
        .maybeSingle();

    if (error) throw error;
    return data?.id || null;
}

async function getConversationByContact(orgId, contactId) {
    const { data, error } = await supabaseAdmin
        .from('conversations')
        .select('id')
        .eq('org_id', orgId)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    return data?.id || null;
}

async function listOrders(orgId, { status, page = 1, limit = 20 } = {}) {
    let qb = supabaseAdmin
        .from('orders')
        .select('id, order_number, status, subtotal, created_at, updated_at, status_changed_at, contact_id, contacts(wa_number, name)', { count: 'exact' })
        .eq('org_id', orgId)
        .neq('status', 'draft')
        .order('created_at', { ascending: false });

    if (status) qb = qb.eq('status', status);

    const from = (page - 1) * limit;
    qb = qb.range(from, from + limit - 1);

    const { data, error, count } = await qb;
    if (error) throw error;
    return { orders: data || [], total: count || 0 };
}

async function getOrderById(orderId) {
    const { data: order, error: orderErr } = await supabaseAdmin
        .from('orders')
        .select('*, contacts(wa_number, name)')
        .eq('id', orderId)
        .single();

    if (orderErr) throw orderErr;

    const { data: items } = await supabaseAdmin
        .from('order_items')
        .select('*, books(title, author, isbn)')
        .eq('order_id', orderId);

    const { data: receipts } = await supabaseAdmin
        .from('payment_receipts')
        .select('id, status, media_type, media_mime_type, created_at, reviewed_at, notes')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });

    return { ...order, items: items || [], receipts: receipts || [] };
}

async function getReceiptData(receiptId) {
    const { data, error } = await supabaseAdmin
        .from('payment_receipts')
        .select('*')
        .eq('id', receiptId)
        .single();

    if (error) throw error;
    return data;
}

module.exports = {
    searchBooks,
    getBookDetails,
    getOrCreateDraftOrder,
    getCart,
    addToCart,
    updateCartItem,
    removeFromCart,
    confirmOrder,
    cancelOrder,
    getOrderStatus,
    getOrderHistory,
    submitReceipt,
    approveReceipt,
    rejectReceipt,
    updateOrderStatus,
    getPendingPaymentOrder,
    getContactIdByPhone,
    getConversationByContact,
    listOrders,
    getOrderById,
    getReceiptData,
};
