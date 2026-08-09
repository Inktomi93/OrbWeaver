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
    // THE VOICE GRAMMAR (density-pass-spec.md §2.3 — four content voices + `monogram`, added S6 for the
    // decorative glyph the four could not carry) — the closed axis that replaces choosing
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
      // THE ONE NUMBER A SURFACE EXISTS TO PRODUCE (added 2026-08-09, side-eye P1-13). `datum` is the
      // voice for A value; `hero` is the voice for THE value — a run's overall score, a headline count —
      // the figure the user opened the surface to read. It was being spelled `voice="datum"`, which set
      // the refinery's whole reason-for-being at 13px, the same step as every field label beside it (the
      // review's words: "13px mono ... one change fixes hierarchy, type scale, accent budget").
      //
      // A feature CANNOT express this without a voice: `size="display"` is an @orb/ui-internal axis the
      // density gate's A3 arm reds at any feature call site, by design. So the choice is a voice or a
      // gate exemption, and a exemption for "this number is important" would be the first of many.
      // `tabular-nums` is load-bearing, not polish: these numerals COUNT UP on settle, and proportional
      // digits make the figure jitter horizontally while it ticks.
      hero: "font-mono text-display leading-display tracking-normal tabular-nums font-semibold text-foreground",
      // The DECORATIVE DISPLAY GLYPH (added S6): a single-letter mark an immersive chat row skin paints on
      // its own band/tile fill — aria-hidden ornament, not prose. None of the four CONTENT voices fits it
      // (each would shrink a glyph whose entire job is to BE large), and the alternative at the call site
      // was spelling `size`/`weight` through className — a dodge the density gate structurally cannot see.
      // Deliberately sets NO COLOR: the skin that owns the band owns the ink, so the `tone` default survives
      // here and one className on the call site still beats it. Callers that need a bigger mark than the
      // title step override `font-size` (the echo tile rides `--spacing-avatar-hero` inline).
      monogram: "font-sans text-title leading-title tracking-normal font-semibold",
    },
    // THE READING-LENGTH MODIFIER (side-eye F-31, 2026-08-02). `text-micro` (10.5px, leading-tight) was
    // doing five jobs — kicker, gloss, explainer prose, subtitle, status — and while contrast passes
    // everywhere (7.06–8.66:1), the SCALE is too flat for prose: a three-sentence teach line set at the
    // same step and the same tight leading as a status chip is a wall.
    //
    // `prose` is a LENGTH statement, not a taste knob (which is why it is not one of the four internal axes
    // the density gate ratchets): "this text is sentences, not a label". It lifts the step to `label` and
    // relaxes the leading, and it deliberately changes NOTHING else — the voice still owns family, weight,
    // tracking and color, so a prose gloss is unmistakably the same voice, just readable at length.
    //
    // DECLARED AFTER `voice` so it wins the size/leading merge (the same ordering law `voice` itself needs).
    prose: {
      true: "text-label leading-body",
      false: "",
    },
    // THE INHERITED-INK MODIFIER (side-eye 2026-08-09 P1-1). Every voice re-spells its own COLOR — which
    // is correct on a surface and actively wrong inside a FILLED control, where the control already
    // decided the ink. Measured on the refinery stage stepper: `voice="label"`/`"gloss"` inside
    // `<Button intent="primary">` painted `text-foreground`/`text-muted-foreground` on `bg-primary` at
    // **1.14:1 and 2.30:1** — a WCAG failure produced entirely by the two layers each being individually
    // correct. `tone` cannot express the fix: it is declared BEFORE `voice`, so a voice's own color wins
    // the merge (the ordering law in the `voice` comment above).
    //
    // `ink="inherit"` hands the color back to whatever set `currentColor` — the button's
    // `text-primary-foreground`, a tinted banner, an inverted band. It is a CONTEXT statement, not a
    // taste knob, which is why it is not one of the four internal axes the density gate ratchets (the
    // `prose` precedent). Declared LAST so it wins the color merge against both `tone` and `voice`.
    ink: {
      /** Take the surrounding control's ink. The ONLY correct value for text inside a filled control. */
      inherit: "text-current",
      /** Keep the voice's own color — the default everywhere text sits on a plain surface. */
      voice: "",
    },
  },
  defaultVariants: { size: "body", weight: "regular", tone: "default", transform: "none", prose: false, ink: "voice" },
});
