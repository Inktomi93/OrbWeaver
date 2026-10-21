// @subject packages/server/src/domain/chat/persistence/canon-write.ts
// Real signed tool snapshots and a held native write distinguish stale restoration from a valid restore.
import "@orb/testkit/node/composed-real.ts";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import { chatEvents, chatParticipants, messageVariants, statsCanonVersions } from "@orb/db";
import { ChatNotFoundError, ChatOperationError } from "@orb/server/domain/chat";
import type { ChatRoot } from "@orb/testkit/node/chat/composed.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { and, eq } from "drizzle-orm";
import { TOOL_SIGNATURE } from "../engine/inline-image-physical.ts";
import { signedContinuation } from "./continue-physical.ts";

test("a newer signed tool continuation fences a stale undo without changing its private snapshot, versions or events", async () => {
  await using f = await signedContinuation();
  const { h } = f.image;
  expect(f.before.content).toBe("Base.A.");
  expect(f.before.metadata?.continuationTools?.before).toHaveLength(1);
  expect(f.before.metadata?.continuationTools?.after).toHaveLength(2);
  expect(JSON.stringify(f.before.metadata)).toContain(TOOL_SIGNATURE);
  const gate = f.held.hold(/update "message_variants" set[\s\S]*case when json_type\([\s\S]*continuationTools/u);
  const restoring = h.root.services.chat.undoContinue({ principal: h.owner, chatId: h.chatId, messageId: f.slot.id });
  const refused = expect(restoring).rejects.toBeInstanceOf(ChatOperationError);
  try {
    await gate.reached;
    gate.disarm();
    await h.root.services.chat.continueTurn({
      principal: h.owner,
      chatId: h.chatId,
      messageId: f.slot.id,
      intent: { replyMedia: "text+image", carryReasoning: "conversation" },
    });
    await h.root.settleBackground();
    const variants = await h.root.db.select().from(messageVariants).orderBy(messageVariants.idx);
    const versions = await h.root.db.select().from(statsCanonVersions);
    const events = await h.root.db.select().from(chatEvents).where(eq(chatEvents.chatId, h.chatId)).orderBy(chatEvents.seq);
    expect(variants[0]?.content).toBe("Base.A.B.");
    expect(variants[0]?.metadata?.continuationTools?.after).toHaveLength(3);
    gate.release();
    await refused;
    expect(await h.root.db.select().from(messageVariants).orderBy(messageVariants.idx)).toEqual(variants);
    expect(await h.root.db.select().from(statsCanonVersions)).toEqual(versions);
    expect(await h.root.db.select().from(chatEvents).where(eq(chatEvents.chatId, h.chatId)).orderBy(chatEvents.seq)).toEqual(events);
  } finally {
    gate.release();
    await Promise.allSettled([restoring, refused]);
  }
});

test("native undo and revert retain exact signed parts and tool phases while public views withhold signatures", async () => {
  await using f = await signedContinuation();
  const { h } = f.image;
  const args = { principal: h.owner, chatId: h.chatId, messageId: f.slot.id };
  const undone = await h.root.services.chat.undoContinue(args);
  expect(undone.content).toBe("Base.");
  const storedUndo = await h.root.db.select().from(messageVariants).where(eq(messageVariants.id, f.slot.selectedVariantId)).get();
  expect(storedUndo?.metadata).toEqual({
    ...f.before.metadata,
    continuationTools: { ...f.before.metadata?.continuationTools, undone: true },
  });
  expect(storedUndo?.toolCalls).toEqual(f.before.metadata?.continuationTools?.before);
  expect(JSON.stringify(undone)).not.toMatch(/base-private|a-private|private-native/u);
  const reverted = await h.root.services.chat.revertContinue(args);
  expect(reverted.content).toBe("Base.A.");
  const storedRevert = await h.root.db.select().from(messageVariants).where(eq(messageVariants.id, f.slot.selectedVariantId)).get();
  expect(storedRevert?.metadata).toEqual(f.before.metadata);
  expect(storedRevert?.toolCalls).toEqual(f.before.metadata?.continuationTools?.after);
  expect(JSON.stringify(reverted)).not.toMatch(/base-private|a-private|private-native/u);
});

const RESTORE_METHODS = ["undoContinue", "revertContinue"] as const;
const RESTORE_RACES = [
  "continuation",
  "selection",
  "membership",
  "role",
  "preContent",
  "preReasoning",
  "lastContent",
  "lastReasoning",
  "metadata",
  "tools",
  "content",
  "reasoning",
] as const;
type RestoreRace = (typeof RESTORE_RACES)[number];

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

test.for(RESTORE_METHODS.flatMap((method) => RESTORE_RACES.map((race) => ({ method, race }))))(
  "restore refuses stale $method / $race before canon, versions or events",
  async ({ method, race }) => {
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
  },
);
