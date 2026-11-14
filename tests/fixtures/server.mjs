// Test-only public API fixture. Never imported by the application or used as a production fallback.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { site, collections, collection, trip, locales } from './catalog.mjs';
const require = createRequire(
  new URL('../../apps/web/package.json', import.meta.url),
);
const sharp = require('sharp');
const images = new Map();
const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:3000');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  const url = new URL(req.url, 'http://localhost'),
    locale = url.searchParams.get('locale') ?? 'en';
  const json = (value, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(value));
  };
  if (url.pathname === '/healthz') return json({ status: 'ok', fixture: true });
  if (req.method === 'POST')
    return json({ error: { code: 'FIXTURE_READ_ONLY' } }, 501);
  if (url.pathname.startsWith('/media/')) {
    const path = url.pathname.slice(7);
    if (!/^images\/stock\/[a-zA-Z0-9-]+\.jpg$/.test(path)) {
      res.writeHead(404);
      res.end();
      return;
    }
    const width = Math.min(
      1920,
      Math.max(40, Number(url.searchParams.get('w') ?? 1200)),
    );
    const format = req.headers.accept?.includes('image/avif')
      ? 'avif'
      : req.headers.accept?.includes('image/webp')
        ? 'webp'
        : 'jpeg';
    const key = path + width + format;
    try {
      let buffer = images.get(key);
      if (!buffer) {
        buffer = await sharp(
          await readFile(new URL('../../assets/' + path, import.meta.url)),
        )
          .resize({ width, withoutEnlargement: true })
          .toFormat(format, {
            quality: format === 'avif' ? 50 : 72,
            chromaSubsampling: '4:2:0',
          })
          .toBuffer();
        images.set(key, buffer);
      }
      res.writeHead(200, {
        'Content-Type': 'image/' + format,
        Vary: 'Accept',
        'Cache-Control': 'public, max-age=3600',
      });
      res.end(buffer);
    } catch {
      res.writeHead(404);
      res.end();
    }
    return;
  }
  if (url.pathname === '/v1/public/site') return json(site(locale));
  if (url.pathname === '/v1/public/locales') return json(locales);
  if (url.pathname === '/v1/public/collections')
    return json(collections(locale));
  if (url.pathname.startsWith('/v1/public/collections/')) {
    const result = collection(url.pathname.split('/').at(-1), locale);
    return json(result ?? {}, result ? 200 : 404);
  }
  if (url.pathname.startsWith('/v1/public/trips/')) {
    const result = trip(url.pathname.split('/').at(-1), locale);
    return json(result ?? {}, result ? 200 : 404);
  }
  if (url.pathname === '/v1/public/faq') return json([]);
  if (url.pathname === '/v1/public/messages') return json({});
  return json({ error: { code: 'NOT_FOUND' } }, 404);
});
server.listen(4100, '127.0.0.1', () =>
  process.stdout.write(
    'Read-only catalog test fixture: http://127.0.0.1:4100\n',
  ),
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.once(signal, () => server.close(() => process.exit(0)));
