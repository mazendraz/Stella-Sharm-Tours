'use client';
import { useState } from 'react';
import { Check, Minus } from 'lucide-react';
import type { Role } from '@stella/shared/admin';
import { useAdmin, useData } from '../lib/admin-context';
import { type Row } from '../lib/content';
import { dateTime, relative } from '../lib/format';
import { useGuard } from '../lib/guard';
import { PageHeader } from '../components/ui/page-header';
import { DataTable, type Column } from '../components/ui/data-table';
import { Modal, useConfirm } from '../components/ui/dialog';
import { FormField, FieldGroup, Toggle } from '../components/ui/field';
import {
  Callout,
  EmptyState,
  LoadError,
  Skeleton,
} from '../components/ui/states';
import { usePageTitle } from '../components/ui/editor';
import { AppLink } from '../components/ui/link';

/** "Chrome on Windows" from a user-agent string (best effort). */
export function deviceName(ua: unknown, t: (k: string) => string) {
  const s = String(ua ?? '');
  if (!s) return t('unknownDevice');
  const browser = /Edg\//.test(s)
    ? 'Edge'
    : /OPR\//.test(s)
      ? 'Opera'
      : /Firefox\//.test(s)
        ? 'Firefox'
        : /Chrome\//.test(s)
          ? 'Chrome'
          : /Safari\//.test(s)
            ? 'Safari'
            : t('browser');
  const os = /iPhone|iPad/.test(s)
    ? 'iOS'
    : /Android/.test(s)
      ? 'Android'
      : /Windows/.test(s)
        ? 'Windows'
        : /Mac OS X/.test(s)
          ? 'macOS'
          : /Linux/.test(s)
            ? 'Linux'
            : '';
  return os ? `${browser} · ${os}` : browser;
}

const roleOrder: Role[] = ['sales', 'editor', 'manager', 'owner'];

export function Team() {
  const { t, tp, locale } = useAdmin(),
    query = useData<Row[]>('/v1/admin/users'),
    [inviting, setInviting] = useState(false);
  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: t('name'),
      cell: (row) => <span className="strong">{String(row.name)}</span>,
    },
    {
      key: 'email',
      header: t('email'),
      className: 'hide-md',
      cell: (row) => String(row.email),
    },
    { key: 'role', header: t('role'), cell: (row) => t(String(row.role)) },
    {
      key: 'mfa',
      header: t('twoStepShort'),
      cell: (row) =>
        row.totpEnabled ? (
          <span className="yes">
            <Check size={16} aria-hidden />
            <span className="sr-only">{t('yes')}</span>
          </span>
        ) : (
          <span className="muted">
            <Minus size={16} aria-hidden />
            <span className="sr-only">{t('no')}</span>
          </span>
        ),
    },
    {
      key: 'login',
      header: t('lastLogin'),
      className: 'hide-md muted',
      cell: (row) =>
        row.lastLoginAt
          ? relative(String(row.lastLoginAt), locale)
          : t('never'),
    },
    {
      key: 'status',
      header: t('status'),
      cell: (row) => (
        <span className={'badge-status ' + (row.disabledAt ? 'grey' : 'green')}>
          <span className="dot" aria-hidden />
          {t(row.disabledAt ? 'disabledAccount' : 'active')}
        </span>
      ),
    },
  ];
  return (
    <div className="page">
      <PageHeader
        title={t('team')}
        description={t('teamDesc')}
        primary={{ label: t('invite'), onClick: () => setInviting(true) }}
      />
      <DataTable
        caption={t('team')}
        columns={columns}
        rows={query.data ?? []}
        getKey={(row) => row.id}
        href={(row) => '/team/' + row.id}
        mobile={{
          title: (row) => String(row.name),
          meta: (row) => t(String(row.role)) + ' · ' + String(row.email),
        }}
        loading={query.isPending}
        error={query.isError}
        onRetry={() => void query.refetch()}
        empty={{ title: t('noTeamYet') }}
        count={tp('membersCount', (query.data ?? []).length)}
      />
      {inviting && <InviteDialog onClose={() => setInviting(false)} />}
    </div>
  );
}

function RoleRadios({
  value,
  onChange,
  disabled,
}: {
  value: Role;
  onChange: (r: Role) => void;
  disabled?: boolean;
}) {
  const { t } = useAdmin();
  return (
    <FieldGroup legend={t('role')}>
      <div className="role-options">
        {roleOrder.map((role) => (
          <label
            key={role}
            className={'role-option' + (value === role ? ' on' : '')}
          >
            <input
              type="radio"
              name="role"
              value={role}
              checked={value === role}
              disabled={disabled}
              onChange={() => onChange(role)}
            />
            <span>
              <span className="strong">{t(role)}</span>
              <span className="muted small">{t('roleDesc_' + role)}</span>
            </span>
          </label>
        ))}
      </div>
    </FieldGroup>
  );
}

