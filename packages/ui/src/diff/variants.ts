import { tv } from "tailwind-variants";

/**
 * Diff segment skin (ui-package-design §6.1 — "add/remove intent tokens").
 * Foreground/background always travel as a token PAIR — never an opacity calc over a raw color.
 */
export const diffSegmentVariants = tv({
  base: "whitespace-pre-wrap",
  variants: {
    kind: {
      added: "bg-success text-success-foreground",
      removed: "bg-destructive text-destructive-foreground line-through",
      unchanged: "",
    },
  },
});
