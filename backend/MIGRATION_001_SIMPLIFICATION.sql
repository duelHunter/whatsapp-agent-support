-- MIGRATION_001_SIMPLIFICATION.sql
-- 1. Reduce roles: 'owner', 'admin', 'operator', 'viewer' to 'admin', 'user'
-- 2. Enforce one WhatsApp account per organization
-- 3. Merge wa_accounts fields into organizations, drop wa_accounts table

-- 1. Update user_role Enum (we create a new one, alter table, drop old)
CREATE TYPE public.user_role_new AS ENUM ('admin', 'user');

-- Update memberships existing roles: 'owner' -> 'admin', 'operator'/'viewer' -> 'user'
ALTER TABLE public.memberships ADD COLUMN role_new public.user_role_new DEFAULT 'user';
UPDATE public.memberships SET role_new = 'admin' WHERE role IN ('owner', 'admin');
UPDATE public.memberships SET role_new = 'user' WHERE role IN ('operator', 'viewer');

ALTER TABLE public.memberships DROP COLUMN role;
ALTER TABLE public.memberships RENAME COLUMN role_new TO role;

DROP TYPE public.user_role;
ALTER TYPE public.user_role_new RENAME TO user_role;

-- 2. Add WA fields to Organizations
-- Reusing existing wa_status enum for status
ALTER TABLE public.organizations 
ADD COLUMN phone_number text,
ADD COLUMN display_name text,
ADD COLUMN status public.wa_status DEFAULT 'disconnected',
ADD COLUMN last_qr_at timestamptz,
ADD COLUMN last_connected_at timestamptz,
ADD COLUMN notes text;

-- 3. Migrate data from whatsapp_accounts to organizations (one per org, picking the first one)
UPDATE public.organizations o
SET 
  display_name = wa.display_name,
  phone_number = wa.phone_number,
  status = wa.status,
  last_qr_at = wa.last_qr_at,
  last_connected_at = wa.last_connected_at,
  notes = wa.notes
FROM (
  SELECT DISTINCT ON (org_id) *
  FROM public.whatsapp_accounts
  ORDER BY org_id, created_at DESC
) wa
WHERE o.id = wa.org_id;

-- 4. Set fallback values for display_name
UPDATE public.organizations 
SET display_name = name 
WHERE display_name IS NULL;

-- 5. Under our new 1:1 relationship, we drop wa_account_id from all dependent tables
-- CASCADE will automatically drop the associated foreign key constraints without guessing their names
ALTER TABLE public.contacts DROP COLUMN wa_account_id CASCADE;
ALTER TABLE public.conversations DROP COLUMN wa_account_id CASCADE;
ALTER TABLE public.messages DROP COLUMN wa_account_id CASCADE;
ALTER TABLE public.kb_sources DROP COLUMN wa_account_id CASCADE;

-- 6. Drop whatsapp_accounts table
DROP TABLE public.whatsapp_accounts CASCADE;
