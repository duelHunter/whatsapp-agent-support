# WhatsApp Account Management System

## Overview

This system manages WhatsApp account records in the database, tracking their lifecycle states and providing API endpoints for account management.

## Architecture

### Database Table: `whatsapp_accounts`

```sql
create type public.wa_status as enum ('connected', 'disconnected', 'pending_qr', 'error');

create table public.whatsapp_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  display_name text not null,
  phone_number text,
  status public.wa_status not null default 'pending_qr',
  last_qr_at timestamptz,
  last_connected_at timestamptz,
  notes text,
  created_at timestamptz default now()
);
```

### Status Lifecycle

```
pending_qr → connected → disconnected
     ↓            ↓
   error ←────────┘
```

#### Status Meanings

| Status | Description | When It Happens |
|--------|-------------|-----------------|
| `pending_qr` | Waiting for QR code scan | Initial creation, QR generated |
| `connected` | Active WhatsApp connection | QR scanned successfully, client ready |
| `disconnected` | Connection lost | Client disconnected, logout |
| `error` | Authentication/connection error | Auth failure, client error |

## Implementation

### 1. Service Module (`services/whatsappAccountService.js`)

Core functions for managing WhatsApp accounts:

#### `createWhatsAppAccount({ orgId, displayName, notes })`
Creates a new WhatsApp account record before QR generation.

**Parameters:**
- `orgId` (string, required) - Organization UUID
- `displayName` (string, optional) - Human-readable name (default: "WhatsApp Bot")
- `notes` (string, optional) - Additional notes

**Returns:** Account object or null on error

**Example:**
```javascript
const account = await createWhatsAppAccount({
    orgId: 'org-uuid-here',
    displayName: 'Customer Support Bot',
    notes: 'Main support account'
});
```

#### `updateWhatsAppStatus({ accountId, status, phoneNumber, displayName, errorMessage })`
Updates account status and metadata during lifecycle events.

**Parameters:**
- `accountId` (string, required) - WhatsApp account UUID
- `status` (string, required) - One of: 'connected', 'disconnected', 'pending_qr', 'error'
- `phoneNumber` (string, optional) - WhatsApp phone number
- `displayName` (string, optional) - Display name from WhatsApp
- `errorMessage` (string, optional) - Error details if status is 'error'

**Returns:** Updated account or null on error

**Example:**
```javascript
await updateWhatsAppStatus({
    accountId: 'account-uuid',
    status: 'connected',
    phoneNumber: '1234567890',
    displayName: 'My Business'
});
```

#### `getWhatsAppAccountsByOrg(orgId, connectedOnly)`
Gets all WhatsApp accounts for an organization.

**Parameters:**
- `orgId` (string, required) - Organization UUID
- `connectedOnly` (boolean, optional) - If true, only return connected accounts

**Returns:** Array of accounts or null on error

#### `getWhatsAppAccountById(accountId)`
Gets a single WhatsApp account by ID.

**Returns:** Account object or null

#### `getFirstWhatsAppAccount()`
Gets the first available WhatsApp account (useful for single-account setups).

**Returns:** Account object or null

#### `disconnectWhatsAppAccount(accountId)`
Soft-deletes an account by setting status to 'disconnected'.

**Returns:** Boolean (true if successful)

#### `getWhatsAppAccountStats(accountId)`
Gets statistics for a WhatsApp account (messages, conversations, contacts).

**Returns:** Statistics object or null

**Example Response:**
```javascript
{
    account_id: 'uuid',
    status: 'connected',
    phone_number: '1234567890',
    display_name: 'My Bot',
    total_conversations: 150,
    total_messages: 2340,
    total_contacts: 145,
    last_connected_at: '2025-12-26T10:30:00Z',
    created_at: '2025-12-20T08:00:00Z'
}
```

### 2. Integration with WhatsApp Service (`services/waService.js`)

The WhatsApp service automatically updates account status during lifecycle events:

#### Event: `qr`
**Trigger:** QR code needs to be scanned  
**Action:** Set status to `pending_qr`, update `last_qr_at`  
**Database Update:** Yes (non-blocking)

```javascript
this.client.on('qr', async (qr) => {
    // ... QR generation code ...
    await this.updateAccountStatus('pending_qr');
});
```

#### Event: `ready`
**Trigger:** WhatsApp client is fully authenticated and ready  
**Action:** Set status to `connected`, update `last_connected_at`, fetch phone number  
**Database Update:** Yes (non-blocking)

```javascript
this.client.on('ready', async () => {
    await this.updateAccountStatus('connected');
    await this.updateAccountPhoneNumber();
});
```

#### Event: `auth_failure`
**Trigger:** Authentication failed  
**Action:** Set status to `error`, store error message  
**Database Update:** Yes (non-blocking)

```javascript
this.client.on('auth_failure', async (msg) => {
    await this.updateAccountStatus('error', String(msg));
});
```

#### Event: `disconnected`
**Trigger:** Connection lost  
**Action:** Set status to `disconnected`  
**Database Update:** Yes (non-blocking)

