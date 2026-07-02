import { tv } from "tailwind-variants";

// Teach tailwind-merge the type-scale tokens: by default it classifies unknown `text-*` values as
// COLORS, so `text-label` + `text-muted-foreground` "conflict" and the size token is silently
// dropped (recorded tailwind-variants-v3 delta — hoist to #lib if a third copy appears).
const twMergeConfig = {
  extend: {
    classGroups: {
      "font-size": [{ text: ["display", "headline", "title", "body", "label", "code"] }],
    },
  },
};

/**
 * Slot classes for the drawer stack (ui-package-design §5). Backdrop is `bg-scrim` at `--z-modal`;
 * the popup panel is `bg-card`. The `side` variant places the panel and wires the live swipe
 * transform to Base UI's `--drawer-*` CSS vars (transition is suspended while `data-swiping` so
 * the gesture tracks 1:1); enter/exit slide via the `translate` property (composes with the
 * swipe `transform`, and Tailwind v4 `transition-transform` covers both).
 */
export const drawerVariants = tv(
  {
    slots: {
      backdrop:
        "fixed inset-0 z-(--z-modal) bg-scrim transition-opacity duration-(--motion-layout) ease-out-expo data-starting-style:opacity-0 data-ending-style:opacity-0",
      viewport: "fixed inset-0 z-(--z-modal)",
      popup:
        "fixed bg-card text-card-foreground shadow-lg transition-transform duration-(--motion-layout) ease-out-expo data-swiping:transition-none",
      content: "flex h-full w-full flex-col overflow-y-auto overscroll-contain p-section",
      // An invisible fixed strip pinned to the matching screen edge (side variant); Base UI owns the
      // gesture, we only place + size the hit target. Sits below the modal layer so an open drawer wins.
      swipeArea: "fixed z-(--z-overlay) touch-none",
      // The app wrapper scales back behind an open drawer (data-active) — the stacked-sheet depth cue.
      indent: "transition-transform duration-(--motion-layout) ease-out-expo data-active:scale-95",
      // The layer that peeks from behind the scaled app when a drawer opens (data-active).
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
  },
  { twMergeConfig },
);
