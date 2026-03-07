-- Create a function that syncs the PurchaseOrder sequence after INSERT
CREATE OR REPLACE FUNCTION sync_purchase_order_sequence()
RETURNS TRIGGER AS $$
BEGIN
  -- Reset the sequence so the NEXT nextval() returns MAX(id)+1 (is_called=true)
  PERFORM setval(
    pg_get_serial_sequence('"PurchaseOrder"', 'id'),
    COALESCE((SELECT MAX(id) FROM "PurchaseOrder"), 0),
    true
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger that runs after any INSERT on PurchaseOrder table
CREATE TRIGGER sync_purchase_order_id_sequence
AFTER INSERT ON "PurchaseOrder"
FOR EACH STATEMENT
EXECUTE FUNCTION sync_purchase_order_sequence();

-- Also sync the sequence immediately so next insert gets MAX(id)+1
SELECT setval(
  pg_get_serial_sequence('"PurchaseOrder"', 'id'),
  COALESCE((SELECT MAX(id) FROM "PurchaseOrder"), 0),
  true
);
