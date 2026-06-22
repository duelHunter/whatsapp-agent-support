require('dotenv').config();
const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const orderService = require('./services/orderService');
const { searchKB } = require('./rag');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest';
const MAX_TOOL_ITERATIONS = 10;

const AGENT_SYSTEM_PROMPT = `You are a friendly and helpful bookstore assistant on WhatsApp. You help customers browse books, manage their shopping cart, and place orders.

Your capabilities:
- Search the book catalog by title, author, or category
- Show book details including price and availability
- Manage the customer's shopping cart (add, update, remove items)
- Confirm orders and provide bank transfer payment details
- Check order status and history
- Answer general questions using the knowledge base

Guidelines:
- Be conversational and warm, but concise — this is WhatsApp messaging
- When showing books, format them as a numbered list with title, author, price, and stock
- When a customer wants to add a book, use the book's ID from search results
- Always show the cart total after modifications
- When confirming an order, clearly display the bank transfer details and ask the customer to send a photo of their transfer receipt
- If a book is out of stock, let the customer know and suggest alternatives
- Use emojis sparingly to keep messages friendly
- For questions unrelated to books/orders, use the search_kb tool to find answers from the knowledge base`;

const functionDeclarations = [
    {
        name: 'search_books',
        description: 'Search the book catalog by title, author, or category. Returns matching books with price and availability.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                query: {
                    type: SchemaType.STRING,
                    description: 'Search query — book title, author name, or keyword',
                },
                category: {
                    type: SchemaType.STRING,
                    description: 'Optional category filter (e.g., Fiction, Programming, Science)',
                },
            },
            required: ['query'],
        },
    },
    {
        name: 'get_book_details',
        description: 'Get full details of a specific book including description, ISBN, and stock.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                book_id: {
                    type: SchemaType.STRING,
                    description: 'The UUID of the book',
                },
            },
            required: ['book_id'],
        },
    },
    {
        name: 'get_cart',
        description: 'View the customer\'s current shopping cart with all items and total.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {},
        },
    },
    {
        name: 'add_to_cart',
        description: 'Add a book to the customer\'s shopping cart.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                book_id: {
                    type: SchemaType.STRING,
                    description: 'The UUID of the book to add',
                },
                quantity: {
                    type: SchemaType.INTEGER,
                    description: 'Number of copies to add (default 1)',
                },
            },
            required: ['book_id'],
        },
    },
    {
        name: 'update_cart_item',
        description: 'Update the quantity of an item already in the cart.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                order_item_id: {
                    type: SchemaType.STRING,
                    description: 'The UUID of the order item to update',
                },
                quantity: {
                    type: SchemaType.INTEGER,
                    description: 'New quantity',
                },
            },
            required: ['order_item_id', 'quantity'],
        },
    },
    {
        name: 'remove_from_cart',
        description: 'Remove an item from the cart.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                order_item_id: {
                    type: SchemaType.STRING,
                    description: 'The UUID of the order item to remove',
                },
            },
            required: ['order_item_id'],
        },
    },
    {
        name: 'confirm_order',
        description: 'Finalize the cart and confirm the order. Returns bank transfer details for payment. Only call this when the customer explicitly wants to place/confirm their order.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {},
        },
    },
    {
        name: 'cancel_order',
        description: 'Cancel an order.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                order_id: {
                    type: SchemaType.STRING,
                    description: 'The UUID of the order to cancel. If not provided, cancels the most recent non-draft order.',
                },
            },
        },
    },
    {
        name: 'get_order_status',
        description: 'Check the status of an order.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                order_id: {
                    type: SchemaType.STRING,
                    description: 'The UUID of the order. If not provided, returns the most recent order.',
                },
            },
        },
    },
    {
        name: 'get_order_history',
        description: 'View the customer\'s past orders.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {},
        },
    },
    {
        name: 'search_kb',
        description: 'Search the knowledge base for general questions unrelated to book ordering (e.g., store hours, return policy, contact info).',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                query: {
                    type: SchemaType.STRING,
                    description: 'The question or search query',
                },
            },
            required: ['query'],
        },
    },
];

async function executeTool(name, args, ctx) {
    try {
        switch (name) {
            case 'search_books':
                return { books: await orderService.searchBooks(ctx.orgId, args.query, args.category) };

            case 'get_book_details':
                return await orderService.getBookDetails(ctx.orgId, args.book_id) || { error: 'Book not found' };

            case 'get_cart':
                return await orderService.getCart(ctx.orgId, ctx.contactId);

            case 'add_to_cart':
                return await orderService.addToCart(ctx.orgId, ctx.contactId, ctx.conversationId, args.book_id, args.quantity || 1);

            case 'update_cart_item':
                return await orderService.updateCartItem(args.order_item_id, args.quantity);

            case 'remove_from_cart':
                return await orderService.removeFromCart(args.order_item_id);

            case 'confirm_order':
                return await orderService.confirmOrder(ctx.orgId, ctx.contactId);

            case 'cancel_order': {
                if (args.order_id) {
                    return await orderService.cancelOrder(args.order_id);
                }
                const status = await orderService.getOrderStatus(ctx.orgId, ctx.contactId);
                if (status.error) return status;
                return await orderService.cancelOrder(status.order_id);
            }

            case 'get_order_status':
                return await orderService.getOrderStatus(ctx.orgId, ctx.contactId, args.order_id);

            case 'get_order_history':
                return { orders: await orderService.getOrderHistory(ctx.orgId, ctx.contactId) };

            case 'search_kb': {
                const results = await searchKB(args.query, { topK: 3, orgId: ctx.orgId, waAccountId: ctx.orgId });
                if (!results || results.length === 0) {
                    return { answer: 'No relevant information found in the knowledge base.' };
                }
                return {
                    snippets: results.map(r => ({
                        text: r.text,
                        source: r.title,
                        score: r.score,
                    })),
                };
            }

            default:
                return { error: `Unknown tool: ${name}` };
        }
    } catch (err) {
        console.error(`❌ Agent tool error (${name}):`, err);
        return { error: err.message || 'An error occurred while processing your request.' };
    }
}

async function runAgent({ conversationHistory, userMessage, toolContext }) {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
        model: GEMINI_MODEL,
        tools: [{ functionDeclarations }],
        systemInstruction: AGENT_SYSTEM_PROMPT,
    });

    const chat = model.startChat({
        history: conversationHistory || [],
    });

    let result = await chat.sendMessage(userMessage);
    let iterations = 0;

    while (iterations < MAX_TOOL_ITERATIONS) {
        const candidate = result.response.candidates?.[0];
        if (!candidate) break;

        const functionCalls = candidate.content?.parts?.filter(p => p.functionCall) || [];
        if (functionCalls.length === 0) break;

        iterations++;
        console.log(`🔧 Agent tool call iteration ${iterations}:`, functionCalls.map(fc => fc.functionCall.name));

        const functionResponses = [];
        for (const part of functionCalls) {
            const { name, args } = part.functionCall;
            const response = await executeTool(name, args || {}, toolContext);
            functionResponses.push({
                functionResponse: {
                    name,
                    response: { result: response },
                },
            });
        }

        result = await chat.sendMessage(functionResponses);
    }

    if (iterations >= MAX_TOOL_ITERATIONS) {
        console.warn('⚠️ Agent reached max tool iterations');
    }

    const text = result.response.text();
    return text || "I'm sorry, I couldn't process that request. Please try again.";
}

module.exports = { runAgent };
