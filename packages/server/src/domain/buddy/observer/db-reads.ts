// domain/buddy/observer/db-reads — `createBuddyObserverReads`: the observer's NARROW schema-level reads of
// OTHER domains' NON-identity tables (NOT cross-feature service calls — the observer needs only "whose buddy
// reacts", which is one FK/junction hop, and a cross-feature op would drag a whole service into the loop).
// Sanctioned exactly like `entry/compose/emit-chat-changed.ts`'s roster read + chat.ts's host read: a bare
// single-column select, never business logic.
//   • resolveWorkloadOwner — `workloads.ownerId` by id (a system/scheduler row has a NULL owner → no react).
//   • resolveChatHost      — `chat_participants.role='host'` present row's `userId` (D18: no `chats.ownerId`).
// The belt's agent-owner hop reads `users` (the no-direct-users-read chokepoint), so it is NOT here — it is
// the injected `BuddyObserverEnv.resolveAgentOwner`, wired at the entry root (the sanctioned users reader).

import type { Db } from "@orb/db";
import { chatParticipants, workloads } from "@orb/db";
import type { ChatId, UserId, WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq, isNull } from "drizzle-orm";
import type { BuddyObserverReads } from "../contract/observer-env";

export function createBuddyObserverReads(db: Db): BuddyObserverReads {
  return {
    resolveWorkloadOwner: async (workloadId): Promise<UserId | null> => {
      const rows = await db
        .select({ ownerId: workloads.ownerId })
        .from(workloads)
        .where(eq(workloads.id, castId<WorkloadId>(workloadId)))
        .limit(1);
      return rows[0]?.ownerId ?? null;
    },
    resolveChatHost: async (chatId): Promise<UserId | null> => {
      const rows = await db
        .select({ userId: chatParticipants.userId })
        .from(chatParticipants)
        .where(
          and(
            eq(chatParticipants.chatId, castId<ChatId>(chatId)),
            eq(chatParticipants.role, "host"),
            isNull(chatParticipants.leftSeq),
          ),
        )
        .limit(1);
      return rows[0]?.userId ?? null;
    },
  };
}
