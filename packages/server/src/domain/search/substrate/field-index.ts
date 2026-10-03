// domain/search/substrate/field-index — the lexical BM25 engine internals. A per-owner in-memory MiniSearch
// index over character-card text fields, fuzzy + prefix, with per-field boosts. Cache is TTL + LRU capped,
// module-scope per-process (single-replica assumption); nowMs is always the caller's injected clock.

import type { CharacterId, UserId } from "@orb/kit/ids";
import MiniSearch from "minisearch";
import type { FieldIndexResult, SearchSuggestion } from "../contract/results.ts";

/** @public Test-anchored module surface; focused tests pin this production-local behavior. */
export const FIELD_INDEX_TTL_MS = 300_000;
const FIELD_INDEX_MAX_OWNERS = 32;
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

// SINGLE-FLIGHT: the build in progress per owner, so N concurrent misses do ONE load + ONE tokenization pass.
// A miss is the expensive path (every card's text out of the db, then MiniSearch's full inversion), and the
// omnibox fires `fields` and `suggest` on the same keystroke — so the misses arrive TOGETHER by construction,
// each doing the whole job and then racing to publish the same index. Keyed by owner: two owners' rebuilds are
// unrelated work and must not queue behind each other.
//
// An eviction marks the owner's running build `stale`, so a build that loaded the cards before a delete cannot
// republish the deleted card after the eviction. The flag lives on the build itself, so nothing outlives the
// build and no per-owner map grows with the owner count.
interface FieldIndexBuild {
  readonly promise: Promise<MiniSearch<CardDoc>>;
  readonly flag: { stale: boolean };
}
const inFlight = new Map<UserId, FieldIndexBuild>();

/** Drop the owner's index after a card write, so the next search rebuilds over the live card set (its hits
 *  and its coverage counts). The rebuild stays lazy: an import that writes many cards evicts many times and
 *  builds once. */
export function evictFieldIndex(ownerId: UserId): void {
  cache.delete(ownerId);
  const running = inFlight.get(ownerId);
  if (running !== undefined) {
    running.flag.stale = true;
    inFlight.delete(ownerId);
  }
}

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

/** Cache hit (fresh) returns without touching the db; miss/stale rebuilds via `load` and caches it. Concurrent
 *  misses for one owner SHARE that rebuild — the second caller awaits the first's promise instead of running a
 *  second load. A failed build is not cached: the entry is only published on success, and the in-flight slot is
 *  released either way, so the next caller retries rather than inheriting the failure. */
export async function getOrBuildFieldIndex(ownerId: UserId, nowMs: number, load: () => Promise<readonly CardDoc[]>): Promise<MiniSearch<CardDoc>> {
  const cached = cache.get(ownerId);
  if (cached !== undefined && nowMs - cached.builtAtMs < FIELD_INDEX_TTL_MS) {
    touchAndEvict(ownerId, cached);
    return cached.index;
  }
  const running = inFlight.get(ownerId);
  if (running !== undefined) {
    return await running.promise;
  }
  const flag: FieldIndexBuild["flag"] = { stale: false };
  const build: FieldIndexBuild = {
    flag,
    promise: (async (): Promise<MiniSearch<CardDoc>> => {
      const entry: IndexCacheEntry = { index: buildIndex(await load()), builtAtMs: nowMs };
      if (!flag.stale) {
        touchAndEvict(ownerId, entry);
      }
      return entry.index;
    })(),
  };
  inFlight.set(ownerId, build);
  try {
    return await build.promise;
  } finally {
    if (inFlight.get(ownerId) === build) {
      inFlight.delete(ownerId);
    }
  }
}

/** Run the BM25 query (fuzzy + prefix + field boosts), return the top `topN` card ids by score. */
export function queryFields(index: MiniSearch<CardDoc>, query: string, topN: number): FieldIndexResult {
  const matches = index.search(query);
  return {
    hits: matches.slice(0, topN).map((row) => ({ characterId: row.id as CharacterId, score: row.score })),
    coverage: { requestLimit: topN, indexedCharacters: index.documentCount, matchingCharacters: matches.length },
  };
}

/** Autocomplete the partial query into whole-term suggestions (the `suggest` verb), top `limit` by score. */
export function suggestFields(index: MiniSearch<CardDoc>, query: string, limit: number): SearchSuggestion[] {
  return index
    .autoSuggest(query, { fuzzy: FUZZY, prefix: true })
    .slice(0, limit)
    .map((s) => ({ suggestion: s.suggestion, score: s.score }));
}
