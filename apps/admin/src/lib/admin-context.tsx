'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import type { Role } from '@stella/shared/admin';
import type { Locale } from '@stella/shared';
import en from '../../messages/en.json';
import it from '../../messages/it.json';
import es from '../../messages/es.json';
import fr from '../../messages/fr.json';
import de from '../../messages/de.json';
import ru from '../../messages/ru.json';
import tr from '../../messages/tr.json';
import { Session } from './session';
export const dictionaries: Record<Locale, Record<string, string>> = {
  en,
  it,
  es,
  fr,
  de,
  ru,
  tr,
};
export type Me = {
  id: string;
  email: string;
  name: string;
  role: Role;
  csrf_token: string;
};
export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}
export type SaveOptions = {
  /** Toast text naming the action ("Trip unpublished"); false = no toast. */
  success?: string | false;
  /** Offer Undo in the toast when the API returned revision ids (default true). */
  undo?: boolean;
};
type ContextValue = {
  locale: Locale;
  setLocale: (v: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  tp: (
    key: string,
    n: number,
    vars?: Record<string, string | number>,
  ) => string;
  me: Me | null;
  loading: boolean;
  online: boolean;
  apiOrigin: string;
  webOrigin: string;
  request: <T = unknown>(
    path: string,
    method?: string,
    data?: unknown,
  ) => Promise<T>;
  save: <T = unknown>(
    path: string,
    method: string,
    data: unknown,
    options?: SaveOptions,
  ) => Promise<T>;
  /** Like save() but returns revision ids instead of toasting (batch saves). */
  write: <T = unknown>(
    path: string,
    method: string,
    data: unknown,
  ) => Promise<{ value: T; revisions: string[] }>;
  notify: (
    message: string,
    options?: {
      tone?: 'success' | 'error' | 'info';
      undo?: string[];
      afterUndo?: { message?: string; run?: () => unknown };
    },
  ) => void;
  undoRevisions: (
    ids: string[],
    after?: { message?: string; run?: () => unknown },
  ) => Promise<void>;
  refresh: () => Promise<void>;
  clear: () => void;
  report: (error: unknown, fallback?: string) => void;
  errorText: (error: unknown, fallback?: string) => string;
};
export const Context = createContext<ContextValue | null>(null);
export function useAdmin() {
  const context = useContext(Context);
  if (!context) throw new Error('Missing admin provider');
  return context;
}
export function useData<T>(path: string, enabled = true, interval?: number) {
  const { request } = useAdmin();
  return useQuery({
    queryKey: [path],
    queryFn: () => request<T>(path),
    enabled,
    refetchInterval: interval ?? false,
  });
}
export function Provider({
  children,
  apiOrigin,
  webOrigin,
  initialLocale,
}: {
  children: ReactNode;
  apiOrigin: string;
  webOrigin: string;
  initialLocale: Locale;
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            gcTime: 0,
            staleTime: 10000,
            refetchOnWindowFocus: true,
          },
          mutations: { retry: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <Session
        apiOrigin={apiOrigin}
        webOrigin={webOrigin}
        initialLocale={initialLocale}
      >
        {children}
      </Session>
    </QueryClientProvider>
  );
}
