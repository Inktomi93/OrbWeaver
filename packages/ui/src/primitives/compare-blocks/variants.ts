import { tv } from "#lib";

/**
 * The compare-blocks skin (work order item 8 + the R3 review widening): before/after pairs get the FULL
 * intent-token pair (bg + fg together, never a bare opacity calc over a raw color) — the same solid-pair
 * convention the `diff` seal uses for added/removed segments. Tint alone is never the only signal:
 * `compare-blocks.tsx` also renders a glyph + visually-hidden text per side, and the REVIEW variant's
 * tri-state is carried by WORDS (the header chip + the verb labels) with the discarded body's dashed
 * border + dim as the third redundant channel — never strikethrough, which is the diff's own vocabulary
 * (the accept-ergonomics mock's owner-caught collision).
 */
export const compareBlocksVariants = tv({
  slots: {
    root: "flex flex-col gap-block",
    acceptAllRow: "flex cursor-pointer items-center gap-row rounded-control border border-border bg-muted px-block py-row",
    acceptAllLabel: "text-label leading-label font-medium text-foreground",
    block: "flex flex-col gap-field rounded-base border border-transparent",
    blockHeader: "flex items-center gap-row",
    blockLabel: "text-label leading-label font-medium text-muted-foreground",
    blockSpacer: "flex-1",
    stateChip: "rounded-full px-field py-px text-micro leading-tight font-semibold uppercase tracking-wide",
    body: "flex flex-col gap-field",
    pair: "grid grid-cols-2 gap-row @max-lg:grid-cols-1",
    panel: "flex flex-col gap-field rounded-control p-block",
    sideHeader: "flex items-center gap-field",
    text: "whitespace-pre-wrap text-body leading-body",
    stateNote: "text-label leading-label text-muted-foreground",
    acceptRow: "flex cursor-pointer items-center gap-row",
    acceptLabel: "text-label leading-label text-muted-foreground",
    verbRow: "flex items-center gap-row",
    collapsedRow: "flex w-full min-h-touch-target cursor-pointer items-center gap-row rounded-control bg-muted px-block py-row text-left",
    srOnly: "sr-only",
  },
  variants: {
    side: {
      before: { panel: "bg-destructive text-destructive-foreground" },
      after: { panel: "bg-success text-success-foreground" },
      /** The absent-side STATE panel (Added / Cleared) — a designed state word, never an empty tinted pane. */
      state: { panel: "border border-border bg-muted text-foreground" },
    },
    /** The review tri-state, painted on the BLOCK (border tone) + the header chip (word). */
    decision: {
      undecided: { block: "border-warning", stateChip: "bg-warning text-warning-foreground" },
      kept: { stateChip: "bg-success text-success-foreground" },
      discarded: { block: "border-dashed border-border", body: "opacity-70", stateChip: "bg-destructive text-destructive-foreground" },
    },
  },
});
