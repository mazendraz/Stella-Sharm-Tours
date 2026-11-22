import { publicStorySchema } from '@stella/shared/story';
import { OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { etag } from 'hono/etag';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '@stella/db';
import { faqs, pageBlocks, contentTranslations } from '@stella/db/schema';
import {
  siteSchema,
  collectionSchema,
  collectionDetailSchema,
  tripSchema,
  faqSchema,
  pageSchema,
  localeSchema,
  savedTripsSchema,
  savedTripLimit,
} from '@stella/shared/public-contract';
import {
  bookingSchema,
  confirmationSchema,
  quoteChangedSchema,
  quoteInputSchema,
  quoteSchema,
} from '@stella/shared/booking';
import type { Config } from './config';
import type { ApiEnv } from './types';
import { loadCatalog, loadLiveLocales } from './catalog';
import { createRequest, hashPrivate } from './requests';
import { calculateBookingQuote, parseQuoteInput } from './booking-quote';
import { consume } from './rate';
import { authService, clientIp, equal } from './auth';
import { createHmac } from 'node:crypto';
import { registerAdmin } from './admin';
import { matchAdminContract, registerAdminOpenApi } from './admin-contracts';
import { registerHomepage } from './homepage';
import { registerAdminUi } from './admin-ui';
import { registerPush } from './push';
import { fail } from './errors';
import {
  processedPath,
  publicRenditionAllowed,
  serveProcessed,
} from './serve-media';
const query = z.strictObject({
  locale: z
    .string()
    .regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]+)?$/)
    .default('en'),
});
const slug = z.string().regex(/^[a-z0-9-]{1,120}$/);
const savedTripQuery = query.extend({
  slugs: z
    .string()
    .max(savedTripLimit * 121)
    .refine((value) => {
      const slugs = value.split(',');
      return (
        slugs.length <= savedTripLimit &&
        slugs.every((item) => slug.safeParse(item).success)
      );
    }),
});
export function createApp(
  db: Database,
  cfg: Config,
  onUnexpected: () => void = () => {},
) {
  const app = new OpenAPIHono<ApiEnv>(),
    auth = authService(db, cfg);
  app.use('*', async (c, next) =>
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
      crossOriginResourcePolicy: c.req.path.startsWith('/media/')
        ? 'cross-origin'
        : c.req.path.startsWith('/v1/admin/media/') &&
            c.req.path.endsWith('/preview')
          ? 'same-site'
          : 'same-origin',
    })(c, next),
  );
  app.use('/v1/*', async (c, next) => {
    if (!c.req.path.startsWith('/v1/public/'))
      c.header('Cache-Control', 'no-store');
    await next();
    if (c.res.ok && c.get('revisionIds')?.length)
      c.header('X-Stella-Revisions', c.get('revisionIds').join(','));
  });
  app.use('/v1/*', async (c, next) => {
    if (c.req.path === '/v1/admin/media' && c.req.method === 'POST')
      return next();
    return bodyLimit({
      maxSize: 128 * 1024,
      onError: (c) =>
        c.json(
          {
            error: {
              code: 'BODY_TOO_LARGE',
              message: 'Request body too large',
            },
          },
          413,
        ),
    })(c, next);
  });
  app.use(
    '/v1/public/*',
    cors({
      origin: new URL(cfg.WEB_ORIGIN).origin,
      allowMethods: ['GET', 'HEAD', 'OPTIONS'],
      credentials: false,
    }),
  );
  for (const path of ['/v1/requests', '/v1/requests/quote'])
    app.use(
      path,
      cors({
        origin: new URL(cfg.WEB_ORIGIN).origin,
        allowMethods: ['POST', 'OPTIONS'],
        allowHeaders: ['Content-Type'],
        credentials: false,
      }),
      async (c, next) => {
        if (c.req.method !== 'POST') return next();
        if (c.req.header('origin') !== new URL(cfg.WEB_ORIGIN).origin)
          fail(403, 'INVALID_ORIGIN');
        if (
          c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase() !==
          'application/json'
        )
          fail(422, 'JSON_REQUIRED');
        await next();
      },
    );
  app.use(
    '/v1/admin/*',
    cors({
      origin: new URL(cfg.ADMIN_ORIGIN).origin,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'X-CSRF-Token'],
      exposeHeaders: ['X-Stella-Revisions'],
      credentials: true,
    }),
  );
  const buckets = new Map<string, { count: number; until: number }>();
  const catalogReaderToken = createHmac('sha256', cfg.WEB_REVALIDATE_SECRET)
    .update('stella:public-catalog-reader:v1')
    .digest('hex');
  app.use('/v1/public/*', async (c, next) => {
    if (Object.values(c.req.queries()).some((values) => values.length !== 1))
      fail(422, 'INVALID_QUERY');
    const trusted =
      c.req.path !== '/v1/public/preview' &&
      equal(c.req.header('x-stella-catalog-reader') ?? '', catalogReaderToken);
    const now = Date.now(),
      key = trusted
        ? 'catalog-reader'
        : hashPrivate(clientIp(c, cfg), cfg.IP_HASH_SALT);
    let bucket = buckets.get(key);
    if (!bucket || bucket.until <= now) {
      if (buckets.size > 10000) {
        for (const [k, v] of buckets) if (v.until <= now) buckets.delete(k);
        if (buckets.size > 10000) fail(429, 'RATE_LIMITED');
      }
      bucket = { count: 0, until: now + 60000 };
      buckets.set(key, bucket);
    }
    if (
      ++bucket.count >
      (trusted
        ? Math.max(2400, cfg.PUBLIC_READS_PER_MINUTE)
        : cfg.PUBLIC_READS_PER_MINUTE)
    ) {
      c.header('Retry-After', String(Math.ceil((bucket.until - now) / 1000)));
      fail(429, 'RATE_LIMITED');
    }
    await next();
  });
  app.use('/v1/public/*', etag());
  app.use('/v1/public/*', async (c, next) => {
    await next();
    if (c.res.status === 200 && c.req.path !== '/v1/public/preview')
      c.header(
        'Cache-Control',
        'public, s-maxage=60, stale-while-revalidate=600',
      );
  });
  app.get('/v1/public/preview', async (c) => {
    c.header('Cache-Control', 'private, no-store');
    c.header('X-Robots-Tag', 'noindex, nofollow');
    const input = z
      .strictObject({ token: z.string().max(2000) })
      .safeParse(c.req.query());
    if (!input.success) fail(422, 'INVALID_QUERY');
    const [payload, signature, ...extra] = input.data.token.split('.');
    if (
      !payload ||
      !signature ||
      extra.length ||
      !equal(
        signature,
        createHmac('sha256', cfg.SESSION_SECRET)
          .update(payload)
          .digest('base64url'),
      )
    )
      fail(401, 'INVALID_PREVIEW');
    let raw: unknown;
    try {
      raw = JSON.parse(Buffer.from(payload, 'base64url').toString());
    } catch {
      fail(401, 'INVALID_PREVIEW');
    }
    const result = z
      .strictObject({
        path: z.string().regex(/^\/[a-z]{2,3}\/(?:t|c)\/[a-z0-9-]{1,120}$/),
        expires: z.number().int(),
      })
      .safeParse(raw);
    if (
      !result.success ||
      result.data.expires < Date.now() ||
      result.data.expires > Date.now() + 3600000
    )
      fail(401, 'INVALID_PREVIEW');
    const [, locale, kind, slug] = result.data.path.split('/'),
      preview = await loadCatalog(db, locale!, cfg.MEDIA_PUBLIC_URL, {
        ...(kind === 't'
          ? { previewTrip: slug! }
          : { previewCollection: slug! }),
      });
    const value =
      kind === 't'
        ? preview.trips.find((t) => t.slug === slug)
        : preview.collection(slug!);
    if (!value) fail(404, 'NOT_FOUND');
    return c.json({
      kind: kind === 't' ? 'trip' : 'collection',
      locale,
      data: value,
      ...(kind === 't' ? { story: preview.story(slug!) } : {}),
    });
  });
  app.get('/healthz', (c) => c.json({ status: 'ok', service: 'api' }));
  app.get('/internal/media-access', async (c) => {
    const allowed = await publicRenditionAllowed(
      db,
      c.req.header('x-stella-media-key') ?? '',
    );
    return c.body(null, allowed ? 204 : 404, { 'Cache-Control': 'no-store' });
  });
  app.get('/media/*', async (c) => {
    const path = c.req.path.slice('/media/'.length);
    if (
      !processedPath.test(path) ||
      !(await publicRenditionAllowed(db, path.slice(0, path.lastIndexOf('/'))))
    )
      return c.body(null, 404, { 'Cache-Control': 'no-store' });
    return serveProcessed(
      cfg.MEDIA_ROOT,
      path,
      c.req.header('range'),
      c.req.header('accept') ?? '',
      true,
    );
  });
  app.get('/readyz', async (c) => {
    try {
      await db.execute(sql`select 1`);
      return c.json({ status: 'ok' });
    } catch {
      return c.json({ status: 'unavailable' }, 503);
    }
  });
  const catalog = async (c: import('hono').Context<ApiEnv>) => {
    const params = new URL(c.req.url).searchParams;
    if ([...params.keys()].some((k) => params.getAll(k).length > 1))
      fail(422, 'INVALID_QUERY');
    const parsed = query.safeParse(c.req.query());
    if (!parsed.success) fail(422, 'INVALID_QUERY');
    const result = await loadCatalog(
      db,
      parsed.data.locale,
      cfg.MEDIA_PUBLIC_URL,
    );
    if (!result.site.locales.some((l) => l.code === parsed.data.locale))
      fail(404, 'LOCALE_NOT_FOUND');
    return result;
  };
  // Called by the web middleware on every page request: read only the two
  // i18n settings rows instead of building the whole catalog.
  app.get('/v1/public/locales', async (c) => {
    const params = new URL(c.req.url).searchParams;
    if ([...params.keys()].some((k) => params.getAll(k).length > 1))
      fail(422, 'INVALID_QUERY');
    if (!query.safeParse(c.req.query()).success) fail(422, 'INVALID_QUERY');
    return c.json(await loadLiveLocales(db));
  });
  app.get('/v1/public/site', async (c) => c.json((await catalog(c)).site));
  app.get('/v1/public/saved-trips', async (c) => {
    const parsed = savedTripQuery.safeParse(c.req.query());
    if (!parsed.success) fail(422, 'INVALID_QUERY');
    const { locale, slugs } = parsed.data;
    const requestedTrips = [...new Set(slugs.split(','))];
    const result = await loadCatalog(db, locale, cfg.MEDIA_PUBLIC_URL, {
      requestedTrips,
    });
    if (!result.site.locales.some(({ code }) => code === locale))
      fail(404, 'LOCALE_NOT_FOUND');
    const trips = new Map(result.trips.map((trip) => [trip.slug, trip]));
    return c.json(
      requestedTrips.map((slug) => {
        const trip = trips.get(slug);
        return trip
          ? { slug, status: 'available', trip }
          : { slug, status: 'withdrawn' };
      }),
    );
  });
  app.get('/v1/public/collections', async (c) =>
    c.json((await catalog(c)).collections),
  );
  app.get('/v1/public/collections/:slug', async (c) => {
    if (!slug.safeParse(c.req.param('slug')).success) fail(404, 'NOT_FOUND');
    const result = (await catalog(c)).collection(c.req.param('slug'));
    if (!result) fail(404, 'NOT_FOUND');
    return c.json(result);
  });
  for (const segment of ['trips', 'packages'])
    app.get(`/v1/public/${segment}/:slug`, async (c) => {
      if (!slug.safeParse(c.req.param('slug')).success) fail(404, 'NOT_FOUND');
      const result = (await catalog(c)).trips.find(
        (t) =>
          t.slug === c.req.param('slug') &&
          (segment === 'trips' || t.kind === 'package'),
      );
      if (!result) fail(404, 'NOT_FOUND');
      return c.json(result);
    });
  app.get('/v1/public/trips/:slug/story', async (c) => {
    if (!slug.safeParse(c.req.param('slug')).success) fail(404, 'NOT_FOUND');
    const story = (await catalog(c)).story(c.req.param('slug'));
    if (!story) fail(404, 'NOT_FOUND');
    return c.json(story);
  });
  app.get('/v1/public/faq', async (c) => {
    const result = await catalog(c),
      rows = await db
        .select()
        .from(faqs)
        .where(eq(faqs.status, 'published'))
        .orderBy(faqs.sort);
    return c.json(
      rows.map((r) => ({
        id: r.id,
        q: result.text('faq', r.id, 'q', r.q),
        a: result.text('faq', r.id, 'a', r.a),
      })),
    );
  });
  app.get('/v1/public/pages/:key', async (c) => {
    if (!slug.safeParse(c.req.param('key')).success) fail(404, 'NOT_FOUND');
    const result = await catalog(c),
      blocks = await db
        .select()
        .from(pageBlocks)
        .where(
          and(
            eq(pageBlocks.pageKey, c.req.param('key')),
            eq(pageBlocks.status, 'published'),
          ),
        )
        .orderBy(pageBlocks.sort);
    if (!blocks.length) fail(404, 'NOT_FOUND');
    const rows = blocks.map((b) => {
      const data = b.data as {
        title?: import('@stella/db/schema').Localized;
        heading?: import('@stella/db/schema').Localized;
        text?: import('@stella/db/schema').Localized;
      };
      return {
        title: result.text('page_block', b.id, 'title', data.title),
        heading: result.text('page_block', b.id, 'heading', data.heading),
        text: result.text('page_block', b.id, 'text', data.text),
      };
    });
    const parsed = pageSchema.safeParse({
      title: rows[0]?.title,
      blocks: rows.map(({ heading, text }) => ({ heading, text })),
    });
    if (!parsed.success) fail(404, 'NOT_FOUND');
    return c.json(parsed.data);
  });
  app.get('/v1/public/messages', async (c) => {
    const result = await catalog(c),
      locale = new URL(c.req.url).searchParams.get('locale') ?? 'en';
    if (!result.site.locales.some((l) => l.code === locale))
      fail(404, 'NOT_FOUND');
    const rows = await db
      .select()
      .from(contentTranslations)
      .where(
        and(
          eq(contentTranslations.entity, 'ui'),
          eq(contentTranslations.locale, locale),
        ),
      );
    return c.json(Object.fromEntries(rows.map((r) => [r.field, r.text])));
  });
  app.post('/v1/requests', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      fail(400, 'INVALID_JSON');
    }
    const result = await createRequest(
      db,
      cfg,
      body,
      clientIp(c, cfg),
      c.req.header('user-agent') ?? '',
    );
    return 'quote' in result
      ? c.json({ error: { code: 'QUOTE_CHANGED' }, quote: result.quote }, 409)
      : c.json(result, 201);
  });
  app.post('/v1/requests/quote', async (c) => {
    const ipHash = hashPrivate(clientIp(c, cfg), cfg.IP_HASH_SALT);
    if (!(await consume(db, 'quote-ip:' + ipHash, 40, 60)))
      fail(429, 'RATE_LIMITED');
    const body: unknown = await c.req
      .json()
      .catch(() => fail(400, 'INVALID_JSON'));
    const input = parseQuoteInput(body);
    const { quote } = await db.transaction(
      (tx) => calculateBookingQuote(tx, input),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
    return c.json(quote);
  });
  app.use('/v1/admin/*', async (c, next) => {
    if (c.req.method === 'OPTIONS') return next();
    const contract = matchAdminContract(c.req.method, c.req.path);
    if (!contract) return next();
    const validate = async () => {
      const querySchema = contract.query ?? z.strictObject({});
      if (
        Object.values(c.req.queries()).some((values) => values.length !== 1) ||
        !querySchema.safeParse(c.req.query()).success
      )
        fail(422, 'INVALID_QUERY');
      if (contract.body) {
        let body: unknown = {};
        if (c.req.raw.body !== null) {
          try {
            body = await c.req.json();
          } catch {
            fail(400, 'INVALID_JSON');
          }
        }
        if (!contract.body.safeParse(body).success) fail(422, 'INVALID_INPUT');
      }
      await next();
    };
    if (contract.anonymous) return validate();
    return auth.guard(contract.permission, contract.pending)(c, validate);
  });
  auth.register(app);
  registerAdmin(app, db, cfg, auth);
  registerHomepage(app, db, cfg, auth);
  registerAdminUi(app, db, auth, cfg);
  registerPush(app, db, cfg, auth);
  registerAdminOpenApi(app);
  if (cfg.NODE_ENV === 'production') app.use('/v1/openapi.json', auth.guard());
  const publicSchemas: Record<string, z.ZodType> = {
    site: siteSchema,
    locales: z.array(localeSchema),
    collections: z.array(collectionSchema),
    'collections/{slug}': collectionDetailSchema,
    'trips/{slug}': tripSchema,
    'trips/{slug}/story': publicStorySchema,
    'saved-trips': savedTripsSchema,
    'packages/{slug}': tripSchema,
    faq: faqSchema,
    'pages/{key}': pageSchema,
    messages: z.record(z.string(), z.string()),
  };
  for (const [path, schema] of Object.entries(publicSchemas))
    app.openAPIRegistry.registerPath({
      method: 'get',
      path: '/v1/public/' + path,
      request: {
        query: path === 'saved-trips' ? savedTripQuery : query,
        ...(path.includes('{')
          ? {
              params: z.object(
                Object.fromEntries(
                  [...path.matchAll(/\{(\w+)\}/g)].map((m) => [m[1]!, slug]),
                ),
              ),
            }
          : {}),
      },
      responses: {
        200: {
          description: 'Published localized content',
          content: { 'application/json': { schema } },
        },
      },
    });
  app.openAPIRegistry.registerPath({
    method: 'post',
    path: '/v1/requests',
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: bookingSchema } },
      },
    },
    responses: {
      201: {
        description: 'Request saved',
        content: { 'application/json': { schema: confirmationSchema } },
      },
      409: {
        description:
          'Review the revised quote or resolve the earlier submission',
        content: {
          'application/json': {
            schema: z.union([
              quoteChangedSchema,
              z.object({
                error: z.object({
                  code: z.enum([
                    'SUBMISSION_CONFLICT',
                    'SUBMISSION_EXPIRED',
                    'CATALOG_CHANGED',
                  ]),
                  message: z.string(),
                }),
              }),
            ]),
          },
        },
      },
    },
  });
  app.openAPIRegistry.registerPath({
    method: 'post',
    path: '/v1/requests/quote',
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: quoteInputSchema } },
      },
    },
    responses: {
      200: {
        description: 'Current estimate for the planned service dates',
        content: { 'application/json': { schema: quoteSchema } },
      },
    },
  });
  app.doc31('/v1/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'Stella Sharm Tours API', version: '1.0.0' },
  });
  app.notFound((c) =>
    c.json(
      { error: { code: 'NOT_FOUND', message: 'Resource not found' } },
      404,
    ),
  );
  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      const status = error.status;
      return c.json(
        {
          error: {
            code: error.message,
            message:
              status === 401
                ? 'Authentication failed'
                : status === 403
                  ? 'Access denied'
                  : 'The request could not be completed',
          },
        },
        status,
      );
    }
    const cause = error.cause as { code?: string } | undefined;
    if (cause?.code === '23505')
      return c.json(
        {
          error: {
            code: 'CONFLICT',
            message: 'This change conflicts with existing data',
          },
        },
        409,
      );
    if (
      cause?.code === '23503' ||
      cause?.code === '23514' ||
      cause?.code === '23502'
    )
      return c.json(
        {
          error: {
            code: 'INVALID_REFERENCE',
            message: 'The supplied data could not be saved',
          },
        },
        422,
      );
    if (cause?.code === '40001')
      return c.json(
        {
          error: {
            code: 'CATALOG_CHANGED',
            message: 'The catalog changed. Please try again.',
          },
        },
        409,
      );
    onUnexpected();
    return c.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'The service could not complete this request',
        },
      },
      500,
    );
  });
  return app;
}
