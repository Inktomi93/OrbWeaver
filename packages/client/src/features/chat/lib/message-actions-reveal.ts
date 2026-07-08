// The `messageActions` (D44 §12.1) reveal-class resolver — ONE home for the hover-vs-expanded className
// so `MessageActionsRow` and `GreetingActionsRow` (the committed + draft-greeting action clusters) stay
// byte-identical in posture. `"hover"` (the schema default) is the §B.1 DIM-AT-REST → brighten-on-hover
// treatment (visible-but-dim at rest, full opacity on hover/focus-within/coarse pointer — §4.3 rule 4);
// `"expanded"` simply skips the dimming so the cluster stays always at full opacity. Both modes leave
// `pointer-events` at its default `auto` now — the cluster is never fully invisible (dim ≠ hidden), so
// there is nothing to gate clicks behind.

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
