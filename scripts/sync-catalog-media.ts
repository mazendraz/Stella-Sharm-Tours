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
import { seedCoreTranslations } from '../packages/db/src/core-translations';

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
    media?: {
      cover?: string | null;
      video?: string | null;
      gallery?: string[];
    };
    highlights?: string[];
    includes?: string[];
    itinerary?: [string | null, string][];
  }[];
  packages: {
    slug: string;
    title: string;
    summary?: string;
    cover?: string;
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

async function main() {
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

  if (process.argv.includes('--hero-only')) {
    const replacements = [];
    for (const c of catalog.collections) {
      if (!c.hero_video || !c.hero_video_mobile) continue;
      const desktop = await usable(
        await importMedia(c.hero_video, asText(c.name)),
      );
      const mobile = await usable(
        await importMedia(c.hero_video_mobile, asText(c.name)),
      );
      if (!desktop || !mobile)
        throw new Error(`Hero videos are not ready for ${c.id}`);
      replacements.push({ slug: c.id, desktop, mobile });
    }
    await db.transaction(async (tx) => {
      const { sql } = await import('../apps/api/node_modules/drizzle-orm');
      for (const { slug, desktop, mobile } of replacements) {
        const { rows: slides } = await tx.execute<{
          id: string;
          show_on: string;
        }>(sql`
          select h.id, h.show_on from hero_slides h
          join collections c on c.id = h.collection_id
          where c.slug = ${slug} and h.archived_at is null
            and h.cta_type = 'collection' and h.cta_target = ${slug}
          for update of h
        `);
        if (slides.length === 1 && slides[0]?.show_on === 'all') {
          const id = slides[0].id;
          await tx.execute(sql`
            insert into hero_slides (video_media_id, image_media_id, collection_id,
              kicker, headline, subline, cta_type, cta_target, cta_label, duration_s,
              show_on, starts_at, ends_at, sort, status)
            select ${desktop}, image_media_id, collection_id, kicker, headline, subline,
              cta_type, cta_target, cta_label, duration_s, 'desktop', starts_at, ends_at,
              sort, status from hero_slides where id = ${id}
          `);
          await tx.execute(sql`
            update hero_slides set video_media_id = ${mobile}, show_on = 'mobile'
            where id = ${id}
          `);
          continue;
        }
        const phone = slides.find((slide) => slide.show_on === 'mobile');
        const desk = slides.find((slide) => slide.show_on === 'desktop');
        if (slides.length !== 2 || !phone || !desk)
          throw new Error(
            `Expected one shared hero slide or one per device for ${slug}`,
          );
        await tx.execute(
          sql`update hero_slides set video_media_id = ${mobile} where id = ${phone.id}`,
        );
        await tx.execute(
          sql`update hero_slides set video_media_id = ${desktop} where id = ${desk.id}`,
        );
      }
      await tx.execute(sql`
        insert into outbox (name, data) values ('revalidate.web', ${JSON.stringify({ tags: ['site'] })}::jsonb)
      `);
    });
    console.log(`Updated ${replacements.length} homepage hero pairs.`);
    return;
  }

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
    // Text and galleries: only fill what is still empty, never overwrite
    // content staff wrote in the dashboard.
    const filled: string[] = [];
    const count = async (sql: string) =>
      Number((await q<{ n: string }>(sql, [row.id]))[0]?.n ?? 0);
    if (t.highlights?.length) {
      const [trip] = await q<{ summary: unknown }>(
        'select summary from trips where id = $1',
        [row.id],
      );
      if (!trip?.summary) {
        await q('update trips set summary = $2 where id = $1', [
          row.id,
          JSON.stringify({ en: t.highlights.slice(0, 3).join(' · ') }),
        ]);
        filled.push('summary');
      }
    }
    for (const [key, type] of [
      ['highlights', 'highlight'],
      ['includes', 'include'],
    ] as const) {
      const values = t[key] ?? [];
      if (
        values.length &&
        !(await count(
          `select count(*) n from trip_items where trip_id = $1 and type = '${type}'`,
        ))
      ) {
        for (const [i, en] of values.entries())
          await q(
            'insert into trip_items (trip_id, type, text, sort) values ($1, $2, $3, $4)',
            [row.id, type, JSON.stringify({ en }), i],
          );
        filled.push(key);
      }
    }
    if (
      t.itinerary?.length &&
      !(await count('select count(*) n from trip_itinerary where trip_id = $1'))
    ) {
      for (const [i, [time, en]] of t.itinerary.entries())
        await q(
          'insert into trip_itinerary (trip_id, time_label, text, sort) values ($1, $2, $3, $4)',
          [row.id, time, JSON.stringify({ en }), i],
        );
      filled.push('day plan');
    }
    if (
      t.media?.gallery?.length &&
      !(await count(
        "select count(*) n from trip_media where trip_id = $1 and role = 'gallery'",
      ))
    ) {
      for (const [i, path] of t.media.gallery.entries()) {
        const mediaId = await importMedia(path, asText(t.title));
        if (mediaId)
          await q(
            "insert into trip_media (trip_id, media_id, role, sort) values ($1, $2, 'gallery', $3) on conflict do nothing",
            [row.id, mediaId, i],
          );
      }
      filled.push('gallery');
    }
    tags.add('trip:' + t.slug);
    console.log('trip', t.slug, filled.length ? '+ ' + filled.join(', ') : '');
  }

  for (const p of catalog.packages ?? []) {
    const [row] = await q<{ id: string; summary: unknown }>(
      'select id, summary from trips where slug = $1',
      [p.slug],
    );
    if (!row) continue;
    if (p.summary && !row.summary)
      await q('update trips set summary = $2 where id = $1', [
        row.id,
        JSON.stringify({ en: p.summary }),
      ]);
    if (p.cover) {
      const mediaId = await importMedia(p.cover, { en: p.title });
      const [has] = await q(
        "select 1 from trip_media where trip_id = $1 and role = 'cover'",
        [row.id],
      );
      if (mediaId && !has)
        await q(
          "insert into trip_media (trip_id, media_id, role, sort) values ($1, $2, 'cover', 0)",
          [row.id, mediaId],
        );
    }
    console.log('package', p.slug);
  }

  // Add the bundled IT/ES/FR/DE/RU/TR text for the new English content.
  console.log('translations', await seedCoreTranslations(db));

  await q('insert into outbox (name, data) values ($1, $2)', [
    'revalidate.web',
    JSON.stringify({ tags: [...tags] }),
  ]);
  console.log('Done. The website refreshes within a minute.');
}

try {
  await main();
} finally {
  await pool.end();
}
