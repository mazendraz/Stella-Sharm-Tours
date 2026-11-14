import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { connectDatabase } from './index';
if (!process.env.DATABASE_URL) throw new Error('Missing DATABASE_URL');
const { db, pool } = connectDatabase(process.env.DATABASE_URL);
try {
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
  });
} finally {
  await pool.end();
}
