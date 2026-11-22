'use client';
import { create } from 'zustand';
import { requiresPrivateRequest } from '@stella/shared/days';
import type { Trip } from '@stella/shared/public-contract';
import { track } from '@/lib/links';
import type { SavedTrip } from '@/lib/saved-trips';
type RequestState = {
  trips: Trip[];
  format: 'group' | 'private';
  adults: number;
  opener: HTMLElement | null;
};
type Lookup = {
  ids: string[];
  locale: string;
  attempt: number;
  results: SavedTrip[];
};
type Store = {
  ids: string[];
  cache: Record<string, Trip>;
  ready: boolean;
  lookup: Lookup | null;
  lookupAttempt: number;
  resolveLookup: (lookup: Lookup) => void;
  retryLookup: () => void;
  // Free day after flight/overnight trips in My trip (the guest can remove it).
  rest: boolean;
  setRest: (rest: boolean) => void;
  request: RequestState | null;
  toast: 'added' | 'removed' | null;
  overlay: boolean;
  clip: { top: number; right: number; bottom: number; left: number } | null;
  hydrate: () => void;
  sync: (trips: Trip[]) => void;
  toggle: (trip: Trip) => void;
  removeSaved: (slug: string) => void;
  addMany: (trips: Trip[]) => void;
  openRequest: (
    trips: Trip[],
    format?: 'group' | 'private',
    adults?: number,
    opener?: HTMLElement,
  ) => void;
  closeRequest: () => void;
};
function persist(ids: string[]) {
  try {
    localStorage.setItem('stella.mytrip.v1', JSON.stringify(ids));
  } catch {
    /* Selection works in memory. */
  }
}
export const useTripStore = create<Store>((set, get) => ({
  ids: [],
  cache: {},
  ready: false,
  lookup: null,
  lookupAttempt: 0,
  resolveLookup: (lookup) =>
    set((s) => {
      if (lookup.ids !== s.ids || lookup.attempt !== s.lookupAttempt) return s;
      const cache = { ...s.cache };
      for (const result of lookup.results) {
        if (result.status === 'available') cache[result.slug] = result.trip;
      }
      return { lookup, cache };
    }),
  retryLookup: () => set((s) => ({ lookupAttempt: s.lookupAttempt + 1 })),
  rest: true,
  request: null,
  toast: null,
  overlay: false,
  clip: null,
  hydrate: () => {
    let ids: string[] = [];
    try {
      const data = JSON.parse(localStorage.getItem('stella.mytrip.v1') ?? '[]');
      if (Array.isArray(data))
        ids = [
          ...new Set(
            data.filter(
              (x): x is string =>
                typeof x === 'string' && /^[a-z0-9-]{1,120}$/.test(x),
            ),
          ),
        ].slice(0, 38);
    } catch {}
    let rest = true;
    try {
      rest = localStorage.getItem('stella.mytrip.rest') !== 'off';
    } catch {}
    set({ ids, rest, ready: true });
  },
  sync: (trips) =>
    set((s) => ({
      cache: {
        ...s.cache,
        ...Object.fromEntries(trips.map((t) => [t.slug, t])),
      },
    })),
  toggle: (trip) => {
    if (get().ids.includes(trip.slug)) {
      get().sync([trip]);
      get().removeSaved(trip.slug);
      return;
    }
    const ids = [...get().ids, trip.slug].slice(0, 38);
    persist(ids);
    set((s) => ({
      ids,
      cache: { ...s.cache, [trip.slug]: trip },
      toast: 'added',
    }));
    track('trip_add', { slug: trip.slug });
  },
  removeSaved: (slug) => {
    const ids = get().ids.filter((id) => id !== slug);
    persist(ids);
    set({ ids, toast: 'removed' });
    track('trip_remove', { slug });
  },
  addMany: (trips) => {
    const ids = [...new Set([...get().ids, ...trips.map((t) => t.slug)])].slice(
      0,
      38,
    );
    persist(ids);
    get().sync(trips);
    set({ ids, toast: 'added' });
  },
  openRequest: (trips, format = 'group', adults = 1, opener) => {
    if (trips.length === 0) return;
    track('request_open');
    set({
      request: {
        trips,
        adults,
        opener: opener ?? null,
        format: requiresPrivateRequest(trips) ? 'private' : format,
      },
    });
  },
  setRest: (rest) => {
    try {
      localStorage.setItem('stella.mytrip.rest', rest ? 'on' : 'off');
    } catch {
      /* Works in memory. */
    }
    set({ rest });
  },
  closeRequest: () => set({ request: null }),
}));
