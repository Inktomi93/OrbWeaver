// The heal-wave/invalidate-wave COLLAPSE — extracted from invalidation.ts (component-size cap) as
// pure logic with one consumer: invalidateFilters, the sole invalidateQueries call site.
import type { InvalidateQueryFilters, QueryKey } from "@tanstack/react-query";
import { partialMatchKey } from "@tanstack/react-query";

type InvalidateFilter = InvalidateQueryFilters;

/** A filter that narrows on NOTHING but its key — the only shape whose coverage is decidable from the key
 *  alone. Every filter this seam is handed is one (they all come from the tRPC proxy's `pathFilter()` /
 *  `queryFilter(input)`, neither of which is ever passed options here), but a filter carrying `exact` /
 *  `predicate` / `refetchType` would mean something the key does not say, so it is never used to eliminate
 *  another and is never eliminated. */
function isKeyOnlyFilter(filter: InvalidateFilter): filter is InvalidateFilter & { readonly queryKey: QueryKey } {
  return filter.queryKey !== undefined && Object.keys(filter).every((prop) => prop === "queryKey");
}

/** Does `broad` reach every query `narrow` would? react-query matches a filter key by PARTIAL PREFIX
 *  (`partialMatchKey`, the same predicate `matchQuery` runs), so a key that is itself a partial prefix of
 *  another names a strictly wider set: `[["persona"]]` (the root `pathFilter`) covers `[["persona","list"]]`. */
function subsumes(broad: InvalidateFilter, narrow: InvalidateFilter): boolean {
  return isKeyOnlyFilter(broad) && isKeyOnlyFilter(narrow) && partialMatchKey(narrow.queryKey, broad.queryKey);
}

/**
 * Collapse ONE WAVE to the minimal set of filters that reaches the same queries — drop every filter another
 * filter in the same wave already covers (an exact repeat, or a narrower key under a broader one).
 *
 * This is a WIRE-COST rule, not a semantic one: the wave is one synchronous pass, so two filters covering the
 * same query are indistinguishable in what they refresh and distinguishable only in what they SPEND.
 * `invalidateQueries` does not dedupe against an in-flight fetch — it cancels and RESTARTS it — so each
 * redundant row is a real second round trip, in the same shape BOOT-4X was minted against.
 *
 * It bites hardest on the derived reconnect gap-heal (`allUserRootFilters`), whose set is the UNION of every
 * user-map row: the W7b `identityChanged` member (`0bdbb7366`) mapped `persona.list` while `personasChanged`
 * already carried the `persona` ROOT, so every reconnect fetched persona twice
 * (`tests/client/data/bus/use-user-bus.ct.tsx:77` — persona.list 3, expected 2). The same union also repeated
 * `getUserSettings`, `regex.listScriptUsage`, `previewContextFit` and the three prompt-preview reads. Fixing
 * it HERE rather than in the derivation is what keeps the class unmakeable: the map rows stay free to name
 * the reads they own (rows overlapping is correct — they fire independently), and no future member can drift
 * a heal wave back into a double fetch.
 */
export function collapseFilters(filters: readonly InvalidateFilter[]): readonly InvalidateFilter[] {
  const kept: InvalidateFilter[] = [];
  for (const filter of filters) {
    if (kept.some((already) => subsumes(already, filter))) {
      continue;
    }
    // The broader filter can arrive second (map order is by event member, not by breadth), so a kept row this
    // one covers is dropped in its favour — the result is order-independent.
    for (let i = kept.length - 1; i >= 0; i -= 1) {
      const already = kept[i];
      if (already !== undefined && subsumes(filter, already)) {
        kept.splice(i, 1);
      }
    }
    kept.push(filter);
  }
  return kept;
}
