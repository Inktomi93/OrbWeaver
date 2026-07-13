import { tv } from "#lib";

// `side` variant places the panel and wires the live swipe transform to Base UI's --drawer-* vars
// (transition suspended while data-swiping so the gesture tracks 1:1).
export const drawerVariants = tv({
  slots: {
    backdrop:
      "fixed inset-0 z-(--z-modal) bg-scrim transition-opacity duration-(--motion-layout) ease-out-expo data-starting-style:opacity-0 data-ending-style:opacity-0",
    viewport: "fixed inset-0 z-(--z-modal)",
    popup:
      "fixed flex flex-col bg-card text-card-foreground shadow-overlay transition-transform duration-(--motion-layout) ease-out-expo data-swiping:transition-none",
    // `flex-1 min-h-0` (not `h-full`) so the content scroll region resolves against the popup's max-h cap.
    content: "min-h-0 w-full flex-1 flex flex-col overflow-y-auto overscroll-contain p-section",
    swipeArea: "fixed z-(--z-overlay) touch-none",
    indent: "transition-transform duration-(--motion-layout) ease-out-expo data-active:scale-95",
    indentBackground:
      "pointer-events-none fixed inset-0 bg-scrim opacity-0 transition-opacity duration-(--motion-layout) ease-out-expo data-active:opacity-100",
    title: "text-title leading-title font-semibold",
    description: "mt-field text-body leading-body text-muted-foreground",
  },
  variants: {
    side: {
      bottom: {
        popup:
          "inset-x-0 bottom-0 max-h-full rounded-t-card [transform:translateY(calc(var(--drawer-snap-point-offset)+var(--drawer-swipe-movement-y)))] data-starting-style:translate-y-full data-ending-style:translate-y-full",
        swipeArea: "inset-x-0 bottom-0 h-row",
      },
      left: {
        popup:
          "inset-y-0 left-0 w-full max-w-cq-sm rounded-r-card [transform:translateX(var(--drawer-swipe-movement-x))] data-starting-style:-translate-x-full data-ending-style:-translate-x-full",
        swipeArea: "inset-y-0 left-0 w-row",
      },
      right: {
        popup:
          "inset-y-0 right-0 w-full max-w-cq-sm rounded-l-card [transform:translateX(var(--drawer-swipe-movement-x))] data-starting-style:translate-x-full data-ending-style:translate-x-full",
        swipeArea: "inset-y-0 right-0 w-row",
      },
    },
  },
  defaultVariants: {
    side: "bottom",
  },
});
