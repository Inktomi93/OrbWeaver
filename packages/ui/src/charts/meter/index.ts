/**
 * `@orb/ui/meter` — the ONE home for 1-D magnitude display (D52/D58; rpg-design/11 §2):
 * `<Meter kind="linear"|"arc"|"bipolar">` + `<SegmentedClock>` + the decorative tracker pair
 * (`<TrackBar>`/`<RingGauge>`) + the stacked composition rail (`<SegmentBar>`) + the panel-redesign
 * satellites (`<CoinFigure>` — the honest max-less wallet disc; `<Waystone>` — the rpg band's signature
 * time×weather composite). Plain CSS/SVG, never the chart lib.
 */

export type { CoinFigureProps } from "./coin-figure";
export { CoinFigure } from "./coin-figure";
export type { MeterProps } from "./meter";
export { Meter } from "./meter";
export type { RingColor, RingGaugeProps } from "./ring-gauge";
export { RingGauge } from "./ring-gauge";
export type { SegmentBarProps, SegmentBarSegment } from "./segment-bar";
export { SegmentBar } from "./segment-bar";
export type { SegmentedClockProps } from "./segmented-clock";
export { SegmentedClock } from "./segmented-clock";
export type { TrackBarProps, TrackColor } from "./track-bar";
export { TrackBar } from "./track-bar";
export type { WaystoneClock, WaystoneProps } from "./waystone";
export { Waystone } from "./waystone";
export { handAngle, hourAngle } from "./waystone-geometry";
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
} from "./waystone-treatment";
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
} from "./waystone-treatment";
