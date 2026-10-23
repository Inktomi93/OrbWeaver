// @subject packages/server/src/domain/chat/verbs/turn.ts
// Public writers meet real SQLite competitors; no fabricated constraint or domain persistence result.
import { createCharacterSchema } from "@orb/contracts/character";
import type { ChatBusEvent } from "@orb/contracts/chat";
import { SHIPPED_PROMPT_CACHE } from "@orb/contracts/inference";
import { createPersonaSchema } from "@orb/contracts/persona";
import { createRegexScriptSchema } from "@orb/contracts/regex";
import { chatLocks, closeDb, messages, messageVariants, statsCanonVersions } from "@orb/db";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { createFrozenClock } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { freshHeldDb } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";
import { textRoom } from "../scenario-physical.ts";
import { withCancellationPeer } from "./turn-cancellation-physical.ts";

test("a real competing user commit wins the held seq and send retries without losing either writer", async () => {
  await using construction = new AsyncDisposableStack();
  const held = await freshHeldDb();
  construction.defer(() => closeDb(held.db));
  const h = construction.use(await textRoom(["Hi there"], { server: { db: held.db } }));
  const gate = held.hold(/insert into "messages"/u);
  const sending = h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "hello" });
  const settlement = Promise.allSettled([sending]);
  try {
    await gate.reached;
    gate.disarm();
    const racer = await h.root.services.chat.commitMessage({ principal: h.owner, chatId: h.chatId, content: "racer" });
    expect(racer.messages[0]).toMatchObject({ seq: 1, role: "user", content: "racer", authorUserId: h.owner.userId });
    gate.release();
    const outcome = await sending;
    expect(outcome.aborted).toBe(false);
    expect(outcome.messages[0]).toMatchObject({ seq: 2, role: "user", content: "hello", authorUserId: h.owner.userId });
    const canon = await h.root.db
      .select({ slot: messages, variant: messageVariants })
      .from(messages)
      .innerJoin(messageVariants, eq(messages.selectedVariantId, messageVariants.id))
      .where(eq(messages.chatId, h.chatId))
      .orderBy(messages.seq);
    expect(canon.map(({ slot }) => slot.seq)).toEqual([1, 2, 3]);
    expect(canon.map(({ slot }) => slot.role)).toEqual(["user", "user", "assistant"]);
    expect(canon.map(({ variant }) => variant.content)).toEqual(["racer", "hello", "Hi there"]);
    expect(h.requests.filter((request) => new URL(request.url).pathname.endsWith("/chat/completions"))).toHaveLength(1);
  } finally {
    gate.release();
    await settlement;
  }
});

test("commitMessage persists exactly the owned user row and publishes its commit without provider or turn lifecycle work", async () => {
  await using h = await textRoom([]);
  const events: ChatBusEvent[] = [];
  const unsubscribe = h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => events.push(event));
  try {
    const outcome = await h.root.services.chat.commitMessage({ principal: h.owner, chatId: h.chatId, content: "hello" });
    expect(outcome.aborted).toBe(false);
    expect(outcome.messages).toHaveLength(1);
    expect(outcome.messages[0]).toMatchObject({ role: "user", content: "hello", authorUserId: h.owner.userId, seq: 1 });
    const canon = await h.root.db
      .select({ slot: messages, variant: messageVariants })
      .from(messages)
      .innerJoin(messageVariants, eq(messages.selectedVariantId, messageVariants.id))
      .where(eq(messages.chatId, h.chatId));
    expect(canon.map(({ slot, variant }) => ({ role: slot.role, author: slot.authorUserId, content: variant.content }))).toEqual([
      { role: "user", author: h.owner.userId, content: "hello" },
    ]);
    expect(events.map(({ type }) => type)).toEqual(["messageCommitted"]);
    expect(h.requests.filter((request) => new URL(request.url).pathname.endsWith("/chat/completions"))).toEqual([]);
  } finally {
    unsubscribe();
  }
});

