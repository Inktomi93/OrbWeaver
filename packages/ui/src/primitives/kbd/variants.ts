import { tv } from "#lib";

// The keyboard-hint chip skin (D62 §4.3 — the ⌘K chip, the cmdk footer, tooltip shortcut hints).
// A STYLED-INTRINSIC (`<kbd>`) — Base UI ships no kbd primitive (same class as Text/Badge), so this
// IS the primitive, not a lib wrap. Mono glyphs on the `--muted` surface at the micro type-scale
// (text-micro + the micro tracking), small `rounded-control` radius. Inert (no interactive state) —
// the 8-state doctrine's interactive arms don't apply, exactly like Badge. Sits on `--muted` (a
// derived ramp member themes retint) not `--accent` — accent is reserved for hover/interaction
// states (north-star PP2).
export const kbdVariants = tv({
  base: "inline-flex select-none items-center justify-center rounded-control bg-muted px-field font-mono text-micro tracking-micro text-muted-foreground",
});
