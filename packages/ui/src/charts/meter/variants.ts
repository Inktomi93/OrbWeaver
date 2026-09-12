// 1-D magnitude skins. The danger state is a token swap (primary -> destructive intent), never a color calculation.
import { tv } from "#lib";

export const meterVariants = tv({
  slots: {
    root: "flex flex-col gap-field",
    header: "flex items-center justify-between gap-block",
    label: "text-label font-medium leading-label text-foreground",
    value: "text-label leading-label text-muted-foreground tabular-nums",
  },
  variants: {
    kind: {
      linear: { root: "w-full" },
      bipolar: { root: "w-full" },
      arc: { root: "w-max items-center" },
    },
  },
});

export const linearMeterVariants = tv({
  slots: {
    root: "relative h-field w-full overflow-hidden rounded-full bg-muted",
    fill: "h-full rounded-full bg-primary",
    tick: "absolute inset-y-0 w-px bg-background",
  },
  variants: {
    danger: { true: { fill: "bg-destructive" } },
  },
});

export const arcMeterVariants = tv({
  slots: {
    // THE DIAL IS A DISPLAY GRAPHIC, SO IT TAKES A DISPLAY SIZE (#685 — "a 138x80 card holding a 40x40 arc
    // is a lot of card"). It was `size-control-lg`, and a CONTROL token was the wrong nature twice over: it
    // is POINTER-CONDITIONAL (D62 P1), so the dial rendered 56px on a touch device and shrank to 40px on the
    // desktop where the finding was taken — a graphic that resizes with the input device, which is exactly
    // what §13.9's display family (avatars, switch-thumb, checkbox, slider-thumb) exists to prevent — and
    // 40px under a ~138px label row is a gauge the card is mostly not. 80px is the ambient step: one below
    // the waystone's narrowest (76px is its SMALL-container step, and the waystone is a panel's FOCAL
    // element while this is room chrome beside a transcript), pointer-independent at every pointer.
    //
    // Its ONE production consumer is automation's needle meter: `ast-grep -p '<Meter $$$ARGS />' -l tsx
    // packages` (scannedFileCount=684) returns four `<Meter>` sites — this one and three refinery
    // `kind="linear"` ones — so this is that widget's size, not a ramp every surface pays for.
    root: "block size-20",
    // THE EMPTY TRACK IS A GRAPHIC, SO IT TAKES THE EDGE TOKEN, NOT THE SURFACE ONE (#685, the follow-up to
    // #682). `text-muted` is a SURFACE token one ramp step from `card`, and one step is all it can ever be:
    // measured in this browser it renders 1.131:1 (dark) / 1.140:1 (light) against the card the arc is drawn
    // on — honest, consistent, and very nearly invisible for a 6-unit stroke. `border` is the token whose JOB
    // is "an edge that reads against its surface", and it measures 1.465 / 1.335 — the strongest separation
    // available on BOTH polarities from a token that is not an ink.
    //
    // WHY NOT 3:1 (WCAG 1.4.11), which the finding asked for: no token reaches it without becoming LOUDER
    // THAN THE VALUE. Measured against card, both polarities: muted 1.13/1.14 · input 1.38/1.29 ·
    // border 1.47/1.34 · primary (the FILL) 6.82/2.58 · muted-foreground 10.26/11.55. The only ≥3:1
    // candidate is `muted-foreground`, an INK — and on the light polarity that paints the empty track at
    // 11.5:1 beside a 2.58:1 value arc, i.e. the part of the gauge that means "nothing here" shouting over
    // the part that carries the reading, and the two indistinguishable in greyscale. A gauge whose fill and
    // track differ only by hue is the colour-alone defect wearing a graphic's clothes. The reading is not
    // lost either way: the arc is `aria-hidden` and the datum is the `showValue` numeral beside it (§3.2).
    track: "text-border",
    fill: "text-primary",
  },
  variants: {
    danger: { true: { fill: "text-destructive" } },
  },
});

