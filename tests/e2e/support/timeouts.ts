// The e2e wait ladder, in ms. A spec names the rung that matches what it waits for, so a rung that proves too
// tight or too loose moves for every spec at once. Playwright's own expect default (5 s) is the shortest rung.

/** A request or event that must land almost at once. */
export const WAIT_INSTANT_MS = 3000;
/** A settled DOM assertion that needs no round trip. */
export const WAIT_SHORT_MS = 5000;
/** An assertion behind one local round trip. */
export const WAIT_UI_MS = 10_000;
/** A surface that mounts behind one or more reads. */
export const WAIT_SURFACE_MS = 15_000;
/** A route change, or a server-side effect polled until it lands. */
export const WAIT_ROUND_TRIP_MS = 20_000;
/** A multi-step flow settling. */
export const WAIT_SETTLE_MS = 30_000;
/** A streamed reply or a background pass finishing. */
export const WAIT_STREAM_MS = 60_000;
/** One RPG state round behind a live turn. */
export const WAIT_RPG_ROUND_MS = 75_000;
/** A live model turn. */
export const WAIT_LIVE_TURN_MS = 120_000;
