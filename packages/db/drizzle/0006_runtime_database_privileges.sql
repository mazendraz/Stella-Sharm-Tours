-- Worker reads only the audit rows needed for the existing price report.
CREATE VIEW public.worker_price_audit WITH (security_barrier = true) AS
SELECT at, entity, action, entity_id, before, after
FROM public.audit_log
WHERE at > now() - interval '7 days'
  AND (entity = 'trip_prices' OR (
    entity = 'trip' AND (
      coalesce(before->'values', '{}'::jsonb) ? 'privateSurchargePct'
      OR coalesce(after, '{}'::jsonb) ? 'privateSurchargePct'
    )
  ));
--> statement-breakpoint
CREATE VIEW public.worker_revision_media_keys WITH (security_barrier = true) AS
SELECT DISTINCT split_part(path.value, '/', 1) || '/' || split_part(path.value, '/', 2) AS storage_key
FROM public.revisions AS r
CROSS JOIN LATERAL jsonb_path_query(r.snapshot, 'strict $.** ? (@.type() == "string")') AS item(value)
CROSS JOIN LATERAL (SELECT item.value #>> '{}' AS value) AS path
WHERE r.created_at > now() - interval '30 days'
  AND path.value ~ '^[a-f0-9]{2}/[a-f0-9]{64}/';
--> statement-breakpoint
CREATE FUNCTION public.request_retention_cutoff() RETURNS timestamptz
LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT ((now() AT TIME ZONE 'UTC') - interval '18 months') AT TIME ZONE 'UTC'
$$;
--> statement-breakpoint
CREATE FUNCTION public.scrub_request_history(request_ids uuid[]) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
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
CREATE FUNCTION public.worker_purge_expired_requests() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  expired_ids uuid[];
  affected integer;
BEGIN
  SELECT ARRAY(
    SELECT id FROM public.booking_requests
    WHERE created_at < public.request_retention_cutoff()
    FOR UPDATE
  ) INTO expired_ids;
  -- Sweep historical copies even when the request itself is already anonymized.
  PERFORM public.scrub_request_history(expired_ids);
  UPDATE public.booking_requests
    SET name = '[removed]', phone = '[removed]', email = NULL, hotel = NULL,
        notes = NULL, internal_note = NULL, child_ages = NULL, ip_hash = NULL,
        user_agent = NULL, anonymized_at = now()
    WHERE id = ANY(expired_ids) AND anonymized_at IS NULL;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.worker_cleanup_expired() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  DELETE FROM public.admin_devices WHERE expires_at < now();
  DELETE FROM public.sessions
    WHERE expires_at < now() OR last_seen_at < now() - interval '8 hours';
  DELETE FROM public.auth_tokens WHERE expires_at < now();
  DELETE FROM public.rate_buckets WHERE expires_at < now();
  DELETE FROM public.outbox WHERE delivered_at < now() - interval '30 days';
$$;
--> statement-breakpoint
CREATE FUNCTION public.worker_request_notification(request_id uuid)
RETURNS TABLE (
  id uuid, ref text, name text, phone text, email text, start_date text,
  adults smallint, children smallint, format text, pickup_area text, hotel text,
  estimate_eur numeric, notes text
)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT r.id, r.ref, r.name, r.phone, r.email, r.start_date::text, r.adults,
         r.children, r.format, r.pickup_area, r.hotel, r.estimate_eur, r.notes
  FROM public.booking_requests AS r
  WHERE r.id = request_id AND r.anonymized_at IS NULL
    AND r.status <> 'spam' AND r.created_at >= public.request_retention_cutoff()
  FOR SHARE OF r
$$;
--> statement-breakpoint
CREATE FUNCTION public.worker_set_translation_status(setting_key text, payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF setting_key IS NULL OR setting_key NOT IN ('i18n_runtime', 'i18n_warning', 'i18n_budget_alert') THEN
    RAISE insufficient_privilege USING MESSAGE = 'Worker cannot write this setting';
  END IF;
  INSERT INTO public.settings (key, value) VALUES (setting_key, payload)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.worker_save_machine_translation(
  translation_entity text, translation_id text, translation_field text,
  translation_locale text, translation_text text, source_hash text, provider text
) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  INSERT INTO public.content_translations AS existing
    (entity, entity_id, field, locale, text, source_hash, origin, provider)
  VALUES (translation_entity, translation_id, translation_field, translation_locale,
          translation_text, source_hash, 'machine', provider)
  ON CONFLICT (entity, entity_id, field, locale) DO UPDATE
    SET text = EXCLUDED.text, source_hash = EXCLUDED.source_hash,
        provider = EXCLUDED.provider, updated_at = now()
    WHERE existing.origin = 'machine';
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.request_retention_cutoff() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.scrub_request_history(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.worker_purge_expired_requests() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.worker_cleanup_expired() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.worker_request_notification(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.worker_set_translation_status(text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.worker_save_machine_translation(text,text,text,text,text,text,text) FROM PUBLIC;
