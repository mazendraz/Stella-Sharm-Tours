import { and, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type { Database } from '@stella/db';
import { contentTranslations } from '@stella/db/schema';
import { locales } from '@stella/shared';
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export async function copyEntityTranslations(
  tx: Transaction,
  entity: string,
  from: string,
  to: string,
) {
  const values = await tx
    .select()
    .from(contentTranslations)
    .where(
      and(
        eq(contentTranslations.entity, entity),
        eq(contentTranslations.entityId, from),
      ),
    );
  if (values.length)
    await tx
      .insert(contentTranslations)
      .values(values.map(({ id: _id, ...row }) => ({ ...row, entityId: to })))
      .onConflictDoNothing();
}
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const snake = (key: string) =>
  key.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
export async function recordHumanFields(
  tx: Transaction,
  entity: string,
  id: string,
  current: unknown,
  previous: unknown,
  path = '',
) {
  const value = object(current),
    before = object(previous);
  if (typeof value.en === 'string') {
    const sourceHash = createHash('sha256').update(value.en).digest('hex');
    for (const locale of locales) {
      if (
        locale === 'en' ||
        typeof value[locale] !== 'string' ||
        !(value[locale] as string).trim()
      )
        continue;
      const [row] = await tx
        .select()
        .from(contentTranslations)
        .where(
          and(
            eq(contentTranslations.entity, entity),
            eq(contentTranslations.entityId, id),
            eq(contentTranslations.field, path),
            eq(contentTranslations.locale, locale),
          ),
        );
      // Keep the old hash when EN alone changes so the queue can flag human copy.
      if (row?.origin === 'human' && before[locale] === value[locale]) continue;
      await tx
        .insert(contentTranslations)
        .values({
          entity,
          entityId: id,
          field: path,
          locale,
          text: value[locale] as string,
          sourceHash,
          origin: 'human',
        })
        .onConflictDoUpdate({
          target: [
            contentTranslations.entity,
            contentTranslations.entityId,
            contentTranslations.field,
            contentTranslations.locale,
          ],
          set: {
            text: value[locale] as string,
            sourceHash,
            origin: 'human',
            provider: null,
            updatedAt: new Date(),
          },
        });
    }
    return;
  }
  if (Array.isArray(current)) {
    for (const [i, item] of current.entries())
      await recordHumanFields(
        tx,
        entity,
        id,
        item,
        Array.isArray(previous) ? previous[i] : undefined,
        path + `[${i}]`,
      );
    return;
  }
  for (const [key, item] of Object.entries(value))
    await recordHumanFields(
      tx,
      entity,
      id,
      item,
      before[key],
      path ? path + '.' + snake(key) : snake(key),
    );
}
