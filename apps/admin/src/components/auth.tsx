'use client';
import { useEffect, useState } from 'react';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@stella/shared/admin';
import { QRCodeSVG } from 'qrcode.react';
import { ApiError, useAdmin } from '../lib/admin-context';
import { LanguageSelect } from './language-select';
import { PasswordInput } from './password-input';
export function Auth() {
  const { me, request, refresh, t, online } = useAdmin(),
    path = usePathname(),
    query = useSearchParams(),
    router = useRouter();
  const [token] = useState(() => query.get('token') ?? ''),
    [mode, setMode] = useState<
      'login' | 'forgot' | 'token' | 'verify' | 'enroll' | 'codes'
    >(
      token
        ? 'token'
        : me && !me.mfa_passed
          ? me.totp_enabled
            ? 'verify'
            : 'enroll'
          : 'login',
    ),
    [uri, setUri] = useState(''),
    [codes, setCodes] = useState<string[]>([]),
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
      // went wrong: a blocked or failed request is not a wrong password, and
      // the login form has no code field.
      const code = error instanceof ApiError ? error.code : 'NETWORK';
      setError(
        t(
          {
            INVALID_CREDENTIALS: 'loginIncorrect',
            INVALID_INPUT: 'loginIncorrect',
            INVALID_CODE: 'codeIncorrect',
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
  async function enroll() {
    await execute(async () => {
      const result = await request<{ uri: string }>(
        '/v1/admin/auth/2fa/setup',
        'POST',
        {},
      );
      setUri(result.uri);
      setMode('enroll');
    });
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
        <h2>
          {t(
            mode === 'login'
              ? 'login'
              : mode === 'forgot' || mode === 'token'
                ? 'reset'
                : mode === 'codes'
                  ? 'recovery'
                  : 'mfa',
          )}
        </h2>
        {mode === 'login' ? (
          <form
            onSubmit={form.handleSubmit(async (values) =>
              execute(async () => {
                const result = await request<{
                  mfa_required: boolean;
                  enrollment_required: boolean;
                }>('/v1/admin/auth/login', 'POST', values);
                form.reset();
                if (result.enrollment_required) {
                  await enroll();
                } else if (result.mfa_required) setMode('verify');
                else {
                  await refresh();
                  router.replace('/');
                }
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
        ) : mode === 'codes' ? (
          <>
            <p>{t('recovery')}</p>
            <ul className="recovery-codes">
              {codes.map((code) => (
                <li key={code}>
                  <code>{code}</code>
                </li>
              ))}
            </ul>
            <button
              onClick={async () => {
                setCodes([]);
                await refresh();
                router.replace('/');
              }}
            >
              {t('savedCodes')}
            </button>
          </>
        ) : mode === 'enroll' && !uri ? (
          <button disabled={busy || !online} onClick={() => void enroll()}>
            {t('setup')}
          </button>
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
                } else if (mode === 'token') {
                  await request(
                    '/v1/admin/auth/password/' +
                      (path.includes('setup') ? 'setup' : 'reset'),
                    'POST',
                    { token, password: String(data.get('password')) },
                  );
                  setMode('login');
                } else {
                  const result = await request<{ recovery_codes?: string[] }>(
                    '/v1/admin/auth/2fa/' +
                      (mode === 'enroll' ? 'enable' : 'verify'),
                    'POST',
                    { code: String(data.get('code')) },
                  );
                  if (result.recovery_codes) {
                    setUri('');
                    setCodes(result.recovery_codes);
                    setMode('codes');
                  } else {
                    await refresh();
                    router.replace('/');
                  }
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
            ) : mode === 'token' ? (
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
            ) : (
              <>
                {uri && (
                  <div className="qr">
                    <p>{t('scan')}</p>
                    <QRCodeSVG
                      value={uri}
                      size={200}
                      role="img"
                      aria-label={t('mfa')}
                    />
                    <code>{new URL(uri).searchParams.get('secret')}</code>
                  </div>
                )}
                <label>
                  {t('code')}
                  <input
                    name="code"
                    autoComplete="one-time-code"
                    minLength={6}
                    maxLength={64}
                    required
                  />
                </label>
              </>
            )}
            <button disabled={busy || !online}>
              {t(
                mode === 'forgot'
                  ? 'reset'
                  : mode === 'token'
                    ? 'save'
                    : 'verify',
              )}
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
