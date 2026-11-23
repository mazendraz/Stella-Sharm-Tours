import { storyPatch } from '@stella/shared/story';
import { z } from 'zod';
import {
  roles,
  localizedSchema,
  slugSchema,
  loginSchema,
  otpSchema,
  resetRequestSchema,
  passwordTokenSchema,
  reauthSchema,
  privacyRequestSchema,
  eraseRequestSchema,
  basicsSchema,
  createTripSchema,
  scheduleSchema,
  seoSchema,
  pricesSchema,
  itinerarySchema,
  itemsSchema,
  reorderSchema,
  requestPatchSchema,
  heroSchema,
  collectionEditSchema,
  mediaPatchSchema,
  type Permission,
} from '@stella/shared/admin';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { ApiEnv } from './types';
import { homepageSchema } from './homepage';
import { translationReviewSchema } from './translation-review';
import { pushSubscriptionSchema } from './push';
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
export type AdminContract = {
  method: Method;
  path: string;
  body?: z.ZodType;
  query?: z.ZodObject;
  permission?: Permission;
  pending?: boolean;
  anonymous?: boolean;
};
const empty = z.strictObject({}),
  page = z.coerce.number().int().min(1).max(10000).default(1),
  q = z.string().max(80).optional(),
  archived = z.enum(['0', '1']).optional();
// Request list filters (admin inbox).
const requestFilters = {
  q,
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  tripFrom: z.iso.date().optional(),
  tripTo: z.iso.date().optional(),
  assigned: z.union([z.uuid(), z.literal('none')]).optional(),
};
const requestStatus = z
  .enum(['new', 'contacted', 'confirmed', 'completed', 'cancelled', 'spam'])
  .optional();
export const requestExportQuery = z.strictObject({
  ...requestFilters,
  status: requestStatus,
  scope: z.enum(['filtered', 'all']).default('filtered'),
});
const mediaRows = z.strictObject({
  rows: z
    .array(
      z.strictObject({
        mediaId: z.uuid(),
        role: z.enum(['cover', 'gallery', 'video']),
      }),
    )
    .max(30),
});
const packageInput = z.strictObject({
  title: localizedSchema.optional(),
  summary: localizedSchema.nullable().optional(),
  slug: slugSchema.optional(),
  parts: z
    .array(
      z.strictObject({
        tripId: z.uuid(),
        dayIndex: z.number().int().min(1).max(120),
      }),
    )
    .min(1)
    .max(38),
});
const faq = z.strictObject({
  q: localizedSchema,
  a: localizedSchema,
  sort: z.number().int().min(0).max(1000).default(0),
  publish: z.boolean().default(false),
});
const blocks = z.strictObject({
  blocks: z
    .array(
      z.strictObject({
        type: z.enum(['rich_text', 'how_steps', 'contact_card', 'faq_list']),
        id: z.uuid().optional(),
        data: z.strictObject({
          title: localizedSchema.optional(),
          heading: localizedSchema.optional(),
          text: localizedSchema,
        }),
        sort: z.number().int().min(0).max(1000).default(0),
      }),
    )
    .max(30),
  publish: z.boolean().default(false),
});
const locale = z.string().regex(/^[a-z]{2,3}$/),
  entity = z.enum([
    'trip',
    'collection',
    'hero_slide',
    'faq',
    'page_block',
    'media',
    'settings',
    'ui',
    'trip_item',
    'trip_price',
    'itinerary',
  ]);
