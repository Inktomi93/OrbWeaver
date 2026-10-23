// @subject packages/server/src/domain/chat/verbs/turn.ts
// @subject packages/contracts/src/chat/member-projection.ts
import { messageVariants } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { eq } from "drizzle-orm";
import { IMAGE_TOOL, imageRoom, nativeText, nativeTool } from "../engine/inline-image-physical.ts";
import { invitePerson } from "../persona-cache-physical.ts";

const BEFORE = "Before.";
const PRIVATE_ADDITION = '<lie truth="native-hidden-continuation"/>';

test("a real hidden-only continuation restores explicit tool phases while its member-projected before and after prose stays identical", async () => {
  await using image = await imageRoom([[nativeText(BEFORE)], [nativeTool()], [nativeText(PRIVATE_ADDITION)]], true);
  const { h } = image;
  const member = await invitePerson(h);
  const generated = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId });
  expect(generated.aborted).toBe(false);
  const target = generated.messages[0];
  if (target === undefined) {
    throw new Error("the actual native generation produced no continuation target");
  }
  const scoped = { chatId: h.chatId, messageId: target.id };
  const continued = await h.root.services.chat.continueTurn({ principal: h.owner, ...scoped });
  expect(continued.aborted).toBe(false);
  expect(continued.messages).toMatchObject([
    { id: target.id, content: BEFORE + PRIVATE_ADDITION, toolCalls: [{ name: IMAGE_TOOL, result: "Moon", isError: false }] },
  ]);
  const memberBefore = (await h.root.services.chat.listMessages({ principal: member, chatId: h.chatId })).messages.find(({ id }) => id === target.id);
  expect(memberBefore).toMatchObject({ content: BEFORE, toolCalls: [{ name: IMAGE_TOOL, result: "Moon", isError: false }] });
  expect(JSON.stringify(memberBefore)).not.toContain("native-hidden-continuation");
  const after = await h.root.db.select().from(messageVariants).where(eq(messageVariants.id, target.selectedVariantId)).get();
  expect(after?.content).toBe(BEFORE + PRIVATE_ADDITION);
  expect(after?.metadata?.continuationTools).toMatchObject({
    beforeContent: BEFORE,
    before: [],
    after: [{ name: IMAGE_TOOL, result: "Moon", isError: false }],
    undone: false,
  });

  const undone = await h.root.services.chat.undoContinue({ principal: member, ...scoped });
  expect(undone.content).toBe(BEFORE);
  expect(undone.toolCalls).toEqual([]);
  const undoRow = await h.root.db.select().from(messageVariants).where(eq(messageVariants.id, target.selectedVariantId)).get();
  expect(undoRow?.content).toBe(BEFORE);
  expect(undoRow?.metadata?.continuationTools?.undone).toBe(true);

  const reverted = await h.root.services.chat.revertContinue({ principal: member, ...scoped });
  expect(reverted.content).toBe(undone.content);
  expect(reverted.toolCalls).toEqual(memberBefore?.toolCalls);
  expect(JSON.stringify(reverted)).not.toContain("native-hidden-continuation");
  const restored = await h.root.db.select().from(messageVariants).where(eq(messageVariants.id, target.selectedVariantId)).get();
  expect(restored?.content).toBe(BEFORE + PRIVATE_ADDITION);
  expect(restored?.toolCalls).toEqual(after?.toolCalls);
  expect(restored?.metadata?.continuationTools?.undone).toBe(false);
  expect(await image.inputs()).toHaveLength(3);
});