test("a solo send returns the owned user and primary character reply with durable order and lifecycle", async () => {
  await using h = await textRoom(["Hi there"]);
  const character = h.characters[0];
  if (character === undefined) {
    throw new Error("the solo room created no primary character");
  }
  const connectionId = (await h.root.services.connection.listBindings({ principal: h.owner })).find(({ task }) => task === "chat")?.binding?.connectionId;
  if (connectionId === undefined || connectionId === null) {
    throw new Error("the solo room has no saved chat connection");
  }
  // This lifecycle baseline requests no unsupported caching; the warning remains covered by its actual bus control.
  await h.root.services.connection.update({ principal: h.owner, connectionId, patch: { promptCache: { ...SHIPPED_PROMPT_CACHE, enabled: false } } });
  const events: ChatBusEvent[] = [];
  const unsubscribe = h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => events.push(event));
  try {
    const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "hello" });
    expect(outcome.aborted).toBe(false);
    expect(outcome.messages).toHaveLength(2);
    expect(outcome.messages[0]).toMatchObject({ role: "user", content: "hello", authorUserId: h.owner.userId, seq: 1 });
    expect(outcome.messages[1]).toMatchObject({ role: "assistant", content: "Hi there", characterId: character.id, seq: 2 });
    const canon = await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq);
    expect(canon.map(({ role, seq }) => ({ role, seq }))).toEqual([
      { role: "user", seq: 1 },
      { role: "assistant", seq: 2 },
    ]);
    expect(canon.map(({ id }) => id)).toEqual(outcome.messages.map(({ id }) => id));
    expect(
      events.map(({ type }) => type),
      JSON.stringify(events.filter(({ type }) => type === "warning")),
    ).toEqual(["messageCommitted", "turnAccepted", "turnStarted", "delta", "messageCommitted", "turnCompleted"]);
  } finally {
    unsubscribe();
  }
});

test("the actual first-user greeting freeze fences one canon-version transition after the user commit", async () => {
  await using construction = new AsyncDisposableStack();
  const held = await freshHeldDb();
  construction.defer(() => closeDb(held.db));
  const h = construction.use(
    await textRoom([], {
      server: { db: held.db },
      characters: [
        createCharacterSchema.parse({ handle: "aria", name: "Aria", description: "A bold knight.", greetings: [{ text: "A {{roll::1d1}} appears" }] }),
      ],
    }),
  );
  const opening = await h.caller.chat.startChat({ characterIds: h.characters.map(({ id }) => id), opening: "first-message" });
  const greeting = opening.opening?.messages[0];
  if (greeting === undefined) {
    throw new Error("the actual character card produced no greeting");
  }
  const gate = held.hold(/update "message_variants" set[\s\S]*"macro_freezes"/u);
  const posting = h.root.services.chat.commitMessage({ principal: h.owner, chatId: opening.chat.id, content: "hello" });
  const settlement = Promise.allSettled([posting]);
  try {
    await gate.reached;
    const atGate = await h.root.db.select().from(statsCanonVersions).where(eq(statsCanonVersions.ownerId, h.owner.userId)).get();
    if (atGate === undefined) {
      throw new Error("the committed user has no canon version");
    }
    expect((await h.root.db.select().from(messages).where(eq(messages.chatId, opening.chat.id)).orderBy(messages.seq)).map(({ role }) => role)).toEqual([
      "assistant",
      "user",
    ]);
    expect((await h.root.db.select().from(messageVariants).where(eq(messageVariants.id, greeting.selectedVariantId)).get())?.content).toBe(
      "A {{roll::1d1}} appears",
    );
    gate.release();
    const outcome = await posting;
    expect(outcome.messages).toHaveLength(1);
    expect(outcome.messages[0]?.content).toBe("hello");
    expect((await h.root.db.select().from(messageVariants).where(eq(messageVariants.id, greeting.selectedVariantId)).get())?.content).toBe("A 1 appears");
    expect((await h.root.db.select().from(statsCanonVersions).where(eq(statsCanonVersions.ownerId, h.owner.userId)).get())?.version).toBe(atGate.version + 1);
    expect(h.requests.filter((request) => new URL(request.url).pathname.endsWith("/chat/completions"))).toEqual([]);
  } finally {
    gate.release();
    await settlement;
  }
});

test("public Stop returns only the already committed user and never an assistant or completed lifecycle", async () => {
  await withCancellationPeer("stream", async (f) => {
    const pending = f.start();
    await f.peer.arrived;
    await expect.poll(() => f.events.some(({ type }) => type === "delta")).toBe(true);
    await f.h.root.services.chat.abort({ principal: f.h.owner, chatId: f.h.chatId });
    await expect.poll(f.peer.stopped).toBe(true);
    const outcome = await pending;
    expect(outcome).toMatchObject({ aborted: true, abortReason: "user" });
    expect(outcome.messages).toHaveLength(1);
    expect(outcome.messages[0]).toMatchObject({ role: "user", content: "hello", authorUserId: f.h.owner.userId });
    const canon = await f.h.root.db.select().from(messages).where(eq(messages.chatId, f.h.chatId)).orderBy(messages.seq);
    expect(canon.map(({ role, id }) => ({ role, id }))).toEqual([{ role: "user", id: outcome.messages[0]?.id }]);
    expect(f.events.map(({ type }) => type)).toContain("turnAborted");
    expect(f.events.map(({ type }) => type)).not.toContain("turnCompleted");
  });
});

