import { OVERLAY_ARROW, OVERLAY_MOTION, SCRIM, tv } from "#lib";

// Shared item skin — every clickable menu row wears it, so highlight/disabled/touch-floor behave
// identically. `data-highlighted` is Base UI's own hover/rove state.
const itemBase =
  "flex min-h-control-sm cursor-default items-center gap-row rounded-control px-row text-body leading-body outline-none select-none transition-colors duration-(--motion-fast) ease-out-expo data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground";

// EVERY COMMAND ROW RESERVES THE LEADING GLYPH GUTTER (side-eye 2026-08-06 P2). One menu mixes iconed rows
// (`<Icon>` as the first child) with bare-text rows, and the bare ones started their label a whole glyph +
// gap to the LEFT of the rest — the chat-options popup read as a ragged two-column list ("Select messages…"
// and every submenu character row against "Rename"/"Close chat"). The gutter is a ::before box exactly the
// width of an `Icon size="sm"` (16px = --spacing-glyph-xs, the same box `itemIndicator` draws), and the
// item's own `gap-row` supplies the separation — so no calc and no arbitrary length. The `:has()` arm
// withdraws it for a row that already LEADS with a glyph; `:first-child` is load-bearing, or a submenu
// trigger's TRAILING chevron would suppress the gutter it needs. (`::before` is not an element, so it never
// becomes the `:first-child` it is tested against.) Checkbox/radio rows are excluded — their indicator slot
// is their own leading grammar.
const LEADING_GUTTER = "before:block before:size-glyph-xs before:shrink-0 before:content-[''] [&:has(>svg:first-child)]:before:hidden";

export const menuVariants = tv({
  slots: {
    positioner: "z-(--z-popover)",
    // `max-h-(--available-height)` + a scroller is the VIEWPORT CLAMP, not decoration: Base UI's
    // Positioner publishes `--available-height` as the space left between the anchor and the viewport
    // edge, and a popup that ignores it renders at its full content height and runs off-screen — the
    // bottom rows become unreachable (no scroll: the popup itself has no overflow). Every long-list seal
    // already gets this via `POPUP_SURFACE`; Menu spells its own surface, so it had neither the cap nor
    // the scroller. Overscroll is contained so wheeling past the last item does not scroll the page.
    popup: `max-h-(--available-height) overflow-y-auto overscroll-contain rounded-card border border-border bg-popover p-field text-popover-foreground shadow-overlay ${OVERLAY_MOTION.anchoredPopup}`,
    item: `${itemBase} ${LEADING_GUTTER}`,
    checkboxItem: itemBase,
    radioItem: itemBase,
    linkItem: `${itemBase} ${LEADING_GUTTER} cursor-pointer no-underline`,
    // NOT `justify-between`: with three children (leading glyph · label · trailing chevron) that spreads the
    // free space AROUND the label, so a submenu trigger's label sat ~7px right of every sibling item's while
    // its glyph sat flush — the second half of the ragged-label finding. The trailing chevron pushes itself
    // right with `ms-auto` (see menu.tsx) and the label keeps the same start edge as every other row.
    submenuTrigger: `${itemBase} ${LEADING_GUTTER} data-popup-open:bg-accent data-popup-open:text-accent-foreground`,
    itemIndicator: "inline-flex shrink-0 items-center justify-center text-foreground",
    /** The submenu trigger's trailing chevron — the indicator box, pushed to the row's end. */
    submenuChevron: "ms-auto inline-flex shrink-0 items-center justify-center text-foreground",
    arrow: OVERLAY_ARROW,
    backdrop: SCRIM("popover"),
    separator: "my-field border-t border-border",
    // A labeled group of related rows — the label is the group heading (Base UI wires the
    // aria-labelledby group↔label association from nesting), styled as a muted section caption.
    group: "",
    groupLabel: "px-row pt-field pb-field text-label leading-label font-medium text-muted-foreground",
  },
});
