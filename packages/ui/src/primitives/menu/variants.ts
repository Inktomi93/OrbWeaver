import { OVERLAY_ARROW, OVERLAY_MOTION, SCRIM, tv } from "#lib";

// Shared item skin — every clickable menu row wears it, so highlight/disabled/touch-floor behave
// identically. `data-highlighted` is Base UI's own hover/rove state.
const itemBase =
  "flex min-h-control-sm cursor-default items-center gap-row rounded-control px-row text-body leading-body outline-none select-none transition-colors duration-(--motion-fast) ease-out-expo data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground";

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
    item: itemBase,
    checkboxItem: itemBase,
    radioItem: itemBase,
    linkItem: `${itemBase} cursor-pointer no-underline`,
    submenuTrigger: `${itemBase} justify-between data-popup-open:bg-accent data-popup-open:text-accent-foreground`,
    itemIndicator: "inline-flex shrink-0 items-center justify-center text-foreground",
    arrow: OVERLAY_ARROW,
    backdrop: SCRIM("popover"),
    separator: "my-field border-t border-border",
    // A labeled group of related rows — the label is the group heading (Base UI wires the
    // aria-labelledby group↔label association from nesting), styled as a muted section caption.
    group: "",
    groupLabel: "px-row pt-field pb-field text-label leading-label font-medium text-muted-foreground",
  },
});
