// Generic client-side fuzzy + prefix search over any `{ id, … }` list, minisearch sealed behind a
// hook. Index is built LAZILY and cached on the items array's identity (a synchronous addAll over a
// big corpus is a long task); results are cached on the items identity plus the VALUE of the query and options
// (inline option literals are fresh refs per render, so reference keys would re-search and re-rank every render).

import type { SearchOptions } from "minisearch";
import MiniSearch from "minisearch";
import { useEffect } from "react";

export interface FuzzySearchOptions<T> {
  /** Fields to INDEX upfront (one-time, memoized on items+fields); all become searchable. */
  readonly fields: readonly (keyof T & string)[];
  /** Optional per-call subset of `fields` to actually search. Omit = search ALL indexed fields. */
  readonly searchFields?: readonly (keyof T & string)[];
  /** Per-field score boost (e.g. `{ name: 4 }` — name matches outrank description matches). */
  readonly boost?: Partial<Record<keyof T & string, number>>;
  /** @defaultValue 100 */
  readonly limit?: number;
}

const DEFAULT_LIMIT = 100;
// Typo tolerance 0..1; every search is prefix-matching and every term must hit (AND).
const FUZZY = 0.2;
const IDLE_WARMUP_TIMEOUT_MS = 2000;
const WARMUP_FALLBACK_DELAY_MS = 500;

// Structurally typed off `globalThis` — the node typecheck lane follows this file and lacks requestIdleCallback.
interface IdleGlobals {
  readonly requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  readonly cancelIdleCallback?: (id: number) => void;
  readonly setTimeout: (cb: () => void, ms: number) => unknown;
  readonly clearTimeout: (id: unknown) => void;
}

// The inner Map disambiguates field configs per items array.
const indexCache = new WeakMap<readonly unknown[], Map<string, MiniSearch<never>>>();
// Ranked results per items array and option/query value key; a typing session visits few distinct queries.
const MAX_CACHED_RESULTS = 64;
const resultCache = new WeakMap<readonly unknown[], Map<string, readonly unknown[]>>();

interface IndexArgs<T> {
  readonly items: readonly T[];
  readonly fieldsKey: string;
  readonly fields: readonly (keyof T & string)[];
}

function getOrBuildIndex<T extends { id: string }>(args: IndexArgs<T>): MiniSearch<T> {
  const { items, fieldsKey, fields } = args;
  // `getOrInsertComputed` is not in the browser floor (Chrome 145, Firefox 144, Safari 26.2).
  const byConfig = indexCache.get(items) ?? new Map<string, MiniSearch<never>>();
  indexCache.set(items, byConfig);
  const hit = byConfig.get(fieldsKey);
  if (hit !== undefined) {
    return hit as MiniSearch<T>;
  }
  const ms = new MiniSearch<T>({
    idField: "id",
    fields: fields as string[],
    storeFields: fields as string[],
  });
  ms.addAll(items as T[]);
  byConfig.set(fieldsKey, ms as MiniSearch<never>);
  return ms;
}

function rankedMatches<T extends { id: string }>(items: readonly T[], trimmed: string, options: FuzzySearchOptions<T>, fieldsKey: string): readonly T[] {
  const searchOptions: SearchOptions = {
    prefix: true,
    fuzzy: FUZZY,
    combineWith: "AND",
    ...(options.boost === undefined ? {} : { boost: options.boost as Record<string, number> }),
    ...(options.searchFields === undefined ? {} : { fields: options.searchFields as string[] }),
  };
  const hits = getOrBuildIndex({ items, fieldsKey, fields: options.fields }).search(trimmed, searchOptions);
  const limit = options.limit ?? DEFAULT_LIMIT;
  // Map back to the original item by id so callers keep their own type without widening.
  const byId = new Map(items.map((it) => [it.id, it]));
  const out: T[] = [];
  for (const hit of hits) {
    const item = byId.get(hit.id as string);
    if (item !== undefined) {
      out.push(item);
      if (out.length >= limit) {
        break;
      }
    }
  }
  return out;
}

/** DOM-free core of {@link useFuzzySearch}: empty query → `items` unchanged; else ranked matches capped at `limit`. */
export function fuzzySearch<T extends { id: string }>(items: readonly T[], query: string, options: FuzzySearchOptions<T>): readonly T[] {
  const { fields } = options;
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return items;
  }
  const fieldsKey = fields.join(" ");
  let byQuery = resultCache.get(items);
  if (byQuery === undefined) {
    byQuery = new Map();
    resultCache.set(items, byQuery);
  }
  const resultKey = JSON.stringify([trimmed, fieldsKey, options.searchFields, options.boost, options.limit]);
  const cached = byQuery.get(resultKey);
  if (cached !== undefined) {
    return cached as readonly T[];
  }
  const out = rankedMatches(items, trimmed, options, fieldsKey);
  if (byQuery.size >= MAX_CACHED_RESULTS) {
    byQuery.clear();
  }
  byQuery.set(resultKey, out);
  return out;
}

export function useFuzzySearch<T extends { id: string }>(items: readonly T[], query: string, options: FuzzySearchOptions<T>): readonly T[] {
  const { fields } = options;
  const fieldsKey = fields.join(" ");
  // Idle warmup: pre-fill the index cache off the critical path so neither the mount commit nor the
  // first keystroke eats the full build.
  // biome-ignore lint/correctness/useExhaustiveDependencies: fields rides its joined VALUE key — inline array literals are fresh refs each render and would re-arm every render (the neo-measured keystroke-reindex hotspot).
  useEffect(() => {
    if (items.length === 0) {
      return;
    }
    const warm = (): void => {
      getOrBuildIndex({ items, fieldsKey, fields });
    };
    const g = globalThis as IdleGlobals;
    if (typeof g.requestIdleCallback === "function") {
      const id = g.requestIdleCallback(warm, { timeout: IDLE_WARMUP_TIMEOUT_MS });
      return (): void => {
        g.cancelIdleCallback?.(id);
      };
    }
    const id = g.setTimeout(warm, WARMUP_FALLBACK_DELAY_MS);
    return (): void => {
      g.clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- value-keyed deps (see biome-ignore above)
  }, [items, fieldsKey]);

  return fuzzySearch(items, query, options);
}
