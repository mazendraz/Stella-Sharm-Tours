'use client';
import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAdmin } from './admin-context';
import { useGuard } from './guard';

/** Shared actions for trips and packages (list rows and editor header). */
export function useTripActions(kind: 'trip' | 'package') {
  const { t, save, write, notify, report } = useAdmin(),
    client = useQueryClient(),
    { navigate } = useGuard(),
    base = kind === 'package' ? '/packages/' : '/trips/';
  const published =
    kind === 'package' ? 'packageUnpublished' : 'tripUnpublished';
  return {
    publish: (id: string) =>
      save(
        '/v1/admin/trips/' + id + '/publish',
        'POST',
        {},
        {
          success: t(kind === 'package' ? 'packagePublished' : 'tripPublished'),
        },
      ),
    unpublish: (id: string) =>
      save(
        '/v1/admin/trips/' + id + '/unpublish',
        'POST',
        {},
        { success: t(published) },
      ),
    archive: async (id: string, after?: () => void) => {
      await save(
        '/v1/admin/trips/' + id + '/archive',
        'POST',
        {},
        {
          success: t(kind === 'package' ? 'packageArchived' : 'tripArchived'),
        },
      );
      after?.();
    },
    unarchive: (id: string) =>
      save(
        '/v1/admin/trips/' + id + '/unarchive',
        'POST',
        {},
        { success: t('restoredItem') },
      ),
    duplicate: async (id: string) => {
      try {
        const { value, revisions } = await write<{ id: string }>(
          '/v1/admin/trips/' + id + '/duplicate',
          'POST',
          {},
        );
        await client.invalidateQueries();
        await navigate(base + value.id);
        // Undo restores the duplicate's "archived" snapshot → the copy is archived.
        notify(t('duplicatedEditing'), {
          undo: revisions,
          // Undo archives the copy: go back to the original.
          afterUndo: {
            message: t('copyRemoved'),
            run: () => navigate(base + id, { replace: true }),
          },
        });
      } catch (error) {
        report(error);
      }
    },
  };
}

/**
 * List reorder that saves immediately but debounced: five quick moves send one
 * request and show one "Order updated" toast with Undo.
 */
export function useDebouncedReorder(path: string, delay = 700) {
  const { t, write, notify, report } = useAdmin(),
    client = useQueryClient(),
    timer = useRef<ReturnType<typeof setTimeout>>(undefined),
    pending = useRef<string[] | null>(null);
  const flush = useCallback(async () => {
    const ids = pending.current;
    pending.current = null;
    if (!ids) return;
    try {
      const { revisions } = await write(path, 'POST', { ids });
      await client.invalidateQueries();
      notify(t('orderUpdated'), { undo: revisions });
    } catch (error) {
      report(error);
      await client.invalidateQueries();
    }
  }, [path, write, client, notify, report, t]);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      void flush();
    },
    [flush],
  );
  return useCallback(
    (ids: string[]) => {
      pending.current = ids;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [flush, delay],
  );
}
