// domain/buddy/observer/signals — the PURE signal builders (PD-64: moved OUT of contract/signals.ts, which
// stays types-only). Each builder normalizes a LITE source event (+ the resolved owner/host, when the
// source doesn't carry it) into ONE `BuddySignal` the reactor consumes — so `react()` stays oblivious to
// where a signal came from. Pure + zero-I/O → unit-pinnable without a db.
//
// THE DEDUP KEY is the "same underlying event" identity the reactor throttles on (`buddies.lastSignalKey`):
//   • workload/chat: the source entity id + the phase (a re-delivered `succeeded` for the same workload
//     dedups; a later DIFFERENT workload does not).
//   • trace/presence: bucketed by a 5-min window (`bucket5m`) so a sampler that re-observes the same slow
//     spell across successive polls emits ONE reaction, not one per poll.

import type { UserId } from "@orb/kit/ids";
import type { LiteChatEvent, LiteTrace, LiteWorkloadEvent } from "../contract/observer-env";
import type { BuddySignal } from "../contract/signals";

/** The 5-minute bucket a timestamp falls in — the throttle grain for the poll-driven (trace/presence)
 *  signals, whose "same event" is a time window rather than an entity id. */
const FIVE_MIN_MS = 300_000;
export function bucket5m(atMs: number): number {
  return Math.floor(atMs / FIVE_MIN_MS);
}

const WORKLOAD_VERB: Record<LiteWorkloadEvent["phase"], string> = {
  started: "picks up",
  completed: "finishes",
  failed: "trips on",
};

/** A workload beat → its `workload:*` signal, keyed to the RESOLVED owner (whose buddy reacts). */
export function workloadSignal(event: LiteWorkloadEvent, ownerId: UserId): BuddySignal {
  return {
    kind: `workload:${event.phase}`,
    userId: ownerId,
    dedupKey: `workload:${event.workloadId}:${event.phase}`,
    description: `A background job ${WORKLOAD_VERB[event.phase]} — react in character, one short line.`,
  };
}

const CHAT_BLURB: Record<LiteChatEvent["kind"], string> = {
  "first-message": "A new conversation just opened",
  "turn-completed": "A chat reply just landed",
  "turn-aborted": "A chat turn was cut short",
};

/** A chat turn beat → its `chat:*` signal, keyed to the RESOLVED chat host (whose buddy reacts). */
export function chatSignal(event: LiteChatEvent, hostId: UserId): BuddySignal {
  return {
    kind: `chat:${event.kind}`,
    userId: hostId,
    dedupKey: `chat:${event.chatId}:${event.kind}:${bucket5m(event.at)}`,
    description: `${CHAT_BLURB[event.kind]} — react in character, one short line.`,
  };
}

const TRACE_BLURB: Record<"slow-turn" | "error-spike", string> = {
  "slow-turn": "A model turn is dragging on",
  "error-spike": "Errors are spiking on the backend",
};

/** A sampler finding → a `trace:*` signal for the OWNER's buddy (traces are request-scoped, not
 *  user-attributed — the operator's companion feels the system's health). Bucketed so a persistent slow
 *  spell reacts once per window. */
export function traceSignal(
  kind: "slow-turn" | "error-spike",
  ownerId: UserId,
  atMs: number,
): BuddySignal {
  return {
    kind: `trace:${kind}`,
    userId: ownerId,
    dedupKey: `trace:${kind}:${bucket5m(atMs)}`,
    description: `${TRACE_BLURB[kind]} — react in character, one short line.`,
  };
}

const PRESENCE_BLURB: Record<"idle" | "wake" | "neglected", string> = {
  idle: "Things have gone quiet",
  wake: "You're back after a lull",
  neglected: "You've been away a long while",
};

/** A presence sweep beat → a `presence:*` signal, already keyed to the tracked user (the sweep knows whose
 *  buddy — no owner resolution). Bucketed so a long-idle user isn't re-nagged every sweep. */
export function presenceSignal(
  kind: "idle" | "wake" | "neglected",
  userId: UserId,
  atMs: number,
): BuddySignal {
  return {
    kind: `presence:${kind}`,
    userId,
    dedupKey: `presence:${kind}:${bucket5m(atMs)}`,
    description: `${PRESENCE_BLURB[kind]} — react in character, one short line.`,
  };
}

/** Narrow a lite trace to the sampler's slow-turn test (a single over-threshold provider span). */
export function isSlowTrace(trace: LiteTrace, thresholdMs: number): boolean {
  return trace.providerDurationMs >= thresholdMs;
}
