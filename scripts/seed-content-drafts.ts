// Inserts the first content drafts (data/content/guides-draft.json) as
// DRAFTS. Existing slugs are skipped, so it never overwrites staff edits and
// never publishes anything.
//
//   pnpm db:seed-content
import { readFile } from 'node:fs/promises';
import { inArray } from 'drizzle-orm';
import { connectDatabase } from '../packages/db/src/index';
import { contentPages } from '../packages/db/src/schema';
import { contentPageInput } from '../packages/shared/src/content';

const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('Set DATABASE_URL');

export async function seedContentDrafts(
  db: ReturnType<typeof connectDatabase>['db'],
  file = new URL('../data/content/guides-draft.json', import.meta.url),
) {
  const { pages } = JSON.parse(await readFile(file, 'utf8')) as {
    pages: unknown[];
  };
  const parsed = pages.map((p) => contentPageInput.parse(p));
  const existing = new Set(
    (
      await db
        .select({ slug: contentPages.slug })
        .from(contentPages)
        .where(
          inArray(
            contentPages.slug,
            parsed.map((p) => p.slug),
          ),
        )
    ).map((r) => r.slug),
  );
  const fresh = parsed.filter((p) => !existing.has(p.slug));
  if (fresh.length)
    await db.insert(contentPages).values(
      fresh.map((p, sort) => ({
        slug: p.slug,
        kind: p.kind,
        category: p.category ?? null,
        title: p.title,
        summary: p.summary ?? null,
        body: p.body ?? null,
        relatedTrips: p.relatedTrips ?? [],
        relatedPages: p.relatedPages ?? [],
        sort,
        status: 'draft' as const,
      })),
    );
  return { inserted: fresh.length, skipped: existing.size };
}

if (
  import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}` ||
  process.argv[1]?.endsWith('seed-content-drafts.ts')
) {
  const { db, pool } = connectDatabase(url);
  try {
    console.log(await seedContentDrafts(db));
  } finally {
    await pool.end();
  }
}
