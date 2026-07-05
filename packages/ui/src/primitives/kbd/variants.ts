import { tv } from "tailwind-variants";

// Teach tailwind-merge that `text-micro` is a font-size, not a color — else it collides with the
// `text-accent-foreground` tone in the base and the size token is silently dropped (the Text/avatar
// precedent).
const twMergeConfig = {
  extend: {
    classGroups: {
      "font-size": [{ text: ["micro"] }],
    },
  },
};

// The keyboard-hint chip skin (D62 §4.3 — the ⌘K chip, the cmdk footer, tooltip shortcut hints).
// A STYLED-INTRINSIC (`<kbd>`) — Base UI ships no kbd primitive (same class as Text/Badge), so this
// IS the primitive, not a lib wrap. Mono glyphs on the `--accent` surface at the micro type-scale
// (text-micro + the micro tracking), small `rounded-control` radius. Inert (no interactive state) —
// the 8-state doctrine's interactive arms don't apply, exactly like Badge.
export const kbdVariants = tv(
  {
    base: "inline-flex select-none items-center justify-center rounded-control bg-accent px-field font-mono text-micro tracking-micro text-accent-foreground",
  },
  { twMergeConfig },
);
