import { tv } from "tailwind-variants";

// The toggle skin — a pressable on/off button (bold/italic-style controls). Muted at rest; the
// pressed state (data-pressed) flips to bg-accent (or bg-primary for the primary intent). Sizes
// ride the control-height tokens so the ≥44px touch floor holds by construction (§4b axis 3).
export const toggleVariants = tv({
  base: [
    "inline-flex select-none items-center justify-center gap-field whitespace-nowrap rounded-control font-sans font-medium text-muted-foreground",
    "transition-colors duration-(--motion-fast) ease-out-expo hover:bg-accent hover:text-accent-foreground",
    "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "data-pressed:bg-accent data-pressed:text-accent-foreground",
    "data-disabled:pointer-events-none data-disabled:opacity-50 disabled:pointer-events-none disabled:opacity-50",
  ],
  variants: {
    intent: {
      neutral: "",
      primary: "data-pressed:bg-primary data-pressed:text-primary-foreground",
    },
    size: {
      sm: "h-control-sm px-block text-label leading-label",
      md: "h-control-md px-block text-body leading-body",
      lg: "h-control-lg px-section text-body leading-body",
    },
  },
  defaultVariants: { intent: "neutral", size: "md" },
});