export const bipolarMeterVariants = tv({
  slots: {
    root: "relative h-field w-full overflow-hidden rounded-full bg-muted",
    fill: "absolute inset-y-0 bg-primary",
    origin: "absolute inset-y-0 w-px bg-foreground",
    tick: "absolute inset-y-0 w-px bg-background",
  },
  variants: {
    danger: { true: { fill: "bg-destructive" } },
  },
});

export const segmentedClockVariants = tv({
  slots: {
    root: "text-primary",
    segment: "text-primary",
    completedDot: "text-primary",
    hiddenIcon: "text-primary",
  },
  variants: {
    size: {
      sm: { root: "size-control-sm" },
      md: { root: "size-control-md" },
      lg: { root: "size-control-lg" },
    },
    filled: { false: { segment: "text-muted" } },
    // Dims the whole glyph — never the sole signal, paired with the lock glyph in the center-emphasis slot.
    hidden: { true: { root: "opacity-50" } },
  },
  defaultVariants: { size: "md" },
});

// ─── The tracker-kit decorative-geometry pair (Context-Panel-Program §3.2 / §4.8) ───────────────────
// TrackBar (linear) + RingGauge (arc) — same magnitude-display species as Meter, but DECORATIVE:
// aria-hidden geometry whose fill/stroke rides the D71 track ramp; the value TEXT is the datum (§4.9).
// tailwind-variants can't build a class from a runtime number, so each ramp is a static Record of literal
// utilities (Tailwind must SEE each class whole to emit it). These maps are INTERNAL — the index never
// re-exports them (§13.7); the public `TrackColor`/`RingColor` types live on the component files.

/** The 6-step track ramp as literal FILL utilities — one per `--color-track-N` (TrackBar). */
export const TRACK_FILL = {
  1: "bg-track-1",
  2: "bg-track-2",
  3: "bg-track-3",
  4: "bg-track-4",
  5: "bg-track-5",
  6: "bg-track-6",
} as const;

/** The 6-step track ramp as literal TEXT-color utilities — the RingGauge arc strokes `currentColor`. */
export const RING_STROKE = {
  1: "text-track-1",
  2: "text-track-2",
  3: "text-track-3",
  4: "text-track-4",
  5: "text-track-5",
  6: "text-track-6",
} as const;

export const trackBarVariants = tv({
  slots: {
    // The empty track: a faint neutral rail (the mockup's --track-bg ≈ the input overlay tone). Height
    // rides the `field` spacing intent (0.375rem = the 6px §3.2 bar; the Meter track precedent above).
    // WIDTH is the `width` variant's, not the base's — see below.
    //
    // `pointer-events-none` IS THE A11Y CONTRACT, NOT A TWEAK (side-eye 2026-08-16 #93). The whole part is
    // `aria-hidden` decoration, and a decoration that is not in the a11y tree must not be in the HIT tree
    // either. MEASURED at 430×740 DPR3 `pointer:coarse`: `MeterRow` stacks this rail directly UNDER the
    // value row, and `Button size="inline"`'s ≥44px touch floor rides an OVERFLOWING `::after` — so this
    // 6px rail, painting later in DOM order with no z-index, ate the bottom of it and `HP value`/`HP max`
    // resolved a 45×37 effective hit area (`elementFromPoint` at cy+20 returned `div[data-slot=track-bar]`).
    // Flooring the value would not have fixed it; the occluder had to stop being one. Now 45×45.
    root: "pointer-events-none relative h-field overflow-hidden rounded-full bg-input",
    // The fill width is data (inline style) — its COLOR is a ramp token; danger swaps to the intent.
    fill: "h-full rounded-full",
  },
  variants: {
    danger: { true: { fill: "bg-destructive" } },
    // WIDTH is a variant, never a call-site class. `full` is the magnitude bar (the rail spans its column
    // and the fill fraction IS the reading). `swatch` is the LEGEND form: a fixed `block`-wide pill at
    // value===max, used where the bar carries no magnitude at all and stands only for its ramp COLOR — the
    // tracker-DEFINITION row, which says "this tracker renders as a meter, in this hue". That site spelled
    // it `className="!w-block shrink-0"`, an `!important` override of the base `w-full`: a custom-token
    // width was opaque to tailwind-merge (`twMerge("w-full","w-block")` kept BOTH), so it resolved by
    // stylesheet order and the `!` was there to force the coin flip (#146 registered the spacing scale, so
    // that pair now resolves last-wins and the `!` is inert) (`ui-size-via-variant`, the Button
    // `glyph-*` twin). `shrink-0` rides the arm because a fixed swatch that shrinks is not a swatch.
    width: {
      full: { root: "w-full" },
      swatch: { root: "w-block shrink-0" },
    },
    // `accent` swaps the CATEGORICAL ramp for a SEMANTIC intent, for a bar whose magnitude belongs to a
    // named zone rather than to a user-defined pool. The preset budget readout is the case: its bars
    // inherit the rack's steel-blue setup / warm-amber zone accent, and the ramp's step 1 (vitality
    // GREEN) is a hue the surface language does not otherwise contain (side-eye 2026-08-02, the
    // mock-vs-rendered classification). Held at 55% so a column of bars stays quieter than the value
    // text beside it, which is the accessible datum (§3.2 — the bar itself is aria-hidden).
    accent: {
      ramp: {},
      info: { fill: "bg-info/55" },
      warning: { fill: "bg-warning/55" },
    },
  },
  defaultVariants: { accent: "ramp", width: "full" },
});

