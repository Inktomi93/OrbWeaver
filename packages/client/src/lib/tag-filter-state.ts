// The tag-FILTER axis — a three-state chip (off → include → exclude → off), the ST `toggleTagThreeState`
// capability neither our lineage nor neo ever built. "Everything tagged `npc` that ISN'T `retired`" is a
// query shape a pure-AND multi-select cannot express at all, and at ~400 tags it is a routine one.
//
// The axis lives at the lib floor because `state/` persists it and `features/character` both renders and
// applies it, and state/ may not import a feature. ONE union, and the two ACTIVE members are DERIVED from
// it (`Exclude<…, "off">`) rather than re-spelled — `off` is the absence of an entry, so it is never stored.
// A fourth state fails `tsc` at the cycle Record, at the chip's presentation Record, and at the predicate
// Record in `filterByChips` — three compile errors, no silent default.

import type { TagId } from "@orb/kit/ids";

/** The chip's three states. `off` is the resting state and is represented by the ABSENCE of an entry. */
export const TAG_FILTER_STATES = ["off", "include", "exclude"] as const;
export type TagFilterState = (typeof TAG_FILTER_STATES)[number];

/** The two states worth persisting — derived, never re-declared. */
export type ActiveTagFilterState = Exclude<TagFilterState, "off">;

/** One tag's active participation in the filter. The stored shape is a LIST of these (not two parallel
 *  id arrays): one tag cannot be included and excluded at once, and the list makes that unrepresentable. */
export interface TagFilterEntry {
  readonly id: TagId;
  readonly state: ActiveTagFilterState;
}

/** The click cycle. A total Record over the union — the ONE place the order of the three states is stated. */
export const NEXT_TAG_FILTER_STATE: Record<TagFilterState, TagFilterState> = {
  off: "include",
  include: "exclude",
  exclude: "off",
};

/** A tag's current state in a filter list (`off` when it carries no entry). */
export function tagFilterStateOf(entries: readonly TagFilterEntry[], id: TagId): TagFilterState {
  return entries.find((entry) => entry.id === id)?.state ?? "off";
}

/** The filter list after cycling ONE tag one step. `off` drops the entry entirely, so a resting filter
 *  persists as `[]` and never accumulates inert rows. */
export function cycleTagFilterEntries(entries: readonly TagFilterEntry[], id: TagId): readonly TagFilterEntry[] {
  const next = NEXT_TAG_FILTER_STATE[tagFilterStateOf(entries, id)];
  const without = entries.filter((entry) => entry.id !== id);
  return next === "off" ? without : [...without, { id, state: next }];
}
