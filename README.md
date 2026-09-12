<div align="center">

# 📱 WhatsApp AI Bot

**Self-hosted WhatsApp customer support & ordering automation, powered by an LLM.**

Connects to a real WhatsApp account and automatically handles customer conversations — answering questions from a knowledge base, or running a full tool-calling agent that browses a catalog, manages carts, places orders, and verifies payment receipts.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20pgvector-3ECF8E?logo=supabase&logoColor=white)
![whatsapp-web.js](https://img.shields.io/badge/whatsapp--web.js-1.34-25D366?logo=whatsapp&logoColor=white)

</div>

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Testing Receipt OCR Standalone](#testing-receipt-ocr-standalone)
- [Project Structure](#project-structure)
- [Known Limitations](#known-limitations)
- [License](#license)

## Features

- 💬 **WhatsApp integration** — connects via [`whatsapp-web.js`](https://github.com/pedroslopez/whatsapp-web.js) (Puppeteer-driven, no official Business API required). QR login, persistent session, manual reply support from the dashboard.
- 🤖 **Two agent modes**, configurable per organization:
  - **`kb_only`** — answers questions using a RAG pipeline over an uploaded knowledge base (PDFs/text), backed by Supabase pgvector.
  - **`ordering_agent`** — a tool-calling agent that searches a book catalog, manages a shopping cart, confirms orders, and falls back to the knowledge base for anything unrelated.
- 🧾 **Payment receipt verification** — when a customer sends a photo of a bank transfer receipt, the backend extracts the amount/date/reference/bank name locally via OCR and surfaces it to an admin for manual approve/reject. Extraction is advisory only — a human always makes the final call.
- 📊 **Admin dashboard** — conversations, orders, catalog, knowledge base, analytics, WhatsApp connection status, per-org agent settings, and user management.
- 🏢 **Multi-tenant** — organizations, WhatsApp accounts, and role-based access (`admin` / `user`) via Supabase Auth + RLS.

## Architecture

```
frontend/   Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4
            REST calls to the backend + direct Supabase auth/session handling.

backend/    Node.js · Express (port 4000)
  src/
    index.js                   Express app, all REST routes
    agent.js                   Tool-calling ordering agent (LLM + tool loop)
    ai.js                      KB-grounded reply generator + HF embeddings
    rag.js / kb.js             Knowledge base ingestion + retrieval (pgvector)
    services/
      waService.js             WhatsApp client lifecycle + message handling
      orderService.js          Books, cart, orders, payment receipts
      messageStore.js          Persists inbound/outbound messages + conversations
      receiptOcr.js            Local OCR (Tesseract) receipt extraction
      receiptVerification.js   Alternative vision-LLM-based receipt extraction
      whatsappAccountService.js · bookService.js · socketService.js
  scripts/                    Standalone CLI tools (test OCR extraction in isolation)
```

Database: **Supabase** (managed Postgres) with **pgvector** for embeddings — see `backend/MIGRATION_*.sql` for schema history.

LLM access is via any **OpenAI-compatible chat completions endpoint** (defaults to a local [Ollama](https://ollama.com) instance), used for both the KB agent and the tool-calling ordering agent.

## Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project with pgvector enabled
- An OpenAI-compatible LLM endpoint — e.g. Ollama running locally with a tool-calling-capable model pulled
- Chrome, for Puppeteer/`whatsapp-web.js` (run `npx puppeteer browsers install chrome` inside `backend/` if needed)
- A WhatsApp account to connect (QR login on first run)

## Getting Started

```bash
# 1. Install dependencies
cd backend && npm install
cd ../frontend && npm install

# 2. Set up the database — run backend/MIGRATION_*.sql against your Supabase
#    project, in order, via the Supabase SQL editor or CLI.

# 3. Configure environment variables (see below), then run:
cd backend && npm run dev      # terminal 1
cd frontend && npm run dev     # terminal 2
```

On first run, a QR code is generated to log the bot into WhatsApp (shown in the dashboard and backend logs).

## Environment Variables

**`backend/.env`**

| Variable | Description |
|---|---|
| `PORT` | Backend port (default `4000`) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (server-side only) |
| `CORS_ORIGIN` | Allowed origin for the frontend |
| `AI_BASE_URL` | OpenAI-compatible chat completions endpoint (e.g. `http://127.0.0.1:11434/v1/chat/completions` for Ollama) |
| `AI_API_KEY` | API key for that endpoint (any string works for local Ollama) |
| `AI_MODEL` | Chat/tool-calling model name |
| `VISION_AI_MODEL` | *(optional)* Vision-capable model, only for the vision-LLM receipt path in `receiptVerification.js` |
| `HF_API_TOKEN` / `HF_EMBED_MODEL` | Hugging Face Inference token + embedding model, for KB embeddings |

**`frontend/.env`**

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `NEXT_PUBLIC_API_BASE_URL` | Backend API base URL (e.g. `http://localhost:4000`) |

## Testing Receipt OCR Standalone

Test the OCR extraction directly on a saved image, no WhatsApp or live conversation needed:

```bash
cd backend
node scripts/testReceiptOcr.js path/to/receipt.jpg
```

Prints the parsed fields (amount, reference, date, bank name, confidence) plus the full raw OCR text, so you can verify extraction quality against a sample receipt.

## Project Structure

<details>
<summary>Click to expand</summary>

```
.
├── backend/
│   ├── src/
│   │   ├── index.js
│   │   ├── agent.js
│   │   ├── ai.js
│   │   ├── rag.js
│   │   ├── kb.js
│   │   ├── auth/
│   │   ├── middleware/
│   │   └── services/
│   ├── scripts/
│   └── MIGRATION_*.sql
└── frontend/
    └── src/
        ├── app/          # Next.js App Router pages
        └── lib/          # API client, types, Supabase client
```

</details>

## Known Limitations

- Single WhatsApp account per backend process — `waService.js` is a singleton client; running multiple accounts simultaneously needs a multi-client architecture.
- The ordering agent's tool loop includes several guardrails around unreliable local-model behavior (fallback parsing for malformed tool calls, output sanitization, empty-reply retry, per-contact message serialization) — see `backend/src/agent.js` for details.
- Receipt/OCR extraction is always advisory — approving or rejecting a payment receipt is a manual admin action, never automatic.

## License

No license file is currently included in this repository — all rights reserved by default until one is added.
