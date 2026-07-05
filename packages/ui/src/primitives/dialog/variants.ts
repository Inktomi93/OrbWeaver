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
 * Slot classes for the dialog overlay stack (ui-package-design §5 — slots for multi-part).
 * Backdrop is the theme-aware `--scrim` token (D43 §11.4 — never `bg-black/50`); the stack sits at
 * `--z-modal`. Enter/exit animation rides Base UI's `data-starting-style`/`data-ending-style`.
 *
 * `size` (D62 UIP-401): the popup width — `sm|md|lg` clamp to the dedicated `--width-dialog-*` tokens
 * (400/560/720px; DISTINCT from the `--container-cq-*` container-query breakpoints — one-home rule),
 * consumed via the `max-w-(--…)` var shorthand (never a raw bracket — gate no-arbitrary-tw-values). `full` is
 * the full-bleed presentation (J11 settings overlay): the popup fills the viewport (no max-width,
 * no radius, no border) and the viewport drops its gutter padding. `w-full` + the max-width cap keeps
 * the sm/md/lg popups fluid below their clamp.
 */
export const dialogVariants = tv(
  {
    slots: {
      backdrop:
        "fixed inset-0 z-(--z-modal) bg-scrim transition-opacity duration-(--motion-base) ease-out-expo data-starting-style:opacity-0 data-ending-style:opacity-0",
      // Viewport gutter is set PER-SIZE (below), never in the base — else `full`'s `p-0` and the base
      // `p-gutter` are two padding classes tailwind-merge can't dedupe (custom `gutter` scale), and the
      // gutter wins. One padding class per size = a clean override.
      viewport: "fixed inset-0 z-(--z-modal) grid place-items-center overflow-y-auto",
      popup:
        "w-full rounded-card border border-border bg-popover p-section text-popover-foreground shadow-lg transition-all duration-(--motion-base) ease-out-expo data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0",
      title: "text-title leading-title font-semibold",
      description: "mt-field text-body leading-body text-muted-foreground",
    },
    variants: {
      size: {
        sm: { viewport: "p-gutter", popup: "max-w-(--width-dialog-sm)" },
        md: { viewport: "p-gutter", popup: "max-w-(--width-dialog-md)" },
        lg: { viewport: "p-gutter", popup: "max-w-(--width-dialog-lg)" },
        full: { viewport: "p-0", popup: "h-full w-full max-w-none rounded-none border-0" },
      },
    },
    defaultVariants: { size: "md" },
  },
  { twMergeConfig },
);
