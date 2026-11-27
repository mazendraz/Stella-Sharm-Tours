/**
 * A history entry for an overlay (search panel, story viewer), so the
 * browser/phone Back button closes it. Keep one per component instance
 * (useRef) and call attach() from the open effect: React StrictMode runs
 * that effect twice (mount → cleanup → mount); releasing the entry is
 * deferred, so the remount reuses it instead of pushing a second entry and
 * then receiving the first one's popstate (which closed the overlay).
 */
export type HistoryEnv = {
  history: Pick<History, 'state' | 'pushState' | 'back'>;
  addPopstate: (listener: () => void) => void;
  removePopstate: (listener: () => void) => void;
  defer: (fn: () => void) => number;
  cancel: (id: number) => void;
};

const browserEnv = (): HistoryEnv => ({
  history: window.history,
  addPopstate: (l) => window.addEventListener('popstate', l),
  removePopstate: (l) => window.removeEventListener('popstate', l),
  defer: (fn) => window.setTimeout(fn, 0),
  cancel: (id) => window.clearTimeout(id),
});

export function createHistoryEntry(key: string, given?: HistoryEnv) {
  const marker = Date.now().toString(36) + Math.random().toString(36).slice(2);
  let pushed = false,
    release: number | null = null;
  return {
    /**
     * Pushes the entry (once) and calls onBack when the visitor goes Back.
     * The returned cleanup removes the entry, then runs `after` (e.g. focus
     * or a navigation) once the browser has finished going back.
     */
    attach(onBack: () => void, after: () => void = () => {}) {
      const env = given ?? browserEnv();
      if (release !== null) {
        env.cancel(release);
        release = null;
      } else if (!pushed) {
        env.history.pushState({ ...env.history.state, [key]: marker }, '');
        pushed = true;
      }
      const onPop = () => {
        pushed = false;
        onBack();
      };
      env.addPopstate(onPop);
      return () => {
        env.removePopstate(onPop);
        release = env.defer(() => {
          release = null;
          const ours =
            pushed &&
            (env.history.state as Record<string, unknown> | null)?.[key] ===
              marker;
          pushed = false;
          if (!ours) return after();
          const done = () => {
            env.removePopstate(done);
            after();
          };
          env.addPopstate(done);
          env.history.back();
        });
      };
    },
  };
}
