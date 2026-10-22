// domain/search/substrate/field-index — the lexical BM25 engine internals. A per-owner in-memory MiniSearch
// index over character-card text fields, fuzzy + prefix, with per-field boosts. Cache is TTL + LRU capped,
// graph-owned (single-replica assumption); nowMs is always the caller's injected clock.

import type { CharacterId, UserId } from "@orb/kit/ids";
import MiniSearch from "minisearch";
import type { FieldIndexCache, FieldIndexCard } from "../contract/field-index.ts";
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

interface IndexCacheEntry {
  readonly index: MiniSearch<FieldIndexCard>;
  readonly builtAtMs: number;
}

/** Own one graph's TTL/LRU index and join its builds before graph disposal completes. */
export function createFieldIndexCache(): FieldIndexCache {
  const lifetime = new AbortController();
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
    readonly promise: Promise<MiniSearch<FieldIndexCard>>;
    readonly flag: { stale: boolean };
  }
  const inFlight = new Map<UserId, FieldIndexBuild>();
  const pending = new Set<FieldIndexBuild["promise"]>();

  /** Drop the owner's index after a card write, so the next search rebuilds over the live card set (its hits
   *  and its coverage counts). The rebuild stays lazy: an import that writes many cards evicts many times and
   *  builds once. */
  function evictFieldIndex(ownerId: UserId): void {
    lifetime.signal.throwIfAborted();
    cache.delete(ownerId);
    const running = inFlight.get(ownerId);
    if (running !== undefined) {
      running.flag.stale = true;
      inFlight.delete(ownerId);
    }
  }

  function buildIndex(docs: readonly FieldIndexCard[]): MiniSearch<FieldIndexCard> {
    const index = new MiniSearch<FieldIndexCard>({
      idField: "id",
      fields: [...INDEX_FIELDS],
      extractField: (doc, field): string => {
        const value = doc[field as keyof FieldIndexCard];
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
  async function getOrBuildFieldIndex(ownerId: UserId, nowMs: number, load: () => Promise<readonly FieldIndexCard[]>): Promise<MiniSearch<FieldIndexCard>> {
    lifetime.signal.throwIfAborted();
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
      promise: (async (): Promise<MiniSearch<FieldIndexCard>> => {
        const entry: IndexCacheEntry = { index: buildIndex(await load()), builtAtMs: nowMs };
        if (!(flag.stale || lifetime.signal.aborted)) {
          touchAndEvict(ownerId, entry);
        }
        return entry.index;
      })(),
    };
    pending.add(build.promise);
    inFlight.set(ownerId, build);
    try {
      return await build.promise;
    } finally {
      pending.delete(build.promise);
      if (inFlight.get(ownerId) === build) {
        inFlight.delete(ownerId);
      }
    }
  }

  return {
    fields: async (params, nowMs, load): Promise<FieldIndexResult> =>
      queryFields(await getOrBuildFieldIndex(params.ownerId, nowMs, load), params.query, params.topN),
    suggest: async (params, nowMs, load): Promise<SearchSuggestion[]> =>
      suggestFields(await getOrBuildFieldIndex(params.ownerId, nowMs, load), params.query, params.limit),
    evict: evictFieldIndex,
    async [Symbol.asyncDispose](): Promise<void> {
      lifetime.abort();
      for (const build of inFlight.values()) {
        build.flag.stale = true;
      }
      cache.clear();
      inFlight.clear();
      // Query callers own build failures; disposal joins all builds, including invalidated ones, without reporting them twice.
      await Promise.allSettled([...pending]);
    },
  };
}

function queryFields(index: MiniSearch<FieldIndexCard>, query: string, topN: number): FieldIndexResult {
  const matches = index.search(query);
  return {
    hits: matches.slice(0, topN).map((row) => ({ characterId: row.id as CharacterId, score: row.score })),
    coverage: { requestLimit: topN, indexedCharacters: index.documentCount, matchingCharacters: matches.length },
  };
}

function suggestFields(index: MiniSearch<FieldIndexCard>, query: string, limit: number): SearchSuggestion[] {
  return index
    .autoSuggest(query, { fuzzy: FUZZY, prefix: true })
    .slice(0, limit)
    .map((s) => ({ suggestion: s.suggestion, score: s.score }));
}
