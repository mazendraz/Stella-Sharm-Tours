'use client';
import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { can } from '@stella/shared/admin';
import { locales, type Locale } from '@stella/shared';
import { useAdmin, useData } from '../lib/admin-context';
import { obj, rows, content, type Row } from '../lib/content';
import { EditorForm, type Field } from './forms';
import { local, select, HistoryPanel } from './trips';
import {
  Loading,
  Failure,
  Empty,
  Sheet,
  Pill,
  Time,
  ConfirmButton,
  Money,
} from './ui';
export function Homepage() {
  const { t, save, me, locale } = useAdmin(),
    query = useData<Row>('/v1/admin/homepage'),
    tripChoices = useData<Row[]>('/v1/admin/trips');
  if (query.isPending) return <Loading />;
  if (!query.data) return <Failure retry={() => void query.refetch()} />;
  const current = obj(query.data.draft ?? query.data),
    home = obj(current.home),
    fields: Field[] = [
      ...[
        'private_heading',
        'private_text',
        'build_heading',
        'build_text',
        'contact_heading',
        'contact_text',
      ].map((key) => ({
        ...local(key, true),
        label: key.startsWith('private')
          ? 'private'
          : key.startsWith('build')
            ? 'my_trip'
            : 'contact',
      })),
      {
        key: 'how_steps',
        label: 'itinerary',
        kind: 'rows',
        fields: [local('title', true), local('text', true)],
      },
      {
        key: 'private_perks',
        label: 'private',
        kind: 'rows',
        fields: [
          local('title', true),
          { ...local('sub', true), label: 'subline' },
        ],
      },
      {
        key: 'private_trip_slugs',
        label: 'private',
        kind: 'rows',
        fields: [
          {
            key: 'slug',
            label: 'trips',
            kind: 'select',
            options: (tripChoices.data ?? [])
              .filter((row) => row.kind === 'trip')
              .map((row) => ({
                value: String(row.slug),
                label: content(row.title, locale),
                literal: true,
              })),
          },
        ],
      },
      {
        key: 'featured_trip_slugs',
        label: 'trips',
        kind: 'rows',
        fields: [
          {
            key: 'slug',
            label: 'trips',
            kind: 'select',
            options: (tripChoices.data ?? [])
              .filter((row) => row.kind === 'trip')
              .map((row) => ({
                value: String(row.slug),
                label: content(row.title, locale),
                literal: true,
              })),
          },
        ],
      },
      ...(can(me!.role, 'publish')
        ? [{ key: 'publish', kind: 'check', label: 'publish' } as Field]
        : []),
    ];
  const value = {
    ...home,
    how_steps: current.how_steps,
    private_perks: current.private_perks,
    private_trip_slugs: ((home.private_trip_slugs as string[]) ?? []).map(
      (slug) => ({ slug }),
    ),
    featured_trip_slugs: ((home.featured_trip_slugs as string[]) ?? []).map(
      (slug) => ({ slug }),
    ),
  };
  return (
    <>
      <p className="muted">{t('review')}</p>
      <EditorForm
        key={JSON.stringify(value)}
        fields={fields}
        value={value}
        onSave={(data) => {
          const { how_steps, private_perks, publish, ...homeData } = data;
          return save('/v1/admin/homepage', 'PUT', {
            home: {
              ...home,
              ...homeData,
              private_trip_slugs: rows(data.private_trip_slugs).map(
                (row) => row.slug,
              ),
              featured_trip_slugs: rows(data.featured_trip_slugs).map(
                (row) => row.slug,
              ),
            },
            how_steps,
            private_perks,
            publish: publish === true,
          });
        }}
      />
    </>
  );
}
export function ContentPages() {
  const { t, locale, save, me } = useAdmin(),
    [key, setKey] = useState('faq'),
    [selected, setSelected] = useState<Row | null>(null),
    [add, setAdd] = useState(false),
    query = useData<Row[]>('/v1/admin/faqs');
  return (
    <>
      <div className="segmented">
        {['faq', 'contact', 'terms', 'privacy', 'cancellation'].map((value) => (
          <button
            key={value}
            aria-pressed={value === key}
            onClick={() => setKey(value)}
          >
            {t(value === 'faq' ? 'pages' : value)}
          </button>
        ))}
      </div>
      {key !== 'faq' ? (
        <PageEditor key={key} pageKey={key} />
      ) : (
        <>
          <button onClick={() => setAdd(true)}>{t('add')}</button>
          {query.isPending ? (
            <Loading />
          ) : query.isError ? (
            <Failure retry={() => void query.refetch()} />
          ) : !query.data?.length ? (
            <Empty />
          ) : (
            <div className="cards">
              {query.data.map((row) => (
                <div className="card" key={row.id}>
                  <button
                    className="link-button"
                    onClick={() => setSelected(row)}
                  >
                    {content(row.q, locale)}
                  </button>
                  <Pill value={String(row.status)} />
                  {can(me!.role, 'publish') && (
                    <ConfirmButton
                      onConfirm={() =>
                        save('/v1/admin/faqs/' + row.id, 'DELETE', {})
                      }
                    >
                      {t('unpublish')}
                    </ConfirmButton>
                  )}
                </div>
              ))}
            </div>
          )}
          {(selected || add) && (
            <Sheet
              title={t('pages')}
              onClose={() => {
                setSelected(null);
                setAdd(false);
              }}
            >
              <EditorForm
                fields={[
                  local('q', true),
                  local('a', true),
                  { key: 'sort', kind: 'number', min: 0, max: 1000 },
                  ...(can(me!.role, 'publish')
                    ? [{ key: 'publish', kind: 'check' } as Field]
                    : []),
                ]}
                value={
                  selected
                    ? { ...selected, publish: selected.status === 'published' }
                    : { q: { en: '' }, a: { en: '' }, sort: 0, publish: false }
                }
                onSave={async (data) => {
                  await save(
                    '/v1/admin/faqs' + (selected ? '/' + selected.id : ''),
                    selected ? 'PATCH' : 'POST',
                    data,
                  );
                  setSelected(null);
                  setAdd(false);
                }}
              />
              {selected && <HistoryPanel entity="faq" id={selected.id} />}
            </Sheet>
          )}
        </>
      )}
    </>
  );
}
function PageEditor({ pageKey }: { pageKey: string }) {
  const { t, request, save, me } = useAdmin(),
    query = useData<Row[]>(`/v1/admin/pages/${pageKey}/blocks`),
    [translations, setTranslations] = useState<Record<string, Row[]>>({});
  useEffect(() => {
    if (!query.data) return;
    let active = true;
    void Promise.all(
      query.data.map(
        async (row) =>
          [
            row.id,
            await request<Row[]>(
              `/v1/admin/i18n/values?entity=page_block&id=${row.id}`,
            ),
          ] as const,
      ),
    ).then((values) => {
      if (active) setTranslations(Object.fromEntries(values));
    });
    return () => {
      active = false;
    };
  }, [query.data, request]);
  if (query.isPending) return <Loading />;
  if (!query.data) return <Failure retry={() => void query.refetch()} />;
  const draft = query.data.filter((row) => row.status === 'draft'),
    blocks = draft.length ? draft : query.data,
    flatten = blocks.map((row) => ({
      id: row.id,
      type: row.type,
      ...obj(row.data),
    }));
  return (
    <>
      <p className="muted">{t('review')}</p>
      <EditorForm
        key={JSON.stringify(flatten) + JSON.stringify(translations)}
        translations={Object.values(translations).flat()}
        value={{ blocks: flatten, publish: false }}
        fields={[
          {
            key: 'blocks',
            label: 'pages',
            kind: 'rows',
            fields: [
              {
                ...select('type', ['rich_text']),
                options: [{ value: 'rich_text', label: 'text' }],
              },
              local('title'),
              local('heading'),
              local('text', true),
            ],
            initial: { type: 'rich_text' },
          },
          ...(can(me!.role, 'publish')
            ? [{ key: 'publish', kind: 'check' } as Field]
            : []),
        ]}
        onSave={(data) =>
          save('/v1/admin/pages/' + pageKey + '/blocks', 'PUT', {
            publish: data.publish === true,
            blocks: rows(data.blocks).map((row, sort) => ({
              ...(row.id ? { id: row.id } : {}),
              type: row.type,
              sort,
              data: Object.fromEntries(
                ['title', 'heading', 'text']
                  .filter((key) => row[key] !== null && row[key] !== undefined)
                  .map((key) => [key, row[key]]),
              ),
            })),
          })
        }
      />
    </>
  );
}
export function TranslationQueue() {
  const { t, save } = useAdmin(),
    [language, setLanguage] = useState<Locale>('fr'),
    [entity, setEntity] = useState(''),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<Row | null>(null),
    query = useData<Row[]>(
      `/v1/admin/i18n/queue?locale=${language}${entity ? '&entity=' + entity : ''}`,
    );
  return (
    <>
      <div className="toolbar">
        <label>
          {t('language')}
          <select
            value={language}
            onChange={(event) => {
              setLanguage(event.target.value as Locale);
              setPage(1);
            }}
          >
            {locales
              .filter((locale) => locale !== 'en')
              .map((locale) => (
                <option key={locale}>{locale}</option>
              ))}
          </select>
        </label>
        <label>
          {t('type')}
          <select
            value={entity}
            onChange={(event) => {
              setEntity(event.target.value);
              setPage(1);
            }}
          >
            <option value="">{t('all')}</option>
            {[
              'trip',
              'collection',
              'hero_slide',
              'faq',
              'media',
              'settings',
              'ui',
              'page_block',
              'trip_item',
              'trip_price',
              'itinerary',
            ].map((value) => (
              <option key={value} value={value}>
                {t(
                  (
                    {
                      trip: 'trips',
                      collection: 'collections',
                      hero_slide: 'hero',
                      faq: 'pages',
                      ui: 'text',
                      page_block: 'pages',
                      trip_item: 'items',
                      trip_price: 'prices',
                      itinerary: 'itinerary',
                    } as Record<string, string>
                  )[value] ?? value,
                )}
              </option>
            ))}
          </select>
        </label>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Failure retry={() => void query.refetch()} />
      ) : !query.data?.length ? (
        <Empty />
      ) : (
        <div className="cards">
          {query.data.slice((page - 1) * 50, page * 50).map((row, index) => (
            <button
              className="card card-button"
              key={index}
              onClick={() => setSelected(row)}
            >
              <p lang="en">{String(row.source)}</p>
              <p lang={language}>{String(row.value)}</p>
              <Pill
                value={String(row.state === 'empty' ? 'missing' : row.state)}
              />
            </button>
          ))}
        </div>
      )}
      {selected && (
        <Sheet
          title={t('value')}
          onClose={() => setSelected(null)}
          description={String(selected.source)}
        >
          <EditorForm
            fields={[
              {
                key: 'text',
                label: 'value',
                kind: 'area',
                required: true,
                max: 20000,
              },
            ]}
            value={{ text: selected.value }}
            onSave={async (data) => {
              await save('/v1/admin/i18n/review', 'POST', {
                entity: selected.entity,
                id: selected.id,
                field: selected.field,
                locale: language,
                source: selected.source,
                text: data.text,
              });
              setSelected(null);
            }}
          />
        </Sheet>
      )}
      <div className="actions">
        <button
          className="secondary"
          disabled={page === 1}
          onClick={() => setPage((value) => value - 1)}
        >
          {t('previous')}
        </button>
        <span>
          {page} / {Math.max(1, Math.ceil((query.data?.length ?? 0) / 50))}
        </span>
        <button
          className="secondary"
          disabled={page * 50 >= (query.data?.length ?? 0)}
          onClick={() => setPage((value) => value + 1)}
        >
          {t('next')}
        </button>
      </div>
    </>
  );
}
export function LanguageSettings() {
  const { t, save, locale } = useAdmin(),
    query = useData<Row>('/v1/admin/i18n/settings'),
    glossary = useData<string[]>('/v1/admin/i18n/glossary');
  if (query.isPending) return <Loading />;
  if (!query.data) return <Failure retry={() => void query.refetch()} />;
  const data = obj(query.data.i18n),
    runtime = obj(query.data.i18n_runtime);
  return (
    <>
      <p>{locales.map((value) => value.toUpperCase()).join(' · ')}</p>
      {!runtime.providers_available && (
        <p className="warning">{t('providerOff')}</p>
      )}
      <EditorForm
        value={{
          auto: ((data.auto as string[]) ?? []).map((locale) => ({ locale })),
          monthly_char_budget: data.monthly_char_budget ?? 1000000,
          indexable_auto: data.indexable_auto ?? true,
          free_tier_only: data.free_tier_only ?? true,
        }}
        fields={[
          {
            key: 'auto',
            label: 'enabledAuto',
            kind: 'rows',
            fields: [
              {
                key: 'locale',
                label: 'language',
                kind: 'select',
                options: Array.from(
                  new Set([
                    ...(Array.isArray(runtime.supported)
                      ? (runtime.supported as string[])
                      : []),
                    ...((data.auto as string[]) ?? []),
                  ]),
                )
                  .filter((code) => !locales.includes(code as Locale))
                  .map((code) => ({
                    value: code,
                    label:
                      new Intl.DisplayNames([locale], { type: 'language' }).of(
                        code,
                      ) ?? code,
                    literal: true,
                  })),
              },
            ],
          },
          {
            key: 'monthly_char_budget',
            label: 'budget',
            kind: 'number',
            min: 0,
            max: 10000000,
          },
          { key: 'indexable_auto', label: 'indexable', kind: 'check' },
          { key: 'free_tier_only', label: 'freeOnly', kind: 'check' },
        ]}
        onSave={(value) =>
          save('/v1/admin/i18n/settings', 'PUT', {
            auto: rows(value.auto).map((row) => row.locale),
            auto_live_min_coverage: data.auto_live_min_coverage ?? 0.95,
            monthly_char_budget: value.monthly_char_budget,
            indexable_auto: value.indexable_auto,
            free_tier_only: value.free_tier_only,
          })
        }
      />
      <h2>{t('coverage')}</h2>
      <p>
        {t('budget')}:{' '}
        {new Intl.NumberFormat(locale).format(
          Number(obj(query.data.usage).characters ?? 0),
        )}{' '}
        /{' '}
        {new Intl.NumberFormat(locale).format(
          Number(data.monthly_char_budget ?? 0),
        )}
      </p>
      {typeof runtime.updated_at === 'string' && (
        <p>
          <Time value={runtime.updated_at} />
        </p>
      )}
      {runtime.providers_available === true &&
        ((data.auto as string[]) ?? []).map((code) => (
          <ConfirmButton
            key={code}
            onConfirm={() =>
              save('/v1/admin/i18n/backfill/' + code, 'POST', {})
            }
          >
            {t('refresh')} ·{' '}
            {new Intl.DisplayNames([locale], { type: 'language' }).of(code) ??
              code}
          </ConfirmButton>
        ))}
      {Object.entries(obj(runtime.coverage)).map(([locale, value]) => (
        <p key={locale}>
          {locale.toUpperCase()}:{' '}
          {typeof value === 'number'
            ? new Intl.NumberFormat(locale, { style: 'percent' }).format(value)
            : String(obj(value).coverage ?? '—')}
        </p>
      ))}
      {glossary.data && (
        <EditorForm
          value={{ terms: glossary.data.join('\n') }}
          fields={[{ key: 'terms', label: 'glossary', kind: 'area' }]}
          onSave={(value) =>
            save('/v1/admin/i18n/glossary', 'PUT', {
              terms: String(value.terms)
                .split('\n')
                .map((value) => value.trim())
                .filter(Boolean),
            })
          }
        />
      )}
    </>
  );
}
export function SettingsScreen() {
  const { save, t } = useAdmin(),
    query = useData<Row>('/v1/admin/settings');
  if (query.isPending) return <Loading />;
  if (!query.data) return <Failure retry={() => void query.refetch()} />;
  const value = query.data,
    contacts = obj(value.contacts),
    rules = obj(value.request_rules);
  return (
    <>
      <details open>
        <summary>{t('contact')}</summary>
        <div>
          <EditorForm
            value={{ ...contacts }}
            fields={[
              { key: 'whatsapp_primary', label: 'whatsapp', required: true },
              { key: 'whatsapp_secondary', label: 'whatsapp', nullable: true },
              { key: 'phone', nullable: true },
              { key: 'email', nullable: true },
            ]}
            onSave={(data) =>
              save('/v1/admin/settings', 'PUT', { contacts: data })
            }
          />
        </div>
      </details>
      <details>
        <summary>{t('address')}</summary>
        <div>
          <EditorForm
            value={value}
            fields={[
              local('address', true),
              local('hours'),
              local('legal_entity', true),
            ]}
            onSave={(data) => save('/v1/admin/settings', 'PUT', data)}
          />
        </div>
      </details>
      <details>
        <summary>{t('requests')}</summary>
        <div>
          <EditorForm
            value={{
              ...rules,
              pickup_areas: ((value.pickup_areas as string[]) ?? []).join('\n'),
            }}
            fields={[
              { key: 'min_days_ahead', kind: 'number', min: 0, max: 30 },
              { key: 'max_adults', kind: 'number', min: 1, max: 60 },
              { key: 'max_children', kind: 'number', min: 0, max: 40 },
              { key: 'pickup_areas', kind: 'area' },
            ]}
            onSave={(data) =>
              save('/v1/admin/settings', 'PUT', {
                request_rules: {
                  min_days_ahead: data.min_days_ahead,
                  max_adults: data.max_adults,
                  max_children: data.max_children,
                },
                pickup_areas: String(data.pickup_areas)
                  .split('\n')
                  .map((value) => value.trim())
                  .filter(Boolean),
              })
            }
          />
        </div>
      </details>
      <details>
        <summary>{t('social')}</summary>
        <div>
          <EditorForm
            value={{ social: value.social ?? [] }}
            fields={[
              {
                key: 'social',
                kind: 'rows',
                fields: [
                  { key: 'label', required: true },
                  { key: 'url', required: true },
                ],
              },
            ]}
            onSave={(data) => save('/v1/admin/settings', 'PUT', data)}
          />
        </div>
      </details>
    </>
  );
}
export function UsersScreen() {
  const { t, save, locale } = useAdmin(),
    query = useData<Row[]>('/v1/admin/users'),
    [invite, setInvite] = useState(false),
    [selected, setSelected] = useState<Row | null>(null);
  return (
    <>
      <button onClick={() => setInvite(true)}>{t('invite')}</button>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Failure retry={() => void query.refetch()} />
      ) : (
        <div className="cards">
          {query.data?.map((row) => (
            <button
              className="card card-button"
              key={row.id}
              onClick={() => setSelected(row)}
            >
              <strong>{String(row.name)}</strong>
              <p>{String(row.email)}</p>
              <Pill value={String(row.role)} />
              <Pill value={row.disabledAt ? 'disabled' : 'enabled'} />
              <p>
                {t('mfa')}: {t(row.totpEnabled ? 'enabled' : 'disabled')}
              </p>
            </button>
          ))}
        </div>
      )}
      {(invite || selected) && (
        <Sheet
          title={t('users')}
          onClose={() => {
            setInvite(false);
            setSelected(null);
          }}
        >
          <EditorForm
            fields={[
              { key: 'name', required: true },
              ...(invite ? [{ key: 'email', required: true } as Field] : []),
              select('role', ['owner', 'manager', 'editor', 'sales']),
              { key: 'mfaRequired', label: 'mfa', kind: 'check' },
              ...(!invite ? [{ key: 'disabled', kind: 'check' } as Field] : []),
            ]}
            value={
              selected
                ? { ...selected, disabled: !!selected.disabledAt }
                : { name: '', email: '', role: 'sales' }
            }
            onSave={async (data) => {
              await save(
                '/v1/admin/users' + (selected ? '/' + selected.id : ''),
                selected ? 'PATCH' : 'POST',
                data,
              );
              setInvite(false);
              setSelected(null);
            }}
          />
          {selected && <UserSessions id={selected.id} />}
          <small>{content(null, locale)}</small>
        </Sheet>
      )}
    </>
  );
}
function UserSessions({ id }: { id: string }) {
  const { t, request } = useAdmin(),
    query = useData<Row[]>('/v1/admin/users/' + id + '/sessions');
  return (
    <>
      <h3>{t('sessions')}</h3>
      {query.isError ? (
        <Failure retry={() => void query.refetch()} />
      ) : query.isPending ? (
        <Loading />
      ) : (
        query.data?.map((row) => (
          <p key={row.id}>
            <Time value={String(row.last_seen_at ?? row.lastSeenAt)} />
          </p>
        ))
      )}
      <ConfirmButton
        onConfirm={async () => {
          await request('/v1/admin/users/' + id + '/sessions', 'DELETE', {});
          await query.refetch();
        }}
      >
        {t('logoutAll')}
      </ConfirmButton>
    </>
  );
}
export function Activity() {
  const { t, locale } = useAdmin(),
    [entity, setEntity] = useState(''),
    [user, setUser] = useState(''),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    actors = useData<Row[]>('/v1/admin/audit-actors'),
    [page, setPage] = useState(1),
    query = useData<Row[]>(
      `/v1/admin/audit?page=${page}${entity ? '&entity=' + entity : ''}${user ? '&user=' + user : ''}${from ? '&from=' + from : ''}${to ? '&to=' + to : ''}`,
    );
  return (
    <>
      <div className="field-grid">
        <label>
          {t('who')}
          <select
            value={user}
            onChange={(event) => {
              setUser(event.target.value);
              setPage(1);
            }}
          >
            <option value="">{t('all')}</option>
            {actors.data?.map((row) => (
              <option key={row.id} value={row.id}>
                {String(row.name)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('validFrom')}
          <input
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          {t('validTo')}
          <input
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>
      <label>
        {t('entity')}
        <select
          value={entity}
          onChange={(event) => {
            setEntity(event.target.value);
            setPage(1);
          }}
        >
          <option value="">{t('all')}</option>
          {[
            'trip',
            'trip_prices',
            'collection',
            'hero_slide',
            'media',
            'request',
            'settings',
            'user',
            'translation',
          ].map((value) => (
            <option key={value} value={value}>
              {t(
                (
                  {
                    trip: 'trips',
                    trip_prices: 'prices',
                    collection: 'collections',
                    hero_slide: 'hero',
                    request: 'requests',
                    user: 'users',
                    translation: 'value',
                  } as Record<string, string>
                )[value] ?? value,
              )}
            </option>
          ))}
        </select>
      </label>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Failure retry={() => void query.refetch()} />
      ) : !query.data?.length ? (
        <Empty />
      ) : (
        <div className="cards">
          {query.data.map((row) => (
            <article className="card" key={row.id}>
              <Time value={String(row.at)} />
              <p>
                {t(
                  (
                    {
                      trip: 'trips',
                      trip_prices: 'prices',
                      collection: 'collections',
                      hero_slide: 'hero',
                      request: 'requests',
                      user: 'users',
                      translation: 'value',
                    } as Record<string, string>
                  )[String(row.entity)] ??
                    (
                      {
                        trip_order: 'trips',
                        trip_itinerary: 'itinerary',
                        trip_items: 'items',
                        trip_media: 'media',
                        collection_order: 'collections',
                        hero_order: 'hero',
                        page_blocks: 'pages',
                        translation_draft: 'value',
                        auth: 'account',
                        privacy: 'privacy',
                      } as Record<string, string>
                    )[String(row.entity)] ??
                    'entity',
                )}
              </p>
              <small>{content(row.entityTitle, locale) || t('entity')}</small>
              <p>
                {String(row.userName ?? t('none'))} ·{' '}
                {t(
                  (
                    {
                      update: 'saved',
                      create: 'add',
                      prices: 'prices',
                      bulk_prices: 'bulk',
                      reorder: 'reorder',
                      publish: 'publish',
                      unpublish: 'unpublish',
                      invite: 'invite',
                      archive: 'archive',
                      restore: 'restore',
                      translation_review: 'value',
                      translation_draft: 'draft',
                      password_change: 'newPassword',
                      logout_all: 'logoutAll',
                    } as Record<string, string>
                  )[String(row.action)] ?? 'action',
                )}
              </p>
              {row.entity === 'trip_prices' &&
                rows(row.before).find((price) => price.isPrimary) && (
                  <p>
                    {t('before')}:{' '}
                    <Money
                      amount={
                        rows(row.before).find((price) => price.isPrimary)!
                          .amountEur as string | null
                      }
                    />{' '}
                    → {t('after')}:{' '}
                    <Money
                      amount={
                        (rows(row.after).find((price) => price.isPrimary)
                          ?.amountEur ??
                          rows(row.after).find(
                            (price) =>
                              price.id ===
                              rows(row.before).find(
                                (before) => before.isPrimary,
                              )?.id,
                          )?.after) as string | null
                      }
                    />
                  </p>
                )}
              {[
                'trip',
                'trip_prices',
                'trip_itinerary',
                'trip_items',
                'trip_media',
                'collection',
                'hero_slide',
                'media',
                'request',
                'settings',
                'page_blocks',
                'faq',
                'package',
                'trip_order',
                'collection_order',
                'hero_order',
                'translation',
                'translation_draft',
              ].includes(String(row.entity)) &&
                typeof row.entityId === 'string' && (
                  <HistoryPanel entity={String(row.entity)} id={row.entityId} />
                )}
            </article>
          ))}
        </div>
      )}
      <div className="actions">
        <button
          className="secondary"
          disabled={page === 1}
          onClick={() => setPage((value) => value - 1)}
        >
          {t('previous')}
        </button>
        <button
          className="secondary"
          disabled={(query.data?.length ?? 0) < 50}
          onClick={() => setPage((value) => value + 1)}
        >
          {t('next')}
        </button>
      </div>
    </>
  );
}
export function Account() {
  const { t, me, request, refresh, clear, report } = useAdmin(),
    sessions = useData<Row[]>('/v1/admin/me/sessions'),
    [uri, setUri] = useState(''),
    [codes, setCodes] = useState<string[]>([]);
  return (
    <>
      <section className="card">
        <h2>{me!.name}</h2>
        <p>
          {me!.email} · {t(me!.role)}
        </p>
        <div className="actions">
          <button
            className="secondary"
            onClick={async () => {
              try {
                await request('/v1/admin/auth/logout', 'POST', {});
                clear();
              } catch (error) {
                report(error);
              }
            }}
          >
            {t('logout')}
          </button>
          <ConfirmButton
            onConfirm={async () => {
              await request('/v1/admin/auth/logout-all', 'POST', {});
              clear();
            }}
          >
            {t('logoutAll')}
          </ConfirmButton>
        </div>
      </section>
      <details>
        <summary>{t('newPassword')}</summary>
        <div>
          <EditorForm
            value={{ password: '' }}
            fields={[{ key: 'password', label: 'newPassword', required: true }]}
            onSave={async (data) => {
              await request('/v1/admin/auth/password/change', 'POST', data);
              clear();
            }}
          />
        </div>
      </details>
      <details>
        <summary>{t('mfa')}</summary>
        <div>
          <Pill value={me!.totp_enabled ? 'enabled' : 'disabled'} />
          {!me!.totp_enabled && (
            <button
              onClick={async () => {
                try {
                  const result = await request<{ uri: string }>(
                    '/v1/admin/auth/2fa/setup',
                    'POST',
                    {},
                  );
                  setUri(result.uri);
                } catch (error) {
                  report(error);
                }
              }}
            >
              {t('setup')}
            </button>
          )}
          {uri && (
            <>
              <p>{t('scan')}</p>
              <QRCodeSVG value={uri} size={200} aria-label={t('mfa')} />
              <EditorForm
                value={{ code: '' }}
                fields={[{ key: 'code', required: true }]}
                onSave={async (data) => {
                  const result = await request<{ recovery_codes: string[] }>(
                    '/v1/admin/auth/2fa/enable',
                    'POST',
                    data,
                  );
                  setUri('');
                  setCodes(result.recovery_codes);
                  await refresh();
                }}
              />
            </>
          )}
          {codes.length > 0 && (
            <>
              <p>{t('recovery')}</p>
              <ul className="recovery-codes">
                {codes.map((code) => (
                  <li key={code}>
                    <code>{code}</code>
                  </li>
                ))}
              </ul>
              <button onClick={() => setCodes([])}>{t('savedCodes')}</button>
            </>
          )}
        </div>
      </details>
      <h2>{t('sessions')}</h2>
      {sessions.isPending ? (
        <Loading />
      ) : sessions.isError ? (
        <Failure retry={() => void sessions.refetch()} />
      ) : (
        sessions.data?.map((row) => (
          <article className="card" key={row.id}>
            <Time value={String(row.last_seen_at)} />
            <ConfirmButton
              onConfirm={async () => {
                await request('/v1/admin/me/sessions/' + row.id, 'DELETE', {});
                await sessions.refetch();
                await refresh();
              }}
            >
              {t('logout')}
            </ConfirmButton>
          </article>
        ))
      )}
      {can(me!.role, 'requests') && <PushSettings />}
    </>
  );
}
function PushSettings() {
  const { t, request, report, locale } = useAdmin(),
    query = useData<{ publicKey: string | null }>('/v1/admin/push/key'),
    [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!query.data?.publicKey || !('serviceWorker' in navigator)) return;
    let active = true;
    void navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (active) setEnabled(Boolean(subscription));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [query.data?.publicKey]);
  return (
    <section className="card">
      <h2>{t('notify')}</h2>
      {!query.data?.publicKey ? (
        <p>{t('notConfigured')}</p>
      ) : (
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              if (enabled) {
                const registration = await navigator.serviceWorker.ready,
                  subscription =
                    await registration.pushManager.getSubscription();
                if (subscription) {
                  await request('/v1/admin/push/subscriptions', 'DELETE', {
                    endpoint: subscription.endpoint,
                  });
                  await subscription.unsubscribe();
                }
                setEnabled(false);
                return;
              }
              if (
                !('serviceWorker' in navigator) ||
                !('PushManager' in window) ||
                (await Notification.requestPermission()) !== 'granted'
              )
                return;
              const registration = await navigator.serviceWorker.ready,
                key = Uint8Array.from(
                  atob(
                    query
                      .data!.publicKey!.replace(/-/g, '+')
                      .replace(/_/g, '/'),
                  ),
                  (value) => value.charCodeAt(0),
                );
              const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: key,
              });
              await request('/v1/admin/push/subscriptions', 'POST', {
                ...subscription.toJSON(),
                locale,
              });
              setEnabled(true);
            } catch (error) {
              report(error);
            } finally {
              setBusy(false);
            }
          }}
        >
          {t(enabled ? 'disable' : 'enable')}
        </button>
      )}
    </section>
  );
}
