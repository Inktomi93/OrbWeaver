import { tv } from "tailwind-variants";

/**
 * The compare-blocks skin (work order item 8): before/after pairs get the FULL intent-token pair
 * (bg + fg together, never a bare opacity calc over a raw color) — the same solid-pair convention
 * the `diff` seal uses for added/removed segments. Tint alone is never the only before/after
 * signal: `compare-blocks.tsx` also renders a glyph + visually-hidden text per side.
 */
export const compareBlocksVariants = tv({
  slots: {
    root: "flex flex-col gap-block",
    acceptAllRow:
      "flex cursor-pointer items-center gap-row rounded-control border border-border bg-muted px-block py-row",
    acceptAllLabel: "text-label leading-label font-medium text-foreground",
    block: "flex flex-col gap-field",
    blockLabel: "text-label leading-label font-medium text-muted-foreground",
    pair: "grid grid-cols-2 gap-row",
    panel: "flex flex-col gap-field rounded-control p-block",
    sideHeader: "flex items-center gap-field",
    text: "whitespace-pre-wrap text-body leading-body",
    acceptRow: "flex cursor-pointer items-center gap-row",
    acceptLabel: "text-label leading-label text-muted-foreground",
    srOnly: "sr-only",
  },
  variants: {
    side: {
      before: { panel: "bg-destructive text-destructive-foreground" },
      after: { panel: "bg-success text-success-foreground" },
    },
  },
});
