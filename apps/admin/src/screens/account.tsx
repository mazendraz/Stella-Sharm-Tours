'use client';
import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { can } from '@stella/shared/admin';
import { useAdmin, useData, ApiError } from '../lib/admin-context';
import type { Row } from '../lib/content';
import { dateTime, relative } from '../lib/format';
import { PageHeader } from '../components/ui/page-header';
import { FormField } from '../components/ui/field';
import { useConfirm } from '../components/ui/dialog';
import { Callout, Skeleton } from '../components/ui/states';
import { PasswordInput } from '../components/password-input';
import { deviceName } from './team';

export function Account() {
  const { t, me } = useAdmin();
  return (
    <div className="page narrow">
      <PageHeader title={t('account')} />
      <section className="panel" aria-labelledby="profile-h">
        <h2 id="profile-h">{t('profile')}</h2>
        <NameForm />
        <dl className="kv">
          <div>
            <dt>{t('email')}</dt>
            <dd>{me!.email}</dd>
          </div>
          <div>
            <dt>{t('role')}</dt>
            <dd>
              {t(me!.role)} —{' '}
              <span className="muted">{t('roleDesc_' + me!.role)}</span>
            </dd>
          </div>
        </dl>
      </section>
      <PasswordSection />
      <TwoStepSection />
      <SessionsSection />
      {can(me!.role, 'requests') && <PushSection />}
    </div>
  );
}

function PasswordSection() {
  const { t, me, request, clear, report, errorText } = useAdmin(),
    [current, setCurrent] = useState(''),
    [next, setNext] = useState(''),
    [repeat, setRepeat] = useState(''),
    [code, setCode] = useState(''),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false);
  return (
    <section className="panel" aria-labelledby="pw-h">
      <h2 id="pw-h">{t('password')}</h2>
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const found: Record<string, string> = {};
          if (!current) found.current = t('passwordRequired');
          if (next.length < 12) found.next = t('passwordRule');
          if (next !== repeat) found.repeat = t('passwordsDiffer');
          if (me!.totp_enabled && !code.trim()) found.code = t('requiredField');
          setErrors(found);
          if (Object.keys(found).length) return;
          setBusy(true);
          try {
            try {
              await request('/v1/admin/auth/reauth', 'POST', {
                password: current,
                ...(me!.totp_enabled ? { code: code.replace(/\s/g, '') } : {}),
              });
            } catch (error) {
              setErrors({
                current:
                  error instanceof ApiError && error.code === 'RATE_LIMITED'
                    ? t('rate')
                    : t(
                        me!.totp_enabled
                          ? 'wrongPasswordOrCode'
                          : 'wrongPassword',
                      ),
              });
              return;
            }
            await request('/v1/admin/auth/password/change', 'POST', {
              password: next,
            });
            clear();
          } catch (error) {
            if (error instanceof ApiError && error.code === 'WEAK_PASSWORD')
              setErrors({ next: errorText(error) });
            else report(error);
          } finally {
            setBusy(false);
          }
        }}
      >
        <FormField label={t('currentPassword')} error={errors.current}>
          {(p) => (
            <PasswordInput
              {...p}
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          )}
        </FormField>
        {me!.totp_enabled && (
          <FormField label={t('code6')} error={errors.code}>
            {(p) => (
              <input
                {...p}
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                maxLength={64}
                onChange={(e) => setCode(e.target.value)}
              />
            )}
          </FormField>
        )}
        <FormField
          label={t('newPasswordLabel')}
          hint={t('passwordRule')}
          error={errors.next}
        >
          {(p) => (
            <PasswordInput
              {...p}
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          )}
        </FormField>
        <FormField label={t('confirmNewPassword')} error={errors.repeat}>
          {(p) => (
            <PasswordInput
              {...p}
              autoComplete="new-password"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            />
          )}
        </FormField>
        <p className="field-hint">{t('passwordSignsOut')}</p>
        <button className="btn btn-primary" disabled={busy}>
          {busy && <span className="spinner" aria-hidden />}
          {t('updatePassword')}
        </button>
      </form>
    </section>
  );
}

