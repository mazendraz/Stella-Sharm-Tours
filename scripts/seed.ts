import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { connectDatabase } from '../packages/db/src/index';
import { seedCatalog } from '../packages/db/src/seed-data';
import { createMediaImporter } from '../apps/api/src/media';
if (
  !(process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL) ||
  !process.env.SEED_OWNER_EMAIL
)
  throw new Error('Set DATABASE_URL and SEED_OWNER_EMAIL');
const repo = fileURLToPath(new URL('../', import.meta.url)),
  { db, pool } = connectDatabase(
    (process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL)!,
  );
try {
  const result = await seedCatalog(db, {
    catalogPath: new URL('../data/catalog.json', import.meta.url),
    ownerEmail: process.env.SEED_OWNER_EMAIL,
    importMedia: createMediaImporter(
      db,
      {
        MEDIA_ROOT: resolve(repo, process.env.MEDIA_ROOT ?? '.local/media'),
        ORIGINALS_ROOT: resolve(
          repo,
          process.env.ORIGINALS_ROOT ?? '.local/originals',
        ),
        FFMPEG_PATH: process.env.FFMPEG_PATH ?? 'ffmpeg',
        FFPROBE_PATH: process.env.FFPROBE_PATH ?? 'ffprobe',
      },
      repo,
      { processVideos: true, processImages: true },
    ),
  });
  console.log(
    `Seeded ${result.collections} collections, ${result.trips} trips, ${result.packages} draft packages`,
  );
  if (result.setupToken && process.env.SEED_SETUP_FILE) {
    await writeFile(
      resolve(process.env.SEED_SETUP_FILE),
      new URL(
        '/auth/setup?token=' + result.setupToken,
        process.env.ADMIN_ORIGIN ?? 'http://localhost:3001',
      ).href,
      { mode: 0o600 },
    );
    console.log(
      'One-time setup link saved to the requested private local file (30-minute expiry).',
    );
  } else if (result.setupToken)
    console.log(
      'One-time owner setup (expires in 30 minutes): ' +
        new URL(
          '/auth/setup?token=' + result.setupToken,
          process.env.ADMIN_ORIGIN ?? 'http://localhost:3001',
        ).href,
    );
} finally {
  await pool.end();
}
