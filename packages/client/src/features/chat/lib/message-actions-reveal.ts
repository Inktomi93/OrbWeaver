// The `messageActions` (D44 §12.1) reveal-class resolver — ONE home for the hover-vs-expanded className
// so `MessageActionsRow` and `GreetingActionsRow` (the committed + draft-greeting action clusters) stay
// byte-identical in posture. `"hover"` (the schema default) is the existing UIP-305 progressive-disclosure
// treatment (hidden at rest, revealed on hover/focus-within, always-on for coarse pointers — §4.3 rule 4);
// `"expanded"` simply drops the opacity/pointer-events gating so the cluster stays always-visible.

const HOVER_REVEAL =
  "pointer-events-none opacity-0 transition-opacity duration-(--motion-fast) ease-out-expo group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 pointer-coarse:pointer-events-auto pointer-coarse:opacity-100";
const ALWAYS_REVEALED = "pointer-events-auto opacity-100";

/** The action-row className for the given `messageActions` mode (defaults to `"hover"`, the schema
 *  default — a caller that hasn't wired the appearance pref yet keeps today's exact behavior). */
export function messageActionsRevealClass(mode: "expanded" | "hover" = "hover"): string {
  return mode === "expanded" ? ALWAYS_REVEALED : HOVER_REVEAL;
}
