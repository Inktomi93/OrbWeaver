// @subject packages/server/src/domain/chat/verbs/turn.ts
// Accepted slots close across real context-read faults and a foreign physical lease, without replacing turn policy.
import "@orb/testkit/node/composed-real.ts";
import type { ChatBusEvent, MessageView, TurnOutcome } from "@orb/contracts/chat";
import { SHIPPED_PROMPT_CACHE } from "@orb/contracts/inference";
import type { LibSqlWrap } from "@orb/db";
import { chatLocks, closeDb } from "@orb/db";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { ChatRoot } from "@orb/testkit/node/chat/composed.ts";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { textRoom } from "../scenario-physical.ts";

function presetReadFault(): { readonly wrap: LibSqlWrap; readonly arm: () => void; readonly failures: () => readonly string[] } {
  let armed = false;
  const failures: string[] = [];
  const wrap: LibSqlWrap = (client) => {
    const execute = client.execute.bind(client);
    client.execute = async (statement: Parameters<typeof client.migrate>[0][number], args?: Parameters<typeof execute>[1]): ReturnType<typeof execute> => {
      const text = typeof statement === "string" ? statement : statement.sql;
      if (armed && text.includes('from "presets"')) {
        armed = false;
        failures.push(text);
        throw new Error("physical preset read unavailable");
      }
      return typeof statement === "string" ? await execute(statement, args) : await execute(statement);
    };
    return client;
  };
  return {
    wrap,
    arm: (): void => {
      armed = true;
    },
    failures: () => failures,
  };
}

interface SlotRoom extends AsyncDisposable {
  readonly h: ChatRoot;
  readonly reply: MessageView;
  readonly events: ChatBusEvent[];
  readonly fault: ReturnType<typeof presetReadFault>;
}

async function room(): Promise<SlotRoom> {
  await using construction = new AsyncDisposableStack();
  const fault = presetReadFault();
  const db = await freshDb(fault.wrap);
  construction.defer(() => closeDb(db));
  const h = construction.use(
    await textRoom(["first", "second"], { server: { db }, group: { output: "per-speaker", policy: "list", allowSelfResponses: true } }),
  );
  const bindings = await h.root.services.connection.listBindings({ principal: h.owner });
  const connectionId = bindings.find(({ task }) => task === "chat")?.binding?.connectionId;
  if (connectionId === undefined || connectionId === null) {
    throw new Error("the physical room has no chat connection");
  }
  await h.root.services.connection.update({ principal: h.owner, connectionId, patch: { promptCache: { ...SHIPPED_PROMPT_CACHE, enabled: false } } });
  const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "hello" });
  const reply = outcome.messages.find(({ role }) => role === "assistant");
  if (reply === undefined || reply.characterId === null) {
    throw new Error("the actual send produced no named assistant");
  }
  await h.root.settleBackground();
  const events: ChatBusEvent[] = [];
  construction.defer(h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => events.push(event)));
  const lifetime = construction.move();
  return { h, reply, events, fault, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

async function holdLock(h: ChatRoot): Promise<void> {
  const now = h.root.clock.now();
  await h.root.db.insert(chatLocks).values({ chatId: h.chatId, holder: "other-replica", acquiredAt: now, expiresAt: now + 60_000 });
}

const VERBS = ["swipe", "continueTurn", "generate", "forceCharacterTurn"] as const;
type Verb = (typeof VERBS)[number];
const INVOKE: Record<Verb, (f: SlotRoom) => Promise<TurnOutcome>> = {
  swipe: async ({ h, reply }) => await h.root.services.chat.swipe({ principal: h.owner, chatId: h.chatId, messageId: reply.id }),
  continueTurn: async ({ h, reply }) => await h.root.services.chat.continueTurn({ principal: h.owner, chatId: h.chatId, messageId: reply.id }),
  generate: async ({ h }) => await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId }),
  forceCharacterTurn: async ({ h, reply }) => {
    if (reply.characterId === null) {
      throw new Error("a forced public turn requires the seeded speaker");
    }
    return await h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: reply.characterId });
  },
};
const MISSING: Omit<typeof INVOKE, "generate"> = {
  swipe: async ({ h }: SlotRoom) => await h.root.services.chat.swipe({ principal: h.owner, chatId: h.chatId, messageId: mintTypeId(ID_PREFIX.message) }),
  continueTurn: async ({ h }: SlotRoom) =>
    await h.root.services.chat.continueTurn({ principal: h.owner, chatId: h.chatId, messageId: mintTypeId(ID_PREFIX.message) }),
  forceCharacterTurn: async ({ h }: SlotRoom) =>
    await h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: mintTypeId(ID_PREFIX.character) }),
};
const ACCEPTED: Record<Verb, (f: SlotRoom) => Extract<ChatBusEvent, { type: "turnAccepted" }>> = {
  swipe: ({ h, reply }) => ({ type: "turnAccepted", chatId: h.chatId, intent: "swipe", targetMessageId: reply.id, speakerCharacterId: reply.characterId }),
  continueTurn: ({ h, reply }) => ({
    type: "turnAccepted",
    chatId: h.chatId,
    intent: "continue",
    targetMessageId: reply.id,
    speakerCharacterId: reply.characterId,
  }),
  generate: ({ h }) => ({ type: "turnAccepted", chatId: h.chatId, intent: "generate", targetMessageId: null, speakerCharacterId: null }),
  forceCharacterTurn: ({ h, reply }) => ({
    type: "turnAccepted",
    chatId: h.chatId,
    intent: "generate",
    targetMessageId: null,
    speakerCharacterId: reply.characterId,
  }),
};

