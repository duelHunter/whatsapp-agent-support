# AI-Powered WhatsApp Automation Platform  
## System Architecture Overview

## 1. Project Overview
This project is an AI-powered WhatsApp automation platform designed to help businesses automate customer support and business inquiries using artificial intelligence and a structured knowledge base.  
The system follows modern SaaS architecture principles to ensure scalability, security, and maintainability.

---

## 2. High-Level Architecture
The system is composed of four primary layers:

- **Web Dashboard** – Next.js + TypeScript
- **Backend API** – Node.js + Express
- **AI & Automation Engine** – Gemini AI + RAG pipeline
- **WhatsApp Integration** – WhatsApp Web session

┌─────────────────────────────┐
│        Web Dashboard         │
│   (Next.js + TypeScript)     │
└─────────────▲───────────────┘
              │ Secure API (JWT)
┌─────────────┴───────────────┐
│     Backend API Server       │
│   (Node.js + Express)        │
└─────────────▲───────────────┘
              │
┌─────────────┴───────────────┐
│   AI & Automation Engine    │
│ (Gemini AI + RAG Pipeline)  │
└─────────────▲───────────────┘
              │
┌─────────────┴───────────────┐
│      WhatsApp Interface     │
│   (WhatsApp Web Session)    │
└─────────────────────────────┘


Each layer is loosely coupled and independently scalable.

---

## 3. Core Design Principles

- WhatsApp-account-centric architecture
- One WhatsApp account represents one business bot
- One knowledge base per WhatsApp account
- Multiple users can collaborate on the same WhatsApp account
- Role-based access control
- Clear separation of concerns

---

## 4. Authentication & Authorization

### Authentication
- Handled using **Supabase Auth**
- Email & password login
- JWT-based secure sessions

### Authorization
- Enforced in backend APIs
- Role-based per WhatsApp account (membership-based)

### Roles
- **Owner** – Full access, billing, deletion
- **Admin** – Knowledge base, AI settings, analytics
- **Operator** – Message handling
- **Viewer** – Read-only analytics

---

## 5. Core Entities & Relationships

```
User
 └─ Membership
     └─ WhatsApp Account
         ├─ Knowledge Base
         ├─ AI Configuration
         ├─ Conversations
         ├─ Analytics
         └─ Automations
```

### Key Rules
- One user can manage multiple WhatsApp accounts
- One WhatsApp account has one active knowledge base
- Multiple users can manage the same WhatsApp account

---

## 6. WhatsApp Integration Layer

- Integrated using `whatsapp-web.js`
- QR-code-based authentication
- Persistent session storage
- Automatic reconnection handling
- Single active session per WhatsApp account

---

## 7. AI & Knowledge Base (RAG Pipeline)

### Knowledge Base Flow
1. Admin uploads PDFs or text documents
2. Documents are parsed and chunked
3. Chunks are embedded using Gemini embeddings
4. Embeddings are stored for semantic search

### AI Response Flow
1. WhatsApp user sends a message
2. Relevant KB chunks are retrieved (semantic search)
3. Context + user query sent to Gemini LLM
4. AI generates a grounded response
5. Response is sent back to the user

This ensures accurate and reliable answers with minimal hallucination.

---

## 8. Admin Dashboard

Built using **Next.js + TypeScript**, the dashboard provides:

- WhatsApp connection management
- QR-code onboarding
- Knowledge base management
- Conversation viewer
- Analytics dashboard
- AI behavior configuration
- Team & role management
- Dark mode support

---

## 9. Backend API Layer

- Node.js + Express
- Stateless REST APIs
- Supabase JWT verification
- Route groups:
  - `/auth`
  - `/whatsapp`
  - `/kb`
  - `/messages`
  - `/analytics`
  - `/settings`

---

## 10. Data Storage Strategy

- **Supabase (PostgreSQL)** for:
  - Users
  - WhatsApp accounts
  - Memberships
  - Metadata
- Vector storage:
  - Local JSON / FAISS (MVP)
  - Pinecone / Chroma (scalable option)
- Object storage for PDFs (optional)

---

## 11. Scalability & Future Expansion

The architecture supports:

- Multi-tenant SaaS expansion
- Multiple WhatsApp accounts per user
- Billing per WhatsApp number
- Advanced automation workflows
- CRM integrations
- Plugin-based extensions

---

## 12. Security Considerations

- JWT-based authentication
- Role-based authorization
- CORS protection
- API rate limiting
- WhatsApp session isolation
- Knowledge base isolation per account

---

## 13. Deployment Strategy

- Frontend: Vercel
- Backend: VPS / Railway / Render
- Bot runner: PM2
- HTTPS via reverse proxy
- Environment-based configuration

---

## 14. Conclusion

This architecture provides a robust foundation for delivering a secure, scalable, and intelligent WhatsApp automation solution.  
It ensures clean separation of concerns, reliable AI behavior, and long-term maintainability.