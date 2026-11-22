-- Executed only in an isolated staging database, with all application services stopped.
BEGIN;
DO $$ BEGIN
  IF to_regclass('public.booking_request_receipts') IS NULL THEN
    TRUNCATE booking_request_items, booking_requests;
  ELSE
    TRUNCATE booking_request_receipts, booking_request_items, booking_requests;
  END IF;
END $$;
TRUNCATE sessions, auth_tokens,
  audit_log, revisions, content_drafts, rate_buckets, outbox;
UPDATE media SET uploaded_by=NULL;
UPDATE settings SET updated_by=NULL;
DELETE FROM admin_users;
-- Reviews can contain customer names and free text. Re-add approved public examples manually.
DELETE FROM reviews;
-- Queue schemas are rebuilt by the reviewed migration, never copied into a running worker.
DROP SCHEMA IF EXISTS pgboss CASCADE;
COMMIT;
