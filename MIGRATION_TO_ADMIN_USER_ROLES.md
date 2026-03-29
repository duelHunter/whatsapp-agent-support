# Migration: Simplify to Admin & User Roles

This document outlines all changes needed to reduce user roles from 4 (owner, admin, operator, viewer) to 2 (admin, user).

## 1. SQL MIGRATION - Execute in Supabase Console

\\\sql
-- Step 1: Drop dependent objects
ALTER TABLE public.memberships DROP CONSTRAINT IF EXISTS memberships_role_check;

-- Step 2: Create new enum type
CREATE TYPE public.user_role_new AS ENUM ('admin', 'user');

-- Step 3: Convert existing data in memberships table
ALTER TABLE public.memberships 
ALTER COLUMN role TYPE text;

UPDATE public.memberships
SET role = CASE 
  WHEN role::text IN ('owner', 'admin') THEN 'admin'
  WHEN role::text IN ('operator', 'viewer') THEN 'user'
  ELSE 'user'
END;

-- Step 4: Change column back to new enum
ALTER TABLE public.memberships
ALTER COLUMN role TYPE public.user_role_new
USING role::public.user_role_new;

-- Step 5: Drop old enum
DROP TYPE public.user_role;

-- Step 6: Rename new enum to original name
ALTER TYPE public.user_role_new RENAME TO user_role;

-- Step 7: Add unique constraint to whatsapp_accounts (1 per organization)
ALTER TABLE public.whatsapp_accounts
ADD CONSTRAINT whatsapp_accounts_org_id_unique UNIQUE(org_id);

-- Step 8: Update default membership role to 'user'
ALTER TABLE public.memberships
ALTER COLUMN role SET DEFAULT 'user';
\\\

## 2. Backend File Changes

See the generated SQL file: backend/ROLE_MIGRATION_SQL.sql

## 3. Files to Update

- backend/src/middleware/requireRole.js
- backend/src/index.js  
- frontend/src/lib/auth-helpers.ts
- frontend/src/lib/types.ts
- frontend/src/app/users/page.tsx
- frontend/src/components/users/RoleBadge.tsx
- frontend/src/components/users/UserActionsMenu.tsx
- frontend/src/components/users/InviteUserModal.tsx
- frontend/src/app/api/bootstrap/route.ts
- backend/supabase_SQL_queries.md (update documentation)
