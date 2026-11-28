ALTER TABLE "booking_requests" ADD COLUMN "currency" text DEFAULT 'EUR' NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD CONSTRAINT "request_currency" CHECK ("booking_requests"."currency" in ('EUR','GBP','USD'));--> statement-breakpoint
-- The staff e-mail shows the estimate in the currency the customer saw.
-- The return type changes, so the function is recreated; migrate re-grants
-- EXECUTE to the worker role (applyRuntimePrivileges) right after.
DROP FUNCTION public.worker_request_notification(uuid);--> statement-breakpoint
CREATE FUNCTION public.worker_request_notification(request_id uuid)
RETURNS TABLE (
  id uuid, ref text, name text, phone text, email text, start_date text,
  adults smallint, children smallint, format text, pickup_area text, hotel text,
  estimate_eur numeric, currency text, notes text
)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT r.id, r.ref, r.name, r.phone, r.email, r.start_date::text, r.adults,
         r.children, r.format, r.pickup_area, r.hotel, r.estimate_eur,
         r.currency, r.notes
  FROM public.booking_requests AS r
  WHERE r.id = request_id AND r.anonymized_at IS NULL
    AND r.status <> 'spam' AND r.created_at >= public.request_retention_cutoff()
  FOR SHARE OF r
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.worker_request_notification(uuid) FROM PUBLIC;
