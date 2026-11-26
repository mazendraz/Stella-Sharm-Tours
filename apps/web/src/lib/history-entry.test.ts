import { describe, expect, it, vi } from 'vitest';
import { createHistoryEntry, type HistoryEnv } from './history-entry';

/** A tiny browser-history double: stack of states, async popstate, timers. */
function fakeEnv() {
  const stack: unknown[] = [{ base: true }];
  let index = 0;
  const listeners = new Set<() => void>();
  const timers: (() => void)[] = [];
  const queue: (() => void)[] = [];
  const env: HistoryEnv = {
    history: {
      get state() {
        return stack[index];
      },
      pushState(state: unknown) {
        stack.splice(index + 1);
        stack.push(state);
        index++;
      },
      back() {
        queue.push(() => {
          if (index > 0) index--;
          for (const l of [...listeners]) l();
        });
      },
    },
    addPopstate: (l) => listeners.add(l),
    removePopstate: (l) => listeners.delete(l),
    defer: (fn) => {
      timers.push(fn);
      return timers.length - 1;
    },
    cancel: (id) => {
      timers[id] = () => {};
    },
  };
  const flush = () => {
    while (timers.length || queue.length) {
      for (const t of timers.splice(0)) t();
      for (const q of queue.splice(0)) q();
    }
  };
  return {
    env,
    flush,
    depth: () => index,
    userBack: () => env.history.back(),
  };
}

describe('createHistoryEntry', () => {
  it('survives a StrictMode mount → unmount → mount without closing', () => {
    const h = fakeEnv(),
      onBack = vi.fn(),
      after = vi.fn();
    const entry = createHistoryEntry('stellaSearch', h.env);
    const detach = entry.attach(onBack, after);
    detach(); // StrictMode simulated unmount…
    entry.attach(onBack, after); // …and immediate remount
    h.flush();
    expect(onBack).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
    expect(h.depth()).toBe(1); // one entry, not two
  });
  it('removes its entry on a real close, then runs the follow-up', () => {
    const h = fakeEnv(),
      onBack = vi.fn(),
      after = vi.fn();
    const entry = createHistoryEntry('stellaSearch', h.env);
    const detach = entry.attach(onBack, after);
    expect(h.depth()).toBe(1);
    detach();
    h.flush();
    expect(h.depth()).toBe(0);
    expect(after).toHaveBeenCalledTimes(1);
    expect(onBack).not.toHaveBeenCalled();
  });
  it('closes on the browser Back button without going back twice', () => {
    const h = fakeEnv(),
      after = vi.fn();
    const entry = createHistoryEntry('stellaSearch', h.env);
    let detach = () => {};
    const onBack = vi.fn(() => detach());
    detach = entry.attach(onBack, after);
    h.userBack();
    h.flush();
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
    expect(h.depth()).toBe(0);
  });
});
