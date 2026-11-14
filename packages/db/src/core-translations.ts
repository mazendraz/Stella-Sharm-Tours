import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { Database } from './index';
import * as s from './schema';
import { locales } from '@stella/shared';
import { bundledCoreText } from '@stella/shared/i18n/core-content';
type Writer = Pick<Database, 'select' | 'insert'>;
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export async function seedCoreTranslations(db: Writer) {
  const values: (typeof s.contentTranslations.$inferInsert)[] = [];
  const add = (entity: string, id: string, field: string, value: unknown) => {
    const text = object(value);
    if (typeof text.en !== 'string' || !text.en.trim()) return;
    for (const locale of locales) {
      if (
        locale === 'en' ||
        (typeof text[locale] === 'string' && (text[locale] as string).trim())
      )
        continue;
      const translated = bundledCoreText(text.en, locale);
      if (translated === null) continue;
      values.push({
        entity,
        entityId: id,
        field,
        locale,
        text: translated,
        sourceHash: createHash('sha256').update(text.en).digest('hex'),
        origin: 'machine',
        provider: 'codex-authored',
      });
    }
  };
  for (const row of await db.select().from(s.trips)) {
    for (const key of [
      'title',
      'summary',
      'description',
      'daysLabel',
      'durationLabel',
      'seoTitle',
      'seoDescription',
    ] as const)
      add(
        'trip',
        row.id,
        key.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase()),
        row[key],
      );
    row.notes?.forEach((text, i) => add('trip', row.id, `notes[${i}]`, text));
    for (const key of ['departureLabel', 'returnLabel'] as const)
      if (row[key])
        add(
          'trip',
          row.id,
          key.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase()),
          { en: row[key] },
        );
  }
  for (const row of await db.select().from(s.tripPrices))
    add('trip_price', row.id, 'label', row.label);
  for (const row of await db.select().from(s.tripItems))
    add('trip_item', row.id, 'text', row.text);
  for (const row of await db.select().from(s.tripItinerary)) {
    add('itinerary', row.id, 'text', row.text);
    if (row.timeLabel)
      add('itinerary', row.id, 'time_label', { en: row.timeLabel });
  }
  for (const row of await db.select().from(s.collections)) {
    for (const key of ['name', 'shortName', 'headline', 'subline'] as const)
      add(
        'collection',
        row.id,
        key.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase()),
        row[key],
      );
    row.perks?.forEach((perk, i) => {
      add('collection', row.id, `perks[${i}].title`, perk.title);
      add('collection', row.id, `perks[${i}].sub`, perk.sub);
    });
  }
  for (const row of await db.select().from(s.heroSlides))
    for (const key of ['kicker', 'headline', 'subline', 'ctaLabel'] as const)
      add(
        'hero_slide',
        row.id,
        key.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase()),
        row[key],
      );
  for (const row of await db.select().from(s.media))
    add('media', row.id, 'alt', row.alt);
  for (const row of await db.select().from(s.faqs)) {
    add('faq', row.id, 'q', row.q);
    add('faq', row.id, 'a', row.a);
  }
  for (const row of await db.select().from(s.pageBlocks))
    for (const key of ['title', 'heading', 'text'])
      add('page_block', row.id, key, object(row.data)[key]);
  for (const row of await db.select().from(s.settings)) {
    if (['address', 'hours', 'legal_entity'].includes(row.key))
      add('settings', row.key, 'value', row.value);
    if (row.key === 'home')
      for (const [field, value] of Object.entries(object(row.value)))
        add('settings', 'home', field, value);
    if (row.key === 'how_steps' && Array.isArray(row.value))
      row.value.forEach((value, i) => {
        for (const key of ['title', 'text'])
          add('settings', 'how_steps', `[${i}].${key}`, object(value)[key]);
      });
  }
  for (let i = 0; i < values.length; i += 200)
    await db
      .insert(s.contentTranslations)
      .values(values.slice(i, i + 200))
      .onConflictDoUpdate({
        target: [
          s.contentTranslations.entity,
          s.contentTranslations.entityId,
          s.contentTranslations.field,
          s.contentTranslations.locale,
        ],
        set: {
          text: sql`excluded.text`,
          sourceHash: sql`excluded.source_hash`,
          provider: 'codex-authored',
          updatedAt: new Date(),
        },
        setWhere: eq(s.contentTranslations.origin, 'machine'),
      });
  return values.length;
}
