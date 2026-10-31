// A message's position is its place among the rows this viewer can read, counted from the viewer's history floor.
// Every case runs production verbs; each case names the read that carries the number.
// @subject packages/server/src/domain/chat/persistence/message-positions.ts
// @subject packages/server/src/domain/chat/verbs/read.ts
// @subject packages/server/src/domain/chat/verbs/message-window.ts

import type { MessageView } from "@orb/contracts/chat";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { seedCorpusActors, seedMessage } from "@orb/testkit/node/composed";
import { textRoom } from "../scenario-physical.ts";

interface PositionedRow {
  readonly id: MessageView["id"];
  readonly position: MessageView["position"];
}

const rows = (messages: readonly MessageView[]): readonly PositionedRow[] => messages.map(({ id, position }) => ({ id, position }));
const inOrder = (messages: readonly { readonly id: MessageView["id"] }[]): readonly PositionedRow[] =>
  messages.map(({ id }, index) => ({ id, position: index + 1 }));

async function commit(h: ChatRoot, content: string): Promise<MessageView> {
  return await seedMessage(h.root, { principal: h.owner, chatId: h.chatId, content });
}

type Replay = Awaited<ReturnType<ChatRoot["root"]["services"]["chat"]["replayChatEvents"]>>;

/** Every view a replay delivers: the row's id and the position the delivery stamped. */
function replayed(events: Replay): readonly PositionedRow[] {
  return events.flatMap(({ event }) => ("view" in event ? [{ id: event.view.id, position: event.view.position }] : []));
}

test("listMessages and getMessageWindow number across a delete's seq gap and across page boundaries", async () => {
  await using h = await textRoom([]);
  const { chat } = h.root.services;
  const [a, b, c, d, e] = [await commit(h, "a"), await commit(h, "b"), await commit(h, "c"), await commit(h, "d"), await commit(h, "e")];
  await chat.deleteMessages({ principal: h.owner, chatId: h.chatId, messageIds: [b.id] });

  const all = await chat.listMessages({ principal: h.owner, chatId: h.chatId });
  expect(all.messages.map(({ seq }) => seq)).toEqual([a.seq, c.seq, d.seq, e.seq]);
  expect(rows(all.messages)).toEqual(inOrder([a, c, d, e]));

  const tail = await chat.listMessages({ principal: h.owner, chatId: h.chatId, limit: 2 });
  expect(rows(tail.messages)).toEqual(inOrder([a, c, d, e]).slice(2));
  const earlier = await chat.listMessages({ principal: h.owner, chatId: h.chatId, beforeSeq: d.seq, limit: 1 });
  expect(rows(earlier.messages)).toEqual([{ id: c.id, position: 2 }]);
  const forward = await chat.listMessages({ principal: h.owner, chatId: h.chatId, afterSeq: a.seq, limit: 2 });
  expect(rows(forward.messages)).toEqual([
    { id: c.id, position: 2 },
    { id: d.id, position: 3 },
  ]);

  const window = await chat.getMessageWindow({ principal: h.owner, chatId: h.chatId, target: { kind: "message", messageId: d.id }, limit: 2 });
  expect(rows(window.messages)).toEqual([
    { id: d.id, position: 3 },
    { id: e.id, position: 4 },
  ]);
});

test("send, swipe, continue, undo and revert keep each row's number, on the page and in the durable replay", async () => {
  await using h = await textRoom(["First reply.", "Second swipe.", " Continued.", "Later reply."]);
  const { chat } = h.root.services;
  const presence = new AbortController();
  h.root.app.presence.connect(h.owner.userId, presence.signal);
  try {
    const opener = await commit(h, "before the turn");
    const turn = await chat.send({ principal: h.owner, chatId: h.chatId, content: "the turn" });
    const reply = turn.messages.find(({ role }) => role === "assistant");
    const sent = turn.messages.find(({ role }) => role === "user");
    if (reply === undefined || sent === undefined) {
      throw new Error("the real turn committed no user row and reply");
    }
    const expected = inOrder([opener, sent, reply]);
    const page = async (): Promise<readonly PositionedRow[]> => rows((await chat.listMessages({ principal: h.owner, chatId: h.chatId })).messages);
    expect(await page()).toEqual(expected);
    await chat.swipe({ principal: h.owner, chatId: h.chatId, messageId: reply.id });
    expect(await page()).toEqual(expected);
    await chat.continueTurn({ principal: h.owner, chatId: h.chatId, messageId: reply.id });
    expect(await page()).toEqual(expected);
    await chat.undoContinue({ principal: h.owner, chatId: h.chatId, messageId: reply.id });
    expect(await page()).toEqual(expected);
    await chat.revertContinue({ principal: h.owner, chatId: h.chatId, messageId: reply.id });
    expect(await page()).toEqual(expected);

    const replay = replayed(await chat.replayChatEvents({ principal: h.owner, chatId: h.chatId }));
    expect(replay.filter(({ id }) => id === reply.id).length).toBeGreaterThan(1);
    expect(new Set(replay.filter(({ id }) => id === reply.id).map(({ position }) => position))).toEqual(new Set([3]));
  } finally {
    presence.abort();
  }
});

