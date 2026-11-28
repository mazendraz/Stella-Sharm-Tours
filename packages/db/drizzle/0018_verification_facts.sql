-- Verification Center answers (SEO phase 3). Additive: one new table.
-- Numbered 0018 (not 0016) so it never collides with the Google Reviews
-- branch's 0014/0016; see docs/seo/PHASE-3-CHECKPOINT.md "Migrations".
-- Rollback (after reverting the code): DROP TABLE verification_facts; then
-- delete this migration's row from drizzle.__drizzle_migrations.
CREATE TABLE "verification_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid,
	"topic" text NOT NULL,
	"status" text DEFAULT 'missing' NOT NULL,
	"note" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_facts_scope_topic" UNIQUE NULLS NOT DISTINCT("trip_id","topic"),
	CONSTRAINT "verification_fact_status" CHECK ("verification_facts"."status" in ('missing','to_confirm','verified')),
	CONSTRAINT "verification_fact_topic" CHECK ("verification_facts"."topic" ~ '^[a-zA-Z]{2,40}$')
);
--> statement-breakpoint
ALTER TABLE "verification_facts" ADD CONSTRAINT "verification_facts_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_facts" ADD CONSTRAINT "verification_facts_updated_by_admin_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;