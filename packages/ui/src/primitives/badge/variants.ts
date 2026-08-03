import { tv } from "#lib";

// The badge/chip/pill skin — status token PAIRS on a rounded-full pill (ui-package-design §6.1).
// `info` rides its own `--color-info` / `--color-info-foreground` pair (D71 static intent token; the
// foreground was minted in north-star PP1). THREE tones per intent, in descending weight: `solid`
// (default — the filled pill, unchanged), `soft` (a 15% color-mix tint + the intent's own text color +
// a 30% hairline border, via Tailwind v4 opacity modifiers which compile to `color-mix(in oklab,
// var(--color-<intent>) N%, transparent)` — north-star §2c), and `ghost` (NO fill at all — a hairline
// outline + the intent's text color). Migrated status chips (Host / filter / member role) use `soft`;
// `ghost` is for chips that must read quieter than the surface's primary CTA at rest even when there
// are a dozen of them (density-pass-spec §3.2 CD3 — weight solves loudness, not count).
// The tone's own `bg-*` wins over the intent's via tailwind-merge (tone is declared after intent).
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
      ghost: "border bg-transparent",
    },
    size: {
      sm: "px-row py-field text-label leading-label",
      md: "px-block py-field text-body leading-body",
      // THE IN-FLOW ARM (side-eye F-6, 2026-08-03) — a chip that sits INSIDE a run of prose (a `{{macro}}`
      // token in a preview of what the model receives), not beside it. `sm` in that position is line-box
      // DAMAGE: `inline-flex` + `py-field` + `leading-label` builds a 28.25px box inside a 20.15px line, so
      // every line carrying a macro shoves its neighbours apart, and the 8px side padding detaches the
      // following punctuation (`{{user}} 's voice`).
      //
      // So this arm states the three things that make a chip behave like a WORD: `inline` (participates in
      // the line box instead of establishing a flex box), NO padding on either axis (the braces the chip
      // prints are their own optical padding — any inline padding reappears as a gap before the next
      // character), and NO type axes at all, so font-size AND line-height inherit from the surrounding run
      // and the line rhythm is arithmetically unchanged. The radius steps one below the pill (`inset`, the
      // sub-control mark step) because a full pill on a text-height box reads as a lozenge.
      //
      // …and a FOURTH thing, which the F-6 fix got wrong and side-eye R-5 caught: it is SELECTABLE. The
      // base's `select-none` is right for a status pill (a lozenge you click past, never text you quote)
      // and catastrophic for a token inside quoted wire text. The assembled preview's whole stated job is
      // "the string the model receives / the string you'd search for" — and with `select-none` inherited,
      // dragging across it and copying yielded `[Take the following into special consideration for your
      // next message: ]`: the `{{input}}` silently GONE from the clipboard, with nothing saying anything
      // had been dropped. A user pasting that into a bug report, a diff or another template gets prose
      // with holes in it. `select-text` is declared on the SIZE axis, so tailwind-merge's `select` group
      // resolves it over the base. Pinned by a Selection read in
      // tests/client/features/preset/components/macro-text.ct.tsx.
      inline: "inline select-text rounded-inset",
    },
  },
  compoundVariants: [
    { intent: "neutral", tone: "soft", class: "bg-muted/15 text-muted-foreground border-border" },
    { intent: "primary", tone: "soft", class: "bg-primary/15 text-primary border-primary/30" },
    { intent: "success", tone: "soft", class: "bg-success/15 text-success border-success/30" },
    { intent: "warning", tone: "soft", class: "bg-warning/15 text-warning border-warning/30" },
    { intent: "danger", tone: "soft", class: "bg-destructive/15 text-destructive border-destructive/30" },
    { intent: "info", tone: "soft", class: "bg-info/15 text-info border-info/30" },
    { intent: "neutral", tone: "ghost", class: "text-muted-foreground border-border" },
    { intent: "primary", tone: "ghost", class: "text-primary border-primary/30" },
    { intent: "success", tone: "ghost", class: "text-success border-success/30" },
    { intent: "warning", tone: "ghost", class: "text-warning border-warning/30" },
    { intent: "danger", tone: "ghost", class: "text-destructive border-destructive/30" },
    { intent: "info", tone: "ghost", class: "text-info border-info/30" },
    // THE IN-FLOW ARM DRAWS NO BORDER BOX, in any tone. `soft`/`ghost` carry a hairline everywhere else,
    // and everywhere else it is free — but an INLINE box's left/right borders are real horizontal ADVANCE,
    // so a bordered chip re-opens the exact gap the `inline` size exists to close (side-eye F-6: the chip's
    // side padding detached the following punctuation, `{{user}} 's voice`), and its top/bottom borders paint
    // outside a line box they cannot grow. Declared LAST so tailwind-merge's border-width group resolves in
    // its favour over the tone's `border`; the tone's `border-<intent>/30` is a different group and simply
    // stops being painted. Pinned by computed border-width in
    // tests/client/features/preset/components/macro-text.ct.tsx (the one in-flow consumer).
    { size: "inline", class: "border-0" },
  ],
  defaultVariants: { intent: "neutral", tone: "solid", size: "sm" },
});
