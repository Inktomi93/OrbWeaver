// Where a transcript row seats its parts: the identity rail, the column and the body's placement classes,
// read by `MessageRow` and `GhostMessageRow` alike so neither pays for the decision in complexity.

import type { MessageView } from "@orb/contracts/chat";
import type { AppearanceSettings } from "@orb/contracts/settings";
import type { MessageId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import { gutterCentredTracks } from "@orb/ui/layout";
import { PILL_PHONE_CAP } from "./chat-track.ts";
import type { ActionsReveal } from "./message-actions-reveal.ts";
import type { RowSkin } from "./message-row-variants.ts";

/** {@link headerShape}'s answer: whether the bar names the speaker, and whether it takes a line. */
export interface HeaderShape {
  readonly identity: boolean;
  readonly ownLine: boolean;
}

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
 *  arm's "take the rest", and `col-start-2` is the grid arm's "be the CENTRED rail" — the column must
 *  be placed explicitly at every width, because a row with no chip (system, avatars off, document) would
 *  otherwise auto-place into the content-sized gutter track. A MIRRORED row
 *  packs its content to the column's trailing edge, so a phone-capped bubble sits flush against its chip
 *  and the cap's gap falls on the far side. */
export function columnClassFor(skin: RowSkin, mirrored = false): string {
  const placement = skin.columnPlacement === "anchored" ? anchoredColumnClass(skin, mirrored) : CENTRED_COLUMN;
  return mirrored ? `${placement} items-end` : placement;
}

// The centred skins' column is ONE width for every row: the reading measure, less the two identity rails
// where the row is too narrow for it. A content-sized column made short rows narrow centred plates and
// slid the chip beside them from row to row.
const CENTRED_COLUMN = "col-start-2 min-w-0 flex-1 @4xl:w-(--centred-column-width)";

// A train's column hugs its widest pill, so the speaker row above it and the pager under it share the
// train's edges; the phone cap moves from each pill to the column for the same reason.
// A mirrored train still packs to the trailing edge, beside its own chip.
function anchoredColumnClass(skin: RowSkin, mirrored: boolean): string {
  if (skin.bubbleLayout !== "trains") {
    return "min-w-0 flex-1";
  }
  return mirrored ? `min-w-0 max-w-full ms-auto ${PILL_PHONE_CAP}` : `min-w-0 max-w-full ${PILL_PHONE_CAP}`;
}

/** The row body's own placement classes (#1728 arm B): nothing for `anchored`, which stays the flex line it
 *  has always been, and `@orb/ui`'s three-rail `gutterCentred` tracks for the centred skins. A CLASS and not
 *  a choice of ELEMENT because `react-hooks/static-components` bans a render-scoped component binding — and
 *  it is right to: swapping the element type at a width step would remount the row and drop mid-edit state.
 *  Homing it here is what keeps `MessageRow` and `GhostMessageRow` under the complexity ceiling reading the
 *  SAME decision. */
export function rowBodyClassFor(skin: RowSkin): string {
  // `min-w-0 max-w-full` at every placement: a wide child (a code line) may not widen the row past its track.
  // The body spans the track (`w-full`) at every placement: a body that hugged its content made a bubble's
  // phone cap a share of the bubble itself, and sat a centred skin's short rows in narrow, sliding columns.
  const body = "w-full min-w-0 max-w-full";
  return skin.columnPlacement === "anchored" ? body : `${body} ${gutterCentredTracks()}`;
}

/** The header bar's shape for this skin and row. A bar that names its speaker always takes a line; an
 *  actions-only bar (`RowSkin.actionsRow`, stock document) takes one on the last row only and otherwise
 *  overlays the row's top trailing corner, so the page runs on without a gap per message. */
export function headerShape(skin: RowSkin, lastRow: boolean): HeaderShape {
  const identity = skin.actionsRow.identity;
  return { identity, ownLine: identity || lastRow };
}

/** How a row's header actions reveal: always on the transcript's last row (or when the reader set them to
 *  show), else on hover and focus, and an actions-only bar never pins itself on at a touch pointer. */
export function actionsRevealFor(skin: RowSkin, lastRow: boolean, setting: AppearanceSettings["messageActions"] | undefined): ActionsReveal {
  if (lastRow || setting === "expanded") {
    return "expanded";
  }
  return skin.actionsRow.identity ? "hover" : "focus";
}

/** The settled transcript's last row id. While a turn is live the ghost is the tail, so no row is last. */
export function settledLastRowId(messages: readonly MessageView[], live: boolean): MessageId | undefined {
  return live ? undefined : messages.at(-1)?.id;
}