function TwoStepSection() {
  const { t, me, request, refresh, report } = useAdmin(),
    [uri, setUri] = useState(''),
    [code, setCode] = useState(''),
    [codes, setCodes] = useState<string[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    inFlight = useRef(false);
  const secret = uri ? (new URL(uri).searchParams.get('secret') ?? '') : '';
  return (
    <section className="panel" aria-labelledby="mfa-h">
      <h2 id="mfa-h">{t('mfa')}</h2>
      <p>
        <span
          className={'badge-status ' + (me!.totp_enabled ? 'green' : 'amber')}
        >
          <span className="dot" aria-hidden />
          {t(me!.totp_enabled ? 'twoStepOnShort' : 'twoStepOffShort')}
        </span>
      </p>
      {!me!.totp_enabled && !uri && (
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={async () => {
            // One request per click, even on double-clicks (was firing 4×).
            if (inFlight.current) return;
            inFlight.current = true;
            setBusy(true);
            try {
              const result = await request<{ uri: string }>(
                '/v1/admin/auth/2fa/setup',
                'POST',
                {},
              );
              setUri(result.uri);
            } catch (e) {
              report(e);
            } finally {
              inFlight.current = false;
              setBusy(false);
            }
          }}
        >
          {busy && <span className="spinner" aria-hidden />}
          {t('setup2fa')}
        </button>
      )}
      {uri && (
        <form
          noValidate
          className="mfa-setup"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            if (!/^\d{6}$/.test(code.trim())) {
              setError(t('code6Invalid'));
              return;
            }
            setBusy(true);
            try {
              const result = await request<{ recovery_codes: string[] }>(
                '/v1/admin/auth/2fa/enable',
                'POST',
                { code: code.trim() },
              );
              setUri('');
              setCodes(result.recovery_codes);
              await refresh();
            } catch {
              setError(t('code6Wrong'));
            } finally {
              setBusy(false);
            }
          }}
        >
          <ol className="steps">
            <li>{t('scan')}</li>
            <li>{t('enterCode')}</li>
          </ol>
          <div className="qr-box">
            <QRCodeSVG value={uri} size={180} aria-label={t('qrLabel')} />
            <p className="muted small">
              {t('cantScan')} <code className="mono">{secret}</code>
            </p>
          </div>
          <FormField label={t('code6')} error={error}>
            {(p) => (
              <input
                {...p}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            )}
          </FormField>
          <button className="btn btn-primary" disabled={busy}>
            {busy && <span className="spinner" aria-hidden />}
            {t('verify')}
          </button>
        </form>
      )}
      {codes.length > 0 && (
        <Callout
          tone="success"
          action={
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setCodes([])}
            >
              {t('savedCodes')}
            </button>
          }
        >
          <p>{t('recovery')}</p>
          <ul className="recovery-codes">
            {codes.map((c) => (
              <li key={c}>
                <code>{c}</code>
              </li>
            ))}
          </ul>
        </Callout>
      )}
    </section>
  );
}

