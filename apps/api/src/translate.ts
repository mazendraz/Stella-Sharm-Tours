import { createHash } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '@stella/db';
import * as s from '@stella/db/schema';
import { locales, isCoreLocale } from '@stella/shared';
import enMessages from '../../web/messages/en.json';
import type { Config } from './config';
import {
  parse as parseIcu,
  type MessageFormatElement,
} from '@formatjs/icu-messageformat-parser';
import { loadCatalog } from './catalog';
export type WorkerConfig = Config & {
  VAPID_PRIVATE_KEY?: string | undefined;
  VAPID_SUBJECT?: string | undefined;
  TRANSLATE_PROVIDER?: string | undefined;
  DEEPL_API_KEY?: string | undefined;
  GOOGLE_TRANSLATE_KEY?: string | undefined;
  GOOGLE_FREE_TIER_CONFIRMED?: 'true' | 'false' | undefined;
  LIBRETRANSLATE_URL?: string | undefined;
};
export type PublicField = {
  entity: string;
  id: string;
  field: string;
  en: string;
  human: Record<string, string | undefined>;
};
export type Provider = {
  name: string;
  languages: () => Promise<string[]>;
  translate: (texts: string[], locale: string) => Promise<string[]>;
  remaining?: () => Promise<number>;
};
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const extraLocales = (value: unknown) =>
  Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (code): code is string =>
              typeof code === 'string' &&
              /^[a-z]{2,3}$/.test(code) &&
              !isCoreLocale(code),
          ),
        ),
      ]
    : [];
const fieldKey = (entity: string, id: string, field: string, locale: string) =>
  JSON.stringify([entity, id, field, locale]);

export function providerTargets(codes: string[]) {
  const targets = new Map<string, string>();
  for (const code of [...codes].sort()) {
    if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(code)) continue;
    const locale = code.split('-')[0]!.toLowerCase();
    const preferred = ['zh-cn', 'zh-hans', 'pt-pt'];
    if (
      !targets.has(locale) ||
      code.toLowerCase() === locale ||
      (preferred.includes(code.toLowerCase()) &&
        targets.get(locale)?.includes('-'))
    )
      targets.set(locale, code);
  }
  return targets;
}

