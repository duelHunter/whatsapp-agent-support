# WhatsApp Accounts Frontend - Testing Guide

## What Was Changed

The `/accounts` page has been completely updated to use the new backend API endpoints for WhatsApp account management.

## Files Modified

### 1. **`src/lib/types.ts`**
Added comprehensive types for WhatsApp accounts:
- ✅ `WaStatus` - Type for account status
- ✅ `WaAccount` - Updated with all new fields (status, phone_number, timestamps, etc.)
- ✅ `WaAccountStats` - Statistics data structure
- ✅ API response types for all endpoints

### 2. **`src/app/accounts/page.tsx`**
Complete rewrite to use backend API:
- ✅ Uses `backendGet()` instead of direct Supabase queries
- ✅ Displays account status with color-coded indicators
- ✅ Shows connection timestamps
- ✅ Displays statistics (messages, conversations, contacts)
- ✅ "Create Account" form with validation
- ✅ Auto-loads statistics when account is selected
- ✅ Modern card-based UI with dark mode support

## Features

### 1. **Account List View**
- Displays all WhatsApp accounts from backend API
- Shows real-time status with visual indicators:
  - 🟢 **Connected** - Green dot, active connection
  - 🟡 **Pending QR** - Amber dot, waiting for scan
  - ⚪ **Disconnected** - Gray dot, not connected
  - 🔴 **Error** - Red X, authentication failed

### 2. **Account Details**
Each account card shows:
- Display name
- Phone number (if connected)
- Current status
- Last connected timestamp
- QR generation time (if pending)
- Notes (if any)
- Statistics (messages, conversations, contacts)

### 3. **Create Account**
- Form to create new WhatsApp accounts
- Fields:
  - **Display Name** (required)
  - **Notes** (optional)
- Automatically reloads account list after creation
- Only visible to Owner/Admin roles (enforced by backend)

### 4. **Account Selection**
- Click "Select Account" to set active account
- Selected account used for all backend API calls
- Automatically loads statistics for selected account
- Visual indication of selected account (green highlight)

## How to Test

### Step 1: Start Backend

```bash
cd backend
npm start
```

Ensure you have at least one WhatsApp account in the database.

### Step 2: Start Frontend

```bash
cd frontend
npm run dev
```

### Step 3: Navigate to Accounts Page

Open your browser:
```
http://localhost:3000/accounts
```

### Step 4: Test Features

#### Test 1: View Accounts
- ✅ Accounts load from API
- ✅ Status indicators show correctly
- ✅ Connection times display
- ✅ Phone numbers show (if connected)

#### Test 2: Select Account
- ✅ Click "Select Account" button
- ✅ Card highlights in green
- ✅ Button changes to "✓ Selected"
- ✅ Statistics load automatically

#### Test 3: Create Account (Owner/Admin only)
- ✅ Click "+ Create Account" button
- ✅ Form appears
- ✅ Fill in display name (e.g., "Test Bot")
- ✅ Optionally add notes
- ✅ Click "Create Account"
- ✅ New account appears in list
- ✅ Form closes automatically

#### Test 4: Status Updates
- ✅ Backend updates account status
- ✅ Refresh page to see updated status
- ✅ Status colors change appropriately

## API Endpoints Used

### GET `/api/whatsapp-accounts`
Fetches all accounts for user's organization.

**Code:**
```typescript
const response = await backendGet<WhatsAppAccountsResponse>("/api/whatsapp-accounts");
```

### GET `/api/whatsapp-accounts/:accountId/stats`
Fetches statistics for a specific account.

**Code:**
```typescript
const response = await backendGet<WhatsAppAccountStatsResponse>(
  `/api/whatsapp-accounts/${accountId}/stats`
);
```

### POST `/api/whatsapp-accounts`
Creates a new WhatsApp account.

**Code:**
```typescript
await backendPostJson("/api/whatsapp-accounts", {
  display_name: "My Bot",
  notes: "Optional notes"
});
```

## Status Indicators

The UI uses color-coded status indicators:

