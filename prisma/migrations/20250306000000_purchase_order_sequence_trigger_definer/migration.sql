-- Make the sync trigger run as the function owner (e.g. postgres) so that
-- INSERTs by anon/authenticated do not require USAGE on PurchaseOrder_id_seq.
-- Run this on Supabase if bulk upload (anon) gets "permission denied for sequence".
-- Function is in public schema (no args for trigger functions)
ALTER FUNCTION public.sync_purchase_order_sequence() SECURITY DEFINER;
