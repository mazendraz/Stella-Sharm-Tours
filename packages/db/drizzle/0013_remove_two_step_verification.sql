-- Owner decision (2026-11-25): staff sign in with email + password only.
-- Sessions that were still waiting for a two-step code are deleted first, so
-- dropping the flag cannot turn them into full sessions.
DELETE FROM "sessions" WHERE "mfa_passed" = false;--> statement-breakpoint
ALTER TABLE "admin_users" DROP COLUMN "totp_secret_enc";--> statement-breakpoint
ALTER TABLE "admin_users" DROP COLUMN "totp_enabled";--> statement-breakpoint
ALTER TABLE "admin_users" DROP COLUMN "mfa_required";--> statement-breakpoint
ALTER TABLE "admin_users" DROP COLUMN "recovery_codes_hash";--> statement-breakpoint
ALTER TABLE "admin_users" DROP COLUMN "last_totp_step";--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "mfa_passed";