/** The stacked composition rail (SegmentBar) — the SAME rail geometry as the TrackBar (one `field`-tall
 *  pill), laid out as a flex row so the segments partition it. Each segment's COLOR is a ramp token
 *  (`TRACK_FILL`); only its width is inline data.
 *
 *  `pointer-events-none` for the same reason its TrackBar twin carries it: the root is `aria-hidden`, and
 *  the two roots that are wholly out of the a11y tree are exactly the two that must stay out of the hit
 *  tree. (RingGauge/CoinFigure hang their `aria-hidden` on the inner `<svg>` and keep a real sr-only datum
 *  on the root, so they are NOT in this class and are left alone.) */
export const segmentBarVariants = tv({
  slots: {
    root: "pointer-events-none flex h-field w-full overflow-hidden rounded-full bg-input",
    segment: "h-full",
  },
});

/** The coin-disc tint maps (CoinFigure) — `color-mix` recipes over the track ramp (the sanctioned tint
 *  idiom; tv can't build these from a runtime number, so each is a literal Record like the fills above).
 *  Fill = a soft wash over the sidebar; stroke = the strong rim; ring = the faint inner engraving. */
export const COIN_DISC_FILL = {
  1: "color-mix(in oklab, var(--color-track-1) 22%, var(--color-sidebar))",
  2: "color-mix(in oklab, var(--color-track-2) 22%, var(--color-sidebar))",
  3: "color-mix(in oklab, var(--color-track-3) 22%, var(--color-sidebar))",
  4: "color-mix(in oklab, var(--color-track-4) 22%, var(--color-sidebar))",
  5: "color-mix(in oklab, var(--color-track-5) 22%, var(--color-sidebar))",
  6: "color-mix(in oklab, var(--color-track-6) 22%, var(--color-sidebar))",
} as const;

export const COIN_DISC_STROKE = {
  1: "color-mix(in oklab, var(--color-track-1) 70%, transparent)",
  2: "color-mix(in oklab, var(--color-track-2) 70%, transparent)",
  3: "color-mix(in oklab, var(--color-track-3) 70%, transparent)",
  4: "color-mix(in oklab, var(--color-track-4) 70%, transparent)",
  5: "color-mix(in oklab, var(--color-track-5) 70%, transparent)",
  6: "color-mix(in oklab, var(--color-track-6) 70%, transparent)",
} as const;

