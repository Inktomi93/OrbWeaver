import { tv } from "#lib";

// Shared by both <Text> and <Heading>. `weight` rides Tailwind's built-in font-weight utilities — no
// DTCG weight token exists today. `code` has no dedicated leading token, so it falls back to leading-body.
export const textVariants = tv({
  base: "font-sans",
  variants: {
    size: {
      display: "text-display leading-display",
      headline: "text-headline leading-headline",
      title: "text-title leading-title",
      body: "text-body leading-body",
      label: "text-label leading-label",
      code: "font-mono text-code leading-body",
      // micro-caps section-label voice: 10.5px + micro tracking. Pair with weight="semibold" transform="caps".
      micro: "text-micro leading-tight tracking-micro",
    },
    weight: {
      regular: "font-normal",
      medium: "font-medium",
      semibold: "font-semibold",
      bold: "font-bold",
    },
    tone: {
      default: "text-foreground",
      muted: "text-muted-foreground",
      accent: "text-primary",
      destructive: "text-destructive",
      success: "text-success",
      warning: "text-warning",
    },
    transform: {
      none: "",
      caps: "uppercase",
    },
  },
  defaultVariants: { size: "body", weight: "regular", tone: "default", transform: "none" },
});
