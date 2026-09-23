// foundation/observability — the ONE home for the structured-turn RETRY trace vocabulary, and the adapter that
// carries it from `@orb/inference`'s `runStructuredTurn` injected `onRetry` seam onto the active span.
//
// WHY THE CALLBACK IS BUILT HERE: `runStructuredTurn` is `@orb/inference`'s, below every server tier, so it
// cannot call `addSpanEvent`. It reports the retry through an injected callback, and this is the one place that
// callback is built, so the event name, its attribute shape and the lane names cannot drift across the lanes
// that use it. It cannot live in `server/kit`, which sits below `foundation` and so cannot reach `addSpanEvent`.
//
// TRACE VOCABULARY (`addSpanEvent`, a no-op when nothing is active): `provider.structured.retry`
// {lane, issueCount, paths} — one per bounded second attempt. It rides the SAME `provider.*` event namespace
// as `provider.retry` / `provider.retry.abandoned`, because it is the same class of fact: a turn that silently
// cost twice what it looks like it cost. There is no `.abandoned` twin — a structured turn that fails twice
// THROWS `StructuredOutputError`, which the caller's own error handling already records.
//
// METADATA ONLY: the summary deliberately carries schema PATHS and a count, never the zod messages — those
// quote the model's own output (RP content), which never reaches a span attribute.

import type { StructuredRetrySummary } from "@orb/inference";
import { addSpanEvent } from "./tracing.ts";

const STRUCTURED_RETRY_EVENT = "provider.structured.retry";

/** Which structured lane retried — the one axis the event needs that the summary can't carry. The closed set of
 *  every lane that retries, so a typo at a call site fails `tsc` instead of minting a new trace label. */
const STRUCTURED_LANES = [
  "compare-narrative",
  "ask-card",
  "distill-card",
  "refine-score",
  "refine-rewrite",
  "refine-analyze",
  "refine-schema-forge",
  "refine-schema-test",
] as const;
type StructuredLane = (typeof STRUCTURED_LANES)[number];

/** Build the `onRetry` closure for a structured lane. Annotates the ACTIVE span; with none (a lane driven
 *  outside any request/workload root) it is a silent no-op, exactly as every other `addSpanEvent` call is. */
export function traceStructuredRetry(lane: StructuredLane): (summary: StructuredRetrySummary) => void {
  return (summary): void => {
    addSpanEvent(STRUCTURED_RETRY_EVENT, { lane, issueCount: summary.issueCount, paths: summary.paths.join(",") });
  };
}
