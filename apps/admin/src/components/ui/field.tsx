'use client';
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { Copy } from 'lucide-react';
import type { Locale } from '@stella/shared';
import { useAdmin } from '../../lib/admin-context';
import {
  locDisplay,
  locSet,
  locState,
  locProblems,
  type Loc,
} from '../../lib/loc';

/** The editor-wide language (one language bar per editor). */
export const LangContext = createContext<Locale>('en');
export const useEditLang = () => useContext(LangContext);

/** Label above, hint below (muted), error below (red). Real <label for>. */
export function FormField({
  label,
  hint,
  error,
  children,
  id,
  aside,
  className = '',
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: (props: {
    id: string;
    'aria-describedby'?: string | undefined;
    'aria-invalid'?: boolean | undefined;
  }) => ReactNode;
  id?: string;
  aside?: ReactNode;
  className?: string;
}) {
  const generated = useId(),
    fieldId = id ?? generated,
    hintId = hint ? fieldId + '-hint' : '',
    errorId = error ? fieldId + '-error' : '';
  const described = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={'field ' + className}>
      <div className="field-label">
        <label htmlFor={fieldId}>{label}</label>
        {aside}
      </div>
      {children({
        id: fieldId,
        'aria-describedby': described,
        ...(error ? { 'aria-invalid': true } : {}),
      })}
      {hint && (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}

/** Group of controls with a visible legend (radios, chips, segmented). */
export function FieldGroup({
  legend,
  hint,
  error,
  children,
  className = '',
}: {
  legend: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={'field fieldset ' + className}>
      <legend className="field-legend">{legend}</legend>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
      {error && <p className="field-error">{error}</p>}
    </fieldset>
  );
}

export function AutoTextarea(
  props: TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number },
) {
  const { minRows = 3, ...rest } = props,
    ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = node.scrollHeight + 2 + 'px';
  }, [props.value]);
  return <textarea ref={ref} rows={minRows} {...rest} />;
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="toggle-row">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        className="switch"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        aria-describedby={hint ? id + '-hint' : undefined}
      >
        <span aria-hidden />
      </button>
      <div>
        <label htmlFor={id} className="toggle-label">
          {label}
        </label>
        {hint && (
          <p className="field-hint" id={id + '-hint'}>
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            const index = options.findIndex((o) => o.value === value);
            const step =
              event.key === 'ArrowRight' || event.key === 'ArrowDown'
                ? 1
                : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                  ? -1
                  : 0;
            if (!step) return;
            event.preventDefault();
            const next =
              options[(index + step + options.length) % options.length]!;
            onChange(next.value);
            (
              event.currentTarget.parentElement?.children[
                options.indexOf(next)
              ] as HTMLElement | undefined
            )?.focus();
          }}
          tabIndex={value === option.value ? 0 : -1}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const stateKey = {
  machine: 'stateMachine',
  missing: 'stateMissing',
  stale: 'stateStale',
} as const;

/** One multilingual field following the editor-wide language. */
export function I18nField({
  label,
  value,
  onChange,
  multiline = false,
  required = false,
  limit,
  hint,
  placeholder,
  showErrors = false,
}: {
  label: string;
  value: Loc;
  onChange: (value: Loc) => void;
  multiline?: boolean;
  required?: boolean;
  limit?: number;
  hint?: ReactNode;
  placeholder?: string;
  showErrors?: boolean;
}) {
  const { t } = useAdmin(),
    lang = useEditLang(),
    text = locDisplay(value, lang),
    state = locState(value, lang),
    english = value.raw.en ?? '';
  const problems = showErrors ? locProblems(value, required) : null;
  const error =
    problems && problems.missing.includes(lang)
      ? t(lang === 'en' ? 'requiredField' : 'translationMissingHere')
      : problems && problems.stale.includes(lang)
        ? t('translationStaleHere')
        : undefined;
  const count =
    limit !== undefined ? (
      <span className={'counter' + (text.length > limit ? ' over' : '')}>
        {text.length}/{limit}
      </span>
    ) : null;
  return (
    <FormField
      label={
        <>
          {label}
          {required && lang === 'en' && (
            <span className="req" aria-hidden>
              {' '}
              *
            </span>
          )}
        </>
      }
      hint={hint}
      error={error}
      aside={
        <span className="field-aside">
          {lang !== 'en' && state !== 'ok' && (
            <span className={'loc-state ' + state}>{t(stateKey[state])}</span>
          )}
          {count}
        </span>
      }
    >
      {(props) => (
        <>
          {lang !== 'en' && english && (
            <div className="source-line">
              <p lang="en" className="source-text">
                {english}
              </p>
              <button
                type="button"
                className="icon-btn sm"
                aria-label={t('copyFromEnglish')}
                title={t('copyFromEnglish')}
                onClick={() => onChange(locSet(value, lang, english))}
              >
                <Copy size={16} aria-hidden />
              </button>
            </div>
          )}
          {multiline ? (
            <AutoTextarea
              {...props}
              lang={lang}
              value={text}
              placeholder={placeholder}
              maxLength={20000}
              onChange={(event) =>
                onChange(locSet(value, lang, event.target.value))
              }
            />
          ) : (
            <input
              {...props}
              lang={lang}
              value={text}
              placeholder={placeholder}
              maxLength={limit ? Math.max(limit * 3, 300) : 500}
              onChange={(event) =>
                onChange(locSet(value, lang, event.target.value))
              }
            />
          )}
        </>
      )}
    </FormField>
  );
}
