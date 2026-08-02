// domain/discovery/substrate — the ONE home for the structured-turn RETRY trace vocabulary, and the adapter that
// carries it from `@orb/server/kit/structured-turn`'s injected `onRetry` seam onto the active span.
//
// WHY IT IS HERE AND NOT IN THE KIT: `runStructuredTurn` sits at the BOTTOM of the server tier list (it
// imports zero infra so one implementation can serve every structured lane) — below `foundation`, so it
// cannot call `addSpanEvent`. It therefore reports the retry through an injected callback, and this is the
// one place that callback is built, so the event name and its attribute shape cannot drift across the lanes
// that use it (`analyze`'s two passes + `distill`'s per-card retry, today).
//
// TRACE VOCABULARY (`addSpanEvent`, a no-op when nothing is active): `provider.structured.retry`
// {lane, issueCount, paths} — one per bounded second attempt. It rides the SAME `provider.*` event namespace
// as `provider.retry` / `provider.retry.abandoned` (infra/providers/backends/kit/retry.ts), because it is
// the same class of fact: a turn that silently cost twice what it looks like it cost. There is no
// `.abandoned` twin — a structured turn that fails twice THROWS `StructuredOutputError`, which the caller's
// own error handling already records.
//
// METADATA ONLY: the summary deliberately carries schema PATHS and a count, never the zod messages — those
// quote the model's own output (RP content), which never reaches a span attribute.

import type { StructuredRetrySummary } from "@orb/server/kit/structured-turn";
import { addSpanEvent } from "#foundation/observability";

const STRUCTURED_RETRY_EVENT = "provider.structured.retry";

/** Which structured lane retried — the one axis the event needs that the summary can't carry. File-local
 *  vocabulary (the tuple + derived union, never an inline alias): its only consumers are the three call
 *  sites that pass a literal, and nothing outside this module has any business naming a lane. */
const STRUCTURED_LANES = ["compare-narrative", "ask-card", "distill-card"] as const;
type StructuredLane = (typeof STRUCTURED_LANES)[number];

/** Build the `onRetry` closure for a structured lane. Annotates the ACTIVE span; with none (a lane driven
 *  outside any request/workload root) it is a silent no-op, exactly as every other `addSpanEvent` call is. */
export function traceStructuredRetry(lane: StructuredLane): (summary: StructuredRetrySummary) => void {
  return (summary): void => {
    addSpanEvent(STRUCTURED_RETRY_EVENT, { lane, issueCount: summary.issueCount, paths: summary.paths.join(",") });
  };
}
