'use client';
import {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Toaster, toast } from 'sonner';
import * as Dialog from '@radix-ui/react-dialog';
import type { Role } from '@stella/shared/admin';
import { locales, type Locale } from '@stella/shared';
import en from '../../messages/en.json';
import it from '../../messages/it.json';
import es from '../../messages/es.json';
import fr from '../../messages/fr.json';
import de from '../../messages/de.json';
import ru from '../../messages/ru.json';
import tr from '../../messages/tr.json';
import { PasswordInput } from '../components/password-input';
const dictionaries: Record<Locale, Record<string, string>> = {
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
  mfa_passed: boolean;
  totp_enabled: boolean;
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
type ContextValue = {
  locale: Locale;
  setLocale: (v: Locale) => void;
  t: (key: string) => string;
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
  ) => Promise<T>;
  refresh: () => Promise<void>;
  clear: () => void;
  report: (error: unknown) => void;
  undo: (() => Promise<void>) | null;
};
const Context = createContext<ContextValue | null>(null);
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
function Session({
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
  const client = useQueryClient(),
    csrf = useRef(''),
    [locale, setLanguage] = useState(initialLocale),
    [me, setMe] = useState<Me | null>(null),
    [loading, setLoading] = useState(true),
    [lastUndo, setLastUndo] = useState<{
      ids: string[];
      expires: number;
    } | null>(null),
    [online, setOnline] = useState(true),
    [reauth, setReauth] = useState(false),
    [busy, setBusy] = useState(false),
    [reauthError, setReauthError] = useState('');
  const resolver = useRef<((result: boolean) => void) | null>(null);
  const t = useCallback(
    (key: string) => dictionaries[locale][key] ?? dictionaries[locale].error!,
    [locale],
  );
  const clear = useCallback(() => {
    csrf.current = '';
    setMe(null);
    client.clear();
    setLastUndo(null);
  }, [client]);
  const base = useCallback(
    async <T,>(
      path: string,
      method = 'GET',
      data?: unknown,
    ): Promise<{ value: T; revisions: string[] }> => {
      if (!path.startsWith('/v1/admin/') || path.includes('://'))
        throw new ApiError('INVALID_PATH', 400);
      if (method !== 'GET' && !navigator.onLine)
        throw new ApiError('OFFLINE', 0);
      const response = await fetch(apiOrigin + path, {
        method,
        credentials: 'include',
        cache: 'no-store',
        headers: {
          ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(method === 'GET' ? {} : { 'X-CSRF-Token': csrf.current }),
        },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      });
      const value = response.headers
        .get('content-type')
        ?.includes('application/json')
        ? await response.json().catch(() => ({}))
        : await response.blob();
      if (!response.ok) {
        if (value.error?.code === 'UNAUTHENTICATED') clear();
        throw new ApiError(value.error?.code ?? 'ERROR', response.status);
      }
      if (typeof value.csrf_token === 'string') csrf.current = value.csrf_token;
      return {
        value: value as T,
        revisions: (response.headers.get('X-Stella-Revisions') ?? '')
          .split(',')
          .filter((v) => /^\d+$/.test(v)),
      };
    },
    [apiOrigin, clear],
  );
  const confirmIdentity = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        if (resolver.current) {
          resolve(false);
          return;
        }
        resolver.current = resolve;
        setReauthError('');
        setReauth(true);
      }),
    [],
  );
  const call = useCallback(
    async <T,>(path: string, method = 'GET', data?: unknown) => {
      try {
        return await base<T>(path, method, data);
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.code === 'REAUTH_REQUIRED' &&
          (await confirmIdentity())
        )
          return base<T>(path, method, data);
        throw error;
      }
    },
    [base, confirmIdentity],
  );
  const request = useCallback(
    async <T,>(path: string, method = 'GET', data?: unknown) =>
      (await call<T>(path, method, data)).value,
    [call],
  );
  const report = useCallback(
    (error: unknown) => {
      const code = error instanceof ApiError ? error.code : '';
      toast.error(
        t(
          code === 'OFFLINE'
            ? 'offline'
            : code === 'RATE_LIMITED'
              ? 'rate'
              : code === 'FORBIDDEN'
                ? 'forbidden'
                : ['INVALID_CODE', 'INVALID_CREDENTIALS'].includes(code)
                  ? 'invalidLogin'
                  : 'error',
        ),
      );
    },
    [t],
  );
  const save = useCallback(
    async <T,>(path: string, method: string, data: unknown) => {
      const body =
        data && typeof data === 'object'
          ? (data as Record<string, unknown>)
          : {};
      const snapshots = client.getQueriesData({
        predicate: (query) =>
          typeof query.queryKey[0] === 'string' &&
          (String(query.queryKey[0]).startsWith('/v1/admin/requests?') ||
            query.queryKey[0] === '/v1/admin/price-list'),
      });
      const requestId = path.match(/^\/v1\/admin\/requests\/([^/]+)$/)?.[1],
        tripId = path.match(/^\/v1\/admin\/trips\/([^/]+)\/prices$/)?.[1];
      if (requestId && method === 'PATCH' && body.status)
        for (const [key, previous] of snapshots)
          if (
            String(key[0]).startsWith('/v1/admin/requests?') &&
            Array.isArray(previous)
          )
            client.setQueryData(
              key,
              previous.map((row) =>
                row.id === requestId ? { ...row, status: body.status } : row,
              ),
            );
      if (tripId && method === 'PUT')
        client.setQueryData(['/v1/admin/price-list'], (previous: unknown) =>
          Array.isArray(previous)
            ? previous.map((row) =>
                row.id === tripId ? { ...row, rows: body.rows } : row,
              )
            : previous,
        );
      let result;
      try {
        result = await call<T>(path, method, data);
      } catch (error) {
        for (const [key, previous] of snapshots)
          client.setQueryData(key, previous);
        throw error;
      }
      const { value, revisions } = result;
      setLastUndo(
        revisions.length
          ? { ids: [...revisions], expires: Date.now() + 10000 }
          : null,
      );
      await client.invalidateQueries();
      const draft =
        value &&
        typeof value === 'object' &&
        ((value as Record<string, unknown>).draft === true ||
          (value as Record<string, unknown>).published === false);
      toast.success(t(draft ? 'draft' : 'saved'), {
        duration: 10000,
        ...(revisions.length
          ? {
              action: {
                label: t('undo'),
                onClick: () => {
                  void (async () => {
                    try {
                      for (const id of revisions.reverse())
                        await request(
                          '/v1/admin/revisions/' + id + '/restore',
                          'POST',
                          {},
                        );
                      await client.invalidateQueries();
                      toast.success(t('saved'));
                    } catch (error) {
                      report(error);
                    }
                  })();
                },
              },
            }
          : {}),
      });
      return value;
    },
    [call, client, t, request, report],
  );
  useEffect(() => {
    if (!lastUndo) return;
    const timer = setTimeout(
      () => setLastUndo(null),
      Math.max(0, lastUndo.expires - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [lastUndo]);
  const undo = lastUndo
    ? async () => {
        const ids = [...lastUndo.ids].reverse();
        setLastUndo(null);
        try {
          for (const id of ids)
            await request('/v1/admin/revisions/' + id + '/restore', 'POST', {});
          await client.invalidateQueries();
          toast.success(t('saved'));
        } catch (error) {
          report(error);
        }
      }
    : null;
  const refresh = useCallback(async () => {
    try {
      const result = await base<Me>('/v1/admin/me');
      setMe(result.value);
    } catch {
      clear();
    } finally {
      setLoading(false);
    }
  }, [base, clear]);
  useEffect(() => {
    void refresh();
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    if ('serviceWorker' in navigator)
      void navigator.serviceWorker.register('/sw.js').catch(() => {});
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [refresh]);
  const setLocale = (value: Locale) => {
    if (!locales.includes(value)) return;
    setLanguage(value);
    document.documentElement.lang = value;
    document.cookie = `stella_admin_locale=${value}; Path=/; SameSite=Strict; Max-Age=31536000${location.protocol === 'https:' ? '; Secure' : ''}`;
  };
  return (
    <Context.Provider
      value={{
        locale,
        setLocale,
        t,
        me,
        loading,
        online,
        apiOrigin,
        webOrigin,
        request,
        save,
        refresh,
        clear,
        report,
        undo,
      }}
    >
      {!online && (
        <div className="offline" role="alert">
          {t('offline')}
        </div>
      )}
      {children}
      <Toaster
        richColors
        position="top-center"
        closeButton
        containerAriaLabel={t('notifications')}
        toastOptions={{
          closeButtonAriaLabel: t('close'),
          classNames: { closeButton: 'admin-toast-close' },
        }}
      />
      <Dialog.Root
        open={reauth}
        onOpenChange={(open) => {
          if (!open) {
            resolver.current?.(false);
            resolver.current = null;
            setReauth(false);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="overlay" />
          <Dialog.Content className="sheet compact">
            <Dialog.Title>{t('reauth')}</Dialog.Title>
            <Dialog.Description>{t('mfa')}</Dialog.Description>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                setBusy(true);
                const fields = new FormData(event.currentTarget);
                try {
                  await base('/v1/admin/auth/reauth', 'POST', {
                    password: String(fields.get('password')),
                    code: String(fields.get('code')) || undefined,
                  });
                  setReauth(false);
                  resolver.current?.(true);
                  resolver.current = null;
                } catch {
                  setReauthError(t('invalidLogin'));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                {t('password')}
                <PasswordInput
                  name="password"
                  autoComplete="current-password"
                  required
                />
              </label>
              {me?.totp_enabled && (
                <label>
                  {t('code')}
                  <input name="code" autoComplete="one-time-code" required />
                </label>
              )}
              {reauthError && <p role="alert">{reauthError}</p>}
              <button disabled={busy || !online}>{t('confirm')}</button>
              <Dialog.Close asChild>
                <button type="button" className="secondary">
                  {t('cancel')}
                </button>
              </Dialog.Close>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Context.Provider>
  );
}
