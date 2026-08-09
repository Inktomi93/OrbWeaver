// Pure projections over a run row's WIRE view (re-homed from the stage pane under the components-
// export-only rule): the stepper's one-line status and the scope editor's FORK-F score feed. Typed
// through the tRPC wire types (`inferOutput`) — the R2 posture: a router reshape breaks HERE, not at a
// hand-picked alias.

import { REFINERY_STAGE_PAYLOADS } from "@orb/contracts/refinery";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";

// Non-exported (§7.4 — consumers re-derive the same wire alias locally; the exported surface here is
// the two projection FUNCTIONS, whose signatures carry the shape structurally).
type RunView = inferOutput<Trpc["refinery"]["listRuns"]>[number];

/** The stepper cell's one-line status per settled run. */
export function statusLineOf(run: RunView): string {
  if (run.stage === "score") {
    const overall = (run.payload as Record<string, unknown>)["overallScore"];
    return typeof overall === "number" ? `overall ${overall}` : "settled";
  }
  if (run.stage === "rewrite") {
    const fields = (run.payload as { fields?: unknown[] }).fields;
    return `${Array.isArray(fields) ? fields.length : 0} fields · round ${run.iteration}${run.payloadConfig.kind === "manual" ? " · hand-authored" : ""}`;
  }
  const verdict = (run.payload as Record<string, unknown>)["verdict"];
  return typeof verdict === "string" ? `${verdict} · round ${run.iteration}` : "settled";
}

/** The FIXED score payload out of a run, or null (custom/absent/drifted) — the scope editor's FORK-F feed. */
export function scorePayloadOf(run: RunView | undefined): ReturnType<typeof REFINERY_STAGE_PAYLOADS.score.safeParse>["data"] | null {
  if (run === undefined || run.stage !== "score") {
    return null;
  }
  const parsed = REFINERY_STAGE_PAYLOADS.score.safeParse(run.payload);
  return parsed.success ? parsed.data : null;
}
