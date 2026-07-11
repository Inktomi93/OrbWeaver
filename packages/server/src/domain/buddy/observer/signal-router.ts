// domain/buddy/observer/signal-router — the OWNER-RESOLUTION + BELT stage between the raw lite event sources
// and the reactor. A workload/chat lite event carries an ENTITY id, not "whose buddy reacts": the router
// resolves the owner/host (buddy's own db-reads), applies THE BELT, builds the normalized `BuddySignal`, and
// dispatches to `react()`.
//
// THE BELT (agent-principal-design/04 §6 — landed WITH this build): a SEATED buddy must not quip-react to
// its OWN room's events. The router drops an event whose acting principal is the reacting owner's own agent —
// one comparison: `resolveAgentOwner(actingUserId) === reactingOwner`. (Runtime-inert until the seat wave
// carries `actingUserId` onto the chat seam — the public `ChatBusEvent` omits turn identity, D19 — but the
// guard + its test land now.)
//
// Every dispatch is fire-and-forget through `react()` (which never throws); the router itself catches its
// own resolve failures so a bad db read can never propagate into a source bus's synchronous emit.

import type { UserId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type {
  BuddyObserverReads,
  LiteChatEvent,
  LiteWorkloadEvent,
} from "../contract/observer-env";
import type { BuddySignal } from "../contract/signals";
import { react } from "./react";
import { chatSignal, workloadSignal } from "./signals";

// The router's slice of the env — what `react` needs, the owner/host reads, and the injected belt hop
// (`resolveAgentOwner` reads `users`, wired at entry). Module-local (non-exported).
type RouterDeps = Parameters<typeof react>[0] & {
  readonly reads: BuddyObserverReads;
  readonly resolveAgentOwner: (userId: UserId) => Promise<UserId | null>;
};

/** Build the two source listeners (`onWorkloadEvent`/`onChatEvent` hand these the lite events). Kept as a
 *  factory so `start.ts` wires the subscriptions and the reactor deps in one place. */
export function createSignalRouter(deps: RouterDeps): {
  readonly routeWorkload: (event: LiteWorkloadEvent) => void;
  readonly routeChat: (event: LiteChatEvent) => void;
} {
  // Resolve a signal (owner/host + belt) then dispatch — catching its own failures so a resolve error never
  // propagates into the source bus's emit. A `null` build = intentionally dropped (no owner / belt).
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
    // THE BELT: drop the event if its acting principal is the HOST's own seated agent (buddy).
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
