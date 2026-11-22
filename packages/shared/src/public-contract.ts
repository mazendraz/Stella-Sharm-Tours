import { z } from 'zod';
export const textSchema = z.object({
  text: z.string(),
  lang: z.string().min(2).max(16),
});
export type Text = z.infer<typeof textSchema>;
export const mediaSchema = z.object({
  url: z.string(),
  alt: textSchema,
  width: z.number().positive(),
  height: z.number().positive(),
  variants: z.record(z.string(), z.string()).optional(),
  video: z
    .object({
      vertical: z.string().nullable(),
      horizontal: z.string().nullable(),
    })
    .optional(),
  rights_status: z
    .enum(['owned', 'licensed', 'permission', 'unknown'])
    .default('unknown'),
});
export const priceSchema = z.object({
  id: z.string(),
  label: textSchema.nullable(),
  amount_eur: z.number().nonnegative().nullable(),
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
  min_qty: z.number().positive().nullable(),
  max_qty: z.number().positive().nullable(),
  is_primary: z.boolean(),
});
export const tripSchema = z.object({
  story_available: z.boolean().optional(),
  story_cover: mediaSchema.optional(),
  slug: z.string(),
  collection: z.string(),
  kind: z.enum(['trip', 'package']),
  title: textSchema,
  summary: textSchema.nullable(),
  description: textSchema.nullable(),
  cover: mediaSchema.nullable(),
  gallery: z.array(mediaSchema),
  duration_label: textSchema.nullable(),
  duration_minutes: z.number().nullable(),
  days_label: textSchema.nullable(),
  run_days: z.array(z.number().int().min(0).max(6)).nullable(),
  departure_label: z.string().nullable(),
  return_label: textSchema.nullable().optional(),
  days_count: z.number().int().min(1),
  flight: z.boolean(),
  overnight: z.boolean(),
  family_friendly: z.boolean(),
  min_age: z.number().nullable(),
  format: z.enum(['group', 'private', 'both']),
  private_surcharge_pct: z.number().nonnegative().nullable(),
  private_on_request: z.boolean(),
  prices: z.array(priceSchema),
  itinerary: z.array(
    z.object({ time: z.string().nullable(), text: textSchema }),
  ),
  items: z.array(
    z.object({
      type: z.enum(['include', 'exclude', 'optional', 'bring', 'highlight']),
      text: textSchema,
    }),
  ),
  notes: z.array(textSchema),
  parts: z.array(
    z.object({
      slug: z.string(),
      title: textSchema,
      cover: mediaSchema.nullable(),
      days_count: z.number().int().positive(),
      prices: z.array(priceSchema).optional(),
      format: z.enum(['group', 'private', 'both']).optional(),
      private_surcharge_pct: z.number().nonnegative().nullable().optional(),
    }),
  ),
  seo_title: textSchema.nullable(),
  seo_description: textSchema.nullable(),
});
export type Trip = z.infer<typeof tripSchema>;
export const savedTripsSchema = z.array(
  z.discriminatedUnion('status', [
    z.object({
      slug: z.string(),
      status: z.literal('available'),
      trip: tripSchema,
    }),
    z.object({ slug: z.string(), status: z.literal('withdrawn') }),
    z.object({ slug: z.string(), status: z.literal('unavailable') }),
  ]),
);
export const savedTripLimit = 38;
export type Price = z.infer<typeof priceSchema>;
export type Media = z.infer<typeof mediaSchema>;
export const collectionSchema = z.object({
  slug: z.string(),
  kind: z.enum(['normal', 'private_virtual', 'packages']),
  name: textSchema,
  short_name: textSchema,
  headline: textSchema,
  subline: textSchema.nullable(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  cover: mediaSchema.nullable(),
  trip_count: z.number().int().nonnegative(),
  min_price_eur: z.number().nonnegative().nullable(),
  max_days: z.number().int().positive(),
  previews: z.array(mediaSchema),
});
export type Collection = z.infer<typeof collectionSchema>;
export const localeSchema = z.object({
  code: z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]+)?$/),
  name: z.string(),
  auto: z.boolean(),
  indexable: z.boolean(),
  dir: z.enum(['ltr', 'rtl']),
});
export const slideSchema = z.object({
  id: z.string(),
  title: textSchema,
  kicker: textSchema.nullable(),
  subline: textSchema.nullable(),
  cta_label: textSchema,
  href: z.string(),
  cover: mediaSchema.nullable(),
  duration_s: z.number().min(3).max(30),
  device: z.enum(['all', 'mobile', 'desktop']),
  starts_at: z.string().nullable(),
  ends_at: z.string().nullable(),
});
export type Slide = z.infer<typeof slideSchema>;
export const siteSchema = z.object({
  name: z.string(),
  locales: z.array(localeSchema),
  contacts: z.object({
    whatsapp_primary: z.string().nullable(),
    whatsapp_secondary: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
  }),
  address: textSchema.nullable(),
  hours: textSchema.nullable(),
  legal_entity: textSchema.nullable(),
  home: z.object({
    private_heading: textSchema,
    private_text: textSchema,
    build_heading: textSchema,
    build_text: textSchema,
    contact_heading: textSchema,
    contact_text: textSchema,
  }),
  map_image: mediaSchema.nullable().optional(),
  hero_slides: z.array(slideSchema),
  featured_trips: z.array(tripSchema),
  private_trips: z.array(tripSchema),
  private_perks: z.array(z.object({ title: textSchema, sub: textSchema })),
  how_steps: z.array(z.object({ title: textSchema, text: textSchema })),
  pickup_areas: z.array(z.string()),
  social: z.array(z.object({ label: z.string(), url: z.url() })),
});
export type Site = z.infer<typeof siteSchema>;
export const collectionDetailSchema = z.object({
  collection: collectionSchema,
  trips: z.array(tripSchema),
  combo: tripSchema.nullable(),
});
export type CollectionDetail = z.infer<typeof collectionDetailSchema>;
export const pageSchema = z.object({
  title: textSchema,
  blocks: z.array(
    z.object({ heading: textSchema.nullable(), text: textSchema }),
  ),
});
export const faqSchema = z.array(
  z.object({ id: z.string(), q: textSchema, a: textSchema }),
);
