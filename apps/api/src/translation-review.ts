import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { Database } from '@stella/db';
import * as s from '@stella/db/schema';
import { fail } from './errors';
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
export const jsonPathSql = (values: string[]) =>
  sql`ARRAY[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::text[]`;
export function translationDraftId(input: {
  entity: string;
  id: string;
  field: string;
  locale: string;
}) {
  const hash = createHash('sha256')
    .update([input.entity, input.id, input.field, input.locale].join(':'))
    .digest('hex')
    .slice(0, 32);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20)}`;
}
export async function revalidateTranslations(tx: Tx, locale: string) {
  const trips = await tx.select({ slug: s.trips.slug }).from(s.trips),
    collections = await tx
      .select({ slug: s.collections.slug })
      .from(s.collections);
  await tx.insert(s.outbox).values({
    name: 'revalidate.web',
    data: {
      tags: [
        'site',
        'collections',
        'faq',
        'ui:' + locale,
        ...['contact', 'privacy', 'terms', 'cancellation'].map(
          (key) => 'page:' + key,
        ),
        ...trips.map((row) => 'trip:' + row.slug),
        ...collections.map((row) => 'collection:' + row.slug),
      ],
    },
  });
}
const selector = z.strictObject({
  entity: z.enum([
    'trip',
    'collection',
    'hero_slide',
    'faq',
    'page_block',
    'media',
    'settings',
    'ui',
    'trip_item',
    'trip_price',
    'itinerary',
  ]),
  id: z.string().min(1).max(120),
  field: z.string().min(1).max(120),
  locale: z
    .string()
    .regex(/^[a-z]{2,3}$/)
    .refine((value) => value !== 'en'),
});
export const translationReviewSchema = selector
  .extend({
    source: z.string().min(1).max(20000),
    text: z.string().trim().min(1).max(20000),
  })
  .strict();
export function translationTarget(input: z.infer<typeof selector>) {
  const path = input.field
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);
  const map: Record<string, [string, string[]]> = {
    trip: [
      'trips',
      [
        'title',
        'summary',
        'description',
        'days_label',
        'duration_label',
        'departure_label',
        'return_label',
        'seo_title',
        'seo_description',
        'notes',
      ],
    ],
    collection: [
      'collections',
      ['name', 'short_name', 'headline', 'subline', 'perks'],
    ],
    hero_slide: ['hero_slides', ['headline', 'kicker', 'subline', 'cta_label']],
    media: ['media', ['alt']],
    faq: ['faqs', ['q', 'a']],
    trip_item: ['trip_items', ['text']],
    trip_price: ['trip_prices', ['label']],
    itinerary: ['trip_itinerary', ['text', 'time_label']],
  };
  if (input.entity === 'ui') return null;
  if (input.entity === 'settings')
    return {
      table: 'settings',
      column: 'value',
      key: 'key',
      path: input.field === 'value' ? [] : path,
      scalar: false,
    };
  if (input.entity === 'page_block')
    return {
      table: 'page_blocks',
      column: 'data',
      key: 'id',
      path,
      scalar: false,
    };
  const definition = map[input.entity],
    column = path.shift();
  if (!definition || !column || !definition[1].includes(column))
    fail(422, 'INVALID_TRANSLATION_FIELD');
  const scalar = ['departure_label', 'return_label', 'time_label'].includes(
    column,
  );
  if (scalar && path.length) fail(422, 'INVALID_TRANSLATION_FIELD');
  return { table: definition[0], column, key: 'id', path, scalar };
}
export async function updateTranslationValue(
  tx: Tx,
  input: z.infer<typeof selector>,
  text: string | null,
  expectedSource?: string,
) {
  const target = translationTarget(input);
  if (!target) return;
  const table = sql.identifier(target.table),
    column = sql.identifier(target.column),
    key = sql.identifier(target.key);
  const current = await tx.execute<{
    value: Record<string, string> | string | null;
  }>(
    sql`select ${target.scalar ? column : sql`${column} #> ${jsonPathSql(target.path)}`} as value from ${table} where ${key}::text=${input.id} for update`,
  );
  if (!current.rows.length) fail(404, 'NOT_FOUND');
  if (
    expectedSource !== undefined &&
    (target.scalar
      ? current.rows[0]!.value
      : (current.rows[0]!.value as Record<string, string> | null)?.en) !==
      expectedSource
  )
    fail(409, 'TRANSLATION_STALE');
  if (target.scalar) return;
  const path = [...target.path, input.locale];
  await tx.execute(
    text === null
      ? sql`update ${table} set ${column}=${column} #- ${jsonPathSql(path)} where ${key}::text=${input.id}`
      : sql`update ${table} set ${column}=jsonb_set(${column},${jsonPathSql(path)},to_jsonb(${text}::text),true) where ${key}::text=${input.id}`,
  );
}
export async function restoreTranslation(tx: Tx, snapshot: unknown) {
  const data = z
    .object({
      target: selector,
      previous: z.string().nullable(),
      row: z
        .object({
          text: z.string(),
          sourceHash: z.string(),
          origin: z.enum(['human', 'machine']),
          provider: z.string().nullable(),
        })
        .nullable(),
    })
    .parse(snapshot);
  const where = and(
    eq(s.contentTranslations.entity, data.target.entity),
    eq(s.contentTranslations.entityId, data.target.id),
    eq(s.contentTranslations.field, data.target.field),
    eq(s.contentTranslations.locale, data.target.locale),
  );
  const [current] = await tx.select().from(s.contentTranslations).where(where);
  const target = translationTarget(data.target);
  let previous: string | null = null;
  if (target && !target.scalar) {
    const result = await tx.execute<{ value: string | null }>(
      sql`select ${sql.identifier(target.column)} #>> ${jsonPathSql([...target.path, data.target.locale])} as value from ${sql.identifier(target.table)} where ${sql.identifier(target.key)}::text=${data.target.id}`,
    );
    previous = result.rows[0]?.value ?? null;
  }
  await updateTranslationValue(tx, data.target, data.previous);
  await tx.delete(s.contentTranslations).where(where);
  if (data.row)
    await tx.insert(s.contentTranslations).values({
      entity: data.target.entity,
      entityId: data.target.id,
      field: data.target.field,
      locale: data.target.locale,
      ...data.row,
    });
  return {
    target: data.target,
    previous,
    row: current
      ? {
          text: current.text,
          sourceHash: current.sourceHash,
          origin: current.origin,
          provider: current.provider,
        }
      : null,
  };
}
