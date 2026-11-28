-- Travel content pages and manually recorded visibility checks (SEO phase 3).
-- Additive only: two new tables, no change to existing ones.
-- Rollback (after reverting the code): DROP TABLE visibility_measurements;
-- DROP TABLE content_pages; then delete this migration's row from
-- drizzle.__drizzle_migrations (hash of this file).
CREATE TABLE "content_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"kind" text DEFAULT 'guide' NOT NULL,
	"category" text,
	"title" jsonb NOT NULL,
	"summary" jsonb,
	"body" jsonb,
	"seo_title" jsonb,
	"seo_description" jsonb,
	"author_name" text,
	"author_role" text,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"faqs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cover_media_id" uuid,
	"related_trips" text[] DEFAULT '{}' NOT NULL,
	"related_pages" text[] DEFAULT '{}' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "content_pages_slug_unique" UNIQUE("slug"),
	CONSTRAINT "content_page_kind" CHECK ("content_pages"."kind" in ('guide','destination','activity')),
	CONSTRAINT "content_page_status" CHECK ("content_pages"."status" in ('draft','published')),
	CONSTRAINT "content_page_slug" CHECK ("content_pages"."slug" ~ '^[a-z0-9-]{1,120}$')
);
--> statement-breakpoint
CREATE TABLE "visibility_measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"measured_on" date NOT NULL,
	"platform" text NOT NULL,
	"kind" text NOT NULL,
	"prompt_id" text,
	"query" text NOT NULL,
	"lang" text NOT NULL,
	"market" text,
	"branded" boolean DEFAULT false NOT NULL,
	"mentioned" boolean NOT NULL,
	"cited_url" text,
	"recommended_position" smallint,
	"organic_position" smallint,
	"competitors" text[] DEFAULT '{}' NOT NULL,
	"sources" text[] DEFAULT '{}' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visibility_platform" CHECK ("visibility_measurements"."platform" in ('google-search','google-ai-overviews','google-ai-mode','chatgpt-search','gemini','perplexity','bing','copilot')),
	CONSTRAINT "visibility_kind" CHECK ("visibility_measurements"."kind" in ('ai','search'))
);
--> statement-breakpoint
ALTER TABLE "content_pages" ADD CONSTRAINT "content_pages_cover_media_id_media_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visibility_measurements" ADD CONSTRAINT "visibility_measurements_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_pages_status_kind" ON "content_pages" USING btree ("status","kind","sort");--> statement-breakpoint
CREATE INDEX "visibility_platform_date" ON "visibility_measurements" USING btree ("platform","measured_on");