/**
 * Loads the search index on demand (first open of the search panel) and
 * keeps one matcher per locale for the session. A failed load is forgotten
 * so the panel's Retry fetches again.
 */
import {
  createSearch,
  searchIndexSchema,
  type SearchEntry,
} from '@stella/shared/search';

/** Matcher plus the admin's suggested trips that are in the index. */
export type Search = {
  search: (query: string) => SearchEntry[];
  suggested: SearchEntry[];
};
const cache = new Map<string, Promise<Search>>();

export function loadSearch(locale: string): Promise<Search> {
  let pending = cache.get(locale);
  if (!pending) {
    pending = fetch('/api/search-index?locale=' + encodeURIComponent(locale))
      .then(async (response) => {
        if (!response.ok) throw new Error('SEARCH_INDEX_' + response.status);
        const index = searchIndexSchema.parse(await response.json());
        const bySlug = new Map(index.entries.map((e) => [e.slug, e]));
        return {
          search: createSearch(index),
          suggested: index.suggested.flatMap((slug) => {
            const entry = bySlug.get(slug);
            return entry && entry.type !== 'collection' ? [entry] : [];
          }),
        };
      })
      .catch((error: unknown) => {
        cache.delete(locale);
        throw error;
      });
    cache.set(locale, pending);
  }
  return pending;
}

/** Test helper. */
export function resetSearchCache() {
  cache.clear();
}
