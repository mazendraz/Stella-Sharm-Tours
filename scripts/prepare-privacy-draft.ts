import { connectDatabase } from '../packages/db/src/index';
import { preparePrivacyDraft } from '../packages/db/src/privacy-draft';
const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('Database URL required');
const { db, pool } = connectDatabase(url);
try {
  const result = await preparePrivacyDraft(db);
  console.log(
    `Prepared ${result.created} unpublished privacy blocks; existing privacy content is preserved.`,
  );
} finally {
  await pool.end();
}
