import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, stat, copyFile, rename, rm } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform, Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import { fileTypeFromFile } from 'file-type';
import Busboy from 'busboy';
import sharp from 'sharp';
import { z } from 'zod';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { Database } from '@stella/db';
import {
  media,
  outbox,
  publicMediaRenditions,
  type Localized,
} from '@stella/db/schema';
import type { Config } from './config';
import type { ApiEnv } from './types';
import { fail } from './errors';
export const imageMimes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/avif',
]);
export const videoMimes = new Set(['video/mp4', 'video/quicktime']);
export function inside(root: string, ...parts: string[]) {
  const base = resolve(root),
    path = resolve(base, ...parts),
    rel = relative(base, path);
  if (rel.startsWith('..') || isAbsolute(rel))
    throw new Error('Invalid storage path');
  return path;
}
export async function digestFile(path: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
export function runTool(
  command: string,
  args: string[],
  timeout = 120000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      // Codec subprocesses need paths/temp settings, never app/DB/auth/provider secrets.
      env: Object.fromEntries(
        Object.entries(process.env).filter(
          ([key, value]) =>
            value !== undefined &&
            /^(path|systemroot|windir|temp|tmp|tmpdir|home|lang|lc_all|github_workspace)$/i.test(
              key,
            ),
        ),
      ) as NodeJS.ProcessEnv,
    });
    let output = '',
      size = 0;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Media tool timeout'));
    }, timeout);
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1000000) {
        child.kill('SIGKILL');
        return;
      }
      output += chunk.toString();
    });
    child.stderr.resume();
    child.once('error', () => {
      clearTimeout(timer);
      reject(new Error('Media tool unavailable'));
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (code === 0 && size <= 1000000) resolve(output);
      else reject(new Error('Media processing failed'));
    });
  });
}
export async function validateFile(
  path: string,
  cfg: Pick<Config, 'FFPROBE_PATH'>,
) {
  const info = await stat(path);
  if (info.size > 300 * 1024 * 1024) fail(413, 'UPLOAD_TOO_LARGE');
  let type;
  try {
    type = await fileTypeFromFile(path);
  } catch {
    fail(422, 'INVALID_MEDIA');
  }
  if (!type) fail(422, 'UNSUPPORTED_MEDIA');
  if (imageMimes.has(type.mime)) {
    if (info.size > 25 * 1024 * 1024) fail(413, 'UPLOAD_TOO_LARGE');
    if (['image/heic', 'image/heif'].includes(type.mime)) {
      let streams: {
        width?: number | undefined;
        height?: number | undefined;
        codec_name?: string | undefined;
      }[];
      try {
        const result = JSON.parse(
          await runTool(
            cfg.FFPROBE_PATH,
            [
              '-v',
              'error',
              '-protocol_whitelist',
              'file,pipe',
              '-show_entries',
              'stream=codec_name,width,height',
              '-of',
              'json',
              path,
            ],
            15000,
          ),
        );
        streams = z
          .array(
            z.object({
              width: z.number().int().positive().optional(),
              height: z.number().int().positive().optional(),
              codec_name: z.string().optional(),
            }),
          )
          .parse(result.streams);
      } catch {
        fail(422, 'INVALID_IMAGE');
      }
      const primary = streams[0];
      if (
        !primary?.width ||
        !primary.height ||
        primary.codec_name !== 'hevc' ||
        streams.some((s) => (s.width ?? 0) * (s.height ?? 0) > 40000000)
      )
        fail(422, 'INVALID_IMAGE');
      return {
        kind: 'image' as const,
        width: primary.width,
        height: primary.height,
        duration: null,
        bytes: info.size,
        heif: true,
      };
    }
    let meta;
    try {
      meta = await sharp(path, {
        limitInputPixels: 40000000,
        animated: false,
      }).metadata();
    } catch {
      fail(422, 'INVALID_IMAGE');
    }
    if (
      !meta.width ||
      !meta.height ||
      meta.width * meta.height > 40000000 ||
      (meta.pages ?? 1) > 1
    )
      fail(422, 'INVALID_IMAGE');
    return {
      kind: 'image' as const,
      width: (meta.orientation ?? 1) >= 5 ? meta.height : meta.width,
      height: (meta.orientation ?? 1) >= 5 ? meta.width : meta.height,
      duration: null,
      bytes: info.size,
      heif: false,
    };
  }
  if (videoMimes.has(type.mime)) {
    let probe;
    try {
      probe = JSON.parse(
        await runTool(
          cfg.FFPROBE_PATH,
          [
            '-v',
            'error',
            '-protocol_whitelist',
            'file,pipe',
            '-show_streams',
            '-show_format',
            '-of',
            'json',
            path,
          ],
          15000,
        ),
      ) as {
        streams?: {
          codec_type: string;
          codec_name: string;
          width?: number;
          height?: number;
        }[];
        format?: { duration?: string };
      };
    } catch {
      fail(422, 'INVALID_VIDEO');
    }
    const stream = probe.streams?.find((s) => s.codec_type === 'video'),
      duration = Number(probe.format?.duration);
    if (
      !stream ||
      !['h264', 'hevc'].includes(stream.codec_name) ||
      !stream.width ||
      !stream.height ||
      stream.width * stream.height > 40000000 ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > 3600
    )
      fail(422, 'INVALID_VIDEO');
    return {
      kind: 'video' as const,
      width: stream.width,
      height: stream.height,
      duration,
      bytes: info.size,
    };
  }
  fail(422, 'UNSUPPORTED_MEDIA');
}
export async function upload(c: Context<ApiEnv>, db: Database, cfg: Config) {
  const root = inside(cfg.ORIGINALS_ROOT, 'quarantine');
  await mkdir(root, { recursive: true });
  const path = inside(root, randomUUID());
  const contentType = c.req.header('content-type') ?? '';
  if (!contentType.startsWith('multipart/form-data;'))
    fail(422, 'MULTIPART_REQUIRED');
  let count = 0,
    bytes = 0,
    truncated = false;
  const writes: Promise<void>[] = [];
  try {
    const parser = Busboy({
      headers: { 'content-type': contentType },
      limits: { files: 1, fileSize: 300 * 1024 * 1024, fields: 0, parts: 2 },
    });
    parser.on('file', (_name, stream) => {
      count++;
      stream.on('limit', () => {
        truncated = true;
      });
      const write = pipeline(
        stream,
        createWriteStream(path, { flags: 'wx', mode: 0o600 }),
      );
      void write.catch(() => {});
      writes.push(write);
    });
    parser.on('filesLimit', () => {
      truncated = true;
    });
    parser.on('partsLimit', () => {
      truncated = true;
    });
    parser.on('fieldsLimit', () => {
      truncated = true;
    });
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > 301 * 1024 * 1024) callback(new Error('limit'));
        else callback(null, chunk);
      },
    });
    if (!c.req.raw.body) fail(422, 'FILE_REQUIRED');
    await pipeline(
      Readable.fromWeb(
        c.req.raw.body as import('node:stream/web').ReadableStream,
      ),
      limiter,
      parser,
    );
    await Promise.all(writes);
    if (truncated) fail(413, 'UPLOAD_TOO_LARGE');
    if (count !== 1) fail(422, 'FILE_REQUIRED');
    const validated = await validateFile(path, cfg),
      sha256 = await digestFile(path);
    const row = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${sha256}, 0))`,
      );
      const [existing] = await tx
        .select()
        .from(media)
        .where(eq(media.sha256, sha256))
        .for('update');
      if (existing && !existing.archivedAt && existing.status !== 'failed') {
        await rm(path, { force: true });
        return existing;
      }
      const target = inside(cfg.ORIGINALS_ROOT, 'originals', sha256);
      await mkdir(resolve(target, '..'), { recursive: true });
      await rename(path, target);
      const [saved] = existing
        ? await tx
            .update(media)
            .set({
              originalPath: target,
              status: 'processing',
              archivedAt: null,
              ...(existing.archivedAt ? { rightsStatus: 'unknown' } : {}),
            })
            .where(eq(media.id, existing.id))
            .returning()
        : await tx
            .insert(media)
            .values({
              kind: validated.kind,
              originalPath: target,
              width: validated.width,
              height: validated.height,
              durationS:
                validated.duration === null ? null : String(validated.duration),
              bytes: validated.bytes,
              sha256,
              uploadedBy: c.get('principal').id,
            })
            .returning();
      await tx
        .insert(outbox)
        .values({ name: 'media.process', data: { mediaId: saved!.id } });
      return saved!;
    });
    return { id: row.id, status: row.status };
  } catch (error) {
    await Promise.allSettled(writes);
    await rm(path, { force: true });
    throw error;
  }
}
type MediaProcessingConfig = Pick<
  Config,
  'MEDIA_ROOT' | 'ORIGINALS_ROOT' | 'FFMPEG_PATH' | 'FFPROBE_PATH'
>;
const processingInputs = [
  'kind',
  'originalPath',
  'sha256',
  'rightsStatus',
  'focalX',
  'focalY',
  'autoEnhance',
  'sourceAlreadyGraded',
  'trimStart',
  'trimEnd',
  'posterTime',
] as const satisfies readonly (keyof typeof media.$inferSelect)[];

export async function processMedia(
  db: Database,
  cfg: MediaProcessingConfig,
  id: string,
) {
  const failure = await db.transaction(async (tx) => {
    // Serialize encoders without holding the media row lock while they run.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${id}, 1))`,
    );
    const [original] = await tx
      .select()
      .from(media)
      .where(and(eq(media.id, id), isNull(media.archivedAt)));
    if (!original || !original.sha256) return;
    const result = await renderMedia(cfg, original).then(
      (rendered) => ({ rendered }) as const,
      (error: unknown) => ({ error }) as const,
    );

    const [current] = await tx
      .select()
      .from(media)
      .where(eq(media.id, id))
      .for('update');
    if (
      !current ||
      current.archivedAt ||
      processingInputs.some((key) => current[key] !== original[key])
    )
      return;
    if ('error' in result) {
      await tx.update(media).set({ status: 'failed' }).where(eq(media.id, id));
      return result;
    }
    const { relativePath, ...values } = result.rendered;
    if (current.rightsStatus !== 'unknown')
      await tx
        .insert(publicMediaRenditions)
        .values({ storageKey: relativePath, mediaId: id })
        .onConflictDoNothing();
    await tx
      .update(media)
      .set({ ...values, status: 'ready' })
      .where(eq(media.id, id));
  });
  if (failure) throw failure.error;
}

