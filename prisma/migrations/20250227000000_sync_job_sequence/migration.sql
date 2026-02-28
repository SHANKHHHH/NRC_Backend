-- Sync Job id sequence after bulk imports (e.g. Excel). Ensures next id is MAX(id)+1.
-- Run this migration or the statements below in Supabase if the form fails with "Unique constraint failed on (id)".

CREATE OR REPLACE FUNCTION sync_job_sequence()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM setval(
    pg_get_serial_sequence('"Job"', 'id'),
    COALESCE((SELECT MAX(id) FROM "Job"), 1),
    false
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_job_id_sequence
AFTER INSERT ON "Job"
FOR EACH STATEMENT
EXECUTE FUNCTION sync_job_sequence();

-- One-time sync so next id is 6217 when max id is 6216
SELECT setval(
  pg_get_serial_sequence('"Job"', 'id'),
  COALESCE((SELECT MAX(id) FROM "Job"), 1),
  false
);
