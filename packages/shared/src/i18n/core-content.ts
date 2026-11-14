import { z } from 'zod';
import source from '../../../../data/i18n/core-source.json' with { type: 'json' };
import content from '../../../../data/i18n/core-content.json' with { type: 'json' };
import { locales, type Locale } from '../index';
const rows = z
  .array(
    z.tuple([
      z.number().int().nonnegative(),
      z.string().min(1),
      z.string().min(1),
      z.string().min(1),
      z.string().min(1),
      z.string().min(1),
      z.string().min(1),
    ]),
  )
  .parse(content.rows);
const entries = new Map(rows.map(([index, ...values]) => [index, values]));
if (entries.size !== rows.length || rows.some((row) => row[0] >= source.length))
  throw new Error('Invalid core content source index');
export const coreContentSources = source;
export const coreContentLocales = content.locales as Exclude<Locale, 'en'>[];
export function bundledCoreText(en: string, locale: Locale): string | null {
  if (locale === 'en') return en;
  const index = source.indexOf(en);
  if (index < 0) return null;
  // Clock times, punctuation and empty strings are language independent.
  if (!/[A-Za-z]/.test(en)) return en;
  const values = entries.get(index);
  return values?.[coreContentLocales.indexOf(locale)] ?? null;
}
for (const en of source)
  for (const locale of locales)
    if (bundledCoreText(en, locale) === null)
      throw new Error(
        'Missing bundled core translation: ' + locale + ' / ' + en,
      );
