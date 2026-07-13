// domain/buddy/observer/trace-sampler — 30s poll over the observability ring; dispatches at most one
// `trace:slow-turn` and one `trace:error-spike` signal per poll for the OWNER's buddy.

import type { UserId } from "@orb/kit/ids";
import type { BuddyObserverEnv, LiteTrace } from "../contract/observer-env";
import { react } from "./react";
import { isSlowTrace, traceSignal } from "./signals";

const SLOW_TURN_MS = 20_000;
const ERROR_SPIKE_COUNT = 3;

type SamplerDeps = Pick<
  BuddyObserverEnv,
  "db" | "now" | "newQuipId" | "summarize" | "emit" | "readRecentTraces"
> & { readonly ownerUserId: UserId };

/** Never throws — ring-read failures and `react` are both guarded/swallowed. */
export function sampleTracesOnce(deps: SamplerDeps): void {
  let traces: readonly LiteTrace[];
  try {
    traces = deps.readRecentTraces();
  } catch {
    return;
  }
  const now = deps.now();

  if (traces.some((t) => isSlowTrace(t, SLOW_TURN_MS))) {
    void react(deps, traceSignal("slow-turn", deps.ownerUserId, now));
  }
  const errorCount = traces.reduce((n, t) => (t.status === "error" ? n + 1 : n), 0);
  if (errorCount >= ERROR_SPIKE_COUNT) {
    void react(deps, traceSignal("error-spike", deps.ownerUserId, now));
  }
}

export const TRACE_SAMPLE_INTERVAL_MS = 30_000;
