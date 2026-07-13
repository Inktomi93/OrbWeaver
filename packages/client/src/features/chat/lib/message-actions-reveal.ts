// The messageActions reveal-class resolver — one home for the hover-vs-expanded className so
// MessageActionsRow and GreetingActionsRow stay byte-identical in posture. "hover" dims at rest and
// brightens on hover/focus-within/coarse pointer; "expanded" skips the dimming. Deliberately opacity-dim,
// not display:none-at-rest: the content stays visibly dim (never opacity-0), so layout is byte-identical
// at rest vs hover and no flex sibling gets starved.

const HOVER_REVEAL =
  "opacity-40 transition-opacity duration-(--motion-fast) ease-out-expo group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100";
const ALWAYS_REVEALED = "opacity-100";

export function messageActionsRevealClass(mode: "expanded" | "hover" = "hover"): string {
  return mode === "expanded" ? ALWAYS_REVEALED : HOVER_REVEAL;
}

// A drop-shadow (not text-shadow, these are lucide svg glyphs) so the action icons stay legible over
// glass / a background photo.
export const MESSAGE_ACTION_ICON_CLASS = "drop-shadow-sm";
