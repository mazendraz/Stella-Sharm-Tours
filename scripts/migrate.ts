import { connectDatabase } from '../packages/db/src/index';
import { migrateDatabase } from '../packages/db/src/migration-service';
import { migrateQueues } from '../apps/api/src/migration-jobs';
import { applyRuntimePrivileges } from '../packages/db/src/runtime-privileges';
const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('Set MIGRATION_DATABASE_URL');
const { pool } = connectDatabase(url);
try {
  await migrateDatabase(url);
  await migrateQueues(url);
  await applyRuntimePrivileges(pool);
  console.log('Database and job queues migrated');
} finally {
  await pool.end();
}
