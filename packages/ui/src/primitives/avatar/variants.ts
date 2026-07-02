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
 * Slot classes for the avatar (ui-package-design §5). Sizes ride the control-height tokens
 * (UI-Arch §4b axis 3 — token sizing, no raw px); shape is round (`rounded-full`) or square
 * (`rounded-control`).
 */
export const avatarVariants = tv(
  {
    slots: {
      root: "relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-muted align-middle select-none",
      image: "size-full object-cover",
      fallback:
        "flex size-full items-center justify-center text-label leading-label font-medium text-muted-foreground uppercase",
    },
    variants: {
      size: {
        sm: { root: "size-control-sm" },
        md: { root: "size-control-md" },
        lg: { root: "size-control-lg" },
      },
      shape: {
        round: { root: "rounded-full" },
        square: { root: "rounded-control" },
      },
    },
    defaultVariants: {
      size: "md",
      shape: "round",
    },
  },
  { twMergeConfig },
);
