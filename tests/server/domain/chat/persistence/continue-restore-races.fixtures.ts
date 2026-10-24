// The restore race cases: one signed continuation per case, held at the native restore write while a competing write commits.

import type { UserBusEvent } from "@orb/contracts/user-bus";
import { chatEvents, chatParticipants, messageVariants, statsCanonVersions } from "@orb/db";
import { ChatOperationError } from "@orb/server/domain/chat";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { and, eq } from "drizzle-orm";
import { ChatNotFoundError } from "#server/domain/chat/contract/errors.ts";
import { signedContinuation } from "./continue-physical.ts";

const RESTORE_METHODS = ["undoContinue", "revertContinue"] as const;
/** Competing turn and membership writes: a newer continuation, a swipe, the member leaving, a role change. */
export const RESTORE_ROW_RACES = ["continuation", "selection", "membership", "role"] as const;
/** Competing single-field writes to the stored variant snapshot. */
export const RESTORE_SNAPSHOT_RACES = ["preContent", "preReasoning", "lastContent", "lastReasoning", "metadata", "tools", "content", "reasoning"] as const;
type RestoreRace = (typeof RESTORE_ROW_RACES)[number] | (typeof RESTORE_SNAPSHOT_RACES)[number];

function watchUserChanges(h: ChatRoot): AsyncDisposable & { readonly events: UserBusEvent[] } {
  const abort = new AbortController();
  const events: UserBusEvent[] = [];
  const consuming = (async (): Promise<void> => {
    try {
      for await (const event of h.root.app.liveBuses.user.subscribeUserEvents(h.owner.userId, abort.signal)) {
        events.push(event);
      }
    } catch (error) {
      if (!(abort.signal.aborted && error instanceof Error && error.name === "AbortError")) {
        throw error;
      }
    }
  })();
  return {
    events,
    [Symbol.asyncDispose]: async (): Promise<void> => {
      abort.abort();
      await consuming;
    },
  };
}

/** Register one case per race: the restore is held at its native write, the race commits, and the restore must refuse
 *  before canon, versions or events change. */
export function registerRestoreRaces(method: (typeof RESTORE_METHODS)[number], races: readonly RestoreRace[]): void {
  test.for(races)(`restore refuses stale ${method} / %s before canon, versions or events`, async (race) => {
    await using f = await signedContinuation();
    const { h } = f.image;
    const args = { principal: h.owner, chatId: h.chatId, messageId: f.slot.id };
    if (method === "revertContinue") {
      await h.root.services.chat.undoContinue(args);
    }
    const current = await h.root.db.select().from(messageVariants).where(eq(messageVariants.id, f.slot.selectedVariantId)).get();
    const currentTools = current?.toolCalls;
    if (current === undefined || currentTools === undefined || currentTools === null || currentTools.length === 0) {
      throw new Error("the native race fixture did not create an actual tool snapshot");
    }
    await using userChanges = watchUserChanges(h);
    const gate = f.held.hold(/update "message_variants" set[\s\S]*case when json_type\([\s\S]*continuationTools/u);
    const restoring = h.root.services.chat[method](args);
    const refused = expect(restoring).rejects.toBeInstanceOf(race === "membership" ? ChatNotFoundError : ChatOperationError);
    const mutateVariant = async (patch: Partial<typeof messageVariants.$inferInsert>): Promise<void> => {
      await h.root.db.update(messageVariants).set(patch).where(eq(messageVariants.id, f.slot.selectedVariantId));
    };
    // Single-field competing writes discriminate every stored snapshot predicate independently.
    const competing: Record<RestoreRace, () => Promise<void>> = {
      continuation: async () => {
        await h.root.services.chat.continueTurn({ ...args, intent: { replyMedia: "text+image", carryReasoning: "conversation" } });
      },
      selection: async () => {
        await h.root.services.chat.swipe({ ...args, intent: { replyMedia: "text+image", carryReasoning: "conversation" } });
      },
      membership: async () => {
        await h.root.db
          .update(chatParticipants)
          .set({ leftSeq: 2 })
          .where(and(eq(chatParticipants.chatId, h.chatId), eq(chatParticipants.userId, h.owner.userId)));
      },
      role: async () => {
        await h.root.db
          .update(chatParticipants)
          .set({ role: "member" })
          .where(and(eq(chatParticipants.chatId, h.chatId), eq(chatParticipants.userId, h.owner.userId)));
      },
      preContent: async () => {
        await mutateVariant({ preContinueContent: "Other base." });
      },
      preReasoning: async () => {
        await mutateVariant({ preContinueReasoning: "Other base reasoning." });
      },
      lastContent: async () => {
        await mutateVariant({ lastContinuationContent: "Other addition." });
      },
      lastReasoning: async () => {
        await mutateVariant({ lastContinuationReasoning: "Other addition reasoning." });
      },
      metadata: async () => {
        await mutateVariant({ metadata: { ...current.metadata, systemTokens: 999 } });
      },
      tools: async () => {
        await mutateVariant({ toolCalls: currentTools.map((record, index) => (index === 0 ? { ...record, hidden: !record.hidden } : record)) });
      },
      content: async () => {
        await mutateVariant({ content: "New authored body." });
      },
      reasoning: async () => {
        await mutateVariant({ reasoning: "New authored reasoning." });
      },
    };
    try {
      await gate.reached;
      gate.disarm();
      await competing[race]();
      await h.root.settleBackground();
      const variants = await h.root.db.select().from(messageVariants).orderBy(messageVariants.idx);
      const versions = await h.root.db.select().from(statsCanonVersions);
      const events = await h.root.db.select().from(chatEvents).where(eq(chatEvents.chatId, h.chatId)).orderBy(chatEvents.seq);
      const userEvents = [...userChanges.events];
      gate.release();
      await refused;
      expect(await h.root.db.select().from(messageVariants).orderBy(messageVariants.idx)).toEqual(variants);
      expect(await h.root.db.select().from(statsCanonVersions)).toEqual(versions);
      expect(await h.root.db.select().from(chatEvents).where(eq(chatEvents.chatId, h.chatId)).orderBy(chatEvents.seq)).toEqual(events);
      await userChanges[Symbol.asyncDispose]();
      expect(userChanges.events).toEqual(userEvents);
    } finally {
      gate.release();
      await Promise.allSettled([restoring, refused]);
    }
  });
}
