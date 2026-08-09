// The refinery WALK state (R3 — schema-renderer §16.1's view-back/operate-back): which run CONTENT is
// viewing (null = the live "latest per stage" read) and which rewrite run is ARMED for the next
// apply/analyze (null = latest). Client-EPHEMERAL and shared across two panes (the CONTEXT Runs tab's
// actions drive CONTENT's viewer), so it lives in the state commons (channel row 1) — walking is free,
// nothing here mutates server state until a verb fires. Cleared alongside the drill (the selection
// store's clear does not cascade here by design: re-opening a session restores the same walk, which is
// the per-section-memory posture).

import { createGatedStore } from "./create-gated-store.ts";

interface RefineryViewState {
  /** The run id CONTENT's viewer is pinned to; null = the latest of the active stage. */
  readonly viewedRunId: string | null;
  /** The §16.1 operate-back arm: the rewrite run the NEXT apply/analyze targets; null = latest. */
  readonly armedRewriteRunId: string | null;
}

const useRefineryViewStore = createGatedStore<RefineryViewState>("refinery-view", () => ({ viewedRunId: null, armedRewriteRunId: null }));

export const useRefineryViewedRunId = (): string | null => useRefineryViewStore((s) => s.viewedRunId);
export const useRefineryArmedRewriteId = (): string | null => useRefineryViewStore((s) => s.armedRewriteRunId);

export function setRefineryViewedRun(runId: string | null): void {
  useRefineryViewStore.setState({ viewedRunId: runId }, false, "refinery-view/view-run");
}

export function setRefineryArmedRewrite(runId: string | null): void {
  useRefineryViewStore.setState({ armedRewriteRunId: runId }, false, "refinery-view/arm-rewrite");
}

/** Test seam (the `__…ForTest` convention): a node test cannot mount the read hooks; product code reads
 *  through them only. */
export function __peekRefineryViewForTest(): RefineryViewState {
  return useRefineryViewStore.getState();
}
