// domain/buddy/observer/start — `startBuddyObserver`: the SUPERVISED out-of-band lifecycle (NOT a service
// verb — proposed/buddy-observer-reaction-engine.md §Injection). The composition root calls it once with the
// assembled `BuddyObserverEnv`; it wires the live event sources → the signal router, arms the two poll
// sweeps (traces 30s + presence), and returns a `stop()` the lifecycle runs on SIGTERM (unsubscribe + clear
// timers). Everything below is fire-and-forget through `react()`, which NEVER throws into the loop.
//
// PRESENCE: the observer tracks the last time it saw activity FOR each user (any resolved workload/chat beat
// updates it) and sweeps periodically → `presence:idle`/`neglected` for the long-quiet, `presence:wake` when
// a quiet user acts again. In-memory per-process state (ASSUMES single-replica), keyed by the user whose
// buddy reacts (no owner resolution — the sweep already knows whose).

import type { UserId } from "@orb/kit/ids";
import type { BuddyObserverEnv, BuddyObserverHandle } from "../contract/observer-env";
import { createBuddyObserverReads } from "./db-reads";
import { react } from "./react";
import { createSignalRouter } from "./signal-router";
import { presenceSignal } from "./signals";
import { sampleTracesOnce, TRACE_SAMPLE_INTERVAL_MS } from "./trace-sampler";

// A user quiet longer than this is `idle`; longer than NEGLECT is `neglected`. The presence sweep runs on
// this cadence too (so `idle` fires within one sweep of crossing the line).
const PRESENCE_SWEEP_INTERVAL_MS = 60_000;
const IDLE_AFTER_MS = 600_000; // 10 min
const NEGLECT_AFTER_MS = 3_600_000; // 1 hour

const PRESENCE_STATES = ["active", "idle", "neglected"] as const;
type PresenceState = (typeof PRESENCE_STATES)[number];

/**
 * Start the buddy observer reaction engine. Idempotent teardown via the returned `stop()`. The env is
 * assembled at `entry/` (the real workloads/chat buses, the observability ring, `roleClients.summarize`, the
 * reaction bus emit, the injected interval timer + clock).
 */
export function startBuddyObserver(env: BuddyObserverEnv): BuddyObserverHandle {
  const reads = createBuddyObserverReads(env.db);
  const router = createSignalRouter({
    db: env.db,
    now: env.now,
    newQuipId: env.newQuipId,
    summarize: env.summarize,
    emit: env.emit,
    reads,
    resolveAgentOwner: env.resolveAgentOwner,
  });

  // ── Presence tracking (in-memory, per-process) ──
  const lastSeen = new Map<UserId, number>();
  const presenceState = new Map<UserId, PresenceState>();

  /** Note activity for a user; if they were idle/neglected, fire a `presence:wake` for their buddy. */
  const touch = (userId: UserId): void => {
    const prior = presenceState.get(userId);
    lastSeen.set(userId, env.now());
    presenceState.set(userId, "active");
    if (prior === "idle" || prior === "neglected") {
      void react(reactorDeps, presenceSignal("wake", userId, env.now()));
    }
  };

  const reactorDeps = {
    db: env.db,
    now: env.now,
    newQuipId: env.newQuipId,
    summarize: env.summarize,
    emit: env.emit,
  };

  // The router resolves owner/host; we tap the SAME lite events for presence (the workload owner / chat host
  // is whose buddy reacts, so presence is keyed on the resolved id — resolve once here for the touch).
  const onWorkload = (event: Parameters<typeof router.routeWorkload>[0]): void => {
    router.routeWorkload(event);
    void reads.resolveWorkloadOwner(event.workloadId).then((ownerId) => {
      if (ownerId !== null) {
        touch(ownerId);
      }
    });
  };
  const onChat = (event: Parameters<typeof router.routeChat>[0]): void => {
    router.routeChat(event);
    void reads.resolveChatHost(event.chatId).then((hostId) => {
      if (hostId !== null) {
        touch(hostId);
      }
    });
  };

  const presenceSweep = (): void => {
    const now = env.now();
    for (const [userId, seenAt] of lastSeen) {
      const quietMs = now - seenAt;
      const state = presenceState.get(userId) ?? "active";
      if (quietMs >= NEGLECT_AFTER_MS && state !== "neglected") {
        presenceState.set(userId, "neglected");
        void react(reactorDeps, presenceSignal("neglected", userId, now));
      } else if (quietMs >= IDLE_AFTER_MS && state === "active") {
        presenceState.set(userId, "idle");
        void react(reactorDeps, presenceSignal("idle", userId, now));
      }
    }
  };

  // ── Wire the sources + arm the sweeps ──
  const unsubWorkload = env.onWorkloadEvent(onWorkload);
  const unsubChat = env.onChatEvent(onChat);
  const stopTraceSweep = env.scheduleInterval(() => {
    sampleTracesOnce({
      db: env.db,
      now: env.now,
      newQuipId: env.newQuipId,
      summarize: env.summarize,
      emit: env.emit,
      readRecentTraces: env.readRecentTraces,
      ownerUserId: env.ownerUserId,
    });
  }, TRACE_SAMPLE_INTERVAL_MS);
  const stopPresenceSweep = env.scheduleInterval(presenceSweep, PRESENCE_SWEEP_INTERVAL_MS);

  let stopped = false;
  return {
    stop: (): void => {
      if (stopped) {
        return;
      }
      stopped = true;
      unsubWorkload();
      unsubChat();
      stopTraceSweep();
      stopPresenceSweep();
    },
  };
}
