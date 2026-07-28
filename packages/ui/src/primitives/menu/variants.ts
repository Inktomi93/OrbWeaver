import { OVERLAY_ARROW, OVERLAY_MOTION, SCRIM, tv } from "#lib";

// Shared item skin — every clickable menu row wears it, so highlight/disabled/touch-floor behave
// identically. `data-highlighted` is Base UI's own hover/rove state.
const itemBase =
  "flex min-h-control-sm cursor-default items-center gap-row rounded-control px-row text-body leading-body outline-none select-none transition-colors duration-(--motion-fast) ease-out-expo data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground";

export const menuVariants = tv({
  slots: {
    positioner: "z-(--z-popover)",
    popup: `rounded-card border border-border bg-popover p-field text-popover-foreground shadow-overlay ${OVERLAY_MOTION.anchoredPopup}`,
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
