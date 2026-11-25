'use client';
import { useEffect, useState } from 'react';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@stella/shared/admin';
import { ApiError, useAdmin } from '../lib/admin-context';
import { LanguageSelect } from './language-select';
import { PasswordInput } from './password-input';
export function Auth() {
  const { request, refresh, t, online } = useAdmin(),
    path = usePathname(),
    query = useSearchParams(),
    router = useRouter();
  const [token] = useState(() => query.get('token') ?? ''),
    [mode, setMode] = useState<'login' | 'forgot' | 'token'>(
      token ? 'token' : 'login',
    ),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  useEffect(() => {
    if (token) window.history.replaceState(null, '', path);
  }, [token, path]);
  async function execute(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (error) {
      // Shown inline (role=alert) only, no duplicate toast. Say what actually
      // went wrong: a blocked or failed request is not a wrong password.
      const code = error instanceof ApiError ? error.code : 'NETWORK';
      setError(
        t(
          {
            INVALID_CREDENTIALS: 'loginIncorrect',
            INVALID_INPUT: 'loginIncorrect',
            INVALID_TOKEN: 'linkExpired',
            WEAK_PASSWORD: 'errWeakPassword',
            RATE_LIMITED: 'rate',
            NETWORK: 'serverUnreachable',
            OFFLINE: 'serverUnreachable',
          }[code] ?? 'errGeneric',
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-layout">
      <aside className="auth-brand">
        <a href="/" className="wordmark">
          <img
            className="brand-logo"
            src="/brand/logo.webp"
            alt="Stella Sharm Tours"
            width={415}
            height={360}
          />
        </a>
        <h1>{t('welcome')}</h1>
        <div className="sun" aria-hidden="true" />
      </aside>
      <section className="auth-card">
        <LanguageSelect />
        <p className="eyebrow">{t('dashboard')}</p>
        <h2>{t(mode === 'login' ? 'login' : 'reset')}</h2>
        {mode === 'login' ? (
          <form
            onSubmit={form.handleSubmit(async (values) =>
              execute(async () => {
                await request('/v1/admin/auth/login', 'POST', values);
                form.reset();
                await refresh();
                router.replace('/');
              }),
            )}
          >
            <label>
              {t('email')}
              <input
                type="email"
                autoComplete="username"
                {...form.register('email')}
              />
            </label>
            <label>
              {t('password')}
              <PasswordInput
                autoComplete="current-password"
                {...form.register('password')}
              />
            </label>
            {(error || Object.keys(form.formState.errors).length > 0) && (
              <p role="alert">{error || t('loginIncorrect')}</p>
            )}
            <button disabled={busy || !online}>{t('login')}</button>
            <button
              type="button"
              className="link-button"
              onClick={() => setMode('forgot')}
            >
              {t('forgot')}
            </button>
          </form>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void execute(async () => {
                if (mode === 'forgot') {
                  await request(
                    '/v1/admin/auth/password/reset-request',
                    'POST',
                    { email: String(data.get('email')) },
                  );
                  setNotice(t('resetSent'));
                } else {
                  await request(
                    '/v1/admin/auth/password/' +
                      (path.includes('setup') ? 'setup' : 'reset'),
                    'POST',
                    { token, password: String(data.get('password')) },
                  );
                  setMode('login');
                }
              });
            }}
          >
            {mode === 'forgot' ? (
              <label>
                {t('email')}
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                />
              </label>
            ) : (
              <label>
                {t('newPassword')}
                <PasswordInput
                  name="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={256}
                  required
                />
              </label>
            )}
            <button disabled={busy || !online}>
              {t(mode === 'forgot' ? 'reset' : 'save')}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setMode('login')}
            >
              {t('cancel')}
            </button>
          </form>
        )}
        {error && mode !== 'login' && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
      </section>
    </main>
  );
}
