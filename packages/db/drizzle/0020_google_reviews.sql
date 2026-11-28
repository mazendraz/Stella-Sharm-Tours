ALTER TABLE "reviews" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "lang" text;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "sort" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "edited" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "captured_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "reviews_published_order" ON "reviews" USING btree ("status","featured","sort");--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_external_id_unique" UNIQUE("external_id");