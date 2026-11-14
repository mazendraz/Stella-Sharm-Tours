import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { inside } from './media';
export const processedPath =
  /^[a-f0-9]{2}\/[a-f0-9]{64}\/(?:(?:160|480|768|1200|1920)\.(?:jpg|webp|avif)|poster\.(?:jpg|avif)|mp4_[vh]\.mp4)$/;
export async function serveProcessed(
  root: string,
  path: string,
  range: string | undefined,
  accept: string,
  publicAsset: boolean,
): Promise<Response> {
  if (!processedPath.test(path)) return new Response(null, { status: 404 });
  let selected = path;
  if (publicAsset && path.endsWith('.jpg')) {
    const accepted = accept
      .split(',')
      .map((part) => part.trim())
      .filter((part) => !/(?:^|;)\s*q=0(?:\.0*)?(?:;|$)/.test(part));
    for (const format of ['avif', 'webp'].filter((ext) =>
      accepted.some((part) => part.split(';')[0] === 'image/' + ext),
    )) {
      const candidate = path.replace(/\.jpg$/, '.' + format);
      try {
        if ((await stat(inside(root, candidate))).isFile()) {
          selected = candidate;
          break;
        }
      } catch {
        /* JPEG remains available. */
      }
    }
  }
  const target = inside(root, selected);
  let info;
  try {
    info = await stat(target);
  } catch {
    return new Response(null, { status: 404 });
  }
  if (!info.isFile()) return new Response(null, { status: 404 });
  let start = 0,
    end = info.size - 1,
    status = 200;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2]))
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${info.size}` },
      });
    start = match[1]
      ? Number(match[1])
      : Math.max(0, info.size - Number(match[2]));
    end = match[1] && match[2] ? Math.min(end, Number(match[2])) : end;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start > end ||
      start >= info.size
    )
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${info.size}` },
      });
    status = 206;
  }
  const type = selected.endsWith('.mp4')
    ? 'video/mp4'
    : selected.endsWith('.avif')
      ? 'image/avif'
      : selected.endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg';
  const headers: Record<string, string> = {
    'Content-Type': type,
    'Content-Length': String(end - start + 1),
    'Accept-Ranges': 'bytes',
    'Cache-Control': publicAsset
      ? 'public, max-age=31536000, immutable'
      : 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': publicAsset ? 'cross-origin' : 'same-site',
  };
  if (publicAsset && path.endsWith('.jpg')) headers.Vary = 'Accept';
  if (status === 206)
    headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
  return new Response(
    Readable.toWeb(createReadStream(target, { start, end })) as ReadableStream,
    { status, headers },
  );
}
