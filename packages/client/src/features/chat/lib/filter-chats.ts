// lib/filter-chats — the pure title/participant search-over-collection filter (UIP-303). UI-Arch §4a
// calls for `useDeferredValue` on any search box over a collection; the deferred VALUE lives in the
// surface component, and this is the pure predicate it feeds — extracted so it's unit-testable without a
// browser (Spine-Testing.md §7). Mirrors `features/character/lib/filter-characters.ts` (a near-identical
// one-liner — kept a local duplicate, not a sideways import; promote to a shared home only on a 3rd
// consumer, §13.0's "repeated 3+ times AND changing together" bar).
//
// Client-side only: `chat.listChats` has no server-side search param, so this filters whatever the read
// already returned (the whole unpaged membership list).

export interface FilterableChat {
  readonly title: string | null;
  readonly participantNames: readonly string[];
  readonly lastMessagePreview: string | null;
}

/** Case-insensitive substring match against the title, any participant name, OR the last-message
 *  preview (owner ruling 2026-08-01: a remembered phrase should find the chat; full message-content
 *  search is a separate concern — this matches only the snippet the row already shows). An
 *  empty/whitespace query matches everything (the unfiltered list). A null title/preview never
 *  matches (only the other fields can). */
export function filterChats<T extends FilterableChat>(items: readonly T[], query: string): readonly T[] {
  const q = query.trim().toLowerCase();
  if (q === "") {
    return items;
  }
  return items.filter(
    (item) =>
      (item.title?.toLowerCase().includes(q) ?? false) ||
      (item.lastMessagePreview?.toLowerCase().includes(q) ?? false) ||
      item.participantNames.some((name) => name.toLowerCase().includes(q)),
  );
}
