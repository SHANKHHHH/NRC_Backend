# Automatic PurchaseOrder Sequence Synchronization

## Problem
When Purchase Orders are created through two different methods:
1. **Form submission** (via API endpoint) - Uses Prisma with auto-increment
2. **Excel bulk upload** (via Supabase) - Manually assigns IDs

The PostgreSQL auto-increment sequence can get out of sync, causing errors:
```
Unique constraint failed on the fields: (`id`)
```

## Solution: Multi-Layer Approach

We've implemented **three layers** of protection to ensure the sequence always stays synchronized:

### 1. Database Trigger (Primary Solution) ✅
A PostgreSQL trigger automatically syncs the sequence after ANY INSERT operation.

**Migration File:** `prisma/migrations/20250101000000_sync_purchase_order_sequence/migration.sql`

The trigger:
- Runs automatically after every INSERT on `PurchaseOrder` table
- Resets the sequence to be at least as high as the maximum ID in the table
- Works regardless of how records are inserted (API, Excel upload, direct SQL, etc.)

### 2. Backend API Safeguard ✅
The `createPurchaseOrder` endpoint now syncs the sequence after creating a single record.

**File:** `src/controllers/purchaseOrderController.ts`

This ensures sequence alignment even if the trigger somehow fails.

### 3. Excel Upload Safeguard ✅
After bulk Excel uploads, the frontend calls a sequence sync endpoint.

**File:** `Nrc/src/Components/Roles/Planner/planner_jobs.tsx`

**Endpoint:** `POST /api/purchase-orders/sync-sequence`

This provides an additional safety net after bulk operations.

## How to Apply the Fix

### Step 1: Run the Migration
```bash
cd nrc_backend/NRC_Backend
npm run db:migrate
```

Or manually run the SQL in the migration file:
```sql
-- Create the trigger function
CREATE OR REPLACE FUNCTION sync_purchase_order_sequence()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM setval(
    pg_get_serial_sequence('"PurchaseOrder"', 'id'),
    COALESCE((SELECT MAX(id) FROM "PurchaseOrder"), 1),
    false
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE TRIGGER sync_purchase_order_id_sequence
AFTER INSERT ON "PurchaseOrder"
FOR EACH STATEMENT
EXECUTE FUNCTION sync_purchase_order_sequence();

-- Sync existing sequence
SELECT setval(
  pg_get_serial_sequence('"PurchaseOrder"', 'id'),
  COALESCE((SELECT MAX(id) FROM "PurchaseOrder"), 1),
  false
);
```

### Step 2: Restart Backend Server
The backend changes are already in place, just restart the server to load the new endpoint.

### Step 3: Test
1. Create a PO via the form - should work
2. Upload POs via Excel - should work
3. Create another PO via form - should work without sequence errors

## Benefits

✅ **Automatic**: No manual intervention needed
✅ **Comprehensive**: Works for all insert methods
✅ **Resilient**: Multiple layers ensure reliability
✅ **No Breaking Changes**: Existing functionality unchanged
✅ **Future-Proof**: Handles any future bulk operations

## Verification

To check if the sequence is synced correctly:
```sql
SELECT 
  (SELECT MAX(id) FROM "PurchaseOrder") as max_id,
  (SELECT last_value FROM "PurchaseOrder_id_seq") as sequence_value;
```

Both values should match (or sequence_value should be >= max_id).

## Troubleshooting

If you still see sequence errors:

1. **Check if trigger exists:**
   ```sql
   SELECT * FROM pg_trigger WHERE tgname = 'sync_purchase_order_id_sequence';
   ```

2. **Manually sync sequence:**
   ```sql
   SELECT setval(
     pg_get_serial_sequence('"PurchaseOrder"', 'id'),
     COALESCE((SELECT MAX(id) FROM "PurchaseOrder"), 1),
     false
   );
   ```

3. **Verify trigger is enabled:**
   ```sql
   SELECT tgname, tgenabled FROM pg_trigger WHERE tgname = 'sync_purchase_order_id_sequence';
   ```
   `tgenabled` should be 'O' (enabled)

## Files Modified

1. ✅ `prisma/migrations/20250101000000_sync_purchase_order_sequence/migration.sql` - Database trigger
2. ✅ `src/controllers/purchaseOrderController.ts` - Added sequence sync to create endpoint + utility endpoint
3. ✅ `src/routes/purchaseOrderRoute.ts` - Added sync-sequence route
4. ✅ `Nrc/src/Components/Roles/Planner/planner_jobs.tsx` - Calls sync after Excel upload