async function renderMedia(
  cfg: MediaProcessingConfig,
  m: typeof media.$inferSelect,
) {
  if (!m.sha256) throw new Error('Missing media digest');
  if (!/^[a-f0-9]{64}$/.test(m.sha256)) throw new Error('Invalid media digest');
  let decodedPath: string | null = null;
  try {
    // Include encoder and options so immutable URLs never silently change bytes.
    const encoder =
      m.kind === 'image'
        ? ['image/heic', 'image/heif'].includes(
            (await fileTypeFromFile(m.originalPath))?.mime ?? '',
          )
          ? sharp.versions.sharp +
            ':' +
            (await runTool(cfg.FFMPEG_PATH, ['-version'])).split('\n')[0]
          : sharp.versions.sharp
        : (await runTool(cfg.FFMPEG_PATH, ['-version'])).split('\n')[0];
    const key = createHash('sha256')
      .update(
        JSON.stringify({
          version: 2,
          encoder,
          hash: m.sha256,
          enhance: m.autoEnhance,
          graded: m.sourceAlreadyGraded,
          focal: [m.focalX, m.focalY],
          trim: [m.trimStart, m.trimEnd],
          poster: m.posterTime,
        }),
      )
      .digest('hex');
    const relativePath = key.slice(0, 2) + '/' + key;
    const base =
      m.rightsStatus === 'unknown'
        ? inside(cfg.ORIGINALS_ROOT, 'previews')
        : cfg.MEDIA_ROOT;
    const dest = inside(base, relativePath);
    await mkdir(dest, { recursive: true });
    const validated = await validateFile(m.originalPath, cfg);
    const variants: Record<string, unknown> = {};
    if (m.kind === 'image') {
      for (const ext of ['avif', 'webp', 'jpg'])
        variants[ext] = Object.fromEntries(
          [160, 480, 768, 1200, 1920].map((w) => [
            String(w),
            relativePath + '/' + w + '.' + ext,
          ]),
        );
      const complete = (
        await Promise.all(
          ['avif', 'webp', 'jpg'].flatMap((ext) =>
            [160, 480, 768, 1200, 1920].map((w) =>
              stat(inside(dest, w + '.' + ext))
                .then(() => true)
                .catch(() => false),
            ),
          ),
        )
      ).every(Boolean);
      if (complete) {
        return {
          relativePath,
          width: validated.width,
          height: validated.height,
          variants,
        };
      }
      let sourcePath = m.originalPath;
      if (validated.kind === 'image' && validated.heif) {
        const quarantine = inside(cfg.ORIGINALS_ROOT, 'quarantine');
        await mkdir(quarantine, { recursive: true });
        decodedPath = inside(quarantine, randomUUID() + '.png');
        await runTool(
          cfg.FFMPEG_PATH,
          [
            '-y',
            '-v',
            'error',
            '-protocol_whitelist',
            'file,pipe',
            '-max_alloc',
            '268435456',
            '-threads',
            '2',
            '-i',
            m.originalPath,
            '-map',
            '0:v:0',
            '-frames:v',
            '1',
            '-an',
            '-map_metadata',
            '-1',
            decodedPath,
          ],
          60000,
        );
        sourcePath = decodedPath;
      }
      let source = sharp(sourcePath, { limitInputPixels: 40000000 })
        .rotate()
        .toColourspace('srgb')
        .flatten({ background: '#fff' });
      if (m.autoEnhance && !m.sourceAlreadyGraded)
        source = source
          .modulate({ brightness: 1.06, saturation: 1.18 })
          .linear([1.015, 1, 0.985], [0, 0, 0]);
      const normalized = await source
        .webp({ quality: 95 })
        .toBuffer({ resolveWithObject: true });
      for (const [format, ext] of [
        ['avif', 'avif'],
        ['webp', 'webp'],
        ['jpg', 'jpg'],
      ] as const) {
        const sizes: Record<string, string> = {};
        for (const width of [160, 480, 768, 1200, 1920]) {
          const name = `${width}.${ext}`;
          const image = sharp(normalized.data).resize({
            width,
            withoutEnlargement: true,
          });
          await (
            format === 'jpg'
              ? image.jpeg({ quality: 72 })
              : format === 'webp'
                ? image.webp({ quality: 72 })
                : image.avif({ quality: 45 })
          ).toFile(inside(dest, name));
          sizes[String(width)] = relativePath + '/' + name;
        }
        variants[format] = sizes;
      }
      return {
        relativePath,
        width: normalized.info.width,
        height: normalized.info.height,
        variants,
      };
    } else {
      const start = Number(m.trimStart ?? 0),
        end = Math.min(
          Number(m.trimEnd ?? validated.duration ?? 20),
          start + 20,
        ),
        duration = end - start;
      if (duration <= 0) throw new Error('Invalid video trim');
      const grade =
        m.autoEnhance && !m.sourceAlreadyGraded
          ? ',eq=brightness=0.045:contrast=1.07:saturation=1.32:gamma=1.06,colorbalance=rs=.025:bs=-.02,setpts=PTS/0.85'
          : '';
      for (const [name, w, h] of [
        ['mp4_v', 720, 1280],
        ['mp4_h', 1280, 720],
      ] as const) {
        const x = Number(m.focalX),
          y = Number(m.focalY);
        const filter = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}:(iw-ow)*${x}:(ih-oh)*${y},setsar=1${grade}`;
        await runTool(cfg.FFMPEG_PATH, [
          '-y',
          '-protocol_whitelist',
          'file,pipe',
          '-ss',
          String(start),
          '-i',
          m.originalPath,
          '-t',
          String(duration),
          '-map',
          '0:v:0',
          '-an',
          '-map_metadata',
          '-1',
          '-vf',
          filter,
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-crf',
          '26',
          '-preset',
          'veryfast',
          '-threads',
          '2',
          '-movflags',
          '+faststart',
          inside(dest, name + '.mp4'),
        ]);
        variants[name] = relativePath + '/' + name + '.mp4';
      }
      await runTool(cfg.FFMPEG_PATH, [
        '-y',
        '-protocol_whitelist',
        'file,pipe',
        '-ss',
        String(
          Math.max(
            start,
            Math.min(Number(m.posterTime ?? start), start + duration - 0.02),
          ),
        ),
        '-i',
        m.originalPath,
        '-frames:v',
        '1',
        '-an',
        '-map_metadata',
        '-1',
        ...(m.autoEnhance && !m.sourceAlreadyGraded
          ? [
              '-vf',
              'eq=brightness=0.045:contrast=1.07:saturation=1.32:gamma=1.06,colorbalance=rs=.025:bs=-.02',
            ]
          : []),
        inside(dest, 'poster.jpg'),
      ]);
      const buffer = await readFile(inside(dest, 'poster.jpg'));
      await sharp(buffer)
        .resize({ width: 1200, withoutEnlargement: true })
        .avif({ quality: 50 })
        .toFile(inside(dest, 'poster.avif'));
      variants.poster = relativePath + '/poster.jpg';
      return {
        relativePath,
        variants,
        width: validated.width,
        height: validated.height,
        durationS:
          validated.duration === null ? null : String(validated.duration),
      };
    }
  } finally {
    if (decodedPath) await rm(decodedPath, { force: true });
  }
}
export function createMediaImporter(
  db: Database,
  cfg: Pick<
    Config,
    'MEDIA_ROOT' | 'ORIGINALS_ROOT' | 'FFMPEG_PATH' | 'FFPROBE_PATH'
  >,
  repoRoot: string,
  options: {
    processVideos?: boolean;
    processImages?: boolean;
    journeyAssets?: Readonly<
      Record<string, { sha256: string; license: string; credit: string }>
    >;
  } = {},
) {
  const permission = new Set([
    'giza-camel-pov-h.mp4',
    'cairo-citadel-mosque-v.mp4',
    'coptic-cairo-v.mp4',
    'desert-jeep-v.mp4',
    'coloured-canyon-v.mp4',
    'desert-camel-v.mp4',
    'reef-snorkel-v.mp4',
    'bedouin-quad-v.mp4',
    // Client footage (VID_20260422 / VID_20260911), re-cut Nov 2026.
    'hero-desert-v.mp4',
    // Client clips (Citadel mosque, Coptic Cairo) + licensed Pexels stock.
    'hero-history-v.mp4',
    // 6-second phone hero cut from the client's canyon + quad clips.
    'hero6-desert-v.mp4',
  ]);
  return async (path: string, alt: Localized) => {
    const journey = /^assets\/journeys\/[a-z0-9-]+\.(?:mp4|jpg)$/.test(path)
      ? options.journeyAssets?.[path]
      : undefined;
    if (
      !journey &&
      !/^assets\/(?:images\/stock\/[a-zA-Z0-9-]+\.jpg|(?:video|video-stock)\/[a-zA-Z0-9-]+\.mp4)$/.test(
        path,
      )
    )
      throw new Error('Unapproved catalog media path');
    const source = inside(repoRoot, path),
      sha256 = await digestFile(source);
    if (journey && journey.sha256 !== sha256)
      throw new Error('Journey media checksum mismatch');
    const existing = (
      await db.select().from(media).where(eq(media.sha256, sha256))
    )[0];
    if (existing) {
      if (options.processImages && existing.kind === 'image')
        await processMedia(db, cfg, existing.id);
      if (
        options.processVideos &&
        existing.kind === 'video' &&
        existing.rightsStatus !== 'unknown' &&
        existing.status !== 'ready'
      )
        await processMedia(db, cfg, existing.id);
      return existing.id;
    }
    const image = path.endsWith('.jpg'),
      stock = path.includes('/stock/') || path.includes('/video-stock/'),
      rightsStatus =
        stock || journey
          ? 'licensed'
          : permission.has(path.split('/').at(-1)!)
            ? 'permission'
            : 'unknown';
    const target = inside(cfg.ORIGINALS_ROOT, 'originals', sha256);
    await mkdir(resolve(target, '..'), { recursive: true });
    await copyFile(source, target);
    const meta = image
      ? await sharp(target, { limitInputPixels: 40000000 }).metadata()
      : null;
    const [row] = await db
      .insert(media)
      .values({
        kind: image ? 'image' : 'video',
        originalPath: target,
        sha256,
        bytes: (await stat(target)).size,
        alt,
        rightsStatus,
        sourceAlreadyGraded: true,
        width: meta?.width ?? null,
        height: meta?.height ?? null,
        credit: journey?.credit ?? null,
        license: journey
          ? journey.license
          : stock
            ? 'Pexels / Unsplash per assets/ASSETS.md; individual source record pending'
            : null,
      })
      .returning();
    if (image || (options.processVideos && rightsStatus !== 'unknown'))
      await processMedia(db, cfg, row!.id);
    else
      await db
        .insert(outbox)
        .values({ name: 'media.process', data: { mediaId: row!.id } });
    return row!.id;
  };
}
