// domain/world-info/substrate/book-dedup — THE embedded-book DEDUP RULE, once, pure, and the only home that
// knows it. The book twin of `regex/substrate/dedup`.
//
// WHY IT EXISTS (owner ruling 2026-08-19, issue #303): there is ONE central world_books store and books
// attach through junctions — the regex (D23) / tags (D30) central-with-junction pattern. A character card's
// embedded `character_book` is the FALLBACK channel (the reference channel — `linkCarriedBooks` —
// wins first; the embedded clone only runs when NO reference resolved, exactly like regex's carried-vs-content
// split). Before this rule the fallback ALWAYS minted a fresh world_books row, so importing two cards that
// carry the SAME book bred two central copies. This planner is what lets the fallback LINK to an existing
// book instead of duplicating it.
//
// THE RULE: an incoming embedded book matches an owned library book when its NAME is equal AND its entry set
// is CONTENT-equal. `bookContentKey` canonicalizes with `stableStringify` (object key order is not semantic)
// and SORTS the per-entry keys before joining — so entry ARRAY ORDER is not semantic either (a book's entries
// fire by `priority`, not array position; a re-encode that reorders them is still the same book). The dedup
// key is name + the sorted multiset of normalized entries.
//
// NORMALIZATION is symmetric by construction: `metadata` is already schema-parsed on BOTH sides (the writer
// stores `entryMetadataSchema.parse(raw)`; the caller parses the incoming side the same way before handing it
// here) and `keys` collapses empty→null the way the writer's column does. Miss either and a re-encoded
// identical book fails to match and a duplicate is born.

import type { WorldBookId } from "@orb/kit/ids";
import { stableStringify } from "@orb/kit/stable-stringify";
import type { DedupBook, DedupCandidateBook, DedupLoreEntry } from "../contract/book-dedup.ts";

/** One entry's identity projection: the null-vs-[] `keys` collapse the writer's column applies, everything
 *  else verbatim. `metadata` is already parsed by the caller (see the header) — passed through untouched. */
function normalizeEntry(entry: DedupLoreEntry): Record<string, unknown> {
  return {
    title: entry.title,
    description: entry.description,
    content: entry.content,
    keys: entry.keys !== null && entry.keys.length > 0 ? [...entry.keys] : null,
    enabled: entry.enabled,
    priority: entry.priority,
    ignoreBudget: entry.ignoreBudget,
    metadata: entry.metadata,
  };
}

/** The content-equality key: name + the SORTED per-entry canonical JSON. Sorting the entry keys makes the
 *  book key independent of entry array order; `stableStringify` makes each entry key independent of object
 *  key order. Two books with the same name and the same entry set produce the same key.
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export function bookContentKey(book: DedupBook): string {
  const entryKeys = book.entries.map((entry) => stableStringify(normalizeEntry(entry))).sort();
  return stableStringify({ name: book.name, entries: entryKeys });
}

/** The owned library book the incoming embedded book content-matches, or null (mint a fresh book). Candidates
 *  are already NAME-scoped to the owner by the caller — name is part of the key, so a differently-named book
 *  can never match; the caller's name prefilter is a pure read optimization, not a semantic change. */
export function findDuplicateBook(incoming: DedupBook, candidates: readonly DedupCandidateBook[]): WorldBookId | null {
  const key = bookContentKey(incoming);
  return candidates.find((candidate) => bookContentKey(candidate) === key)?.id ?? null;
}
