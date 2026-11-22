CREATE TABLE "booking_request_receipts" (
	"submission_id" text PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"confirmation" jsonb,
	"expires_at" timestamp with time zone DEFAULT now() + interval '24 hours' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_request_receipts" ADD CONSTRAINT "booking_request_receipts_request_id_booking_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."booking_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "request_receipt_request" ON "booking_request_receipts" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "request_receipt_expiry" ON "booking_request_receipts" USING btree ("expires_at") WHERE "booking_request_receipts"."confirmation" is not null;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.scrub_request_history(request_ids uuid[]) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  DELETE FROM public.booking_request_receipts WHERE request_id = ANY(request_ids);
  DELETE FROM public.revisions
    WHERE entity = 'request' AND entity_id = ANY(request_ids);
  UPDATE public.audit_log
    SET before = NULL, after = '{"redacted":true}'::jsonb
    WHERE entity = 'request' AND entity_id = ANY(request_ids::text[]);
  DELETE FROM public.outbox
    WHERE name IN ('notify.request.created', 'notify.request.push')
      AND data->>'requestId' = ANY(request_ids::text[]);
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.worker_cleanup_expired() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  DELETE FROM public.admin_devices WHERE expires_at < now();
  DELETE FROM public.sessions
    WHERE expires_at < now() OR last_seen_at < now() - interval '8 hours';
  DELETE FROM public.auth_tokens WHERE expires_at < now();
  DELETE FROM public.rate_buckets WHERE expires_at < now();
  DELETE FROM public.outbox WHERE delivered_at < now() - interval '30 days';
  UPDATE public.booking_request_receipts SET confirmation = NULL
    WHERE expires_at <= now() AND confirmation IS NOT NULL;
$$;
