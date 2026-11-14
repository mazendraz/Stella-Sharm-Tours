import { locales, type Locale } from '@stella/shared';
import { bundledCoreText } from '@stella/shared/i18n/core-content';
import type { Row } from './content';

/**
 * Editor model for one multilingual field.
 * - raw:  values stored on the record itself (= written/reviewed by staff)
 * - init: raw at load time (dirty + stale detection)
 * - fb:   fallback shown when raw is empty (machine draft or bundled copy)
 * - reviewed: locales the user explicitly marked as reviewed this session
 */
export type Loc = {
  __loc: true;
  raw: Partial<Record<Locale, string>>;
  init: Partial<Record<Locale, string>>;
  fb: Partial<Record<Locale, string>>;
  reviewed: Locale[];
};
export type LocState = 'ok' | 'machine' | 'missing' | 'stale';

const clean = (value: unknown): Partial<Record<Locale, string>> => {
  const out: Partial<Record<Locale, string>> = {};
  if (value && typeof value === 'object')
    for (const locale of locales) {
      const v = (value as Record<string, unknown>)[locale];
      if (typeof v === 'string' && v.trim()) out[locale] = v;
    }
  return out;
};

/** Build a Loc from an API value and (optionally) content_translations rows for that field. */
export function loc(value: unknown, translations: Row[] = [], field = ''): Loc {
  const raw = clean(value),
    fb: Partial<Record<Locale, string>> = {};
  for (const locale of locales) {
    if (locale === 'en' || raw[locale]) continue;
    const row = field
      ? translations.find((r) => r.field === field && r.locale === locale)
      : undefined;
    const text =
      (typeof row?.text === 'string' && row.text.trim() ? row.text : null) ??
      (raw.en ? bundledCoreText(raw.en, locale) : null);
    if (text) fb[locale] = text;
  }
  return { __loc: true, raw, init: { ...raw }, fb, reviewed: [] };
}

export const isLoc = (value: unknown): value is Loc =>
  !!value && typeof value === 'object' && (value as Loc).__loc === true;

export const locDisplay = (l: Loc, locale: Locale) =>
  l.raw[locale] ?? (l.raw.en === l.init.en ? (l.fb[locale] ?? '') : '');

export const locChanged = (l: Loc) =>
  locales.some((locale) => (l.raw[locale] ?? '') !== (l.init[locale] ?? ''));

export const locEmpty = (l: Loc) =>
  !locales.some((locale) => (l.raw[locale] ?? '').trim());

export function locState(l: Loc, locale: Locale): LocState {
  if (locale === 'en') return (l.raw.en ?? '').trim() ? 'ok' : 'missing';
  if (locEmpty(l)) return 'ok'; // optional field left empty everywhere
  const own = (l.raw[locale] ?? '').trim();
  const enChanged = (l.raw.en ?? '') !== (l.init.en ?? '');
  if (
    own &&
    enChanged &&
    own === (l.init[locale] ?? '') &&
    !l.reviewed.includes(locale)
  )
    return 'stale';
  if (own) return 'ok';
  if (l.reviewed.includes(locale)) return 'ok';
  return locDisplay(l, locale).trim() ? 'machine' : 'missing';
}

export function locSet(l: Loc, locale: Locale, text: string): Loc {
  const raw = { ...l.raw };
  if (text) raw[locale] = text;
  else delete raw[locale];
  return { ...l, raw };
}

/** Problems that block saving a changed field (AGENTS: all seven languages). */
export function locProblems(l: Loc, required: boolean) {
  const missing: Locale[] = [],
    stale: Locale[] = [];
  if (required && !(l.raw.en ?? '').trim()) missing.push('en');
  if (!locChanged(l) || locEmpty(l)) return { missing, stale };
  for (const locale of locales) {
    const state = locState(l, locale);
    if (state === 'missing' && !missing.includes(locale)) missing.push(locale);
    if (state === 'stale') stale.push(locale);
  }
  return { missing, stale };
}

/** Value sent to the API. Unchanged → the original raw object (or null). */
export function locOut(l: Loc): Record<string, string> | null {
  if (locEmpty(l)) return null;
  if (!locChanged(l)) return Object.keys(l.init).length ? { ...l.init } : null;
  const out: Record<string, string> = {};
  for (const locale of locales) {
    const text = (l.raw[locale] ?? locDisplay(l, locale)).trim();
    if (text) out[locale] = l.raw[locale] ?? locDisplay(l, locale);
  }
  return out;
}

/** Walk any editor value tree. */
export function walkLocs(value: unknown, visit: (l: Loc) => void) {
  if (isLoc(value)) return visit(value);
  if (Array.isArray(value)) value.forEach((v) => walkLocs(v, visit));
  else if (value && typeof value === 'object')
    Object.values(value).forEach((v) => walkLocs(v, visit));
}

export function mapLocs<T>(value: T, fn: (l: Loc) => Loc): T {
  if (isLoc(value)) return fn(value) as T;
  if (Array.isArray(value)) return value.map((v) => mapLocs(v, fn)) as T;
  if (value && typeof value === 'object' && !(value instanceof Date))
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, mapLocs(v, fn)]),
    ) as T;
  return value;
}

/** Per-locale counts for the language bar. */
export function localeSummary(value: unknown) {
  const summary = Object.fromEntries(
    locales.map((locale) => [locale, { missing: 0, machine: 0, stale: 0 }]),
  ) as Record<Locale, { missing: number; machine: number; stale: number }>;
  walkLocs(value, (l) => {
    if (locEmpty(l)) return;
    for (const locale of locales) {
      const state = locState(l, locale);
      if (state !== 'ok') summary[locale][state]++;
    }
  });
  return summary;
}

/** "Mark FR as reviewed": copy what is displayed into the record for that locale. */
export function markReviewed<T>(value: T, locale: Locale): T {
  return mapLocs(value, (l) => {
    if (locEmpty(l)) return l;
    const text = locDisplay(l, locale);
    const raw = { ...l.raw };
    if (text.trim()) raw[locale] = text;
    return {
      ...l,
      raw,
      reviewed: l.reviewed.includes(locale)
        ? l.reviewed
        : [...l.reviewed, locale],
    };
  });
}

/** Deep equality for dirty tracking (ignores Loc fallbacks/review marks). */
export function same(a: unknown, b: unknown): boolean {
  if (isLoc(a) && isLoc(b))
    return locales.every(
      (locale) => (a.raw[locale] ?? '') === (b.raw[locale] ?? ''),
    );
  if (isLoc(a) || isLoc(b)) return false;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => same(v, b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as object),
      kb = Object.keys(b as object);
    return (
      ka.length === kb.length &&
      ka.every((k) =>
        same(
          (a as Record<string, unknown>)[k],
          (b as Record<string, unknown>)[k],
        ),
      )
    );
  }
  return (
    a === b || ((a ?? '') === '' && (b ?? '') === '' && a !== 0 && b !== 0)
  );
}
