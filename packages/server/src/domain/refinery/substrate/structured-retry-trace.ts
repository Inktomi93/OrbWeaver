// domain/refinery/substrate — the refinery lanes' structured-turn RETRY trace adapter. The
// `discovery/substrate/structured-retry-trace.ts` twin (its header carries the WHY: `runStructuredTurn`
// sits below `foundation`, so the observability callback is built domain-side); the LANE vocabulary is
// per-domain — discovery names its three, this file names refinery's three — while the EVENT name and
// attribute shape stay the shared `provider.structured.retry` contract (grep-coupled by the literal).
// METADATA ONLY: schema paths + a count, never zod messages (they quote model output — RP-adjacent
// content that must not reach a span attribute; the structured-turn header's law).

import type { StructuredRetrySummary } from "@orb/server/kit/structured-turn";
import { addSpanEvent } from "#foundation/observability";

const STRUCTURED_RETRY_EVENT = "provider.structured.retry";

/** Which refinery lane retried — file-local vocabulary (the discovery precedent). */
const STRUCTURED_LANES = ["refine-score", "refine-rewrite", "refine-analyze"] as const;
type StructuredLane = (typeof STRUCTURED_LANES)[number];

/** Build the `onRetry` closure for a refinery stage lane — annotates the ACTIVE span; a silent no-op
 *  outside one. */
export function traceStructuredRetry(lane: StructuredLane): (summary: StructuredRetrySummary) => void {
  return (summary): void => {
    addSpanEvent(STRUCTURED_RETRY_EVENT, { lane, issueCount: summary.issueCount, paths: summary.paths.join(",") });
  };
}
