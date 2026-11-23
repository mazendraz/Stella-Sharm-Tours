import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  integer,
  smallint,
  numeric,
  boolean,
  date,
  bigint,
  bigserial,
  primaryKey,
  uniqueIndex,
  index,
  check,
  customType,
} from 'drizzle-orm/pg-core';
import type { Locale } from '@stella/shared';
import type { Confirmation } from '@stella/shared/booking';
export type Localized = { en: string } & Partial<
  Record<Locale, string | undefined>
>;
const citext = customType<{ data: string }>({ dataType: () => 'citext' });
const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });
const id = () => uuid('id').primaryKey().defaultRandom();
const created = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updated = () =>
  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const archived = () => timestamp('archived_at', { withTimezone: true });
const localized = (name: string) => jsonb(name).$type<Localized>();

export const adminUsers = pgTable(
  'admin_users',
  {
    id: id(),
    email: citext('email').notNull().unique(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role', {
      enum: ['owner', 'manager', 'editor', 'sales'],
    }).notNull(),
    totpSecretEnc: bytea('totp_secret_enc'),
    totpEnabled: boolean('totp_enabled').notNull().default(false),
    mfaRequired: boolean('mfa_required').notNull().default(false),
    recoveryCodesHash: text('recovery_codes_hash').array(),
    lastTotpStep: bigint('last_totp_step', { mode: 'number' }),
    failedLogins: integer('failed_logins').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [
    check('admin_role', sql`${t.role} in ('owner','manager','editor','sales')`),
  ],
);
export const adminDevices = pgTable(
  'admin_devices',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    createdAt: created(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('admin_device_user_token').on(t.userId, t.tokenHash),
    index('admin_device_expiry').on(t.expiresAt),
  ],
);
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => adminUsers.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull(),
  endpointHash: text('endpoint_hash').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  locale: text('locale').notNull().default('en'),
  createdAt: created(),
});
export const media = pgTable(
  'media',
  {
    id: id(),
    kind: text('kind', { enum: ['image', 'video'] }).notNull(),
    originalPath: text('original_path').notNull(),
    variants: jsonb('variants').$type<Record<string, unknown>>(),
    width: integer('width'),
    height: integer('height'),
    durationS: numeric('duration_s', { precision: 6, scale: 2 }),
    bytes: bigint('bytes', { mode: 'number' }),
    sha256: text('sha256').unique(),
    alt: localized('alt'),
    credit: text('credit'),
    license: text('license'),
    rightsStatus: text('rights_status', {
      enum: ['owned', 'licensed', 'permission', 'unknown'],
    })
      .notNull()
      .default('unknown'),
    focalX: numeric('focal_x', { precision: 4, scale: 3 })
      .notNull()
      .default('0.5'),
    focalY: numeric('focal_y', { precision: 4, scale: 3 })
      .notNull()
      .default('0.5'),
    status: text('status', { enum: ['processing', 'ready', 'failed'] })
      .notNull()
      .default('processing'),
    autoEnhance: boolean('auto_enhance').notNull().default(true),
    sourceAlreadyGraded: boolean('source_already_graded')
      .notNull()
      .default(false),
    trimStart: numeric('trim_start'),
    trimEnd: numeric('trim_end'),
    posterTime: numeric('poster_time'),
    archivedAt: archived(),
    uploadedBy: uuid('uploaded_by').references(() => adminUsers.id),
    createdAt: created(),
  },
  (t) => [
    check(
      'media_rights',
      sql`${t.rightsStatus} in ('owned','licensed','permission','unknown')`,
    ),
    check('media_status', sql`${t.status} in ('processing','ready','failed')`),
    check('media_kind', sql`${t.kind} in ('image','video')`),
    check(
      'media_focal',
      sql`${t.focalX} between 0 and 1 and ${t.focalY} between 0 and 1`,
    ),
  ],
);
export const publicMediaRenditions = pgTable(
  'public_media_renditions',
  {
    storageKey: text('storage_key').primaryKey(),
    mediaId: uuid('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
  },
  (t) => [
    index('public_media_renditions_media_idx').on(t.mediaId),
    check(
      'public_media_rendition_key',
      sql`${t.storageKey} ~ '^[a-f0-9]{2}/[a-f0-9]{64}$'`,
    ),
  ],
);
export const collections = pgTable(
  'collections',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    kind: text('kind', { enum: ['normal', 'private_virtual', 'packages'] })
      .notNull()
      .default('normal'),
    name: localized('name').notNull(),
    shortName: localized('short_name'),
    headline: localized('headline'),
    subline: localized('subline'),
    perks: jsonb('perks').$type<{ title: Localized; sub: Localized }[]>(),
    color: text('color').notNull().default('#1B1712'),
    coverMediaId: uuid('cover_media_id').references(() => media.id),
    heroVideoId: uuid('hero_video_id').references(() => media.id),
    sort: integer('sort').notNull().default(0),
    status: text('status', { enum: ['draft', 'published'] })
      .notNull()
      .default('draft'),
    createdAt: created(),
    updatedAt: updated(),
    archivedAt: archived(),
  },
  (t) => [
    check(
      'collection_kind',
      sql`${t.kind} in ('normal','private_virtual','packages')`,
    ),
    check('collection_status', sql`${t.status} in ('draft','published')`),
  ],
);
export const trips = pgTable(
  'trips',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    story: jsonb('story').$type<import('@stella/shared/story').Story>(),
    kind: text('kind', { enum: ['trip', 'package'] })
      .notNull()
      .default('trip'),
    collectionId: uuid('collection_id')
      .notNull()
      .references(() => collections.id),
    title: localized('title').notNull(),
    summary: localized('summary'),
    description: localized('description'),
    daysLabel: localized('days_label'),
    runDays: smallint('run_days').array(),
    onRequest: boolean('on_request').notNull().default(false),
    departureLabel: text('departure_label'),
    returnLabel: text('return_label'),
    durationLabel: localized('duration_label'),
    durationMinutes: integer('duration_minutes'),
    daysCount: smallint('days_count').notNull().default(1),
    transport: text('transport'),
    format: text('format', { enum: ['group', 'private', 'both'] })
      .notNull()
      .default('both'),
    privateSurchargePct: numeric('private_surcharge_pct', {
      precision: 5,
      scale: 2,
    }),
    flight: boolean('flight').notNull().default(false),
    overnight: boolean('overnight').notNull().default(false),
    privateOnRequest: boolean('private_on_request').notNull().default(true),
    familyFriendly: boolean('family_friendly').notNull().default(false),
    minAge: smallint('min_age'),
    notes: jsonb('notes').$type<Localized[]>(),
    editorialNotes: jsonb('editorial_notes').$type<string[]>(),
    seoTitle: localized('seo_title'),
    seoDescription: localized('seo_description'),
    featuredOrder: smallint('featured_order'),
    sort: integer('sort').notNull().default(0),
    status: text('status', { enum: ['draft', 'published', 'hidden'] })
      .notNull()
      .default('draft'),
    createdAt: created(),
    updatedAt: updated(),
    archivedAt: archived(),
  },
  (t) => [
    index('trips_collection_status_sort').on(t.collectionId, t.status, t.sort),
    index('trips_title_search').using(
      'gin',
      sql`(${t.title}->>'en') gin_trgm_ops`,
    ),
    check('trip_kind', sql`${t.kind} in ('trip','package')`),
    check('trip_status', sql`${t.status} in ('draft','published','hidden')`),
    check('trip_format', sql`${t.format} in ('group','private','both')`),
    check('trip_days', sql`${t.daysCount} between 1 and 120`),
    check(
      'trip_private_surcharge',
      sql`${t.privateSurchargePct} is null or ${t.privateSurchargePct} >= 0`,
    ),
  ],
);
export const tripPrices = pgTable(
  'trip_prices',
  {
    id: id(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    label: localized('label'),
    amountEur: numeric('amount_eur', { precision: 10, scale: 2 }),
    unit: text('unit', {
      enum: [
        'person',
        'child',
        'quad',
        'buggy',
        'car',
        'boat',
        'group',
        'hour',
      ],
    }).notNull(),
    minQty: smallint('min_qty'),
    maxQty: smallint('max_qty'),
    isPrimary: boolean('is_primary').notNull().default(false),
    sort: integer('sort').notNull().default(0),
    validFrom: date('valid_from'),
    validTo: date('valid_to'),
  },
  (t) => [
    index('trip_prices_sort').on(t.tripId, t.sort),
    check(
      'price_nonnegative',
      sql`${t.amountEur} is null or ${t.amountEur} >= 0`,
    ),
    check(
      'price_unit',
      sql`${t.unit} in ('person','child','quad','buggy','car','boat','group','hour')`,
    ),
    check(
      'price_capacity',
      sql`(${t.minQty} is null or ${t.minQty}>0) and (${t.maxQty} is null or ${t.maxQty}>0) and (${t.minQty} is null or ${t.maxQty} is null or ${t.minQty}<=${t.maxQty})`,
    ),
  ],
);
export const tripItinerary = pgTable('trip_itinerary', {
  id: id(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id, { onDelete: 'cascade' }),
  timeLabel: text('time_label'),
  text: localized('text').notNull(),
  sort: integer('sort').notNull().default(0),
});
export const tripItems = pgTable(
  'trip_items',
  {
    id: id(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    type: text('type', {
      enum: ['include', 'exclude', 'optional', 'bring', 'highlight'],
    }).notNull(),
    text: localized('text').notNull(),
    extraPriceEur: numeric('extra_price_eur', { precision: 10, scale: 2 }),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [
    check(
      'item_type',
      sql`${t.type} in ('include','exclude','optional','bring','highlight')`,
    ),
  ],
);
export const packageItems = pgTable(
  'package_items',
  {
    packageId: uuid('package_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id),
    dayIndex: smallint('day_index'),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.packageId, t.tripId] }),
    check('package_no_self', sql`${t.packageId}<>${t.tripId}`),
  ],
);
export const tripMedia = pgTable(
  'trip_media',
  {
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    mediaId: uuid('media_id')
      .notNull()
      .references(() => media.id),
    role: text('role', { enum: ['cover', 'gallery', 'video'] }).notNull(),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.tripId, t.mediaId, t.role] }),
    check('trip_media_role', sql`${t.role} in ('cover','gallery','video')`),
  ],
);
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: updated(),
  updatedBy: uuid('updated_by').references(() => adminUsers.id),
});
export const pageBlocks = pgTable('page_blocks', {
  id: id(),
  pageKey: text('page_key').notNull(),
  type: text('type').notNull(),
  data: jsonb('data').notNull(),
  sort: integer('sort').notNull().default(0),
  status: text('status', { enum: ['draft', 'published'] })
    .notNull()
    .default('published'),
});
export const heroSlides = pgTable(
  'hero_slides',
  {
    id: id(),
    videoMediaId: uuid('video_media_id').references(() => media.id),
    imageMediaId: uuid('image_media_id').references(() => media.id),
    collectionId: uuid('collection_id').references(() => collections.id),
    kicker: localized('kicker'),
    headline: localized('headline'),
    subline: localized('subline'),
    ctaType: text('cta_type', {
      enum: ['collection', 'trip', 'package', 'my_trip', 'whatsapp', 'page'],
    })
      .notNull()
      .default('collection'),
    ctaTarget: text('cta_target'),
    ctaLabel: localized('cta_label'),
    durationS: smallint('duration_s').notNull().default(6),
    showOn: text('show_on', { enum: ['all', 'mobile', 'desktop'] })
      .notNull()
      .default('all'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    sort: integer('sort').notNull().default(0),
    status: text('status', { enum: ['draft', 'published'] })
      .notNull()
      .default('draft'),
    createdAt: created(),
    updatedAt: updated(),
    archivedAt: archived(),
  },
  (t) => [
    index('hero_status_sort').on(t.status, t.sort),
    check(
      'hero_media_required',
      sql`${t.videoMediaId} is not null or ${t.imageMediaId} is not null`,
    ),
    check('hero_duration', sql`${t.durationS} between 3 and 20`),
    check(
      'hero_schedule',
      sql`${t.startsAt} is null or ${t.endsAt} is null or ${t.startsAt}<${t.endsAt}`,
    ),
    check('hero_status', sql`${t.status} in ('draft','published')`),
    check('hero_device', sql`${t.showOn} in ('all','mobile','desktop')`),
    check(
      'hero_cta',
      sql`${t.ctaType} in ('collection','trip','package','my_trip','whatsapp','page')`,
    ),
  ],
);
export const faqs = pgTable('faqs', {
  id: id(),
  q: localized('q').notNull(),
  a: localized('a').notNull(),
  sort: integer('sort').notNull().default(0),
  status: text('status', { enum: ['draft', 'published'] })
    .notNull()
    .default('published'),
  archivedAt: archived(),
});
export const reviews = pgTable('reviews', {
  id: id(),
  author: text('author'),
  text: localized('text'),
  source: text('source'),
  sourceUrl: text('source_url').notNull(),
  rating: smallint('rating'),
  visitMonth: date('visit_month'),
  status: text('status').notNull().default('hidden'),
});
export const bookingRequests = pgTable(
  'booking_requests',
  {
    id: id(),
    ref: text('ref').notNull().unique(),
    anonymizedAt: timestamp('anonymized_at', { withTimezone: true }),
    mode: text('mode', { enum: ['single', 'multi'] }).notNull(),
    locale: text('locale').notNull(),
    startDate: date('start_date').notNull(),
    adults: smallint('adults').notNull(),
    children: smallint('children').notNull().default(0),
    childAges: smallint('child_ages').array(),
    format: text('format', { enum: ['group', 'private'] }),
    pickupArea: text('pickup_area'),
    hotel: text('hotel'),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    email: text('email'),
    notes: text('notes'),
    estimateEur: numeric('estimate_eur', { precision: 10, scale: 2 }),
    status: text('status', {
      enum: ['new', 'contacted', 'confirmed', 'completed', 'cancelled', 'spam'],
    })
      .notNull()
      .default('new'),
    assignedTo: uuid('assigned_to').references(() => adminUsers.id),
    internalNote: text('internal_note'),
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index('requests_status_created').on(t.status, t.createdAt),
    index('requests_created_id').on(t.createdAt, t.id),
    index('requests_phone').on(t.phone),
    check(
      'request_guests',
      sql`${t.adults} between 1 and 60 and ${t.children} between 0 and 40`,
    ),
    check(
      'request_status',
      sql`${t.status} in ('new','contacted','confirmed','completed','cancelled','spam')`,
    ),
    check('request_mode', sql`${t.mode} in ('single','multi')`),
    check('request_format', sql`${t.format} in ('group','private')`),
  ],
);
export const bookingRequestReceipts = pgTable(
  'booking_request_receipts',
  {
    submissionId: text('submission_id').primaryKey(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => bookingRequests.id, { onDelete: 'cascade' }),
    payloadHash: text('payload_hash').notNull(),
    confirmation: jsonb('confirmation').$type<Confirmation>(),
    expiresAt: timestamp('expires_at', { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '24 hours'`),
  },
  (t) => [
    index('request_receipt_request').on(t.requestId),
    index('request_receipt_expiry')
      .on(t.expiresAt)
      .where(sql`${t.confirmation} is not null`),
  ],
);
export const bookingRequestItems = pgTable(
  'booking_request_items',
  {
    requestId: uuid('request_id')
      .notNull()
      .references(() => bookingRequests.id, { onDelete: 'cascade' }),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id),
    dayIndex: smallint('day_index'),
    priceSnapshot: jsonb('price_snapshot'),
  },
  (t) => [
    primaryKey({ columns: [t.requestId, t.tripId] }),
    index('booking_request_items_trip').on(t.tripId),
  ],
);
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    createdAt: created(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    mfaPassed: boolean('mfa_passed').notNull().default(false),
    reauthAt: timestamp('reauth_at', { withTimezone: true }),
  },
  (t) => [index('sessions_user').on(t.userId)],
);
export const authTokens = pgTable('auth_tokens', {
  id: text('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => adminUsers.id, { onDelete: 'cascade' }),
  purpose: text('purpose', { enum: ['setup', 'reset', 'invite'] }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: created(),
});
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    userId: uuid('user_id'),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    ipHash: text('ip_hash'),
  },
  (t) => [
    index('audit_entity').on(t.entity, t.entityId),
    index('audit_at').on(t.at),
  ],
);
export const revisions = pgTable(
  'revisions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    entity: text('entity').notNull(),
    entityId: uuid('entity_id').notNull(),
    snapshot: jsonb('snapshot').notNull(),
    createdBy: uuid('created_by'),
    createdAt: created(),
  },
  (t) => [
    index('revision_entity_created').on(t.entity, t.entityId, t.createdAt),
  ],
);
export const contentTranslations = pgTable(
  'content_translations',
  {
    id: id(),
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    field: text('field').notNull(),
    locale: text('locale').notNull(),
    text: text('text').notNull(),
    sourceHash: text('source_hash').notNull(),
    origin: text('origin', { enum: ['machine', 'human'] }).notNull(),
    provider: text('provider'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex('translation_field_locale').on(
      t.entity,
      t.entityId,
      t.field,
      t.locale,
    ),
    index('translation_locale_entity').on(t.locale, t.entity),
    check('translation_origin', sql`${t.origin} in ('machine','human')`),
  ],
);
/** Keyed hashes of erased phone numbers; re-applied after a restore (SEC-10). */
export const privacyErasures = pgTable('privacy_erasures', {
  phoneHash: text('phone_hash').primaryKey(),
  erasedAt: timestamp('erased_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const rateBuckets = pgTable(
  'rate_buckets',
  {
    key: text('key').primaryKey(),
    count: integer('count').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('rate_buckets_expiry').on(t.expiresAt)],
);
export const outbox = pgTable(
  'outbox',
  {
    id: id(),
    name: text('name').notNull(),
    data: jsonb('data').notNull(),
    createdAt: created(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  },
  (t) => [
    index('outbox_pending')
      .on(t.createdAt)
      .where(sql`${t.deliveredAt} is null`),
    index('outbox_delivered')
      .on(t.deliveredAt)
      .where(sql`${t.deliveredAt} is not null`),
  ],
);
export const translationUsage = pgTable(
  'translation_usage',
  {
    month: text('month').notNull(),
    provider: text('provider').notNull(),
    characters: integer('characters').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.month, t.provider] })],
);
export const contentDrafts = pgTable(
  'content_drafts',
  {
    id: id(),
    entity: text('entity').notNull(),
    entityId: uuid('entity_id').notNull(),
    section: text('section').notNull(),
    data: jsonb('data').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => adminUsers.id),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex('draft_entity_section').on(t.entity, t.entityId, t.section),
  ],
);
