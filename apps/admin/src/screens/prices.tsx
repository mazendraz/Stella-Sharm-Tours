'use client';
import { useMemo, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { useAdmin, useData, ApiError } from '../lib/admin-context';
import { content, rows, type Row } from '../lib/content';
import { dayLabel, money } from '../lib/format';
import { usePriceText } from '../lib/catalog';
import { PageHeader } from '../components/ui/page-header';
import { DataTable, SearchBox, type Column } from '../components/ui/data-table';
import { Modal, useConfirm } from '../components/ui/dialog';
import { FieldGroup, FormField, Segmented } from '../components/ui/field';
import { Callout } from '../components/ui/states';
import { Sliders } from 'lucide-react';

export function Prices() {
  const { t, tp, locale, write, notify, report } = useAdmin(),
    priceText = usePriceText(),
    list = useData<Row[]>('/v1/admin/price-list'),
    collections = useData<Row[]>('/v1/admin/collections'),
    confirm = useConfirm(),
    [q, setQ] = useState(''),
    [editing, setEditing] = useState<string | null>(null),
    [draft, setDraft] = useState(''),
    [busy, setBusy] = useState(false),
    [bulk, setBulk] = useState(false),
    [kind, setKind] = useState(''),
    inFlight = useRef(false);
  const needle = q.trim().toLocaleLowerCase(locale);
  const visible = (list.data ?? []).filter(
    (row) =>
      (!kind || row.kind === kind) &&
      (!needle ||
        content(row.title, locale).toLocaleLowerCase(locale).includes(needle)),
  );
  // Stable order: collection order, then trip order (as on the Trips page); packages last.
  const groups = useMemo(() => {
    const cols = (collections.data ?? []).filter(
      (c) => c.kind !== 'private_virtual',
    );
    return cols
      .map((c) => ({
        key: c.id,
        label: content(c.name, locale),
        rows: visible.filter((r) => r.collectionId === c.id),
      }))
      .concat([
        {
          key: 'other',
          label: t('otherCollections'),
          rows: visible.filter(
            (r) => !cols.some((c) => c.id === r.collectionId),
          ),
        },
      ]);
  }, [collections.data, visible, locale, t]);
  const primary = (row: Row) => rows(row.rows).find((p) => p.isPrimary);
  const saveAmount = async (row: Row) => {
    const main = primary(row);
    // One request per edit, even if Enter repeats or blur follows.
    if (!main || inFlight.current) return;
    const value = draft.trim();
    if (value !== '' && !(Number(value) >= 0)) {
      notify(t('pricesInvalidAmount'), { tone: 'error' });
      return;
    }
    const amount = value === '' ? null : Number(Number(value).toFixed(2));
    if ((main.amountEur == null ? null : Number(main.amountEur)) === amount) {
      setEditing(null);
      return;
    }
    const body = {
      rows: rows(row.rows).map((p) => ({
        id: p.id,
        label: p.label ?? null,
        amountEur:
          p.id === main.id
            ? amount
            : p.amountEur == null
              ? null
              : Number(p.amountEur),
        unit: p.unit,
        minQty: p.minQty ?? null,
        maxQty: p.maxQty ?? null,
        isPrimary: !!p.isPrimary,
        validFrom: p.validFrom ?? null,
        validTo: p.validTo ?? null,
      })),
    };
    inFlight.current = true;
    setBusy(true);
    const send = async (extra: object) => {
      const { revisions } = await write(
        '/v1/admin/trips/' + row.id + '/prices',
        'PUT',
        { ...body, ...extra },
      );
      await list.refetch();
      notify(t('priceUpdated'), { undo: revisions });
      setEditing(null);
    };
    try {
      await send({});
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.code === 'PRICE_CONFIRMATION_REQUIRED'
      ) {
        if (
          await confirm({
            title: t('largePriceTitle'),
            body: t('confirmLarge'),
            confirmLabel: t('savePrices'),
          })
        )
          await send({ confirmLargeChange: true }).catch(report);
      } else report(error);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const columns: Column<Row>[] = [
    {
      key: 'title',
      header: t('tripOrPackage'),
      cell: (row) => (
        <span className="strong">{content(row.title, locale)}</span>
      ),
    },
    {
      key: 'kind',
      header: t('type'),
      className: 'hide-md',
      cell: (row) => (
        <span className="chip">
          {t(row.kind === 'package' ? 'package' : 'trip')}
        </span>
      ),
    },
    {
      key: 'main',
      header: t('mainPrice'),
      cell: (row) => {
        const main = primary(row);
        if (!main)
          return (
            <span className="muted">
              {row.kind === 'package' ? t('sumOfTrips') : t('noPriceYet')}
            </span>
          );
        if (editing === row.id)
          return (
            <input
              className="inline-input"
              autoFocus
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              aria-label={t('amountFor', { name: content(row.title, locale) })}
              value={draft}
              disabled={busy}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveAmount(row);
                if (e.key === 'Escape') setEditing(null);
              }}
              onBlur={() => !busy && setEditing(null)}
            />
          );
        return (
          <button
            type="button"
            className="inline-edit"
            onClick={() => {
              setEditing(row.id);
              setDraft(
                main.amountEur == null ? '' : String(Number(main.amountEur)),
              );
            }}
          >
            {money(main.amountEur as string, locale) ?? t('onRequest')}
            <span className="sr-only">
              {' '}
              — {t('editPriceFor', { name: content(row.title, locale) })}
            </span>
            <Pencil size={14} aria-hidden />
          </button>
        );
      },
    },
    {
      key: 'private',
      header: t('privatePrice'),
      className: 'hide-md',
      cell: (row) =>
        row.format === 'group'
          ? '—'
          : row.format === 'private'
            ? t('fmtPrivate')
            : row.privateSurchargePct != null
              ? '+' + Number(row.privateSurchargePct) + '%'
              : t('onRequest'),
    },
    {
      key: 'per',
      header: t('per'),
      cell: (row) =>
        primary(row) ? t('unitName_' + String(primary(row)!.unit)) : '—',
    },
    {
      key: 'valid',
      header: t('validDates'),
      className: 'hide-lg',
      cell: (row) => {
        const main = primary(row);
        if (!main || (!main.validFrom && !main.validTo))
          return <span className="muted">{t('always')}</span>;
        return [main.validFrom, main.validTo]
          .map((d) => (d ? dayLabel(String(d), locale) : '…'))
          .join(' → ');
      },
    },
  ];
  return (
    <div className="page">
      <PageHeader
        title={t('prices')}
        description={t('pricesDesc')}
        primary={{
          label: t('bulk'),
          onClick: () => setBulk(true),
          icon: <Sliders size={18} aria-hidden />,
        }}
      />
      <DataTable
        caption={t('prices')}
        columns={columns}
        groups={groups}
        getKey={(row) => row.id}
        href={(row) =>
          (row.kind === 'package' ? '/packages/' : '/trips/') +
          row.id +
          '#section-' +
          (row.kind === 'package' ? 'price' : 'prices')
        }
        mobile={{
          title: (row) => content(row.title, locale),
          meta: (row) =>
            primary(row) ? priceText(primary(row), false) : t('sumOfTrips'),
        }}
        loading={list.isPending || collections.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        empty={{ title: t('noTripsYet') }}
        filtered={{
          active: !!needle || !!kind,
          title: t('noTripsMatch', { q }),
          onClear: () => {
            setQ('');
            setKind('');
          },
        }}
        count={tp('itemsCount', visible.length)}
        toolbar={
          <div className="filters">
            <SearchBox
              value={q}
              onChange={setQ}
              placeholder={t('searchTrips')}
            />
            <select
              aria-label={t('type')}
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="">{t('tripsAndPackages')}</option>
              <option value="trip">{t('trips')}</option>
              <option value="package">{t('packages')}</option>
            </select>
          </div>
        }
      />
      {bulk && (
        <BulkDialog
          onClose={() => setBulk(false)}
          collections={(collections.data ?? []).filter(
            (c) => c.kind !== 'private_virtual',
          )}
          trips={list.data ?? []}
        />
      )}
    </div>
  );
}

function BulkDialog({
  onClose,
  collections,
  trips,
}: {
  onClose: () => void;
  collections: Row[];
  trips: Row[];
}) {
  const { t, tp, locale, request, save, report } = useAdmin(),
    confirm = useConfirm(),
    [scope, setScope] = useState(''),
    [mode, setMode] = useState<'percent' | 'amount'>('percent'),
    [direction, setDirection] = useState<'up' | 'down'>('up'),
    [value, setValue] = useState(''),
    [round, setRound] = useState<'0' | '1' | '5'>('1'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<Row | null>(null);
  const reset = () => setPreview(null);
  const signed = (direction === 'down' ? -1 : 1) * Number(value);
  const changed = rows(preview?.rows).filter((r) => r.before !== r.after);
  return (
    <Modal title={t('bulk')} onClose={onClose} size="lg">
      {!preview ? (
        <form
          noValidate
          onSubmit={async (event) => {
            event.preventDefault();
            if (!(Number(value) > 0)) {
              setError(t('enterPositive'));
              return;
            }
            setError('');
            setBusy(true);
            try {
              setPreview(
                await request<Row>('/v1/admin/prices/bulk/preview', 'POST', {
                  mode,
                  value: signed,
                  round: Number(round),
                  ...(scope ? { collectionId: scope } : {}),
                }),
              );
            } catch (e) {
              report(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          <FormField label={t('applyTo')}>
            {(p) => (
              <select
                {...p}
                value={scope}
                onChange={(e) => setScope(e.target.value)}
              >
                <option value="">{t('allTrips')}</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {t('onlyCollection', { name: content(c.name, locale) })}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FieldGroup legend={t('changeBy')}>
            <Segmented
              label={t('changeBy')}
              value={mode}
              onChange={setMode}
              options={[
                { value: 'percent', label: '%' },
                { value: 'amount', label: '€' },
              ]}
            />
          </FieldGroup>
          <FieldGroup legend={t('direction')}>
            <Segmented
              label={t('direction')}
              value={direction}
              onChange={setDirection}
              options={[
                { value: 'up', label: t('increase') },
                { value: 'down', label: t('decrease') },
              ]}
            />
          </FieldGroup>
          <FormField
            label={mode === 'percent' ? t('percentLabel') : t('amountLabel')}
            error={error}
          >
            {(p) => (
              <input
                {...p}
                type="number"
                min={0}
                step={mode === 'percent' ? 1 : 0.5}
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            )}
          </FormField>
          <FormField label={t('rounding')} hint={t('roundingHint')}>
            {(p) => (
              <select
                {...p}
                value={round}
                onChange={(e) => setRound(e.target.value as '0' | '1' | '5')}
              >
                <option value="0">{t('noRounding')}</option>
                <option value="1">{t('roundTo', { n: '€1' })}</option>
                <option value="5">{t('roundTo', { n: '€5' })}</option>
              </select>
            )}
          </FormField>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={onClose}>
              {t('cancel')}
            </button>
            <button className="btn btn-primary" disabled={busy}>
              {busy && <span className="spinner" aria-hidden />}
              {t('previewChanges')}
            </button>
          </div>
        </form>
      ) : (
        <>
          {preview.requires_confirmation === true && (
            <Callout tone="warning">{t('confirmLarge')}</Callout>
          )}
          <p className="muted">{tp('pricesWillChange', changed.length)}</p>
          <div className="table-scroll preview-table">
            <table className="plain-table">
              <thead>
                <tr>
                  <th scope="col">{t('trip')}</th>
                  <th scope="col" className="num">
                    {t('before')}
                  </th>
                  <th scope="col" className="num">
                    {t('after')}
                  </th>
                  <th scope="col" className="num">
                    Δ
                  </th>
                </tr>
              </thead>
              <tbody>
                {changed.map((r, i) => (
                  <tr key={i}>
                    <td>
                      {content(
                        trips.find((x) => x.id === r.tripId)?.title,
                        locale,
                      )}
                    </td>
                    <td className="num">{money(r.before as number, locale)}</td>
                    <td className="num strong">
                      {money(r.after as number, locale)}
                    </td>
                    <td className="num">
                      {Number(r.after) - Number(r.before) > 0 ? '+' : ''}
                      {money(Number(r.after) - Number(r.before), locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={reset}>
              {t('back')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !changed.length}
              onClick={async () => {
                if (
                  !(await confirm({
                    title: tp('updateNPricesTitle', changed.length),
                    body: t('bulkConfirmBody'),
                    confirmLabel: tp('updateNPrices', changed.length),
                  }))
                )
                  return;
                setBusy(true);
                try {
                  await save(
                    '/v1/admin/prices/bulk/apply',
                    'POST',
                    { token: preview.token, confirmLargeChange: true },
                    { success: tp('pricesUpdated', changed.length) },
                  );
                  onClose();
                } catch (e) {
                  report(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {tp('updateNPrices', changed.length)}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
