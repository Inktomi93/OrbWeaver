import { SCRIM_BASE, tv } from "#lib";

// The panel is a bottom sheet; its live swipe transform is wired to Base UI's --drawer-* vars
// (transition suspended while data-swiping so the gesture tracks 1:1). The backdrops compose
// SCRIM_BASE (the bare `bg-backdrop` fill) but keep their OWN `--motion-layout` fade — a drawer's scrim
// tracks the sliding panel, not the standard overlay fade of SCRIM(tier).
// A bottom sheet's viewport and scrim stop `--drawer-bottom-inset` short of the floor; the host sets that
// variable where something (the phone tab bar) must stay visible and tappable below the sheet.
export const drawerVariants = tv({
  slots: {
    backdrop: `${SCRIM_BASE}
      inset-be-(--drawer-bottom-inset,0) z-(--z-modal) transition-opacity duration-(--motion-layout) ease-out-expo min-block-0
      data-ending-style:opacity-0
      data-starting-style:opacity-0
    `,
    viewport: "fixed inset-0 inset-be-(--drawer-bottom-inset,0) z-(--z-modal)",
    popup: `
      absolute inset-x-0 inset-be-0 flex [transform:translateY(calc(var(--drawer-snap-point-offset)+var(--drawer-swipe-movement-y)))] flex-col rounded-t-card
      bg-card text-card-foreground shadow-overlay transition-transform duration-(--motion-layout) ease-out-expo max-block-full tone-host-card
      data-ending-style:translate-y-full
      data-starting-style:translate-y-full
      data-swiping:transition-none
    `,
    // `flex-1 min-h-0` (not `h-full`) so the content scroll region resolves against the popup's max-h cap.
    content: "relative flex flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain p-section inline-full min-block-0",
    swipeArea: "fixed inset-x-0 inset-be-0 z-(--z-overlay) touch-none block-row",
    indent: "transition-transform duration-(--motion-layout) ease-out-expo data-active:scale-95",
    indentBackground: `pointer-events-none opacity-0 ${SCRIM_BASE} transition-opacity duration-(--motion-layout) ease-out-expo data-active:opacity-100`,
    title: "text-title leading-title font-semibold",
    description: "mbs-field text-body leading-body text-muted-foreground",
  },
});
