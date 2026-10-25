// The messageActions reveal-class resolver — one home for the hover-vs-expanded className so
// MessageActionsRow and GreetingActionsRow stay byte-identical in posture. "hover" hides at rest and
// reveals on hover/focus-within/coarse pointer; "expanded" is always revealed.
//
// D66 A3 (north-star ui-cohesion §3, amends the old §B.1 dim-at-rest ruling): rest is now HIDDEN
// (`opacity-0 pointer-events-none`), not `opacity-40`. Dim-at-rest still painted 5 icons per turn ×
// every turn = the dominant chat noise source. The Wave-1 "opacity-0 in-flow starves a flex sibling"
// P0 that the dim-at-rest ruling guarded against is ABSENT here: opacity + pointer-events change NO
// layout, so the cluster keeps its box (footprint identical at rest vs revealed), and the name row has
// measured positive slack (message-row.ct.tsx geometry pin) — nothing gets starved. `pointer-events` is
// flipped in lockstep with opacity so a hidden cluster is also non-interactive at rest (and re-enabled
// exactly where it becomes visible); keyboard users reach every action by tab-focusing the row
// (group-focus-within reveals) and the ⋯ menu keeps hide/copy/delete reachable without a hover.
// The rest-hidden fragment (`HIDDEN_UNTIL_HOVER`) is a hover-capability VARIANT, so it lives at the shell/shared layer
// (`#components/pointer-variants.ts`, gate `no-pointer-variants-in-features`) and is composed in here.
import { HIDDEN_UNTIL_HOVER } from "#components";

const FOCUS_REVEAL =
  "opacity-0 pointer-events-none transition-opacity duration-(--motion-fast) ease-out-expo group-focus-within:opacity-100 group-focus-within:pointer-events-auto group-hover:opacity-100 group-hover:pointer-events-auto";
const HOVER_REVEAL = `transition-opacity duration-(--motion-fast) ease-out-expo ${HIDDEN_UNTIL_HOVER} group-focus-within:opacity-100 group-focus-within:pointer-events-auto group-hover:opacity-100 group-hover:pointer-events-auto`;
const ALWAYS_REVEALED = "opacity-100";

/** `expanded` always shows; `hover` reveals on hover and focus and is always on where the primary input cannot hover; `focus`
 *  reveals on hover and keyboard focus only, so at a touch pointer it stays hidden: stock SillyTavern shows
 *  an earlier row's buttons nowhere on a phone, and a tap focuses the row item, not the reveal group. */
const ACTIONS_REVEALS = ["expanded", "focus", "hover"] as const;
// a three-member UI reveal mode the row, its header and the actions cluster share; not a wire or domain shape.
export type ActionsReveal = (typeof ACTIONS_REVEALS)[number];

const REVEAL_CLASS: Record<ActionsReveal, string> = { expanded: ALWAYS_REVEALED, focus: FOCUS_REVEAL, hover: HOVER_REVEAL };

export function messageActionsRevealClass(mode: ActionsReveal = "hover"): string {
  return REVEAL_CLASS[mode];
}
