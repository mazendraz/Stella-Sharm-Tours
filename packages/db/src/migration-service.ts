import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { connectDatabase } from './index';
export async function migrateDatabase(url: string) {
  const { db, pool } = connectDatabase(url);
  try {
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
    });
  } finally {
    await pool.end();
  }
}
