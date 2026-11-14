import { tv } from "#lib";

// The hint-trigger skin — an info-icon ghost button that opens a Tooltip (§16, 2026-08-09 report card).
// Fine pointers keep Field's dense inline icon footprint, but the BUTTON ITSELF is the WCAG 2.5.8 24px square, bled
// out by its own surround with a negative margin so the row stays the height it was. At a coarse pointer the BUTTON
// ITSELF owns the touch-target square: the prior layout-neutral Button pseudo measured 44px but left a 12px DOM box,
// which made adjacent targets impossible to prove non-overlapping. The coarse box spends the vertical
// room a finger needs.
export const hintTriggerVariants = tv({
  slots: {
    // The at-rest DESCRIPTION slot #2443 minted here moved to the TOOLTIP SEAL in #2455 — one node per
    // `<Tooltip>` in the whole app rather than one per hint trigger.
    trigger: "shrink-0 text-muted-foreground hover:text-foreground pointer-coarse:block-(--size-touch-target) pointer-coarse:inline-(--size-touch-target)",
    // The inline step only: the `md` step is already a control-size square.
    inlineBox: "-m-field justify-center block-(--size-glyph-md) inline-(--size-glyph-md) pointer-coarse:m-0",
    // The popup shrink-wraps its hint under the popover's width cap, so a word wider than the cap would hold the popup's min-content past it
    // and the popup would scroll sideways. `wrap-anywhere` also counts the break points in that min-content, so the word breaks inside the popup.
    popup: "wrap-anywhere",
  },
});
