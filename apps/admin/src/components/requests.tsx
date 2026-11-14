'use client';
import { useDeferredValue, useState } from 'react';
import { usePathname } from 'next/navigation';
import { can, requestPatchSchema } from '@stella/shared/admin';
import { isCoreLocale } from '@stella/shared';
import { useAdmin, useData } from '../lib/admin-context';
import { rows, obj, content, type Row } from '../lib/content';
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
import { EditorForm } from './forms';
import { HistoryPanel } from './trips';
const replies = {
  en: 'Hello {name}, this is Stella Sharm Tours about your request {ref}.\n{trips}\n{date}\nPickup: {pickup}\nPickup time: [to confirm]',
  it: 'Ciao {name}, siamo Stella Sharm Tours e ti contattiamo per la richiesta {ref}.\n{trips}\n{date}\nRitiro: {pickup}\nOrario di ritiro: [da confermare]',
  es: 'Hola {name}, somos Stella Sharm Tours y te escribimos sobre tu solicitud {ref}.\n{trips}\n{date}\nRecogida: {pickup}\nHora de recogida: [por confirmar]',
  fr: 'Bonjour {name}, ici Stella Sharm Tours au sujet de votre demande {ref}.\n{trips}\n{date}\nPrise en charge : {pickup}\nHeure de prise en charge : [à confirmer]',
  de: 'Hallo {name}, hier ist Stella Sharm Tours zu deiner Anfrage {ref}.\n{trips}\n{date}\nAbholung: {pickup}\nAbholzeit: [noch zu bestätigen]',
  ru: 'Здравствуйте, {name}! Это Stella Sharm Tours по вашей заявке {ref}.\n{trips}\n{date}\nМесто трансфера: {pickup}\nВремя трансфера: [уточняется]',
  tr: 'Merhaba {name}, {ref} talebiniz için Stella Sharm Tours olarak yazıyoruz.\n{trips}\n{date}\nAlınış yeri: {pickup}\nAlınış saati: [teyit edilecek]',
};
export function Requests() {
  const { t, me, request, report, locale } = useAdmin(),
    [status, setStatus] = useState('new'),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState(usePathname().split('/')[2] ?? ''),
    [privacy, setPrivacy] = useState(false),
    q = useDeferredValue(search);
  const query = useData<Row[]>(
    `/v1/admin/requests?page=${page}${status === 'all' ? '' : '&status=' + status}${q ? '&q=' + encodeURIComponent(q) : ''}`,
  );
  return (
    <>
      <div className="toolbar">
        <Search
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
        {can(me!.role, 'export') && (
          <>
            <button className="secondary" onClick={() => setPrivacy(true)}>
              {t('privacy')}
            </button>
            <button
              className="secondary"
              onClick={async () => {
                try {
                  const file = await request<Blob>(
                    '/v1/admin/requests/export.csv',
                  );
                  const url = URL.createObjectURL(file),
                    link = document.createElement('a');
                  link.href = url;
                  link.download = 'requests.csv';
                  link.click();
                  URL.revokeObjectURL(url);
                } catch (error) {
                  report(error);
                }
              }}
            >
              {t('export')}
            </button>
          </>
        )}
      </div>
      <div className="segmented">
        {['new', 'contacted', 'confirmed', 'all'].map((value) => (
          <button
            key={value}
            aria-pressed={value === status}
            onClick={() => {
              setStatus(value);
              setPage(1);
            }}
          >
            {t(value)}
          </button>
        ))}
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Failure retry={() => void query.refetch()} />
      ) : !query.data?.length ? (
        <Empty />
      ) : (
        <div className="cards">
          {query.data.map((request) => (
            <button
              key={request.id}
              className="card card-button"
              onClick={() => setSelected(request.id)}
            >
              <div className="card-title">
                <strong>{String(request.name)}</strong>
                <Pill value={String(request.status)} />
              </div>
              <p>
                <bdi>{String(request.ref)}</bdi> ·{' '}
                {String(request.locale).toUpperCase()}
              </p>
              <p>
                {(Array.isArray(request.tripTitles) ? request.tripTitles : [])
                  .map((title) => content(title, locale))
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <div className="card-details">
                <span>{String(request.startDate)}</span>
                <span>
                  {Number(request.adults) + Number(request.children)} ·{' '}
                  {t('guests')}
                </span>
                <span>{String(request.pickupArea ?? '')}</span>
                <Money amount={request.estimateEur as string | null} />
              </div>
              <small>
                <Time value={String(request.createdAt)} />
              </small>
            </button>
          ))}
        </div>
      )}
      <div className="actions">
        <button
          className="secondary"
          disabled={page === 1}
          onClick={() => setPage((v) => v - 1)}
        >
          {t('previous')}
        </button>
        <button
          className="secondary"
          disabled={(query.data?.length ?? 0) < 50}
          onClick={() => setPage((v) => v + 1)}
        >
          {t('next')}
        </button>
      </div>
      {selected && (
        <Sheet title={t('requests')} onClose={() => setSelected('')}>
          <RequestDetail id={selected} />
        </Sheet>
      )}
      {privacy && (
        <Sheet title={t('privacy')} onClose={() => setPrivacy(false)}>
          <Privacy />
        </Sheet>
      )}
    </>
  );
}
function RequestDetail({ id }: { id: string }) {
  const { t, save, report, online } = useAdmin(),
    query = useData<Row>('/v1/admin/requests/' + id),
    assignees = useData<Row[]>('/v1/admin/request-assignees');
  if (query.isPending) return <Loading />;
  if (!query.data) return <Failure retry={() => void query.refetch()} />;
  const row = query.data,
    locale = isCoreLocale(String(row.locale))
      ? (String(row.locale) as keyof typeof replies)
      : 'en';
  const tripNames = rows(row.items)
    .map((item) => content(item.title, locale))
    .filter(Boolean)
    .join('\n');
  const message = replies[locale].replace(
    /\{(name|ref|trips|date|pickup)\}/g,
    (_, key: string) =>
      ({
        name: String(row.name),
        ref: String(row.ref),
        trips: tripNames,
        date: String(row.startDate),
        pickup: String(row.pickupArea ?? ''),
      })[key as 'name'] ?? '',
  );
  return (
    <>
      <h3>
        {String(row.ref)} · {String(row.name)}
      </h3>
      <Pill value={String(row.status)} />
      <dl className="data-grid">
        {[
          ['phone', row.phone],
          ['email', row.email],
          ['date', row.startDate],
          ['guests', Number(row.adults) + Number(row.children)],
          ['pickup', row.pickupArea],
          ['hotel', row.hotel],
          ['notes', row.notes],
        ]
          .filter(
            ([, value]) =>
              value !== null && value !== undefined && value !== '',
          )
          .map(([label, value]) => (
            <div key={String(label)}>
              <dt>{t(String(label))}</dt>
              <dd>
                <bdi>{String(value)}</bdi>
              </dd>
            </div>
          ))}
      </dl>
      <p>
        {t('estimate')}: <Money amount={row.estimateEur as string | null} />
      </p>
      {rows(row.items).map((item, index) => (
        <section key={index} className="card">
          <h3>{content(item.title, locale)}</h3>
          {rows(obj(item.priceSnapshot).prices).map((price, priceIndex) => (
            <p key={priceIndex}>
              <span
                lang={
                  typeof obj(price.label).lang === 'string'
                    ? String(obj(price.label).lang)
                    : locale
                }
              >
                {content(price.label, locale)}
              </span>{' '}
              · <Money amount={price.amount_eur as string | null} /> ·{' '}
              {t(String(price.unit))}
            </p>
          ))}
        </section>
      ))}
      {/^\+[1-9]\d{7,14}$/.test(String(row.phone)) && (
        <div className="actions">
          <a
            className="button"
            href={
              'https://wa.me/' +
              String(row.phone).slice(1) +
              '?text=' +
              encodeURIComponent(message)
            }
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('reply')}
          </a>
          <a className="button secondary" href={'tel:' + String(row.phone)}>
            {t('call')}
          </a>
        </div>
      )}
      {!row.anonymizedAt && (
        <>
          <div className="actions">
            {['contacted', 'confirmed', 'cancelled', 'spam'].map((value) => (
              <button
                className="secondary"
                key={value}
                disabled={!online || row.status === value}
                onClick={() =>
                  void save('/v1/admin/requests/' + id, 'PATCH', {
                    status: value,
                  }).catch(report)
                }
              >
                {t(value)}
              </button>
            ))}
          </div>
          <EditorForm
            key={String(row.updatedAt)}
            schema={requestPatchSchema}
            value={row}
            fields={[
              {
                key: 'assignedTo',
                kind: 'select',
                nullable: true,
                options: (assignees.data ?? []).map((user) => ({
                  value: user.id,
                  label: String(user.name),
                  literal: true,
                })),
              },
              { key: 'internalNote', kind: 'area', nullable: true },
            ]}
            onSave={(data) => save('/v1/admin/requests/' + id, 'PATCH', data)}
          />
        </>
      )}
      <HistoryPanel entity="request" id={id} />
    </>
  );
}
function Privacy() {
  const { t, request, report } = useAdmin(),
    [phone, setPhone] = useState(''),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState('');
  return (
    <>
      <p className="warning">{t('eraseWarning')}</p>
      <label>
        {t('phone')}
        <input
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          pattern="\+[1-9][0-9]{7,14}"
        />
      </label>
      <div className="actions">
        <button
          disabled={busy || !/^\+[1-9]\d{7,14}$/.test(phone)}
          onClick={async () => {
            setBusy(true);
            try {
              const data = await request(
                '/v1/admin/privacy/requests/export',
                'POST',
                { phone },
              );
              const url = URL.createObjectURL(
                  new Blob([JSON.stringify(data, null, 2)], {
                    type: 'application/json',
                  }),
                ),
                anchor = document.createElement('a');
              anchor.href = url;
              anchor.download = 'customer-export.json';
              anchor.click();
              URL.revokeObjectURL(url);
            } catch (error) {
              report(error);
            } finally {
              setBusy(false);
            }
          }}
        >
          {t('export')}
        </button>
        <ConfirmButton
          warning={t('eraseWarning')}
          onConfirm={async () => {
            await request('/v1/admin/privacy/requests/erase', 'POST', {
              phone,
              confirm: true,
            });
            setPhone('');
            setResult(t('saved'));
          }}
        >
          {t('erase')}
        </ConfirmButton>
      </div>
      {result && <p role="status">{result}</p>}
    </>
  );
}
