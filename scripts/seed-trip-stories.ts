import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { connectDatabase } from '../packages/db/src/index';
import type { Localized } from '../packages/db/src/schema';
import { createMediaImporter } from '../apps/api/src/media';
import { storyPatch, type Story } from '../packages/shared/src/story';

const root = fileURLToPath(new URL('../', import.meta.url));
async function read<T>(name: string): Promise<T> {
  return JSON.parse(
    await readFile(resolve(root, 'data/journeys', name + '.json'), 'utf8'),
  ) as T;
}
type Asset = {
  sha256: string;
  review: string;
  source: string | null;
  author: string | null;
  license: string | null;
  licenseUrl: string | null;
  catalogAsset?: string;
};
type Scene = Story['scenes'][number];
type Source = {
  programs: string[];
  scenes: (Pick<Scene, 'id' | 'route' | 'transport' | 'kind' | 'frame'> & {
    titleKey: string;
    captionKey: string;
    media: string;
    draftMedia?: string;
  })[];
};
const media = await read<Record<string, Asset>>('media');
const copy = await read<{
  titles: Record<string, Localized>;
  captions: Record<string, Localized>;
}>('copy');
const database = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!database) throw Error('Set DATABASE_URL');
const { db, pool } = connectDatabase(database);
try {
  const owner = await pool.query<{ id: string }>(
    "select id from admin_users where role='owner' order by created_at limit 1",
  );
  if (!owner.rows[0])
    throw Error('Seed the catalog and owner before importing stories');
  const verified = Object.fromEntries(
    Object.entries(media)
      .filter(
        ([, m]) => m.review === 'source-recorded' && m.source && m.license,
      )
      .map(([file, m]) => [
        'assets/journeys/' + file,
        {
          sha256: m.sha256,
          license: [m.license, m.licenseUrl].filter(Boolean).join(' · '),
          credit: [m.author, m.source].filter(Boolean).join(' · '),
        },
      ]),
  );
  const register = createMediaImporter(
    db,
    {
      MEDIA_ROOT: resolve(root, process.env.MEDIA_ROOT ?? '.local/media'),
      ORIGINALS_ROOT: resolve(
        root,
        process.env.ORIGINALS_ROOT ?? '.local/originals',
      ),
      FFMPEG_PATH: process.env.FFMPEG_PATH ?? 'ffmpeg',
      FFPROBE_PATH: process.env.FFPROBE_PATH ?? 'ffprobe',
    },
    root,
    { journeyAssets: verified, processImages: true, processVideos: true },
  );
  const imported = new Map<string, string | null>();
  for (const name of [
    'petra',
    'luxor',
    'cairo',
    'alexandria',
    'jerusalem',
    'sinai',
  ]) {
    const source = await read<Source>(name);
    for (const slug of source.programs) {
      const {
        rows: [trip],
      } = await pool.query<{ id: string; existing: boolean }>(
        "select id,(story is not null or exists(select 1 from content_drafts d where d.entity='trip' and d.entity_id=t.id and section='story')) as existing from trips t where slug=$1",
        [slug],
      );
      if (!trip) throw Error('Unknown trip ' + slug);
      if (trip.existing) continue;
      const scenes: Scene[] = [];
      for (const s of source.scenes) {
        const fileName = s.draftMedia ?? s.media;
        const asset = media[fileName]!,
          file = 'assets/journeys/' + fileName,
          title = copy.titles[s.titleKey]!,
          caption = copy.captions[s.captionKey]!;
        const path = asset.catalogAsset ?? (verified[file] ? file : null);
        if (path && !imported.has(path))
          imported.set(path, await register(path, title));
        scenes.push({
          id: s.id,
          route: s.route,
          kind: s.kind,
          transport: s.transport,
          frame: s.frame,
          title,
          caption,
          credit: [asset.author, asset.license, asset.licenseUrl, asset.source]
            .filter(Boolean)
            .join(' · '),
          mediaId: path ? (imported.get(path) ?? null) : null,
        });
      }
      const data = storyPatch.parse({ story: { scenes } });
      const client = await pool.connect();
      try {
        await client.query('begin');
        const {
          rows: [current],
        } = await client.query(
          'select story from trips where id=$1 for update',
          [trip.id],
        );
        if (current && current.story === null)
          await client.query(
            "insert into content_drafts(entity,entity_id,section,data,created_by) values('trip',$1,'story',$2,$3) on conflict do nothing",
            [trip.id, JSON.stringify(data), owner.rows[0].id],
          );
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
      console.log(
        slug,
        scenes.length,
        'scenes;',
        scenes.filter((s) => !s.mediaId).length,
        'await media',
      );
    }
  }
} finally {
  await pool.end();
}
