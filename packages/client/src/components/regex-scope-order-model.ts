// The regex ORDER editor's size thresholds — a plain module so the predicate has a home a `.tsx` component
// file cannot give it (`useComponentExportOnlyModules`: a module that exports components exports ONLY
// components). Two readers: `regex-scope-order.tsx`'s own arm choice, and `regex-script-picker.tsx`'s
// unattached slice, which reserves the exact left column the ordered slice spends.

import { COLLECTION_LARGE_GROUP } from "#lib";

/** Two rows is the floor for an order to exist at all. */
export const ORDERABLE_MINIMUM = 2;

/** Does the ordered slice draw drag GRIPS at this size (the `SortableList` arm)? ONE home for the
 *  threshold, two readers — the picker reserves the identical left column so its two slices share one edge
 *  (side-eye 2026-08-06 P3: the loose rows started 53px inboard of the attached ones). Past the large-group
 *  cap the ordered slice has Move buttons on the TRAILING edge instead, so there is nothing to reserve. */
export function scopeOrderShowsGrips(count: number): boolean {
  return count >= ORDERABLE_MINIMUM && count <= COLLECTION_LARGE_GROUP;
}
