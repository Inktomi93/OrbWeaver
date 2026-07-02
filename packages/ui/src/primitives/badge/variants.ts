import { tv } from "tailwind-variants";

// The badge/chip/pill skin — status token PAIRS on a rounded-full pill (ui-package-design §6.1).
// There is no `info` color token (see theme.css), so `info` rides the accent surface pair — the
// nearest neutral-highlight in the token set.
export const badgeVariants = tv({
  base: "inline-flex select-none items-center gap-field whitespace-nowrap rounded-full font-medium",
  variants: {
    intent: {
      neutral: "bg-muted text-muted-foreground",
      primary: "bg-primary text-primary-foreground",
      success: "bg-success text-success-foreground",
      warning: "bg-warning text-warning-foreground",
      danger: "bg-destructive text-destructive-foreground",
      info: "bg-accent text-accent-foreground",
    },
    size: {
      sm: "px-row py-field text-label leading-label",
      md: "px-block py-field text-body leading-body",
    },
  },
  defaultVariants: { intent: "neutral", size: "sm" },
});
