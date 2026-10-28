// Native directional cursors preserve member-gated pagination and its viewer floor.
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import { CORPUS_EMBED_MODEL, CORPUS_EMBEDDING_VECTOR, createCorpusHarness, createCorpusProviderExecution } from "@orb/testkit/node/composed";

test("message cursors page backward, retain the null tail and refuse a foreign room", async () => {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: new Map(),
    images: [],
  });
  await using root = await createCorpusHarness(undefined, { providerFetch: provider.execute });
  await (await root.internalCallerFor(root.ownerId)).settings.updateAppSettings({ partial: { localMultiUser: true } });
  const caller = await root.internalCallerFor(root.ownerId);
  const strangerId = (await root.actor()).id;
  const stranger = await root.internalCallerFor(strangerId);
  const { chat } = await caller.chat.startChat({ characterIds: [], opening: "none" });
  for (let index = 0; index < 4; index++) {
    await caller.chat.commitMessage({ chatId: chat.id, content: `Cursor witness ${index + 1}`, timeZone: UTC_TIME_ZONE });
  }
  const scope = { chatId: chat.id, limit: 2 };
  const tail = await caller.chat.listMessages(scope);
  expect(tail.messages.map((message) => message.seq)).toEqual([3, 4]);
  expect(await caller.chat.listMessages({ ...scope, cursor: null })).toEqual(tail);
  const first = tail.messages[0];
  if (first === undefined) {
    throw new Error("The persisted tail is empty");
  }
  expect((await caller.chat.listMessages({ ...scope, cursor: { kind: "before", seq: first.seq } })).messages.map((message) => message.seq)).toEqual([1, 2]);
  const older = await caller.chat.listMessages({ ...scope, cursor: { kind: "before", seq: first.seq } });
  expect(older.previousCursor).toBeNull();
  expect(older.nextCursor).toEqual({ kind: "after", seq: 2 });
  expect(tail.previousCursor).toEqual({ kind: "before", seq: 3 });
  expect(tail.nextCursor).toBeNull();
  expect(await caller.chat.listMessages({ ...scope, cursor: older.nextCursor })).toEqual(tail);
  expect((await caller.chat.listMessages({ ...scope, cursor: { kind: "before", seq: 1 } })).messages).toEqual([]);
  await expect(stranger.chat.listMessages({ ...scope, cursor: { kind: "before", seq: first.seq } })).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await caller.chat.listMessages(scope)).toEqual(tail);
  const invite = await caller.invites.createInvite({ chatId: chat.id, input: { maxUses: 1 } });
  await stranger.invites.redeemInvite({ token: invite.token });
  await caller.invites.setMemberHistoryVisibility({ chatId: chat.id, userId: strangerId, visibility: "from-join" });
  await caller.chat.commitMessage({ chatId: chat.id, content: "After the member joined", timeZone: UTC_TIME_ZONE });
  const member = await stranger.chat.listMessages({ chatId: chat.id });
  expect(member.messages.map((message) => message.seq)).toEqual([4, 5]);
  expect(member.previousCursor).toBeNull();
  const underFloor = await stranger.chat.listMessages({ ...scope, cursor: { kind: "before", seq: 4 } });
  expect(underFloor.messages).toEqual([]);
  expect(underFloor.previousCursor).toBeNull();
  expect((await stranger.chat.listMessages({ ...scope, cursor: { kind: "after", seq: 0 } })).messages.map((message) => message.seq)).toEqual([4, 5]);
  const afterJoin = await stranger.chat.listMessages({ ...scope, cursor: { kind: "after", seq: 4 } });
  expect(afterJoin.messages.map((message) => message.seq)).toEqual([5]);
  expect(afterJoin.previousCursor).toEqual({ kind: "before", seq: 5 });
  expect((await stranger.chat.listMessages({ ...scope, cursor: afterJoin.previousCursor })).messages.map((message) => message.seq)).toEqual([4]);
  expect((await caller.chat.listMessages({ chatId: chat.id })).messages.map((message) => message.seq)).toEqual([1, 2, 3, 4, 5]);
});
