import { tv } from "tailwind-variants";

// The button skin — tokens only (ui-package-design §5; D43 §11.4: no components/ui exemption).
// Sizes ride the control-height tokens, so the ≥44px touch floor holds by construction (§4b axis 3).
export const buttonVariants = tv({
  base: [
    "inline-flex select-none items-center justify-center gap-field whitespace-nowrap rounded-control font-sans font-medium",
    "transition-colors duration-(--motion-fast) ease-out-expo",
    "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50 data-disabled:pointer-events-none data-disabled:opacity-50",
    "aria-busy:cursor-progress",
  ],
  variants: {
    intent: {
      primary: "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80",
      secondary:
        "bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent/80",
      ghost: "text-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent/80",
      destructive:
        "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80",
    },
    size: {
      sm: "h-control-sm px-block text-label leading-label",
      md: "h-control-md px-block text-body leading-body",
      lg: "h-control-lg px-section text-body leading-body",
    },
  },
  defaultVariants: { intent: "primary", size: "md" },
});