test("swipe: HAPPY: accepts with the REAL targetMessageId + the slot's speaker, before turnStarted", async () => {
  const verb = "swipe";
  await using f = await room();
  await INVOKE[verb](f);
  expect(f.events.map(({ type }) => type)).toEqual(["turnAccepted", "turnStarted", "delta", "messageCommitted", "turnCompleted"]);
  expect(f.events[0]).toMatchObject(ACCEPTED[verb](f));
});

test("swipe: NOT_FOUND target: no slot is opened at all (the load is ordered BEFORE the accept)", async () => {
  const verb = "swipe";
  await using f = await room();
  await expect(MISSING[verb](f)).rejects.toThrow();
  expect(f.events).toEqual([]);
});

test("swipe: resolveTurnBase throws → the accepted slot CLOSES with turnAborted", async () => {
  const verb = "swipe";
  await using f = await room();
  f.fault.arm();
  await expect(INVOKE[verb](f)).rejects.toThrow();
  expect(f.fault.failures()).toHaveLength(1);
  expect(f.fault.failures()[0]).toMatch(/from "presets"/u);
  expect(f.events.map(({ type }) => type)).toEqual(["turnAccepted", "turnAborted"]);
  expect(f.events[0]).toMatchObject(ACCEPTED[verb](f));
  expect(f.events[1]).toMatchObject({ intent: ACCEPTED[verb](f).intent, reason: "error", automationDepth: 0 });
});

test("swipe: LOCK CONTENTION (a turn already in flight) → the accepted slot CLOSES with turnAborted", async () => {
  const verb = "swipe";
  await using f = await room();
  await holdLock(f.h);
  await expect(INVOKE[verb](f)).rejects.toMatchObject({ code: "locked" });
  expect(f.events.map(({ type }) => type)).toEqual(["turnAccepted", "turnAborted"]);
  expect(f.events[1]).toMatchObject({ reason: "error" });
});

test("continueTurn: HAPPY: accepts with the REAL targetMessageId before turnStarted", async () => {
  const verb = "continueTurn";
  await using f = await room();
  await INVOKE[verb](f);
  expect(f.events.map(({ type }) => type)).toEqual(["turnAccepted", "turnStarted", "delta", "messageCommitted", "turnCompleted"]);
  expect(f.events[0]).toMatchObject(ACCEPTED[verb](f));
});

test("continueTurn: NOT_FOUND target: no slot is opened at all", async () => {
  const verb = "continueTurn";
  await using f = await room();
  await expect(MISSING[verb](f)).rejects.toThrow();
  expect(f.events).toEqual([]);
});

test("continueTurn: resolveTurnBase throws → the accepted slot CLOSES with turnAborted", async () => {
  const verb = "continueTurn";
  await using f = await room();
  f.fault.arm();
  await expect(INVOKE[verb](f)).rejects.toThrow();
  expect(f.fault.failures()).toHaveLength(1);
  expect(f.fault.failures()[0]).toMatch(/from "presets"/u);
  expect(f.events.map(({ type }) => type)).toEqual(["turnAccepted", "turnAborted"]);
  expect(f.events[0]).toMatchObject(ACCEPTED[verb](f));
  expect(f.events[1]).toMatchObject({ intent: ACCEPTED[verb](f).intent, reason: "error", automationDepth: 0 });
});

test("continueTurn: LOCK CONTENTION → the accepted slot CLOSES with turnAborted", async () => {
  const verb = "continueTurn";
  await using f = await room();
  await holdLock(f.h);
  await expect(INVOKE[verb](f)).rejects.toMatchObject({ code: "locked" });
  expect(f.events.map(({ type }) => type)).toEqual(["turnAccepted", "turnAborted"]);
  expect(f.events[1]).toMatchObject({ reason: "error" });
});

