'use client';
import './seo.css';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Locale } from '@stella/shared';
import { can } from '@stella/shared/admin';
import {
  completenessChecks,
  type CompletenessCheck,
  type TripHealth,
} from '@stella/shared/seo-health';
import {
  factCounts,
  factStatuses,
  siteTopics,
  tripTopics,
  type FactStatus,
  type StoredFact,
} from '@stella/shared/verification';
import { csvSafe } from '@stella/shared/visibility';
import { useAdmin, useData } from '../lib/admin-context';
import { PageHeader } from '../components/ui/page-header';
import { LoadError, Skeleton } from '../components/ui/states';
import { Segmented } from '../components/ui/field';
import { AppLink } from '../components/ui/link';

type SeoData = {
  locales: Locale[];
  trips: {
    id: string;
    slug: string;
    kind: 'trip' | 'package';
    status: string;
    title: Partial<Record<Locale, string>> & { en: string };
  }[];
  health: TripHealth[];
};
type TripRow = { id: string; featuredOrder: number | null; sort: number };

/** Facts only the business can supply (never inferred by the site). */
const businessFacts: CompletenessCheck[] = [
  'description',
  'excludes',
  'bring',
  'itinerary',
  'departure',
  'price',
];
const tone: Record<FactStatus, string> = {
  missing: 'red',
  to_confirm: 'amber',
  verified: 'green',
};
const csvCell = (v: string) => {
  const s = csvSafe(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

export function Verification() {
  const { t, locale, me } = useAdmin(),
    seo = useData<SeoData>('/v1/admin/seo'),
    trips = useData<TripRow[]>('/v1/admin/trips'),
    answers = useData<{ facts: StoredFact[] }>('/v1/admin/verification'),
    [filter, setFilter] = useState<'open' | 'all'>('open'),
    [field, setField] = useState<string>(''),
    [expanded, setExpanded] = useState<string | null>(null);
  const facts = useMemo(() => answers.data?.facts ?? [], [answers.data]),
    mayRecord = me ? can(me.role, 'publish') : false;
  const status = (tripId: string | null, topic: string): FactStatus =>
    facts.find((f) => f.tripId === tripId && f.topic === topic)?.status ??
    'missing';

  const rows = useMemo(() => {
    if (!seo.data) return [];
    const meta = new Map((trips.data ?? []).map((r) => [r.id, r]));
    return seo.data.trips
      .map((trip) => {
        const health = seo.data!.health.find((h) => h.id === trip.id)!;
        const missingLangs = seo.data!.locales.filter((l) =>
          health.issues.some(
            (i) => i.code === 'translationMissing' && i.locale === l,
          ),
        );
        const counts = factCounts(facts, trip.id, tripTopics);
        return {
          trip,
          health,
          missingLangs,
          counts,
          open: health.missing.length + counts.missing + counts.to_confirm,
          featured: meta.get(trip.id)?.featuredOrder ?? null,
          sort: meta.get(trip.id)?.sort ?? 0,
          readiness: health.done.length / completenessChecks.length,
          publishable:
            trip.status === 'published' &&
            !health.issues.some((i) => i.severity === 'error'),
        };
      })
      .filter((r) => filter === 'all' || r.open > 0)
      .filter((r) => {
        if (!field) return true;
        const [type, name] = field.split(':');
        if (type === 'check')
          return r.health.missing.includes(name as CompletenessCheck);
        if (type === 'lang') return r.missingLangs.length > 0;
        return status(r.trip.id, name!) !== 'verified';
      })
      .sort(
        (a, b) =>
          Number(b.trip.status === 'published') -
            Number(a.trip.status === 'published') ||
          (a.featured ?? 999) - (b.featured ?? 999) ||
          a.sort - b.sort,
      );
  }, [seo.data, trips.data, facts, filter, field]);

  const exportCsv = () => {
    const lines = [
      [
        'priority',
        'tour',
        'slug',
        'tour_status',
        'item',
        'item_status',
        'who',
        'missing_languages',
      ].join(','),
    ];
    for (const topic of siteTopics)
      if (status(null, topic) !== 'verified')
        lines.push(
          [
            '0',
            t('verifySiteWide'),
            '',
            '',
            t('approval_' + topic),
            t('verifyStatus_' + status(null, topic)),
            t('verifyOwner'),
            '',
          ]
            .map(csvCell)
            .join(','),
        );
    rows.forEach((r, i) => {
      const base = [String(i + 1), r.trip.title.en, r.trip.slug, r.trip.status];
      for (const m of r.health.missing)
        lines.push(
          [
            ...base,
            t('seoCheck_' + m),
            t('verifyStatus_missing'),
            businessFacts.includes(m) ? t('verifyOwner') : t('verifyStaff'),
            r.missingLangs.join(' '),
          ]
            .map(csvCell)
            .join(','),
        );
      for (const topic of tripTopics) {
        const st = status(r.trip.id, topic);
        if (st !== 'verified')
          lines.push(
            [
              ...base,
              t('verifyTopic_' + topic),
              t('verifyStatus_' + st),
              t('verifyOwner'),
              '',
            ]
              .map(csvCell)
              .join(','),
          );
      }
    });
    const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv' }),
      a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download =
      'stella-verification-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (seo.isError || answers.isError)
    return (
      <div className="page">
        <LoadError
          retry={() => {
            void seo.refetch();
            void answers.refetch();
          }}
        />
      </div>
    );
  if (!seo.data || !answers.data)
    return (
      <div className="page">
        <Skeleton rows={6} />
      </div>
    );
  const open = rows.reduce((n, r) => n + r.open, 0);
  return (
    <div className="page seo-page">
      <PageHeader
        title={t('verificationCenter')}
        description={t('verificationIntro')}
        secondary={
          <button type="button" className="btn" onClick={exportCsv}>
            {t('verifyExport')}
          </button>
        }
      />
      <section className="panel" aria-labelledby="verify-approvals-h">
        <div className="panel-head">
          <h2 id="verify-approvals-h">{t('verifyApprovals')}</h2>
        </div>
        <p className="muted">{t('verifyApprovalsBody')}</p>
        <ul className="verify-topics">
          {siteTopics.map((topic) => (
            <FactRow
              key={topic}
              tripId={null}
              topic={topic}
              label={t('approval_' + topic)}
              fact={facts.find((f) => f.tripId === null && f.topic === topic)}
              editable={mayRecord}
            />
          ))}
        </ul>
        {!mayRecord && <p className="muted">{t('verifyOwnerOnly')}</p>}
      </section>
      <section className="panel" aria-labelledby="verify-tours-h">
        <div className="panel-head">
          <h2 id="verify-tours-h">
            {t('verifyTours')} · {t('verifyOpenCount', { n: open })}
          </h2>
          <Segmented
            label={t('seoFilter')}
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'open', label: t('verifyOpen') },
              { value: 'all', label: t('seoAllTours') },
            ]}
          />
        </div>
        <label className="field verify-filter">
          <span className="field-label">{t('verifyFilterField')}</span>
          <select
            className="input"
            value={field}
            onChange={(e) => setField(e.target.value)}
          >
            <option value="">{t('verifyAnyField')}</option>
            <optgroup label={t('verifyGroupPage')}>
              {completenessChecks.map((c) => (
                <option key={c} value={'check:' + c}>
                  {t('seoCheck_' + c)}
                </option>
              ))}
              <option value="lang:">{t('verifyTranslations')}</option>
            </optgroup>
            <optgroup label={t('verifyGroupOwner')}>
              {tripTopics.map((topic) => (
                <option key={topic} value={'topic:' + topic}>
                  {t('verifyTopic_' + topic)}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <ol className="verify-list">
          {rows.map((r) => {
            const href =
              (r.trip.kind === 'package' ? '/packages/' : '/trips/') +
              r.trip.id;
            const isOpen = expanded === r.trip.id;
            return (
              <li key={r.trip.id} className="verify-item">
                <div className="verify-head">
                  <AppLink href={href} className="strong">
                    {r.trip.title[locale] || r.trip.title.en}
                  </AppLink>
                  <span className="muted">
                    {new Intl.NumberFormat(locale, { style: 'percent' }).format(
                      r.readiness,
                    )}{' '}
                    {t('verifyReady')}
                    {r.featured !== null && ' · ' + t('verifyFeatured')}
                    {' · '}
                    {t('verifyAnswerCounts', {
                      verified: r.counts.verified,
                      total: tripTopics.length,
                    })}
                  </span>
                </div>
                <dl className="verify-facts">
                  <dt>{t('verifyMissing')}</dt>
                  <dd>
                    {r.health.missing.length ? (
                      <ul>
                        {r.health.missing.map((m) => (
                          <li key={m}>
                            <AppLink href={href}>{t('seoCheck_' + m)}</AppLink>{' '}
                            <span className="muted">
                              (
                              {businessFacts.includes(m)
                                ? t('verifyOwner')
                                : t('verifyStaff')}
                              )
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      t('verifyNothingMissing')
                    )}
                  </dd>
                  <dt>{t('verifyHave')}</dt>
                  <dd>
                    {r.health.done.map((d) => t('seoCheck_' + d)).join(', ') ||
                      '—'}
                  </dd>
                  <dt>{t('verifyTranslations')}</dt>
                  <dd>
                    {r.missingLangs.length
                      ? t('verifyLangsMissing', {
                          langs: r.missingLangs.join(', ').toUpperCase(),
                        })
                      : t('verifyAllLangs')}
                  </dd>
                  <dt>{t('verifyPublication')}</dt>
                  <dd>
                    {r.trip.status !== 'published'
                      ? t('seoNotPublished')
                      : r.publishable
                        ? t('verifyLiveOk')
                        : t('verifyLiveIssues')}
                  </dd>
                </dl>
                <button
                  type="button"
                  className="btn"
                  aria-expanded={isOpen}
                  aria-controls={'verify-topics-' + r.trip.id}
                  onClick={() => setExpanded(isOpen ? null : r.trip.id)}
                >
                  {t(isOpen ? 'verifyHideAnswers' : 'verifyShowAnswers')}
                </button>
                {isOpen && (
                  <ul
                    className="verify-topics"
                    id={'verify-topics-' + r.trip.id}
                  >
                    {tripTopics.map((topic) => (
                      <FactRow
                        key={topic}
                        tripId={r.trip.id}
                        topic={topic}
                        label={t('verifyTopic_' + topic)}
                        fact={facts.find(
                          (f) => f.tripId === r.trip.id && f.topic === topic,
                        )}
                        editable={mayRecord}
                      />
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

/** One fact: status + internal note, saved together. */
function FactRow({
  tripId,
  topic,
  label,
  fact,
  editable,
}: {
  tripId: string | null;
  topic: string;
  label: string;
  fact: StoredFact | undefined;
  editable: boolean;
}) {
  const { t, save, report } = useAdmin(),
    client = useQueryClient(),
    current = fact?.status ?? 'missing',
    [value, setValue] = useState<FactStatus>(current),
    [note, setNote] = useState(fact?.note ?? ''),
    [busy, setBusy] = useState(false),
    base = 'fact-' + (tripId ?? 'site') + '-' + topic,
    dirty = value !== current || note !== (fact?.note ?? '');
  const store = async () => {
    setBusy(true);
    try {
      await save(
        '/v1/admin/verification',
        'PUT',
        { tripId, topic, status: value, note: note.trim() || null },
        { success: t('verifySaved'), undo: false },
      );
      await client.invalidateQueries({ queryKey: ['/v1/admin/verification'] });
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="verify-topic">
      <span className="strong" id={base + '-label'}>
        {label}
      </span>
      <span className={'badge-status ' + tone[current]}>
        <span className="dot" aria-hidden="true" />
        {t('verifyStatus_' + current)}
      </span>
      {editable ? (
        <div className="verify-topic-form">
          <label>
            <span className="sr-only">
              {label}: {t('verifyStatusLabel')}
            </span>
            <select
              className="input"
              value={value}
              onChange={(e) => setValue(e.target.value as FactStatus)}
            >
              {factStatuses.map((st) => (
                <option key={st} value={st}>
                  {t('verifyStatus_' + st)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">
              {label}: {t('verifyNote')}
            </span>
            <textarea
              className="input"
              rows={2}
              maxLength={2000}
              placeholder={t('verifyNotePlaceholder')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn"
            disabled={!dirty || busy}
            onClick={() => void store()}
          >
            {t('verifySave')}
          </button>
        </div>
      ) : (
        fact?.note && <p className="muted">{fact.note}</p>
      )}
    </li>
  );
}
