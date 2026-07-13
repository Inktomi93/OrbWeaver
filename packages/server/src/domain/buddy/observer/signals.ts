// domain/buddy/observer/signals — pure signal builders. Each normalizes a lite source event (+ resolved
// owner/host) into ONE BuddySignal, so react() stays oblivious to origin. dedupKey identifies "same
// underlying event": workload/chat key on entity id + phase; trace/presence bucket by a 5-min window so
// a persistent condition emits once per window, not once per poll.

import type { UserId } from "@orb/kit/ids";
import type { LiteChatEvent, LiteTrace, LiteWorkloadEvent } from "../contract/observer-env";
import type { BuddySignal } from "../contract/signals";

const FIVE_MIN_MS = 300_000;
export function bucket5m(atMs: number): number {
  return Math.floor(atMs / FIVE_MIN_MS);
}

const WORKLOAD_VERB: Record<LiteWorkloadEvent["phase"], string> = {
  started: "picks up",
  completed: "finishes",
  failed: "trips on",
};

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

/** Traces are request-scoped, not user-attributed; the OWNER's companion feels the system's health. */
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

export function isSlowTrace(trace: LiteTrace, thresholdMs: number): boolean {
  return trace.providerDurationMs >= thresholdMs;
}
