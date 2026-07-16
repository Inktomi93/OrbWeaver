import { tv } from "#lib";

// The badge/chip/pill skin — status token PAIRS on a rounded-full pill (ui-package-design §6.1).
// `info` rides its own `--color-info` / `--color-info-foreground` pair (D71 static intent token; the
// foreground was minted in north-star PP1). Two tones per intent: `solid` (default — the filled pill,
// unchanged) and `soft` (a 15% color-mix tint + the intent's own text color + a 30% hairline border,
// via Tailwind v4 opacity modifiers which compile to `color-mix(in oklab, var(--color-<intent>) N%,
// transparent)` — north-star §2c). Migrated status chips (Host / filter / member role) use `soft`.
export const badgeVariants = tv({
  base: "inline-flex select-none items-center gap-field whitespace-nowrap rounded-full font-medium",
  variants: {
    intent: {
      neutral: "bg-muted text-muted-foreground",
      primary: "bg-primary text-primary-foreground",
      success: "bg-success text-success-foreground",
      warning: "bg-warning text-warning-foreground",
      danger: "bg-destructive text-destructive-foreground",
      info: "bg-info text-info-foreground",
    },
    tone: {
      solid: "",
      soft: "border",
    },
    size: {
      sm: "px-row py-field text-label leading-label",
      md: "px-block py-field text-body leading-body",
    },
  },
  compoundVariants: [
    { intent: "neutral", tone: "soft", class: "bg-muted/15 text-muted-foreground border-border" },
    { intent: "primary", tone: "soft", class: "bg-primary/15 text-primary border-primary/30" },
    { intent: "success", tone: "soft", class: "bg-success/15 text-success border-success/30" },
    { intent: "warning", tone: "soft", class: "bg-warning/15 text-warning border-warning/30" },
    { intent: "danger", tone: "soft", class: "bg-destructive/15 text-destructive border-destructive/30" },
    { intent: "info", tone: "soft", class: "bg-info/15 text-info border-info/30" },
  ],
  defaultVariants: { intent: "neutral", tone: "solid", size: "sm" },
});