export const COIN_DISC_RING = {
  1: "color-mix(in oklab, var(--color-track-1) 40%, transparent)",
  2: "color-mix(in oklab, var(--color-track-2) 40%, transparent)",
  3: "color-mix(in oklab, var(--color-track-3) 40%, transparent)",
  4: "color-mix(in oklab, var(--color-track-4) 40%, transparent)",
  5: "color-mix(in oklab, var(--color-track-5) 40%, transparent)",
  6: "color-mix(in oklab, var(--color-track-6) 40%, transparent)",
} as const;

/** THE EMPTY PURSE (#99 item 6 — "the null state should look null"). A wallet at zero or in the red wore the
 *  same ramp-tinted disc as a full hoard, so the panel's most confident-looking figure was a value with
 *  nothing in it. A non-positive amount takes the NEUTRAL trio instead: the same three recipes, mixed off the
 *  muted foreground rather than a track step, so the coin still reads as a coin and stops reading as a prize.
 *  The three keys mirror `COIN_DISC_FILL`/`_STROKE`/`_RING` at the same weights — one anatomy, two moods. */
export const COIN_DISC_EMPTY = {
  fill: "color-mix(in oklab, var(--color-muted-foreground) 12%, var(--color-sidebar))",
  stroke: "color-mix(in oklab, var(--color-muted-foreground) 45%, transparent)",
  ring: "color-mix(in oklab, var(--color-muted-foreground) 25%, transparent)",
} as const;

export const waystoneVariants = tv({
  slots: {
    // The stone block; the dial track circle strokes `currentColor` off the muted tone (the empty-ring
    // idiom RingGauge's track shares).
    //
    // ONE SIZING HOME (side-eye F16 + the owner's grow ruling): the stone was authored at 320px and shipped
    // at 76px — stars at 1.4px, a 4.75px gable, sub-pixel mush, and "the dimmest orb in a row of orbs".
    // It now ships at 120px (`size-30`) as the panel's focal element, stepping down with its CONTAINER.
    // A dead `size` PROP plus a caller-supplied responsive className was two homes that never agreed;
    // this is the only one.
    //
    // THE MAPPING — container width → stone size. In the shell the container is `.shell-panel` (shell.css
    // makes the panel the query container; the region `<Container>` wraps the BODY, and this stone rides
    // the HEADER band), so the container width IS the context panel's width,
    // `--dimension-panel-context: clamp(17rem, 30vw, 30rem)`:
    //   ≥ 24rem (384px)          → 120px  — a docked panel from a 1280px viewport up (the owner's 30vw
    //                                       ruling exists to put a STANDARD desktop on this step; the clamp
    //                                       caps at 30rem/480px from 1600px), and the full-width mobile sheet
    //   20rem–24rem (320–384px)  →  96px  — a docked panel at ~1067–1280px viewports
    //   < 20rem (320px)          →  76px  — the panel's 17rem floor (≤~907px) and any narrow host; the SAME
    //                                       threshold gates the sub-pixel layers off (globals.css §SIZE-GATING)
    // The steps are CONTAINER breakpoints off the `--container-*` scale (sm = 24rem, xs = 20rem), never
    // viewport ones (§4b axis-1). The previous `@max-lg`/`@max-md` (32rem/28rem) were both ABOVE the panel's
    // 30rem ceiling, so even a maxed-out panel could only ever have reached the smallest step.
    root: "block",
    // THE DIAL TRACK TAKES THE EDGE TOKEN, for the reason and by the measurement `arcMeterVariants.track`
    // states (#685, swept here by #693): `text-muted` is a SURFACE token, and one ramp step is all it can
    // ever be against the panel this stone sits on. MEASURED in situ — the dial ring is drawn OUTSIDE the
    // `--color-sidebar` sky disc, so its backing is the panel itself: `muted` renders 1.0150:1 on a light
    // panel and 1.2723:1 on the dark one, i.e. FAINTER on both polarities than the 1.14 the arc meter was
    // fixed for, and on a light room a dial with no dial. `border` — the token whose job is "an edge that
    // reads against its surface" — measures 1.3252 / 1.3677 on the same pair, the strongest separation
    // available from a token that is not an ink. The stone's own indicators keep the loudest voice by a
    // wide margin (the marker is `primary`; the lit dial arcs their own tone), so the empty-track-must-stay
    // quieter invariant is not close here.
    track: "text-border",
  },
  variants: {
    // THE UNSET STONE IS ONE STEP SMALLER AT EVERY CONTAINER STEP (HUD-1 §7.3 — the band's compressed
    // form). The size exists so the LAYERS read: the interpolated sky, the walking celestial, the stars,
    // the weather, the hand. With no clock there is none of that — no treatment resolves at all — so the
    // stone is a PROMISE of a reading rather than a reading, and paying the focal element's footprint for
    // an empty disc is exactly the vertical budget F6 measured being burned (a ~140px band saying "No
    // ambient set").
    //
    // DERIVED FROM THE DATUM, NOT PASSED IN. §7.3 sketched this as a `compact` boolean on the caller, and
    // that spelling is RED here: `no-layout-context-props` (D42/D43) bans `compact`/`density`/`inDrawer`
    // props precisely because a parent telling a child how to look is the anti-pattern the container model
    // replaced. Reading it off `clock === null` is the stronger form of what that flag was for — the caller
    // spells no size and makes no size decision, and this file stays the ONE sizing home (side-eye F16).
    unset: {
      false: { root: "size-30 @max-sm:size-24 @max-xs:size-19" },
      // The globals.css SIZE-GATING has a matching `[data-phase="unset"]` arm, so the sub-pixel layers drop
      // at the container step where the SMALLER stone gets too small, never one step late.
      true: { root: "size-24 @max-sm:size-19 @max-xs:size-15" },
    },
  },
  defaultVariants: { unset: false },
});

