/**
 * `@orb/ui/meter` — the ONE home for 1-D magnitude display (D52/D58):
 * `<Meter kind="linear"|"arc"|"bipolar">` + `<SegmentedClock>` + the decorative tracker pair
 * (`<TrackBar>`/`<RingGauge>`) + the stacked composition rail (`<SegmentBar>`) + the rpg-panel
 * satellites (`<CoinFigure>` — the honest max-less wallet disc; `<Waystone>` — the rpg band's signature
 * time×weather composite). Plain CSS/SVG, never the chart lib.
 */

export { CoinFigure } from "./coin-figure.tsx";

export { Meter } from "./meter.tsx";

export { RingGauge } from "./ring-gauge.tsx";
export type { SegmentBarSegment } from "./segment-bar.tsx";
export { SegmentBar } from "./segment-bar.tsx";

export { SegmentedClock } from "./segmented-clock.tsx";
export type { TrackColor } from "./track-bar.tsx";
export { TrackBar } from "./track-bar.tsx";
export type { WaystoneProps } from "./waystone.tsx";
export { Waystone } from "./waystone.tsx";