```javascript
this.client.on('disconnected', async (reason) => {
    await this.updateAccountStatus('disconnected');
});
```

#### Event: `error`
**Trigger:** General client error  
**Action:** Set status to `error`, store error message  
**Database Update:** Yes (non-blocking, with extra error handling)

```javascript
this.client.on('error', async (error) => {
    await this.updateAccountStatus('error', error.message).catch(err => {
        console.warn('⚠️ Could not update error status:', err.message);
    });
});
```

### 3. Error Handling Philosophy

**Critical Rule:** WhatsApp connection errors MUST NOT crash the application.

#### Implementation
- All database operations wrapped in try/catch
- Failed updates are logged but don't stop WhatsApp runtime
- Non-blocking updates: don't await status changes during critical paths
- Graceful degradation: app continues even if database is down

**Example:**
```javascript
// Non-blocking status update
await this.updateAccountStatus('connected').catch(err => {
    console.warn('⚠️ Could not update status:', err.message);
    // WhatsApp continues working even if DB update fails
});
```

## API Endpoints

### GET `/api/whatsapp-accounts`
List all WhatsApp accounts for user's organization.

**Authentication:** Required  
**Authorization:** Any authenticated user in organization  

**Response:**
```json
{
  "ok": true,
  "accounts": [
    {
      "id": "uuid",
      "org_id": "org-uuid",
      "display_name": "Support Bot",
      "phone_number": "1234567890",
      "status": "connected",
      "last_connected_at": "2025-12-26T10:30:00Z",
      "created_at": "2025-12-20T08:00:00Z"
    }
  ]
}
```

### GET `/api/whatsapp-accounts/:accountId`
Get details for a specific WhatsApp account.

**Authentication:** Required  
**Authorization:** User must be in same organization as account  

**Response:**
```json
{
  "ok": true,
  "account": {
    "id": "uuid",
    "org_id": "org-uuid",
    "display_name": "Support Bot",
    "phone_number": "1234567890",
    "status": "connected",
    "last_qr_at": "2025-12-25T14:20:00Z",
    "last_connected_at": "2025-12-26T10:30:00Z",
    "notes": "Main customer support account",
    "created_at": "2025-12-20T08:00:00Z"
  }
}
```

### GET `/api/whatsapp-accounts/:accountId/stats`
Get statistics for a WhatsApp account.

**Authentication:** Required  
**Authorization:** User must be in same organization as account  

**Response:**
```json
{
  "ok": true,
  "stats": {
    "account_id": "uuid",
    "status": "connected",
    "phone_number": "1234567890",
    "display_name": "Support Bot",
    "total_conversations": 150,
    "total_messages": 2340,
    "total_contacts": 145,
    "last_connected_at": "2025-12-26T10:30:00Z",
    "created_at": "2025-12-20T08:00:00Z"
  }
}
```

### POST `/api/whatsapp-accounts`
Create a new WhatsApp account.

**Authentication:** Required  
**Authorization:** Owner or Admin role only  

**Request Body:**
```json
{
  "display_name": "New Support Bot",
  "notes": "For handling customer inquiries"
}
```

**Response:**
```json
{
  "ok": true,
  "account": {
    "id": "new-uuid",
    "org_id": "org-uuid",
    "display_name": "New Support Bot",
    "phone_number": null,
    "status": "pending_qr",
    "notes": "For handling customer inquiries",
    "created_at": "2025-12-26T12:00:00Z"
  }
}
```

### POST `/api/whatsapp-accounts/:accountId/disconnect`
Disconnect a WhatsApp account (soft delete).

**Authentication:** Required  
**Authorization:** Owner or Admin role only  

**Response:**
```json
{
  "ok": true,
  "message": "Account disconnected successfully"
}
```

## Usage Examples

### Frontend: List Accounts

```javascript
const response = await fetch('http://localhost:4000/api/whatsapp-accounts', {
    headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
    }
});

const { accounts } = await response.json();
console.log('WhatsApp Accounts:', accounts);
```

### Frontend: Create Account

```javascript
const response = await fetch('http://localhost:4000/api/whatsapp-accounts', {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        display_name: 'Sales Bot',
        notes: 'For sales inquiries'
    })
});

const { account } = await response.json();
console.log('Created account:', account.id);
```

### Frontend: Get Account Stats

```javascript
const response = await fetch(`http://localhost:4000/api/whatsapp-accounts/${accountId}/stats`, {
    headers: {
        'Authorization': `Bearer ${accessToken}`
    }
});

const { stats } = await response.json();
console.log(`Total messages: ${stats.total_messages}`);
console.log(`Total conversations: ${stats.total_conversations}`);
```

### Backend: Programmatic Access

```javascript
const { 
    createWhatsAppAccount,
    getWhatsAppAccountsByOrg,
    updateWhatsAppStatus 
} = require('./services/whatsappAccountService');

// Create account
const account = await createWhatsAppAccount({
    orgId: 'my-org-id',
    displayName: 'Automated Bot',
    notes: 'Created via automation'
});

// List accounts
const accounts = await getWhatsAppAccountsByOrg('my-org-id');

