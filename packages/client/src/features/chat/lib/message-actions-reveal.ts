// The message action cluster's reveal modes and the `Row reveal` posture each takes (D66 A3: rest is hidden, not
// dimmed). Opacity and pointer events only, so the cluster keeps its footprint at rest and when revealed; keyboard
// readers reveal it by focusing into the row, and the ⋯ menu keeps every verb reachable without a hover.

/** `expanded` always shows; `hover` reveals on hover and focus and is always on where the primary input cannot hover; `focus`
 *  reveals on hover and keyboard focus only, so at a touch pointer it stays hidden: stock SillyTavern shows
 *  an earlier row's buttons nowhere on a phone, and a tap focuses the row item, not the reveal group. */
const ACTIONS_REVEALS = ["expanded", "focus", "hover"] as const;
// a three-member UI reveal mode the row, its header and the actions cluster share; not a wire or domain shape.
export type ActionsReveal = (typeof ACTIONS_REVEALS)[number];

/** The `Row reveal` value for a mode; `expanded` takes none, so the cluster rests at full strength. */
export const ACTIONS_REVEAL_POSTURE = {
  expanded: undefined,
  focus: "focus",
  hover: "interactive",
} as const satisfies Record<ActionsReveal, "focus" | "interactive" | undefined>;
