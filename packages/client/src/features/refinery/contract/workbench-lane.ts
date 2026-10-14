// Client workbench state over the canonical run ledger; the run data remains wire-derived.
import type { RefineryStage } from "@orb/contracts/refinery";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";

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
  /** Why the SERVER would refuse this stage right now, in the user's words — null when it is runnable.
   *  The lane's run verb renders disabled with exactly this sentence beside it, so the canvas never paints
   *  an enabled-looking control that the domain would reject (header: the rule is re-derived from
   *  `assertStageReady`, never invented here). */
  readonly blocked: string | null;
  /** This lane carries the surface's ONE focal treatment — the stripe + glow (CD3). Derived, never
   *  configured: it is the stage the user should go to next (header). */
  readonly focal: boolean;
}
