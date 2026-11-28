// Adds the re-verified FAQ answers (data/content/faq-verified.json, home
// "faq") to the FAQ list as DRAFTS. An owner or manager reads them in the
// admin (Pages → FAQ) and publishes them; nothing here goes live by itself.
// Questions that already exist (same English question, any status) are
// skipped, so staff edits are never overwritten.
//
//   pnpm db:seed-faq
import { readFile } from 'node:fs/promises';
import { connectDatabase } from '../packages/db/src/index';
import { faqs } from '../packages/db/src/schema';
import { verifiedFaqFile } from '../packages/shared/src/faq-verified';

const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('Set DATABASE_URL');

export async function seedFaqDrafts(
  db: ReturnType<typeof connectDatabase>['db'],
  file = new URL('../data/content/faq-verified.json', import.meta.url),
) {
  const { items } = verifiedFaqFile.parse(
    JSON.parse(await readFile(file, 'utf8')),
  );
  const general = items.filter((item) => item.home === 'faq');
  // drizzle-orm is not a root dependency: read the (small) list and compare
  // in JS.
  const rows = await db.select({ q: faqs.q, sort: faqs.sort }).from(faqs);
  const existing = new Set(rows.map((r) => r.q.en.trim().toLowerCase()));
  const max = Math.max(0, ...rows.map((r) => r.sort));
  const fresh = general.filter(
    (item) => !existing.has(item.q.en.trim().toLowerCase()),
  );
  if (fresh.length)
    await db.insert(faqs).values(
      fresh.map((item, i) => ({
        q: item.q,
        a: item.a,
        sort: max + 10 * (i + 1),
        status: 'draft' as const,
      })),
    );
  return { inserted: fresh.length, skipped: general.length - fresh.length };
}

if (
  import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}` ||
  process.argv[1]?.endsWith('seed-faq-drafts.ts')
) {
  const { db, pool } = connectDatabase(url);
  try {
    console.log(await seedFaqDrafts(db));
  } finally {
    await pool.end();
  }
}
