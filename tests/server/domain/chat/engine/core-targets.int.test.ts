// @subject packages/server/src/domain/chat/engine/engine.ts
// Public variant operations retain actual slot identity, history anchors and continuation snapshots.
import "@orb/testkit/node/composed-real.ts";
import type { ChatBusEvent } from "@orb/contracts/chat";
import { messages, messageVariants } from "@orb/db";
import { makePromptConfig } from "@orb/testkit/iso/preset-config.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { terminalSseLine } from "@orb/testkit/node/provider-stream.ts";
import { eq } from "drizzle-orm";
import { coreFrame, coreHttpRoom, coreSse } from "./core-physical.ts";

const POSTFIX_ROWS = [
  { label: "default", postfix: undefined, delimiter: "" },
  { label: "none", postfix: "none", delimiter: "" },
  { label: "space", postfix: "space", delimiter: " " },
  { label: "double newline", postfix: "double-newline", delimiter: "\n\n" },
] as const;

function prose(text: string): Response {
  return coreSse([coreFrame({ choices: [{ delta: { content: text } }] }), terminalSseLine({ usage: { promptTokens: 4, completionTokens: 2 } })]);
}

test.for(POSTFIX_ROWS)("the saved $label continuation delimiter survives native snapshots and public undo/revert", async (row) => {
  await using h = await coreHttpRoom([(): Response => prose("tip"), (): Response => prose("more")], {
    promptConfig: makePromptConfig(row.postfix === undefined ? {} : { continuePostfix: row.postfix }),
  });
  const generated = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId });
  const target = generated.messages[0];
  if (target === undefined || target.selectedVariantId === null) {
    throw new Error("the actual continuation has no selected target");
  }
  const continued = await h.root.services.chat.continueTurn({ principal: h.owner, chatId: h.chatId, messageId: target.id });
  const addition = `${row.delimiter}more`;
  expect(continued.aborted).toBe(false);
  expect(continued.messages).toMatchObject([{ id: target.id, content: `tip${addition}`, variantCount: 1 }]);
  const variants = await h.root.db.select().from(messageVariants).where(eq(messageVariants.messageId, target.id));
  expect(variants).toHaveLength(1);
  expect(variants[0]).toMatchObject({ id: target.selectedVariantId, content: `tip${addition}`, preContinueContent: "tip", lastContinuationContent: addition });
  expect(await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId))).toHaveLength(1);
  expect(await h.root.services.chat.undoContinue({ principal: h.owner, chatId: h.chatId, messageId: target.id })).toMatchObject({
    id: target.id,
    content: "tip",
  });
  expect(await h.root.services.chat.revertContinue({ principal: h.owner, chatId: h.chatId, messageId: target.id })).toMatchObject({
    id: target.id,
    content: `tip${addition}`,
  });
});

test("native deltas retain the real old swipe slot's history anchor rather than the newer canon tail", async () => {
  await using h = await coreHttpRoom([(): Response => prose("first take"), (): Response => prose("later reply"), (): Response => prose("new first take")]);
  const first = (await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId })).messages[0];
  const later = (await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId })).messages[0];
  if (first === undefined || later === undefined) {
    throw new Error("the actual history anchor control has no two canonical slots");
  }
  expect(later.seq).toBeGreaterThan(first.seq);
  const events: ChatBusEvent[] = [];
  using subscription = new DisposableStack();
  subscription.defer(
    h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
      if (event.chatId === h.chatId) {
        events.push(event);
      }
    }),
  );
  const swiped = await h.root.services.chat.swipe({ principal: h.owner, chatId: h.chatId, messageId: first.id });
  expect(swiped.aborted).toBe(false);
  expect(swiped.messages).toMatchObject([
    {
      id: first.id,
      seq: first.seq,
      characterId: first.characterId,
      authorUserId: first.authorUserId,
      content: "new first take",
      selectedVariantIdx: 1,
      variantCount: 2,
    },
  ]);
  const anchors = events.flatMap((event) => (event.type === "delta" ? [event.slotSeq] : []));
  expect(anchors.length).toBeGreaterThan(0);
  expect([...new Set(anchors)]).toEqual([first.seq]);
  expect(await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq)).toMatchObject([
    { id: first.id, seq: first.seq, characterId: first.characterId },
    { id: later.id, seq: later.seq, selectedVariantId: later.selectedVariantId },
  ]);
  expect(await h.root.db.select().from(messageVariants).where(eq(messageVariants.messageId, first.id)).orderBy(messageVariants.idx)).toMatchObject([
    { content: "first take" },
    { content: "new first take" },
  ]);
});

test("native new-slot deltas anchor to the same sequence the real reply commits after earlier canon", async () => {
  await using h = await coreHttpRoom([(): Response => prose("earlier"), (): Response => prose("newest")]);
  await h.root.services.chat.commitMessage({ principal: h.owner, chatId: h.chatId, content: "An earlier user line." });
  expect((await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId })).aborted).toBe(false);
  const events: ChatBusEvent[] = [];
  using subscription = new DisposableStack();
  subscription.defer(
    h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
      if (event.chatId === h.chatId) {
        events.push(event);
      }
    }),
  );
  const newest = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId });
  expect(newest.aborted).toBe(false);
  const row = newest.messages[0];
  expect(row).toMatchObject({ seq: 3, content: "newest" });
  const anchors = events.flatMap((event) => (event.type === "delta" ? [event.slotSeq] : []));
  expect(anchors.length).toBeGreaterThan(0);
  expect([...new Set(anchors)]).toEqual([row?.seq]);
});
