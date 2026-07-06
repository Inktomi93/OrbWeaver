import { tv } from "#lib";

// Card is a generic SURFACE, not a domain card — features (character cards, config panels)
// compose it (ui-package-design §6.1).
export const cardVariants = tv({
  base: "rounded-card border border-border bg-card text-card-foreground",
  variants: {
    padding: {
      none: "p-0",
      block: "p-block",
      section: "p-section",
    },
    interactive: {
      true: "cursor-pointer transition-colors duration-(--motion-fast) ease-out-expo hover:bg-accent active:bg-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      false: "",
    },
  },
  defaultVariants: { padding: "block", interactive: false },
});
