// domain/search/substrate/field-index — the lexical BM25 engine internals (PD-37). A per-owner in-memory
// MiniSearch index over character-card text fields (`name`/`description`/`personality`/`scenario`/
// `creatorNotes`), fuzzy + prefix, with per-field instruction boosts (a name match outranks a lore match).
// This is the SECOND retrieval surface on the same domain (vector is the first); callers pick the surface
// by verb (`fields`/`suggest`), never a backend. `minisearch` is imported ONLY here (the sealed engine home
// — the `search-minisearch-seal` dep-cruiser rule; the ONLY other minisearch homes are @orb/ui's two).
//
// ── THE CACHE (per-owner, LRU + TTL) ─────────────────────────────────────────────────────────────────────
// Building the index scans the owner's whole card corpus, so it is cached per owner keyed by `UserId`, with:
//   • TTL freshness — an entry older than {@link FIELD_INDEX_TTL_MS} is rebuilt on next use. This is the
//     invalidation strategy (DECIDED TTL-only, not event-driven): a card edit is reflected within one TTL
//     window — good enough for a browse/autocomplete surface, and it avoids coupling search to a
//     `character.updated` subscription. (Upgrade path if staleness ever bites: subscribe + evict the owner's
//     entry on `character.updated`; the cache shape already supports a targeted delete.)
//   • LRU cap — at most {@link FIELD_INDEX_MAX_OWNERS} owners' indexes are held; the least-recently-used is
//     evicted (Map insertion order = recency, re-inserted on hit). Bounds memory on a many-user deployment.
// ASSUMES(single-replica): the cache is module-scope, per-process (the credentials health-cache precedent);
// a multi-replica deploy would hold one index per replica (correct, just not shared). `nowMs` is the caller's
// injected clock (`SearchContext.now` — `no-raw-clock`), never `Date.now()` here.

import type { CharacterId, UserId } from "@orb/kit/ids";
import MiniSearch from "minisearch";
import type { FieldSearchHit, SearchSuggestion } from "../contract/results";

/** How long a built index stays fresh before the next use rebuilds it (5 minutes). */
export const FIELD_INDEX_TTL_MS = 300_000;
/** The LRU cap on how many owners' indexes are held in memory at once. */
export const FIELD_INDEX_MAX_OWNERS = 32;
/** The fuzzy-match edit-distance fraction + the prefix flag — the browse-search recall knobs. */
const FUZZY = 0.2;

/** Per-field score boost — a name match outranks a description/personality match, which outrank scenario/
 *  creatorNotes. The instruction-aware weighting the lexical browse surface wants. */
const FIELD_BOOSTS: Readonly<Record<string, number>> = {
  name: 4,
  description: 2,
  personality: 2,
  scenario: 1,
  creatorNotes: 1,
};

const INDEX_FIELDS = ["name", "description", "personality", "scenario", "creatorNotes"] as const;

/** One card's indexable text (file-private — the verb passes a loader whose row shape structurally
 *  satisfies this; `no-inline-types`). Nullable fields are coerced to `""` at extraction. */
interface CardDoc {
  readonly id: CharacterId;
  readonly name: string;
  readonly description: string | null;
  readonly personality: string | null;
  readonly scenario: string | null;
  readonly creatorNotes: string | null;
}

/** A cached owner index + the wall-clock ms it was built at (TTL freshness). File-private. */
interface IndexCacheEntry {
  readonly index: MiniSearch<CardDoc>;
  readonly builtAtMs: number;
}

const cache = new Map<UserId, IndexCacheEntry>();

function buildIndex(docs: readonly CardDoc[]): MiniSearch<CardDoc> {
  const index = new MiniSearch<CardDoc>({
    idField: "id",
    fields: [...INDEX_FIELDS],
    // Nullable card fields → "" so a card missing a field is still indexed on its present fields.
    extractField: (doc, field): string => {
      const value = doc[field as keyof CardDoc];
      return typeof value === "string" ? value : "";
    },
    searchOptions: { fuzzy: FUZZY, prefix: true, boost: FIELD_BOOSTS },
  });
  index.addAll([...docs]);
  return index;
}

/** Mark `ownerId` most-recently-used (Map insertion order = recency) and evict the LRU tail over cap. */
function touchAndEvict(ownerId: UserId, entry: IndexCacheEntry): void {
  cache.delete(ownerId);
  cache.set(ownerId, entry);
  while (cache.size > FIELD_INDEX_MAX_OWNERS) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    cache.delete(oldest);
  }
}

/**
 * Get the owner's BM25 index — a cache hit (fresh entry) returns without touching the db; a miss / stale
 * entry rebuilds via `load` (the persistence card-fields read) and caches it. `nowMs` is the injected clock.
 */
export async function getOrBuildFieldIndex(
  ownerId: UserId,
  nowMs: number,
  load: () => Promise<readonly CardDoc[]>,
): Promise<MiniSearch<CardDoc>> {
  const cached = cache.get(ownerId);
  if (cached !== undefined && nowMs - cached.builtAtMs < FIELD_INDEX_TTL_MS) {
    touchAndEvict(ownerId, cached);
    return cached.index;
  }
  const entry: IndexCacheEntry = { index: buildIndex(await load()), builtAtMs: nowMs };
  touchAndEvict(ownerId, entry);
  return entry.index;
}

/** Run the BM25 query (fuzzy + prefix + field boosts) and return the top `topN` card ids by score
 *  (the domain's canonical {@link FieldSearchHit} shape — the verb is a thin passthrough). */
export function queryFields(
  index: MiniSearch<CardDoc>,
  query: string,
  topN: number,
): FieldSearchHit[] {
  return index
    .search(query)
    .slice(0, topN)
    .map((r) => ({ characterId: r.id as CharacterId, score: r.score }));
}

/** Autocomplete the partial query into whole-term suggestions (the `suggest` verb), top `limit` by score. */
export function suggestFields(
  index: MiniSearch<CardDoc>,
  query: string,
  limit: number,
): SearchSuggestion[] {
  return index
    .autoSuggest(query, { fuzzy: FUZZY, prefix: true })
    .slice(0, limit)
    .map((s) => ({ suggestion: s.suggestion, score: s.score }));
}
