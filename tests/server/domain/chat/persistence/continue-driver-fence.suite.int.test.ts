// A real driver fence holds stale continuation writes: the landed variant row, the stats_canon_versions CAS
// counter and the chat_events log change only at the fenced commit.
// @subject packages/server/src/domain/chat/verbs/turn.ts

import { chatEvents, closeDb, messages, messageVariants, statsCanonVersions } from "@orb/db";
import { ChatOperationError } from "@orb/server/domain/chat";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { freshHeldDb } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";
import { textRoom } from "../scenario-physical.ts";

async function continuedSlot(h: ChatRoot): Promise<Awaited<ReturnType<ChatRoot["root"]["services"]["chat"]["send"]>>["messages"][number]> {
  const sent = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Begin the account." });
  const assistant = sent.messages.find(({ role }) => role === "assistant");
  if (assistant === undefined) {
    throw new Error("the actual send produced no assistant slot");
  }
  await h.root.services.chat.continueTurn({ principal: h.owner, chatId: h.chatId, messageId: assistant.id });
  await h.root.settleBackground();
  return assistant;
}

test("restore refuses a newer real continuation before canon, versions or events", async () => {
  await using lifetime = new AsyncDisposableStack();
  const held = await freshHeldDb();
  lifetime.defer(() => closeDb(held.db));
  const h = lifetime.use(await textRoom(["Base.", "A.", "B."], { server: { db: held.db }, group: { policy: "list", output: "per-speaker" } }));
  const assistant = await continuedSlot(h);
  const gate = held.hold(/update "message_variants" set[\s\S]*case when json_type\([\s\S]*continuationTools/u);
  const restoring = h.root.services.chat.undoContinue({ principal: h.owner, chatId: h.chatId, messageId: assistant.id });
  const refusal = expect(restoring).rejects.toBeInstanceOf(ChatOperationError);
  try {
    await gate.reached;
    gate.disarm();
    const continued = await h.root.services.chat.continueTurn({ principal: h.owner, chatId: h.chatId, messageId: assistant.id });
    expect(continued.messages.map(({ content }) => content)).toEqual(["Base.A.B."]);
    await h.root.settleBackground();
    const variants = await h.root.db.select().from(messageVariants).orderBy(messageVariants.idx);
    const versions = await h.root.db.select().from(statsCanonVersions);
    const events = await h.root.db.select().from(chatEvents).where(eq(chatEvents.chatId, h.chatId)).orderBy(chatEvents.seq);
    gate.release();
    await refusal;
    expect(await h.root.db.select().from(messageVariants).orderBy(messageVariants.idx)).toEqual(variants);
    expect(await h.root.db.select().from(statsCanonVersions)).toEqual(versions);
    expect(await h.root.db.select().from(chatEvents).where(eq(chatEvents.chatId, h.chatId)).orderBy(chatEvents.seq)).toEqual(events);
  } finally {
    gate.release();
    await Promise.allSettled([restoring, refusal]);
  }
});

test("post-success host demotion returns current member bytes without undoing the valid restore", async () => {
  await using lifetime = new AsyncDisposableStack();
  const held = await freshHeldDb();
  lifetime.defer(() => closeDb(held.db));
  const h = lifetime.use(
    await textRoom(['Before.<lie truth="host-secret"/>After.', "A."], { server: { db: held.db }, group: { policy: "list", output: "per-speaker" } }),
  );
  const assistant = await continuedSlot(h);
  const member = await h.root.principalFor((await h.root.actor()).id);
  const invite = await h.root.services.chat.createInvite({ principal: h.owner, chatId: h.chatId, input: { invitedHandle: member.handle } });
  await h.root.services.chat.acceptInvite({ principal: member, inviteId: invite.invite.id });
  const gate = held.hold(/insert into "chat_events"/u);
  const restoring = h.root.services.chat.undoContinue({ principal: h.owner, chatId: h.chatId, messageId: assistant.id });
  const settled = Promise.allSettled([restoring]);
  try {
    await gate.reached;
    gate.disarm();
    const committed = await h.root.db.select().from(messageVariants).where(eq(messageVariants.id, assistant.selectedVariantId)).get();
    expect(committed?.content).toBe('Before.<lie truth="host-secret"/>After.');
    expect(committed?.preContinueContent).toBe('Before.<lie truth="host-secret"/>After.');
    expect(committed?.lastContinuationContent).toBe("A.");
    await h.root.services.chat.nominateHostHandoff({ principal: h.owner, chatId: h.chatId, userId: member.userId });
    await h.root.services.chat.acceptHostHandoff({ principal: member, chatId: h.chatId });
    gate.release();
    const view = await restoring;
    expect(view.content).toBe("Before.After.");
    expect(JSON.stringify(view)).not.toContain("host-secret");
    const after = await h.root.db.select().from(messageVariants).where(eq(messageVariants.id, assistant.selectedVariantId)).get();
    expect(after).toEqual(committed);
    const events = await h.root.db.select().from(chatEvents).where(eq(chatEvents.chatId, h.chatId));
    expect(
      events.filter(({ type, payload }) => type === "messageCommitted" && payload.type === "messageCommitted" && payload.messageId === assistant.id),
    ).toContainEqual(expect.objectContaining({ payload: expect.objectContaining({ view: expect.objectContaining({ content: committed?.content }) }) }));
    expect(await h.root.db.select().from(messages).where(eq(messages.id, assistant.id))).toHaveLength(1);
  } finally {
    gate.release();
    await settled;
  }
});
