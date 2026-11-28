'use client';
import { create } from 'zustand';
import { requiresPrivateRequest } from '@stella/shared/days';
import type { Text, Trip } from '@stella/shared/public-contract';
import { track } from '@/lib/links';
import type { SavedTrip } from '@/lib/saved-trips';
type RequestState = {
  trips: Trip[];
  format: 'group' | 'private';
  adults: number;
  opener: HTMLElement | null;
  preserveOrder: boolean;
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
  order: string[] | null;
  moveSaved: (slug: string, target: string, visibleOrder: string[]) => void;
  ready: boolean;
  lookup: Lookup | null;
  lookupAttempt: number;
  resolveLookup: (lookup: Lookup) => void;
  retryLookup: () => void;
  // Free day after flight/overnight trips in My trip (the guest can remove it).
  rest: boolean;
  setRest: (rest: boolean) => void;
  request: RequestState | null;
  toast: { message: 'added' | 'removed' } | null;
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
    preserveOrder?: boolean,
  ) => void;
  closeRequest: () => void;
  // Reference of the last request sent from this device (no personal data).
  lastRequest: string | null;
  // After a request is sent: drop the requested trips and remember the ref.
  completeRequest: (ref: string, slugs: string[]) => void;
  // Floating WhatsApp button: the line for this language and the names of
  // collections the guest has opened, so the message can say what they see.
  whatsappNumber: string | null;
  collectionNames: Record<string, Text>;
  nameCollection: (slug: string, name: Text) => void;
};
const LAST_REQUEST_KEY = 'stella.lastrequest.v1';
// The "Request STL-…" shortcut stays for a week, then the button goes away.
const LAST_REQUEST_TTL = 7 * 24 * 60 * 60 * 1000;
function persist(ids: string[], order: string[] | null) {
  try {
    localStorage.setItem(
      'stella.mytrip.v1',
      JSON.stringify(order ? { order } : ids),
    );
  } catch {
    /* Selection works in memory. */
  }
}
export const useTripStore = create<Store>((set, get) => ({
  ids: [],
  cache: {},
  order: null,
  moveSaved: (slug, target, visibleOrder) => {
    const { ids, order } = get();
    const current = order ?? [
      ...visibleOrder,
      ...ids.filter((id) => !visibleOrder.includes(id)),
    ];
    const from = current.indexOf(slug);
    const to = current.indexOf(target);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...current];
    next.splice(from, 1);
    next.splice(to, 0, slug);
    persist(ids, next);
    set({ order: next });
  },
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
    let order: string[] | null = null;
    try {
      const data = JSON.parse(localStorage.getItem('stella.mytrip.v1') ?? '[]');
      const values = Array.isArray(data) ? data : data?.order;
      if (Array.isArray(values)) {
        ids = [
          ...new Set(
            values.filter(
              (x): x is string =>
                typeof x === 'string' && /^[a-z0-9-]{1,120}$/.test(x),
            ),
          ),
        ].slice(0, 38);
        if (!Array.isArray(data) && ids.length) order = ids;
      }
    } catch {}
    let rest = true;
    try {
      rest = localStorage.getItem('stella.mytrip.rest') !== 'off';
    } catch {}
    let lastRequest: string | null = null;
    try {
      const saved = JSON.parse(
        localStorage.getItem(LAST_REQUEST_KEY) ?? 'null',
      );
      if (
        typeof saved?.ref === 'string' &&
        /^STL-[A-Z0-9]{3,30}$/.test(saved.ref) &&
        typeof saved.at === 'number' &&
        Date.now() - saved.at < LAST_REQUEST_TTL
      )
        lastRequest = saved.ref;
      else localStorage.removeItem(LAST_REQUEST_KEY);
    } catch {}
    set({ ids, order, rest, lastRequest, ready: true });
  },
  lastRequest: null,
  completeRequest: (ref, slugs) => {
    const ids = get().ids.filter((id) => !slugs.includes(id));
    const order = ids.length
      ? (get().order?.filter((id) => !slugs.includes(id)) ?? null)
      : null;
    persist(ids, order);
    try {
      localStorage.setItem(
        LAST_REQUEST_KEY,
        JSON.stringify({ ref, at: Date.now() }),
      );
    } catch {
      /* The shortcut still shows for this visit. */
    }
    set({ ids, order, lastRequest: ref });
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
    if (get().ids.length >= 38) return;
    const ids = [...get().ids, trip.slug];
    const currentOrder = get().order;
    const order = currentOrder && [...currentOrder, trip.slug];
    persist(ids, order);
    set((s) => ({
      ids,
      order,
      cache: { ...s.cache, [trip.slug]: trip },
      toast: { message: 'added' },
    }));
    track('trip_add', { slug: trip.slug });
  },
  removeSaved: (slug) => {
    const ids = get().ids.filter((id) => id !== slug);
    const order = ids.length
      ? (get().order?.filter((id) => id !== slug) ?? null)
      : null;
    persist(ids, order);
    set({ ids, order, toast: { message: 'removed' } });
    track('trip_remove', { slug });
  },
  addMany: (trips) => {
    const ids = [...new Set([...get().ids, ...trips.map((t) => t.slug)])].slice(
      0,
      38,
    );
    const currentOrder = get().order;
    const order = currentOrder && [
      ...currentOrder,
      ...ids.filter((id) => !currentOrder.includes(id)),
    ];
    persist(ids, order);
    get().sync(trips);
    set({ ids, order, toast: { message: 'added' } });
  },
  openRequest: (
    trips,
    format = 'group',
    adults = 1,
    opener,
    preserveOrder = false,
  ) => {
    if (trips.length === 0) return;
    track('request_open');
    set({
      request: {
        trips,
        adults,
        opener: opener ?? null,
        preserveOrder,
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
  whatsappNumber: null,
  collectionNames: {},
  nameCollection: (slug, name) =>
    set((s) =>
      s.collectionNames[slug]?.text === name.text
        ? s
        : { collectionNames: { ...s.collectionNames, [slug]: name } },
    ),
}));
