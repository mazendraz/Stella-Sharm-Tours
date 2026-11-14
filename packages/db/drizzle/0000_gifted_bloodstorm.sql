CREATE EXTENSION IF NOT EXISTS citext;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text NOT NULL,
	"totp_secret_enc" "bytea",
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"recovery_codes_hash" text[],
	"last_totp_step" bigint,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email"),
	CONSTRAINT "admin_role" CHECK ("admin_users"."role" in ('owner','manager','editor','sales'))
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip_hash" text
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_request_items" (
	"request_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"day_index" smallint,
	"price_snapshot" jsonb,
	CONSTRAINT "booking_request_items_request_id_trip_id_pk" PRIMARY KEY("request_id","trip_id")
);
--> statement-breakpoint
CREATE TABLE "booking_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref" text NOT NULL,
	"mode" text NOT NULL,
	"locale" text NOT NULL,
	"start_date" date NOT NULL,
	"adults" smallint NOT NULL,
	"children" smallint DEFAULT 0 NOT NULL,
	"child_ages" smallint[],
	"format" text,
	"pickup_area" text,
	"hotel" text,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"notes" text,
	"estimate_eur" numeric(10, 2),
	"status" text DEFAULT 'new' NOT NULL,
	"assigned_to" uuid,
	"internal_note" text,
	"ip_hash" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_requests_ref_unique" UNIQUE("ref"),
	CONSTRAINT "request_guests" CHECK ("booking_requests"."adults" between 1 and 60 and "booking_requests"."children" between 0 and 40),
	CONSTRAINT "request_status" CHECK ("booking_requests"."status" in ('new','contacted','confirmed','completed','cancelled','spam')),
	CONSTRAINT "request_mode" CHECK ("booking_requests"."mode" in ('single','multi')),
	CONSTRAINT "request_format" CHECK ("booking_requests"."format" in ('group','private'))
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"kind" text DEFAULT 'normal' NOT NULL,
	"name" jsonb NOT NULL,
	"short_name" jsonb,
	"headline" jsonb,
	"subline" jsonb,
	"perks" jsonb,
	"color" text DEFAULT '#1B1712' NOT NULL,
	"cover_media_id" uuid,
	"hero_video_id" uuid,
	"sort" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "collections_slug_unique" UNIQUE("slug"),
	CONSTRAINT "collection_kind" CHECK ("collections"."kind" in ('normal','private_virtual','packages')),
	CONSTRAINT "collection_status" CHECK ("collections"."status" in ('draft','published'))
);
--> statement-breakpoint
CREATE TABLE "content_translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"field" text NOT NULL,
	"locale" text NOT NULL,
	"text" text NOT NULL,
	"source_hash" text NOT NULL,
	"origin" text NOT NULL,
	"provider" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "translation_origin" CHECK ("content_translations"."origin" in ('machine','human'))
);
--> statement-breakpoint
CREATE TABLE "faqs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"q" jsonb NOT NULL,
	"a" jsonb NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'published' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hero_slides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_media_id" uuid,
	"image_media_id" uuid,
	"collection_id" uuid,
	"kicker" jsonb,
	"headline" jsonb,
	"subline" jsonb,
	"cta_type" text DEFAULT 'collection' NOT NULL,
	"cta_target" text,
	"cta_label" jsonb,
	"duration_s" smallint DEFAULT 6 NOT NULL,
	"show_on" text DEFAULT 'all' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"sort" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "hero_media_required" CHECK ("hero_slides"."video_media_id" is not null or "hero_slides"."image_media_id" is not null),
	CONSTRAINT "hero_duration" CHECK ("hero_slides"."duration_s" between 3 and 20),
	CONSTRAINT "hero_schedule" CHECK ("hero_slides"."starts_at" is null or "hero_slides"."ends_at" is null or "hero_slides"."starts_at"<"hero_slides"."ends_at"),
	CONSTRAINT "hero_status" CHECK ("hero_slides"."status" in ('draft','published')),
	CONSTRAINT "hero_device" CHECK ("hero_slides"."show_on" in ('all','mobile','desktop')),
	CONSTRAINT "hero_cta" CHECK ("hero_slides"."cta_type" in ('collection','trip','package','my_trip','whatsapp','page'))
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"original_path" text NOT NULL,
	"variants" jsonb,
	"width" integer,
	"height" integer,
	"duration_s" numeric(6, 2),
	"bytes" bigint,
	"sha256" text,
	"alt" jsonb,
	"credit" text,
	"license" text,
	"rights_status" text DEFAULT 'unknown' NOT NULL,
	"focal_x" numeric(4, 3) DEFAULT '0.5' NOT NULL,
	"focal_y" numeric(4, 3) DEFAULT '0.5' NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"auto_enhance" boolean DEFAULT true NOT NULL,
	"source_already_graded" boolean DEFAULT false NOT NULL,
	"trim_start" numeric,
	"trim_end" numeric,
	"archived_at" timestamp with time zone,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_sha256_unique" UNIQUE("sha256"),
	CONSTRAINT "media_rights" CHECK ("media"."rights_status" in ('owned','licensed','permission','unknown')),
	CONSTRAINT "media_status" CHECK ("media"."status" in ('processing','ready','failed')),
	CONSTRAINT "media_kind" CHECK ("media"."kind" in ('image','video')),
	CONSTRAINT "media_focal" CHECK ("media"."focal_x" between 0 and 1 and "media"."focal_y" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "package_items" (
	"package_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"day_index" smallint,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "package_items_package_id_trip_id_pk" PRIMARY KEY("package_id","trip_id"),
	CONSTRAINT "package_no_self" CHECK ("package_items"."package_id"<>"package_items"."trip_id")
);
--> statement-breakpoint
CREATE TABLE "page_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_key" text NOT NULL,
	"type" text NOT NULL,
	"data" jsonb NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'published' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_buckets" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author" text,
	"text" jsonb,
	"source" text,
	"source_url" text NOT NULL,
	"rating" smallint,
	"visit_month" date,
	"status" text DEFAULT 'hidden' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revisions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_hash" text,
	"user_agent" text,
	"mfa_passed" boolean DEFAULT false NOT NULL,
	"reauth_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "translation_usage" (
	"month" text NOT NULL,
	"provider" text NOT NULL,
	"characters" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "translation_usage_month_provider_pk" PRIMARY KEY("month","provider")
);
--> statement-breakpoint
CREATE TABLE "trip_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"type" text NOT NULL,
	"text" jsonb NOT NULL,
	"extra_price_eur" numeric(10, 2),
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "item_type" CHECK ("trip_items"."type" in ('include','exclude','optional','bring','highlight'))
);
--> statement-breakpoint
CREATE TABLE "trip_itinerary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"time_label" text,
	"text" jsonb NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_media" (
	"trip_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"role" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "trip_media_trip_id_media_id_role_pk" PRIMARY KEY("trip_id","media_id","role"),
	CONSTRAINT "trip_media_role" CHECK ("trip_media"."role" in ('cover','gallery','video'))
);
--> statement-breakpoint
CREATE TABLE "trip_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"label" jsonb,
	"amount_eur" numeric(10, 2),
	"unit" text NOT NULL,
	"min_qty" smallint,
	"max_qty" smallint,
	"is_primary" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"valid_from" date,
	"valid_to" date,
	CONSTRAINT "price_nonnegative" CHECK ("trip_prices"."amount_eur" is null or "trip_prices"."amount_eur" >= 0),
	CONSTRAINT "price_unit" CHECK ("trip_prices"."unit" in ('person','child','quad','buggy','car','boat','group','hour')),
	CONSTRAINT "price_capacity" CHECK (("trip_prices"."min_qty" is null or "trip_prices"."min_qty">0) and ("trip_prices"."max_qty" is null or "trip_prices"."max_qty">0) and ("trip_prices"."min_qty" is null or "trip_prices"."max_qty" is null or "trip_prices"."min_qty"<="trip_prices"."max_qty"))
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"kind" text DEFAULT 'trip' NOT NULL,
	"collection_id" uuid NOT NULL,
	"title" jsonb NOT NULL,
	"summary" jsonb,
	"description" jsonb,
	"days_label" jsonb,
	"run_days" smallint[],
	"on_request" boolean DEFAULT false NOT NULL,
	"departure_label" text,
	"return_label" text,
	"duration_label" jsonb,
	"duration_minutes" integer,
	"days_count" smallint DEFAULT 1 NOT NULL,
	"transport" text,
	"format" text DEFAULT 'both' NOT NULL,
	"private_surcharge_pct" numeric(5, 2),
	"flight" boolean DEFAULT false NOT NULL,
	"overnight" boolean DEFAULT false NOT NULL,
	"private_on_request" boolean DEFAULT true NOT NULL,
	"family_friendly" boolean DEFAULT false NOT NULL,
	"min_age" smallint,
	"notes" jsonb,
	"editorial_notes" jsonb,
	"seo_title" jsonb,
	"seo_description" jsonb,
	"featured_order" smallint,
	"sort" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "trips_slug_unique" UNIQUE("slug"),
	CONSTRAINT "trip_kind" CHECK ("trips"."kind" in ('trip','package')),
	CONSTRAINT "trip_status" CHECK ("trips"."status" in ('draft','published','hidden')),
	CONSTRAINT "trip_format" CHECK ("trips"."format" in ('group','private','both')),
	CONSTRAINT "trip_days" CHECK ("trips"."days_count" between 1 and 120),
	CONSTRAINT "trip_private_surcharge" CHECK ("trips"."private_surcharge_pct" is null or "trips"."private_surcharge_pct" >= 0)
);
--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_admin_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_request_items" ADD CONSTRAINT "booking_request_items_request_id_booking_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."booking_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_request_items" ADD CONSTRAINT "booking_request_items_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_assigned_to_admin_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_cover_media_id_media_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_hero_video_id_media_id_fk" FOREIGN KEY ("hero_video_id") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hero_slides" ADD CONSTRAINT "hero_slides_video_media_id_media_id_fk" FOREIGN KEY ("video_media_id") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hero_slides" ADD CONSTRAINT "hero_slides_image_media_id_media_id_fk" FOREIGN KEY ("image_media_id") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hero_slides" ADD CONSTRAINT "hero_slides_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_admin_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_package_id_trips_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_admin_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_admin_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_items" ADD CONSTRAINT "trip_items_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_itinerary" ADD CONSTRAINT "trip_itinerary_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_media" ADD CONSTRAINT "trip_media_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_media" ADD CONSTRAINT "trip_media_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_prices" ADD CONSTRAINT "trip_prices_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entity" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "requests_status_created" ON "booking_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "requests_phone" ON "booking_requests" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "translation_field_locale" ON "content_translations" USING btree ("entity","entity_id","field","locale");--> statement-breakpoint
CREATE INDEX "translation_locale_entity" ON "content_translations" USING btree ("locale","entity");--> statement-breakpoint
CREATE INDEX "hero_status_sort" ON "hero_slides" USING btree ("status","sort");--> statement-breakpoint
CREATE INDEX "revision_entity_created" ON "revisions" USING btree ("entity","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "trip_prices_sort" ON "trip_prices" USING btree ("trip_id","sort");--> statement-breakpoint
CREATE INDEX "trips_collection_status_sort" ON "trips" USING btree ("collection_id","status","sort");--> statement-breakpoint
CREATE INDEX "trips_title_search" ON "trips" USING gin (("title"->>'en') gin_trgm_ops);
