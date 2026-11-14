'use client';
import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { can } from '@stella/shared/admin';
import { useAdmin, ApiError } from '../lib/admin-context';
import type { Row } from '../lib/content';
import { dateTime } from '../lib/format';
import { describeChange } from '../lib/diff';
import { useConfirm } from './ui/dialog';
import { Skeleton } from './ui/states';

/**
 * Item history: revisions (restorable) joined with audit rows (human diff).
 * Both are written in the same transaction, so they share a timestamp.
 */
export function HistorySection({
  entities,
  id,
  auditEntity,
  restorable = true,
}: {
  entities: string[];
  id: string;
  auditEntity?: string;
  restorable?: boolean;
}) {
  const { t, locale, me, request, save, report } = useAdmin(),
    confirm = useConfirm(),
    [limit, setLimit] = useState(10),
    canAudit = can(me!.role, 'audit');
  const revisionQueries = useQueries({
    queries: entities.map((entity) => ({
      queryKey: [`/v1/admin/history?entity=${entity}&id=${id}`],
      queryFn: async () =>
        (
          await request<Row[]>(
            `/v1/admin/history?entity=${entity}&id=${id}`,
          ).catch(() => [] as Row[])
        ).map((row) => ({ ...row, entity }) as Row & { entity: string }),
    })),
  });
  const auditQuery = useQueries({
    queries: [
      {
        queryKey: [
          `/v1/admin/audit?entity=${auditEntity ?? entities[0]}&entityId=${id}`,
        ],
        queryFn: () =>
          request<Row[]>(
            `/v1/admin/audit?entity=${auditEntity ?? entities[0]}&entityId=${id}`,
          ),
        enabled: canAudit,
      },
    ],
  })[0]!;
  const loading = revisionQueries.some((q) => q.isPending);
  const entries = useMemo(() => {
    const audits = auditQuery.data ?? [];
    const second = (v: unknown) =>
      Math.floor(new Date(String(v)).getTime() / 1000);
    return revisionQueries
      .flatMap((q) => q.data ?? [])
      .map((revision) => {
        const audit = audits.find(
          (a) =>
            a.entity === revision.entity &&
            Math.abs(second(a.at) - second(revision.createdAt)) <= 1,
        );
        const lines = audit ? describeChange(audit, t, locale) : [];
        return { revision, audit, lines };
      })
      .filter((entry) => !canAudit || !entry.audit || entry.lines.length)
      .sort(
        (a, b) =>
          new Date(String(b.revision.createdAt)).getTime() -
          new Date(String(a.revision.createdAt)).getTime(),
      );
  }, [revisionQueries, auditQuery.data, t, locale, canAudit]);
  const restore = async (revision: Row) => {
    if (
      !(await confirm({
        title: t('restoreTitle', {
          date: dateTime(String(revision.createdAt), locale),
        }),
        body: t('restoreBody'),
        confirmLabel: t('restore'),
      }))
    )
      return;
    const path = '/v1/admin/revisions/' + revision.id + '/restore';
    try {
      await save(path, 'POST', {}, { success: t('versionRestored') });
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.code === 'PRICE_CONFIRMATION_REQUIRED'
      ) {
        if (
          await confirm({
            title: t('largePriceTitle'),
            body: t('confirmLarge'),
            confirmLabel: t('restore'),
          })
        )
          await save(
            path,
            'POST',
            { confirmLargeChange: true },
            {
              success: t('versionRestored'),
            },
          ).catch(report);
      } else report(error);
    }
  };
  if (loading) return <Skeleton rows={3} />;
  if (!entries.length) return <p className="muted">{t('noHistory')}</p>;
  return (
    <>
      <ol className="timeline">
        {entries.slice(0, limit).map(({ revision, lines }) => (
          <li key={revision.entity + revision.id}>
            <div className="timeline-main">
              <span className="strong">
                {String(revision.actorName ?? t('system'))}
              </span>
              <span>{lines.length ? lines.join(' · ') : t('diffUpdated')}</span>
              <time className="muted">
                {dateTime(String(revision.createdAt), locale)}
              </time>
            </div>
            {restorable && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void restore(revision)}
              >
                {t('restore')}
              </button>
            )}
          </li>
        ))}
      </ol>
      {entries.length > limit && (
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setLimit((v) => v + 20)}
        >
          {t('showMore')}
        </button>
      )}
    </>
  );
}
