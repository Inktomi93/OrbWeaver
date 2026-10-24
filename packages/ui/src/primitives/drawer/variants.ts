import { SCRIM_BASE, tv } from "#lib";

// `side` variant places the panel and wires the live swipe transform to Base UI's --drawer-* vars
// (transition suspended while data-swiping so the gesture tracks 1:1). The backdrops compose
// SCRIM_BASE (the bare `bg-backdrop` fill) but keep their OWN `--motion-layout` fade — a drawer's scrim
// tracks the sliding panel, not the standard overlay fade of SCRIM(tier).
export const drawerVariants = tv({
  slots: {
    backdrop: `${SCRIM_BASE} z-(--z-modal) transition-opacity duration-(--motion-layout) ease-out-expo data-ending-style:opacity-0 data-starting-style:opacity-0`,
    viewport: "fixed inset-0 z-(--z-modal)",
    popup: `
      fixed flex flex-col bg-card text-card-foreground shadow-overlay transition-transform duration-(--motion-layout) ease-out-expo
      data-swiping:transition-none
    `,
    // `flex-1 min-h-0` (not `h-full`) so the content scroll region resolves against the popup's max-h cap.
    content: "relative flex flex-1 flex-col overflow-y-auto overscroll-contain p-section inline-full min-block-0",
    swipeArea: "fixed z-(--z-overlay) touch-none",
    indent: "transition-transform duration-(--motion-layout) ease-out-expo data-active:scale-95",
    indentBackground: `pointer-events-none opacity-0 ${SCRIM_BASE} transition-opacity duration-(--motion-layout) ease-out-expo data-active:opacity-100`,
    title: "text-title leading-title font-semibold",
    description: "mbs-field text-body leading-body text-muted-foreground",
  },
  variants: {
    side: {
      bottom: {
        popup: `
          inset-x-0 inset-be-0 [transform:translateY(calc(var(--drawer-snap-point-offset)+var(--drawer-swipe-movement-y)))] rounded-t-card max-block-full
          data-ending-style:translate-y-full
          data-starting-style:translate-y-full
        `,
        swipeArea: "inset-x-0 inset-be-0 block-row",
      },
      left: {
        popup: `
          inset-y-0 inset-s-0 [transform:translateX(var(--drawer-swipe-movement-x))] rounded-e-card inline-full max-inline-cq-24
          data-ending-style:-translate-x-full
          data-starting-style:-translate-x-full
        `,
        swipeArea: "inset-y-0 inset-s-0 inline-row",
      },
      right: {
        popup: `
          inset-y-0 inset-e-0 [transform:translateX(var(--drawer-swipe-movement-x))] rounded-s-card inline-full max-inline-cq-24
          data-ending-style:translate-x-full
          data-starting-style:translate-x-full
        `,
        swipeArea: "inset-y-0 inset-e-0 inline-row",
      },
    },
  },
  defaultVariants: {
    side: "bottom",
  },
});
