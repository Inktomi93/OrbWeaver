// Render heatmap store (UI-Arch §2.1 lib/) — the DATA behind React DevTools' visual "highlight
// updates" overlay (which isn't page-hookable for an agent). render-profiler.tsx's <Profiler>
// onRender feeds `recordRender` here; `renderHeatmap()` returns which wrapped surfaces re-render, how
// often (mounts vs updates), and how expensive — read via one eval as `window.__orb.renders()`
// (agent-bridge.ts). Split OUT of render-profiler.tsx because that module exports a COMPONENT and
// Fast-Refresh forbids a module exporting both a component and a non-component. Bounded by the
// wrapped-surface id set (a handful of composition points), so no eviction is needed.

interface RenderStat {
  count: number;
  mounts: number;
  updates: number;
  totalMs: number;
  maxMs: number;
  lastMs: number;
}
const renderStats = new Map<string, RenderStat>();

/** Record one <Profiler> commit. `phase` is React's mount | update | nested-update. */
export function recordRender(id: string, phase: string, actualDuration: number): void {
  const stat = renderStats.get(id) ?? {
    count: 0,
    mounts: 0,
    updates: 0,
    totalMs: 0,
    maxMs: 0,
    lastMs: 0,
  };
  stat.count += 1;
  if (phase === "mount") {
    stat.mounts += 1;
  } else {
    stat.updates += 1;
  }
  stat.totalMs += actualDuration;
  stat.maxMs = Math.max(stat.maxMs, actualDuration);
  stat.lastMs = actualDuration;
  renderStats.set(id, stat);
}

/** The render heatmap, hottest-first (by total commit time) — `{ id, count, mounts, updates, ...ms }`.
 *
 *  READ `count` AS "COMMITS THAT TOUCHED THIS SUBTREE", NEVER AS "THIS WRAPPER RE-RENDERED" (#454,
 *  2026-08-22 — a review filed `region:content count=19` as "the whole content region re-renders 19x to
 *  paint a static page"). React's `<Profiler>` fires `onRender` for EVERY commit anywhere inside it, so a
 *  surface that correctly isolates N independent reads behind N suspense boundaries reports ~N commits
 *  BECAUSE it is isolated — the count goes UP as the isolation gets better. `avgMs` is the number that
 *  separates the two readings: a whole-subtree re-render costs about what its mount cost (`maxMs`), so
 *  updates averaging a small fraction of `maxMs` are per-boundary commits, not region-wide ones. Home
 *  measured 1 mount at 15-21ms against 18 updates averaging ~1.3ms. */
export function renderHeatmap(): ReadonlyArray<{
  id: string;
  count: number;
  mounts: number;
  updates: number;
  totalMs: number;
  avgMs: number;
  maxMs: number;
}> {
  return [...renderStats.entries()]
    .map(([id, s]) => ({
      id,
      count: s.count,
      mounts: s.mounts,
      updates: s.updates,
      totalMs: Math.round(s.totalMs),
      avgMs: Math.round(s.totalMs / s.count),
      maxMs: Math.round(s.maxMs),
    }))
    .sort((a, b) => b.totalMs - a.totalMs);
}

/** Clear the profiler evidence between driven checkpoints while leaving the mounted profilers intact. */
export function __resetRenderStats(): void {
  renderStats.clear();
}
