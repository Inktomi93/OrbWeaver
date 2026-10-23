// @subject packages/server/src/domain/chat/bus.ts
// The production live channel preserves exact lifecycle order and the durable log preserves canon events.
import { createCharacterSchema } from "@orb/contracts/character";
import type { ChatBusEvent, TurnOutcome } from "@orb/contracts/chat";
import { SHIPPED_PROMPT_CACHE } from "@orb/contracts/inference";
import { chatEvents } from "@orb/db";
import type { ChatRoot } from "@orb/testkit/node/chat/composed.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";
import { textRoom } from "./scenario-physical.ts";

async function setCachePosture(h: ChatRoot, enabled: boolean): Promise<void> {
  const bindings = await h.root.services.connection.listBindings({ principal: h.owner });
  const connectionId = bindings.find(({ task }) => task === "chat")?.binding?.connectionId;
  if (connectionId === undefined || connectionId === null) {
    throw new Error("the real chat root has no saved chat connection");
  }
  await h.root.services.connection.update({ principal: h.owner, connectionId, patch: { promptCache: { ...SHIPPED_PROMPT_CACHE, enabled } } });
}

test("send publishes user commit then accepted, started, delta, assistant commit and completion in order", async () => {
  await using h = await textRoom(["Hi there"], { group: { policy: "list", output: "per-speaker" } });
  // This sequence is the non-cache baseline; requesting unsupported cache controls correctly adds a warning.
  await setCachePosture(h, false);
  const events: ChatBusEvent[] = [];
  const unsubscribe = h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
    if (event.chatId === h.chatId) {
      events.push(event);
    }
  });
  try {
    await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "hello" });
    await h.root.settleBackground();
    expect(
      events.map(({ type }) => type),
      JSON.stringify(events.filter(({ type }) => type === "warning")),
    ).toEqual(["messageCommitted", "turnAccepted", "turnStarted", "delta", "messageCommitted", "turnCompleted"]);
    expect(events[1]).toMatchObject({ type: "turnAccepted", intent: "send", speakerCharacterId: null, targetMessageId: null });
    expect(events[2]).toMatchObject({ type: "turnStarted", intent: "send", targetMessageId: null });
    expect(events.filter(({ type }) => type === "messageCommitted")).toMatchObject([
      { view: { role: "user", content: "hello" } },
      { view: { role: "assistant", content: "Hi there" } },
    ]);
    expect(events.at(-1)).toMatchObject({ type: "turnCompleted", intent: "send" });
    const durable = await h.root.db.select().from(chatEvents).where(eq(chatEvents.chatId, h.chatId)).orderBy(chatEvents.seq);
    expect(durable.filter(({ type }) => type === "messageCommitted").map(({ payload }) => payload)).toEqual(
      events.filter(({ type }) => type === "messageCommitted"),
    );
  } finally {
    unsubscribe();
  }
});

test("requesting unsupported prefix caching publishes its actual adjustment between delta and commit", async () => {
  await using h = await textRoom(["Hi there"], { group: { policy: "list", output: "per-speaker" } });
  await setCachePosture(h, true);
  const events: ChatBusEvent[] = [];
  const unsubscribe = h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
    if (event.chatId === h.chatId) {
      events.push(event);
    }
  });
  try {
    await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "hello" });
    await h.root.settleBackground();
    expect(events.map(({ type }) => type)).toEqual([
      "messageCommitted",
      "turnAccepted",
      "turnStarted",
      "delta",
      "warning",
      "messageCommitted",
      "turnCompleted",
    ]);
    expect(events.filter(({ type }) => type === "warning")).toEqual([
      { type: "warning", chatId: h.chatId, adjustment: "cache_control_adjusted", code: "settings_adjusted" },
    ]);
  } finally {
    unsubscribe();
  }
});

async function goldenRoom(replies: readonly string[], options: Parameters<typeof textRoom>[1] = {}): Promise<ChatRoot> {
  await using construction = new AsyncDisposableStack();
  const h = construction.use(await textRoom(replies, { group: { output: "per-speaker", policy: "list" }, ...options }));
  await setCachePosture(h, false);
  const lifetime = construction.move();
  return { ...h, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

function messageOf(outcome: TurnOutcome, role: TurnOutcome["messages"][number]["role"]): TurnOutcome["messages"][number] {
  const message = outcome.messages.find((row) => row.role === role);
  if (message === undefined) {
    throw new Error("the actual turn has no requested role to target");
  }
  return message;
}

async function observeOperation<T>(h: ChatRoot, work: () => Promise<T>): Promise<{ readonly events: ChatBusEvent[]; readonly result: T }> {
  const events: ChatBusEvent[] = [];
  const unsubscribe = h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => events.push(event));
  try {
    const result = await work();
    await h.root.settleBackground();
    return { events, result };
  } finally {
    unsubscribe();
  }
}
test("swipe: turnAccepted(targetMessageId set) → turnStarted → delta → messageCommitted(assistant) → turnCompleted", async () => {
  await using h = await goldenRoom(["first", "second swipe"]);
  const reply = messageOf(await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "hello" }), "assistant");
  const { events } = await observeOperation(h, async () => await h.root.services.chat.swipe({ principal: h.owner, chatId: h.chatId, messageId: reply.id }));
  expect(events.map(({ type }) => type)).toEqual(["turnAccepted", "turnStarted", "delta", "messageCommitted", "turnCompleted"]);
  expect(events[0]).toMatchObject({ type: "turnAccepted", intent: "swipe", targetMessageId: reply.id });
  expect(events[1]).toMatchObject({ type: "turnStarted", intent: "swipe", targetMessageId: reply.id });
});

