// The WORKBENCH's pure lane derivation (program #102, owner-picked mockup variant C —
// `reports/design/refinery-mockups/refinery-c-workbench.html`). The surface used to render ONE stage at a
// time behind a stepper; the workbench puts score · rewrite · analyze on one canvas, so "which run is this
// pane standing on" stops being a single question about an effective stage and becomes three independent
// ones. This module answers all three, purely, off the run ledger the wire already sends.
//
// THREE THINGS A LANE HAS TO SAY, and where each comes from:
//   • WHICH RUN — the §16.1 view-back pin when the CONTEXT ledger pinned a run OF THAT STAGE, else the
//     stage's latest. A pin at one stage leaves the other two lanes on live latest, which is the whole
//     point of a parallel canvas: you walk one stage back without blanking the pipeline around it.
//   • RUNNING — a call in flight FOR THAT STAGE. `iterate` drives rewrite AND analyze (both land), so it
//     marks both and never the score lane; the old `paneRunningOf` had to guess through `effectiveStage`
//     because only one pane existed to dim.
//   • BEHIND — the honesty clause the parallel canvas creates and the stepper never had to answer: a
//     re-score next to an old rewrite, or a rewrite next to the verdict that judged its PREDECESSOR, is
//     two fresh-looking payloads that disagree. Both signals are already on the wire and neither is
//     invented here: analyze carries `sourceRunId` = THE REWRITE IT JUDGED (`run-stage.ts`'s own comment,
//     "the edge that makes 'which rewrite was this verdict about?' answerable"), and `createdAt` orders
//     the ledger. Nothing new is asked of the engine.

import type { RefineryStage } from "@orb/contracts/refinery";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";

// Re-derived locally from the wire (§7.4 — never a hand-picked exported alias).
type RunView = inferOutput<Trpc["refinery"]["listRuns"]>[number];

/** One lane of the workbench: the run it stands on and the three states it has to be able to say. */
export interface LaneView {
  readonly stage: RefineryStage;
  /** The run the lane renders — null until this stage has ever settled. */
  readonly run: RunView | null;
  /** The lane is showing a SUPERSEDED run the CONTEXT ledger pinned (§16.1's walker). */
  readonly viewingBack: boolean;
  /** A model call for THIS stage is in flight. */
  readonly running: boolean;
  /** Why this lane's payload no longer answers the pipeline beside it, in the user's words — null when
   *  the lane is current. Never shown for a lane the user deliberately walked back to (the chip already
   *  says "superseded", and a pin is a choice, not a staleness). */
  readonly behind: string | null;
}

/** The pins a sibling pane or the user's own walk put on the ledger. */
export interface LanePins {
  /** The CONTEXT Runs tab's view-back pin (a run id at any stage). */
  readonly viewedRunId: string | null;
  /** The armed rewrite the accept work targets (operate-back), when one is armed. */
  readonly armedRewriteId: string | null;
}

/** Which stages have a call in flight right now. */
export interface LaneFlight {
  /** The stage `runStage` is running, if any. */
  readonly pendingStage: RefineryStage | null;
  /** An `iterate` turn is in flight — it lands a rewrite AND an analyze. */
  readonly iterating: boolean;
}

export interface WorkbenchLanes {
  readonly score: LaneView;
  readonly rewrite: LaneView;
  readonly analyze: LaneView;
  /** The rewrite run the ACCEPT work targets: the armed one (operate-back) wins over the lane's own. */
  readonly rewriteRun: RunView | null;
  readonly armedRewrite: RunView | null;
  readonly rewriteRunId: string | null;
}

/** The latest run per stage, folded off the OLDEST-FIRST wire (the last write per stage wins). */
function latestByStage(allRuns: readonly RunView[]): ReadonlyMap<RefineryStage, RunView> {
  const latest = new Map<RefineryStage, RunView>();
  for (const run of allRuns) {
    latest.set(run.stage, run);
  }
  return latest;
}

/** Is a call in flight for this stage? An `iterate` turn drives rewrite and analyze — both of those lanes
 *  are about to be replaced, and the score lane is not touched by it. */
function runningAt(stage: RefineryStage, flight: LaneFlight): boolean {
  if (flight.pendingStage === stage) {
    return true;
  }
  return flight.iterating && stage !== "score";
}

/** The REWRITE lane's staleness: a score that landed AFTER the rewrite describes a card the rewrite was
 *  never shown. `createdAt` is the honest instrument here — a rewrite's `sourceRunId` points at the run it
 *  WORKED FROM, which is the analyze on a refinement round, so a same-id check would read "behind" on every
 *  iterate round that is in fact the freshest work on the canvas. */
function rewriteBehind(rewrite: RunView | null, score: RunView | undefined): string | null {
  if (rewrite === null || score === undefined || score.createdAt <= rewrite.createdAt) {
    return null;
  }
  return "written before the latest score";
}

/** The ANALYZE lane's staleness, off the DAG edge the engine already stamps: an analyze's `sourceRunId` IS
 *  the rewrite it judged, so a verdict sitting beside a different rewrite is stating a fact about text the
 *  canvas is no longer showing. */
function analyzeBehind(analyze: RunView | null, rewrite: RunView | null): string | null {
  if (analyze === null || rewrite === null || analyze.sourceRunId === rewrite.id) {
    return null;
  }
  return "judged an earlier rewrite";
}

/** The three lanes + the rewrite the accept work targets, derived from the ledger and the pins. */
export function workbenchLanesOf(allRuns: readonly RunView[], pins: LanePins, flight: LaneFlight): WorkbenchLanes {
  const latest = latestByStage(allRuns);
  const viewedRun = pins.viewedRunId === null ? null : (allRuns.find((run) => run.id === pins.viewedRunId) ?? null);
  const armedRewrite = pins.armedRewriteId === null ? null : (allRuns.find((run) => run.id === pins.armedRewriteId && run.stage === "rewrite") ?? null);

  const laneOf = (stage: RefineryStage): { run: RunView | null; viewingBack: boolean; running: boolean } => {
    const pinned = viewedRun !== null && viewedRun.stage === stage;
    return { run: pinned ? viewedRun : (latest.get(stage) ?? null), viewingBack: pinned, running: runningAt(stage, flight) };
  };

  const score = laneOf("score");
  const rewrite = laneOf("rewrite");
  const analyze = laneOf("analyze");
  // A walked-back lane never reports "behind": the user pinned it on purpose and the superseded chip
  // already says so — stacking a staleness note on a deliberate walk is the surface arguing with itself.
  const rewriteNote = rewrite.viewingBack ? null : rewriteBehind(rewrite.run, latest.get("score"));
  const analyzeNote = analyze.viewingBack ? null : analyzeBehind(analyze.run, rewrite.run);
  const targetRewrite = armedRewrite ?? rewrite.run;

  return {
    score: { stage: "score", ...score, behind: null },
    rewrite: { stage: "rewrite", ...rewrite, behind: rewriteNote },
    analyze: { stage: "analyze", ...analyze, behind: analyzeNote },
    rewriteRun: targetRewrite,
    armedRewrite,
    rewriteRunId: targetRewrite === null ? null : targetRewrite.id,
  };
}
