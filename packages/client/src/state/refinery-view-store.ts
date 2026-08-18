// The refinery WALK state (R3 — the view-back/operate-back arms): which run CONTENT is
// viewing (null = the live "latest per stage" read) and which rewrite run is ARMED for the next
// apply/analyze (null = latest). Client-EPHEMERAL and shared across two panes (the CONTEXT Runs tab's
// actions drive CONTENT's viewer), so it lives in the state commons (channel row 1) — walking is free,
// nothing here mutates server state until a verb fires. Cleared alongside the drill (the selection
// store's clear does not cascade here by design: re-opening a session restores the same walk, which is
// the per-section-memory posture).

import { createGatedStore } from "./create-gated-store.ts";

/**
 * A DOOR the CONTEXT pane can knock on, opened by the WORKBENCH control that owns the concept (#171).
 *
 * It is a remote control, never a second editor: the one-home ruling (#158) says scope is edited in the
 * masthead's scope dialog and guidance in the run bar's textarea, and both stay exactly there. What the
 * Setup readout gained is the ability to TAKE YOU to them — which is what a row that used to end in the
 * sentence "Changed on the workbench…" was standing in for. A sentence is not a door.
 *
 * Request-shaped (the requester sets it, the OWNER clears it on arrival) because the two doors live in two
 * different components and neither can be reached by a prop from the pane raising the request.
 */
export type RefineryWorkbenchDoor = "scope" | "guidance";

interface RefineryViewState {
  /** The run id CONTENT's viewer is pinned to; null = the latest of the active stage. */
  readonly viewedRunId: string | null;
  /** The operate-back arm: the rewrite run the NEXT apply/analyze targets; null = latest. */
  readonly armedRewriteRunId: string | null;
  /** A pending {@link RefineryWorkbenchDoor} request; null = nothing asked for. */
  readonly requestedDoor: RefineryWorkbenchDoor | null;
}

const useRefineryViewStore = createGatedStore<RefineryViewState>("refinery-view", () => ({
  viewedRunId: null,
  armedRewriteRunId: null,
  requestedDoor: null,
}));

export const useRefineryViewedRunId = (): string | null => useRefineryViewStore((s) => s.viewedRunId);
export const useRefineryArmedRewriteId = (): string | null => useRefineryViewStore((s) => s.armedRewriteRunId);
export const useRefineryRequestedDoor = (): RefineryWorkbenchDoor | null => useRefineryViewStore((s) => s.requestedDoor);

/** Ask the workbench to open the control that OWNS a concept (see {@link RefineryWorkbenchDoor}). */
export function requestRefineryWorkbenchDoor(door: RefineryWorkbenchDoor): void {
  useRefineryViewStore.setState({ requestedDoor: door }, false, "refinery-view/request-door");
}

/** The owning control acknowledges: it is open/focused, so the request is spent (a door left set would
 *  re-open itself on the next unrelated render of its owner). */
export function clearRefineryWorkbenchDoor(): void {
  useRefineryViewStore.setState({ requestedDoor: null }, false, "refinery-view/clear-door");
}

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
