import { connectDatabase } from '../packages/db/src/index';
import { migrateDatabase } from '../packages/db/src/migration-service';
import { migrateQueues } from '../apps/api/src/migration-jobs';
const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('Set MIGRATION_DATABASE_URL');
const { pool } = connectDatabase(url);
try {
  await migrateDatabase(url);
  await migrateQueues(url);
  for (const role of ['stella_api', 'stella_worker']) {
    const exists = await pool.query('select 1 from pg_roles where rolname=$1', [
      role,
    ]);
    if (!exists.rows.length) continue;
    await pool.query(`grant usage on schema public to "${role}"`);
    await pool.query(
      `grant select,insert,update,delete on all tables in schema public to "${role}"`,
    );
    await pool.query(
      `grant usage,select on all sequences in schema public to "${role}"`,
    );
  }
  const worker = await pool.query(
    "select 1 from pg_roles where rolname='stella_worker'",
  );
  if (worker.rows.length) {
    await pool.query('grant usage on schema pgboss to stella_worker');
    await pool.query(
      'grant select,insert,update,delete on all tables in schema pgboss to stella_worker',
    );
    await pool.query(
      'grant usage,select on all sequences in schema pgboss to stella_worker',
    );
    await pool.query(
      'alter default privileges in schema pgboss grant select,insert,update,delete on tables to stella_worker',
    );
    await pool.query(
      'alter default privileges in schema pgboss grant usage,select on sequences to stella_worker',
    );
  }
  console.log('Database and job queues migrated');
} finally {
  await pool.end();
}