export const ringGaugeVariants = tv({
  slots: {
    // The orb column: the ring over an optional label + value readout (the mockup .orb stack).
    root: "flex flex-col items-center gap-field",
    svg: "block size-control-lg",
    // The empty ring track + the value glyph centered in the arc. The track takes the EDGE token for the
    // reason `arcMeterVariants.track` states (#685, swept here by #693 — this gauge is the arc meter's
    // twin, and it wore the same `text-muted`). MEASURED in situ on the panel these orbs ride: `muted`
    // renders 1.0150:1 against `sidebar` on a light palette (1.0455 against `surface-raised`, the ramp
    // elevation's panel) and 1.2723 / 1.1815 on the dark one — fainter on BOTH polarities than the arc's
    // 1.14. `border` measures 1.3252 / 1.3269 light and 1.3677 / 1.4495 dark. The VALUE arc keeps the
    // loudest voice: the track ramp steps this gauge fills with measure ≥3:1 light (~4.2–4.9 vs the panel,
    // ~3.1–3.6 vs the composited bg-input rail — the #697 fix that darkened the ramp's LIGHT arm to clear
    // WCAG 1.4.11; they measured 1.89–2.65 before) and 5.9–9.3 dark against the same panel, every one of
    // them above the track.
    track: "text-border",
    // @orb-waive integer-line-boxes(text-label): SVG <text> — line-height is inert in SVG text layout (position comes from x/y/dy), so there is no line box to pair. Ends if these slots stop rendering as SVG text elements.
    valueText: "fill-foreground font-semibold text-label tabular-nums",
    // @orb-waive integer-line-boxes(text-micro): SVG <text> — line-height is inert in SVG text layout (position comes from x/y/dy), so there is no line box to pair. Ends if these slots stop rendering as SVG text elements.
    label: "text-micro text-muted-foreground uppercase tracking-micro",
    // @orb-waive integer-line-boxes(text-micro): SVG <text> — line-height is inert in SVG text layout (position comes from x/y/dy), so there is no line box to pair. Ends if these slots stop rendering as SVG text elements.
    readout: "text-micro text-muted-foreground tabular-nums",
  },
});
