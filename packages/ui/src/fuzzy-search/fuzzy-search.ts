// Generic client-side fuzzy + prefix search over any `{ id, … }` list — minisearch sealed behind a
// ui hook (the SECOND sanctioned minisearch home beside macro-textarea; dep-cruiser
// ui-satellite-seals lists both). Carried from neo `_shared/use-fuzzy-search` (the cross-feature
// browse-search every library surface used) with its two measured perf lessons intact:
//   • LAZY module-level index cache — `addAll` over a big corpus is a synchronous long task
//     (735 chats ≈ 350–1500ms, the 2026-06-10 index-page jank); no index builds on mount. WeakMap
//     on the items array identity → the index dies with the query-cache row (no leak) and two
//     consumers over the SAME array share one build.
//   • VALUE-keyed memo deps — consumers pass inline field-array literals (fresh refs per render);
//     reference-keyed deps would rebuild the index per keystroke.
// The key affordance: ONE indexed instance, MULTIPLE search scopes — index every searchable field
// upfront, pick the per-call subset via `searchFields` (a "Name only" toggle is a per-call option,
// not an index rebuild). Empty/whitespace query → `items` as-is (original order). Pairs with
// `createCollectionSurface` as the filter half of a browse view.

import type { SearchOptions } from "minisearch";
import MiniSearch from "minisearch";
import { useEffect, useMemo } from "react";

export interface FuzzySearchOptions<T> {
  /** Fields to INDEX upfront (one-time, memoized on items+fields); all become searchable. */
  readonly fields: readonly (keyof T & string)[];
  /** Optional per-call subset of `fields` to actually search. Omit = search ALL indexed fields. */
  readonly searchFields?: readonly (keyof T & string)[];
  /** Fields returned with each match. Defaults to all `fields`. */
  readonly storeFields?: readonly (keyof T & string)[];
  /** Per-field score boost (e.g. `{ name: 4 }` — name matches outrank description matches). */
  readonly boost?: Partial<Record<keyof T & string, number>>;
  /** Fuzziness 0..1. @defaultValue 0.2 (minisearch's own default, kept) */
  readonly fuzzy?: number;
  /** Prefix matching — partial typing matches. @defaultValue true */
  readonly prefix?: boolean;
  /** Cap returned matches. @defaultValue 100 */
  readonly limit?: number;
  /** Combine clause across query terms. @defaultValue "AND" */
  readonly combineWith?: "AND" | "OR";
}

const DEFAULT_LIMIT = 100;
const DEFAULT_FUZZY = 0.2;
const IDLE_WARMUP_TIMEOUT_MS = 2000;
const WARMUP_FALLBACK_DELAY_MS = 500;

// The idle-callback surface, structurally typed off `globalThis` — this file is followed by the
// node typecheck lane (no `dom` lib), and node's types lack requestIdleCallback.
interface IdleGlobals {
  readonly requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  readonly cancelIdleCallback?: (id: number) => void;
  readonly setTimeout: (cb: () => void, ms: number) => unknown;
  readonly clearTimeout: (id: unknown) => void;
}

// The lazy index cache — see the header. The inner Map disambiguates field configs per items array.
const indexCache = new WeakMap<readonly unknown[], Map<string, MiniSearch<never>>>();

interface IndexArgs<T> {
  readonly items: readonly T[];
  readonly fieldsKey: string;
  readonly storeFieldsKey: string;
  readonly fields: readonly (keyof T & string)[];
  readonly storeFields: readonly (keyof T & string)[] | undefined;
}

function getOrBuildIndex<T extends { id: string }>(args: IndexArgs<T>): MiniSearch<T> {
  const { items, fieldsKey, storeFieldsKey, fields, storeFields } = args;
  let byConfig = indexCache.get(items);
  if (byConfig === undefined) {
    byConfig = new Map();
    indexCache.set(items, byConfig);
  }
  const configKey = `${fieldsKey} ${storeFieldsKey}`;
  const hit = byConfig.get(configKey);
  if (hit !== undefined) {
    return hit as MiniSearch<T>;
  }
  const ms = new MiniSearch<T>({
    // The item's own `id` field is the index key — callers guarantee unique string ids (every orb
    // entity is a branded id, so this holds by construction).
    idField: "id",
    fields: fields as string[],
    storeFields: (storeFields ?? fields) as string[],
  });
  ms.addAll(items as T[]);
  byConfig.set(configKey, ms as MiniSearch<never>);
  return ms;
}

/**
 * The DOM-free core of {@link useFuzzySearch}: empty/whitespace query → `items` unchanged
 * (original order); else minisearch-ranked matches mapped back to the ORIGINAL item shape and
 * capped at `limit`. A plain function so the ranking logic is node-testable without a browser
 * render; the hook wraps it in `useMemo`.
 */
export function fuzzySearch<T extends { id: string }>(
  items: readonly T[],
  query: string,
  options: FuzzySearchOptions<T>,
): readonly T[] {
  const { fields, storeFields } = options;
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return items;
  }

  const fieldsKey = fields.join(" ");
  const storeFieldsKey = (storeFields ?? fields).join(" ");
  const searchOptions: SearchOptions = {
    prefix: options.prefix ?? true,
    fuzzy: options.fuzzy ?? DEFAULT_FUZZY,
    combineWith: options.combineWith ?? "AND",
    ...(options.boost === undefined ? {} : { boost: options.boost as Record<string, number> }),
    ...(options.searchFields === undefined ? {} : { fields: options.searchFields as string[] }),
  };
  const hits = getOrBuildIndex({ items, fieldsKey, storeFieldsKey, fields, storeFields }).search(
    trimmed,
    searchOptions,
  );
  const limit = options.limit ?? DEFAULT_LIMIT;
  // minisearch returns id+score+storeFields; map back to the original item by id so callers keep
  // their own type without widening.
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

export function useFuzzySearch<T extends { id: string }>(
  items: readonly T[],
  query: string,
  options: FuzzySearchOptions<T>,
): readonly T[] {
  const { fields, storeFields } = options;
  const fieldsKey = fields.join(" ");
  const storeFieldsKey = (storeFields ?? fields).join(" ");
  // Idle warmup: pre-fill the index cache off the critical path so neither the mount commit NOR
  // the first keystroke eats the full build. Re-arms on items/field-key change (a stale-armed
  // callback is a cheap no-op — getOrBuildIndex cache-hits).
  // biome-ignore lint/correctness/useExhaustiveDependencies: fields/storeFields ride their joined VALUE keys — inline array literals are fresh refs each render and would re-arm every render (the neo-measured keystroke-reindex hotspot).
  useEffect(() => {
    if (items.length === 0) {
      return;
    }
    const warm = (): void => {
      getOrBuildIndex({ items, fieldsKey, storeFieldsKey, fields, storeFields });
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
  }, [items, fieldsKey, storeFieldsKey]);

  const boostKey = JSON.stringify(options.boost ?? null);
  const searchFieldsKey = options.searchFields?.join(" ") ?? "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: same value-keying as the warmup effect; the pure body lives in fuzzySearch().
  return useMemo(
    () => fuzzySearch(items, query, options),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- value-keyed deps (see biome-ignore above)
    [
      items,
      fieldsKey,
      storeFieldsKey,
      query,
      boostKey,
      options.combineWith,
      options.fuzzy,
      options.limit,
      options.prefix,
      searchFieldsKey,
    ],
  );
}
