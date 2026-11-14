import { CAPTION, FIELD_ROW, FIELD_STACK, ROW_STRIP, TONE_TINT, tv } from "#lib";
import type { Tone } from "#tokens";

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
 *   • WHAT SURVIVES: no raw color and no hand-mixed literal. Each pane paints the D336 tint of the tone
 *     `COMPARE_SIDE_TONE` stamps on it, with the tone's `text-on-tint` ink, which clears its floor on the tint.
 *   • NO EDGE: a side pane is a tint, and the Added and Cleared state panels a muted fill; none draws a
 *     border. The review sits inside a card, and a bordered, rounded pane inside it reads as a card inside
 *     a card (the design audit's nested-card rule). The fill sets each pane apart, with the glyph and the
 *     hidden word as the other channels.
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
    // Padded so the label sits INSIDE the box the decision border draws, never on the border itself.
    block: `${FIELD_STACK} rounded-base border border-transparent p-block`,
    blockHeader: ROW_STRIP,
    blockLabel: "text-label leading-label font-medium text-muted-foreground",
    blockSpacer: "flex-1",
    body: FIELD_STACK,
    pair: "grid grid-cols-2 gap-row @max-cq-32:grid-cols-1",
    panel: `${FIELD_STACK} rounded-control p-block`,
    sideHeader: FIELD_ROW,
    text: "text-body leading-body whitespace-pre-wrap",
    stateNote: CAPTION,
    verbRow: ROW_STRIP,
    collapsedRow: "flex cursor-pointer items-center gap-row rounded-control bg-muted px-block py-row text-start inline-full min-block-(--size-touch-target)",
    srOnly: "sr-only",
  },
  variants: {
    side: {
      before: { panel: TONE_TINT },
      after: { panel: TONE_TINT },
      /** The absent-side STATE panel (Added / Cleared) — a designed state word, never an empty tinted pane. */
      state: { panel: "bg-muted text-foreground" },
    },
    /** The review tri-state, painted on the BLOCK (border) and its body; the header chip is a `Badge` the primitive tones per decision. */
    decision: {
      undecided: { block: "border-warning" },
      kept: {},
      discarded: { block: "border-dashed border-border", body: "opacity-receded" },
    },
  },
});

/** The D336 tone each side panel stamps: the removed text in destructive, the replacement in success. */
export const COMPARE_SIDE_TONE = { before: "destructive", after: "success" } as const satisfies Record<"before" | "after", Tone>;
