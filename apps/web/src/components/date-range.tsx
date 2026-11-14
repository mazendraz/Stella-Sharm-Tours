'use client';
import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { stayDays } from '@stella/shared/booking';

// Our own range calendar for the request form: tap the first day, then the
// last day. Dates are ISO strings (YYYY-MM-DD) in Cairo time.
const iso = (d: Date) => d.toISOString().slice(0, 10);
const at = (v: string) => new Date(v + 'T12:00:00Z');

export function DateRange({
  start,
  end,
  min,
  max,
  needed,
  error,
  onChange,
}: {
  start: string;
  end: string;
  min: string;
  max: string;
  /** Days the selected trips need (shows a hint when the stay is shorter). */
  needed: number;
  error?: string | undefined;
  onChange: (start: string, end: string) => void;
}) {
  const t = useTranslations(),
    locale = useLocale();
  const [month, setMonth] = useState(() => (start || min).slice(0, 7));
  const fmt = useMemo(
    () => ({
      month: new Intl.DateTimeFormat(locale, {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }),
      weekday: new Intl.DateTimeFormat(locale, {
        weekday: 'narrow',
        timeZone: 'UTC',
      }),
      day: new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      }),
      full: new Intl.DateTimeFormat(locale, {
        dateStyle: 'full',
        timeZone: 'UTC',
      }),
    }),
    [locale],
  );
  const first = at(month + '-01');
  // Monday-first grid.
  const lead = (first.getUTCDay() + 6) % 7;
  const total = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const cells = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: total }, (_, i) =>
      iso(
        new Date(
          Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), i + 1, 12),
        ),
      ),
    ),
  ];
  const shift = (n: number) => {
    const d = new Date(
      Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + n, 1, 12),
    );
    setMonth(iso(d).slice(0, 7));
  };
  const pick = (d: string) => {
    // No start yet, a finished range, or a day before the start: start over.
    if (!start || end || d < start) onChange(d, '');
    else if (d === start) onChange(d, '');
    else onChange(start, d);
  };
  const days = start && end ? stayDays(start, end) : start ? 1 : 0;
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    fmt.weekday.format(at('2024-01-0' + (i + 1))),
  );
  return (
    <fieldset className="range-field" aria-describedby="range-summary">
      <legend>{t('date')}</legend>
      <p className="range-hint">{t('pickDates')}</p>
      <div className="range-cal">
        <div className="range-head">
          <button
            type="button"
            className="icon-button"
            aria-label={t('prevMonth')}
            disabled={month <= min.slice(0, 7)}
            onClick={() => shift(-1)}
          >
            <ChevronLeft size={20} className="flip-rtl" />
          </button>
          <strong aria-live="polite">{fmt.month.format(first)}</strong>
          <button
            type="button"
            className="icon-button"
            aria-label={t('nextMonth')}
            disabled={month >= max.slice(0, 7)}
            onClick={() => shift(1)}
          >
            <ChevronRight size={20} className="flip-rtl" />
          </button>
        </div>
        <div className="range-grid" role="grid">
          {weekdays.map((w, i) => (
            <span className="range-wd" key={'w' + i} aria-hidden="true">
              {w}
            </span>
          ))}
          {cells.map((d, i) =>
            !d ? (
              <span key={'e' + i} />
            ) : (
              <button
                type="button"
                key={d}
                disabled={d < min || d > max}
                className={
                  'range-day' +
                  (d === start ? ' is-start' : '') +
                  (d === end ? ' is-end' : '') +
                  (start && end && d > start && d < end ? ' in-range' : '') +
                  (start && end ? ' has-end' : '')
                }
                aria-pressed={d === start || d === end}
                aria-label={fmt.full.format(at(d))}
                onClick={() => pick(d)}
              >
                {Number(d.slice(-2))}
              </button>
            ),
          )}
        </div>
      </div>
      <div className="range-summary" id="range-summary" aria-live="polite">
        {start ? (
          <>
            <span>
              <bdi>{fmt.day.format(at(start))}</bdi>
              {end && (
                <>
                  {' → '}
                  <bdi>{fmt.day.format(at(end))}</bdi>
                </>
              )}
            </span>
            <strong>{t('daysNights', { days, nights: days - 1 })}</strong>
            <button
              type="button"
              className="text-link"
              onClick={() => onChange('', '')}
            >
              {t('clearDates')}
            </button>
          </>
        ) : (
          <span>{t('noDates')}</span>
        )}
      </div>
      {start && end && needed > days && (
        <p className="range-warn">{t('planNeeds', { days: needed })}</p>
      )}
      {error && <p className="field-error">{error}</p>}
      <input type="hidden" name="start_date" value={start} />
    </fieldset>
  );
}
