// Test-only public API fixture. Never imported by the application or used as a production fallback.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { tsImport } from 'tsx/esm/api';
import { site, collections, collection, trip, locales } from './catalog.mjs';
const { addCalendarDays, quoteInputSchema } = await tsImport(
  '../../packages/shared/src/booking.ts',
  import.meta.url,
);
const { planDays } = await tsImport(
  '../../packages/shared/src/days.ts',
  import.meta.url,
);
const { estimateTrip, primaryPrice } = await tsImport(
  '../../packages/shared/src/price.ts',
  import.meta.url,
);
const require = createRequire(
  new URL('../../apps/web/package.json', import.meta.url),
);
const sharp = require('sharp');
const images = new Map();
const server = createServer(async (req, res) => {
  res.setHeader(
    'Access-Control-Allow-Origin',
    'http://127.0.0.1:' + (process.env.PLAYWRIGHT_FIXTURE_WEB_PORT ?? '3000'),
  );
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
  if (url.pathname === '/v1/requests/quote' && req.method === 'POST') {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const input = quoteInputSchema.parse(
        JSON.parse(Buffer.concat(chunks).toString('utf8')),
      );
      const ids = new Map(input.items.map((item) => [item.trip_slug, item]));
      const selected = input.items.map((item) =>
        trip(item.trip_slug, input.locale),
      );
      if (selected.some((item) => !item)) return json({}, 422);
      let known = 0;
      const items = planDays(
        selected,
        input.rest_days,
        input.preserve_order,
      ).flatMap(({ day, trip }) => {
        if (!trip) return [];
        const selection = ids.get(trip.slug);
        const prices = trip.prices.filter((price) => price.unit !== 'child');
        const row =
          prices.find((price) => price.id === selection.price_id) ??
          primaryPrice(trip);
        const estimate = estimateTrip(
          trip,
          input.adults,
          input.children,
          input.format,
          row?.id,
          selection.hours,
        );
        if (!estimate.onRequest) known += Math.round(estimate.amount);
        return [
          {
            trip_slug: trip.slug,
            day_index: day,
            service_date: addCalendarDays(input.start_date, day - 1),
            service_end_date: addCalendarDays(
              input.start_date,
              day + trip.days_count - 2,
            ),
            amount_eur: estimate.onRequest ? null : Math.round(estimate.amount),
            selected_price_id: row?.id ?? null,
            price_options: prices,
          },
        ];
      });
      return json({
        quote_id: createHash('sha256')
          .update(JSON.stringify(items))
          .digest('hex'),
        estimate_eur: items.some((item) => item.amount_eur === null)
          ? null
          : known,
        known_eur: known,
        items,
      });
    } catch {
      return json({}, 422);
    }
  }
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
  if (url.pathname === '/v1/public/saved-trips') {
    if (!locales.some((item) => item.code === locale)) return json({}, 404);
    return json(
      url.searchParams
        .get('slugs')
        .split(',')
        .map((slug) => {
          const result = trip(slug, locale);
          return result
            ? { slug, status: 'available', trip: result }
            : { slug, status: 'withdrawn' };
        }),
    );
  }
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
