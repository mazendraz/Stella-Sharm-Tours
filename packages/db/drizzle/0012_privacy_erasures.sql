-- Erasure ledger (audit SEC-10). Holds only a keyed hash of each erased phone
-- number and when it was erased, never the number itself. The API re-applies
-- it at start-up, so restoring a backup cannot bring erased customers back.
CREATE TABLE IF NOT EXISTS "privacy_erasures" (
  "phone_hash" text PRIMARY KEY NOT NULL,
  "erased_at" timestamp with time zone DEFAULT now() NOT NULL
);