| Status | Color | Icon | Meaning |
|--------|-------|------|---------|
| `connected` | Green | ● | Active WhatsApp connection |
| `pending_qr` | Amber | ◐ | Waiting for QR code scan |
| `disconnected` | Gray | ○ | Connection lost/logged out |
| `error` | Red | ✕ | Authentication or connection error |

## Expected Console Output

### On Page Load
```
GET /api/whatsapp-accounts → 200 OK
Response: { ok: true, accounts: [...] }
```

### On Account Selection
```
GET /api/whatsapp-accounts/{id}/stats → 200 OK
Response: { ok: true, stats: { total_messages: 150, ... } }
```

### On Account Creation
```
POST /api/whatsapp-accounts → 200 OK
Response: { ok: true, account: { id: "...", display_name: "...", ... } }
```

## Troubleshooting

### "Failed to load accounts"

**Cause:** Backend not running or API endpoint not accessible  
**Solution:**
1. Verify backend is running on port 4000
2. Check browser console for CORS errors
3. Verify `API_BASE` in `frontend/src/lib/api.ts` is correct

### "No accounts found"

**Cause:** No WhatsApp accounts in database  
**Solution:**
1. Use the "Create Account" button to add one
2. Or run SQL in Supabase:
```sql
INSERT INTO whatsapp_accounts (org_id, display_name, status)
VALUES ('your-org-id', 'Test Bot', 'pending_qr');
```

### Statistics not loading

**Cause:** Account stats endpoint failing  
**Solution:**
1. Check browser console for errors
2. Verify account has been selected
3. Check backend logs for database errors

### "Access denied" when creating account

**Cause:** User doesn't have Owner or Admin role  
**Solution:**
1. Update user role in Supabase:
```sql
UPDATE memberships 
SET role = 'admin' 
WHERE user_id = 'your-user-id';
```

## Browser Console Testing

Open browser console (F12) and test the API directly:

### Test 1: Fetch Accounts
```javascript
// Get auth token and make request
const token = await (await fetch('http://localhost:4000/api/whatsapp-accounts', {
  headers: {
    'Authorization': `Bearer YOUR_TOKEN_HERE`
  }
})).json();

console.log('Accounts:', token);
```

### Test 2: Create Account
```javascript
const response = await fetch('http://localhost:4000/api/whatsapp-accounts', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer YOUR_TOKEN_HERE`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    display_name: 'Console Test Bot',
    notes: 'Created from browser console'
  })
});

const result = await response.json();
console.log('Created:', result);
```

## UI Screenshots Reference

### Account Cards
```
┌─────────────────────────────────┐
│ Main WhatsApp Bot          [●connected]
│ 1234567890                       
│                                  
│ Last Connected: Dec 26, 10:30 AM
│                                  
│ ┌─────┬──────┬─────────┐        
│ │ 150 │  45  │   120   │        
│ │ Msg │ Chat │ Contact │        
│ └─────┴──────┴─────────┘        
│                                  
│ [✓ Selected Account]             
└─────────────────────────────────┘
```

### Create Form
```
┌─────────────────────────────────┐
│ Create New WhatsApp Account     │
│                                  │
│ Display Name *                   │
│ [Sales Bot____________]          │
│                                  │
│ Notes (Optional)                 │
│ [For sales team_______]          │
│ [                     ]          │
│                                  │
│ [Create Account]                 │
└─────────────────────────────────┘
```

## Next Steps

After testing the accounts page, you can:

1. **Build Account Dashboard** - Detailed view for single account
2. **Add Refresh Button** - Auto-refresh account status
3. **Add Disconnect Action** - Button to disconnect accounts
4. **Add Real-time Updates** - WebSocket for live status changes
5. **Add QR Code Display** - Show QR code for pending accounts

## Success Criteria

✅ Page loads without errors  
✅ Accounts display from API  
✅ Status indicators show correctly  
✅ Statistics load when account selected  
✅ Create account form works  
✅ Account selection persists  
✅ UI is responsive and looks good  

---

**Last Updated:** December 2025  
**Status:** ✅ Ready for Testing  
**Browser Support:** Chrome, Firefox, Safari, Edge


