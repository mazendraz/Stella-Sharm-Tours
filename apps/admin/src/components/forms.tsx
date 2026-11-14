'use client';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { locales, type Locale } from '@stella/shared';
import { useAdmin } from '../lib/admin-context';
import { obj, localized, snake, type Row } from '../lib/content';
import { OrderList } from './order-list';
const noTranslations: Row[] = [];
export type Field = {
  key: string;
  label?: string;
  kind?:
    | 'text'
    | 'area'
    | 'number'
    | 'check'
    | 'select'
    | 'local'
    | 'rows'
    | 'date'
    | 'datetime-local'
    | 'color'
    | 'days'
    | 'range';
  options?: {
    value: string;
    label: string;
    literal?: boolean;
    group?: string;
  }[];
  fields?: Field[];
  initial?: Record<string, unknown>;
  nullable?: boolean;
  required?: boolean;
  max?: number;
  min?: number;
  step?: number;
  hidden?: boolean;
  dependsOn?: string;
};
function defaults(
  fields: Field[],
  original: Record<string, unknown>,
  translations: Row[],
  prefix = '',
): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((field) => {
      const value = original[field.key];
      return [
        field.key,
        field.kind === 'local'
          ? localized(value, translations, prefix + snake(field.key))
          : field.kind === 'days'
            ? Array.isArray(value)
              ? value
              : []
            : field.kind === 'rows'
              ? (Array.isArray(value) ? value : []).map((row) => ({
                  ...obj(row),
                  ...defaults(
                    field.fields ?? [],
                    obj(row),
                    translations.filter(
                      (value) => value.entityId === obj(row).id,
                    ),
                    '',
                  ),
                }))
              : field.kind === 'datetime-local' && value
                ? new Date(String(value)).toISOString().slice(0, 16)
                : (value ??
                  (field.kind === 'check'
                    ? false
                    : field.kind === 'select' &&
                        field.options?.[0] &&
                        !field.nullable
                      ? field.options[0].value
                      : '')),
      ];
    }),
  );
}
function normalize(
  fields: Field[],
  value: Record<string, unknown>,
  original: Record<string, unknown>,
  initial: Record<string, unknown>,
  changed: { local: boolean },
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const field of fields) {
    const v = value[field.key];
    if (field.kind === 'local') {
      const data = obj(v);
      if (JSON.stringify(v) === JSON.stringify(initial[field.key])) {
        if (original[field.key] !== undefined)
          output[field.key] = original[field.key];
        continue;
      }
      if (!Object.values(data).some((v) => String(v).trim())) {
        if (field.required) throw Error('required');
        output[field.key] = field.nullable ? null : undefined;
        continue;
      }
      changed.local = true;
      if (
        locales.some(
          (locale) =>
            typeof data[locale] !== 'string' || !String(data[locale]).trim(),
        )
      )
        throw Error('required');
      output[field.key] = data;
    } else if (field.kind === 'rows') {
      const before = Array.isArray(original[field.key])
          ? (original[field.key] as Record<string, unknown>[])
          : [],
        initialRows = Array.isArray(initial[field.key])
          ? (initial[field.key] as Record<string, unknown>[])
          : [];
      output[field.key] = (Array.isArray(v) ? v : []).map((row, index) => {
        const data = obj(row),
          previous =
            before.find((item) => data.id && item.id === data.id) ??
            before[index] ??
            {},
          seed =
            initialRows.find((item) => data.id && item.id === data.id) ??
            initialRows[index] ??
            {};
        return {
          ...(data.id ? { id: data.id } : {}),
          ...normalize(field.fields ?? [], data, previous, seed, changed),
        };
      });
    } else if (field.kind === 'days')
      output[field.key] = Array.isArray(v) && v.length ? v : null;
    else if (field.kind === 'datetime-local' && v === initial[field.key])
      output[field.key] = original[field.key] ?? null;
    else
      output[field.key] =
        field.kind === 'number' || field.kind === 'range'
          ? v === '' || v === null || v === undefined
            ? null
            : Number(v)
          : field.nullable && v === ''
            ? null
            : v;
  }
  return output;
}
export function EditorForm({
  fields,
  value,
  schema,
  onSave,
  translations = noTranslations,
  prefix = '',
  children,
  submitLabel = 'save',
}: {
  fields: Field[];
  value: Record<string, unknown>;
  schema?: z.ZodType;
  onSave: (value: Record<string, unknown>) => Promise<unknown>;
  translations?: Row[];
  prefix?: string;
  children?: ReactNode;
  submitLabel?: string;
}) {
  const { t, locale, report, online } = useAdmin(),
    [language, setLanguage] = useState<Locale>(locale),
    [initial] = useState(() => defaults(fields, value, translations, prefix)),
    [reviewed, setReviewed] = useState(false),
    [message, setMessage] = useState('');
  const form = useForm<Record<string, unknown>>({ defaultValues: initial });
  const [translationStates, setTranslationStates] = useState<
    Record<string, string>
  >({});
  useEffect(() => {
    let active = true;
    const states: Record<string, string> = {};
    const visit = async (
      definitions: Field[],
      raw: Record<string, unknown>,
      metadata: Row[],
      path = '',
    ) => {
      for (const field of definitions) {
        const name = path + field.key;
        if (field.kind === 'rows') {
          for (const [index, row] of (Array.isArray(raw[field.key])
            ? (raw[field.key] as Record<string, unknown>[])
            : []
          ).entries())
            await visit(
              field.fields ?? [],
              obj(row),
              translations.filter((item) => item.entityId === row.id),
              name + '.' + index + '.',
            );
        } else if (field.kind === 'local') {
          const data = obj(raw[field.key]),
            en = String(data.en ?? ''),
            hash = Array.from(
              new Uint8Array(
                await crypto.subtle.digest(
                  'SHA-256',
                  new TextEncoder().encode(en),
                ),
              ),
            )
              .map((value) => value.toString(16).padStart(2, '0'))
              .join('');
          for (const locale of locales) {
            const entry = metadata.find(
              (row) =>
                row.field === prefix + snake(field.key) &&
                row.locale === locale,
            );
            states[name + '.' + locale] =
              entry && entry.sourceHash !== hash
                ? 'stale'
                : data[locale]
                  ? 'human'
                  : entry
                    ? String(entry.origin)
                    : localized(data)[locale]
                      ? 'machine'
                      : 'missing';
          }
        }
      }
    };
    void visit(fields, value, translations).then(() => {
      if (active) setTranslationStates(states);
    });
    return () => {
      active = false;
    };
  }, [fields, value, translations, prefix]);
  const dirty = form.formState.isDirty;
  const hasLocalized = (values: Field[]): boolean =>
    values.some(
      (field) => field.kind === 'local' || hasLocalized(field.fields ?? []),
    );
  const multilingual = hasLocalized(fields);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  return (
    <form
      data-dirty={dirty}
      onSubmit={form.handleSubmit(async (raw) => {
        setMessage('');
        try {
          const changed = { local: false },
            data = normalize(fields, raw, value, initial, changed);
          if (changed.local && !reviewed) {
            setMessage(t('review'));
            return;
          }
          const parsed = schema?.safeParse(data);
          if (parsed && !parsed.success) {
            setMessage(t('error'));
            return;
          }
          await onSave((parsed?.data ?? data) as Record<string, unknown>);
          form.reset(raw);
          setReviewed(false);
        } catch (error) {
          if (error instanceof Error && error.message === 'required')
            setMessage(t('required'));
          else report(error);
        }
      })}
    >
      {multilingual && (
        <div className="language-tabs" role="group" aria-label={t('language')}>
          {locales.map((code) => (
            <button
              type="button"
              key={code}
              aria-pressed={language === code}
              onClick={() => setLanguage(code)}
            >
              {code.toUpperCase()}
            </button>
          ))}
        </div>
      )}
      <Fields
        fields={fields}
        form={form}
        language={language}
        states={translationStates}
      />
      {multilingual && (
        <label className="check review-check">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(event) => setReviewed(event.target.checked)}
          />
          {t('reviewed')}
        </label>
      )}
      {message && (
        <p className="form-error" role="alert">
          {message}
        </p>
      )}
      {children}
      <button disabled={!online || form.formState.isSubmitting}>
        {t(submitLabel)}
      </button>
    </form>
  );
}
function Fields({
  fields,
  form,
  language,
  prefix = '',
  states,
}: {
  fields: Field[];
  form: UseFormReturn<Record<string, unknown>>;
  language: Locale;
  prefix?: string;
  states: Record<string, string>;
}) {
  const { t } = useAdmin(),
    id = useId();
  return (
    <>
      {fields
        .filter((field) => !field.hidden)
        .map((field) => {
          const name = prefix + field.key,
            label = t(field.label ?? field.key),
            inputId = id + name;
          if (field.kind === 'rows') {
            const array = form.watch(name),
              values = Array.isArray(array) ? array : [];
            return (
              <fieldset className="field-row" key={name}>
                <legend>{label}</legend>
                <OrderList
                  items={values.map((row, index) => ({
                    ...obj(row),
                    id: String(obj(row).id ?? index),
                  }))}
                  onReorder={async (ids) => {
                    const byId = new Map(
                      values.map((row, index) => [
                        String(obj(row).id ?? index),
                        row,
                      ]),
                    );
                    form.setValue(
                      name,
                      ids.map((id) => byId.get(id)),
                      { shouldDirty: true },
                    );
                  }}
                  render={(_, index) => (
                    <div className="field-row">
                      <Fields
                        fields={field.fields ?? []}
                        form={form}
                        language={language}
                        prefix={`${name}.${index}.`}
                        states={states}
                      />
                      <div className="row-controls">
                        <button
                          type="button"
                          className="secondary"
                          onClick={() =>
                            form.setValue(
                              name,
                              values.filter((_, i) => i !== index),
                              { shouldDirty: true },
                            )
                          }
                        >
                          {t('remove')}
                        </button>
                      </div>
                    </div>
                  )}
                />
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    form.setValue(
                      name,
                      [
                        ...values,
                        defaults(field.fields ?? [], field.initial ?? {}, []),
                      ],
                      { shouldDirty: true },
                    )
                  }
                >
                  {t('add')}
                </button>
              </fieldset>
            );
          }
          if (field.kind === 'days') {
            const value = form.watch(name),
              days = Array.isArray(value) ? (value as number[]) : [];
            return (
              <fieldset className="field-row" key={name}>
                <legend>{label}</legend>
                <div className="segmented" style={{ flexWrap: 'wrap' }}>
                  {Array.from({ length: 7 }, (_, day) => (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={days.includes(day)}
                      onClick={() =>
                        form.setValue(
                          name,
                          days.includes(day)
                            ? days.filter((value) => value !== day)
                            : [...days, day].sort(),
                          { shouldDirty: true },
                        )
                      }
                    >
                      {new Intl.DateTimeFormat(language, {
                        weekday: 'short',
                        timeZone: 'UTC',
                      }).format(new Date(Date.UTC(2023, 0, 1 + day)))}
                    </button>
                  ))}
                </div>
              </fieldset>
            );
          }
          if (field.kind === 'check')
            return (
              <label className="check" key={name}>
                {field.key === 'isPrimary' ? (
                  <input
                    type="radio"
                    name="primary-price"
                    checked={Boolean(form.watch(name))}
                    onChange={() => {
                      const parent = prefix.replace(/\.\d+\.$/, ''),
                        index = Number(
                          prefix.split('.').filter(Boolean).at(-1),
                        ),
                        values = form.getValues(parent);
                      if (Array.isArray(values))
                        form.setValue(
                          parent,
                          values.map((row, i) => ({
                            ...obj(row),
                            isPrimary: i === index,
                          })),
                          { shouldDirty: true },
                        );
                    }}
                  />
                ) : (
                  <input type="checkbox" {...form.register(name)} />
                )}
                {label}
              </label>
            );
          if (field.kind === 'local')
            return (
              <div key={name} className="localized-field">
                <label htmlFor={inputId}>
                  {label} · {language.toUpperCase()}{' '}
                  <small>
                    {t(
                      language === 'en'
                        ? 'source'
                        : form.getFieldState(name + '.en').isDirty &&
                            !form.getFieldState(name + '.' + language).isDirty
                          ? 'stale'
                          : (states[name + '.' + language] ?? 'missing'),
                    )}
                  </small>
                </label>
                <div className={language === 'en' ? '' : 'local-pair'}>
                  {language !== 'en' && (
                    <div className="source-reference">
                      <b>{t('source')}</b>
                      <p lang="en">{String(form.watch(name + '.en') ?? '')}</p>
                    </div>
                  )}
                  <textarea
                    id={inputId}
                    lang={language}
                    {...form.register(`${name}.${language}`)}
                    maxLength={20000}
                  />
                </div>
              </div>
            );
          if (field.kind === 'select')
            return (
              <label key={name} htmlFor={inputId}>
                {label}
                <select id={inputId} {...form.register(name)}>
                  {field.nullable && (
                    <option value="">
                      {t(field.key === 'assignedTo' ? 'unassigned' : 'none')}
                    </option>
                  )}
                  {field.options
                    ?.filter(
                      (option) =>
                        !field.dependsOn ||
                        !option.group ||
                        option.group === form.watch(prefix + field.dependsOn),
                    )
                    .map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.literal ? option.label : t(option.label)}
                      </option>
                    ))}
                </select>
              </label>
            );
          return (
            <div key={name}>
              <label htmlFor={inputId}>
                {label}
                {field.kind === 'range' && (
                  <output htmlFor={inputId}>
                    {String(form.watch(name) ?? 0)}
                  </output>
                )}
                {field.kind === 'area' ? (
                  <textarea
                    id={inputId}
                    {...form.register(name)}
                    maxLength={field.max ?? 2000}
                  />
                ) : (
                  <input
                    id={inputId}
                    type={
                      field.kind === 'range'
                        ? 'range'
                        : field.kind === 'number'
                          ? 'number'
                          : field.kind === 'date'
                            ? 'date'
                            : field.kind === 'datetime-local'
                              ? 'datetime-local'
                              : field.kind === 'color'
                                ? 'color'
                                : field.key === 'password'
                                  ? 'password'
                                  : field.key === 'email'
                                    ? 'email'
                                    : 'text'
                    }
                    {...form.register(name)}
                    maxLength={field.max ?? 500}
                    min={field.min}
                    max={
                      field.kind === 'number' || field.kind === 'range'
                        ? field.max
                        : undefined
                    }
                    step={field.step ?? 'any'}
                    required={field.required}
                  />
                )}
              </label>
              {field.key === 'amountEur' && (
                <span className="row-controls">
                  <button
                    type="button"
                    className="secondary"
                    aria-label="− €5"
                    onClick={() =>
                      form.setValue(
                        name,
                        Math.max(0, Number(form.watch(name) || 0) - 5),
                        { shouldDirty: true },
                      )
                    }
                  >
                    − €5
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    aria-label="+ €5"
                    onClick={() =>
                      form.setValue(name, Number(form.watch(name) || 0) + 5, {
                        shouldDirty: true,
                      })
                    }
                  >
                    + €5
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      form.setValue(name, null, { shouldDirty: true })
                    }
                  >
                    {t('onRequest')}
                  </button>
                </span>
              )}
            </div>
          );
        })}
    </>
  );
}
