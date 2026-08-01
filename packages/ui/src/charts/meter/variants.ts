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
    root: "block size-control-lg",
    track: "text-muted",
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
    root: "relative h-field w-full overflow-hidden rounded-full bg-input",
    // The fill width is data (inline style) — its COLOR is a ramp token; danger swaps to the intent.
    fill: "h-full rounded-full",
  },
  variants: {
    danger: { true: { fill: "bg-destructive" } },
  },
});

/** The stacked composition rail (SegmentBar) — the SAME rail geometry as the TrackBar (one `field`-tall
 *  pill), laid out as a flex row so the segments partition it. Each segment's COLOR is a ramp token
 *  (`TRACK_FILL`); only its width is inline data. */
export const segmentBarVariants = tv({
  slots: {
    root: "flex h-field w-full overflow-hidden rounded-full bg-input",
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
    track: "text-muted",
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
    // The empty ring track (faint) + the value glyph centered in the arc.
    track: "text-muted",
    valueText: "fill-foreground font-semibold text-label tabular-nums",
    label: "text-micro text-muted-foreground uppercase tracking-micro",
    readout: "text-micro text-muted-foreground tabular-nums",
  },
});
