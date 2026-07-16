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
const HOVER_REVEAL =
  "opacity-0 pointer-events-none transition-opacity duration-(--motion-fast) ease-out-expo group-focus-within:opacity-100 group-focus-within:pointer-events-auto group-hover:opacity-100 group-hover:pointer-events-auto pointer-coarse:opacity-100 pointer-coarse:pointer-events-auto";
const ALWAYS_REVEALED = "opacity-100";

export function messageActionsRevealClass(mode: "expanded" | "hover" = "hover"): string {
  return mode === "expanded" ? ALWAYS_REVEALED : HOVER_REVEAL;
}

// A drop-shadow (not text-shadow, these are lucide svg glyphs) so the action icons stay legible over
// glass / a background photo.
export const MESSAGE_ACTION_ICON_CLASS = "drop-shadow-sm";
