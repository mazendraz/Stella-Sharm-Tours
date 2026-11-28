/**
 * Reads the SEO-relevant parts of a rendered public page. Same rules as
 * scripts/seo-check.mjs (the CI crawl); kept dependency-free so the API can
 * run a small live check for the admin.
 */
const attr = (tag: string, name: string) =>
  new RegExp(`\\s${name}="([^"]*)"`, 'i').exec(tag)?.[1];
export const decodeHtml = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'");

export type ParsedPage = ReturnType<typeof parsePage>;

export function parsePage(html: string) {
  const headEnd = html.indexOf('</head>'),
    titleAt = html.search(/<title>/i);
  const metas = [...html.matchAll(/<meta\s[^>]*>/gi)].map((m) => m[0]);
  const meta = (key: string, value: string) =>
    metas.find((t) => attr(t, key) === value)?.match(/content="([^"]*)"/)?.[1];
  const links = [...html.matchAll(/<link\s[^>]*>/gi)].map((m) => m[0]);
  const jsonld = [
    ...html.matchAll(
      /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ].map((m) => {
    try {
      return { ok: true as const, value: JSON.parse(m[1]!) as unknown };
    } catch {
      return { ok: false as const, value: null };
    }
  });
  const types = new Set<string>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      const t = (v as Record<string, unknown>)['@type'];
      [t].flat().forEach((x) => typeof x === 'string' && types.add(x));
      Object.values(v).forEach(walk);
    }
  };
  jsonld.forEach((j) => walk(j.value));
  return {
    metadataInHead: !(titleAt > headEnd && headEnd >= 0) && titleAt >= 0,
    lang: /<html[^>]*\slang="([^"]+)"/i.exec(html)?.[1] ?? null,
    title: decodeHtml(/<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? '').trim(),
    description: decodeHtml(meta('name', 'description') ?? '').trim(),
    robots: meta('name', 'robots') ?? '',
    ogImage: meta('property', 'og:image') ?? null,
    canonical:
      links
        .filter((t) => attr(t, 'rel') === 'canonical')
        .map((t) => attr(t, 'href'))[0] ?? null,
    alternates: Object.fromEntries(
      links
        .filter((t) => attr(t, 'rel') === 'alternate' && /hreflang/i.test(t))
        .map((t) => [
          attr(t, 'hrefLang') ?? attr(t, 'hreflang') ?? '',
          decodeHtml(attr(t, 'href') ?? ''),
        ]),
    ) as Record<string, string>,
    h1: (html.match(/<h1[\s>]/gi) ?? []).length,
    jsonld,
    schemaTypes: [...types].sort(),
    imgNoAlt: [...html.matchAll(/<img\s[^>]*>/gi)]
      .map((m) => m[0])
      .filter((t) => !/\salt="/i.test(t)).length,
    hrefs: [
      ...new Set(
        [...html.matchAll(/<a\s[^>]*href="(\/[^"#?]*)/gi)].map((m) => m[1]!),
      ),
    ],
  };
}

export type PageProblem =
  | 'status'
  | 'metadataInBody'
  | 'noindex'
  | 'lang'
  | 'title'
  | 'description'
  | 'canonical'
  | 'hreflang'
  | 'xDefault'
  | 'jsonld'
  | 'reviewMarkup'
  | 'h1'
  | 'imgAlt';

/** Problems on one page, given its expected canonical URL and languages. */
export function pageProblems(
  page: ParsedPage,
  expect: { url: string; locale: string; locales: string[]; status: number },
): PageProblem[] {
  const out: PageProblem[] = [];
  if (expect.status !== 200) return ['status'];
  if (!page.metadataInHead) out.push('metadataInBody');
  if (/noindex/i.test(page.robots)) out.push('noindex');
  if (page.lang !== expect.locale) out.push('lang');
  if (!page.title) out.push('title');
  if (!page.description) out.push('description');
  if (page.canonical !== expect.url) out.push('canonical');
  if (
    expect.locales.some((l) => !page.alternates[l]) ||
    page.alternates[expect.locale] !== expect.url
  )
    out.push('hreflang');
  if (!page.alternates['x-default']) out.push('xDefault');
  if (!page.jsonld.length || page.jsonld.some((j) => !j.ok)) out.push('jsonld');
  if (page.schemaTypes.some((t) => t === 'Review' || t === 'AggregateRating'))
    out.push('reviewMarkup');
  if (page.h1 !== 1) out.push('h1');
  if (page.imgNoAlt) out.push('imgAlt');
  return out;
}

/** Robots.txt groups → whether `agent` may fetch `path` (longest match wins). */
export function robotsAllows(robots: string, agent: string, path = '/') {
  const groups: { agents: string[]; rules: [boolean, string][] }[] = [];
  let current: (typeof groups)[number] | null = null,
    lastWasAgent = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1]!.toLowerCase(),
      value = m[2]!.trim();
    if (key === 'user-agent') {
      if (!lastWasAgent || !current)
        groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (current && (key === 'allow' || key === 'disallow') && value)
        current.rules.push([key === 'allow', value]);
    }
  }
  const name = agent.toLowerCase();
  const group =
    groups.find((g) => g.agents.includes(name)) ??
    groups.find((g) => g.agents.includes('*'));
  if (!group) return true;
  const matches = group.rules
    .filter(([, pattern]) => {
      const re = new RegExp(
        '^' +
          pattern
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*')
            .replace(/\\\$$/, '$'),
      );
      return re.test(path);
    })
    .sort((a, b) => b[1].length - a[1].length || Number(b[0]) - Number(a[0]));
  return matches.length ? matches[0]![0] : true;
}
