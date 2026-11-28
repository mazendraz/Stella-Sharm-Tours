/**
 * Drizzle applies a migration only when its journal timestamp is newer than
 * the newest one already recorded in the database; an older, unapplied file is
 * skipped without any message. That happens when two branches each add
 * migrations and the one with the newer timestamps is deployed first (for
 * example SEO phase 3's 0017/0018 before Google Reviews' 0014/0016).
 *
 * This finds those files so `migrate` can stop instead of silently leaving the
 * schema incomplete. A file counts as applied when its hash or its timestamp
 * is recorded (a reviewed edit of an applied file keeps its timestamp).
 */
export type MigrationFile = { tag: string; hash: string; folderMillis: number };
export type AppliedRow = { hash: string; created_at: string | number };

export function skippedMigrations(
  files: MigrationFile[],
  applied: AppliedRow[],
): MigrationFile[] {
  if (!applied.length) return [];
  const hashes = new Set(applied.map((row) => row.hash)),
    times = new Set(applied.map((row) => Number(row.created_at))),
    newest = Math.max(...times);
  return files.filter(
    (file) =>
      file.folderMillis <= newest &&
      !hashes.has(file.hash) &&
      !times.has(file.folderMillis),
  );
}

export function skippedMessage(skipped: MigrationFile[]) {
  return (
    'Migrations older than the newest applied one would be skipped by ' +
    'Drizzle: ' +
    skipped.map((m) => m.tag).join(', ') +
    '. Re-stamp them after the newest migration (new file number and journal ' +
    '"when"), or apply each file by hand and record it with: ' +
    skipped
      .map(
        (m) =>
          `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('${m.hash}', ${m.folderMillis});`,
      )
      .join(' ') +
    ' See docs/RUNBOOK.md.'
  );
}
