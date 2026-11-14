// User Timing seam: named performance.mark/measure for the app's critical path, surfaced in Chrome
// DevTools' User Timing track, the perf-meter probe, and window.__orb.perf(). Ships unguarded (near-free,
// prod-safe). Names are namespaced `orb:*` to stay collision-free with framework marks.

const NS = "orb:";
const MISSING_MARK = "SyntaxError";

/** Record a point-in-time mark, e.g. `perfMark("turn-send")` → `orb:turn-send` in the timeline. */
export function perfMark(name: string): void {
  performance.mark(`${NS}${name}`);
}

/** Measure `name` from a prior `perfMark(startMark)` to now. No-throw if the start mark is absent. */
export function perfMeasure(name: string, startMark: string): void {
  // A missing start mark (the User Timing standard's `SyntaxError`) must never surface as an app-code throw —
  // best-effort instrumentation only. Any other throw is a fault.
  try {
    performance.measure(`${NS}${name}`, `${NS}${startMark}`);
  } catch (error) {
    if (!(Error.isError(error) && error.name === MISSING_MARK)) {
      throw error;
    }
  }
}

/** Measure `name` from navigation start (`timeOrigin`) to now — for one-shot load metrics like app-ready. A measure
 *  with no marks names none that can be missing. */
export function perfMeasureFromLoad(name: string): void {
  performance.measure(`${NS}${name}`);
}

/** The recorded `orb:*` measures as `{ name, ms }` rows (newest-relevant last) — for `__orb.perf()`. */
export function recentMeasures(): ReadonlyArray<{ name: string; ms: number }> {
  return performance
    .getEntriesByType("measure")
    .filter((e) => e.name.startsWith(NS))
    .map((e) => ({ name: e.name.slice(NS.length), ms: Math.round(e.duration) }));
}
