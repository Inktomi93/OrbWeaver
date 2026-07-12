import { OVERLAY_MOTION, tv } from "#lib";

// The shared item skin — every clickable menu row (command · checkbox · radio · link · submenu
// trigger) wears it, so highlight/disabled/touch-floor behave identically. Item-kind slots below
// layer their extras on top; tailwind-merge resolves the overlaps (e.g. cursor).
// The highlight bg/text swap animates at --motion-fast (motion guide §2 state-transition / §4.2 #9 —
// menu-item highlight). Colors-only + fast, so keyboard-roved highlight tracks without lag and reduced
// motion drops it via the globals.css floor. `data-highlighted` is Base UI's own hover/rove state.
const itemBase =
  "flex min-h-control-sm cursor-default items-center gap-row rounded-control px-row text-body leading-body outline-none select-none transition-colors duration-(--motion-fast) ease-out-expo data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground";

/**
 * Slot classes for the menu stack (ui-package-design §5). Positioner carries `--z-overlay`;
 * items meet the ≥44px touch floor via `min-h-control-sm` (UI-Arch §4b axis 3, gate
 * touch-target-floor); highlight rides Base UI's `data-highlighted`. Checkbox/radio indicators use
 * Base UI's native Indicator parts (R3 — no hand-rolled checkmark); the submenu trigger flags its
 * open state with `data-popup-open`; the backdrop reuses the theme-aware `bg-scrim` (never black/50).
 */
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
    // Base UI positions the arrow against the anchor and sets data-side; skinned as a rotated
    // popover-colored diamond that continues the popup edge (mirrors PopoverArrow).
    arrow: "size-row rotate-45 border border-border bg-popover",
    backdrop: `fixed inset-0 z-(--z-popover) bg-scrim ${OVERLAY_MOTION.backdropFade("fast")}`,
    separator: "my-field border-t border-border",
    group: "",
    groupLabel: "px-row py-field text-label leading-label text-muted-foreground",
  },
});
