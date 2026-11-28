import { describe, expect, it } from 'vitest';
import { contentPageInput, parseBody, publishProblems } from './content';
import {
  rowsFromCsv,
  rowsToCsv,
  topCompetitors,
  visibilityTrend,
} from './visibility';
import drafts from '../../../data/content/guides-draft.json' with { type: 'json' };

const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ');

describe('content pages', () => {
  it('parses headings, paragraphs and lists without accepting HTML', () => {
    expect(
      parseBody('## Title\nLine one\nline two\n\n- a\n- b\n\n<b>x</b>'),
    ).toEqual([
      { type: 'heading', text: 'Title' },
      { type: 'paragraph', text: 'Line one line two' },
      { type: 'list', items: ['a', 'b'] },
      { type: 'paragraph', text: '<b>x</b>' },
    ]);
  });

  it('blocks thin, unsourced, anonymous or unconfirmed pages', () => {
    expect(publishProblems({ kind: 'guide', body: { en: words(50) } })).toEqual(
      ['bodyTooShort', 'noSummary', 'noAuthor', 'noSources', 'noRelatedTrips'],
    );
    const ready = {
      kind: 'guide' as const,
      summary: { en: 'Summary' },
      body: { en: words(320) },
      authorName: 'Staff member',
      sources: [{}],
      relatedTrips: ['a'],
    };
    expect(publishProblems(ready)).toEqual([]);
    expect(
      publishProblems({
        ...ready,
        body: { en: words(320), it: 'x [CONFIRM: fee]' },
      }),
    ).toEqual(['unconfirmedFacts']);
  });

  it('ships ten valid drafts, none publishable yet', () => {
    expect(drafts.pages).toHaveLength(10);
    for (const page of drafts.pages) {
      const parsed = contentPageInput.parse(page);
      expect(publishProblems(parsed).length).toBeGreaterThan(0);
      // Prices live in the database, never in prose.
      expect(JSON.stringify(page.body)).not.toMatch(/€\s?\d|\d\s?€/);
    }
  });
});

describe('visibility records', () => {
  const csv = [
    'tested_on,platform,kind,id,prompt,lang,market,branded,mentioned,cited_url,recommended_position,organic_position,competitors,sources,notes',
    '2026-12-01,perplexity,ai,P01,"Best excursions, Sharm?",en,UK,false,y,https://stellasharmtours.com/en,2,,Viator; Civitatis,,',
    '2026-12-01,bing,search,S01,sharm excursions,en,UK,false,n,,,7,,,',
    ',gemini,ai,P01,Not tested yet,en,UK,false,,,,,,,',
    '2026-12-01,unknown-ai,ai,P02,bad platform,en,UK,false,n,,,,,,',
  ].join('\n');

  it('imports tested rows, skips untested ones and reports bad lines', () => {
    const { rows, errors } = rowsFromCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      query: 'Best excursions, Sharm?',
      mentioned: true,
      recommendedPosition: 2,
      competitors: ['Viator', 'Civitatis'],
    });
    expect(errors).toEqual([expect.objectContaining({ line: 5 })]);
  });

  it('neutralises spreadsheet formulas on export and round-trips them', () => {
    const { rows } = rowsFromCsv(csv);
    const evil = {
      ...rows[0]!,
      query: '=HYPERLINK("http://x","y")',
      notes: '+cmd',
      competitors: ['@SUM(A1)', 'Viator'],
    };
    const line = rowsToCsv([evil]).split('\n')[1]!;
    expect(line).toContain(`"'=HYPERLINK(""http://x"",""y"")"`);
    expect(line).toContain(",'+cmd");
    expect(line).toContain(",'@SUM(A1); Viator,");
    expect(rowsFromCsv(rowsToCsv([evil])).rows).toEqual([evil]);
  });

  it('round-trips through CSV export', () => {
    const { rows } = rowsFromCsv(csv);
    expect(rowsFromCsv(rowsToCsv(rows)).rows).toEqual(rows);
  });

  it('computes trends only from recorded, non-branded rows', () => {
    const { rows } = rowsFromCsv(csv);
    const trend = visibilityTrend([
      ...rows,
      { ...rows[0]!, branded: true, mentioned: false },
    ]);
    expect(trend).toEqual([
      expect.objectContaining({
        platform: 'bing',
        tested: 1,
        mentioned: 0,
        topThree: 0,
      }),
      expect.objectContaining({
        platform: 'perplexity',
        tested: 1,
        mentioned: 1,
        cited: 1,
      }),
    ]);
    expect(topCompetitors(rows)[0]).toEqual({ name: 'viator', count: 1 });
  });
});