test("a null-stamped user freezes its roll while later physical history resolves the current anchor name", async () => {
  await using h = await textRoom(["First answer.", "Second answer."]);
  const zara = await h.caller.persona.create({ input: createPersonaSchema.parse({ name: "Zara", description: "The initial anchor." }) });
  const remy = await h.caller.persona.create({ input: createPersonaSchema.parse({ name: "Remy", description: "The later anchor." }) });
  await h.root.services.chat.setChatAnchorPersona({ principal: h.owner, chatId: h.chatId, personaId: zara.id });
  const first = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "I roll {{roll::1d1}} and {{user}} smiles", personaId: null });
  const user = first.messages[0];
  if (user === undefined) {
    throw new Error("the real send returned no user row");
  }
  expect(user).toMatchObject({ role: "user", personaId: null, content: "I roll 1 and {{user}} smiles" });
  const firstInputs = await Promise.all(
    h.requests.filter((request) => new URL(request.url).pathname.endsWith("/chat/completions")).map((request) => request.clone().text()),
  );
  expect(firstInputs).toHaveLength(1);
  expect(firstInputs[0]).toContain("I roll 1 and Zara smiles");
  await h.root.services.chat.setChatAnchorPersona({ principal: h.owner, chatId: h.chatId, personaId: remy.id });
  expect((await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Look back.", personaId: null })).aborted).toBe(false);
  const inputs = await Promise.all(
    h.requests.filter((request) => new URL(request.url).pathname.endsWith("/chat/completions")).map((request) => request.clone().text()),
  );
  expect(inputs).toHaveLength(2);
  expect(inputs[1]).toContain("I roll 1 and Remy smiles");
  expect(inputs[1]).not.toContain("I roll 1 and Zara smiles");
  const stored = await h.root.db.select().from(messageVariants).where(eq(messageVariants.id, user.selectedVariantId)).get();
  expect(stored?.content).toBe("I roll 1 and {{user}} smiles");
  expect(stored?.macroFreezes).toEqual([{ name: "roll", args: "1d1", value: "1" }]);
});

test("a real send freezes its injected clock and requested zone into stored text", async () => {
  await using h = await textRoom(["The clock is frozen."], { server: { clock: createFrozenClock(Date.UTC(2026, 0, 15, 20, 0)) } });
  const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "the time is {{time}}", timeZone: UTC_TIME_ZONE });
  expect(outcome.messages[0]?.content).toBe("the time is 20:00:00");
  const user = outcome.messages[0];
  if (user === undefined) {
    throw new Error("the clock send returned no user row");
  }
  const stored = await h.root.db.select().from(messageVariants).where(eq(messageVariants.id, user.selectedVariantId)).get();
  expect(stored?.content).toBe("the time is 20:00:00");
  expect(stored?.rawContent).toBe("the time is {{time}}");
  expect(stored?.macroFreezes).toEqual([{ name: "time", value: "20:00:00" }]);
});

test("a foreign real lease makes send yield its round while public generate still commits lock-free", async () => {
  await using h = await textRoom(["The lock-free answer."]);
  await h.root.services.chat.commitMessage({ principal: h.owner, chatId: h.chatId, content: "Claim this room." });
  const lease = { chatId: h.chatId, holder: "physical-competitor", acquiredAt: h.root.clock.now(), expiresAt: h.root.clock.now() + 60_000 };
  await h.root.db.insert(chatLocks).values(lease);
  const locked = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "blocked" });
  expect(locked.messages).toHaveLength(1);
  expect(locked.messages[0]).toMatchObject({ role: "user", content: "blocked", seq: 2 });
  const outcome = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId });
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages).toHaveLength(1);
  expect(outcome.messages[0]).toMatchObject({ role: "assistant", characterId: h.characters[0]?.id, content: "The lock-free answer.", seq: 3 });
  expect(await h.root.db.select().from(chatLocks).where(eq(chatLocks.chatId, h.chatId)).get()).toEqual(lease);
  expect((await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq)).map(({ role }) => role)).toEqual([
    "user",
    "user",
    "assistant",
  ]);
  expect(h.requests.filter((request) => new URL(request.url).pathname.endsWith("/chat/completions"))).toHaveLength(1);
});

