import { tv } from "#lib";

/**
 * The compare-blocks skin (work order item 8 + the R3 review widening). Tint alone is never the only
 * signal: `compare-blocks.tsx` also renders a glyph + visually-hidden text per side, and the REVIEW
 * variant's tri-state is carried by WORDS (the header chip + the verb labels) with the discarded body's
 * dashed border + dim as the third redundant channel — never strikethrough, which is the diff's own
 * vocabulary (the accept-ergonomics mock's owner-caught collision).
 *
 * ── THE SIDE PAIR IS A TINT, NOT A SOLID FILL (2026-08-17, program #102 · owner-picked refinery mockup C) ──
 * THE FORK, STATED. This header used to rule the opposite: "before/after pairs get the FULL intent-token
 * pair (bg + fg together, never a bare opacity calc over a raw color) — the same solid-pair convention the
 * `diff` seal uses for added/removed segments." That ruling loses to a later one, and the two halves come
 * apart cleanly:
 *   • WHAT CHANGED (the new symptom): a saturated `bg-destructive` / `bg-success` pane is ACCENT FILL, and
 *     the density chrome diet CD3 rations accent fill to exactly ONE focal element per surface. Measured on
 *     the rebuilt refinery workbench, the two panes sat INSIDE the surface's one focal island and read
 *     louder than the island's own rationed stripe+glow — the loudest thing on the canvas was a diff
 *     backdrop. The owner-approved mockup draws this diff as plain prose columns under ORIGINAL/REWRITE
 *     kickers with no fill at all, and ruled the solid pair a register break.
 *   • WHAT SURVIVES (the old mechanism, intact): "never a bare opacity calc over a RAW COLOR" is still law
 *     here, and is still obeyed — `bg-destructive/10` is an opacity modifier over the intent TOKEN, which
 *     is what the token gates exist to require; there is no raw color and no hand-mixed literal anywhere
 *     below. The register is the one already shipped one file over for exactly this job
 *     (`features/refinery/components/payload-view.tsx`'s verdict-banner tones): `border-<intent>/40` +
 *     `bg-<intent>/10` + readable `text-foreground`, which is also what the `state` arm already used.
 *   • WHAT IS NOW DIVERGENT, deliberately and reported rather than silently: the `diff` seal
 *     (`ui/src/diff/variants.ts` — `added: "bg-success text-success-foreground"`) still paints solid, so
 *     the cross-reference above no longer holds. A word-level ins/del MARK inside a sentence is a
 *     different object from a whole-pane backdrop (it is inline, it is small, and its saturation is what
 *     makes it findable in running prose), so this change deliberately does NOT reach it — but the two
 *     seals no longer share one convention, and that is a decision someone should ratify, not discover.
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
    stateChip: "rounded-full px-field py-px text-micro leading-micro font-semibold uppercase tracking-wide",
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
      before: { panel: "border border-destructive/40 bg-destructive/10 text-foreground" },
      after: { panel: "border border-success/40 bg-success/10 text-foreground" },
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
