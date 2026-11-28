import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { connectDatabase } from './index';
import {
  skippedMigrations,
  skippedMessage,
  type AppliedRow,
} from './migration-order';

const folder = fileURLToPath(new URL('../drizzle', import.meta.url));

/** Journal tags next to Drizzle's own hash/timestamp, in journal order. */
export function migrationFiles(migrationsFolder = folder) {
  const journal = JSON.parse(
    readFileSync(migrationsFolder + '/meta/_journal.json', 'utf8'),
  ) as { entries: { tag: string }[] };
  return readMigrationFiles({ migrationsFolder }).map((file, index) => ({
    tag: journal.entries[index]!.tag,
    hash: file.hash,
    folderMillis: file.folderMillis,
  }));
}

/** `migrationsFolder` is for migration-order rehearsals; deploys use the default. */
export async function migrateDatabase(url: string, migrationsFolder = folder) {
  const { db, pool } = connectDatabase(url);
  try {
    // Stop before Drizzle would silently skip an older, unapplied file.
    const exists = await pool.query<{ ok: boolean }>(
      "SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS ok",
    );
    if (exists.rows[0]?.ok) {
      const applied = await pool.query<AppliedRow>(
        'SELECT hash, created_at FROM drizzle.__drizzle_migrations',
      );
      const skipped = skippedMigrations(
        migrationFiles(migrationsFolder),
        applied.rows,
      );
      if (skipped.length) throw new Error(skippedMessage(skipped));
    }
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}
