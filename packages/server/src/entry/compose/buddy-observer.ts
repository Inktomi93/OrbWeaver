// Assembles the `BuddyObserverEnv` for `startBuddyObserver`. The observer is source-blind (consumes lite
// event shapes); this composition-root adapter is the one place the real event sources are narrowed onto
// those shapes (workloads bus, chat bus, the observability trace ring).

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { RoleClients } from "@orb/contracts/role-clients";
import type { Db } from "@orb/db";
import { messages, users } from "@orb/db";
import type { MessageId, UserId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import type { BuddyObserverEnv, LiteChatEvent, LiteTrace, LiteWorkloadEvent } from "#domain/buddy";
import type { WorkloadEvent } from "#domain/workloads";
import { subscribeWorkloadEvents } from "#domain/workloads";
import { recentTraces } from "#foundation/observability";
import { publishBuddyEvent, subscribeAllChatEvents } from "../../transport/trpc";

// How many recent traces the sampler scans per 30s poll.
const TRACE_SCAN_LIMIT = 100;

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

const CHAT_KIND: Partial<Record<ChatBusEvent["type"], LiteChatEvent["kind"]>> = {
  chatCreated: "first-message",
  turnCompleted: "turn-completed",
  turnAborted: "turn-aborted",
};

/** The self-attributed author of a completed turn's committed message (agent rows carry `authorUserId`;
 *  character/user rows carry null/none for this belt). The public `ChatBusEvent` deliberately omits turn
 *  identity (D19), so the acting principal is resolved from the committed row here — an authorized server-side
 *  `messages` read at the entry root, NOT a widening of the public bus. */
async function resolveMessageAuthor(db: Db, messageId: MessageId): Promise<UserId | null> {
  const rows = await db.select({ authorUserId: messages.authorUserId }).from(messages).where(eq(messages.id, messageId)).limit(1);
  return rows[0]?.authorUserId ?? null;
}

/** Map a chat bus event to the observer's lite shape; `null` for events the observer ignores. Feeds the real
 *  acting principal (AP3-2): a completed agent turn self-attributes, so the signal-router's self-drop belt
 *  (PD-45) drops a seated buddy reacting to its OWN room turn. Only `turnCompleted` carries a committed
 *  `messageId`; the other beats have no author to resolve (actingUserId stays null). */
export async function resolveLiteChat(db: Db, event: ChatBusEvent, at: number): Promise<LiteChatEvent | null> {
  const kind = CHAT_KIND[event.type];
  if (kind === undefined) {
    return null;
  }
  const actingUserId = event.type === "turnCompleted" && event.messageId !== null ? await resolveMessageAuthor(db, event.messageId) : null;
  return { chatId: event.chatId, kind, actingUserId, at };
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
        void resolveLiteChat(args.db, entry.event, args.now()).then((lite) => {
          if (lite !== null) {
            listener(lite);
          }
        });
      }),
    readRecentTraces: (): readonly LiteTrace[] =>
      recentTraces(TRACE_SCAN_LIMIT).map((t) => ({
        requestId: t.requestId,
        status: t.status,
        providerDurationMs: t.totals.providerDurationMs,
        startedAt: t.startedAt,
      })),
    // An agent principal resolves to its owner; a human/unknown resolves to null.
    resolveAgentOwner: async (userId: UserId): Promise<UserId | null> => {
      const rows = await args.db.select({ kind: users.kind, ownerUserId: users.ownerUserId }).from(users).where(eq(users.id, userId)).limit(1);
      const row = rows[0];
      return row !== undefined && row.kind === "agent" ? row.ownerUserId : null;
    },
  };
}
