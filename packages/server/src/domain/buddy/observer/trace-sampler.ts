// domain/buddy/observer/trace-sampler — the 30s poll over the observability ring for two SYSTEM-health
// conditions the OWNER's buddy reacts to (traces are request-scoped, not user-attributed):
//   • slow-turn   — a recent trace whose provider span dragged past the threshold → `trace:slow-turn`.
//   • error-spike — ≥ N `error`-status traces in the window → `trace:error-spike` (a BYPASS-cooldown signal).
// Each is bucketed by the signal builder (`bucket5m`) so a persistent spell reacts ONCE per window, not once
// per poll. The poll takes a `LiteTrace[]` snapshot (injected reader) and dispatches at most one of each
// through `react()` — pure decision here, the I/O (the ring read, the react) is injected.

import type { UserId } from "@orb/kit/ids";
import type { BuddyObserverEnv, LiteTrace } from "../contract/observer-env";
import { react } from "./react";
import { isSlowTrace, traceSignal } from "./signals";

// A single provider span over this is "dragging" (a slow turn the buddy notices). vLLM/API turns under
// ~20s are routine; 20s+ is the tell.
const SLOW_TURN_MS = 20_000;
// ≥ this many error traces in a snapshot is a spike (one blip is noise; a run is a spike).
const ERROR_SPIKE_COUNT = 3;

// The sampler's slice of the env (ring reader + reactor deps + the owner + clock). Module-local.
type SamplerDeps = Pick<
  BuddyObserverEnv,
  "db" | "now" | "newQuipId" | "summarize" | "emit" | "readRecentTraces"
> & { readonly ownerUserId: UserId };

/** Run ONE sampler poll — snapshot the ring, decide, dispatch at most one slow-turn + one error-spike for
 *  the OWNER's buddy. Never throws (delegates to `react`, which swallows; the read is guarded here). */
export function sampleTracesOnce(deps: SamplerDeps): void {
  let traces: readonly LiteTrace[];
  try {
    traces = deps.readRecentTraces();
  } catch {
    return; // a ring-read failure is not the buddy's problem
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

/** The poll cadence — 30s (proposed/buddy-observer-reaction-engine.md). */
export const TRACE_SAMPLE_INTERVAL_MS = 30_000;
