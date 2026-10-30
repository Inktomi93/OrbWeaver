import type { ToneStamp } from "#lib";
import { TOUCH_FLOOR_AT_COARSE, tv } from "#lib";

// The badge/chip/pill skin — status pills (ui-package-design §6.1). A colored intent paints the D336 tone roles of the
// tone `BADGE_TONE` stamps, so one meaning paints alike on every primitive and follows the scope's palette. THREE
// fill styles per intent, in descending weight: `solid` (the filled pill), `soft` (the opaque tint, the held-back
// edge and the on-tint ink) and `ghost` (no fill: the edge and the tone's text ink). `ghost` is for chips that must
// read quieter than the surface's primary CTA even when there are a dozen of them (UI-Density-Law §3.2 CD3).
// The fill style's own `bg-*` wins over the intent's via tailwind-merge (tone is declared after intent).
const TONE_SOLID = "bg-tone-solid text-tone-foreground";
const COLORED_INTENTS: ("primary" | "success" | "warning" | "danger" | "info")[] = ["primary", "success", "warning", "danger", "info"];

export const badgeVariants = tv({
  base: "inline-flex items-center gap-field rounded-full font-medium whitespace-nowrap select-none",
  variants: {
    edge: { default: "", ink: "" },
    intent: {
      neutral: "bg-muted text-muted-foreground",
      primary: TONE_SOLID,
      success: TONE_SOLID,
      warning: TONE_SOLID,
      danger: TONE_SOLID,
      info: TONE_SOLID,
      // The palette's own state tint for session chrome (a status, not a verdict, so it never borrows a semantic hue).
      // Solid only: the accent is already a quiet fill, so it has no soft or ghost step.
      accent: "bg-accent text-accent-foreground",
    },
    tone: {
      solid: "",
      soft: "border",
      ghost: "border bg-transparent",
    },
    size: {
      // Title-only rows need state chrome without the vertical padding that changes their pitch.
      compact: "px-field font-sans text-label leading-label",
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
      // resolves it over the base.
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
      // arm is deliberately not a flex box.
      inline: "inline rounded-inset select-text [&>svg]:me-field [&>svg]:inline-block [&>svg]:align-middle",
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
      dot: "shrink-0 block-field inline-field",
    },
    // A chip carrying a glyph control whose overflowing hit area a wrap gap would clip takes the touch floor on
    // its own block size at a coarse pointer, so the hit area fits inside the chip.
    touchFloor: { block: TOUCH_FLOOR_AT_COARSE.block },
    // Machine text on the chip (a macro token, a key): the mono face.
    face: { text: "", code: "font-mono" },
    // A chip inside a caps kicker reads as a sentence: it stands down the inherited transform and tracking together.
    sentenceCase: { true: "tracking-normal normal-case", false: "" },
  },
  compoundVariants: [
    { intent: "neutral", tone: "soft", class: "border-border bg-muted/8 text-muted-foreground" },
    { intent: COLORED_INTENTS, tone: "soft", class: "border-tone-edge bg-tone-tint text-tone-text-on-tint" },
    { intent: "neutral", tone: "ghost", class: "border-border text-muted-foreground" },
    { intent: COLORED_INTENTS, tone: "ghost", class: "border-tone-edge text-tone-text" },
    // THE IN-FLOW ARM DRAWS NO BORDER BOX, in any tone. `soft`/`ghost` carry a hairline everywhere else,
    // and everywhere else it is free — but an INLINE box's left/right borders are real horizontal ADVANCE,
    // so a bordered chip re-opens the exact gap the `inline` size exists to close (side-eye F-6: the chip's
    // side padding detached the following punctuation, `{{user}} 's voice`), and its top/bottom borders paint
    // outside a line box they cannot grow. Declared LAST so tailwind-merge's border-width group resolves in
    // its favour over the tone's `border`; the fill style's `border-tone-edge` is a different group and simply
    // stops being painted.
    { size: "inline", class: "border-0" },
    // A small unfilled status dot needs its own ink at the edge, not the low-contrast surface seam.
    { edge: "ink", class: "border-current" },
  ],
  defaultVariants: { intent: "neutral", tone: "solid", size: "sm", face: "text", sentenceCase: false },
});

/** The D336 tone each intent stamps; `accent` paints the neutral ramp's state tint and reads no tone role. */
export const BADGE_TONE = {
  neutral: "neutral",
  primary: "primary",
  success: "success",
  warning: "warning",
  danger: "destructive",
  info: "info",
  accent: null,
} as const satisfies Record<keyof typeof badgeVariants.variants.intent, ToneStamp>;
