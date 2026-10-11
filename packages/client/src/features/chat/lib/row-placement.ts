// Where a transcript row seats its parts: the identity rail, the column and the body's placement classes,
// read by `MessageRow` and `GhostMessageRow` alike so neither pays for the decision in complexity.

import type { MessageView } from "@orb/contracts/chat";
import type { MessageRole } from "@orb/kit/message-role";
import { gutterCentredTracks } from "@orb/ui/layout";
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
 *  arm's "take the rest", and `@4xl:col-start-2` is the grid arm's "be the CENTRED rail" — the column must
 *  be placed explicitly there because a system row has no chip to auto-place before it. A MIRRORED row
 *  packs its content to the column's trailing edge, so a phone-capped bubble sits flush against its chip
 *  and the cap's gap falls on the far side. */
export function columnClassFor(skin: RowSkin, mirrored = false): string {
  const placement = skin.columnPlacement === "anchored" ? "min-w-0 flex-1" : "min-w-0 flex-1 @4xl:col-start-2";
  return mirrored ? `${placement} items-end` : placement;
}

/** The row body's own placement classes (#1728 arm B): nothing for `anchored`, which stays the flex line it
 *  has always been, and `@orb/ui`'s three-rail `gutterCentred` tracks for the centred skins. A CLASS and not
 *  a choice of ELEMENT because `react-hooks/static-components` bans a render-scoped component binding — and
 *  it is right to: swapping the element type at a width step would remount the row and drop mid-edit state.
 *  Homing it here is what keeps `MessageRow` and `GhostMessageRow` under the complexity ceiling reading the
 *  SAME decision. */
export function rowBodyClassFor(skin: RowSkin): string {
  // `min-w-0 max-w-full` at every placement: a wide child (a code line) may not widen the row past its track.
  // The anchored line spans the track (`w-full`) so a bubble's phone cap is a share of the track: on a line
  // that hugged its content, the cap was a share of the bubble itself and squeezed a short reply under its
  // own header.
  return skin.columnPlacement === "anchored" ? "w-full min-w-0 max-w-full" : `min-w-0 max-w-full ${gutterCentredTracks()}`;
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
export function actionsRevealFor(skin: RowSkin, lastRow: boolean, setting: "expanded" | "hover" | undefined): ActionsReveal {
  if (lastRow || setting === "expanded") {
    return "expanded";
  }
  return skin.actionsRow.identity ? "hover" : "focus";
}

/** The settled transcript's tail ids. While a turn is live the ghost is the tail, so neither id applies. */
export function settledTail(
  messages: readonly MessageView[],
  live: boolean,
): { readonly lastAssistantId: string | undefined; readonly lastRowId: string | undefined } {
  if (live) {
    return { lastAssistantId: undefined, lastRowId: undefined };
  }
  return { lastAssistantId: messages.findLast((row) => row.role === "assistant")?.id, lastRowId: messages.at(-1)?.id };
}