test("auto-mode chain: each chained iteration re-opens the slot — … turnCompleted → turnAccepted → turnStarted …", async () => {
  await using h = await goldenRoom(["one", "two", "three"], {
    characters: ["aria", "bryn"].map((name) => createCharacterSchema.parse({ handle: name, name, description: `${name} replies in roster order.` })),
    group: { output: "per-speaker", policy: "list", autoMode: true, autoModeMaxTurns: 1, autoModeDelayMs: 0 },
  });
  const { events } = await observeOperation(h, async () => await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "go" }));
  const types = events.map(({ type }) => type);
  expect(types).toEqual([
    "messageCommitted",
    "turnAccepted",
    "turnStarted",
    "delta",
    "messageCommitted",
    "turnCompleted",
    "turnStarted",
    "delta",
    "messageCommitted",
    "turnCompleted",
    "turnAccepted",
    "turnStarted",
    "delta",
    "messageCommitted",
    "turnCompleted",
  ]);
  const chained = types.lastIndexOf("turnAccepted");
  expect(types[chained - 1]).toBe("turnCompleted");
  expect(types[chained + 1]).toBe("turnStarted");
  const accepts = events.filter(({ type }) => type === "turnAccepted");
  for (const accepted of accepts) {
    expect(accepted).toMatchObject({ speakerCharacterId: null, targetMessageId: null });
  }
  expect(accepts.at(-1)).toMatchObject({ intent: "generate" });
});

test("continue: turnAccepted(intent continue, target set) → turnStarted → delta → messageCommitted → turnCompleted", async () => {
  await using h = await goldenRoom(["start", " more"]);
  const reply = messageOf(await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "hello" }), "assistant");
  const { events } = await observeOperation(
    h,
    async () => await h.root.services.chat.continueTurn({ principal: h.owner, chatId: h.chatId, messageId: reply.id }),
  );
  expect(events.map(({ type }) => type)).toEqual(["turnAccepted", "turnStarted", "delta", "messageCommitted", "turnCompleted"]);
  expect(events[0]).toMatchObject({ type: "turnAccepted", intent: "continue", targetMessageId: reply.id });
  expect(events[1]).toMatchObject({ type: "turnStarted", intent: "continue", targetMessageId: reply.id });
});

test("editMessage → exactly [messageEdited] with the fresh view", async () => {
  await using h = await goldenRoom(["Hi there"]);
  const user = messageOf(await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "hello" }), "user");
  const { events } = await observeOperation(
    h,
    async () => await h.root.services.chat.editMessage({ principal: h.owner, chatId: h.chatId, messageId: user.id, content: "hello (edited)" }),
  );
  expect(events.map(({ type }) => type)).toEqual(["messageEdited"]);
  expect(events[0]).toMatchObject({ messageId: user.id, view: { content: "hello (edited)" } });
});

test("deleteMessages → exactly [messagesDeleted] carrying the deleted id set", async () => {
  await using h = await goldenRoom(["Hi there"]);
  const user = messageOf(await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "hello" }), "user");
  const { events } = await observeOperation(
    h,
    async () => await h.root.services.chat.deleteMessages({ principal: h.owner, chatId: h.chatId, messageIds: [user.id] }),
  );
  expect(events.map(({ type }) => type)).toEqual(["messagesDeleted"]);
  expect(events[0]).toMatchObject({ messageIds: [user.id] });
});

test("moveMessage → exactly [messagesReordered]", async () => {
  await using h = await goldenRoom(["a", "b"]);
  const user = messageOf(await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "first" }), "user");
  await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "second" });
  const { events } = await observeOperation(
    h,
    async () => await h.root.services.chat.moveMessage({ principal: h.owner, chatId: h.chatId, messageId: user.id, toSeq: user.seq + 2 }),
  );
  expect(events.map(({ type }) => type)).toEqual(["messagesReordered"]);
});

test("forkChat → the new room's chatCreated leads the sequence", async () => {
  await using h = await goldenRoom(["Hi there"]);
  await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "hello" });
  const { events, result } = await observeOperation(h, async () => await h.root.services.chat.forkChat({ principal: h.owner, chatId: h.chatId }));
  expect(events[0]).toMatchObject({ type: "chatCreated", chatId: result.chat.id });
});
