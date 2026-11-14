'use client';
import { useDeferredValue, useState } from 'react';
import { usePathname } from 'next/navigation';
import { z } from 'zod';
import {
  can,
  basicsSchema,
  scheduleSchema,
  seoSchema,
  createTripSchema,
  pricesSchema,
  itinerarySchema,
  itemsSchema,
  collectionEditSchema,
} from '@stella/shared/admin';
import { useAdmin, useData, ApiError } from '../lib/admin-context';
import { content, obj, rows, type Row } from '../lib/content';
import { EditorForm, type Field } from './forms';
import { OrderList } from './order-list';
import { Media } from './media';
import { useMediaOptions } from '../lib/media-options';
import {
  Loading,
  Failure,
  Empty,
  Sheet,
  Search,
  Pill,
  Money,
  Time,
  ConfirmButton,
} from './ui';
const options = (values: string[]) =>
  values.map((value) => ({ value, label: value }));
export const local = (key: string, required = false): Field => ({
  key,
  kind: 'local',
  required,
  nullable: !required,
});
export const select = (
  key: string,
  values: string[],
  nullable = false,
): Field => ({ key, kind: 'select', options: options(values), nullable });
const number = (key: string, min = 0, max = 99999999): Field => ({
  key,
  kind: 'number',
  min,
  max,
  nullable: true,
});
export function HistoryPanel({ entity, id }: { entity: string; id: string }) {
  const { t, save, report } = useAdmin(),
    [open, setOpen] = useState(false),
    query = useData<Row[]>(`/v1/admin/history?entity=${entity}&id=${id}`, open);
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>{t('history')}</summary>
      {open && (
        <div>
          {query.isPending ? (
            <Loading />
          ) : query.isError ? (
            <Failure retry={() => void query.refetch()} />
          ) : !query.data?.length ? (
            <Empty />
          ) : (
            query.data.map((row) => (
              <div className="card" key={row.id}>
                <Time value={String(row.createdAt)} />
                {Boolean(row.actorName) && <p>{String(row.actorName)}</p>}
                <ConfirmButton
                  onConfirm={async () => {
                    try {
                      await save(
                        '/v1/admin/revisions/' + row.id + '/restore',
                        'POST',
                        {},
                      );
                    } catch (error) {
                      if (
                        error instanceof ApiError &&
                        error.code === 'PRICE_CONFIRMATION_REQUIRED'
                      ) {
                        if (window.confirm(t('confirmLarge')))
                          await save(
                            '/v1/admin/revisions/' + row.id + '/restore',
                            'POST',
                            { confirmLargeChange: true },
                          );
                      } else {
                        report(error);
                        throw error;
                      }
                    }
                  }}
                >
                  {t('restore')}
                </ConfirmButton>
              </div>
            ))
          )}
        </div>
      )}
    </details>
  );
}
export function Trips() {
  const { t, locale, save, me } = useAdmin(),
    [search, setSearch] = useState(''),
    [selected, setSelected] = useState(usePathname().split('/')[2] ?? ''),
    [add, setAdd] = useState(false),
    q = useDeferredValue(search),
    query = useData<Row[]>(
      '/v1/admin/trips' + (q ? '?q=' + encodeURIComponent(q) : ''),
    ),
    collections = useData<Row[]>('/v1/admin/collections');
  return (
    <>
      <div className="toolbar">
        <Search value={search} onChange={setSearch} />
        <button onClick={() => setAdd(true)}>{t('add')}</button>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Failure retry={() => void query.refetch()} />
      ) : !query.data?.length ? (
        <Empty />
      ) : (
        <div>
          {(collections.data ?? []).map((collection) => (
            <section key={collection.id}>
              <h2>{content(collection.name, locale)}</h2>
              <OrderList
                items={query.data.filter(
                  (row) => row.collectionId === collection.id,
                )}
                disabled={!!q}
                onReorder={async (ids) => {
                  let index = 0;
                  const all = query.data!.map((row) =>
                    row.collectionId === collection.id ? ids[index++]! : row.id,
                  );
                  await save('/v1/admin/trips/reorder', 'POST', { ids: all });
                }}
                render={(row) => (
                  <div>
                    <button
                      className="link-button"
                      onClick={() => setSelected(row.id)}
                    >
                      <strong>{content(row.title, locale)}</strong>
                    </button>
                    <Pill value={String(row.status)} />
                    <p>{t(String(row.format))}</p>
                    {can(me!.role, 'publish') && (
                      <ConfirmButton
                        onConfirm={() =>
                          save(
                            '/v1/admin/trips/' +
                              row.id +
                              '/' +
                              (row.status === 'published'
                                ? 'unpublish'
                                : 'publish'),
                            'POST',
                            {},
                          )
                        }
                      >
                        {t(
                          row.status === 'published' ? 'unpublish' : 'publish',
                        )}
                      </ConfirmButton>
                    )}
                  </div>
                )}
              />
            </section>
          ))}
        </div>
      )}
      {selected && (
        <Sheet title={t('trips')} onClose={() => setSelected('')}>
          <TripEditor id={selected} />
        </Sheet>
      )}
      {add && (
        <Sheet title={t('add')} onClose={() => setAdd(false)}>
          <CreateTrip
            collections={collections.data ?? []}
            onDone={(id) => {
              setAdd(false);
              setSelected(id);
            }}
          />
        </Sheet>
      )}
    </>
  );
}
function CreateTrip({
  collections,
  onDone,
}: {
  collections: Row[];
  onDone: (id: string) => void;
}) {
  const { save, locale } = useAdmin();
  return (
    <EditorForm
      schema={createTripSchema}
      value={{ title: { en: '' }, collectionId: collections[0]?.id ?? '' }}
      fields={[
        local('title', true),
        { key: 'slug', required: true },
        {
          key: 'collectionId',
          kind: 'select',
          options: collections.map((row) => ({
            value: row.id,
            label: content(row.name, locale),
            literal: true,
          })),
        },
      ]}
      onSave={async (data) => {
        const row = await save<{ id: string }>('/v1/admin/trips', 'POST', data);
        onDone(row.id);
      }}
    />
  );
}
export function TripEditor({ id }: { id: string }) {
  const { t, locale, me, save, request, report } = useAdmin(),
    query = useData<Row>('/v1/admin/trips/' + id),
    collections = useData<Row[]>('/v1/admin/collections'),
    translations = useData<Row[]>(`/v1/admin/i18n/values?entity=trip&id=${id}`),
    [duplicate, setDuplicate] = useState(false);
  if (query.isPending) return <Loading />;
  if (!query.data) return <Failure retry={() => void query.refetch()} />;
  const data = query.data,
    trip = obj(data.trip),
    childRows = (key: string) => rows(data[key]),
    form = (section: string, fields: Field[], schema: z.ZodType) => (
      <EditorForm
        key={JSON.stringify(trip) + section}
        fields={fields}
        schema={schema}
        value={trip}
        translations={translations.data ?? []}
        onSave={(value) =>
          save('/v1/admin/trips/' + id + '/' + section, 'PATCH', value)
        }
      />
    );
  return (
    <>
      <h3>{content(trip.title, locale)}</h3>
      <Pill value={String(trip.status)} />
      <div className="actions">
        <button
          className="secondary"
          onClick={async () => {
            try {
              const result = await request<{ url: string }>(
                '/v1/admin/preview-link',
                'POST',
                { path: `/${locale}/t/${trip.slug}` },
              );
              window.open(result.url, '_blank', 'noopener,noreferrer');
            } catch (error) {
              report(error);
            }
          }}
        >
          {t('preview')}
        </button>
        <button className="secondary" onClick={() => setDuplicate(true)}>
          {t('duplicate')}
        </button>
        {can(me!.role, 'publish') && (
          <ConfirmButton
            onConfirm={() =>
              save(
                '/v1/admin/trips/' +
                  id +
                  '/' +
                  (trip.status === 'published' ? 'unpublish' : 'publish'),
                'POST',
                {},
              )
            }
          >
            {t(trip.status === 'published' ? 'unpublish' : 'publish')}
          </ConfirmButton>
        )}
      </div>
      <details open>
        <summary>{t('basics')}</summary>
        <div>
          {trip.kind === 'trip' && <PrivateSwitch slug={String(trip.slug)} />}
          {form(
            'basics',
            [
              local('title', true),
              local('summary'),
              local('description'),
              {
                key: 'collectionId',
                kind: 'select',
                options: (collections.data ?? []).map((row) => ({
                  value: row.id,
                  label: content(row.name, locale),
                  literal: true,
                })),
              },
              select('format', ['group', 'private', 'both']),
              ...(can(me!.role, 'prices')
                ? [number('privateSurchargePct', 0, 999)]
                : []),
              { key: 'privateOnRequest', kind: 'check' },
              { key: 'familyFriendly', kind: 'check' },
              number('minAge', 0, 100),
              number('featuredOrder', 0, 99),
            ],
            basicsSchema,
          )}
        </div>
      </details>
      <details>
        <summary>{t('schedule')}</summary>
        <div>
          {form(
            'schedule',
            [
              local('daysLabel'),
              {
                key: 'runDays',
                label: 'daysLabel',
                kind: 'days',
                nullable: true,
              },
              { key: 'onRequest', kind: 'check' },
              { key: 'departureLabel', nullable: true },
              { key: 'returnLabel', nullable: true },
              local('durationLabel'),
              number('durationMinutes', 1, 172800),
              number('daysCount', 1, 120),
              { key: 'transport', nullable: true },
              { key: 'flight', kind: 'check' },
              { key: 'overnight', kind: 'check' },
            ],
            scheduleSchema,
          )}
        </div>
      </details>
      {can(me!.role, 'prices') && (
        <details>
          <summary>{t('prices')}</summary>
          <div>
            <PriceEditor
              id={id}
              value={childRows('prices')}
              isPackage={trip.kind === 'package'}
            />
          </div>
        </details>
      )}
      <details>
        <summary>{t('itinerary')}</summary>
        <div>
          <EditorForm
            key={JSON.stringify(data.itinerary)}
            schema={itinerarySchema}
            value={{ rows: childRows('itinerary') }}
            fields={[
              {
                key: 'rows',
                label: 'itinerary',
                kind: 'rows',
                fields: [
                  { key: 'timeLabel', nullable: true },
                  local('text', true),
                ],
              },
            ]}
            onSave={(value) =>
              save('/v1/admin/trips/' + id + '/itinerary', 'PUT', value)
            }
          />
        </div>
      </details>
      <details>
        <summary>{t('items')}</summary>
        <div>
          <EditorForm
            key={JSON.stringify(data.items)}
            schema={itemsSchema}
            value={{ rows: childRows('items') }}
            fields={[
              {
                key: 'rows',
                label: 'items',
                kind: 'rows',
                fields: [
                  select('type', [
                    'include',
                    'exclude',
                    'optional',
                    'bring',
                    'highlight',
                  ]),
                  local('text', true),
                  {
                    key: 'extraPriceEur',
                    label: 'amountEur',
                    kind: 'number',
                    min: 0,
                    nullable: true,
                  },
                ],
              },
            ]}
            onSave={(value) =>
              save('/v1/admin/trips/' + id + '/items', 'PUT', value)
            }
          />
        </div>
      </details>
      <details>
        <summary>{t('media')}</summary>
        <div>
          <TripMedia id={id} value={childRows('media')} />
        </div>
      </details>
      <details>
        <summary>{t('seo')}</summary>
        <div>
          {form('seo', [local('seoTitle'), local('seoDescription')], seoSchema)}
        </div>
      </details>
      <HistoryPanel entity="trip" id={id} />
      {duplicate && (
        <Sheet title={t('duplicate')} onClose={() => setDuplicate(false)}>
          <EditorForm
            fields={[{ key: 'slug', required: true }]}
            value={{ slug: '' }}
            onSave={async (value) => {
              await save('/v1/admin/trips/' + id + '/duplicate', 'POST', value);
              setDuplicate(false);
            }}
          />
        </Sheet>
      )}
    </>
  );
}
function PrivateSwitch({ slug }: { slug: string }) {
  const { t, me, save, report, online } = useAdmin(),
    query = useData<Row>('/v1/admin/homepage'),
    trips = useData<Row[]>('/v1/admin/trips'),
    [busy, setBusy] = useState(false);
  if (!query.data) return <Loading />;
  const value = obj(query.data.draft ?? query.data),
    home = obj(value.home),
    selected = Array.isArray(home.private_trip_slugs)
      ? (home.private_trip_slugs as string[])
      : (trips.data ?? [])
          .filter((row) => row.format === 'private')
          .map((row) => String(row.slug));
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={selected.includes(slug)}
        disabled={busy || !online}
        onChange={async (event) => {
          const include = event.target.checked;
          setBusy(true);
          try {
            await save('/v1/admin/homepage', 'PUT', {
              home: {
                ...home,
                private_trip_slugs: include
                  ? [...selected, slug]
                  : selected.filter((value) => value !== slug),
              },
              how_steps: value.how_steps,
              private_perks: value.private_perks,
              publish: can(me!.role, 'publish'),
            });
          } catch (error) {
            report(error);
          } finally {
            setBusy(false);
          }
        }}
      />
      {t('showPrivate')}
    </label>
  );
}
export function PriceEditor({
  id,
  value,
  isPackage = false,
}: {
  id: string;
  value: Row[];
  isPackage?: boolean;
}) {
  const { save, t } = useAdmin();
  return (
    <>
      {isPackage && (
        <ConfirmButton
          warning={t('sum')}
          onConfirm={() =>
            save('/v1/admin/packages/' + id + '/prices', 'DELETE', {})
          }
        >
          {t('sum')}
        </ConfirmButton>
      )}
      <EditorForm
        key={JSON.stringify(value)}
        schema={pricesSchema}
        value={{ rows: value }}
        fields={[
          {
            key: 'rows',
            label: 'prices',
            kind: 'rows',
            fields: [
              local('label'),
              number('amountEur'),
              select('unit', [
                'person',
                'child',
                'quad',
                'buggy',
                'car',
                'boat',
                'group',
                'hour',
              ]),
              { key: 'isPrimary', kind: 'check' },
              number('minQty', 1, 100),
              number('maxQty', 1, 100),
              { key: 'validFrom', kind: 'date', nullable: true },
              { key: 'validTo', kind: 'date', nullable: true },
            ],
            initial: { unit: 'person', amountEur: null, isPrimary: false },
          },
        ]}
        onSave={async (data) => {
          try {
            await save('/v1/admin/trips/' + id + '/prices', 'PUT', data);
          } catch (error) {
            if (
              error instanceof ApiError &&
              error.code === 'PRICE_CONFIRMATION_REQUIRED'
            ) {
              if (window.confirm(t('confirmLarge')))
                await save('/v1/admin/trips/' + id + '/prices', 'PUT', {
                  ...data,
                  confirmLargeChange: true,
                });
              else throw error;
            } else throw error;
          }
        }}
      />
      <HistoryPanel entity="trip_prices" id={id} />
    </>
  );
}
export function Prices() {
  const { t, locale } = useAdmin(),
    [search, setSearch] = useState(''),
    [selected, setSelected] = useState<Row | null>(null),
    [bulk, setBulk] = useState(false),
    query = useData<Row[]>('/v1/admin/price-list'),
    collections = useData<Row[]>('/v1/admin/collections');
  return (
    <>
      <div className="toolbar">
        <Search value={search} onChange={setSearch} />
        <button onClick={() => setBulk(true)}>{t('bulk')}</button>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Failure retry={() => void query.refetch()} />
      ) : (
        <div className="cards">
          {query.data
            ?.filter((row) =>
              content(row.title, locale)
                .toLocaleLowerCase(locale)
                .includes(search.toLocaleLowerCase(locale)),
            )
            .map((row) => {
              const primary = rows(row.rows).find((price) => price.isPrimary),
                amount = primary?.amountEur as string | null | undefined;
              return (
                <button
                  className="card card-button"
                  key={row.id}
                  onClick={() => setSelected(row)}
                >
                  <strong>{content(row.title, locale)}</strong>
                  <div className="card-details">
                    {row.format !== 'private' && (
                      <span>
                        {t('group')}: <Money amount={amount} />
                      </span>
                    )}
                    <span>
                      {t('private')}:{' '}
                      <Money
                        amount={
                          row.format === 'private'
                            ? amount
                            : amount != null && row.privateSurchargePct != null
                              ? Number(amount) *
                                (1 + Number(row.privateSurchargePct) / 100)
                              : null
                        }
                      />
                    </span>
                  </div>
                </button>
              );
            })}
        </div>
      )}
      {selected && (
        <Sheet
          title={content(selected.title, locale)}
          onClose={() => setSelected(null)}
        >
          <PriceEditor
            id={selected.id}
            value={rows(
              query.data?.find((row) => row.id === selected.id)?.rows,
            )}
          />
        </Sheet>
      )}
      {bulk && (
        <Sheet title={t('bulk')} onClose={() => setBulk(false)}>
          <BulkPrices
            trips={query.data ?? []}
            collections={collections.data ?? []}
          />
        </Sheet>
      )}
    </>
  );
}
function BulkPrices({
  trips,
  collections,
}: {
  trips: Row[];
  collections: Row[];
}) {
  const { t, save, request, locale } = useAdmin(),
    [preview, setPreview] = useState<Row | null>(null);
  return (
    <>
      <EditorForm
        fields={[
          {
            key: 'collectionId',
            kind: 'select',
            nullable: true,
            options: collections.map((row) => ({
              value: row.id,
              label: content(row.name, locale),
              literal: true,
            })),
          },
          select('mode', ['percent', 'amount']),
          {
            key: 'value',
            label: 'amountEur',
            kind: 'number',
            min: -10000,
            max: 10000,
          },
        ]}
        value={{ collectionId: null, mode: 'percent', value: 0 }}
        submitLabel="preview"
        onSave={async (data) => {
          const { collectionId, ...rest } = data;
          setPreview(
            await request<Row>('/v1/admin/prices/bulk/preview', 'POST', {
              ...rest,
              ...(collectionId ? { collectionId } : {}),
            }),
          );
        }}
      />
      {preview && (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('trips')}</th>
                  <th>{t('before')}</th>
                  <th>{t('after')}</th>
                </tr>
              </thead>
              <tbody>
                {rows(preview.rows).map((row, index) => (
                  <tr key={index}>
                    <td>
                      {content(
                        trips.find((trip) => trip.id === row.tripId)?.title,
                        locale,
                      )}
                    </td>
                    <td>
                      <Money amount={row.before as number} />
                    </td>
                    <td>
                      <Money amount={row.after as number} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ConfirmButton
            warning={
              preview.requires_confirmation ? t('confirmLarge') : undefined
            }
            onConfirm={async () => {
              await save('/v1/admin/prices/bulk/apply', 'POST', {
                token: preview.token,
                confirmLargeChange: true,
              });
              setPreview(null);
            }}
          >
            {t('confirm')}
          </ConfirmButton>
        </>
      )}
    </>
  );
}
export function Collections() {
  const { t, locale, me, save } = useAdmin(),
    query = useData<Row[]>('/v1/admin/collections'),
    [selected, setSelected] = useState<Row | null>(null),
    [add, setAdd] = useState(false);
  return (
    <>
      <button onClick={() => setAdd(true)}>{t('add')}</button>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Failure retry={() => void query.refetch()} />
      ) : (
        <OrderList
          items={query.data ?? []}
          disabled={!can(me!.role, 'publish')}
          onReorder={(ids) =>
            save('/v1/admin/collections/reorder', 'POST', { ids })
          }
          render={(row) => (
            <div>
              <button className="link-button" onClick={() => setSelected(row)}>
                {content(row.name, locale)}
              </button>
              <Pill value={String(row.status)} />
              {can(me!.role, 'publish') && (
                <div className="row-controls">
                  <ConfirmButton
                    onConfirm={() =>
                      save(
                        '/v1/admin/collections/' + row.id + '/publish',
                        'POST',
                        {},
                      )
                    }
                  >
                    {t('publish')}
                  </ConfirmButton>
                </div>
              )}
            </div>
          )}
        />
      )}
      {(selected || add) && (
        <Sheet
          title={t('collections')}
          onClose={() => {
            setSelected(null);
            setAdd(false);
          }}
        >
          <CollectionEditor
            key={JSON.stringify(
              query.data?.find((row) => row.id === selected?.id) ?? selected,
            )}
            value={
              query.data?.find((row) => row.id === selected?.id) ??
              selected ?? { name: { en: '' }, slug: '', color: '#d8b85a' }
            }
            creating={add}
            onCreated={() => setAdd(false)}
          />
        </Sheet>
      )}
    </>
  );
}
function CollectionEditor({
  value,
  creating,
  onCreated,
}: {
  value: Record<string, unknown>;
  creating: boolean;
  onCreated: () => void;
}) {
  const { save, locale } = useAdmin(),
    media = useMediaOptions(),
    translations = useData<Row[]>(
      `/v1/admin/i18n/values?entity=collection&id=${value.id}`,
      !creating,
    );
  return (
    <>
      <EditorForm
        fields={[
          ...(creating ? [{ key: 'slug', required: true } as Field] : []),
          local('name', true),
          local('shortName'),
          local('headline'),
          local('subline'),
          { key: 'color', kind: 'color' },
          {
            key: 'coverMediaId',
            label: 'cover',
            kind: 'select',
            nullable: true,
            options: (media.data ?? [])
              .filter((row) => row.kind === 'image' && row.status === 'ready')
              .map((row) => ({
                value: row.id,
                label: content(row.alt, locale) || row.id.slice(0, 8),
                literal: true,
              })),
          },
          {
            key: 'heroVideoId',
            label: 'video',
            kind: 'select',
            nullable: true,
            options: (media.data ?? [])
              .filter((row) => row.kind === 'video' && row.status === 'ready')
              .map((row) => ({
                value: row.id,
                label: content(row.alt, locale) || row.id.slice(0, 8),
                literal: true,
              })),
          },
          {
            key: 'perks',
            label: 'items',
            kind: 'rows',
            fields: [
              local('title', true),
              { ...local('sub', true), label: 'subline' },
            ],
          },
        ]}
        value={value}
        translations={translations.data ?? []}
        schema={
          creating
            ? collectionEditSchema
                .required({ name: true })
                .extend({ slug: z.string().regex(/^[a-z0-9-]+$/) })
            : collectionEditSchema
        }
        onSave={async (data) => {
          await save(
            '/v1/admin/collections' + (creating ? '' : '/' + value.id),
            creating ? 'POST' : 'PATCH',
            data,
          );
          if (creating) onCreated();
        }}
      />
      {!creating && <HistoryPanel entity="collection" id={String(value.id)} />}
    </>
  );
}
export function Packages() {
  const { t, locale } = useAdmin(),
    query = useData<Row[]>('/v1/admin/packages'),
    [selected, setSelected] = useState(''),
    [adding, setAdding] = useState(false);
  return (
    <>
      <button onClick={() => setAdding(true)}>{t('add')}</button>
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
              onClick={() => setSelected(row.id)}
            >
              <strong>{content(row.title, locale)}</strong>
              <Pill value={String(row.status)} />
            </button>
          ))}
        </div>
      )}
      {selected && (
        <Sheet title={t('packages')} onClose={() => setSelected('')}>
          <TripEditor id={selected} />
          <PackageParts id={selected} />
        </Sheet>
      )}
      {adding && (
        <Sheet title={t('packages')} onClose={() => setAdding(false)}>
          <PackageParts
            onCreated={(id) => {
              setAdding(false);
              setSelected(id);
            }}
          />
        </Sheet>
      )}
    </>
  );
}
function PackageParts({
  id,
  onCreated,
}: {
  id?: string;
  onCreated?: (id: string) => void;
}) {
  const { save, locale, t } = useAdmin(),
    query = useData<Row[]>('/v1/admin/package-parts?id=' + id, !!id),
    trips = useData<Row[]>('/v1/admin/trips');
  if (id && !query.data)
    return query.isError ? (
      <Failure retry={() => void query.refetch()} />
    ) : (
      <Loading />
    );
  return (
    <EditorForm
      value={{
        parts: query.data ?? [],
        ...(!id ? { title: { en: '' }, slug: '' } : {}),
      }}
      fields={[
        ...(!id
          ? [local('title', true), { key: 'slug', required: true } as Field]
          : []),
        {
          key: 'parts',
          label: 'trips',
          kind: 'rows',
          fields: [
            {
              key: 'tripId',
              label: 'trips',
              kind: 'select',
              options: (trips.data ?? [])
                .filter((row) => row.kind === 'trip')
                .map((row) => ({
                  value: row.id,
                  label: content(row.title, locale),
                  literal: true,
                })),
            },
            { key: 'dayIndex', kind: 'number', min: 1, max: 120 },
          ],
          initial: { dayIndex: 1 },
        },
      ]}
      onSave={async (data) => {
        const result = await save<{ id: string }>(
          '/v1/admin/packages' + (id ? '/' + id : ''),
          id ? 'PATCH' : 'POST',
          data,
        );
        if (!id) onCreated?.(result.id);
      }}
    >
      <p className="muted">
        {t('sum')}:{' '}
        <Money
          amount={(query.data ?? []).reduce(
            (sum, row) => sum + Number(row.primaryAmountEur ?? 0),
            0,
          )}
        />
        {query.data?.some((row) => row.primaryAmountEur === null) &&
          ' + ' + t('onRequest')}
      </p>
    </EditorForm>
  );
}
function TripMedia({ id, value }: { id: string; value: Row[] }) {
  const { save, locale, t } = useAdmin(),
    media = useMediaOptions(),
    [uploading, setUploading] = useState(false);
  return (
    <>
      <button className="secondary" onClick={() => setUploading(true)}>
        {t('upload')}
      </button>
      {uploading && (
        <Sheet title={t('media')} onClose={() => setUploading(false)}>
          <Media />
        </Sheet>
      )}
      <EditorForm
        value={{ rows: value }}
        fields={[
          {
            key: 'rows',
            label: 'media',
            kind: 'rows',
            fields: [
              {
                key: 'mediaId',
                label: 'media',
                kind: 'select',
                options: (media.data ?? []).map((row) => ({
                  value: row.id,
                  label: content(row.alt, locale) || row.id.slice(0, 8),
                  literal: true,
                })),
              },
              select('role', ['cover', 'gallery', 'video']),
            ],
            initial: { role: 'gallery' },
          },
        ]}
        onSave={(data) => save('/v1/admin/trips/' + id + '/media', 'PUT', data)}
      />
    </>
  );
}
