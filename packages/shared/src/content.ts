/**
 * Travel guides, destination and activity pages: admin input, public shape,
 * publication rules and the small body format the site renders.
 */
import { z } from 'zod';
import { localizedSchema } from './admin';
import { mediaSchema, textSchema } from './public-contract';

export const contentKinds = ['guide', 'destination', 'activity'] as const;
export type ContentKind = (typeof contentKinds)[number];
const slug = z.string().regex(/^[a-z0-9-]{1,120}$/);

export const contentPageInput = z.strictObject({
  slug,
  kind: z.enum(contentKinds),
  category: z.string().trim().max(60).nullable().optional(),
  title: localizedSchema,
  summary: localizedSchema.nullable().optional(),
  body: localizedSchema.nullable().optional(),
  seoTitle: localizedSchema.nullable().optional(),
  seoDescription: localizedSchema.nullable().optional(),
  authorName: z.string().trim().max(120).nullable().optional(),
  authorRole: z.string().trim().max(120).nullable().optional(),
  sources: z
    .array(
      z.strictObject({
        title: z.string().trim().min(1).max(200),
        url: z.url().refine((v) => new URL(v).protocol === 'https:'),
      }),
    )
    .max(30)
    .optional(),
  faqs: z
    .array(z.strictObject({ q: localizedSchema, a: localizedSchema }))
    .max(20)
    .optional(),
  coverMediaId: z.uuid().nullable().optional(),
  relatedTrips: z.array(slug).max(12).optional(),
  relatedPages: z.array(slug).max(12).optional(),
  sort: z.number().int().min(0).max(100000).optional(),
});
export type ContentPageInput = z.infer<typeof contentPageInput>;

/** Minimum depth before a page may be published (no thin pages). */
export const publishRules = {
  minBodyWords: { guide: 300, destination: 250, activity: 200 },
  minSources: { guide: 1, destination: 1, activity: 0 },
  minRelatedTrips: { guide: 1, destination: 1, activity: 1 },
} as const;

export type PublishProblem =
  | 'bodyTooShort'
  | 'noSummary'
  | 'noAuthor'
  | 'noSources'
  | 'noRelatedTrips'
  | 'unconfirmedFacts';

/** Drafts mark facts the owner must check as [CONFIRM: …]; never publishable. */
export const confirmMarker = /\[CONFIRM\b/i;

const words = (text: string | undefined | null) =>
  (text ?? '').trim().split(/\s+/).filter(Boolean).length;

/** English depth checks; the 7-language check is done by the API. */
export function publishProblems(page: {
  kind: ContentKind;
  title?: Record<string, unknown> | null | undefined;
  seoTitle?: Record<string, unknown> | null | undefined;
  seoDescription?: Record<string, unknown> | null | undefined;
  summary?:
    ({ en: string } & Record<string, string | undefined>) | null | undefined;
  body?:
    ({ en: string } & Record<string, string | undefined>) | null | undefined;
  faqs?:
    | { q: Record<string, unknown>; a: Record<string, unknown> }[]
    | null
    | undefined;
  authorName?: string | null | undefined;
  sources?: unknown[] | null | undefined;
  relatedTrips?: string[] | null | undefined;
}): PublishProblem[] {
  const out: PublishProblem[] = [];
  if (words(page.body?.en) < publishRules.minBodyWords[page.kind])
    out.push('bodyTooShort');
  if (!page.summary?.en?.trim()) out.push('noSummary');
  if (!page.authorName?.trim()) out.push('noAuthor');
  if ((page.sources?.length ?? 0) < publishRules.minSources[page.kind])
    out.push('noSources');
  if (
    (page.relatedTrips?.length ?? 0) < publishRules.minRelatedTrips[page.kind]
  )
    out.push('noRelatedTrips');
  // Any language, any text field: a marker anywhere blocks publication.
  const texts = [
    page.title,
    page.summary,
    page.body,
    page.seoTitle,
    page.seoDescription,
    ...(page.faqs ?? []).flatMap((f) => [f.q, f.a]),
  ].flatMap((l) => Object.values(l ?? {}));
  if (texts.some((t) => typeof t === 'string' && confirmMarker.test(t)))
    out.push('unconfirmedFacts');
  return out;
}

/**
 * Body format: paragraphs separated by blank lines, "## " for a section
 * heading, lines starting with "- " for a list. No HTML is accepted; the
 * site renders these blocks as elements, so there is nothing to sanitize.
 */
export type BodyBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] };

export function parseBody(text: string): BodyBlock[] {
  const blocks: BodyBlock[] = [];
  for (const chunk of text.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const lines = chunk
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) continue;
    let paragraph: string[] = [];
    let list: string[] = [];
    const flush = () => {
      if (paragraph.length)
        blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
      if (list.length) blocks.push({ type: 'list', items: list });
      paragraph = [];
      list = [];
    };
    for (const line of lines) {
      if (line.startsWith('## ')) {
        flush();
        blocks.push({ type: 'heading', text: line.slice(3).trim() });
      } else if (line.startsWith('- ')) {
        if (paragraph.length) flush();
        list.push(line.slice(2).trim());
      } else {
        if (list.length) flush();
        paragraph.push(line);
      }
    }
    flush();
  }
  return blocks;
}

export const publicContentPageSchema = z.object({
  slug: z.string(),
  kind: z.enum(contentKinds),
  category: z.string().nullable(),
  title: textSchema,
  summary: textSchema.nullable(),
  body: textSchema.nullable(),
  seo_title: textSchema.nullable(),
  seo_description: textSchema.nullable(),
  author: z
    .object({ name: z.string(), role: z.string().nullable() })
    .nullable(),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
  faqs: z.array(z.object({ q: textSchema, a: textSchema })),
  cover: mediaSchema.nullable(),
  related_trips: z.array(z.string()),
  related_pages: z.array(
    z.object({
      slug: z.string(),
      kind: z.enum(contentKinds),
      title: textSchema,
    }),
  ),
  published_at: z.string().nullable(),
  updated_at: z.string(),
});
export type PublicContentPage = z.infer<typeof publicContentPageSchema>;
export const publicContentListSchema = z.array(
  publicContentPageSchema.pick({
    slug: true,
    kind: true,
    category: true,
    title: true,
    summary: true,
    cover: true,
    related_trips: true,
    updated_at: true,
  }),
);
