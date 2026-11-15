'use client';
import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * List filters kept in the address bar, so Back/refresh and shared links keep
 * them. Empty values (or the default) are removed from the URL.
 */
export function useUrlState<K extends string>(defaults: Record<K, string>) {
  const params = useSearchParams(),
    router = useRouter(),
    path = usePathname();
  const values = Object.fromEntries(
    (Object.keys(defaults) as K[]).map((key) => [
      key,
      params.get(key) ?? defaults[key],
    ]),
  ) as Record<K, string>;
  const set = useCallback(
    (patch: Partial<Record<K, string>>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch) as [K, string][]) {
        if (value === undefined || value === '' || value === defaults[key])
          next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      router.replace(path + (query ? '?' + query : ''), { scroll: false });
    },
    [params, path, router],
  );
  return [values, set] as const;
}
