import { describe, expect, it } from 'vitest';
import { skippedMigrations, skippedMessage } from './migration-order';
import { migrationFiles } from './migration-service';

const file = (tag: string, folderMillis: number) => ({
  tag,
  hash: 'h-' + tag,
  folderMillis,
});

describe('migration order guard', () => {
  it('finds unapplied migrations older than the newest applied one', () => {
    // Phase 3 (0017/0018) deployed first; Google Reviews merged afterwards.
    const files = [
      file('0015_search_keywords', 100),
      file('0014_request_display_currency', 205),
      file('0016_google_reviews', 307),
      file('0017_content_pages_and_visibility', 484),
      file('0018_verification_facts', 502),
    ];
    const applied = [
      { hash: 'h-0015_search_keywords', created_at: '100' },
      { hash: 'h-0017_content_pages_and_visibility', created_at: '484' },
      { hash: 'h-0018_verification_facts', created_at: 502 },
    ];
    const skipped = skippedMigrations(files, applied);
    expect(skipped.map((m) => m.tag)).toEqual([
      '0014_request_display_currency',
      '0016_google_reviews',
    ]);
    expect(skippedMessage(skipped)).toContain(
      "VALUES ('h-0016_google_reviews', 307)",
    );
  });

  it('allows fresh databases, pending newer files and edited applied files', () => {
    const files = [file('0001', 1), file('0002', 2), file('0003', 3)];
    expect(skippedMigrations(files, [])).toEqual([]);
    expect(
      skippedMigrations(files, [{ hash: 'h-0001', created_at: 1 }]),
    ).toEqual([]);
    // 0002 was edited after being applied: same timestamp, new hash.
    expect(
      skippedMigrations(files, [
        { hash: 'h-0001', created_at: 1 },
        { hash: 'old-hash', created_at: 2 },
      ]),
    ).toEqual([]);
  });

  it('keeps this branch journal strictly increasing and in step with the files', () => {
    const files = migrationFiles();
    expect(files.at(-1)!.tag).toBe('0018_verification_facts');
    files.slice(1).forEach((m, i) => {
      expect(m.folderMillis).toBeGreaterThan(files[i]!.folderMillis);
    });
  });
});
