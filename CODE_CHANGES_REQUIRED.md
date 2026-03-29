# CODE CHANGES REQUIRED FOR ROLE SIMPLIFICATION

## 1. backend/src/middleware/requireRole.js

CHANGE THIS:
---
const ROLE_ORDER = ['viewer', 'operator', 'admin', 'owner'];
---

TO THIS:
---
const ROLE_ORDER = ['user', 'admin'];
---

ALSO CHANGE (around line 32):
---
const { data, error } = await supabaseAdmin
  .from('memberships')
  .select('role')
  .eq('wa_account_id', waAccountId)  // <-- BUG: memberships doesn't have wa_account_id
  .eq('user_id', req.auth.user.id)
  .maybeSingle();
---

TO THIS:
---
// First get the org_id from the whatsapp account
const { data: waAccount, error: waError } = await supabaseAdmin
  .from('whatsapp_accounts')
  .select('org_id')
  .eq('id', waAccountId)
  .maybeSingle();

if (waError || !waAccount) {
  return res.status(400).json({ error: 'WhatsApp account not found' });
}

// Then check membership using org_id
const { data, error } = await supabaseAdmin
  .from('memberships')
  .select('role')
  .eq('org_id', waAccount.org_id)
  .eq('user_id', req.auth.user.id)
  .maybeSingle();
---

## 2. backend/src/index.js

All of these role checks need to be updated:

CHANGE LINE 293:
app.post('/api/whatsapp-accounts', requireAuth, requireRole(['owner', 'admin']), async (req, res) => {

TO:
app.post('/api/whatsapp-accounts', requireAuth, requireRole(['admin']), async (req, res) => {

---

CHANGE LINE 339:
app.post('/api/whatsapp-accounts/:accountId/disconnect', requireAuth, requireRole(['owner', 'admin']), async (req, res) => {

TO:
app.post('/api/whatsapp-accounts/:accountId/disconnect', requireAuth, requireRole(['admin']), async (req, res) => {

---

CHANGE LINE 376:
app.post('/kb/add-text', requireAuth, requireRole(['owner', 'admin']), async (req, res) => {

TO:
app.post('/kb/add-text', requireAuth, requireRole(['admin']), async (req, res) => {

---

CHANGE LINE 420:
app.post('/kb/upload-pdf', requireAuth, requireRole(['owner', 'admin']), upload.single('file'), async (req, res) => {

TO:
app.post('/kb/upload-pdf', requireAuth, requireRole(['admin']), upload.single('file'), async (req, res) => {

---

## 3. frontend/src/lib/auth-helpers.ts

CHANGE LINE 7:
export type UserRole = "owner" | "admin" | "operator" | "viewer";

TO:
export type UserRole = "admin" | "user";

---

## 4. frontend/src/lib/types.ts

CHANGE LINE 19:
export type WaRole = "owner" | "admin" | "operator" | "viewer";

TO:
export type WaRole = "admin" | "user";

---

## 5. frontend/src/app/users/page.tsx

CHANGE LINE 30:
const roles: OrgUser["role"][] = ["owner", "admin", "agent", "viewer"];

TO:
const roles: OrgUser["role"][] = ["admin", "user"];

---

## 6. frontend/src/app/api/bootstrap/route.ts

CHANGE LINE 213 (inside the memberships.insert call):
role: "owner",

TO:
role: "admin",

---

## 7. frontend/src/components/users/RoleBadge.tsx

This file contains role styling. Find the role mapping and UPDATE it to:
- "admin" → "Administrator" (keep same styling as admin uses)
- "user" → "User" 

Remove cases for "owner", "operator", "viewer"

---

## 8. frontend/src/components/users/UserActionsMenu.tsx

CHANGE the role options array (around line 47):
["owner", "admin", "agent", "viewer"]

TO:
["admin", "user"]

---

## 9. frontend/src/components/users/InviteUserModal.tsx

CHANGE the role dropdown options (around line 141):
["owner", "admin", "agent", "viewer"]

TO:
["admin", "user"]

---

## 10. backend/supabase_SQL_queries.md

Update the enum definition documentation:

CHANGE THIS:
create type public.user_role as enum ('owner', 'admin', 'operator', 'viewer');

TO THIS:
create type public.user_role as enum ('admin', 'user');

---

CHANGE the default role in memberships:
role public.user_role not null default 'operator',

TO:
role public.user_role not null default 'user',

---

ADD a UNIQUE constraint to whatsapp_accounts:

create table public.whatsapp_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  display_name text not null,
  phone_number text,
  status public.wa_status not null default 'pending_qr',
  last_qr_at timestamptz,
  last_connected_at timestamptz,
  notes text,
  created_at timestamptz default now(),
  unique(org_id)  <-- ADD THIS LINE
);
