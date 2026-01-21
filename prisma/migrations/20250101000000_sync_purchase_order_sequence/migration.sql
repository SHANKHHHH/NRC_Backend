-- Create a function that syncs the PurchaseOrder sequence after INSERT
CREATE OR REPLACE FUNCTION sync_purchase_order_sequence()
RETURNS TRIGGER AS $$
BEGIN
  -- Reset the sequence to be at least as high as the maximum ID in the table
  PERFORM setval(
    pg_get_serial_sequence('"PurchaseOrder"', 'id'),
    COALESCE((SELECT MAX(id) FROM "PurchaseOrder"), 1),
    false
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger that runs after any INSERT on PurchaseOrder table
CREATE TRIGGER sync_purchase_order_id_sequence
AFTER INSERT ON "PurchaseOrder"
FOR EACH STATEMENT
EXECUTE FUNCTION sync_purchase_order_sequence();

-- Also sync the sequence immediately for existing records
SELECT setval(
  pg_get_serial_sequence('"PurchaseOrder"', 'id'),
  COALESCE((SELECT MAX(id) FROM "PurchaseOrder"), 1),
  false
);
