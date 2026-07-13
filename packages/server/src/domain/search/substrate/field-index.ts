// domain/search/substrate/field-index — the lexical BM25 engine internals. A per-owner in-memory MiniSearch
// index over character-card text fields, fuzzy + prefix, with per-field boosts. Cache is TTL + LRU capped,
// module-scope per-process (single-replica assumption); nowMs is always the caller's injected clock.

import type { CharacterId, UserId } from "@orb/kit/ids";
import MiniSearch from "minisearch";
import type { FieldSearchHit, SearchSuggestion } from "../contract/results";

export const FIELD_INDEX_TTL_MS = 300_000;
export const FIELD_INDEX_MAX_OWNERS = 32;
const FUZZY = 0.2;

/** Per-field score boost — a name match outranks description/personality, which outrank scenario/creatorNotes. */
const FIELD_BOOSTS: Readonly<Record<string, number>> = {
  name: 4,
  description: 2,
  personality: 2,
  scenario: 1,
  creatorNotes: 1,
};

const INDEX_FIELDS = ["name", "description", "personality", "scenario", "creatorNotes"] as const;

interface CardDoc {
  readonly id: CharacterId;
  readonly name: string;
  readonly description: string | null;
  readonly personality: string | null;
  readonly scenario: string | null;
  readonly creatorNotes: string | null;
}

interface IndexCacheEntry {
  readonly index: MiniSearch<CardDoc>;
  readonly builtAtMs: number;
}

// ASSUMES(single-replica): per-process index cache — replicas would serve divergent staleness.
const cache = new Map<UserId, IndexCacheEntry>();

function buildIndex(docs: readonly CardDoc[]): MiniSearch<CardDoc> {
  const index = new MiniSearch<CardDoc>({
    idField: "id",
    fields: [...INDEX_FIELDS],
    extractField: (doc, field): string => {
      const value = doc[field as keyof CardDoc];
      return typeof value === "string" ? value : "";
    },
    searchOptions: { fuzzy: FUZZY, prefix: true, boost: FIELD_BOOSTS },
  });
  index.addAll([...docs]);
  return index;
}

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

/** Cache hit (fresh) returns without touching the db; miss/stale rebuilds via `load` and caches it. */
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

/** Run the BM25 query (fuzzy + prefix + field boosts), return the top `topN` card ids by score. */
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
