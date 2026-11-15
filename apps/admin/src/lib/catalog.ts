'use client';
import { useCallback, useMemo, useRef } from 'react';
import type { Locale } from '@stella/shared';
import { useAdmin, useData } from './admin-context';
import { content, rows, type Row } from './content';
import { money } from './format';
import { useMediaOptions } from './media-options';

export const priceUnits = [
  'person',
  'child',
  'quad',
  'buggy',
  'car',
  'boat',
  'group',
  'hour',
] as const;

export const primaryPrice = (prices: unknown) =>
  rows(prices).find((price) => price.isPrimary) ?? null;

/** "€55 / person" or "On request". Prices always come from the database. */
export function usePriceText() {
  const { t, locale } = useAdmin();
  return useCallback(
    (price: Record<string, unknown> | null | undefined, onRequest = false) => {
      if (!price || onRequest || price.amountEur == null) return t('onRequest');
      return t('pricePer', {
        amount: money(price.amountEur as string, locale) ?? '',
        unit: t('unit_' + String(price.unit)),
      });
    },
    [t, locale],
  );
}

export const formatLabelKey = (format: unknown) =>
  format === 'private'
    ? 'fmtPrivate'
    : format === 'both'
      ? 'fmtBoth'
      : 'fmtGroup';

export function useCollections(archived = false) {
  return useData<Row[]>(
    '/v1/admin/collections' + (archived ? '?archived=1' : ''),
  );
}
export function useTrips(enabled = true) {
  return useData<Row[]>('/v1/admin/trips', enabled);
}

/** Media lookups by id (cover thumbnails in lists). */
export function useMediaMap() {
  const media = useMediaOptions();
  return useMemo(
    () => new Map((media.data ?? []).map((row) => [row.id, row])),
    [media.data],
  );
}

export function localeTitle(value: unknown, locale: Locale, fallback = '') {
  return content(value, locale) || fallback;
}

/** Opens the signed public preview for a trip/package (t) or collection (c). */
export function usePreview() {
  const { request, report, locale } = useAdmin(),
    busy = useRef(false);
  return useCallback(
    async (kind: 't' | 'c', slug: string) => {
      if (busy.current) return;
      busy.current = true;
      // Open synchronously so pop-up blockers allow it, then point it at the URL.
      const tab = window.open('about:blank', '_blank');
      try {
        const result = await request<{ url: string }>(
          '/v1/admin/preview-link',
          'POST',
          { path: `/${locale}/${kind}/${slug}` },
        );
        if (tab) {
          tab.opener = null;
          tab.location.href = result.url;
        } else window.open(result.url, '_blank', 'noopener,noreferrer');
      } catch (error) {
        tab?.close();
        report(error);
      } finally {
        busy.current = false;
      }
    },
    [request, report, locale],
  );
}

/** Count of translatable core languages filled for a trip-like record (x/7). */
export function translationProgress(row: Row) {
  const fields = ['title', 'summary', 'description'].map((key) => row[key]);
  const codes = ['en', 'it', 'es', 'fr', 'de', 'ru', 'tr'] as const;
  return codes.filter((code) =>
    fields.every((value) => {
      if (!value || typeof value !== 'object') return true;
      const text = (value as Record<string, unknown>)[code];
      return typeof text === 'string' && text.trim().length > 0;
    }),
  ).length;
}
