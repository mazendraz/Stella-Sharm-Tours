'use client';
import { useQuery } from '@tanstack/react-query';
import { useAdmin } from './admin-context';
import type { Row } from './content';
/** Selectors need the complete authorized library, not just its first 60 items. */
export function useMediaOptions() {
  const { request } = useAdmin();
  return useQuery({
    queryKey: ['admin-media-options'],
    queryFn: async () => {
      const result: Row[] = [];
      for (let page = 1; page <= 10000; page++) {
        const batch = await request<Row[]>('/v1/admin/media?page=' + page);
        result.push(...batch);
        if (batch.length < 60) return result;
      }
      throw new Error('Media pagination range exhausted');
    },
    staleTime: 10000,
  });
}
