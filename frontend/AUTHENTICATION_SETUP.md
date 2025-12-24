# Authentication & Authorization Setup Guide

This document describes the complete authentication and authorization system implemented for the WhatsApp AI Bot SaaS application.

## 📁 Files Created/Modified

### New Files Created:
1. **`src/lib/supabaseAdmin.ts`** - Server-only admin client using service role key
2. **`src/lib/auth-helpers.ts`** - Server-side auth/authorization helpers
3. **`src/app/api/bootstrap/route.ts`** - API endpoint for bootstrapping new user accounts
4. **`backend/supabase_RLS_policies.sql`** - Complete RLS policies for all tables

### Modified Files:
1. **`src/app/signup/page.tsx`** - Simplified to call bootstrap endpoint
2. **`src/app/login/page.tsx`** - Removed manual cookie handling
3. **`middleware.ts`** - Updated to use Supabase SSR approach

## 🔧 Environment Variables Required

### Frontend (.env.local):
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key  # Server-only, never expose to client
```

### Backend (.env):
```env
# Backend doesn't need Supabase env vars for auth (handled by frontend)
# But if you need to verify tokens, add:
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## 🗄️ Database Setup

1. **Run the RLS policies SQL:**
   - Open Supabase SQL Editor
   - Copy and paste the contents of `backend/supabase_RLS_policies.sql`
   - Execute the script

2. **Verify tables exist:**
   - `organizations` (id, name, slug, created_at)
   - `profiles` (id, full_name, avatar_url, default_org_id, created_at)
   - `memberships` (id, org_id, user_id, role, created_at)

## 🔐 Authentication Flow

### Signup Flow:
1. User submits email/password on `/signup`
2. `supabaseClient.auth.signUp()` creates auth user
3. If session is available, frontend calls `POST /api/bootstrap`
4. Bootstrap endpoint (server-side):
   - Verifies user is authenticated
   - Checks if already bootstrapped (idempotent)
   - Creates organization with unique slug
   - Creates profile linked to user
   - Creates membership with role="owner"
5. User is redirected to `/` (dashboard)

### Login Flow:
1. User submits email/password on `/login`
2. `supabaseClient.auth.signInWithPassword()` authenticates
3. Session is automatically stored by Supabase client
4. Middleware verifies session on protected routes
5. User is redirected to `/` (dashboard)

## 🛡️ Authorization Model

### Roles:
- **owner**: Full control, can delete org, manage members
- **admin**: Can manage settings, KB, members (except delete org)
- **operator**: Can view conversations, trigger bot actions
- **viewer**: Read-only access to analytics/conversations

### Server-Side Helpers:

```typescript
// Get current authenticated user
const user = await getCurrentUser();

// Get user's active organization
const org = await getCurrentOrg();

// Get user's membership for an org
const membership = await getUserMembership(orgId);

// Require authentication (redirects if not authenticated)
const user = await requireAuth();

// Require specific role(s)
const membership = await requireRole(orgId, ['owner', 'admin']);

// Check if user has role (returns boolean)
const hasAccess = await hasRole(orgId, ['owner', 'admin']);
```

### Usage in API Routes:

```typescript
// app/api/example/route.ts
import { requireAuth, requireRole } from "@/lib/auth-helpers";

export async function POST(req: NextRequest) {
  const user = await requireAuth(); // Throws/redirects if not authenticated
  
  const { orgId } = await req.json();
  const membership = await requireRole(orgId, ['owner', 'admin']); // Throws if not authorized
  
  // Proceed with authorized operation
}
```

## 🔒 Middleware Protection

The middleware (`middleware.ts`) automatically:
- Allows public routes: `/login`, `/signup`, `/_next/*`, `/api/*`
- Redirects unauthenticated users to `/login` for protected routes
- Redirects authenticated users away from `/login` and `/signup` to `/`
- Refreshes expired sessions automatically

## 📝 Bootstrap Endpoint Details

**Endpoint:** `POST /api/bootstrap`

**Authentication:** Requires valid Supabase session token (Bearer token or cookie)

**Functionality:**
- Idempotent: Safe to call multiple times
- Creates organization, profile, and membership if they don't exist
- Returns: `{ ok: true, orgId: string, role: string }`

**Error Handling:**
- 401: Not authenticated
- 500: Database operation failed (with cleanup)

## 🚨 Security Notes

1. **Service Role Key:**
   - `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS
   - Only use in server-side code (never expose to client)
   - Used by bootstrap endpoint and admin operations

2. **RLS Policies:**
   - All tables have RLS enabled
   - Policies enforce organization-scoped access
   - Server-side `requireRole()` provides additional authorization layer

3. **Session Management:**
   - Supabase client automatically handles session storage
   - Middleware refreshes expired sessions
   - No manual cookie manipulation needed

## 🧪 Testing

### Test Signup:
1. Navigate to `/signup`
2. Enter email and password
3. Should create user, org, profile, and membership
4. Should redirect to `/`

### Test Login:
1. Navigate to `/login`
2. Enter credentials
3. Should authenticate and redirect to `/`

### Test Bootstrap Idempotency:
1. Call `POST /api/bootstrap` multiple times
2. Should return same orgId without creating duplicates

### Test Authorization:
1. Try accessing protected routes without auth → should redirect to `/login`
2. Try accessing `/login` while authenticated → should redirect to `/`

## 📚 Additional Resources

- [Supabase Auth Docs](https://supabase.com/docs/guides/auth)
- [Supabase RLS Docs](https://supabase.com/docs/guides/auth/row-level-security)
- [Next.js Middleware](https://nextjs.org/docs/app/building-your-application/routing/middleware)


