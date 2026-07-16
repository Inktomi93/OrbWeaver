// domain/buddy/observer/signal-router — owner-resolution + belt stage between raw lite event sources and
// the reactor. A workload/chat lite event carries an entity id, not "whose buddy reacts": the router
// resolves the owner/host, drops an event whose acting principal is the reacting owner's own seated agent,
// builds the normalized BuddySignal, and dispatches to react(). Every dispatch is fire-and-forget; the
// router catches its own resolve failures so a bad db read never propagates into a source bus's emit.

import type { UserId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { BuddyObserverReads, LiteChatEvent, LiteWorkloadEvent } from "../contract/observer-env";
import type { BuddySignal } from "../contract/signals";
import { react } from "./react";
import { chatSignal, workloadSignal } from "./signals";

type RouterDeps = Parameters<typeof react>[0] & {
  readonly reads: BuddyObserverReads;
  readonly resolveAgentOwner: (userId: UserId) => Promise<UserId | null>;
};

export function createSignalRouter(deps: RouterDeps): {
  readonly routeWorkload: (event: LiteWorkloadEvent) => void;
  readonly routeChat: (event: LiteChatEvent) => void;
} {
  const runRoute = async (build: () => Promise<BuddySignal | null>): Promise<void> => {
    try {
      const signal = await build();
      if (signal !== null) {
        void react(deps, signal);
      }
    } catch (err) {
      getLog().warn({ err }, "buddy observer: signal routing failed (swallowed)");
    }
  };

  const buildWorkload = async (event: LiteWorkloadEvent): Promise<BuddySignal | null> => {
    const ownerId = await deps.reads.resolveWorkloadOwner(event.workloadId);
    return ownerId === null ? null : workloadSignal(event, ownerId);
  };

  const buildChat = async (event: LiteChatEvent): Promise<BuddySignal | null> => {
    const hostId = await deps.reads.resolveChatHost(event.chatId);
    if (hostId === null) {
      return null;
    }
    // Drop the event if its acting principal is the host's own seated agent (buddy).
    if (event.actingUserId !== null) {
      const actingOwner = await deps.resolveAgentOwner(event.actingUserId);
      if (actingOwner === hostId) {
        return null;
      }
    }
    return chatSignal(event, hostId);
  };

  return {
    routeWorkload: (event: LiteWorkloadEvent): void => {
      void runRoute(() => buildWorkload(event));
    },
    routeChat: (event: LiteChatEvent): void => {
      void runRoute(() => buildChat(event));
    },
  };
}
