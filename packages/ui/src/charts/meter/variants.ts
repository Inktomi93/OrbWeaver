// 1-D magnitude skins. The danger state is a token swap (primary -> destructive intent), never a color calculation.
import { tv } from "#lib";

/** The Waystone's CLOSED weather-overlay vocabulary — the derived TYPE is the seam (the only thing
 *  consumed); the tuple stays LOCAL (no runtime consumer iterates it, so an exported const would be
 *  unused). This data module is component-free, so the type homes here, not beside the component. */
const WAYSTONE_WEATHERS = ["clear", "rain", "storm", "snow", "fog"] as const;
export type WaystoneWeather = (typeof WAYSTONE_WEATHERS)[number];

/** The Waystone's day-phase vocabulary (derived from the hour, never passed) — same shape: local tuple,
 *  exported type. */
const WAYSTONE_PHASES = ["dawn", "day", "dusk", "night"] as const;
export type WaystonePhase = (typeof WAYSTONE_PHASES)[number];

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
    root: "block",
    track: "text-muted",
  },
  variants: {
    // 64px floor stone vs the 76px band stone (the container-driven mobile delta, DESIGN §5).
    size: {
      sm: { root: "size-16" },
      md: { root: "size-19" },
    },
  },
  defaultVariants: { size: "md" },
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
