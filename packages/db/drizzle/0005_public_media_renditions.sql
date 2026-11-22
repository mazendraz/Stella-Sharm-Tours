CREATE TABLE "public_media_renditions" (
	"storage_key" text PRIMARY KEY NOT NULL,
	"media_id" uuid NOT NULL,
	CONSTRAINT "public_media_rendition_key" CHECK ("public_media_renditions"."storage_key" ~ '^[a-f0-9]{2}/[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "public_media_renditions" ADD CONSTRAINT "public_media_renditions_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "public_media_renditions_media_idx" ON "public_media_renditions" USING btree ("media_id");
--> statement-breakpoint
INSERT INTO "public_media_renditions" ("storage_key", "media_id")
SELECT DISTINCT split_part(path.value, '/', 1) || '/' || split_part(path.value, '/', 2), m.id
FROM "media" AS m
CROSS JOIN LATERAL jsonb_path_query(m.variants, 'strict $.** ? (@.type() == "string")') AS variant(value)
CROSS JOIN LATERAL (SELECT variant.value #>> '{}' AS value) AS path
WHERE m.rights_status <> 'unknown'
  AND m.archived_at IS NULL
  AND path.value ~ '^[a-f0-9]{2}/[a-f0-9]{64}/[^/]+$'
ON CONFLICT ("storage_key") DO NOTHING;
