// The `messageActions` (D44 §12.1) reveal-class resolver — ONE home for the hover-vs-expanded className
// so `MessageActionsRow` and `GreetingActionsRow` (the committed + draft-greeting action clusters) stay
// byte-identical in posture. `"hover"` (the schema default) is the §B.1 DIM-AT-REST → brighten-on-hover
// treatment (visible-but-dim at rest, full opacity on hover/focus-within/coarse pointer — §4.3 rule 4);
// `"expanded"` simply skips the dimming so the cluster stays always at full opacity. Both modes leave
// `pointer-events` at its default `auto` now — the cluster is never fully invisible (dim ≠ hidden), so
// there is nothing to gate clicks behind.
//
// AUDITED against the Wave-1 "opacity-0-BUT-IN-FLOW reveal starves a flex sibling" P0 (2026-07-09) —
// MEASURED NO-OP, deliberately unchanged. That P0 was `opacity-0` (INVISIBLE) content still claiming its
// intrinsic width in a flex row: the space looks free but isn't, so the sibling gets starved unexpectedly.
// This pattern is `opacity-40` (VISIBLY DIM, never 0) — the occupied space is on-screen and intentional,
// and layout is byte-identical at rest vs hover (opacity changes no box), so there is no "surprise" starve
// to trigger. The consumers (message-row's name-row, message-actions-row, greeting-actions-row) put this
// cluster opposite an icon-ONLY action group (≤5 `size="icon"` ghost buttons ≈ 194px, non-shrinkable) in
// a `justify-between` row. Measured (CT geometry, message-row.ct.tsx): at the message-thread's realistic
// widths a normal speaker name + the cluster fit with positive slack and ZERO overflow — desktop rows are
// always ≥ the `--width-shell-content` 680px floor (huge slack), and on mobile (~360px, coarse pointer)
// the cluster is shown BY DESIGN (`pointer-coarse:opacity-100`), where even then only a pathologically
// long (~38ch) name wraps, gracefully, no clip. The Wave-1 remedy (`display:none` at rest, shown on
// hover/focus-within/coarse) would fix no real squeeze here AND would replace the deliberate §B.1
// dim-at-rest posture with hide-at-rest — speculative churn, so we keep opacity-dim.

const HOVER_REVEAL =
  "opacity-40 transition-opacity duration-(--motion-fast) ease-out-expo group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100";
const ALWAYS_REVEALED = "opacity-100";

/** The action-row className for the given `messageActions` mode (defaults to `"hover"`, the schema
 *  default — a caller that hasn't wired the appearance pref yet keeps today's exact behavior). */
export function messageActionsRevealClass(mode: "expanded" | "hover" = "hover"): string {
  return mode === "expanded" ? ALWAYS_REVEALED : HOVER_REVEAL;
}

// §B.1 — a `drop-shadow` on the action icons so they stay legible over glass / a background photo
// (the fix for "actions invisible over glass"). ONE home so `MessageActionsRow`/`GreetingActionsRow`
// apply it identically; a filter (not `text-shadow`) because these are lucide `<svg>` glyphs.
export const MESSAGE_ACTION_ICON_CLASS = "drop-shadow-sm";