function providerLanguageMap(load: () => Promise<string[]>) {
  let cached: { targets: Map<string, string>; expires: number } | undefined;
  const get = async () => {
    if (cached && cached.expires > Date.now()) return cached.targets;
    const targets = providerTargets(await load());
    cached = { targets, expires: Date.now() + 60_000 };
    return targets;
  };
  return {
    languages: async () => [...(await get()).keys()],
    target: async (locale: string) => {
      const target = (await get()).get(locale);
      if (!target) throw new Error('Provider does not support the locale');
      return target;
    },
  };
}
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
export async function publicTranslationFields(
  db: Database,
  cfg: Pick<Config, 'MEDIA_PUBLIC_URL'>,
): Promise<PublicField[]> {
  // Build the allow-list from published DTOs. Never enumerate booking, user,
  // audit, request-note, contact, original-path or editorial columns.
  const catalog = await loadCatalog(db, 'en', cfg.MEDIA_PUBLIC_URL),
    result: PublicField[] = [];
  const add = (entity: string, id: string, field: string, value: unknown) => {
    const v = obj(value);
    if (typeof v.en === 'string' && v.en.trim())
      result.push({
        entity,
        id,
        field,
        en: v.en,
        human: Object.fromEntries(
          locales.flatMap((l) =>
            typeof v[l] === 'string' ? [[l, v[l] as string]] : [],
          ),
        ),
      });
  };
  const rawTrips = await db
    .select()
    .from(s.trips)
    .where(
      inArray(
        s.trips.slug,
        catalog.trips.map((t) => t.slug),
      ),
    );
  for (const t of rawTrips) {
    for (const [field, value] of [
      ['title', t.title],
      ['summary', t.summary],
      ['description', t.description],
      ['duration_label', t.durationLabel],
      ['days_label', t.daysLabel],
      ['seo_title', t.seoTitle],
      ['seo_description', t.seoDescription],
    ] as const)
      add('trip', t.id, field, value);
    (t.notes ?? []).forEach((v, i) => add('trip', t.id, `notes[${i}]`, v));
    for (const scene of t.story?.scenes ?? []) {
      add('trip', t.id, 'story.' + scene.id + '.title', scene.title);
      add('trip', t.id, 'story.' + scene.id + '.caption', scene.caption);
    }
    if (t.departureLabel)
      add('trip', t.id, 'departure_label', { en: t.departureLabel });
    if (t.returnLabel) add('trip', t.id, 'return_label', { en: t.returnLabel });
  }
  const tids = rawTrips.map((t) => t.id);
  if (tids.length) {
    for (const row of await db
      .select()
      .from(s.tripItems)
      .where(inArray(s.tripItems.tripId, tids)))
      add('trip_item', row.id, 'text', row.text);
    for (const row of await db
      .select()
      .from(s.tripItinerary)
      .where(inArray(s.tripItinerary.tripId, tids))) {
      add('itinerary', row.id, 'text', row.text);
      if (row.timeLabel)
        add('itinerary', row.id, 'time_label', { en: row.timeLabel });
    }
    for (const row of await db
      .select()
      .from(s.tripPrices)
      .where(inArray(s.tripPrices.tripId, tids)))
      add('trip_price', row.id, 'label', row.label);
  }
  const rawCollections = await db
    .select()
    .from(s.collections)
    .where(
      inArray(
        s.collections.slug,
        catalog.collections.map((c) => c.slug),
      ),
    );
  for (const c of rawCollections) {
    for (const [field, value] of [
      ['name', c.name],
      ['short_name', c.shortName],
      ['headline', c.headline],
      ['subline', c.subline],
    ] as const)
      add('collection', c.id, field, value);
    (c.perks ?? []).forEach((p, i) => {
      add('collection', c.id, `perks[${i}].title`, p.title);
      add('collection', c.id, `perks[${i}].sub`, p.sub);
    });
  }
  const slideIds = catalog.site.hero_slides.map((s) => s.id);
  if (slideIds.length)
    for (const row of await db
      .select()
      .from(s.heroSlides)
      .where(inArray(s.heroSlides.id, slideIds)))
      for (const [field, value] of [
        ['headline', row.headline],
        ['kicker', row.kicker],
        ['subline', row.subline],
        ['cta_label', row.ctaLabel],
      ] as const)
        add('hero_slide', row.id, field, value);
  const usedMedia = await db.execute<{ id: string }>(
    sql`select distinct m.id from media m where m.status='ready' and m.archived_at is null and m.rights_status<>'unknown' and (exists(select 1 from trip_media tm join trips t on t.id=tm.trip_id where tm.media_id=m.id and t.status='published' and t.archived_at is null) or exists(select 1 from trips st where st.status='published' and st.archived_at is null and st.story->'scenes' @> jsonb_build_array(jsonb_build_object('mediaId',m.id::text))) or exists(select 1 from collections c where c.status='published' and c.archived_at is null and (c.cover_media_id=m.id or c.hero_video_id=m.id)) or exists(select 1 from hero_slides h where h.status='published' and h.archived_at is null and (h.image_media_id=m.id or h.video_media_id=m.id)))`,
  );
  if (usedMedia.rows.length)
    for (const row of await db
      .select()
      .from(s.media)
      .where(
        inArray(
          s.media.id,
          usedMedia.rows.map((m) => m.id),
        ),
      ))
      add('media', row.id, 'alt', row.alt);
  for (const row of await db
    .select()
    .from(s.faqs)
    .where(eq(s.faqs.status, 'published'))) {
    add('faq', row.id, 'q', row.q);
    add('faq', row.id, 'a', row.a);
  }
  for (const row of await db
    .select()
    .from(s.pageBlocks)
    .where(eq(s.pageBlocks.status, 'published'))) {
    for (const key of ['title', 'heading', 'text'])
      add('page_block', row.id, key, obj(row.data)[key]);
  }
  for (const key of ['address', 'hours', 'legal_entity'])
    add('settings', key, 'value', catalog.settings[key]);
  for (const [field, value] of Object.entries(obj(catalog.settings.home)))
    if (
      [
        'private_heading',
        'private_text',
        'build_heading',
        'build_text',
        'contact_heading',
        'contact_text',
      ].includes(field)
    )
      add('settings', 'home', field, value);
  if (Array.isArray(catalog.settings.how_steps))
    catalog.settings.how_steps.forEach((step, i) => {
      for (const key of ['title', 'text'])
        add('settings', 'how_steps', `[${i}].${key}`, obj(step)[key]);
    });
  for (const [field, en] of Object.entries(enMessages))
    add('ui', 'public', field, { en });
  return result;
}
function icuSignature(nodes: MessageFormatElement[]): string {
  return JSON.stringify(
    nodes
      .flatMap((node) => {
        if (node.type === 0) return [];
        if (node.type === 5 || node.type === 6)
          return [
            `${node.type}:${node.value}:${node.type === 6 ? node.offset + ':' + node.pluralType : ''}:${JSON.stringify(
              Object.entries(node.options)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, option]) => [key, icuSignature(option.value)]),
            )}`,
          ];
        return [
          `${node.type}:${'value' in node ? node.value : ''}:${'style' in node ? JSON.stringify(node.style, (key, value) => (key === 'location' ? undefined : value)) : ''}`,
        ];
      })
      .sort(),
  );
}
export function protectText(text: string, glossary: string[], icu = true) {
  if (text.includes('⟦STELLA_')) throw new Error('Reserved translation marker');
  const values: string[] = [];
  const token = (value: string) => {
    const i = values.push(value) - 1;
    return `⟦STELLA_${i}⟧`;
  };
  // Leave only literal words translatable, including words inside plural/select
  // branches. The parser locates grammar, arguments and # without regex guessing.
  const ast = icu
      ? parseIcu(text, { captureLocation: true, ignoreTag: true })
      : [],
    ranges: { start: number; end: number }[] = [];
  const collect = (nodes: MessageFormatElement[]) => {
    for (const node of nodes) {
      if (node.type === 0 && node.location)
        ranges.push({
          start: node.location.start.offset,
          end: node.location.end.offset,
        });
      else if (node.type === 5 || node.type === 6)
        for (const option of Object.values(node.options)) collect(option.value);
    }
  };
  collect(ast);
  ranges.sort((a, b) => a.start - b.start);
  let masked = '';
  let offset = 0;
  if (!icu) masked = text;
  else {
    for (const range of ranges) {
      if (range.start > offset)
        masked += token(text.slice(offset, range.start));
      masked += text.slice(range.start, range.end);
      offset = range.end;
    }
    if (offset < text.length) masked += token(text.slice(offset));
  }
  masked = masked
    .replace(/`[^`\n]+`/g, token)
    .replace(
      /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
      (_match, label: string, url: string) =>
        token('[') + label + token('](' + url + ')'),
    )
    .replace(/^(#{1,3}\s+|[-*]\s+)/gm, token);
  masked = masked.replace(/https?:\/\/[^\s)]+/g, token);
  for (const term of [...glossary].sort((a, b) => b.length - a.length)) {
    if (!term) continue;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    masked = masked
      .split(/(⟦STELLA_\d+⟧)/)
      .map((part) =>
        part.startsWith('⟦STELLA_')
          ? part
          : part.replace(new RegExp(escaped, 'gi'), token),
      )
      .join('');
  }
  // Exclude the marker's own digits while protecting public numeric facts.
  masked = masked
    .split(/(⟦STELLA_\d+⟧)/)
    .map((part) =>
      part.startsWith('⟦STELLA_')
        ? part
        : part.replace(/\d+(?:[.,:/–-]\d+)*/g, token),
    )
    .join('');
  return {
    text: masked,
    restore: (output: string) => {
      let restored = output;
      for (const [i, value] of values.entries()) {
        const key = `⟦STELLA_${i}⟧`;
        if (restored.split(key).length !== 2)
          throw new Error('Translation placeholder changed');
        restored = restored.replace(key, value);
      }
      if (
        restored.includes('⟦STELLA_') ||
        /<\/?[a-z][\s\S]*>/i.test(restored) ||
        /\]\(\s*(?:javascript|data|vbscript):/i.test(restored)
      )
        throw new Error('Unsafe translated content');
      if (
        icu &&
        icuSignature(parseIcu(restored, { ignoreTag: true })) !==
          icuSignature(ast)
      )
        throw new Error('Translation ICU structure changed');
      const numbers = (v: string) =>
        (v.match(/\d+(?:[.,:/–-]\d+)*/g) ?? []).sort().join('|');
      if (numbers(restored) !== numbers(text))
        throw new Error('Translation numeric facts changed');
      return restored;
    },
  };
}
async function jsonRequest(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Translation provider unavailable');
  return (await response.json()) as unknown;
}
export function fakeProvider(
  payloads: { texts: string[]; locale: string }[] = [],
): Provider {
  return {
    name: 'fake',
    languages: async () => [
      'pl',
      'cs',
      'sk',
      'uk',
      'ro',
      'hu',
      'nl',
      'pt',
      'ar',
      'zh',
      'it',
      'es',
      'fr',
      'de',
      'ru',
      'tr',
    ],
    translate: async (texts, locale) => {
      payloads.push({ texts: [...texts], locale });
      return texts.map((t) => `[${locale}] ${t}`);
    },
  };
}
export function configuredProviders(cfg: WorkerConfig): Provider[] {
  const result: Provider[] = [];
  if (cfg.TRANSLATE_PROVIDER === 'fake' && cfg.NODE_ENV === 'test')
    return [fakeProvider()];
  if (cfg.DEEPL_API_KEY) {
    const headers = {
      Authorization: 'DeepL-Auth-Key ' + cfg.DEEPL_API_KEY,
      'Content-Type': 'application/json',
    };
    const languageMap = providerLanguageMap(async () => {
      const data = await jsonRequest(
        'https://api-free.deepl.com/v2/languages?type=target',
        { headers },
      );
      if (!Array.isArray(data)) throw new Error('Invalid provider languages');
      return data.flatMap((d) =>
        typeof obj(d).language === 'string' ? [String(obj(d).language)] : [],
      );
    });
    result.push({
      name: 'deepl',
      languages: languageMap.languages,
      remaining: async () => {
        const data = obj(
          await jsonRequest('https://api-free.deepl.com/v2/usage', { headers }),
        );
        return Math.max(
          0,
          Math.min(500000, Number(data.character_limit)) -
            Number(data.character_count),
        );
      },
      translate: async (texts, locale) => {
        const data = obj(
          await jsonRequest('https://api-free.deepl.com/v2/translate', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              text: texts,
              source_lang: 'EN',
              target_lang: await languageMap.target(locale),
            }),
          }),
        );
        if (!Array.isArray(data.translations))
          throw new Error('Invalid provider response');
        return data.translations.map((t) => String(obj(t).text));
      },
    });
  }
  if (cfg.GOOGLE_TRANSLATE_KEY) {
    const headers = {
      'X-Goog-Api-Key': cfg.GOOGLE_TRANSLATE_KEY,
      'Content-Type': 'application/json',
    };
    const languageMap = providerLanguageMap(async () => {
      const data = obj(
        obj(
          await jsonRequest(
            'https://translation.googleapis.com/language/translate/v2/languages?target=en',
            { headers },
          ),
        ).data,
      );
      if (!Array.isArray(data.languages))
        throw new Error('Invalid provider languages');
      return data.languages.flatMap((l) =>
        typeof obj(l).language === 'string' ? [String(obj(l).language)] : [],
      );
    });
    result.push({
      name: 'google',
      languages: languageMap.languages,
      translate: async (texts, locale) => {
        const data = obj(
          obj(
            await jsonRequest(
              'https://translation.googleapis.com/language/translate/v2',
              {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  q: texts,
                  source: 'en',
                  target: await languageMap.target(locale),
                  format: 'text',
                  model: 'nmt',
                }),
              },
            ),
          ).data,
        );
        if (!Array.isArray(data.translations))
          throw new Error('Invalid provider response');
        return data.translations.map((t) =>
          String(obj(t).translatedText).replace(
            /&(amp|lt|gt|quot|#39);/g,
            (_m, k: string) =>
              ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[k] ?? '',
          ),
        );
      },
    });
  }
  if (cfg.LIBRETRANSLATE_URL) {
    const base = cfg.LIBRETRANSLATE_URL.replace(/\/$/, '');
    const languageMap = providerLanguageMap(async () => {
      const data = await jsonRequest(base + '/languages');
      if (!Array.isArray(data)) throw new Error('Invalid provider languages');
      return data.flatMap((l) =>
        typeof obj(l).code === 'string' ? [String(obj(l).code)] : [],
      );
    });
    result.push({
      name: 'libre',
      languages: languageMap.languages,
      translate: async (texts, locale) => {
        const data = obj(
          await jsonRequest(base + '/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              q: texts,
              source: 'en',
              target: await languageMap.target(locale),
              format: 'text',
            }),
          }),
        );
        return Array.isArray(data.translatedText)
          ? data.translatedText.map(String)
          : [String(data.translatedText)];
      },
    });
  }
  return result;
}
export async function reserveCharacters(
  db: Database,
  provider: string,
  characters: number,
  budget: number,
  freeOnly: boolean,
) {
  if (characters < 0 || !Number.isSafeInteger(characters))
    throw new Error('Invalid character count');
  const month = new Date().toISOString().slice(0, 7);
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`i18n-budget:${month}`}))`,
    );
    const rows = await tx
      .select()
      .from(s.translationUsage)
      .where(eq(s.translationUsage.month, month));
    const used = rows.reduce((sum, r) => sum + r.characters, 0),
      providerUsed = rows.find((r) => r.provider === provider)?.characters ?? 0;
    if (
      used + characters > budget ||
      (freeOnly &&
        ['deepl', 'google'].includes(provider) &&
        providerUsed + characters > 500000)
    )
      return false;
    await tx
      .insert(s.translationUsage)
      .values({ month, provider, characters })
      .onConflictDoUpdate({
        target: [s.translationUsage.month, s.translationUsage.provider],
        set: {
          characters: sql`${s.translationUsage.characters}+${characters}`,
        },
      });
    return true;
  });
}
export async function refreshCoverage(
  db: Database,
  cfg: WorkerConfig,
  providers: Provider[],
) {
  const fields = await publicTranslationFields(db, cfg),
    all = await db.select().from(s.contentTranslations),
    setting = (
      await db.select().from(s.settings).where(eq(s.settings.key, 'i18n'))
    )[0],
    options = obj(setting?.value);
  const eligible = providers.filter(
    (p) =>
      options.free_tier_only === false ||
      p.name !== 'google' ||
      cfg.GOOGLE_FREE_TIER_CONFIRMED === 'true',
  );
  const supported = await Promise.allSettled(
    eligible.map((p) => p.languages()),
  );
  const results = supported.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : [],
  );
  const [previous] =
    supported.some((result) => result.status === 'fulfilled') ||
    !eligible.length
      ? []
      : await db
          .select()
          .from(s.settings)
          .where(eq(s.settings.key, 'i18n_runtime'));
  const saved = obj(previous?.value).supported;
  const languages = extraLocales(
    supported.some((result) => result.status === 'fulfilled') ? results : saved,
  );
  const translated = new Map(
    all.map((row) => [
      fieldKey(row.entity, row.entityId, row.field, row.locale),
      row,
    ]),
  );
  const coverage = Object.fromEntries(
    extraLocales(options.auto)
      .filter((locale) => languages.includes(locale))
      .map((locale) => [
        locale,
        fields.length
          ? fields.filter((f) => {
              const row = translated.get(
                fieldKey(f.entity, f.id, f.field, locale),
              );
              return row?.text.trim() && row.sourceHash === sha(f.en);
            }).length / fields.length
          : 0,
      ]),
  );
  const value = {
    providers_available: eligible.length > 0,
    supported: languages,
    coverage,
    warning: eligible.length
      ? supported.every((result) => result.status === 'rejected')
        ? 'Translation providers temporarily unavailable; saved translations retained'
        : null
      : 'No translation provider configured',
    updated_at: new Date().toISOString(),
  };
  await writeTranslationStatus(db, 'i18n_runtime', value);
  await db
    .insert(s.outbox)
    .values({ name: 'revalidate.web', data: { tags: ['site', 'locales'] } });
  return value;
}
async function writeTranslationStatus(
  db: Pick<Database, 'execute'>,
  key: 'i18n_runtime' | 'i18n_warning' | 'i18n_budget_alert',
  value: Record<string, unknown>,
) {
  await db.execute(
    sql`select public.worker_set_translation_status(${key}, ${JSON.stringify(value)}::jsonb)`,
  );
}
export async function translatePublic(
  db: Database,
  cfg: WorkerConfig,
  job: {
    entity?: string | undefined;
    id?: string | undefined;
    locale?: string | undefined;
    fields?: string[] | undefined;
  },
  providers = configuredProviders(cfg),
) {
  if (job.locale && isCoreLocale(job.locale)) return;
  const settings = await db
    .select()
    .from(s.settings)
    .where(inArray(s.settings.key, ['i18n', 'i18n_glossary']));
  const options = obj(settings.find((r) => r.key === 'i18n')?.value),
    glossary = settings.find((r) => r.key === 'i18n_glossary')?.value;
  const targets = extraLocales(options.auto).filter(
    (locale) => !job.locale || locale === job.locale,
  );
  if (!targets.length) return;
  const all = await publicTranslationFields(db, cfg),
    source = all.filter(
      (f) =>
        (!job.entity || f.entity === job.entity) &&
        (!job.id || f.id === job.id) &&
        (!job.fields || job.fields.includes(f.field)),
    );
  const existing = new Map(
    (
      await db
        .select()
        .from(s.contentTranslations)
        .where(inArray(s.contentTranslations.locale, targets))
    ).map((row) => [
      fieldKey(row.entity, row.entityId, row.field, row.locale),
      row,
    ]),
  );
  for (const locale of targets) {
    const pending = source.filter((f) => {
      const row = existing.get(fieldKey(f.entity, f.id, f.field, locale));
      return (
        !row ||
        (row.origin === 'machine' &&
          (!row.text.trim() || row.sourceHash !== sha(f.en)))
      );
    });
    for (let i = 0; i < pending.length;) {
      const batch: PublicField[] = [],
        protectedBatch: ReturnType<typeof protectText>[] = [];
      let bytes = 0;
      while (i < pending.length && batch.length < 50) {
        const field = pending[i]!,
          protectedText = protectText(
            field.en,
            Array.isArray(glossary)
              ? glossary.filter((g): g is string => typeof g === 'string')
              : [],
            field.entity === 'ui',
          ),
          size = Buffer.byteLength(JSON.stringify(protectedText.text));
        if (size > 90000)
          throw new Error('Public field exceeds translation request budget');
        if (bytes + size > 90000 && batch.length) break;
        batch.push(field);
        protectedBatch.push(protectedText);
        bytes += size;
        i++;
      }
      const texts = protectedBatch.map((p) => p.text),
        characters = texts.reduce((n, t) => n + [...t].length, 0);
      let done = false,
        budgetBlocked = false,
        providerFailed = false;
      for (const provider of providers) {
        if (
          options.free_tier_only !== false &&
          provider.name === 'google' &&
          cfg.GOOGLE_FREE_TIER_CONFIRMED !== 'true'
        )
          continue;
        try {
          if (!(await provider.languages()).includes(locale)) continue;
        } catch {
          providerFailed = true;
          continue;
        }
        try {
          if (provider.remaining && (await provider.remaining()) < characters) {
            budgetBlocked = true;
            continue;
          }
        } catch {
          providerFailed = true;
          continue;
        }
        if (
          !(await reserveCharacters(
            db,
            provider.name,
            characters,
            Number(options.monthly_char_budget ?? 1000000),
            options.free_tier_only !== false,
          ))
        ) {
          budgetBlocked = true;
          continue;
        }
        try {
          const output = await provider.translate(texts, locale);
          if (output.length !== batch.length)
            throw new Error('Incomplete translation batch');
          const current = await publicTranslationFields(db, cfg);
          for (const [j, field] of batch.entries()) {
            if (
              !current.some(
                (f) =>
                  f.entity === field.entity &&
                  f.id === field.id &&
                  f.field === field.field &&
                  f.en === field.en,
              )
            )
              continue;
            const text = protectedBatch[j]!.restore(output[j]!);
            await db.execute(sql`
              select public.worker_save_machine_translation(
                ${field.entity}, ${field.id}, ${field.field}, ${locale},
                ${text}, ${sha(field.en)}, ${provider.name}
              )
            `);
          }
          done = true;
          break;
        } catch {
          providerFailed = true;
          /* A failed/unsafe provider result never replaces the last translation. */
        }
      }
      if (!done && providers.length)
        await writeTranslationStatus(db, 'i18n_warning', {
          code: 'TRANSLATION_PAUSED',
          at: new Date().toISOString(),
        });
      if (!done && budgetBlocked) {
        const month = new Date().toISOString().slice(0, 7);
        await db.transaction(async (tx) => {
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtext('i18n-budget-alert'))`,
          );
          const [row] = await tx
            .select()
            .from(s.settings)
            .where(eq(s.settings.key, 'i18n_budget_alert'));
          if (obj(row?.value).month !== month) {
            await writeTranslationStatus(tx, 'i18n_budget_alert', { month });
            await tx
              .insert(s.outbox)
              .values({ name: 'notify.translation.budget', data: {} });
          }
        });
      }
      if (!done && providerFailed)
        throw new Error(
          'Translation provider unavailable; retry safe public fields',
        );
    }
  }
  await refreshCoverage(db, cfg, providers);
  await db.insert(s.outbox).values({
    name: 'revalidate.web',
    data: {
      tags: [
        'site',
        'locales',
        'collections',
        ...targets.map((locale) => 'ui:' + locale),
      ],
    },
  });
}
