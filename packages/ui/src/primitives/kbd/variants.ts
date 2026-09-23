import { tv } from "#lib";

// The keyboard-hint chip skin (D62 §4.3 — the ⌘K chip, the cmdk footer, tooltip shortcut hints).
// A STYLED-INTRINSIC (`<kbd>`) — Base UI ships no kbd primitive (same class as Text/Badge), so this
// IS the primitive, not a lib wrap. Mono glyphs on the `--muted` surface at the micro type-scale
// (text-micro + the micro tracking), `rounded-inset` — a keycap is the canonical SUB-CONTROL mark
// (UI-Density-Law.md §2.1: `--radius-inset` is the step for marks INSIDE a component, and a keycap is
// the spec's own first example; `control` is for things you OPERATE, and a kbd hint is inert). Inert —
// the 8-state doctrine's interactive arms don't apply, exactly like Badge. Sits on `--muted` (a
// derived ramp member themes retint) not `--accent` — accent is reserved for hover/interaction
// states (north-star PP2).
export const kbdVariants = tv({
  base: "inline-flex select-none items-center justify-center rounded-inset bg-muted px-field font-mono text-muted-foreground",
  variants: {
    size: {
      // A shortcut hint beside a control: one or two glyphs at the micro step.
      key: "text-micro leading-micro tracking-micro",
      // A whole command the user reads and types out (`claude setup-token`), set in running prose: the code
      // step, the size of the sentence around it, because micro caps make a command a squint.
      command: "text-code leading-label",
    },
  },
  defaultVariants: { size: "key" },
});
