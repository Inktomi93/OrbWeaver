// @subject packages/server/src/domain/chat/persistence/canon-write.ts
// Real signed tool snapshots and a held native write distinguish stale restoration from a valid restore.
import { chatEvents, messageVariants, statsCanonVersions } from "@orb/db";
import { ChatOperationError } from "@orb/server/domain/chat";
import { expect, test } from "@orb/testkit/node";
import { eq } from "drizzle-orm";
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
