'use client';
import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Toaster, toast } from 'sonner';
import * as Dialog from '@radix-ui/react-dialog';
import { locales, type Locale } from '@stella/shared';
import { PasswordInput } from '../components/password-input';
import { interpolate } from './format';
import {
  Context,
  ApiError,
  dictionaries,
  type Me,
  type SaveOptions,
} from './admin-context';

const TOAST_ID = 'stella-admin-toast';
export type UndoAfter = { message?: string; run?: () => unknown };
const errorKeys: Record<string, string> = {
  OFFLINE: 'offline',
  RATE_LIMITED: 'rate',
  FORBIDDEN: 'forbidden',
  DRAFT_ONLY: 'forbidden',
  INVALID_CREDENTIALS: 'invalidLogin',
  CONFLICT: 'errConflict',
  TRIP_NOT_PUBLISHED: 'errTripNotPublished',
  PRIVATE_TRIP_REQUIRED: 'errPrivateTrip',
  UNPUBLISH_PACKAGE_FIRST: 'errUnpublishFirst',
  MEDIA_NOT_PUBLISHABLE: 'errMediaRights',
  MEDIA_REQUIRED: 'errCoverRequired',
  TRIP_NOT_PUBLISHABLE: 'errNotPublishable',
  PACKAGE_NOT_PUBLISHABLE: 'errNotPublishable',
  HERO_LIMIT: 'limitSlides',
  LAST_OWNER: 'errLastOwner',
  SELF_CHANGE: 'errSelf',
  MEDIA_IN_USE: 'errMediaInUse',
  TRANSLATION_STALE: 'errTranslationStale',
  REQUEST_ANONYMIZED: 'errAnonymized',
  UPLOAD_TOO_LARGE: 'errTooLarge',
  UNSUPPORTED_MEDIA: 'errUnsupported',
  WEAK_PASSWORD: 'errWeakPassword',
  HEADLINE_REQUIRED: 'errHeadline',
  CATALOG_CHANGED: 'errCatalogChanged',
  INVALID_PACKAGE_PARTS: 'errPackageParts',
  PRICE_CONFIRMATION_REQUIRED: 'confirmLarge',
  PREVIEW_TOO_LARGE: 'bulkScopeLimit',
  PREVIEW_STALE: 'errCatalogChanged',
  PREVIEW_EXPIRED: 'errCatalogChanged',
  CORE_TRANSLATIONS_REQUIRED: 'coreTranslationsRequired',
  REPOSITORY_MANAGED_TRANSLATION: 'repositoryManaged',
};

