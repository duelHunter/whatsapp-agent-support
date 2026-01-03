# Dashboard Stats Testing Guide

## What Was Implemented

The dashboard now shows **real message count and active user count** from the `/api/whatsapp-accounts/:accountId/stats` API endpoint.

## Changes Made

### 1. **Updated `frontend/src/app/page.tsx`**
- ✅ Added imports for `backendGet` and `WhatsAppAccountStatsResponse`
- ✅ Added state for `accountStats` and `statsLoading`
- ✅ Added `fetchAccountStats()` function to call the API
- ✅ Updated summary cards to display real data:
  - **Messages**: Shows `total_messages` from API
  - **Active Users**: Shows `total_contacts` from API
- ✅ Added loading indicators and refresh functionality
- ✅ Added listeners for account selection changes

### 2. **API Integration**
The dashboard now uses `/api/whatsapp-accounts/:accountId/stats` which returns:

```json
{
  "ok": true,
  "stats": {
    "total_messages": 2340,
    "total_contacts": 145,
    "total_conversations": 150
  }
}
```

## Features

### **Real-Time Stats Display**
- ✅ Shows actual message count instead of placeholder "—"
- ✅ Shows actual active user count instead of placeholder "—"
- ✅ Updates automatically when account selection changes
- ✅ Manual refresh button for latest data

### **Loading States**
- ✅ Shows "Loading..." while fetching stats
- ✅ Shows spinner animation during API calls
- ✅ Shows "No account selected" when no account is chosen

### **Error Handling**
- ✅ Gracefully handles API failures
- ✅ Shows fallback messages when stats unavailable
- ✅ Console logging for debugging

## How to Test

### Step 1: Start Backend & Frontend

```bash
# Terminal 1 - Backend
cd backend
npm start

# Terminal 2 - Frontend
cd frontend
npm run dev
```

### Step 2: Select a WhatsApp Account

1. Go to `http://localhost:3000/accounts`
2. Select an account that has messages
3. The selection will persist to localStorage

### Step 3: Check Dashboard Stats

1. Navigate to `http://localhost:3000` (dashboard)
2. Look at the "Messages" and "Active Users" cards
3. They should now show real numbers instead of "—"

### Step 4: Test Refresh

1. Click the "↻ Refresh" button under each stat card
2. See loading spinner and updated numbers
3. Verify stats match your database

## Expected Behavior

### **With Selected Account**
```
┌─────────────────────┐
│ Messages            │
│ 2,340              │
│ Total processed     │
│ ↻ Refresh           │
└─────────────────────┘
```

### **With No Account Selected**
```
┌─────────────────────┐
│ Messages            │
│ —                   │
│ Total processed     │
│ No account selected │
└─────────────────────┘
```

### **During Loading**
```
┌─────────────────────┐
│ Messages            │
│ Loading...          │
│ Total processed     │
│ ⟳ Loading...        │
└─────────────────────┘
```

## API Calls Made

### **On Page Load**
```
GET /api/whatsapp-accounts/{accountId}/stats
Authorization: Bearer {token}
```

### **On Account Change**
```
GET /api/whatsapp-accounts/{newAccountId}/stats
Authorization: Bearer {token}
```

### **On Manual Refresh**
```
GET /api/whatsapp-accounts/{accountId}/stats
Authorization: Bearer {token}
```

## Troubleshooting

### **"No account selected"**
**Problem:** No WhatsApp account selected in `/accounts` page
**Solution:** Go to accounts page and select an account

### **"—" values showing**
**Problem:** Stats failed to load
**Solution:**
1. Check browser console for errors
2. Verify backend is running on port 4000
3. Check that selected account has messages in database

### **Stats not updating**
**Problem:** Stats not refreshing after account change
**Solution:** Manual refresh button or page reload

### **API 404/403 errors**
**Problem:** Authentication or authorization issues
**Solution:**
1. Check user is logged in
2. Verify user has access to the selected account
3. Check backend logs for auth errors

## Database Verification

### Check Stats Manually

```sql
-- Get total messages for an account
SELECT COUNT(*) as total_messages
FROM messages
WHERE wa_account_id = 'your-account-id';

-- Get total contacts for an account
SELECT COUNT(*) as total_contacts
FROM contacts
WHERE wa_account_id = 'your-account-id';
```

### API Response Format

The stats endpoint returns:

```json
{
  "ok": true,
  "stats": {
    "account_id": "uuid",
    "total_messages": 2340,
    "total_contacts": 145,
    "total_conversations": 150,
    "status": "connected",
    "phone_number": "1234567890"
  }
}
```

## Browser Console Testing

### Test API Directly

Open browser console and test the API:

```javascript
// Get auth token (you'll need to be logged in)
const token = 'YOUR_JWT_TOKEN_HERE';

// Get account ID from localStorage
const accountId = localStorage.getItem('wa_account_id');

// Test the stats API
fetch(`http://localhost:4000/api/whatsapp-accounts/${accountId}/stats`, {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
.then(r => r.json())
.then(console.log);
```

## Performance Notes

- ✅ Stats are cached in component state
- ✅ API calls only happen on account change or manual refresh
- ✅ Non-blocking - doesn't affect page load
- ✅ Error resilient - shows fallbacks on API failures

## Future Enhancements

- **Real-time updates**: Auto-refresh stats every few minutes
- **Historical data**: Show trends over time
- **More metrics**: Response times, AI usage stats
- **Account switching**: Quick account selector in dashboard

---

**Testing Status:** ✅ Ready for Manual Testing
**API Endpoint:** `/api/whatsapp-accounts/:accountId/stats`
**Data Source:** Supabase database (messages, contacts tables)
**Update Frequency:** On account change + manual refresh

**Success Criteria:**
- [ ] Dashboard shows real message count
- [ ] Dashboard shows real active user count
- [ ] Stats update when account changes
- [ ] Manual refresh works
- [ ] Loading states work correctly
- [ ] Error handling works (no account selected)

