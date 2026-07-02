import { tv } from "tailwind-variants";

// The skeleton skin — a muted, pulsing placeholder; the caller sizes it via className. The
// "silk shimmer" (DESIGN.md) is a later flourish — v1 is a plain `animate-pulse` (ui-package-design §6.1).
export const skeleton = tv({
  base: "block animate-pulse bg-muted",
  variants: {
    variant: {
      rect: "rounded-control",
      text: "w-2/3 rounded-control",
      circle: "aspect-square rounded-full",
    },
  },
  defaultVariants: { variant: "rect" },
});
