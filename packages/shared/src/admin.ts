import { z } from 'zod';
export const roles = ['owner', 'manager', 'editor', 'sales'] as const;
export type Role = (typeof roles)[number];
export const permissions = {
  requests: ['owner', 'manager', 'sales'],
  export: ['owner', 'manager'],
  content: ['owner', 'manager', 'editor'],
  prices: ['owner', 'manager'],
  publish: ['owner', 'manager'],
  heroDraft: ['owner', 'manager', 'editor'],
  heroLive: ['owner', 'manager'],
  translations: ['owner', 'manager', 'editor'],
  languages: ['owner', 'manager'],
  settings: ['owner'],
  users: ['owner'],
  audit: ['owner', 'manager'],
} satisfies Record<string, readonly Role[]>;
export type Permission = keyof typeof permissions;
export const can = (role: Role, action: Permission) =>
  (permissions[action] as readonly Role[]).includes(role);
export const localizedSchema = z.strictObject({
  en: z.string().trim().min(1).max(20000),
  it: z.string().max(20000).optional(),
  es: z.string().max(20000).optional(),
  fr: z.string().max(20000).optional(),
  de: z.string().max(20000).optional(),
  ru: z.string().max(20000).optional(),
  tr: z.string().max(20000).optional(),
});
export const slugSchema = z.string().regex(/^[a-z0-9-]{1,120}$/);
export const loginSchema = z.strictObject({
  email: z.email().max(254),
  password: z.string().min(1).max(256),
});
export const resetRequestSchema = z.strictObject({ email: z.email().max(254) });
export const privacyRequestSchema = z.strictObject({
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
});
export const eraseRequestSchema = privacyRequestSchema
  .extend({ confirm: z.literal(true) })
  .strict();
export const passwordTokenSchema = z.strictObject({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  password: z.string().min(12).max(256),
});
export const reauthSchema = loginSchema.pick({ password: true }).strict();
export const basicsSchema = z.strictObject({
  title: localizedSchema.optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9-]{1,120}$/)
    .optional(),
  summary: localizedSchema.nullable().optional(),
  description: localizedSchema.nullable().optional(),
  collectionId: z.uuid().optional(),
  format: z.enum(['group', 'private', 'both']).optional(),
  privateSurchargePct: z.number().min(0).max(999).nullable().optional(),
  privateOnRequest: z.boolean().optional(),
  familyFriendly: z.boolean().optional(),
  minAge: z.number().int().min(0).max(100).nullable().optional(),
  featuredOrder: z.number().int().min(0).max(99).nullable().optional(),
});
export const createTripSchema = basicsSchema
  .required({ title: true, collectionId: true })
  .extend({ slug: slugSchema })
  .strict();
export const scheduleSchema = z.strictObject({
  daysLabel: localizedSchema.nullable().optional(),
  runDays: z.array(z.number().int().min(0).max(6)).max(7).nullable().optional(),
  departureLabel: z.string().max(100).nullable().optional(),
  returnLabel: z.string().max(100).nullable().optional(),
  durationLabel: localizedSchema.nullable().optional(),
  durationMinutes: z
    .number()
    .int()
    .positive()
    .max(172800)
    .nullable()
    .optional(),
  daysCount: z.number().int().min(1).max(120).optional(),
  transport: z.string().max(80).nullable().optional(),
  flight: z.boolean().optional(),
  overnight: z.boolean().optional(),
  onRequest: z.boolean().optional(),
});
export const seoSchema = z.strictObject({
  seoTitle: localizedSchema.nullable().optional(),
  seoDescription: localizedSchema.nullable().optional(),
});
export const priceRowSchema = z
  .strictObject({
    id: z.uuid().optional(),
    label: localizedSchema.nullable(),
    amountEur: z.number().min(0).max(99999999).nullable(),
    unit: z.enum([
      'person',
      'child',
      'quad',
      'buggy',
      'car',
      'boat',
      'group',
      'hour',
    ]),
    minQty: z.number().int().positive().max(100).nullable().optional(),
    maxQty: z.number().int().positive().max(100).nullable().optional(),
    isPrimary: z.boolean(),
    validFrom: z.iso.date().nullable().optional(),
    validTo: z.iso.date().nullable().optional(),
  })
  .refine((p) => !p.minQty || !p.maxQty || p.minQty <= p.maxQty)
  .refine((p) => !p.validFrom || !p.validTo || p.validFrom <= p.validTo);
