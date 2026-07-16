// lib/filter-characters — the pure name/tag search-over-collection filter. UI-Arch §4a calls for
// `useDeferredValue` on any search box over a collection; the deferred VALUE lives in the surface
// component, and this is the pure predicate it feeds — extracted so it's unit-testable without a browser
// (Spine-Testing.md §7: "extract DOM-free logic to a function over reaching for a browser").
//
// Client-side only: `character.list` has no server-side search param (see the surface's missing-API
// note), so this filters whatever page of characters the read already returned.

export interface FilterableCharacter {
  readonly name: string;
  readonly tags: readonly { readonly name: string }[];
}

/** Case-insensitive substring match against the name OR any tag name. An empty/whitespace query matches
 *  everything (the unfiltered library). */
export function filterCharacters<T extends FilterableCharacter>(items: readonly T[], query: string): readonly T[] {
  const q = query.trim().toLowerCase();
  if (q === "") {
    return items;
  }
  return items.filter((item) => item.name.toLowerCase().includes(q) || item.tags.some((tag) => tag.name.toLowerCase().includes(q)));
}