export const settingsInput = z.strictObject({
  contacts: z
    .strictObject({
      whatsapp_primary: z.string().regex(/^\+[1-9]\d{6,14}$/),
      whatsapp_secondary: z
        .string()
        .regex(/^\+[1-9]\d{6,14}$/)
        .nullable(),
      phone: z.string().max(40).nullable(),
      email: z.email().nullable(),
    })
    .optional(),
  address: localizedSchema.optional(),
  hours: localizedSchema.nullable().optional(),
  legal_entity: localizedSchema.optional(),
  pickup_areas: z.array(z.string().min(1).max(100)).max(30).optional(),
  social: z
    .array(
      z.strictObject({
        label: z.string().max(100),
        url: z.url().refine((v) => new URL(v).protocol === 'https:'),
      }),
    )
    .max(10)
    .optional(),
  request_rules: z
    .strictObject({
      min_days_ahead: z.number().int().min(1).max(30),
      max_adults: z.number().int().min(1).max(60),
      max_children: z.number().int().min(0).max(40),
    })
    .optional(),
});
export const adminContracts: AdminContract[] = [
  { method: 'get', path: '/audit-actors', permission: 'audit' },
  {
    method: 'delete',
    path: '/packages/:id/prices',
    permission: 'prices',
    body: empty,
  },
  { method: 'get', path: '/request-assignees', permission: 'requests' },
  { method: 'get', path: '/price-list', permission: 'prices' },
  {
    method: 'get',
    path: '/package-parts',
    permission: 'content',
    query: z.strictObject({ id: z.uuid() }),
  },
  {
    method: 'get',
    path: '/history',
    query: z.strictObject({ entity: z.string().max(80), id: z.uuid() }),
  },
  {
    method: 'get',
    path: '/i18n/values',
    permission: 'translations',
    query: z.strictObject({ entity, id: z.string().min(1).max(120) }),
  },
  {
    method: 'post',
    path: '/i18n/review',
    permission: 'translations',
    body: translationReviewSchema,
  },
  {
    method: 'post',
    path: '/auth/password/change',
    body: z.strictObject({ password: z.string().min(12).max(256) }),
  },
  { method: 'get', path: '/users/:id/sessions', permission: 'users' },
  {
    method: 'delete',
    path: '/users/:id/sessions',
    permission: 'users',
    body: empty,
  },
  { method: 'get', path: '/push/key', permission: 'requests' },
  {
    method: 'post',
    path: '/push/subscriptions',
    permission: 'requests',
    body: pushSubscriptionSchema,
  },
  {
    method: 'delete',
    path: '/push/subscriptions',
    permission: 'requests',
    body: z.strictObject({ endpoint: pushSubscriptionSchema.shape.endpoint }),
  },
  { method: 'get', path: '/homepage', permission: 'content' },
  {
    method: 'put',
    path: '/homepage',
    permission: 'content',
    body: homepageSchema,
  },
  { method: 'post', path: '/auth/login', body: loginSchema, anonymous: true },
  {
    method: 'post',
    path: '/auth/password/reset-request',
    body: resetRequestSchema,
    anonymous: true,
  },
  ...(['setup', 'reset'] as const).map((name) => ({
    method: 'post' as const,
    path: '/auth/password/' + name,
    body: passwordTokenSchema,
    anonymous: true,
  })),
  { method: 'post', path: '/auth/2fa/setup', body: empty, pending: true },
  ...(['enable', 'verify'] as const).map((name) => ({
    method: 'post' as const,
    path: '/auth/2fa/' + name,
    body: otpSchema,
    pending: true,
  })),
  { method: 'post', path: '/auth/reauth', body: reauthSchema },
  { method: 'post', path: '/auth/logout', body: empty, pending: true },
  { method: 'post', path: '/auth/logout-all', body: empty },
  {
    method: 'post',
    path: '/privacy/requests/export',
    permission: 'export',
    body: privacyRequestSchema,
  },
  {
    method: 'post',
    path: '/privacy/requests/erase',
    permission: 'export',
    body: eraseRequestSchema,
  },
  { method: 'get', path: '/me', pending: true },
  { method: 'get', path: '/me/sessions' },
  {
    method: 'patch',
    path: '/me',
    body: z.strictObject({ name: z.string().trim().min(1).max(80) }),
  },
  {
    method: 'delete',
    path: '/users/:id/sessions/:sid',
    permission: 'users',
    body: empty,
  },
  { method: 'delete', path: '/me/sessions/:id', body: empty },
  {
    method: 'get',
    path: '/requests/export.csv',
    permission: 'export',
    query: requestExportQuery,
  },
  {
    method: 'get',
    path: '/requests/counts',
    permission: 'requests',
    query: z.strictObject(requestFilters),
  },
  {
    method: 'get',
    path: '/requests',
    permission: 'requests',
    query: z.strictObject({
      page,
      ...requestFilters,
      status: requestStatus,
    }),
  },
  { method: 'get', path: '/requests/:id', permission: 'requests' },
  {
    method: 'patch',
    path: '/requests/:id',
    permission: 'requests',
    body: requestPatchSchema,
  },
  {
    method: 'get',
    path: '/trips',
    permission: 'content',
    query: z.strictObject({
      page,
      q,
      collection: slugSchema.optional(),
      archived,
    }),
  },
  {
    method: 'post',
    path: '/trips',
    permission: 'content',
    body: createTripSchema,
  },
  { method: 'get', path: '/trips/:id', permission: 'content' },
  ...(
    [
      ['story', storyPatch],
      ['basics', basicsSchema],
      ['schedule', scheduleSchema],
      ['seo', seoSchema],
    ] as const
  ).map(([section, body]) => ({
    method: 'patch' as const,
    path: '/trips/:id/' + section,
    permission: 'content' as const,
    body,
  })),
  ...(
    [
      ['prices', pricesSchema, 'prices'],
      ['itinerary', itinerarySchema, 'content'],
      ['items', itemsSchema, 'content'],
      ['media', mediaRows, 'content'],
    ] as const
  ).map(([section, body, permission]) => ({
    method: 'put' as const,
    path: '/trips/:id/' + section,
    permission,
    body,
  })),
  ...(['publish', 'unpublish', 'archive', 'unarchive'] as const).map(
    (action) => ({
      method: 'post' as const,
      path: '/trips/:id/' + action,
      permission: 'publish' as const,
      body: empty,
    }),
  ),
  {
    method: 'post',
    path: '/trips/:id/duplicate',
    permission: 'content',
    body: z.strictObject({ slug: slugSchema.optional() }),
  },
  {
    method: 'post',
    path: '/trips/reorder',
    permission: 'content',
    body: reorderSchema,
  },
  {
    method: 'post',
    path: '/prices/bulk/preview',
    permission: 'prices',
    body: z.strictObject({
      collectionId: z.uuid().optional(),
      tripIds: z.array(z.uuid()).min(1).max(200).optional(),
      mode: z.enum(['percent', 'amount']),
      value: z.number().min(-10000).max(10000),
      round: z.union([z.literal(0), z.literal(1), z.literal(5)]).optional(),
    }),
  },
  {
    method: 'post',
    path: '/prices/bulk/apply',
    permission: 'prices',
    body: z.strictObject({
      token: z.string().max(120000),
      confirmLargeChange: z.boolean().optional(),
    }),
  },
  {
    method: 'get',
    path: '/collections',
    permission: 'content',
    query: z.strictObject({ archived }),
  },
  ...(['unpublish', 'archive', 'unarchive'] as const).map((action) => ({
    method: 'post' as const,
    path: '/collections/:id/' + action,
    permission: 'publish' as const,
    body: empty,
  })),
  {
    method: 'post',
    path: '/collections',
    permission: 'content',
    body: collectionEditSchema
      .required({ name: true })
      .extend({ slug: slugSchema })
      .strict(),
  },
  {
    method: 'patch',
    path: '/collections/:id',
    permission: 'content',
    body: collectionEditSchema,
  },
  {
    method: 'post',
    path: '/collections/:id/publish',
    permission: 'publish',
    body: empty,
  },
  {
    method: 'post',
    path: '/collections/reorder',
    permission: 'publish',
    body: reorderSchema,
  },
  {
    method: 'get',
    path: '/packages',
    permission: 'content',
    query: z.strictObject({ archived }),
  },
  {
    method: 'post',
    path: '/packages',
    permission: 'content',
    body: packageInput,
  },
  {
    method: 'patch',
    path: '/packages/:id',
    permission: 'content',
    body: packageInput,
  },
  { method: 'get', path: '/hero-slides', permission: 'heroDraft' },
  {
    method: 'post',
    path: '/hero-slides',
    permission: 'heroDraft',
    body: heroSchema,
  },
  {
    method: 'patch',
    path: '/hero-slides/:id',
    permission: 'heroDraft',
    body: heroSchema,
  },
  {
    method: 'delete',
    path: '/hero-slides/:id',
    permission: 'heroLive',
    body: empty,
  },
  {
    method: 'post',
    path: '/hero-slides/reorder',
    permission: 'heroLive',
    body: reorderSchema,
  },
  ...(['publish', 'unpublish', 'archive', 'unarchive'] as const).map(
    (action) => ({
      method: 'post' as const,
      path: '/hero-slides/:id/' + action,
      permission: 'heroLive' as const,
      body: empty,
    }),
  ),
  {
    method: 'get',
    path: '/media',
    permission: 'content',
    query: z.strictObject({
      filter: z.enum(['unused', 'unknown', 'image', 'video']).optional(),
      collection: z.uuid().optional(),
      page,
    }),
  },
  { method: 'post', path: '/media', permission: 'content' },
  { method: 'get', path: '/media/:id', permission: 'content' },
  {
    method: 'patch',
    path: '/media/:id',
    permission: 'content',
    body: mediaPatchSchema,
  },
  { method: 'delete', path: '/media/:id', permission: 'content', body: empty },
  {
    method: 'get',
    path: '/media/:id/preview',
    permission: 'content',
    query: z.strictObject({
      variant: z
        .enum([
          '480.jpg',
          '768.jpg',
          '1200.jpg',
          '1920.jpg',
          'poster',
          'mp4_v',
          'mp4_h',
        ])
        .default('480.jpg'),
    }),
  },
  {
    method: 'post',
    path: '/media/:id/trim',
    permission: 'content',
    body: z
      .strictObject({
        start: z.number().min(0).max(3600),
        end: z.number().positive().max(3600),
        poster: z.number().min(0).max(3600).optional(),
      })
      .refine((b) => b.end > b.start && b.end - b.start <= 20),
  },
  {
    method: 'get',
    path: '/faqs',
    permission: 'content',
    query: z.strictObject({ archived }),
  },
  ...(['archive', 'unarchive'] as const).map((action) => ({
    method: 'post' as const,
    path: '/faqs/:id/' + action,
    permission: 'publish' as const,
    body: empty,
  })),
  { method: 'post', path: '/faqs', permission: 'content', body: faq },
  { method: 'patch', path: '/faqs/:id', permission: 'content', body: faq },
  { method: 'delete', path: '/faqs/:id', permission: 'publish', body: empty },
  { method: 'get', path: '/pages/:key/blocks', permission: 'content' },
  {
    method: 'put',
    path: '/pages/:key/blocks',
    permission: 'content',
    body: blocks,
  },
  { method: 'get', path: '/settings', permission: 'settings' },
  {
    method: 'put',
    path: '/settings',
    permission: 'settings',
    body: settingsInput,
  },
  { method: 'get', path: '/users', permission: 'users' },
  {
    method: 'post',
    path: '/users',
    permission: 'users',
    body: z.strictObject({
      email: z.email().max(254),
      name: z.string().trim().min(1).max(80),
      role: z.enum(roles),
      mfaRequired: z.boolean().optional(),
    }),
  },
  {
    method: 'patch',
    path: '/users/:id',
    permission: 'users',
    body: z.strictObject({
      name: z.string().trim().min(1).max(80).optional(),
      role: z.enum(roles).optional(),
      disabled: z.boolean().optional(),
      mfaRequired: z.boolean().optional(),
    }),
  },
  {
    method: 'get',
    path: '/audit',
    permission: 'audit',
    query: z.strictObject({
      entity: z.string().max(80).optional(),
      entityId: z.string().max(120).optional(),
      user: z.uuid().optional(),
      from: z.iso.date().optional(),
      to: z.iso.date().optional(),
      page,
    }),
  },
  {
    method: 'get',
    path: '/revisions',
    permission: 'audit',
    query: z.strictObject({ entity: z.string().max(80), id: z.uuid() }),
  },
  {
    method: 'post',
    path: '/revisions/:id/restore',
    body: z.strictObject({ confirmLargeChange: z.boolean().optional() }),
  },
  {
    method: 'post',
    path: '/preview-link',
    permission: 'content',
    body: z.strictObject({
      path: z.string().regex(/^\/[a-z]{2,3}\/(?:t|c)\/[a-z0-9-]{1,120}$/),
    }),
  },
  { method: 'get', path: '/i18n/settings', permission: 'languages' },
  {
    method: 'put',
    path: '/i18n/settings',
    permission: 'languages',
    body: z.strictObject({
      auto: z.array(locale).max(200),
      auto_live_min_coverage: z.number().min(0.95).max(1),
      indexable_auto: z.boolean(),
      free_tier_only: z.boolean(),
      monthly_char_budget: z.number().int().min(0).max(10000000),
    }),
  },
  { method: 'get', path: '/i18n/coverage', permission: 'languages' },
  {
    method: 'get',
    path: '/i18n/queue',
    permission: 'translations',
    query: z.strictObject({ locale, entity: entity.optional() }),
  },
  { method: 'get', path: '/i18n/glossary', permission: 'translations' },
  {
    method: 'put',
    path: '/i18n/glossary',
    permission: 'languages',
    body: z.strictObject({
      terms: z.array(z.string().min(1).max(120)).max(300),
    }),
  },
  {
    method: 'post',
    path: '/i18n/translate',
    permission: 'translations',
    body: z.strictObject({
      entity,
      id: z.string().max(120),
      fields: z.array(z.string().max(120)).max(100).optional(),
      locale,
    }),
  },
  {
    method: 'post',
    path: '/i18n/backfill/:locale',
    permission: 'languages',
    body: empty,
  },
];
export function matchAdminContract(method: string, path: string) {
  const relative = path.slice('/v1/admin'.length).split('/');
  return adminContracts.find(
    (c) =>
      c.method.toUpperCase() === method &&
      c.path.split('/').length === relative.length &&
      c.path
        .split('/')
        .every((part, i) => part.startsWith(':') || part === relative[i]),
  );
}
export function registerAdminOpenApi(app: OpenAPIHono<ApiEnv>) {
  app.openAPIRegistry.registerComponent('securitySchemes', 'AdminSession', {
    type: 'apiKey',
    in: 'cookie',
    name: '__Host-stella_admin',
  });
  const error = z.object({
    error: z.object({ code: z.string(), message: z.string() }),
  });
  for (const contract of adminContracts) {
    const path = '/v1/admin' + contract.path.replace(/:([a-z]+)/g, '{$1}'),
      params = Object.fromEntries(
        [...contract.path.matchAll(/:([a-z]+)/g)].map((m) => [
          m[1]!,
          z.string().min(1).max(120),
        ]),
      );
    app.openAPIRegistry.registerPath({
      method: contract.method,
      path,
      tags: ['Admin'],
      description: contract.anonymous
        ? 'Anonymous auth operation with exact admin Origin and rate limits.'
        : `Session, MFA and CSRF/Origin required for mutations. Permission: ${contract.permission ?? 'authenticated; restore additionally checks entity permission'}.`,
      security: contract.anonymous ? [] : [{ AdminSession: [] }],
      request: {
        ...(Object.keys(params).length ? { params: z.object(params) } : {}),
        query: contract.query ?? empty,
        ...(contract.path === '/media' && contract.method === 'post'
          ? {
              body: {
                required: true,
                content: {
                  'multipart/form-data': {
                    schema: z.strictObject({
                      file: z.string().openapi({ format: 'binary' }),
                    }),
                  },
                },
              },
            }
          : contract.body
            ? {
                body: {
                  required: false,
                  content: { 'application/json': { schema: contract.body } },
                },
              }
            : {}),
      },
      responses: {
        200: {
          description:
            'Validated admin result; sensitive auth and IP fields are excluded',
          content: { 'application/json': { schema: z.unknown() } },
        },
        201: { description: 'Created draft or user' },
        202: { description: 'Accepted for processing' },
        401: {
          description: 'Authentication failed',
          content: { 'application/json': { schema: error } },
        },
        403: {
          description: 'Role, MFA, CSRF, Origin or reauthentication required',
          content: { 'application/json': { schema: error } },
        },
        422: {
          description: 'Validation or business rule rejected',
          content: { 'application/json': { schema: error } },
        },
      },
    });
  }
}
