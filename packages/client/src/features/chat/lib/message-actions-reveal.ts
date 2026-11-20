// The message action cluster's reveal modes, the one decision that picks a row's mode, and the `Row reveal` posture each mode
// takes (D66 A3: rest is hidden, not dimmed). Opacity and pointer events only, so the cluster keeps its footprint at rest and
// when revealed; keyboard readers reveal it by focusing into the row, and the ⋯ menu keeps every verb reachable without a hover.
//
// A reader whose primary input cannot hover (a touch screen, a stylus, a pen tablet with a fine pointer) cannot hover or
// keyboard-focus a row, so there every row is `expanded`, on every chat style, whatever the setting says. The key is hover
// capability, never pointer size (ui-surface-and-interaction-rules §4.1). The decision is made here and nowhere per skin.

import type { AppearanceSettings } from "@orb/contracts/settings";
import type { RowSkin } from "./message-row-variants.ts";

/** `expanded` always shows; `hover` reveals on hover and focus and is always on where the primary input cannot hover; `focus`
 *  reveals on hover and keyboard focus only and stays hidden where the primary input cannot hover, which is why such an input
 *  never selects it. */
const ACTIONS_REVEALS = ["expanded", "focus", "hover"] as const;
// a three-member UI reveal mode the row, its header and the actions cluster share; not a wire or domain shape.
export type ActionsReveal = (typeof ACTIONS_REVEALS)[number];

/** How a row's header actions reveal: always on the transcript's last row, where the primary input cannot hover and when the
 *  reader set them to show, else on hover and focus. */
export function actionsRevealFor(skin: RowSkin, lastRow: boolean, setting: AppearanceSettings["messageActions"] | undefined, canHover: boolean): ActionsReveal {
  if (lastRow || !canHover || setting === "expanded") {
    return "expanded";
  }
  return skin.actionsRow.identity ? "hover" : "focus";
}

/** The `Row reveal` value for a mode; `expanded` takes none, so the cluster rests at full strength. */
export const ACTIONS_REVEAL_POSTURE = {
  expanded: undefined,
  focus: "focus",
  hover: "interactive",
} as const satisfies Record<ActionsReveal, "focus" | "interactive" | undefined>;
