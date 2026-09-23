// WebWeave TIMING — the build's beat map, split from web-weave-geometry.ts under the
// component-size-ui cap (its own concern: geometry answers WHERE, this answers WHEN, and the spider,
// the painters and the caption axis all read it).
//
// TIMING IS DATA, not CSS tokens (motion guide §4.3 forbids a 4th duration token, and a multi-phase
// canvas build isn't a CSS transition). The mock's timeline shipped at settle≈7.6s and the owner ruled
// the spider "turbo" — WEAVE_TIME_SCALE calms it (§9.4 tweak 2). The timeline never gates the veil's
// exit: the boot veil dissolves the instant the app is ready, mid-weave included (§9.3).
//
// A host may run the whole map FASTER or slower with the `tempo` prop —
// that scales the CLOCK the component feeds in, never these numbers: one timeline, one set of beats.

/** The build phases, in laying order — the boot veil's caption axis (§5.5 one importable union). */
const WEAVE_PHASES = ["bridge", "anchor", "frame", "radii", "scaffold", "capture", "settled"] as const;
export type WeavePhase = (typeof WEAVE_PHASES)[number];

/** ×1.6 over the mock's 7.6s build → settle ≈ 12.2s. The build serves the wait; it never blocks the exit. */
const WEAVE_TIME_SCALE = 1.6;
const ms = (mockMs: number): number => Math.round(mockMs * WEAVE_TIME_SCALE);

/** The mock's beat BOUNDARIES, kept
 *  verbatim as the provenance record — each phase runs boundary→boundary; everything below derives
 *  through the calm-down scale. */
const MOCK_BEATS = {
  start: 0,
  bridgeCaught: 900,
  hubDropped: 1250,
  anchorDropped: 1650,
  frameClosed: 2400,
  radiiLaid: 4600,
  scaffoldLaid: 5600,
  captureLaid: 7600,
  /** The spider's zip home from the spiral's inner end to the hub after the last capture loop. */
  atRest: 8020,
} as const;

export const WEAVE_TIMELINE = {
  bridge: [ms(MOCK_BEATS.start), ms(MOCK_BEATS.bridgeCaught)],
  drop: [ms(MOCK_BEATS.bridgeCaught), ms(MOCK_BEATS.hubDropped)],
  anchorDrop: [ms(MOCK_BEATS.hubDropped), ms(MOCK_BEATS.anchorDropped)],
  frame: [ms(MOCK_BEATS.anchorDropped), ms(MOCK_BEATS.frameClosed)],
  radii: [ms(MOCK_BEATS.frameClosed), ms(MOCK_BEATS.radiiLaid)],
  aux: [ms(MOCK_BEATS.radiiLaid), ms(MOCK_BEATS.scaffoldLaid)],
  capture: [ms(MOCK_BEATS.scaffoldLaid), ms(MOCK_BEATS.captureLaid)],
  settle: ms(MOCK_BEATS.captureLaid),
  rest: ms(MOCK_BEATS.atRest),
} as const;

/** The spider starts crossing the bridge partway through its float-and-catch beat (mock ms). She walks
 *  it until the drop beat takes over — the walk has no window of its own, or the two legs OVERLAP and
 *  the itinerary's first-match lookup switches mid-walk (a position jump; motion-fixes §3a). */
const MOCK_BRIDGE_WALK_START = 550;
export const BRIDGE_WALK_START = ms(MOCK_BRIDGE_WALK_START);
/** The bridge strand reads "caught" this long before its phase window closes (mock ms). */
const MOCK_BRIDGE_CATCH_LEAD = 250;
export const BRIDGE_CATCH_LEAD = ms(MOCK_BRIDGE_CATCH_LEAD);

/** The caption phase at a timeline instant (the boot veil's `onPhaseChange` axis). */
export function weavePhaseAt(t: number): WeavePhase {
  if (t >= WEAVE_TIMELINE.settle) {
    return "settled";
  }
  if (t >= WEAVE_TIMELINE.capture[0]) {
    return "capture";
  }
  if (t >= WEAVE_TIMELINE.aux[0]) {
    return "scaffold";
  }
  if (t >= WEAVE_TIMELINE.radii[0]) {
    return "radii";
  }
  if (t >= WEAVE_TIMELINE.frame[0]) {
    return "frame";
  }
  if (t >= WEAVE_TIMELINE.drop[0]) {
    return "anchor";
  }
  return "bridge";
}
