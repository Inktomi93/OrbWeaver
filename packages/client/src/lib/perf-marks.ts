// User Timing seam (UI-Arch §2.1 lib/ — cross-cutting util) — named `performance.mark`/`measure` for the
// app's critical path, so attributable operation timing shows up in THREE places the generic long-task /
// input observers can't reach: Chrome DevTools' User Timing track, the `perf-meter` probe (it already
// reads PerformanceEntries), and `window.__orb.perf()` (agent-bridge.ts). Near-free and prod-safe (User
// Timing is a no-op-cost browser primitive), so this SHIPS unguarded — the numbers are worth having in
// prod field traces too. Everything is namespaced `orb:*` so names stay greppable + collision-free with
// framework marks (React/TanStack emit their own).
//
// Intended consumers (place marks at the source): the chat turn chain (send → first token → complete —
// TTFT + turn latency), section switches, and app-ready (agent-bridge). A missing start mark (HMR drop,
// an aborted turn) must NEVER throw into app code, so `measure` is defensively wrapped.

const NS = "orb:";

/** Record a point-in-time mark, e.g. `perfMark("turn-send")` → `orb:turn-send` in the timeline. */
export function perfMark(name: string): void {
  performance.mark(`${NS}${name}`);
}

/** Measure `name` from a prior `perfMark(startMark)` to now. No-throw if the start mark is absent. */
export function perfMeasure(name: string, startMark: string): void {
  try {
    performance.measure(`${NS}${name}`, `${NS}${startMark}`);
  } catch {
    // A missing start mark (HMR dropped it, or an out-of-order lifecycle) must never surface as an
    // app-code throw — the measurement is best-effort instrumentation, not a correctness path.
  }
}

/** Measure `name` from navigation start (`timeOrigin`) to now — for one-shot load metrics like app-ready. */
export function perfMeasureFromLoad(name: string): void {
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
