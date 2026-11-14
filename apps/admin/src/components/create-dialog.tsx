'use client';
import { useState } from 'react';
import { useAdmin } from '../lib/admin-context';
import { useGuard } from '../lib/guard';
import { slugify } from '../lib/format';
import { Modal } from './ui/dialog';
import { FormField } from './ui/field';

/** "New trip / package / collection" — ≤3 fields, then the full editor. */
export function CreateDialog({
  title,
  nameLabel,
  createLabel,
  slugPrefix,
  collections,
  selectLabel,
  onCreate,
  onClose,
  hrefFor,
  success,
}: {
  title: string;
  nameLabel: string;
  createLabel: string;
  slugPrefix?: string;
  collections?: { id: string; name: string }[];
  selectLabel?: string;
  onCreate: (data: {
    name: string;
    slug: string;
    collectionId?: string;
  }) => Promise<string>;
  onClose: () => void;
  hrefFor: (id: string) => string;
  success: string;
}) {
  const { t, report, notify, errorText } = useAdmin(),
    { navigate } = useGuard(),
    [name, setName] = useState(''),
    [slug, setSlug] = useState(''),
    [slugTouched, setSlugTouched] = useState(false),
    [collectionId, setCollectionId] = useState(collections?.[0]?.id ?? ''),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false);
  const effectiveSlug = slugTouched ? slug : slugify(name);
  return (
    <Modal title={title} onClose={onClose} size="sm">
      <form
        noValidate
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          const next: Record<string, string> = {};
          if (!name.trim()) next.name = t('requiredField');
          if (
            slugPrefix !== undefined &&
            !/^[a-z0-9-]{1,120}$/.test(effectiveSlug)
          )
            next.slug = t('slugInvalid');
          if (collections && !collectionId)
            next.collection = t('requiredField');
          setErrors(next);
          if (Object.keys(next).length) return;
          setBusy(true);
          try {
            const id = await onCreate({
              name: name.trim(),
              slug: effectiveSlug,
              ...(collections ? { collectionId } : {}),
            });
            onClose();
            notify(success);
            await navigate(hrefFor(id));
          } catch (error) {
            const message = errorText(error);
            if (message === t('errConflict'))
              setErrors({ slug: t('slugTaken') });
            else report(error);
          } finally {
            setBusy(false);
          }
        }}
      >
        <FormField
          label={nameLabel}
          error={errors.name}
          hint={t('createEnglishHint')}
        >
          {(p) => (
            <input
              {...p}
              autoFocus
              value={name}
              maxLength={200}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </FormField>
        {collections && (
          <FormField
            label={selectLabel ?? t('collection')}
            error={errors.collection}
          >
            {(p) => (
              <select
                {...p}
                value={collectionId}
                onChange={(event) => setCollectionId(event.target.value)}
              >
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </FormField>
        )}
        {slugPrefix !== undefined && (
          <FormField
            label={t('pageAddress')}
            error={errors.slug}
            hint={t('slugHint')}
          >
            {(p) => (
              <div className="prefixed">
                <span className="prefix" aria-hidden>
                  {slugPrefix}
                </span>
                <input
                  {...p}
                  value={effectiveSlug}
                  maxLength={120}
                  spellCheck={false}
                  onChange={(event) => {
                    setSlugTouched(true);
                    setSlug(event.target.value.toLowerCase());
                  }}
                />
              </div>
            )}
          </FormField>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('cancel')}
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy && <span className="spinner" aria-hidden />}
            {createLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