test("commitMessage freezes an actual deterministic roll but retains per-view identity text without generation", async () => {
  await using h = await textRoom([]);
  const outcome = await h.root.services.chat.commitMessage({ principal: h.owner, chatId: h.chatId, content: "I roll {{roll::1d1}} and {{user}} smiles" });
  expect(outcome.messages).toHaveLength(1);
  expect(outcome.messages[0]?.content).toBe("I roll 1 and {{user}} smiles");
  const user = outcome.messages[0];
  if (user === undefined) {
    throw new Error("the public commit returned no user row");
  }
  const stored = await h.root.db.select().from(messageVariants).where(eq(messageVariants.messageId, user.id));
  expect(stored).toHaveLength(1);
  expect(stored[0]?.content).toBe("I roll 1 and {{user}} smiles");
  expect(h.requests.filter((request) => new URL(request.url).pathname.endsWith("/chat/completions"))).toEqual([]);
});

test("literal identity text remains byte-identical on both sides of a real send with no volatile freeze record", async () => {
  const rawUser = "just {{user}} talking to {{char}}, no dice";
  const rawReply = "{{char}} answers {{user}} without dice";
  await using h = await textRoom([rawReply]);
  const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: rawUser });
  expect(outcome.messages.map(({ content }) => content)).toEqual([rawUser, rawReply]);
  const canon = await h.root.db
    .select({ slot: messages, variant: messageVariants })
    .from(messages)
    .innerJoin(messageVariants, eq(messages.selectedVariantId, messageVariants.id))
    .where(eq(messages.chatId, h.chatId))
    .orderBy(messages.seq);
  expect(canon.map(({ variant }) => variant.content)).toEqual([rawUser, rawReply]);
  expect(canon.map(({ variant }) => variant.macroFreezes)).toEqual([null, null]);
});

test("public swipe appends and selects one variant without replacing its assistant slot or character", async () => {
  await using h = await textRoom(["First answer.", "Second answer."]);
  const first = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "hi" });
  const assistant = first.messages.find(({ role }) => role === "assistant");
  if (assistant === undefined) {
    throw new Error("the real send committed no assistant");
  }
  const outcome = await h.root.services.chat.swipe({ principal: h.owner, chatId: h.chatId, messageId: assistant.id });
  expect(outcome.messages).toHaveLength(1);
  expect(outcome.messages[0]).toMatchObject({
    id: assistant.id,
    characterId: assistant.characterId,
    role: "assistant",
    content: "Second answer.",
    variantCount: 2,
    selectedVariantIdx: 1,
  });
  const slots = await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq);
  expect(slots.map(({ id }) => id)).toEqual(first.messages.map(({ id }) => id));
  const variants = await h.root.db.select().from(messageVariants).where(eq(messageVariants.messageId, assistant.id)).orderBy(messageVariants.idx);
  expect(variants.map(({ idx, content }) => ({ idx, content }))).toEqual([
    { idx: 0, content: "First answer." },
    { idx: 1, content: "Second answer." },
  ]);
  expect(slots[1]?.selectedVariantId).toBe(variants[1]?.id);
});

test.for([
  { title: "an actual saved host USER_INPUT script transforms the returned and persisted composer text", script: true, expected: "this is a **** here" },
  { title: "without a host USER_INPUT script the returned and persisted composer text stays raw", script: false, expected: "this is a badword here" },
])("$title", async (scene) => {
  await using h = await textRoom(["A reply."]);
  if (scene.script) {
    const script = await h.root.services.regex.createScript({
      principal: h.owner,
      input: createRegexScriptSchema.parse({ name: "Host input mask", findRegex: "badword", replaceString: "****", placement: ["USER_INPUT"] }),
    });
    await h.root.services.regex.attachGlobal({ principal: h.owner, scriptId: script.id });
  }
  const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "this is a badword here" });
  expect(outcome.messages[0]).toMatchObject({ role: "user", content: scene.expected });
  const user = outcome.messages[0];
  if (user === undefined) {
    throw new Error("the public send returned no user row");
  }
  const stored = await h.root.db
    .select({ content: messageVariants.content })
    .from(messages)
    .innerJoin(messageVariants, eq(messages.selectedVariantId, messageVariants.id))
    .where(eq(messages.id, user.id));
  expect(stored).toEqual([{ content: scene.expected }]);
});
