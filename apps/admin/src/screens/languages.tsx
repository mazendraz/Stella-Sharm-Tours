'use client';
import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { locales } from '@stella/shared';
import { useAdmin, useData } from '../lib/admin-context';
import { obj, type Row } from '../lib/content';
import { useEditor } from '../lib/editor';
import { languageName } from '../lib/format';
import { EditorLayout } from '../components/ui/editor';
import { FormField, Toggle } from '../components/ui/field';
import { Callout, LoadError } from '../components/ui/states';
import { AppLink } from '../components/ui/link';

type LangState = {
  extra: { auto: string[] };
  machine: { budget: string; freeOnly: boolean; indexable: boolean };
  glossary: { terms: string[] };
};

export function LanguageSettings() {
  const { t, tp, locale, write, request } = useAdmin(),
    query = useData<Row>('/v1/admin/i18n/settings'),
    glossary = useData<string[]>('/v1/admin/i18n/glossary'),
    [term, setTerm] = useState('');
  const queues = useQueries({
    queries: locales
      .filter((c) => c !== 'en')
      .map((code) => ({
        queryKey: ['/v1/admin/i18n/queue?locale=' + code],
        queryFn: () => request<Row[]>('/v1/admin/i18n/queue?locale=' + code),
        staleTime: 60000,
      })),
  });
  const data = obj(query.data?.i18n),
    runtime = obj(query.data?.i18n_runtime),
    providers = runtime.providers_available === true,
    coverage = obj(runtime.coverage);
  const supported = useMemo(
    () =>
      [
        ...new Set([
          ...(Array.isArray(runtime.supported)
            ? (runtime.supported as string[])
            : []),
          ...((data.auto as string[]) ?? []),
        ]),
      ].filter((code) => !(locales as readonly string[]).includes(code)),
    [runtime.supported, data.auto],
  );
  const initial = useMemo<LangState | null>(
    () =>
      query.data && glossary.data
        ? {
            extra: { auto: [...new Set((data.auto as string[]) ?? [])] },
            machine: {
              budget: String(data.monthly_char_budget ?? 1000000),
              freeOnly: data.free_tier_only !== false,
              indexable: data.indexable_auto !== false,
            },
            glossary: { terms: glossary.data },
          }
        : null,
    [query.dataUpdatedAt, glossary.dataUpdatedAt],
  );
  const labels = {
    extra: t('extraLanguages'),
    machine: t('machineTranslation'),
    glossary: t('glossary'),
  };
  const editor = useEditor<LangState>({
    id: 'languages',
    initial,
    sourceKey: String(query.dataUpdatedAt) + glossary.dataUpdatedAt,
    order: ['extra', 'machine', 'glossary'],
    labels,
    success: t('languagesSaved'),
    afterSave: () => Promise.all([query.refetch(), glossary.refetch()]),
    validate: {
      machine: (v) => (!(Number(v.budget) >= 0) ? t('budgetInvalid') : null),
    },
    saveAll: async (v, dirty) => {
      const ids: string[] = [];
      if (dirty.includes('extra') || dirty.includes('machine'))
        ids.push(
          ...(
            await write('/v1/admin/i18n/settings', 'PUT', {
              auto: v.extra.auto,
              auto_live_min_coverage: data.auto_live_min_coverage ?? 0.95,
              monthly_char_budget: Number(v.machine.budget),
              indexable_auto: v.machine.indexable,
              free_tier_only: v.machine.freeOnly,
            })
          ).revisions,
        );
      if (dirty.includes('glossary'))
        ids.push(
          ...(
            await write('/v1/admin/i18n/glossary', 'PUT', {
              terms: v.glossary.terms,
            })
          ).revisions,
        );
      return ids;
    },
  });
  if (query.isError)
    return (
      <div className="page">
        <LoadError retry={() => void query.refetch()} />
      </div>
    );
  const v = editor.values,
    usage = Number(obj(query.data?.usage).characters ?? 0),
    budget = Number(v?.machine.budget ?? 0);
  const pct = (value: unknown) => {
    const n = typeof value === 'number' ? value : Number(obj(value).coverage);
    return Number.isFinite(n)
      ? new Intl.NumberFormat(locale, { style: 'percent' }).format(n)
      : '—';
  };
  return (
    <EditorLayout
      back={{ href: '/translations', label: t('translations') }}
      title={t('languageSettings')}
      loading={!v}
      editor={editor as never}
      i18n={false}
      sections={
        v
          ? [
              {
                id: 'core',
                label: t('coreLanguages'),
                description: t('coreLanguagesHint'),
                content: (
                  <ul className="simple-list">
                    {locales.map((code, i) => {
                      const pending =
                        code === 'en' ? 0 : queues[i - 1]?.data?.length;
                      return (
                        <li key={code} className="simple-row static">
                          <span className="simple-main">
                            <span className="strong">
                              {languageName(code, locale)}
                            </span>
                            <span className="muted">
                              {code === 'en'
                                ? t('sourceLanguage')
                                : pending === undefined
                                  ? t('loading')
                                  : pending
                                    ? tp('toReview', pending)
                                    : t('allReviewed')}
                            </span>
                          </span>
                          {code !== 'en' && pending ? (
                            <AppLink href="/translations" className="text-link">
                              {t('review')}
                            </AppLink>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ),
              },
              {
                id: 'extra',
                label: labels.extra,
                description: t('extraLanguagesHint'),
                content: !supported.length ? (
                  <p className="muted">{t('noExtraAvailable')}</p>
                ) : (
                  <ul className="toggle-list">
                    {supported
                      .sort((a, b) =>
                        languageName(a, locale).localeCompare(
                          languageName(b, locale),
                          locale,
                        ),
                      )
                      .map((code) => (
                        <li key={code}>
                          <Toggle
                            checked={v.extra.auto.includes(code)}
                            onChange={(on) =>
                              editor.set('extra', {
                                auto: on
                                  ? [...v.extra.auto, code]
                                  : v.extra.auto.filter((c) => c !== code),
                              })
                            }
                            label={languageName(code, locale)}
                            hint={
                              coverage[code] !== undefined
                                ? t('coverageIs', { pct: pct(coverage[code]) })
                                : undefined
                            }
                          />
                        </li>
                      ))}
                  </ul>
                ),
              },
              {
                id: 'machine',
                label: labels.machine,
                content: !providers ? (
                  <Callout tone="info">{t('mtNotSetUp')}</Callout>
                ) : (
                  <>
                    <FormField label={t('budget')} hint={t('budgetHint')}>
                      {(p) => (
                        <input
                          {...p}
                          type="number"
                          min={0}
                          step={10000}
                          value={v.machine.budget}
                          onChange={(e) =>
                            editor.set('machine', {
                              ...v.machine,
                              budget: e.target.value,
                            })
                          }
                        />
                      )}
                    </FormField>
                    <div className="usage">
                      <p>
                        {t('usageThisMonth', {
                          used: new Intl.NumberFormat(locale).format(usage),
                          budget: new Intl.NumberFormat(locale).format(budget),
                        })}
                      </p>
                      <progress
                        value={Math.min(usage, budget || 1)}
                        max={budget || 1}
                        aria-label={t('usageThisMonthShort')}
                      />
                    </div>
                    <Toggle
                      checked={v.machine.freeOnly}
                      onChange={(freeOnly) =>
                        editor.set('machine', { ...v.machine, freeOnly })
                      }
                      label={t('freeOnly')}
                      hint={t('freeOnlyHint')}
                    />
                    <Toggle
                      checked={v.machine.indexable}
                      onChange={(indexable) =>
                        editor.set('machine', { ...v.machine, indexable })
                      }
                      label={t('indexable')}
                      hint={t('indexableHint')}
                    />
                  </>
                ),
              },
              {
                id: 'glossary',
                label: labels.glossary,
                description: t('glossaryHint'),
                content: (
                  <>
                    <ul className="chip-list">
                      {v.glossary.terms.map((item) => (
                        <li key={item} className="chip removable">
                          {item}
                          <button
                            type="button"
                            className="chip-x"
                            aria-label={t('removeNamed', { name: item })}
                            onClick={() =>
                              editor.set('glossary', {
                                terms: v.glossary.terms.filter(
                                  (x) => x !== item,
                                ),
                              })
                            }
                          >
                            <X size={14} aria-hidden />
                          </button>
                        </li>
                      ))}
                    </ul>
                    <form
                      className="inline-add"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const value = term.trim();
                        if (value && !v.glossary.terms.includes(value))
                          editor.set('glossary', {
                            terms: [...v.glossary.terms, value],
                          });
                        setTerm('');
                      }}
                    >
                      <FormField label={t('addTerm')}>
                        {(p) => (
                          <input
                            {...p}
                            value={term}
                            maxLength={120}
                            onChange={(e) => setTerm(e.target.value)}
                          />
                        )}
                      </FormField>
                      <button className="btn" type="submit">
                        <Plus size={18} aria-hidden />
                        {t('add')}
                      </button>
                    </form>
                  </>
                ),
              },
            ]
          : []
      }
    />
  );
}
