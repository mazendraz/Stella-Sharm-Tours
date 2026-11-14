// Re-applies the media in data/catalog.json to an existing database.
// `pnpm db:seed` only inserts what is missing, so after changing videos or
// covers in the catalog run this instead:  pnpm db:sync-media
//
// For every collection it sets the cover + hero video and updates that
// collection's homepage hero slide. For every trip it replaces the cover and
// video (gallery images are left alone). Then it asks the web app to refresh.
// Note: this overwrites cover/video choices made in the dashboard.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { connectDatabase } from '../packages/db/src/index';
import { createMediaImporter } from '../apps/api/src/media';

type Text = string | ({ en: string } & Record<string, string>);
type Catalog = {
  collections: {
    id: string;
    name: Text;
    cover?: string | null;
    hero_video?: string | null;
    // Optional phone version of the hero video (vertical). When set, the
    // homepage gets a phone slide with it and a desktop slide with hero_video.
    hero_video_mobile?: string | null;
  }[];
  trips: {
    slug: string;
    title: Text;
    media?: { cover?: string | null; video?: string | null };
  }[];
};

const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('Set DATABASE_URL');
const repo = fileURLToPath(new URL('../', import.meta.url));
const { db, pool } = connectDatabase(url);
const asText = (v: Text) => (typeof v === 'string' ? { en: v } : v);
// Plain SQL through the same pool (drizzle-orm isn't a root dependency).
const q = <T = Record<string, unknown>>(text: string, values: unknown[] = []) =>
  pool.query(text, values).then((r) => r.rows as T[]);

try {
  const catalog = JSON.parse(
    await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'),
  ) as Catalog;
  const importMedia = createMediaImporter(
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
  );
  const usable = async (id: string | null) => {
    if (!id) return null;
    const [m] = await q<{ ok: boolean }>(
      "select status = 'ready' and rights_status <> 'unknown' as ok from media where id = $1",
      [id],
    );
    return m?.ok ? id : null;
  };
  const tags = new Set(['site', 'collections']);

  for (const c of catalog.collections) {
    const [row] = await q<{ id: string; cover_media_id: string | null }>(
      'select id, cover_media_id from collections where slug = $1',
      [c.id],
    );
    if (!row) continue;
    console.log('collection', c.id);
    const cover = c.cover ? await importMedia(c.cover, asText(c.name)) : null;
    const video = c.hero_video
      ? await importMedia(c.hero_video, asText(c.name))
      : null;
    await q(
      'update collections set cover_media_id = $2, hero_video_id = $3 where id = $1',
      [row.id, cover, video],
    );
    const mobile = c.hero_video_mobile
      ? await importMedia(c.hero_video_mobile, asText(c.name))
      : null;
    const image = cover ?? row.cover_media_id;
    const slides = await q<{ id: string; show_on: string }>(
      'select id, show_on from hero_slides where collection_id = $1 and archived_at is null order by created_at',
      [row.id],
    );
    if (!mobile) {
      await q(
        'update hero_slides set image_media_id = $2, video_media_id = $3 where collection_id = $1',
        [row.id, image, await usable(video)],
      );
    } else {
      // One slide per device so each gets a video framed for its shape.
      const phone = slides.find((x) => x.show_on !== 'desktop'),
        desk = slides.find((x) => x.show_on === 'desktop');
      if (phone)
        await q(
          "update hero_slides set show_on = 'mobile', image_media_id = $2, video_media_id = $3, duration_s = 6 where id = $1",
          [phone.id, image, await usable(mobile)],
        );
      if (desk)
        await q(
          'update hero_slides set image_media_id = $2, video_media_id = $3, duration_s = 6 where id = $1',
          [desk.id, image, await usable(video)],
        );
      else if (phone)
        await q(
          `insert into hero_slides (video_media_id, image_media_id, collection_id, kicker, headline, subline,
             cta_type, cta_target, cta_label, duration_s, show_on, starts_at, ends_at, sort, status)
           select $2, image_media_id, collection_id, kicker, headline, subline,
             cta_type, cta_target, cta_label, 6, 'desktop', starts_at, ends_at, sort, status
           from hero_slides where id = $1`,
          [phone.id, await usable(video)],
        );
    }
  }

  for (const t of catalog.trips) {
    const [row] = await q<{ id: string }>(
      'select id from trips where slug = $1',
      [t.slug],
    );
    if (!row) continue;
    for (const role of ['cover', 'video'] as const) {
      const path = t.media?.[role];
      if (!path) continue;
      const mediaId = await importMedia(path, asText(t.title));
      if (!mediaId) continue;
      await q('delete from trip_media where trip_id = $1 and role = $2', [
        row.id,
        role,
      ]);
      await q(
        'insert into trip_media (trip_id, media_id, role, sort) values ($1, $2, $3, 0)',
        [row.id, mediaId, role],
      );
    }
    tags.add('trip:' + t.slug);
    console.log('trip', t.slug);
  }

  await q('insert into outbox (name, data) values ($1, $2)', [
    'revalidate.web',
    JSON.stringify({ tags: [...tags] }),
  ]);
  console.log('Done. The website refreshes within a minute.');
} finally {
  await pool.end();
}
