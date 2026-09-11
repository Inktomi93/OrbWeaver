// User Timing seam: named performance.mark/measure for the app's critical path, surfaced in Chrome
// DevTools' User Timing track, the perf-meter probe, and window.__orb.perf(). Ships unguarded (near-free,
// prod-safe). Names are namespaced `orb:*` to stay collision-free with framework marks.

const NS = "orb:";

/** Record a point-in-time mark, e.g. `perfMark("turn-send")` → `orb:turn-send` in the timeline. */
export function perfMark(name: string): void {
  performance.mark(`${NS}${name}`);
}

/** Measure `name` from a prior `perfMark(startMark)` to now. No-throw if the start mark is absent. */
export function perfMeasure(name: string, startMark: string): void {
  // @orb-waive caught-failure-ownership(catch): a missing start mark must never surface as an app-code throw — best-effort instrumentation only. Ends if perf marks become load-bearing for app logic.
  try {
    performance.measure(`${NS}${name}`, `${NS}${startMark}`);
  } catch {
    // A missing start mark must never surface as an app-code throw — best-effort instrumentation only.
  }
}

/** Measure `name` from navigation start (`timeOrigin`) to now — for one-shot load metrics like app-ready. */
export function perfMeasureFromLoad(name: string): void {
  // @orb-waive caught-failure-ownership(catch): best-effort instrumentation only — see perfMeasure above. Ends if perf marks become load-bearing for app logic.
  try {
    performance.measure(`${NS}${name}`);
  } catch {
    // See perfMeasure — instrumentation must never throw.
  }
}

/** The recorded `orb:*` measures as `{ name, ms }` rows (newest-relevant last) — for `__orb.perf()`. */
export function recentMeasures(): ReadonlyArray<{ name: string; ms: number }> {
  return performance
    .getEntriesByType("measure")
    .filter((e) => e.name.startsWith(NS))
    .map((e) => ({ name: e.name.slice(NS.length), ms: Math.round(e.duration) }));
}