function InviteDialog({ onClose }: { onClose: () => void }) {
  const { t, save, report } = useAdmin(),
    [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [role, setRole] = useState<Role>('sales'),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false);
  return (
    <Modal title={t('invite')} onClose={onClose} size="md">
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const next: Record<string, string> = {};
          if (!name.trim()) next.name = t('requiredField');
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            next.email = t('emailFormat');
          setErrors(next);
          if (Object.keys(next).length) return;
          setBusy(true);
          try {
            await save(
              '/v1/admin/users',
              'POST',
              { name: name.trim(), email: email.trim(), role },
              { success: t('inviteSent', { email }) },
            );
            onClose();
          } catch (error) {
            report(error);
          } finally {
            setBusy(false);
          }
        }}
      >
        <FormField label={t('name')} error={errors.name}>
          {(p) => (
            <input
              {...p}
              autoFocus
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </FormField>
        <FormField label={t('email')} error={errors.email}>
          {(p) => (
            <input
              {...p}
              type="email"
              value={email}
              maxLength={254}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </FormField>
        <RoleRadios value={role} onChange={setRole} />
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('cancel')}
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy && <span className="spinner" aria-hidden />}
            {t('sendInvite')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function Member({ id }: { id: string }) {
  const { t, locale, me, save, request, report, notify } = useAdmin(),
    users = useData<Row[]>('/v1/admin/users'),
    sessions = useData<Row[]>(
      '/v1/admin/users/' + id + '/sessions',
      /^[0-9a-f-]{36}$/i.test(id),
    ),
    confirm = useConfirm(),
    { navigate } = useGuard(),
    row = users.data?.find((u) => u.id === id),
    self = id === me!.id,
    [busy, setBusy] = useState(false);
  usePageTitle(row ? String(row.name) : t('team'));
  if (users.isError)
    return (
      <div className="page">
        <LoadError retry={() => void users.refetch()} />
      </div>
    );
  if (users.isPending)
    return (
      <div className="page">
        <Skeleton variant="editor" rows={3} />
      </div>
    );
  if (!row)
    return (
      <div className="page">
        <EmptyState
          title={t('notFoundTitle')}
          action={
            <AppLink className="btn" href="/team">
              {t('team')}
            </AppLink>
          }
        />
      </div>
    );
  const patch = async (body: Record<string, unknown>, success: string) => {
    setBusy(true);
    try {
      await save('/v1/admin/users/' + id, 'PATCH', body, {
        success,
        undo: false,
      });
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page narrow">
      <AppLink href="/team" className="back-link">
        ← {t('team')}
      </AppLink>
      <header className="page-header">
        <div className="page-header-text">
          <h1>{String(row.name)}</h1>
          <p className="muted">{String(row.email)}</p>
        </div>
      </header>
      {self && <Callout tone="info">{t('selfNote')}</Callout>}
      <section className="panel">
        <h2>{t('access')}</h2>
        <RoleRadios
          value={row.role as Role}
          disabled={self || busy}
          onChange={async (role) => {
            if (role === row.role) return;
            if (
              await confirm({
                title: t('changeRoleTitle', { name: String(row.name) }),
                body: t('changeRoleBody', { role: t(role) }),
                confirmLabel: t('changeRole'),
              })
            )
              await patch(
                { role },
                t('roleChanged', { name: String(row.name), role: t(role) }),
              );
          }}
        />
        <Toggle
          checked={!!row.mfaRequired}
          disabled={busy}
          onChange={(mfaRequired) =>
            void patch(
              { mfaRequired },
              t(mfaRequired ? 'mfaNowRequired' : 'mfaNoLongerRequired'),
            )
          }
          label={t('requireTwoStep')}
          hint={row.totpEnabled ? t('twoStepOn') : t('twoStepOff')}
        />
        <Toggle
          checked={!!row.disabledAt}
          disabled={self || busy}
          onChange={async (disabled) => {
            if (
              !disabled ||
              (await confirm({
                title: t('disableTitle', { name: String(row.name) }),
                body: t('disableBody'),
                confirmLabel: t('disableAccount'),
                tone: 'danger',
              }))
            )
              await patch(
                { disabled },
                t(disabled ? 'accountDisabled' : 'accountEnabled'),
              );
          }}
          label={t('disableAccount')}
          hint={self ? t('selfNote') : t('disableHint')}
        />
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>{t('sessions')}</h2>
          {(sessions.data ?? []).length > 0 && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={async () => {
                if (
                  await confirm({
                    title: t('signOutUserTitle', { name: String(row.name) }),
                    body: t('signOutUserBody'),
                    confirmLabel: t('signOutAll'),
                    tone: 'danger',
                  })
                ) {
                  try {
                    await request(
                      '/v1/admin/users/' + id + '/sessions',
                      'DELETE',
                      {},
                    );
                    await sessions.refetch();
                    notify(t('signedOutUser', { name: String(row.name) }));
                    if (self) await navigate('/');
                  } catch (error) {
                    report(error);
                  }
                }
              }}
            >
              {t('signOutAll')}
            </button>
          )}
        </div>
        {sessions.isPending ? (
          <Skeleton rows={2} />
        ) : !(sessions.data ?? []).length ? (
          <p className="muted">{t('noSessions')}</p>
        ) : (
          <ul className="simple-list">
            {sessions.data!.map((s) => (
              <li key={s.id} className="simple-row static">
                <span className="simple-main">
                  <span className="strong">{deviceName(s.userAgent, t)}</span>
                  <span className="muted">
                    {t('lastActive', {
                      when: relative(String(s.lastSeenAt), locale),
                    })}{' '}
                    ·{' '}
                    {t('signedInAt', {
                      when: dateTime(String(s.createdAt), locale),
                    })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