export function Session({
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
    [online, setOnline] = useState(true),
    [reauth, setReauth] = useState(false),
    [busy, setBusy] = useState(false),
    [reauthError, setReauthError] = useState(''),
    [narrow, setNarrow] = useState(false);
  const resolver = useRef<((result: boolean) => void) | null>(null);
  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      interpolate(
        dictionaries[locale][key] ?? dictionaries.en[key] ?? key,
        vars,
      ),
    [locale],
  );
  const tp = useCallback(
    (key: string, n: number, vars?: Record<string, string | number>) => {
      const form = new Intl.PluralRules(locale).select(n),
        dict = dictionaries[locale];
      const text =
        dict[key + '.' + form] ??
        dict[key + '.other'] ??
        dictionaries.en[key + '.' + (n === 1 ? 'one' : 'other')] ??
        key;
      return interpolate(text, {
        n: new Intl.NumberFormat(locale).format(n),
        ...vars,
      });
    },
    [locale],
  );
  const clear = useCallback(() => {
    csrf.current = '';
    setMe(null);
    client.clear();
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
        // 403 on a protected action → ask for the password, then retry once.
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
  const errorText = useCallback(
    (error: unknown, fallback?: string) => {
      const code = error instanceof ApiError ? error.code : '';
      return errorKeys[code]
        ? t(errorKeys[code]!)
        : (fallback ?? t('errGeneric'));
    },
    [t],
  );
  const undoRef = useRef<(ids: string[], after?: UndoAfter) => Promise<void>>(
      async () => {},
    ),
    toastSeq = useRef(0);
  const notify = useCallback(
    (
      message: string,
      options?: {
        tone?: 'success' | 'error' | 'info';
        undo?: string[];
        afterUndo?: UndoAfter;
      },
    ) => {
      const tone = options?.tone ?? 'success',
        undoIds = options?.undo ?? [];
      const show =
        tone === 'error'
          ? toast.error
          : tone === 'info'
            ? toast.info
            : toast.success;
      // One toast at a time: close whatever is showing, then show the new one.
      toast.dismiss();
      show(message, {
        id: TOAST_ID + ++toastSeq.current,
        duration: undoIds.length ? 8000 : 5000,
        action: undoIds.length
          ? {
              label: t('undo'),
              onClick: () => void undoRef.current(undoIds, options?.afterUndo),
            }
          : undefined,
      });
    },
    [t],
  );
  const report = useCallback(
    (error: unknown, fallback?: string) =>
      notify(errorText(error, fallback), { tone: 'error' }),
    [notify, errorText],
  );
  const undoRevisions = useCallback(
    async (ids: string[], after?: UndoAfter) => {
      try {
        for (const id of [...ids].reverse())
          await request('/v1/admin/revisions/' + id + '/restore', 'POST', {});
        await after?.run?.();
        await client.invalidateQueries();
        notify(after?.message ?? t('undone'));
      } catch (error) {
        report(error);
      }
    },
    [request, client, notify, report, t],
  );
  undoRef.current = undoRevisions;
  const write = useCallback(
    <T,>(path: string, method: string, data: unknown) =>
      call<T>(path, method, data),
    [call],
  );
  const save = useCallback(
    async <T,>(
      path: string,
      method: string,
      data: unknown,
      options?: SaveOptions,
    ) => {
      const { value, revisions } = await call<T>(path, method, data);
      await client.invalidateQueries();
      const draft =
        !!value &&
        typeof value === 'object' &&
        (value as Record<string, unknown>).draft === true;
      if (options?.success !== false)
        notify(draft ? t('savedForReview') : (options?.success ?? t('saved')), {
          undo: options?.undo === false ? [] : revisions,
        });
      return value;
    },
    [call, client, t, notify],
  );
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
    const media = window.matchMedia('(max-width: 639px)'),
      size = () => setNarrow(media.matches);
    size();
    media.addEventListener('change', size);
    if ('serviceWorker' in navigator)
      void navigator.serviceWorker.register('/sw.js').catch(() => {});
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      media.removeEventListener('change', size);
    };
  }, [refresh]);
  const setLocale = (value: Locale) => {
    if (!locales.includes(value)) return;
    setLanguage(value);
    document.documentElement.lang = value;
    document.cookie = `stella_admin_locale=${value}; Path=/; SameSite=Strict; Max-Age=31536000${location.protocol === 'https:' ? '; Secure' : ''}`;
  };
  const closeReauth = () => {
    resolver.current?.(false);
    resolver.current = null;
    setReauth(false);
  };
  return (
    <Context.Provider
      value={{
        locale,
        setLocale,
        t,
        tp,
        me,
        loading,
        online,
        apiOrigin,
        webOrigin,
        request,
        save,
        write,
        notify,
        undoRevisions,
        refresh,
        clear,
        report,
        errorText,
      }}
    >
      {!online && (
        <div className="offline" role="alert">
          {t('offline')}
        </div>
      )}
      {children}
      <Toaster
        position={narrow ? 'bottom-center' : 'bottom-right'}
        visibleToasts={1}
        offset={24}
        mobileOffset={{ bottom: 88 }}
        closeButton
        containerAriaLabel={t('notifications')}
        toastOptions={{
          closeButtonAriaLabel: t('close'),
          classNames: {
            toast: 'admin-toast',
            closeButton: 'admin-toast-close',
            actionButton: 'admin-toast-action',
          },
        }}
      />
      <Dialog.Root
        open={reauth}
        onOpenChange={(open) => !open && closeReauth()}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="overlay" />
          <Dialog.Content className="dialog dialog-sm">
            <Dialog.Title className="dialog-title">{t('reauth')}</Dialog.Title>
            <Dialog.Description className="muted">
              {t('reauthHelp')}
            </Dialog.Description>
            <form
              noValidate
              onSubmit={async (event) => {
                event.preventDefault();
                if (busy) return;
                const fields = new FormData(event.currentTarget),
                  password = String(fields.get('password') ?? '');
                if (!password) {
                  setReauthError(t('passwordRequired'));
                  return;
                }
                setBusy(true);
                try {
                  await base('/v1/admin/auth/reauth', 'POST', { password });
                  setReauth(false);
                  resolver.current?.(true);
                  resolver.current = null;
                } catch (error) {
                  setReauthError(
                    error instanceof ApiError && error.code === 'RATE_LIMITED'
                      ? t('rate')
                      : t('wrongPassword'),
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="field">
                <label htmlFor="reauth-password">{t('password')}</label>
                <PasswordInput
                  id="reauth-password"
                  name="password"
                  autoComplete="current-password"
                  autoFocus
                />
              </div>
              {reauthError && (
                <p className="field-error" role="alert">
                  {reauthError}
                </p>
              )}
              <div className="dialog-actions">
                <Dialog.Close asChild>
                  <button type="button" className="btn">
                    {t('cancel')}
                  </button>
                </Dialog.Close>
                <button className="btn btn-primary" disabled={busy || !online}>
                  {busy && <span className="spinner" aria-hidden />}
                  {t('confirm')}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Context.Provider>
  );
}
