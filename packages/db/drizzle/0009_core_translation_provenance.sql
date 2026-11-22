-- These rows were bundled editorial copy seeded with the old origin value.
UPDATE public.content_translations
   SET origin = 'human'
 WHERE origin = 'machine' AND provider = 'codex-authored'
   AND locale IN ('en', 'it', 'es', 'fr', 'de', 'ru', 'tr');
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.worker_save_machine_translation(
  translation_entity text, translation_id text, translation_field text,
  translation_locale text, translation_text text, source_hash text, provider text
) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  INSERT INTO public.content_translations AS existing
    (entity, entity_id, field, locale, text, source_hash, origin, provider)
  SELECT translation_entity, translation_id, translation_field, translation_locale,
         translation_text, source_hash, 'machine', provider
   WHERE translation_locale ~ '^[a-z]{2,3}$'
     AND translation_locale NOT IN ('en', 'it', 'es', 'fr', 'de', 'ru', 'tr')
     AND btrim(translation_text) <> ''
  ON CONFLICT (entity, entity_id, field, locale) DO UPDATE
    SET text = EXCLUDED.text, source_hash = EXCLUDED.source_hash,
        provider = EXCLUDED.provider, updated_at = now()
    WHERE existing.origin = 'machine';
$$;
