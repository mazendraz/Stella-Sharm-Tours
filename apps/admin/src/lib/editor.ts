'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAdmin } from './admin-context';
import { useDirtySource } from './guard';
import { acknowledgeEditorSection, locProblems, same, walkLocs } from './loc';
import { languageName } from './format';

type Savers<S> = {
  [K in keyof S]?: (value: S[K], all: S) => Promise<string[] | void>;
};
type Validators<S> = {
  [K in keyof S]?: (value: S[K], all: S) => string | null;
};

/**
 * Form state for a full-page editor made of sections.
 * - dirty is computed per section (deep compare with the loaded value)
 * - save() calls only dirty sections' savers, sequentially, in section order
 * - failed sections stay dirty and show an inline error
 */
export function useEditor<S extends Record<string, unknown>>({
  id,
  initial,
  sourceKey,
  order,
  labels,
  savers,
  validate,
  success,
  afterSave,
  saveAll,
}: {
  id: string;
  initial: S | null;
  /** Changes when the server data changes; re-initialises a clean editor. */
  sourceKey: string;
  order: (keyof S & string)[];
  labels: Record<keyof S & string, string>;
  savers?: Savers<S>;
  validate?: Validators<S>;
  success: string | (() => string);
  afterSave?: () => Promise<unknown>;
  /** One request for the whole editor (e.g. homepage) instead of per-section savers. */
  saveAll?: (
    values: S,
    dirty: (keyof S & string)[],
  ) => Promise<string[] | void>;
}) {
  const { t, notify, errorText, locale } = useAdmin(),
    [base, setBase] = useState<S | null>(initial),
    [values, setValues] = useState<S | null>(initial),
    [errors, setErrors] = useState<Partial<Record<keyof S, string>>>({}),
    [showErrors, setShowErrors] = useState(false),
    [saving, setSaving] = useState(false),
    currentValues = useRef(initial),
    inFlight = useRef(false),
    lastKey = useRef(sourceKey);
  const replaceAll = useCallback((next: S | null) => {
    currentValues.current = next;
    setValues(next);
  }, []);
  const dirty = useMemo(
    () =>
      base && values
        ? order.filter((key) => !same(values[key], base[key]))
        : [],
    [base, values, order],
  );
  // Adopt fresh server data when nothing is pending.
  useEffect(() => {
    if (!initial || inFlight.current) return;
    if (!base || (lastKey.current !== sourceKey && dirty.length === 0)) {
      lastKey.current = sourceKey;
      setBase(initial);
      replaceAll(initial);
      setErrors({});
      setShowErrors(false);
    }
  }, [sourceKey, initial, base, dirty.length, replaceAll, saving]);
  useDirtySource(
    id,
    dirty.map((key) => labels[key]),
  );
  const set = useCallback(
    <K extends keyof S>(key: K, update: S[K] | ((previous: S[K]) => S[K])) => {
      const previous = currentValues.current;
      if (!previous) return;
      replaceAll({
        ...previous,
        [key]:
          typeof update === 'function'
            ? (update as (p: S[K]) => S[K])(previous[key])
            : update,
      });
    },
    [replaceAll],
  );
  const problemsFor = useCallback(
    (key: keyof S & string, all: S): string | null => {
      const custom = validate?.[key]?.(all[key], all);
      if (custom) return custom;
      const missing = new Set<string>(),
        stale = new Set<string>();
      walkLocs(all[key], (l) => {
        const p = locProblems(l, false);
        p.missing.forEach((code) => missing.add(code));
        p.stale.forEach((code) => stale.add(code));
      });
      const name = (code: string) => languageName(code, locale);
      if (missing.size)
        return t('sectionMissingLangs', {
          langs: [...missing].map(name).join(', '),
        });
      if (stale.size)
        return t('sectionStaleLangs', {
          langs: [...stale].map(name).join(', '),
        });
      return null;
    },
    [validate, t, locale],
  );
  const save = useCallback(async () => {
    const submitted = currentValues.current;
    if (!submitted || !base || inFlight.current) return false;
    const sections = order.filter((key) => !same(submitted[key], base[key]));
    if (!sections.length) return false;
    setShowErrors(true);
    const found: Partial<Record<keyof S, string>> = {};
    for (const key of sections) {
      const problem = problemsFor(key, submitted);
      if (problem) found[key] = problem;
    }
    if (Object.keys(found).length) {
      setErrors(found);
      notify(t('fixErrors'), { tone: 'error' });
      document
        .getElementById('section-' + Object.keys(found)[0])
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return false;
    }
    inFlight.current = true;
    setSaving(true);
    const failures: Partial<Record<keyof S, string>> = {},
      revisions: string[] = [];
    const acknowledged: (keyof S & string)[] = [];
    try {
      if (saveAll) {
        try {
          const ids = await saveAll(submitted, sections);
          if (ids) revisions.push(...ids);
          acknowledged.push(...sections);
        } catch (error) {
          for (const key of sections) failures[key] = errorText(error);
        }
      } else {
        for (const key of sections) {
          const saver = savers?.[key];
          if (!saver) continue;
          try {
            const ids = await saver(submitted[key], submitted);
            if (ids) revisions.push(...ids);
            acknowledged.push(key);
          } catch (error) {
            failures[key] = errorText(error);
          }
        }
      }
      const latest = currentValues.current ?? submitted;
      const nextBase = { ...base };
      const merged = { ...latest };
      for (const key of acknowledged) {
        const section = acknowledgeEditorSection(submitted[key], latest[key]);
        nextBase[key] = section.base;
        merged[key] = section.values;
      }
      setBase(nextBase);
      replaceAll(merged);
      setErrors(failures);
      if (Object.keys(failures).length) {
        notify(t('someNotSaved'), { tone: 'error' });
      } else {
        setShowErrors(false);
        notify(typeof success === 'function' ? success() : success, {
          undo: revisions,
        });
      }
      await afterSave?.();
      return (
        !Object.keys(failures).length &&
        order.every((key) => same(nextBase[key], currentValues.current?.[key]))
      );
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }, [
    base,
    order,
    savers,
    problemsFor,
    notify,
    t,
    success,
    errorText,
    afterSave,
    saveAll,
    replaceAll,
  ]);
  const discard = useCallback(() => {
    replaceAll(base);
    setErrors({});
    setShowErrors(false);
  }, [base, replaceAll]);
  return {
    values,
    base,
    set,
    replaceAll,
    dirty,
    errors,
    showErrors,
    saving,
    save,
    discard,
    labels,
    order,
  };
}
export type Editor<S extends Record<string, unknown>> = ReturnType<
  typeof useEditor<S>
>;
