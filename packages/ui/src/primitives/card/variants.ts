import { tv } from "tailwind-variants";

// The card SURFACE skin — the base panel features compose (character cards, config panels). A
// surface, not a domain card (ui-package-design §6.1). `interactive` adds the clickable affordance.
export const card = tv({
  base: "rounded-card border border-border bg-card text-card-foreground",
  variants: {
    padding: {
      none: "p-0",
      block: "p-block",
      section: "p-section",
    },
    interactive: {
      true: "cursor-pointer transition-colors duration-(--motion-fast) ease-out-expo hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      false: "",
    },
  },
  defaultVariants: { padding: "block", interactive: false },
});
