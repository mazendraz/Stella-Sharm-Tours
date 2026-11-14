'use client';
import { useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useAdmin } from '../lib/admin-context';
import { locales, type Locale } from '@stella/shared';
export function LanguageSelect() {
  const { locale, setLocale, t } = useAdmin();
  return (
    <label className="language-select">
      <span className="sr-only">{t('language')}</span>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
      >
        {locales.map((value) => (
          <option key={value} value={value}>
            {
              {
                en: 'English',
                it: 'Italiano',
                es: 'Español',
                fr: 'Français',
                de: 'Deutsch',
                ru: 'Русский',
                tr: 'Türkçe',
              }[value]
            }
          </option>
        ))}
      </select>
    </label>
  );
}
export function Sheet({
  title,
  children,
  onClose,
  description,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  description?: string | undefined;
}) {
  const { t, undo, online } = useAdmin();
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (
          !open &&
          (!document.querySelector('.sheet form[data-dirty="true"]') ||
            window.confirm(t('unsaved')))
        )
          onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="sheet">
          <div className="sheet-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="icon-button"
                aria-label={t('close')}
              >
                ×
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className={description ? 'muted' : 'sr-only'}>
            {description ?? title}
          </Dialog.Description>
          {children}
          {undo && (
            <div className="sheet-undo">
              <button
                type="button"
                disabled={!online}
                onClick={() => void undo()}
              >
                {t('undo')}
              </button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Loading() {
  const { t } = useAdmin();
  return (
    <div role="status" className="skeleton-list" aria-label={t('loading')}>
      {[1, 2, 3].map((i) => (
        <div className="skeleton" key={i} />
      ))}
    </div>
  );
}
export function Empty() {
  const { t } = useAdmin();
  return <p className="empty">{t('empty')}</p>;
}
export function Failure({ retry }: { retry: () => void }) {
  const { t } = useAdmin();
  return (
    <div role="alert" className="empty">
      <p>{t('error')}</p>
      <button onClick={retry}>{t('retry')}</button>
    </div>
  );
}
export function Pill({ value }: { value: string }) {
  const { t } = useAdmin();
  return <span className={'pill ' + value}>{t(value)}</span>;
}
export function Money({
  amount,
}: {
  amount: number | string | null | undefined;
}) {
  const { locale, t } = useAdmin();
  return (
    <bdi>
      {amount === null || amount === undefined
        ? t('onRequest')
        : new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: 'EUR',
            maximumFractionDigits: 2,
          }).format(Number(amount))}
    </bdi>
  );
}
export function Time({ value }: { value: string }) {
  const { locale } = useAdmin();
  return (
    <time dateTime={value}>
      {new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Africa/Cairo',
      }).format(new Date(value))}
    </time>
  );
}
export function Search({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useAdmin();
  return (
    <label className="search">
      <span className="sr-only">{t('search')}</span>
      <input
        type="search"
        placeholder={t('search')}
        value={value}
        maxLength={80}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
export function ConfirmButton({
  children,
  onConfirm,
  warning,
}: {
  children: ReactNode;
  onConfirm: () => Promise<unknown>;
  warning?: string | undefined;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    { t, report, online } = useAdmin();
  return (
    <>
      <button type="button" className="secondary" onClick={() => setOpen(true)}>
        {children}
      </button>
      {open && (
        <Sheet
          title={t('confirm')}
          onClose={() => !busy && setOpen(false)}
          description={warning}
        >
          <div className="actions">
            <button
              disabled={busy || !online}
              onClick={async () => {
                setBusy(true);
                try {
                  await onConfirm();
                  setOpen(false);
                } catch (error) {
                  report(error);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t('confirm')}
            </button>
            <button className="secondary" onClick={() => setOpen(false)}>
              {t('cancel')}
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
