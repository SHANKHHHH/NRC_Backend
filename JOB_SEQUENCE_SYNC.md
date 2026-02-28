# Job table ID sequence sync (Supabase / PostgreSQL)

After importing many jobs (e.g. 6216) from Excel with explicit `id` values, the `Job` table’s auto-increment sequence is not updated. The next insert from the **Create New Job** form then tries to reuse a low `id` and can fail with:

`Unique constraint failed on the fields: (id)`

You need the next `id` to be **6217** (i.e. one more than your current max `id`).

## Option 1: One-time fix in Supabase (recommended)

In **Supabase Dashboard → SQL Editor**, run:

```sql
-- Set sequence so the next id = MAX(id)+1 (e.g. 6217 when max is 6216)
SELECT setval(
  pg_get_serial_sequence('"Job"', 'id'),
  COALESCE((SELECT MAX(id) FROM "Job"), 1),
  false
);
```

Then use the **Create New Job** form as usual; the next job will get `id = 6217`.

## Option 2: Backend sync endpoint

If your app uses the NRC backend (same DB as Supabase), you can sync the sequence via API:

```http
POST https://nrprod.nrcontainers.com/api/jobs/sync-sequence
Authorization: Bearer <your_access_token>
```

No body required. Response confirms the sequence was updated.

## Option 3: Prevent future bulk-import issues (trigger)

To keep the sequence in sync after any future bulk inserts, run the migration that adds the trigger:

```bash
cd nrc_backend/NRC_Backend
npx prisma migrate deploy
```

Or run the SQL in `prisma/migrations/20250227000000_sync_job_sequence/migration.sql` manually in the Supabase SQL Editor. That migration:

1. Sets the sequence once so the next `id` is correct.
2. Adds a trigger so that after every `INSERT` on `Job`, the sequence is set to `MAX(id)`, avoiding the same problem after future bulk imports.

## Verify

In Supabase SQL Editor:

```sql
SELECT
  (SELECT MAX(id) FROM "Job") AS max_id,
  (SELECT last_value FROM "Job_id_seq") AS sequence_last_value;
```

After the fix, `sequence_last_value` should equal `max_id`. The next insert will get `id = max_id + 1`.
