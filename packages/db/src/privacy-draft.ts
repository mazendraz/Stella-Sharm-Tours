import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { locales } from '@stella/shared';
import type { Database } from './index';
import * as s from './schema';

const text = z.object(
  Object.fromEntries(
    locales.map((locale) => [locale, z.string().min(1).max(10000)]),
  ),
);
const draftSchema = z.object({
  status: z.literal('draft'),
  authorship: z.literal('codex-authored'),
  review_required: z.array(z.string()).min(1),
  title: text,
  blocks: z.array(z.object({ heading: text, text })).min(1),
});

/** Prepare only: never publish legal copy or overwrite an existing privacy page. */
export async function preparePrivacyDraft(
  db: Database,
  path = new URL('../../../data/privacy-draft.json', import.meta.url),
) {
  const draft = draftSchema.parse(JSON.parse(await readFile(path, 'utf8')));
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('stella:privacy-draft'))`,
    );
    if (
      (
        await tx
          .select({ id: s.pageBlocks.id })
          .from(s.pageBlocks)
          .where(eq(s.pageBlocks.pageKey, 'privacy'))
          .limit(1)
      ).length
    )
      return { created: 0 };
    for (const [sort, block] of draft.blocks.entries()) {
      const fields = {
        title: draft.title,
        heading: block.heading,
        text: block.text,
      };
      const [row] = await tx
        .insert(s.pageBlocks)
        .values({
          pageKey: 'privacy',
          type: 'rich_text',
          sort,
          status: 'draft',
          data: {
            ...Object.fromEntries(
              Object.entries(fields).map(([field, value]) => [
                field,
                { en: value.en },
              ]),
            ),
          },
        })
        .returning({ id: s.pageBlocks.id });
      await tx.insert(s.contentTranslations).values(
        Object.entries(fields).flatMap(([field, value]) =>
          locales
            .filter((locale) => locale !== 'en')
            .map((locale) => ({
              entity: 'page_block',
              entityId: row!.id,
              field,
              locale,
              text: value[locale]!,
              sourceHash: createHash('sha256').update(value.en!).digest('hex'),
              origin: 'machine' as const,
              provider: 'codex-authored',
            })),
        ),
      );
    }
    return { created: draft.blocks.length };
  });
}
