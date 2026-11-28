/**
 * Re-verified FAQ answers (data/content/faq-verified.json). The file is the
 * reviewed source; scripts/seed-faq-drafts.ts and seed-content-drafts.ts load
 * it as drafts. The schema enforces the content rules that make an answer
 * safe to publish after the owner has read it.
 */
import { z } from 'zod';
import { locales as coreLocales } from './index';
import { confirmMarker } from './content';

const seven = z
  .record(z.string(), z.string())
  .superRefine((value, ctx) => {
    for (const locale of coreLocales)
      if (!value[locale]?.trim())
        ctx.addIssue({ code: 'custom', message: 'missing ' + locale });
    for (const [locale, text] of Object.entries(value)) {
      // Prices live in the database only (AGENTS.md): no figures in prose.
      if (/[€$£]|\b\d+\s?(eur|euro|usd)\b/i.test(text))
        ctx.addIssue({ code: 'custom', message: 'price in ' + locale });
      if (confirmMarker.test(text))
        ctx.addIssue({ code: 'custom', message: 'unconfirmed in ' + locale });
    }
  })
  .transform((v) => v as Record<(typeof coreLocales)[number], string>);

export const verifiedFaqItem = z.strictObject({
  candidate: z.number().int().min(1).max(60),
  /** "faq" = the general FAQ page; otherwise the slug of a guide draft. */
  home: z.string().regex(/^(faq|[a-z0-9-]{1,120})$/),
  source: z.string().min(10),
  q: seven,
  a: seven,
});
export const verifiedFaqFile = z.object({
  verifiedOn: z.iso.date(),
  items: z.array(verifiedFaqItem),
});
export type VerifiedFaq = z.infer<typeof verifiedFaqItem>;