// Update status
await updateWhatsAppStatus({
    accountId: account.id,
    status: 'connected',
    phoneNumber: '9876543210'
});
```

## Setup & Configuration

### 1. Database Setup

Ensure the `whatsapp_accounts` table is created in Supabase:

```sql
-- Create enum type
create type public.wa_status as enum ('connected', 'disconnected', 'pending_qr', 'error');

-- Create table
create table public.whatsapp_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  display_name text not null,
  phone_number text,
  status public.wa_status not null default 'pending_qr',
  last_qr_at timestamptz,
  last_connected_at timestamptz,
  notes text,
  created_at timestamptz default now()
);

-- Enable RLS (optional for production)
alter table public.whatsapp_accounts enable row level security;
```

### 2. Create Initial Account

Before starting the WhatsApp service, create at least one account:

```sql
INSERT INTO public.whatsapp_accounts (org_id, display_name, status)
VALUES ('your-org-uuid', 'Main WhatsApp Bot', 'pending_qr');
```

Or via API (requires authentication):

```bash
curl -X POST http://localhost:4000/api/whatsapp-accounts \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"display_name": "Main Bot", "notes": "Primary account"}'
```

### 3. Start Backend

The backend will automatically:
1. Load the first available WhatsApp account
2. Set organization/account context
3. Update status as WhatsApp client connects

```bash
cd backend
npm start
```

**Console Output:**
```
📋 Loaded WhatsApp account: Main WhatsApp Bot (not connected)
📲 Scan this QR code with your WhatsApp:
✅ WhatsApp client is ready
✅ Updated account info: My Business (1234567890)
```

## Monitoring & Debugging

### Check Account Status

```sql
SELECT 
    id,
    display_name,
    phone_number,
    status,
    last_connected_at,
    created_at
FROM whatsapp_accounts
ORDER BY created_at DESC;
```

### Monitor Status Changes

```sql
-- Add trigger to log status changes (optional)
CREATE TABLE whatsapp_account_status_log (
    id uuid primary key default gen_random_uuid(),
    account_id uuid references whatsapp_accounts(id),
    old_status wa_status,
    new_status wa_status,
    changed_at timestamptz default now()
);
```

### Console Logs

Look for these status update logs:

```
📱 Updating WhatsApp account <uuid> to status: pending_qr
✅ WhatsApp account status updated: pending_qr

📱 Updating WhatsApp account <uuid> to status: connected
✅ WhatsApp account status updated: connected
✅ Updated account info: Business Name (1234567890)

📱 Updating WhatsApp account <uuid> to status: disconnected
✅ WhatsApp account status updated: disconnected
```

## Production Considerations

### 1. Multiple Accounts

Currently, the system loads the first available account. For multi-account deployments:

```javascript
// Option 1: Environment variable
const accountId = process.env.WHATSAPP_ACCOUNT_ID;

// Option 2: Configuration file
const config = require('./config.json');
const accountId = config.whatsappAccountId;

// Option 3: Command-line argument
const accountId = process.argv[2];

// Then load specific account
const account = await getWhatsAppAccountById(accountId);
waService.setContext(account.org_id, account.id);
```

### 2. High Availability

For production:
- Run multiple backend instances (one per WhatsApp account)
- Use process managers (PM2, systemd) to auto-restart
- Monitor `last_connected_at` for accounts going stale
- Alert on status changes to 'error' or 'disconnected'

### 3. Security

- Enable RLS on `whatsapp_accounts` table in production
- Use service role key only in backend (never expose to frontend)
- Audit account creation/deletion actions
- Rotate Supabase keys periodically

### 4. Backup & Recovery

```sql
-- Backup account data
COPY (SELECT * FROM whatsapp_accounts) TO '/tmp/wa_accounts_backup.csv' CSV HEADER;

-- Restore account (after data loss)
INSERT INTO whatsapp_accounts 
VALUES (backed_up_values);

-- Then restart WhatsApp service to reconnect
```

## Troubleshooting

### Account Stuck in `pending_qr`

**Cause:** QR code expired or not scanned  
**Solution:** Restart backend to generate new QR

### Account Shows `error` Status

**Cause:** Authentication failed  
**Solution:** Check notes field for error details, logout and re-scan QR

### No Account Found on Startup

**Cause:** No accounts in database  
**Solution:** Create account via SQL or API before starting backend

### Status Not Updating

**Cause:** Database connection issue or RLS blocking updates  
**Solution:** 
1. Check Supabase connection
2. Verify service role key is used (bypasses RLS)
3. Check console logs for database errors

### Phone Number Not Populated

**Cause:** Client info not available when status updated  
**Solution:** Normal - phone number updates on 'ready' event, may take a few seconds

## Future Enhancements

- [ ] Account rotation (switch between multiple accounts)
- [ ] Health checks (ping accounts periodically)
- [ ] Auto-reconnect on disconnect
- [ ] Account usage quotas/limits
- [ ] Webhook notifications on status changes
- [ ] Account clustering (load balancing)

---

**Last Updated:** December 2025  
**Version:** 1.0.0  
**Status:** Production Ready


