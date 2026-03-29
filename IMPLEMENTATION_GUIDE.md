# ROLE SIMPLIFICATION MIGRATION - IMPLEMENTATION SUMMARY

## Status: ✓ READY FOR IMPLEMENTATION

This is a comprehensive migration to simplify your WhatsApp AI Bot project from 4 user roles to 2 roles (admin, user) with a single WhatsApp number per organization.

## 📁 Files Generated

1. **backend/MIGRATION_001_ROLE_SIMPLIFICATION.sql**
   - SQL migration script for Supabase
   - Maps existing roles: owner→admin, admin→admin, operator→user, viewer→user
   - Adds UNIQUE constraint on whatsapp_accounts(org_id)

2. **CODE_CHANGES_REQUIRED.md**
   - Detailed line-by-line changes for all 10 files
   - Copy-paste ready code snippets

## 📋 Implementation Checklist

### Phase 1: Database Migration (Execute in Supabase Console)
- [ ] Go to Supabase SQL Editor
- [ ] Copy and paste entire contents of: **backend/MIGRATION_001_ROLE_SIMPLIFICATION.sql**
- [ ] Execute the migration
- [ ] Verify no errors occurred

### Phase 2: Backend Updates (10 file changes)

**Files to Update:**
1. [ ] backend/src/middleware/requireRole.js
   - Update ROLE_ORDER (1 change)
   - Fix membership query bug (1 major fix - adds org_id lookup)

2. [ ] backend/src/index.js
   - Update 4 API endpoints role checks (lines 293, 339, 376, 420)

3. [ ] backend/supabase_SQL_queries.md
   - Update enum documentation
   - Update default role
   - Add unique constraint documentation

### Phase 3: Frontend Updates (7 file changes)

**Files to Update:**
4. [ ] frontend/src/lib/auth-helpers.ts - Update UserRole type (line 7)
5. [ ] frontend/src/lib/types.ts - Update WaRole type (line 19)
6. [ ] frontend/src/app/users/page.tsx - Update mock roles (line 30)
7. [ ] frontend/src/app/api/bootstrap/route.ts - Default to 'admin' (line 213)
8. [ ] frontend/src/components/users/RoleBadge.tsx - Update role styling
9. [ ] frontend/src/components/users/UserActionsMenu.tsx - Update role options
10. [ ] frontend/src/components/users/InviteUserModal.tsx - Update dropdown

## 🔄 Role Mapping

| Old Role | New Role | Use Case |
|----------|----------|----------|
| owner | admin | Organization admin, can manage WhatsApp and KB |
| admin | admin | Admin capabilities (no change) |
| operator | user | Standard user, can only send/receive messages |
| viewer | user | Promoted to standard user with send capabilities |

## 🎯 Key Benefits

✓ Simpler role system (2 roles instead of 4)
✓ Clearer responsibilities (admin vs user)
✓ One WhatsApp number per organization (enforced)
✓ Reduced code complexity
✓ Less confusion for UI (users vs admin)
✓ Fixes bug in requireRole middleware (was querying wrong field)

## ⚠️ Important Notes

1. **No tables deleted** - All existing database tables remain. They're organized by org_id, not role.
2. **Data migration** - Existing roles are automatically mapped with the SQL migration
3. **Backward compatibility** - Old role references will cause errors until code is updated
4. **Test thoroughly** - After migration, test:
   - Admin can create/manage WhatsApp accounts
   - Users cannot create WhatsApp accounts
   - Organizations limited to 1 WhatsApp account (unique constraint enforced)
   - User invitations work with new role system
   - Bootstrap creates admins correctly

## 📝 Step-by-Step Implementation

### Step 1: Database Migration (1-2 minutes)
1. Open Supabase SQL Editor
2. Copy entire content from **backend/MIGRATION_001_ROLE_SIMPLIFICATION.sql**
3. Paste into editor
4. Click "Run"
5. Verify success (should see 8 operations completed)

### Step 2: Update Backend (10-15 minutes)
Use **CODE_CHANGES_REQUIRED.md** to update:
- backend/src/middleware/requireRole.js (1 + 1 changes)
- backend/src/index.js (4 changes across 4 endpoints)
- backend/supabase_SQL_queries.md (3 documentation changes)

### Step 3: Update Frontend (15-20 minutes)
Use **CODE_CHANGES_REQUIRED.md** to update:
- frontend/src/lib/auth-helpers.ts (1 type change)
- frontend/src/lib/types.ts (1 type change)
- frontend/src/app/users/page.tsx (1 array change)
- frontend/src/app/api/bootstrap/route.ts (1 string change)
- frontend/src/components/users/RoleBadge.tsx (update role cases)
- frontend/src/components/users/UserActionsMenu.tsx (1 array change)
- frontend/src/components/users/InviteUserModal.tsx (1 array change)

### Step 4: Test
- [ ] Restart both backend and frontend
- [ ] Login as admin
- [ ] Create new WhatsApp account
- [ ] Verify cannot add second WhatsApp account (unique constraint)
- [ ] Invite a user
- [ ] Verify user cannot create WhatsApp account
- [ ] Test knowledge base upload with admin
- [ ] Test that user cannot upload KB

## ❓ Questions?

Refer to **CODE_CHANGES_REQUIRED.md** for exact code changes for each file.

The structure and detailed instructions are ready. Use this guide and the generated files to implement the migration.
