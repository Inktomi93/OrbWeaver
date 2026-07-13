// domain/buddy/observer/start — startBuddyObserver: the supervised out-of-band lifecycle, NOT a service
// verb. Composition root calls it once with the assembled BuddyObserverEnv; wires live event sources →
// the signal router, arms two poll sweeps (traces + presence), returns stop() run on SIGTERM. Everything
// below is fire-and-forget through react(), which never throws into the loop. Presence state is in-memory
// per-process (assumes single-replica).

import type { UserId } from "@orb/kit/ids";
import type { BuddyObserverEnv, BuddyObserverHandle } from "../contract/observer-env";
import { createBuddyObserverReads } from "./db-reads";
import { react } from "./react";
import { createSignalRouter } from "./signal-router";
import { presenceSignal } from "./signals";
import { sampleTracesOnce, TRACE_SAMPLE_INTERVAL_MS } from "./trace-sampler";

const PRESENCE_SWEEP_INTERVAL_MS = 60_000;
const IDLE_AFTER_MS = 600_000; // 10 min
const NEGLECT_AFTER_MS = 3_600_000; // 1 hour

const PRESENCE_STATES = ["active", "idle", "neglected"] as const;
type PresenceState = (typeof PRESENCE_STATES)[number];

/** Start the buddy observer reaction engine. Idempotent teardown via the returned stop(). */
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

  const lastSeen = new Map<UserId, number>();
  const presenceState = new Map<UserId, PresenceState>();

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
