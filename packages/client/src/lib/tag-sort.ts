// The tag-library ORDERING axis — one importable union + one comparator, at the client's lib floor because
// its readers straddle a tier boundary: `features/tag` renders the roster in this order, `state/` persists
// the chosen mode, and the client-shared `TagPickerDialog` (tier-2 components/, which may not import a
// feature) ranks its suggestions with the SAME most-used comparator. A feature-local home would have forced
// a second spelling of the comparator into components/ (the `background-kind-items` / `regex-placement-
// labels` precedent for display vocabulary that outgrew one feature).
//
// MANUAL IS NOT RETIRED (owner ruling 2026-08-03): `sortOrder` keeps its three server-side readers and its
// drag affordance. The two derived modes JOIN it — they do not replace it — and `manual` is the only mode
// that may offer drag, because reordering a derived order writes an order nobody will ever see again.

import type { TagUsage } from "@orb/contracts/tag";

/** The three orderings a tag library can be read in. `used` is the DEFAULT (the owner's ~400-tag library
 *  makes "what am I actually reaching for" the useful first screen); `alpha` is the hunt-by-name scan;
 *  `manual` is the authored `sortOrder`. ONE home — a new member fails `tsc` at every Record over it. */
export const TAG_SORT_MODES = ["used", "alpha", "manual"] as const;
export type TagSortMode = (typeof TAG_SORT_MODES)[number];

/** The mode a tag library opens in when nothing is persisted. */
export const DEFAULT_TAG_SORT_MODE: TagSortMode = "used";

/** The structural subset the comparator reads (never the full `TagWithUsage`) — so the picker's suggestion
 *  ranking and the roster's ordering share one function without sharing a wire type. */
export interface SortableTag {
  readonly name: string;
  readonly sortOrder: number | null;
  readonly usage: Pick<TagUsage, "total">;
}

/** An unordered tag sorts AFTER every ordered one rather than colliding at 0 (`sortOrder` is nullable). */
const UNORDERED = Number.MAX_SAFE_INTEGER;

// A total Record over the union: a fourth mode is a tsc error here, not a silent fall-through to `alpha`.
const COMPARATORS: Record<TagSortMode, (a: SortableTag, b: SortableTag) => number> = {
  // Ties inside a usage bucket resolve by name, so the unused tail is still scannable alphabetically.
  used: (a, b) => b.usage.total - a.usage.total || a.name.localeCompare(b.name),
  alpha: (a, b) => a.name.localeCompare(b.name),
  manual: (a, b) => (a.sortOrder ?? UNORDERED) - (b.sortOrder ?? UNORDERED) || a.name.localeCompare(b.name),
};

/** A NEW array in `mode` order (the input is a query cache's array — sorting it in place would mutate the
 *  cache). Pure + total: every mode has a comparator by construction. */
export function sortTagsBy<T extends SortableTag>(tags: readonly T[], mode: TagSortMode): readonly T[] {
  return [...tags].sort(COMPARATORS[mode]);
}
