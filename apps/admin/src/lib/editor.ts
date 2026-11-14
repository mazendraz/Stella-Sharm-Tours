'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAdmin } from './admin-context';
import { useDirtySource } from './guard';
import { locProblems, mapLocs, same, walkLocs } from './loc';
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
    lastKey = useRef(sourceKey);
  const dirty = useMemo(
    () =>
      base && values
        ? order.filter((key) => !same(values[key], base[key]))
        : [],
    [base, values, order],
  );
  // Adopt fresh server data when nothing is pending.
  useEffect(() => {
    if (!initial) return;
    if (!base || (lastKey.current !== sourceKey && dirty.length === 0)) {
      lastKey.current = sourceKey;
      setBase(initial);
      setValues(initial);
      setErrors({});
      setShowErrors(false);
    }
  }, [sourceKey, initial]);
  useDirtySource(
    id,
    dirty.map((key) => labels[key]),
  );
  const set = useCallback(
    <K extends keyof S>(key: K, update: S[K] | ((previous: S[K]) => S[K])) =>
      setValues((previous) =>
        previous
          ? {
              ...previous,
              [key]:
                typeof update === 'function'
                  ? (update as (p: S[K]) => S[K])(previous[key])
                  : update,
            }
          : previous,
      ),
    [],
  );
  const replaceAll = useCallback((next: S) => setValues(next), []);
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
    if (!values || !base || saving || !dirty.length) return false;
    setShowErrors(true);
    const found: Partial<Record<keyof S, string>> = {};
    for (const key of dirty) {
      const problem = problemsFor(key, values);
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
    setSaving(true);
    const failures: Partial<Record<keyof S, string>> = {},
      revisions: string[] = [];
    let nextBase = base;
    if (saveAll) {
      try {
        const ids = await saveAll(values, dirty);
        if (ids) revisions.push(...ids);
        nextBase = values;
      } catch (error) {
        for (const key of dirty) failures[key] = errorText(error);
      }
    } else
      for (const key of order) {
        if (!dirty.includes(key)) continue;
        const saver = savers?.[key];
        if (!saver) continue;
        try {
          const ids = await saver(values[key], values);
          if (ids) revisions.push(...ids);
          nextBase = { ...nextBase, [key]: values[key] };
        } catch (error) {
          failures[key] = errorText(error);
        }
      }
    // Saved Loc values become the new reference (clears stale markers).
    const rebased = Object.fromEntries(
      order.map((key) => [
        key,
        failures[key]
          ? values[key]
          : mapLocs(values[key], (l) => ({
              ...l,
              init: { ...l.raw },
              reviewed: [],
            })),
      ]),
    ) as S;
    const merged = { ...values, ...rebased };
    setValues(merged);
    setBase(
      Object.fromEntries(
        order.map((key) => [key, failures[key] ? nextBase[key] : merged[key]]),
      ) as S,
    );
    setErrors(failures);
    setSaving(false);
    if (Object.keys(failures).length) {
      notify(t('someNotSaved'), { tone: 'error' });
    } else {
      setShowErrors(false);
      notify(typeof success === 'function' ? success() : success, {
        undo: revisions,
      });
    }
    await afterSave?.();
    return !Object.keys(failures).length;
  }, [
    values,
    base,
    saving,
    dirty,
    order,
    savers,
    problemsFor,
    notify,
    t,
    success,
    errorText,
    afterSave,
    saveAll,
  ]);
  const discard = useCallback(() => {
    setValues(base);
    setErrors({});
    setShowErrors(false);
  }, [base]);
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
