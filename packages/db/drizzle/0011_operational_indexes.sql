-- Supporting indexes for cleanup, session revocation and audit paging (audit DB-04).
-- The tables are small, so plain CREATE INDEX inside the migration transaction is fine.
CREATE INDEX IF NOT EXISTS "sessions_user" ON "sessions" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_buckets_expiry" ON "rate_buckets" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbox_pending" ON "outbox" USING btree ("created_at") WHERE "delivered_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbox_delivered" ON "outbox" USING btree ("delivered_at") WHERE "delivered_at" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "booking_request_items_trip" ON "booking_request_items" USING btree ("trip_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_at" ON "audit_log" USING btree ("at");
