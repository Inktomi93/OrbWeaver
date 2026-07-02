import { tv } from "tailwind-variants";

// The log-viewer skin (ui-package-design §6.1 item 12 — a read-only monospace panel; NOT the
// code-editor seal). `level` tints a line's text; its glyph inherits the same color via
// `currentColor` (the arc-meter precedent, charts/meter/variants.ts `fill: "text-destructive"`) —
// a solo `text-*` tint on the plain card background is the established pattern (field's `error`
// slot), no bg/foreground pairing needed for body text (that pairing rule is for filled SURFACES:
// diff segments, badges).
export const logViewerVariants = tv({
  slots: {
    root: "flex flex-col overflow-hidden rounded-control border border-border bg-card font-mono text-code",
    toolbar: "flex shrink-0 justify-end border-b border-border p-field",
    scroll: "flex-1 overflow-y-auto p-block",
    line: "flex items-start gap-field whitespace-pre-wrap break-all text-foreground",
    glyph: "shrink-0",
  },
  variants: {
    level: {
      info: { line: "text-muted-foreground" },
      warn: { line: "text-warning" },
      error: { line: "text-destructive" },
    },
  },
});