export const pricesSchema = z.strictObject({
  rows: z
    .array(priceRowSchema)
    .min(1)
    .max(30)
    .refine((rows) => rows.filter((p) => p.isPrimary).length === 1),
  confirmLargeChange: z.boolean().optional(),
});
export const itinerarySchema = z.strictObject({
  rows: z
    .array(
      z.strictObject({
        id: z.uuid().optional(),
        timeLabel: z.string().max(100).nullable(),
        text: localizedSchema,
      }),
    )
    .max(100),
});
export const itemsSchema = z.strictObject({
  rows: z
    .array(
      z.strictObject({
        id: z.uuid().optional(),
        type: z.enum(['include', 'exclude', 'optional', 'bring', 'highlight']),
        text: localizedSchema,
        extraPriceEur: z.number().nonnegative().nullable().optional(),
      }),
    )
    .max(200),
});
export const reorderSchema = z.strictObject({
  ids: z
    .array(z.uuid())
    .min(1)
    .max(200)
    .refine((ids) => new Set(ids).size === ids.length),
});
export const requestPatchSchema = z.strictObject({
  status: z
    .enum(['new', 'contacted', 'confirmed', 'completed', 'cancelled', 'spam'])
    .optional(),
  assignedTo: z.uuid().nullable().optional(),
  internalNote: z.string().max(2000).nullable().optional(),
});
export const internalPath = z
  .string()
  .max(200)
  .refine((v) => /^\/(?!\/)[a-zA-Z0-9/_-]*$/.test(v));
export const heroSchema = z.strictObject({
  videoMediaId: z.uuid().nullable().optional(),
  imageMediaId: z.uuid().nullable().optional(),
  collectionId: z.uuid().nullable().optional(),
  kicker: localizedSchema.nullable().optional(),
  headline: localizedSchema.nullable().optional(),
  subline: localizedSchema.nullable().optional(),
  ctaType: z
    .enum(['collection', 'trip', 'package', 'my_trip', 'whatsapp', 'page'])
    .optional(),
  ctaTarget: z
    .string()
    .max(200)
    .refine(
      (v) =>
        v === '' || /^[a-z0-9-]+$/.test(v) || internalPath.safeParse(v).success,
    )
    .nullable()
    .optional(),
  ctaLabel: localizedSchema.nullable().optional(),
  durationS: z.number().int().min(3).max(20).optional(),
  showOn: z.enum(['all', 'mobile', 'desktop']).optional(),
  startsAt: z.iso.datetime().nullable().optional(),
  endsAt: z.iso.datetime().nullable().optional(),
});
export const mediaPatchSchema = z.strictObject({
  alt: localizedSchema.optional(),
  credit: z.string().max(500).nullable().optional(),
  license: z.string().max(1000).nullable().optional(),
  rightsStatus: z
    .enum(['owned', 'licensed', 'permission', 'unknown'])
    .optional(),
  focalX: z.number().min(0).max(1).optional(),
  focalY: z.number().min(0).max(1).optional(),
  autoEnhance: z.boolean().optional(),
});
export const collectionEditSchema = z.strictObject({
  name: localizedSchema.optional(),
  shortName: localizedSchema.nullable().optional(),
  headline: localizedSchema.nullable().optional(),
  subline: localizedSchema.nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .optional(),
  coverMediaId: z.uuid().nullable().optional(),
  heroVideoId: z.uuid().nullable().optional(),
  perks: z
    .array(z.strictObject({ title: localizedSchema, sub: localizedSchema }))
    .max(4)
    .optional(),
});
