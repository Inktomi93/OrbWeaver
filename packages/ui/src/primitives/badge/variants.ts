import { tv } from "#lib";

// The badge/chip/pill skin — status token PAIRS on a rounded-full pill (ui-package-design §6.1).
// `info` rides its own `--color-info` / `--color-info-foreground` pair (D71 static intent token; the
// foreground was minted in north-star PP1). THREE tones per intent, in descending weight: `solid`
// (default — the filled pill, unchanged), `soft` (an 8% color-mix tint + the intent's own text color +
// a 30% hairline border, via Tailwind v4 opacity modifiers which compile to `color-mix(in oklab,
// var(--color-<intent>) N%, transparent)` — north-star §2c), and `ghost` (NO fill at all — a hairline
// outline + the intent's text color). Migrated status chips (Host / filter / member role) use `soft`;
// `ghost` is for chips that must read quieter than the surface's primary CTA at rest even when there
// are a dozen of them (UI-Density-Law §3.2 CD3 — weight solves loudness, not count).
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
      // DAMAGE: `inline-flex` + `py-field` + `leading-label` builds a box TALLER than the line it sits in, so
      // every line carrying a macro shoves its neighbours apart, and the side padding detaches the
      // following punctuation (`{{user}} 's voice`). (The 2026-08-03 measurement was 28.25px in a 20.15px
      // line; those figures are archaeology of a REJECTED shape and no longer hold under the integer
      // line-box scale, so the mechanism is stated and the stale numbers are not.)
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
      // …and a FIFTH thing, which the F-6 fix could not have foreseen and side-eye N-1 (2026-08-19)
      // measured: `display:inline` is an inline box, and Tailwind's PREFLIGHT blockifies every `svg`. A
      // block child SPLITS an inline box in two — so the icon+label chip this primitive's own doc invites
      // ("compose a leading <Icon> as the first child") put the mark alone on its own line and grew the row
      // ~74% (31px against its glyph-less sibling's 18px, measured on the databank list's `Empty` chip). It
      // is not a wrap — `whitespace-nowrap` cannot reach it — and it is width-independent. So the arm
      // re-inlines its own glyph: `inline-block` puts the mark back IN the line box, `align-middle` centres
      // it on the x-height rather than dropping it to the baseline (an `xs` glyph on a 13px run then fits
      // inside the run's own inline box, so the line rhythm is still arithmetically unchanged), and
      // `me-field` is the gap the base's `gap-field` cannot supply here — `gap` is a flex property and this
      // arm is deliberately not a flex box. Pinned by geometry in tests/ui/primitives/badge/badge.ct.tsx.
      inline: "inline select-text rounded-inset [&>svg]:me-field [&>svg]:inline-block [&>svg]:align-middle",
      // THE INDICATOR ARM (#1798) — the CHILDLESS dot: "something is here", with no number in it. The owner
      // ruled the counted pill out of the topbar bell ("ugly as fuck"): a full status pill — the lozenge that
      // marks `always` on a lore entry — was rendering INLINE beside a 16px glyph inside a 34px icon button,
      // and the count it carried was already in the control's accessible name and in the popover's own rows.
      //
      // It is an arm of `size` and not a new primitive because the base pill fights a dot in exactly ZERO
      // ways: `rounded-full` is already the shape, `select-none` is already right for an ornament nobody
      // quotes, and `gap-field`/`whitespace-nowrap`/`font-medium` are inert with no children. The axis is
      // EXCLUSIVE, which is the property that matters — sm/md's padding is not applied at all here, so the
      // arm needs no `p-0` reset and cannot be half-overridden into a squashed pill. A separate
      // `IndicatorDot` primitive would have restated `rounded-full` + the six intent pairs to add nothing.
      //
      // `size-field` (6px) is the belt step, not a px literal, and it is deliberately the SAME diameter the
      // shell's context-rail dot already drew by hand (`context-rail.tsx` — `size-1.5 … p-0` at the call
      // site, the one live `ui-size-via-variant` ALLOWLIST survivor): one dot diameter in the app. THAT
      // CALL SITE IS NOW CONVERTED (#1799 follow-up) — `ContextCellBadge` in `context-rail.tsx` renders
      // this exact arm, and the stale `ui-size-via-variant` ALLOWLIST row for it is gone; the follow-up
      // this note flagged is done.
      // `shrink-0` keeps it square in a flex row (the `series-row` swatch precedent); POSITION is the call
      // site's datum, as it is for every corner ornament.
      //
      // NO separating ring. The obvious `ring-2 ring-background` cannot be correct: the bell's ground is
      // `--color-background` on a default topbar, `--color-card` under `elevation="ramp"`
      // (shell.css:112) and `bg-accent` while the ghost button is hovered — a fixed ring colour is wrong on
      // two of the three. The dot separates by SITTING IN THE CORNER instead, which its consumer's geometry
      // pin asserts against the glyph's own box.
      dot: "size-field shrink-0",
    },
  },
  compoundVariants: [
    // THE SOFT TINT IS 8% FOR THE WHOLE FAMILY (2026-09-01; was 15%, with destructive alone at 8%).
    // `soft` paints the intent's own hue as TEXT on a tint of that SAME hue, so the tint spends contrast
    // out of the ink's own budget — and the budget is a property of the (ink, ground) PAIR, not of the
    // token. The 15% family alpha was tuned against the card, which is the widest budget any ground
    // offers; every quieter ground spends more. Measured across all three seeds × every chrome/quiet
    // ground including the `bg-accent` a ListRow or Card paints on HOVER (list-row/variants.ts:107,188,212,
    // card/variants.ts:34) UNDER whatever the row contains: at 15% the family put 42 (ink, ground) pairs
    // under AA-NORMAL 4.5:1, worst 3.40:1; at 8% — with the two token arms that moved with it
    // (tokens.json destructive dark, themes/light.json warning) — ZERO, worst 4.54:1. So the alpha the
    // destructive chip already needed is simply the alpha the family needed, and the special case retires:
    // ONE tint strength, no per-intent exception to keep in sync. The hairline stays at /30, so the pill
    // keeps its shape and reads as a `soft` chip, not a ghost (the destructive arm has shipped at 8% since
    // 2026-08-08 and reads correctly). Pinned by canvas-composited contrast measurements in BOTH polarities
    // in tests/ui/primitives/badge/badge.ct.tsx, and statically for every seed by the
    // `seed-theme-ink-contrast` gate.
    { intent: "neutral", tone: "soft", class: "bg-muted/8 text-muted-foreground border-border" },
    { intent: "primary", tone: "soft", class: "bg-primary/8 text-primary border-primary/30" },
    { intent: "success", tone: "soft", class: "bg-success/8 text-success border-success/30" },
    { intent: "warning", tone: "soft", class: "bg-warning/8 text-warning border-warning/30" },
    { intent: "danger", tone: "soft", class: "bg-destructive/8 text-destructive border-destructive/30" },
    { intent: "info", tone: "soft", class: "bg-info/8 text-info border-info/30" },
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
