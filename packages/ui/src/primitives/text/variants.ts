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
    // THE FOUR-VOICE GRAMMAR (density-pass-spec.md §2.3) — the closed axis that replaces choosing
    // size×weight×tone×transform per call site by taste (336 legal combinations, which is the mechanism by
    // which nothing recedes). A voice is an INTENT: what this text IS on the surface, not how it looks.
    //
    // DECLARED LAST ON PURPOSE: tv() emits variant classes in key order and `defaultVariants` always
    // supplies size/weight/tone/transform, so every conflicting axis a voice sets must come AFTER them for
    // tailwind-merge to keep it. Each voice therefore re-spells EVERY axis it needs to win (family, size,
    // leading, tracking, weight, color) — an under-spelled voice silently inherits a default. Pinned by
    // computed value in tests/ui/density-tier.suite.ct.tsx, never by reading this file.
    voice: {
      // A section's NAME — never a datum. The mocks' `.kicker` (9.5px caps, .09em, 650); pair with
      // <Section kicker> for the hairline rule that completes the CD1 "a grouping is not a box" swap.
      kicker: "font-sans text-micro leading-tight tracking-micro font-semibold uppercase text-muted-foreground",
      // The name of ONE datum (the mocks' `.meter .mline` label half).
      label: "font-sans text-label leading-label tracking-normal font-medium text-foreground",
      // The VALUE — the thing you came to read. mono + tabular so columns of numbers align and digits stop
      // jittering as they tick; rides `text-label` rather than a new 11px step (D5).
      datum: "font-mono text-label leading-label tracking-normal tabular-nums font-normal text-foreground",
      // The quiet explanatory second line (the mocks' `.truth`/`.beat`/`.orb .vals`).
      gloss: "font-sans text-micro leading-tight tracking-normal font-normal text-muted-foreground",
    },
  },
  defaultVariants: { size: "body", weight: "regular", tone: "default", transform: "none" },
});