function SessionsSection() {
  const { t, locale, request, refresh, report, notify } = useAdmin(),
    sessions = useData<Row[]>('/v1/admin/me/sessions'),
    confirm = useConfirm();
  const others = (sessions.data ?? []).filter((s) => !s.current);
  return (
    <section className="panel" aria-labelledby="sessions-h">
      <div className="panel-head">
        <h2 id="sessions-h">{t('sessions')}</h2>
        {others.length > 0 && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={async () => {
              if (
                !(await confirm({
                  title: t('signOutOthersTitle'),
                  body: t('signOutOthersBody'),
                  confirmLabel: t('signOutOthers'),
                }))
              )
                return;
              try {
                for (const s of others)
                  await request('/v1/admin/me/sessions/' + s.id, 'DELETE', {});
                await sessions.refetch();
                notify(t('signedOutOthers'));
              } catch (error) {
                report(error);
              }
            }}
          >
            {t('signOutOthers')}
          </button>
        )}
      </div>
      {sessions.isPending ? (
        <Skeleton rows={2} />
      ) : (
        <ul className="simple-list">
          {(sessions.data ?? []).map((s) => (
            <li key={s.id} className="simple-row static">
              <span className="simple-main">
                <span className="session-name">
                  <span className="strong">{deviceName(s.user_agent, t)}</span>
                  {s.current ? (
                    <span className="badge-status green">
                      {t('thisDevice')}
                    </span>
                  ) : null}
                </span>
                <span className="muted">
                  {t('lastActive', {
                    when: relative(String(s.last_seen_at), locale),
                  })}{' '}
                  ·{' '}
                  {t('signedInAt', {
                    when: dateTime(String(s.created_at), locale),
                  })}
                </span>
              </span>
              {!s.current && (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={async () => {
                    try {
                      await request(
                        '/v1/admin/me/sessions/' + s.id,
                        'DELETE',
                        {},
                      );
                      await sessions.refetch();
                      await refresh();
                      notify(t('sessionSignedOut'));
                    } catch (error) {
                      report(error);
                    }
                  }}
                >
                  {t('logout')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PushSection() {
  const { t, request, report, locale, notify } = useAdmin(),
    query = useData<{ publicKey: string | null }>('/v1/admin/push/key'),
    [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(false),
    supported =
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window;
  useEffect(() => {
    if (!query.data?.publicKey || !supported) return;
    let active = true;
    void navigator.serviceWorker.ready
      .then((r) => r.pushManager.getSubscription())
      .then((s) => active && setEnabled(Boolean(s)))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [query.data?.publicKey, supported]);
  if (query.isPending) return null;
  return (
    <section className="panel" aria-labelledby="push-h">
      <h2 id="push-h">{t('notify')}</h2>
      {!query.data?.publicKey || !supported ? (
        <p className="muted">{t('pushUnavailable')}</p>
      ) : (
        <>
          <p className="muted">{t('pushHint')}</p>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const registration = await navigator.serviceWorker.ready;
                if (enabled) {
                  const sub = await registration.pushManager.getSubscription();
                  if (sub) {
                    await request('/v1/admin/push/subscriptions', 'DELETE', {
                      endpoint: sub.endpoint,
                    });
                    await sub.unsubscribe();
                  }
                  setEnabled(false);
                  notify(t('pushOff'));
                  return;
                }
                if ((await Notification.requestPermission()) !== 'granted') {
                  notify(t('pushDenied'), { tone: 'error' });
                  return;
                }
                const key = Uint8Array.from(
                  atob(
                    query
                      .data!.publicKey!.replace(/-/g, '+')
                      .replace(/_/g, '/'),
                  ),
                  (c) => c.charCodeAt(0),
                );
                const sub = await registration.pushManager.subscribe({
                  userVisibleOnly: true,
                  applicationServerKey: key,
                });
                await request('/v1/admin/push/subscriptions', 'POST', {
                  ...sub.toJSON(),
                  locale,
                });
                setEnabled(true);
                notify(t('pushOn'));
              } catch (error) {
                report(error);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t(enabled ? 'pushTurnOff' : 'pushTurnOn')}
          </button>
        </>
      )}
    </section>
  );
}

function NameForm() {
  const { t, me, request, refresh, notify, report } = useAdmin(),
    [name, setName] = useState(me!.name),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    changed = name.trim() !== me!.name;
  return (
    <form
      noValidate
      className="inline-add"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) {
          setError(t('requiredField'));
          return;
        }
        if (!changed || busy) return;
        setBusy(true);
        try {
          await request('/v1/admin/me', 'PATCH', { name: name.trim() });
          await refresh();
          setError('');
          notify(t('nameSaved'));
        } catch (err) {
          report(err);
        } finally {
          setBusy(false);
        }
      }}
    >
      <FormField
        label={t('displayName')}
        hint={t('displayNameHint')}
        error={error}
      >
        {(p) => (
          <input
            {...p}
            value={name}
            maxLength={80}
            autoComplete="name"
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </FormField>
      <button className="btn btn-primary" disabled={!changed || busy}>
        {busy && <span className="spinner" aria-hidden />}
        {t('saveName')}
      </button>
    </form>
  );
}
