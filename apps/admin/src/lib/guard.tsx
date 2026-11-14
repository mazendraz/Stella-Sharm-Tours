'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { useAdmin } from './admin-context';
import { useConfirm } from '../components/ui/dialog';

/**
 * Unsaved-changes guard shared by every editor: route changes, browser back,
 * tab close and in-app links all ask "Discard unsaved changes?" with the list
 * of dirty sections.
 */
type Source = () => string[];
type GuardValue = {
  register: (id: string, source: Source) => () => void;
  dirty: () => string[];
  confirmLeave: () => Promise<boolean>;
  navigate: (href: string, options?: { replace?: boolean }) => Promise<void>;
  /** Re-evaluate dirty state (call after edits so the back-button trap updates). */
  ping: () => void;
};
const GuardContext = createContext<GuardValue | null>(null);
export function useGuard() {
  const value = useContext(GuardContext);
  if (!value) throw new Error('Missing guard provider');
  return value;
}

export function GuardProvider({ children }: { children: ReactNode }) {
  const sources = useRef(new Map<string, Source>()),
    router = useRouter(),
    confirm = useConfirm(),
    { t } = useAdmin(),
    trapped = useRef(false),
    asking = useRef(false),
    [tick, setTick] = useState(0);
  const dirty = useCallback(
    () => [...sources.current.values()].flatMap((source) => source()),
    [],
  );
  const confirmLeave = useCallback(async () => {
    const sections = dirty();
    if (!sections.length) return true;
    return confirm({
      title: t('discardTitle'),
      body: t('discardBody', { sections: [...new Set(sections)].join(', ') }),
      confirmLabel: t('discard'),
      tone: 'danger',
    });
  }, [confirm, dirty, t]);
  const navigate = useCallback(
    async (href: string, options?: { replace?: boolean }) => {
      if (!(await confirmLeave())) return;
      sources.current.clear();
      if (options?.replace) router.replace(href);
      else router.push(href);
    },
    [confirmLeave, router],
  );
  const register = useCallback((id: string, source: Source) => {
    sources.current.set(id, source);
    setTick((v) => v + 1);
    return () => {
      sources.current.delete(id);
      setTick((v) => v + 1);
    };
  }, []);
  const ping = useCallback(() => setTick((v) => v + 1), []);
  // Tab close / reload.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty().length) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  // Browser back: keep one duplicate history entry while something is dirty.
  useEffect(() => {
    const isDirty = dirty().length > 0;
    if (isDirty && !trapped.current) {
      history.pushState(history.state, '', location.href);
      trapped.current = true;
    } else if (!isDirty && trapped.current && !asking.current) {
      trapped.current = false;
      history.back();
    }
  }, [tick, dirty]);
  useEffect(() => {
    const onPop = async () => {
      if (!trapped.current || asking.current) return;
      trapped.current = false;
      if (!dirty().length) return;
      asking.current = true;
      const ok = await confirmLeave();
      asking.current = false;
      if (ok) {
        sources.current.clear();
        history.back();
      } else {
        history.pushState(history.state, '', location.href);
        trapped.current = true;
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [confirmLeave, dirty]);
  const value = useMemo(
    () => ({ register, dirty, confirmLeave, navigate, ping }),
    [register, dirty, confirmLeave, navigate, ping],
  );
  return (
    <GuardContext.Provider value={value}>{children}</GuardContext.Provider>
  );
}

/** Register a dirty-sections source for the lifetime of a component. */
export function useDirtySource(id: string, sections: string[]) {
  const { register, ping } = useGuard(),
    latest = useRef(sections);
  latest.current = sections;
  useEffect(() => register(id, () => latest.current), [id, register]);
  const key = sections.join('|');
  useEffect(() => ping(), [key, ping]);
}
