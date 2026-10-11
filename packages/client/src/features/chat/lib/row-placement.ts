// Where a transcript row seats its parts: the identity rail, the column and the body's placement classes,
// read by `MessageRow` and `GhostMessageRow` alike so neither pays for the decision in complexity.

import type { MessageRole } from "@orb/kit/message-role";
import { gutterCentredTracks } from "@orb/ui/layout";
import type { RowSkin } from "./message-row-variants.ts";

/** Whether this row sits mirrored at the trailing edge: a USER row in a skin that mirrors it. */
export function rowMirrored(skin: RowSkin, role: MessageRole): boolean {
  return role === "user" && skin.mirrorUser;
}

/** WHICH GRID RAIL this row's identity chip sits in under `columnPlacement: "gutterCentred"`, or `"none"`
 *  for an `anchored` skin whose body is still a flex line (#1728 arm B). A bare helper, not inlined, so
 *  `MessageRow` and `GhostMessageRow` read the SAME decision and neither pays for it in complexity. */
export function gutterRailFor(skin: RowSkin, role: MessageRole): "none" | "leading" | "trailing" {
  if (skin.columnPlacement === "anchored") {
    return "none";
  }
  return rowMirrored(skin, role) ? "trailing" : "leading";
}

/** The content column's own sizing class for this skin's placement (#1728 arm B): `flex-1` is the flex
 *  arm's "take the rest", and `@4xl:col-start-2` is the grid arm's "be the CENTRED rail" — the column must
 *  be placed explicitly there because a system row has no chip to auto-place before it. */
export function columnClassFor(skin: RowSkin): string {
  return skin.columnPlacement === "anchored" ? "min-w-0 flex-1" : "min-w-0 flex-1 @4xl:col-start-2";
}

/** The row body's own placement classes (#1728 arm B): nothing for `anchored`, which stays the flex line it
 *  has always been, and `@orb/ui`'s three-rail `gutterCentred` tracks for the centred skins. A CLASS and not
 *  a choice of ELEMENT because `react-hooks/static-components` bans a render-scoped component binding — and
 *  it is right to: swapping the element type at a width step would remount the row and drop mid-edit state.
 *  Homing it here is what keeps `MessageRow` and `GhostMessageRow` under the complexity ceiling reading the
 *  SAME decision. */
export function rowBodyClassFor(skin: RowSkin): string {
  return skin.columnPlacement === "anchored" ? "" : gutterCentredTracks();
}