test("moveMessage renumbers the row and its neighbours, and a replayed older view reads the row's current place", async () => {
  await using h = await textRoom([]);
  const { chat } = h.root.services;
  const [a, b, c] = [await commit(h, "a"), await commit(h, "b"), await commit(h, "c")];
  await chat.moveMessage({ principal: h.owner, chatId: h.chatId, messageId: c.id, toSeq: a.seq });
  expect(rows((await chat.listMessages({ principal: h.owner, chatId: h.chatId })).messages)).toEqual(inOrder([c, a, b]));
  expect(replayed(await chat.replayChatEvents({ principal: h.owner, chatId: h.chatId }))).toContainEqual({ id: c.id, position: 1 });
});

test("a floored member counts from their floor on every read, and no read reveals the rows under it", async () => {
  await using h = await textRoom([]);
  const { chat } = h.root.services;
  const { secondUserId } = await seedCorpusActors(h.root);
  const member = await h.root.principalFor(secondUserId);
  const [withheldA, withheldB] = [await commit(h, "withheld a"), await commit(h, "withheld b")];
  const boundary = await commit(h, "join boundary");
  const invite = await chat.createInvite({ principal: h.owner, chatId: h.chatId, input: { invitedHandle: member.handle } });
  await chat.acceptInvite({ principal: member, inviteId: invite.invite.id });
  await chat.setMemberHistoryVisibility({ principal: h.owner, chatId: h.chatId, userId: member.userId, visibility: "from-join" });
  const [later, last] = [await commit(h, "later"), await commit(h, "last")];

  const visible = inOrder([boundary, later, last]);
  const memberPage = await chat.listMessages({ principal: member, chatId: h.chatId });
  expect(rows(memberPage.messages)).toEqual(visible);
  expect(rows((await chat.listMessages({ principal: h.owner, chatId: h.chatId })).messages)).toEqual(inOrder([withheldA, withheldB, boundary, later, last]));
  const window = await chat.getMessageWindow({ principal: member, chatId: h.chatId, target: { kind: "message", messageId: later.id } });
  expect(rows(window.messages)).toEqual(visible);

  // The live fan-out's per-yield probe: one row, resolved at this subscriber's floor.
  const probe = async (who: typeof member, id: MessageView["id"]): Promise<number | undefined> =>
    (await chat.chatEventBounds({ principal: who, chatId: h.chatId, positionOf: id })).messagePosition;
  expect(await probe(member, later.id)).toBe(2);
  expect(await probe(h.owner, later.id)).toBe(4);
  expect(await probe(member, withheldA.id)).toBeUndefined();

  const replay = replayed(await chat.replayChatEvents({ principal: member, chatId: h.chatId }));
  expect(replay.map(({ id }) => id)).not.toContain(withheldA.id);
  expect(replay.filter(({ id }) => id === later.id || id === last.id)).toEqual(visible.slice(1));

  // A delete under the floor moves the host's numbers and leaves the member's: nothing below the floor is observable.
  await chat.deleteMessages({ principal: h.owner, chatId: h.chatId, messageIds: [withheldA.id] });
  expect(rows((await chat.listMessages({ principal: member, chatId: h.chatId })).messages)).toEqual(visible);
  expect(rows((await chat.listMessages({ principal: h.owner, chatId: h.chatId })).messages)).toEqual(inOrder([withheldB, boundary, later, last]));
});

test("a floored fork numbers its own canon from one", async () => {
  await using h = await textRoom([]);
  const { chat } = h.root.services;
  const { secondUserId } = await seedCorpusActors(h.root);
  const member = await h.root.principalFor(secondUserId);
  await commit(h, "withheld");
  await commit(h, "join boundary");
  const invite = await chat.createInvite({ principal: h.owner, chatId: h.chatId, input: { invitedHandle: member.handle } });
  await chat.acceptInvite({ principal: member, inviteId: invite.invite.id });
  await chat.setMemberHistoryVisibility({ principal: h.owner, chatId: h.chatId, userId: member.userId, visibility: "from-join" });
  await commit(h, "after the join");
  await chat.selfLeave({ principal: h.owner, chatId: h.chatId });

  const fork = await chat.forkChat({ principal: member, chatId: h.chatId });
  const copied = await chat.listMessages({ principal: member, chatId: fork.chat.id });
  expect(copied.messages.map(({ content }) => content)).toEqual(["join boundary", "after the join"]);
  expect(copied.messages.map(({ position }) => position)).toEqual([1, 2]);
});

test("an imported room numbers its rows from one", async () => {
  await using h = await textRoom([], {
    transcript: [
      { role: "user", content: "imported one" },
      { role: "assistant", content: "imported two" },
      { role: "user", content: "imported three" },
    ],
  });
  const { messages } = await h.root.services.chat.listMessages({ principal: h.owner, chatId: h.chatId });
  expect(messages.map(({ position }) => position)).toEqual([1, 2, 3]);
});