test("generate: HAPPY: accepts a FRESH slot (no ghost target, no speaker yet) before turnStarted", async () => {
  const verb = "generate";
  await using f = await room();
  await INVOKE[verb](f);
  expect(f.events.map(({ type }) => type)).toEqual(["turnAccepted", "turnStarted", "delta", "messageCommitted", "turnCompleted"]);
  expect(f.events[0]).toMatchObject(ACCEPTED[verb](f));
});

test("generate: unknown speaker (post-accept NOT_FOUND) → the accepted slot CLOSES with turnAborted", async () => {
  await using f = await room();
  await expect(
    f.h.root.services.chat.generate({ principal: f.h.owner, chatId: f.h.chatId, speakerCharacterId: mintTypeId(ID_PREFIX.character) }),
  ).rejects.toThrow();
  expect(f.events.map(({ type }) => type)).toEqual(["turnAccepted", "turnAborted"]);
  expect(f.events[1]).toMatchObject({ intent: "generate", reason: "error" });
});

test("generate: resolveTurnBase throws → the accepted slot CLOSES with turnAborted", async () => {
  const verb = "generate";
  await using f = await room();
  f.fault.arm();
  await expect(INVOKE[verb](f)).rejects.toThrow();
  expect(f.fault.failures()).toHaveLength(1);
  expect(f.fault.failures()[0]).toMatch(/from "presets"/u);
  expect(f.events.map(({ type }) => type)).toEqual(["turnAccepted", "turnAborted"]);
  expect(f.events[0]).toMatchObject(ACCEPTED[verb](f));
  expect(f.events[1]).toMatchObject({ intent: ACCEPTED[verb](f).intent, reason: "error", automationDepth: 0 });
});

test("forceCharacterTurn: HAPPY: accepts with the FORCED speaker and no ghost target, before turnStarted", async () => {
  const verb = "forceCharacterTurn";
  await using f = await room();
  await INVOKE[verb](f);
  expect(f.events.map(({ type }) => type)).toEqual(["turnAccepted", "turnStarted", "delta", "messageCommitted", "turnCompleted"]);
  expect(f.events[0]).toMatchObject(ACCEPTED[verb](f));
});

test("forceCharacterTurn: NOT_FOUND target (a character with no present seat): no slot is opened at all", async () => {
  const verb = "forceCharacterTurn";
  await using f = await room();
  await expect(MISSING[verb](f)).rejects.toThrow();
  expect(f.events).toEqual([]);
});

test("forceCharacterTurn: the context build throws → the accepted slot CLOSES with turnAborted", async () => {
  const verb = "forceCharacterTurn";
  await using f = await room();
  f.fault.arm();
  await expect(INVOKE[verb](f)).rejects.toThrow();
  expect(f.fault.failures()).toHaveLength(1);
  expect(f.fault.failures()[0]).toMatch(/from "presets"/u);
  expect(f.events.map(({ type }) => type)).toEqual(["turnAccepted", "turnAborted"]);
  expect(f.events[0]).toMatchObject(ACCEPTED[verb](f));
  expect(f.events[1]).toMatchObject({ intent: ACCEPTED[verb](f).intent, reason: "error", automationDepth: 0 });
});

test("forceCharacterTurn: LOCK CONTENTION → the accepted slot CLOSES with turnAborted (driveRound SWALLOWS the refusal)", async () => {
  await using f = await room();
  await holdLock(f.h);
  const outcome = await INVOKE.forceCharacterTurn(f);
  expect(outcome.messages).toEqual([]);
  expect(f.events.map(({ type }) => type)).toEqual(["turnAccepted", "turnAborted"]);
  expect(f.events[1]).toMatchObject({ reason: "error" });
});

test("send: a send refused on the LOCK closes its own accepted slot — driveRound SWALLOWS that refusal", async () => {
  await using h = await textRoom(["never runs"], { group: { output: "per-speaker", policy: "list" } });
  await holdLock(h);
  const events: ChatBusEvent[] = [];
  const unsubscribe = h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => events.push(event));
  try {
    const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "hello" });
    expect(outcome.messages.map(({ role }) => role)).toEqual(["user"]);
    expect(events.map(({ type }) => type)).toEqual(["messageCommitted", "turnAccepted", "turnAborted"]);
    expect(events.at(-1)).toMatchObject({ intent: "send", reason: "error", automationDepth: 0 });
  } finally {
    unsubscribe();
  }
});
