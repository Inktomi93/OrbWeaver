/**
 * `@orb/ui/meter` — the ONE home for 1-D magnitude display (D52/D58):
 * `<Meter kind="linear"|"arc"|"bipolar">` + `<SegmentedClock>` + the decorative tracker pair
 * (`<TrackBar>`/`<RingGauge>`) + the stacked composition rail (`<SegmentBar>`) + the panel-redesign
 * satellites (`<CoinFigure>` — the honest max-less wallet disc; `<Waystone>` — the rpg band's signature
 * time×weather composite). Plain CSS/SVG, never the chart lib.
 */

export type { CoinFigureProps } from "./coin-figure.tsx";
export { CoinFigure } from "./coin-figure.tsx";
export type { MeterProps } from "./meter.tsx";
export { Meter } from "./meter.tsx";
export type { RingColor, RingGaugeProps } from "./ring-gauge.tsx";
export { RingGauge } from "./ring-gauge.tsx";
export type { SegmentBarProps, SegmentBarSegment } from "./segment-bar.tsx";
export { SegmentBar } from "./segment-bar.tsx";
export type { SegmentedClockProps } from "./segmented-clock.tsx";
export { SegmentedClock } from "./segmented-clock.tsx";
export type { TrackBarProps, TrackColor } from "./track-bar.tsx";
export { TrackBar } from "./track-bar.tsx";
export type { WaystoneClock, WaystoneProps } from "./waystone.tsx";
export { Waystone } from "./waystone.tsx";
export { handAngle, hourAngle } from "./waystone-geometry.ts";
export type {
  WaystoneCelestial,
  WaystoneOverlayKind,
  WaystoneParticleLayer,
  WaystonePhase,
  WaystonePhaseSpan,
  WaystoneSky,
  WaystoneTreatment,
  WaystoneWeather,
  WaystoneWeatherRecipe,
} from "./waystone-treatment.ts";
export {
  resolveWaystoneTreatment,
  WAYSTONE_PHASE_SPANS,
  WAYSTONE_PHASES,
  WAYSTONE_SKY_STOPS,
  WAYSTONE_WEATHERS,
  waystoneBandTint,
  waystoneCelestialAt,
  waystonePhaseAtHour,
  waystoneSkyAt,
  waystoneStarOpacityAt,
  waystoneWeatherRecipe,
} from "./waystone-treatment.ts";
