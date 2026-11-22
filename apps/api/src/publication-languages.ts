import { createHash } from 'node:crypto';
import { and, eq, inArray, or } from 'drizzle-orm';
import type { Database } from '@stella/db';
import { contentTranslations } from '@stella/db/schema';
import { locales } from '@stella/shared';
import { fail } from './errors';

type Scope = { entity: string; id: string; copy: unknown };
const key = (entity: string, id: string, path: string, locale: string) =>
  JSON.stringify([entity, id, path, locale]);

export async function requireCoreCopy(
  db: Pick<Database, 'select'>,
  scopes: Scope[],
) {
  if (!scopes.length) return;
  const entities = [...new Set(scopes.map((scope) => scope.entity))];
  const translations = await db
    .select()
    .from(contentTranslations)
    .where(
      and(
        eq(contentTranslations.origin, 'human'),
        inArray(
          contentTranslations.locale,
          locales.filter((locale) => locale !== 'en'),
        ),
        or(
          ...entities.map((entity) =>
            and(
              eq(contentTranslations.entity, entity),
              inArray(
                contentTranslations.entityId,
                scopes
                  .filter((scope) => scope.entity === entity)
                  .map((scope) => scope.id),
              ),
            ),
          ),
        ),
      ),
    );
  const approved = new Map(
    translations.map((row) => [
      key(row.entity, row.entityId, row.field, row.locale),
      row,
    ]),
  );
  function check(scope: Scope, value: unknown, path: string) {
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        check(scope, item, path + '[' + index + ']'),
      );
      return;
    }
    if (!value || typeof value !== 'object') return;
    const fields = value as Record<string, unknown>;
    if (typeof fields.en !== 'string') {
      for (const [field, child] of Object.entries(fields)) {
        const snake = field.replace(
          /[A-Z]/g,
          (char) => '_' + char.toLowerCase(),
        );
        check(scope, child, path ? path + '.' + snake : snake);
      }
      return;
    }
    const en = fields.en;
    if (!en.trim()) fail(422, 'CORE_TRANSLATIONS_REQUIRED');
    // Numeric labels carry the same fact in all seven languages.
    const numeric = /^[\d\s:+/.,()~–—-]+$/u.test(en);
    const hash = createHash('sha256').update(en).digest('hex');
    for (const locale of locales) {
      if (locale === 'en') continue;
      const value = fields[locale];
      const row = approved.get(key(scope.entity, scope.id, path, locale));
      if (typeof value === 'string') {
        if (!value.trim() || (row?.text === value && row.sourceHash !== hash))
          fail(422, 'CORE_TRANSLATIONS_REQUIRED');
      } else if (!numeric && (!row?.text.trim() || row.sourceHash !== hash)) {
        fail(422, 'CORE_TRANSLATIONS_REQUIRED');
      }
    }
  }
  for (const scope of scopes) check(scope, scope.copy, '');
}
