// entry/compose/buddy-observer — assembles the `BuddyObserverEnv` for `startBuddyObserver` (PD-45/PD-64).
// The observer is source-BLIND (it consumes LITE event shapes); this composition-root adapter is the ONE
// place the real event sources are narrowed onto those shapes:
//   • onWorkloadEvent — the workloads progress-bus firehose (`subscribeWorkloadEvents`) → LiteWorkloadEvent
//     (only the three phases the observer reacts to; progress/status/cancelled dropped).
//   • onChatEvent     — the transport chat firehose (`subscribeAllChatEvents`) → LiteChatEvent. `actingUserId`
//     is null: the public `ChatBusEvent` deliberately omits turn identity (D19), so the belt is inert at
//     runtime until the seat wave carries it — the guard + its test land now (agent-principal-design/04 §6).
//   • readRecentTraces — the foundation observability ring (`recentTraces`) → LiteTrace (the sampler's slice).
// `summarize`/`emit`/`newQuipId`/timers are wired to the bound role-clients, the transport buddy bus, the
// mint site, and entry's injected interval. `ownerUserId` is whose buddy reacts to SYSTEM-health traces.

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { RoleClients } from "@orb/contracts/role-clients";
import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import type { BuddyObserverEnv, LiteChatEvent, LiteTrace, LiteWorkloadEvent } from "#domain/buddy";
import type { WorkloadEvent } from "#domain/workloads";
import { subscribeWorkloadEvents } from "#domain/workloads";
import { recentTraces } from "#foundation/observability";
import { publishBuddyEvent, subscribeAllChatEvents } from "../../transport/trpc";

// How many recent traces the sampler scans per 30s poll.
const TRACE_SCAN_LIMIT = 100;

// The workloads-bus `type` → observer phase map (only the reacted-to phases; the rest are absent → dropped).
const WORKLOAD_PHASE: Partial<Record<WorkloadEvent["type"], LiteWorkloadEvent["phase"]>> = {
  started: "started",
  succeeded: "completed",
  failed: "failed",
};

/** Map a workloads bus event to the observer's lite shape; `null` for phases the observer ignores. */
function toLiteWorkload(event: WorkloadEvent): LiteWorkloadEvent | null {
  const phase = WORKLOAD_PHASE[event.type];
  return phase === undefined ? null : { workloadId: event.workloadId, phase, at: event.at };
}

// The chat-bus `type` → observer kind map (only the reacted-to events; the rest are absent → dropped).
const CHAT_KIND: Partial<Record<ChatBusEvent["type"], LiteChatEvent["kind"]>> = {
  chatCreated: "first-message",
  turnCompleted: "turn-completed",
  turnAborted: "turn-aborted",
};

/** Map a chat bus event to the observer's lite shape; `null` for events the observer ignores. */
function toLiteChat(event: ChatBusEvent, at: number): LiteChatEvent | null {
  const kind = CHAT_KIND[event.type];
  // actingUserId: null — the public ChatBusEvent carries no turn identity (D19); the belt is inert until the
  // seat wave carries it onto this seam.
  return kind === undefined ? null : { chatId: event.chatId, kind, actingUserId: null, at };
}

/** Assemble the observer env from the composition root's primitives + the real event sources. */
export function createBuddyObserverEnv(args: {
  readonly db: Db;
  readonly now: () => number;
  readonly ownerUserId: UserId;
  readonly summarize: RoleClients["summarize"];
  readonly scheduleInterval: (fn: () => void, ms: number) => () => void;
}): BuddyObserverEnv {
  return {
    db: args.db,
    now: args.now,
    newQuipId: () => mintTypeId(ID_PREFIX.buddyQuip),
    ownerUserId: args.ownerUserId,
    summarize: args.summarize,
    emit: publishBuddyEvent,
    scheduleInterval: args.scheduleInterval,
    onWorkloadEvent: (listener) =>
      subscribeWorkloadEvents((event) => {
        const lite = toLiteWorkload(event);
        if (lite !== null) {
          listener(lite);
        }
      }),
    onChatEvent: (listener) =>
      subscribeAllChatEvents((entry) => {
        const lite = toLiteChat(entry.event, args.now());
        if (lite !== null) {
          listener(lite);
        }
      }),
    readRecentTraces: (): readonly LiteTrace[] =>
      recentTraces(TRACE_SCAN_LIMIT).map((t) => ({
        requestId: t.requestId,
        status: t.status,
        providerDurationMs: t.totals.providerDurationMs,
        startedAt: t.startedAt,
      })),
    // THE BELT hop — reads `users` (the entry root is the sanctioned users reader, exempt from
    // no-direct-users-read; the `resolveUserPublics`/`resolveAgentEnabled` precedent in compose/chat.ts). An
    // agent principal → its owner; a human / unknown → null.
    resolveAgentOwner: async (userId: UserId): Promise<UserId | null> => {
      const rows = await args.db
        .select({ kind: users.kind, ownerUserId: users.ownerUserId })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const row = rows[0];
      return row !== undefined && row.kind === "agent" ? row.ownerUserId : null;
    },
  };
}
