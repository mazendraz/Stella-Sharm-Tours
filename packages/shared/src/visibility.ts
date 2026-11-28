/**
 * Manually recorded search / AI-visibility measurements. Nothing here is
 * collected automatically: rows come from staff entry or CSV import.
 */
import { z } from 'zod';

export const visibilityPlatforms = [
  'google-search',
  'google-ai-overviews',
  'google-ai-mode',
  'chatgpt-search',
  'gemini',
  'perplexity',
  'bing',
  'copilot',
] as const;
export type VisibilityPlatform = (typeof visibilityPlatforms)[number];

const list = z.array(z.string().trim().min(1).max(200)).max(30).default([]);
export const visibilityRow = z.strictObject({
  measuredOn: z.iso.date(),
  platform: z.enum(visibilityPlatforms),
  kind: z.enum(['ai', 'search']),
  promptId: z.string().trim().max(20).nullable().optional(),
  query: z.string().trim().min(2).max(500),
  lang: z.string().regex(/^[a-z]{2,3}$/),
  market: z.string().trim().max(40).nullable().optional(),
  branded: z.boolean().default(false),
  mentioned: z.boolean(),
  citedUrl: z
    .url()
    .refine((v) => /^https?:/.test(v))
    .nullable()
    .optional(),
  recommendedPosition: z.number().int().min(1).max(100).nullable().optional(),
  organicPosition: z.number().int().min(1).max(100).nullable().optional(),
  competitors: list,
  sources: list,
  notes: z.string().trim().max(2000).nullable().optional(),
});
export type VisibilityRow = z.infer<typeof visibilityRow>;
export const visibilityImport = z.strictObject({
  rows: z.array(visibilityRow).min(1).max(2000),
});

/** CSV columns, shared by import, export and scripts/visibility-benchmark.mjs. */
export const visibilityCsvColumns = [
  'tested_on',
  'platform',
  'kind',
  'id',
  'prompt',
  'lang',
  'market',
  'branded',
  'mentioned',
  'cited_url',
  'recommended_position',
  'organic_position',
  'competitors',
  'sources',
  'notes',
] as const;

/**
 * Spreadsheet apps run a cell that starts with = + - @ (or a tab / CR) as a
 * formula. Exported text gets a leading apostrophe so it stays text; import
 * removes that apostrophe again, so a file round-trips unchanged.
 */
const formulaStart = /^[=+\-@\t\r]/;
export const csvSafe = (s: string) => (formulaStart.test(s) ? "'" + s : s);
const csvUnsafe = (s: string) =>
  s.startsWith("'") && formulaStart.test(s.slice(1)) ? s.slice(1) : s;

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false;
  const endCell = () => {
    row.push(cell);
    cell = '';
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') endCell();
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else cell += c;
  }
  if (cell || row.length) endRow();
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  if (!head) return [];
  const keys = head.map((h) => h.trim().toLowerCase());
  return body.map((r) =>
    Object.fromEntries(keys.map((k, i) => [k, csvUnsafe((r[i] ?? '').trim())])),
  );
}

const yes = (v: string | undefined) => /^(y|yes|true|1|si|sì)$/i.test(v ?? '');
const num = (v: string | undefined) =>
  v && /^\d+$/.test(v) ? Number(v) : null;
const split = (v: string | undefined) =>
  (v ?? '')
    .split(/[;|]/)
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * CSV → rows. Rows without a test date are "not tested" and skipped (they are
 * never counted as "not mentioned"). Returns per-line errors instead of
 * throwing, so the admin can show them.
 */
export function rowsFromCsv(text: string) {
  const ok: VisibilityRow[] = [],
    errors: { line: number; message: string }[] = [];
  parseCsv(text).forEach((r, i) => {
    const date = r.tested_on || r.measured_on;
    if (!date) return;
    const parsed = visibilityRow.safeParse({
      measuredOn: date,
      platform: r.platform,
      kind:
        r.kind ||
        (['google-search', 'bing'].includes(r.platform ?? '')
          ? 'search'
          : 'ai'),
      promptId: r.id || null,
      query: r.prompt || r.query,
      lang: r.lang,
      market: r.market || null,
      branded: yes(r.branded),
      mentioned: yes(r.mentioned),
      citedUrl: r.cited_url || null,
      recommendedPosition: num(r.recommended_position),
      organicPosition: num(r.organic_position),
      competitors: split(r.competitors),
      sources: split(r.sources),
      notes: r.notes || null,
    });
    if (parsed.success) ok.push(parsed.data);
    else
      errors.push({
        line: i + 2,
        message: parsed.error.issues
          .map((x) => x.path.join('.') + ': ' + x.message)
          .join('; '),
      });
  });
  return { rows: ok, errors };
}

const cell = (v: unknown) => {
  const s = csvSafe(
    Array.isArray(v)
      ? v.join('; ')
      : v === null || v === undefined
        ? ''
        : String(v),
  );
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
export function rowsToCsv(rows: VisibilityRow[]): string {
  return [
    visibilityCsvColumns.join(','),
    ...rows.map((r) =>
      [
        r.measuredOn,
        r.platform,
        r.kind,
        r.promptId ?? '',
        r.query,
        r.lang,
        r.market ?? '',
        r.branded,
        r.mentioned ? 'y' : 'n',
        r.citedUrl ?? '',
        r.recommendedPosition ?? '',
        r.organicPosition ?? '',
        r.competitors,
        r.sources,
        r.notes ?? '',
      ]
        .map(cell)
        .join(','),
    ),
  ].join('\n');
}

/** Rates per month × platform over NON-branded rows actually tested. */
export function visibilityTrend(rows: VisibilityRow[]) {
  const groups = new Map<string, VisibilityRow[]>();
  for (const r of rows) {
    if (r.branded) continue;
    const key = r.measuredOn.slice(0, 7) + '|' + r.platform;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const [month, platform] = key.split('|') as [string, VisibilityPlatform];
      const share = (pred: (r: VisibilityRow) => boolean) =>
        list.filter(pred).length / list.length;
      return {
        month,
        platform,
        tested: list.length,
        mentioned: share((r) => r.mentioned),
        cited: share((r) => Boolean(r.citedUrl)),
        recommended: share(
          (r) =>
            r.recommendedPosition !== null &&
            r.recommendedPosition !== undefined,
        ),
        topThree: share((r) => (r.organicPosition ?? 99) <= 3),
      };
    })
    .sort(
      (a, b) =>
        a.month.localeCompare(b.month) || a.platform.localeCompare(b.platform),
    );
}

/** Competitors named most often across tested rows. */
export function topCompetitors(rows: VisibilityRow[], limit = 10) {
  const counts = new Map<string, number>();
  for (const r of rows)
    for (const c of r.competitors) {
      const k = c.toLowerCase();
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}
