// Pure projections over a run row's WIRE view (re-homed from the stage pane under the components-
// export-only rule): the scope editor's FORK-F score feed. Typed through the tRPC wire types
// (`inferOutput`) — the R2 posture: a router reshape breaks HERE, not at a hand-picked alias.
//
// `statusLineOf` (a settled run's one-line status — "overall 6.8", "6 fields · round 1") lived here for
// the STAGE STEPPER's cells, and went with the stepper when the workbench put all three stages on one
// canvas (program #102, mockup variant C): a lane renders its own payload, so a projected one-liner beside
// it would be the anti-echo law's exact case — the same datum stated twice, in two registers.

import { REFINERY_STAGE_PAYLOADS } from "@orb/contracts/refinery";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";

// Non-exported (§7.4 — consumers re-derive the same wire alias locally; the exported surface here is
// the projection FUNCTION, whose signature carries the shape structurally).
type RunView = inferOutput<Trpc["refinery"]["listRuns"]>[number];

/** The FIXED score payload out of a run, or null (custom/absent/drifted) — the scope editor's FORK-F feed. */
export function scorePayloadOf(run: RunView | undefined): ReturnType<typeof REFINERY_STAGE_PAYLOADS.score.safeParse>["data"] | null {
  if (run === undefined || run.stage !== "score") {
    return null;
  }
  const parsed = REFINERY_STAGE_PAYLOADS.score.safeParse(run.payload);
  return parsed.success ? parsed.data : null;
}
