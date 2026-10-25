// Where a transcript row seats its parts: its alignment in the track, the identity rail and the header's shape, read
// by `MessageRow` and `GhostMessageRow` alike so neither pays for the decision in complexity.

import type { MessageView } from "@orb/contracts/chat";
import type { AppearanceSettings } from "@orb/contracts/settings";
import type { MessageId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
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

/** Where the row body sits across the track: a user row at the trailing edge in a skin that aligns by role. */
export function rowAlignFor(skin: RowSkin, role: MessageRole): "start" | "center" | "end" {
  if (skin.rowAlign === "role") {
    return role === "user" ? "end" : "start";
  }
  return skin.rowAlign;
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
