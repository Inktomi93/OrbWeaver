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
 * Slot classes for the toast system (ui-package-design §5). Viewport is fixed at `--z-toast`;
 * roots animate on `data-starting-style`/`data-ending-style`, track Base UI's swipe CSS vars (the
 * transition is suspended via `data-swiping:transition-none` so a drag tracks 1:1, same fix as
 * drawer's popup), and tint the border by `data-type` (error/success/loading intent tokens — never
 * a color calc). The `loading` type (the `promise()` 3-state) gets the primary accent so it reads
 * as in-progress.
 */
export const toastVariants = tv(
  {
    slots: {
      // `pointer-events-none` on the region so an EMPTY (or padding-only) viewport never eats clicks on
      // the controls it overlaps — individual toasts opt back in via the `root` slot's `pointer-events-
      // auto`. Without this the fixed bottom-right region intercepts taps on anything beneath it (the L6
      // mobile bottom tab bar sits directly under it — surfaced by the app-shell mobile CT).
      viewport:
        "pointer-events-none fixed right-0 bottom-0 z-(--z-toast) flex w-full max-w-cq-sm flex-col-reverse gap-row p-section outline-none",
      root: [
        "pointer-events-auto relative w-full rounded-card border border-border bg-popover p-block text-popover-foreground shadow-lg",
        "transition-all duration-(--motion-base) ease-out-expo [transform:translate(var(--toast-swipe-movement-x),var(--toast-swipe-movement-y))]",
        "data-limited:hidden data-starting-style:opacity-0 data-starting-style:translate-y-full data-ending-style:opacity-0",
        // Suspend the transition while a swipe is in progress so the gesture tracks the pointer 1:1
        // instead of fighting the enter/exit transition (drawer's popup solved this the same way).
        "data-swiping:transition-none",
        // Border tint by data-type (Base UI sets it) — error/success/loading intent tokens. Written
        // as the `[&[data-type=…]]:` arbitrary-selector form (equivalent to the `data-[type=…]:`
        // shorthand) because biome's noSecrets heuristic false-positives on the `loading` shorthand.
        "[&[data-type=error]]:border-destructive",
        "[&[data-type=success]]:border-success",
        "[&[data-type=loading]]:border-primary",
      ],
      content: "flex flex-col gap-field",
      title: "text-label leading-label font-semibold",
      description: "text-label leading-label text-muted-foreground",
      close:
        "absolute top-field right-field flex size-control-sm items-center justify-center rounded-control text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
      action:
        "mt-field inline-flex h-control-sm w-fit items-center justify-center gap-field whitespace-nowrap rounded-control bg-secondary px-block text-label leading-label font-medium text-secondary-foreground outline-none transition-colors duration-(--motion-fast) ease-out-expo hover:bg-accent hover:text-accent-foreground active:bg-accent/80 focus-visible:ring-2 focus-visible:ring-ring",
    },
  },
  { twMergeConfig },
);
