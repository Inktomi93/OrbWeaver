// @subject packages/server/src/domain/chat/verbs/turn.ts
// Persona changes are authored through the root; prefix identity is measured on native provider inputs.
import { createCharacterSchema } from "@orb/contracts/character";
import { createPersonaSchema } from "@orb/contracts/persona";
import type { PromptConfig, PromptSection } from "@orb/contracts/preset";
import { DEFAULT_MARKER_TEMPLATES, DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { resolveProseText } from "@orb/contracts/prose";
import type { JsonValue } from "@orb/kit/json";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import {
  attachPersonaLore,
  inputMessages,
  inputSystem,
  inputSystemBlocks,
  invitePerson,
  lastMarkedRow,
  messageText,
  nativeText,
  personaAutoTurn,
  personaInputs,
  personaRoom,
  seatPersona,
  withoutCacheDirective,
} from "./persona-cache-physical.ts";

const CACHE_CARD = `aria the innkeeper\n${"A patient archivist catalogs the observatory's numbered books.\n".repeat(512)}`;

async function people(options: Parameters<typeof personaRoom>[1] = {}): Promise<
  AsyncDisposable & {
    readonly h: ChatRoot;
    readonly bob: ChatRoot["owner"];
    readonly alicePersona: Awaited<ReturnType<typeof seatPersona>>;
    readonly bobPersona: Awaited<ReturnType<typeof seatPersona>>;
    readonly bobOnline: AbortController;
  }
> {
  await using construction = new AsyncDisposableStack();
  const h = construction.use(
    await personaRoom(
      Array.from({ length: 12 }, (_, i) => `r${i + 1}`),
      {
        characters: [createCharacterSchema.parse({ handle: "aria", name: "aria", description: CACHE_CARD })],
        group: { policy: "list", output: "per-speaker", allowSelfResponses: true },
        ...options,
      },
    ),
  );
  const bob = await invitePerson(h);
  const alicePersona = await seatPersona(h, h.owner, "Alice", "ALICE-DESC");
  const bobPersona = await seatPersona(h, bob, "Bob", "BOB-DESC");
  await h.root.services.chat.setChatAnchorPersona({ principal: h.owner, chatId: h.chatId, personaId: alicePersona.id });
  const hostOnline = new AbortController();
  const bobOnline = new AbortController();
  construction.defer(() => {
    hostOnline.abort();
    bobOnline.abort();
  });
  h.root.app.presence.connect(h.owner.userId, hostOnline.signal);
  h.root.app.presence.connect(bob.userId, bobOnline.signal);
  const lifetime = construction.move();
  return { h, bob, alicePersona, bobPersona, bobOnline, [Symbol.asyncDispose]: (): Promise<void> => lifetime.disposeAsync() };
}

async function send(h: Awaited<ReturnType<typeof personaRoom>>, principal: Awaited<ReturnType<typeof personaRoom>>["owner"], content: string): Promise<void> {
  expect((await h.root.services.chat.send({ principal, chatId: h.chatId, content })).aborted).toBe(false);
}

function personEntry(name: string, description: string): string {
  return `${resolveProseText("chat.group.personaHeading", {}, { name })}\n${description}`;
}

test("Alice to Bob to Alice keeps every native history row through the previous nonvacuous cache marker", async () => {
  await using room = await people();
  const { h, bob } = room;
  await send(h, h.owner, "hello");
  await send(h, bob, "hey");
  await send(h, h.owner, "again");
  const inputs = await personaInputs(h);
  expect(inputs).toHaveLength(3);
  const previous = inputMessages(inputs[1] ?? null);
  const marker = lastMarkedRow(previous);
  expect(marker).toBeGreaterThanOrEqual(0);
  expect(
    inputMessages(inputs[2] ?? null)
      .slice(0, marker + 1)
      .map(withoutCacheDirective),
  ).toEqual(previous.slice(0, marker + 1).map(withoutCacheDirective));
  const labels = inputMessages(inputs[2] ?? null).map(messageText);
  expect(labels[0]?.endsWith("\n\nAlice: hello")).toBe(true);
  expect(labels.slice(2)).toContain("Bob: hey");
  expect(labels.at(-1)).toBe("Alice: again");
  expect(inputMessages(inputs[0] ?? null).map(messageText)).toEqual([labels[0]]);
});

test("a scoped room folds another character's line under its character name, never a human name", async () => {
  await using room = await people({
    characters: ["aria", "kai"].map((name) => createCharacterSchema.parse({ handle: name, name, description: CACHE_CARD })),
    group: { policy: "list", output: "per-speaker", cardScope: "scoped", allowSelfResponses: true },
  });
  await send(room.h, room.h.owner, "hello");
  await send(room.h, room.bob, "hey aria, kai");
  const text = (await personaInputs(room.h)).flatMap(inputMessages).map(messageText).join("\n\n");
  expect(text).toMatch(/(?:^|\n\n)(?:aria|kai): r\d/u);
  expect(text).not.toMatch(/(?:Alice|Bob): (?:aria|kai): /u);
});

test("names none labels both humans in a narrator room without labelling the narrator row", async () => {
  await using room = await people({
    characters: ["aria", "kai"].map((name) => createCharacterSchema.parse({ handle: name, name, description: "A seated character." })),
    group: { policy: "list", output: "narrator", allowSelfResponses: true },
    promptConfig: { ...DEFAULT_PROMPT_CONFIG, namesBehavior: "none" },
  });
  await send(room.h, room.h.owner, "hello");
  await send(room.h, room.bob, "hey");
  const inputs = await personaInputs(room.h);
  expect(inputs).toHaveLength(2);
  const rows = inputMessages(inputs[1] ?? null);
  expect(messageText(rows[0] ?? null).endsWith("\n\nAlice: hello")).toBe(true);
  expect(messageText(rows.at(-1) ?? null)).toMatch(/^Bob: hey\n\n/u);
  expect(rows[1]).toMatchObject({ role: "assistant" });
  expect(messageText(rows[1] ?? null)).toBe("r1");
});

test("solo second-call system and native history have the canonical golden shape and stable prefix", async () => {
  await using h = await personaRoom(["Hello there.", "Nice to meet you."], {
    characters: [createCharacterSchema.parse({ handle: "aria", name: "aria", description: "" })],
    group: { output: "per-speaker", policy: "list", allowSelfResponses: true },
  });
  const alex = await seatPersona(h, h.owner, "Alex", "the user");
  await h.root.services.chat.setChatAnchorPersona({ principal: h.owner, chatId: h.chatId, personaId: alex.id });
  await send(h, h.owner, "hi");
  await send(h, h.owner, "my name is Alex");
  const inputs = await personaInputs(h);
  expect(inputs).toHaveLength(2);
  const system = `${DEFAULT_MARKER_TEMPLATES.main_prompt.replaceAll("{{char}}", "aria").replaceAll("{{user}}", "Alex")}\n\nthe user`;
  expect(inputSystem(inputs[0] ?? null)).toBe(system);
  expect(inputSystem(inputs[1] ?? null)).toBe(system);
  const goldenBlocks = [{ type: "text", text: system }];
  expect(inputSystemBlocks(inputs[0] ?? null).map(withoutCacheDirective)).toEqual(goldenBlocks);
  expect(inputSystemBlocks(inputs[1] ?? null).map(withoutCacheDirective)).toEqual(goldenBlocks);
  expect(inputMessages(inputs[1] ?? null).map(withoutCacheDirective)).toEqual([
    { role: "user", content: [{ type: "text", text: `${resolveProseText("preset.format.newChatMarker", {})}\n\nhi` }] },
    { role: "assistant", content: [{ type: "text", text: "Hello there." }] },
    { role: "user", content: [{ type: "text", text: "my name is Alex" }] },
  ]);
});

test("departed and unattributed assistant history keeps its exact labels across current speakers", async () => {
  // The departed voice leaves the roster and the unattributed voice's card is deleted, so production owns both stamps.
  await using h = await personaRoom(["aria speaks", "kai speaks"], {
    characters: ["aria", "kai", "mira", "ghost"].map((name) => createCharacterSchema.parse({ handle: name, name, description: "A seated character." })),
    group: { output: "per-speaker", policy: "list", allowSelfResponses: true },
    promptConfig: { ...DEFAULT_PROMPT_CONFIG, namesBehavior: "content" },
    transcript: [
      { role: "user", content: "hi all" },
      { role: "assistant", speakerHandle: "mira", content: "I was here" },
      { role: "user", content: "and you?" },
      { role: "assistant", speakerHandle: "ghost", content: "agent line" },
      { role: "user", content: "go on" },
    ],
  });
  const [aria, kai, departed, ghost] = h.characters;
  if (aria === undefined || kai === undefined || departed === undefined || ghost === undefined) {
    throw new Error("the transcript room did not create its four authored voices");
  }
  await h.root.services.chat.removeCharacterFromChat({ principal: h.owner, chatId: h.chatId, characterId: departed.id });
  await h.root.services.character.remove({ principal: h.owner, characterId: ghost.id });
  for (const character of [aria, kai]) {
    await h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: character.id });
  }
  const inputs = await personaInputs(h);
  expect(inputs).toHaveLength(2);
  const first = inputMessages(inputs[0] ?? null).map(messageText);
  expect(first[1]).toBe("mira: I was here");
  expect(first[3]).toBe("agent line");
  expect(
    inputMessages(inputs[1] ?? null)
      .slice(0, 4)
      .map(messageText),
  ).toEqual(first.slice(0, 4));
});

test("Alice to Bob to Alice preserves the actual cached history and anchor-bound system across senders", async () => {
  // The physical route's native cache floor needs a substantial reusable prefix, not a manufactured marker.
  const description = `{{user}} is aria's oldest friend\n${"A patient archivist catalogs the observatory's numbered books.\n".repeat(512)}`;
  await using h = await personaRoom(["first", "second", "third", "fourth"], {
    characters: [createCharacterSchema.parse({ handle: "aria", name: "aria", description })],
    group: { policy: "list", output: "per-speaker" },
  });
  const bob = await h.root.principalFor((await h.root.actor()).id);
  const alicePersona = await h.root.services.persona.create({
    principal: h.owner,
    input: createPersonaSchema.parse({ name: "Alice", description: "ALICE-DESC" }),
  });
  const bobPersona = await h.root.services.persona.create({ principal: bob, input: createPersonaSchema.parse({ name: "Bob", description: "BOB-DESC" }) });
  await h.root.services.persona.setActivePersona({ principal: h.owner, chatId: h.chatId, personaId: alicePersona.id });
  const invite = await h.root.services.chat.createInvite({ principal: h.owner, chatId: h.chatId, input: { invitedHandle: bob.handle } });
  await h.root.services.chat.acceptInvite({ principal: bob, inviteId: invite.invite.id });
  await h.root.services.persona.setActivePersona({ principal: bob, chatId: h.chatId, personaId: bobPersona.id });
  await h.root.services.chat.setChatAnchorPersona({ principal: h.owner, chatId: h.chatId, personaId: alicePersona.id });
  const online = new AbortController();
  h.root.app.presence.connect(h.owner.userId, online.signal);
  try {
    await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "hello" });
    await h.root.services.chat.send({ principal: bob, chatId: h.chatId, content: "hey" });
    await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "again" });
    await h.root.services.chat.setChatAnchorPersona({ principal: h.owner, chatId: h.chatId, personaId: bobPersona.id });
    await h.root.services.chat.send({ principal: bob, chatId: h.chatId, content: "last" });
    const inputs = await personaInputs(h);
    expect(inputs).toHaveLength(4);
    const first = inputs[0];
    const second = inputs[1];
    const third = inputs[2];
    const fourth = inputs[3];
    if (first === undefined || second === undefined || third === undefined || fourth === undefined) {
      throw new Error("the four real persona sends did not reach the provider");
    }
    const systems = inputs.map(inputSystem);
    const blocks = inputs.map((input) => inputSystemBlocks(input).map(withoutCacheDirective));
    expect(systems[0]).toContain("Alice is aria's oldest friend");
    expect(systems[0]).toContain("ALICE-DESC");
    expect(systems[0]).toContain("BOB-DESC");
    expect(systems[1]).toBe(systems[0]);
    expect(systems[2]).toBe(systems[0]);
    expect(blocks[1]).toEqual(blocks[0]);
    expect(blocks[2]).toEqual(blocks[0]);
    expect(systems[3]).toContain("Bob is aria's oldest friend");
    expect(systems[3]).not.toBe(systems[2]);
    const aliceFirst = `ALICE-DESC\n\n${resolveProseText("chat.group.personaHeading", {}, { name: "Bob" })}\nBOB-DESC`;
    const bobFirst = `BOB-DESC\n\n${resolveProseText("chat.group.personaHeading", {}, { name: "Alice" })}\nALICE-DESC`;
    expect(systems[2]).toContain(aliceFirst);
    expect(systems[3]).toBe(systems[2]?.replace(aliceFirst, "<PEOPLE-BLOCK>").replaceAll("Alice", "Bob").replace("<PEOPLE-BLOCK>", bobFirst));
    expect(blocks[3]).toEqual(
      blocks[2]?.map((part) => {
        if (part === null || typeof part !== "object" || Array.isArray(part) || typeof part["text"] !== "string") {
          throw new Error("the native cache prefix contains a non-text system part");
        }
        return { ...part, text: part["text"].replace(aliceFirst, "<PEOPLE-BLOCK>").replaceAll("Alice", "Bob").replace("<PEOPLE-BLOCK>", bobFirst) };
      }),
    );
    for (const [before, after] of [
      [second, third],
      [third, fourth],
    ]) {
      if (before === undefined || after === undefined) {
        throw new Error("the physical prefix comparison is missing a turn");
      }
      const previous = inputMessages(before);
      const marker = lastMarkedRow(previous);
      expect(marker).toBeGreaterThanOrEqual(0);
      expect(
        inputMessages(after)
          .slice(0, marker + 1)
          .map(withoutCacheDirective),
      ).toEqual(previous.slice(0, marker + 1).map(withoutCacheDirective));
    }
    const finalMessages = JSON.stringify(inputMessages(third));
    expect(finalMessages).toContain("Alice: hello");
    expect(finalMessages).toContain("Bob: hey");
    expect(finalMessages).toContain("Alice: again");
  } finally {
    online.abort();
  }
});

test("a solo human send and actual automation turn share the swapped-seat system while the card keeps its anchor", async () => {
  await using h = await personaRoom(["r1", "r2"], {
    characters: [createCharacterSchema.parse({ handle: "aria", name: "aria", description: "{{user}} is my brother" })],
    group: { output: "per-speaker", policy: "list", allowSelfResponses: true },
  });
  const alex = await seatPersona(h, h.owner, "Alex", "ALEX-DESC");
  await seatPersona(h, h.owner, "Steve", "STEVE-DESC");
  await h.root.services.chat.setChatAnchorPersona({ principal: h.owner, chatId: h.chatId, personaId: alex.id });
  await send(h, h.owner, "hi");
  await personaAutoTurn(h);
  const inputs = await personaInputs(h);
  expect(inputs).toHaveLength(2);
  expect(inputSystem(inputs[1] ?? null)).toBe(inputSystem(inputs[0] ?? null));
  expect(inputSystemBlocks(inputs[1] ?? null).map(withoutCacheDirective)).toEqual(inputSystemBlocks(inputs[0] ?? null).map(withoutCacheDirective));
  expect(inputSystem(inputs[0] ?? null)).toContain("Alex is my brother");
  expect(inputSystem(inputs[0] ?? null)).toContain("roleplay with Steve");
});

test("an unstamped user row keeps its bytes and cache prefix between a human send and an actual automatic turn", async () => {
  await using h = await personaRoom(["r1", "r2"], {
    characters: [createCharacterSchema.parse({ handle: "aria", name: "aria", description: CACHE_CARD })],
    group: { output: "per-speaker", policy: "list", allowSelfResponses: true },
    // The imported owner line names no persona, so its stored stamp is null.
    transcript: [
      { role: "user", content: "an old line" },
      { role: "assistant", content: "a reply" },
    ],
  });
  const alex = await seatPersona(h, h.owner, "Alex", "ALEX-DESC");
  await h.root.services.chat.setChatAnchorPersona({ principal: h.owner, chatId: h.chatId, personaId: alex.id });
  await send(h, h.owner, "hi");
  await personaAutoTurn(h);
  const inputs = await personaInputs(h);
  expect(inputs).toHaveLength(2);
  const previous = inputMessages(inputs[0] ?? null);
  const next = inputMessages(inputs[1] ?? null);
  expect(messageText(next[0] ?? null)).toBe(messageText(previous[0] ?? null));
  const marker = lastMarkedRow(previous);
  expect(marker).toBeGreaterThanOrEqual(0);
  expect(next.slice(0, marker + 1).map(withoutCacheDirective)).toEqual(previous.slice(0, marker + 1).map(withoutCacheDirective));
});

test("a real impersonate draft uses its requesting human while ordinary canon remains anchor voiced", async () => {
  await using room = await people();
  await send(room.h, room.bob, "hello");
  let draft = "";
  for await (const { delta } of room.h.root.services.chat.impersonateStream({ principal: room.bob, chatId: room.h.chatId })) {
    draft += delta;
  }
  expect(draft).toBe("r2");
  const inputs = await personaInputs(room.h);
  expect(inputs).toHaveLength(2);
  expect(inputSystem(inputs[0] ?? null)).toContain("roleplay with Alice");
  expect(inputSystem(inputs[1] ?? null)).toContain("roleplay with Bob");
});

test("Bob leaving removes only his people entry from the native system", async () => {
  await using room = await people();
  await send(room.h, room.h.owner, "hello");
  await room.h.root.services.chat.selfLeave({ principal: room.bob, chatId: room.h.chatId });
  await send(room.h, room.h.owner, "alone now");
  const inputs = await personaInputs(room.h);
  const systems = inputs.map(inputSystem);
  expect(systems[0]).toContain(personEntry("Bob", "BOB-DESC"));
  expect(systems[1]).toBe(systems[0]?.replace(`\n\n${personEntry("Bob", "BOB-DESC")}`, ""));
  expect(inputSystemBlocks(inputs[1] ?? null).map(withoutCacheDirective)).toEqual(
    inputSystemBlocks(inputs[0] ?? null)
      .map(withoutCacheDirective)
      .map((part) => {
        if (part === null || typeof part !== "object" || Array.isArray(part) || typeof part["text"] !== "string") {
          throw new Error("the native membership prefix contains a non-text system part");
        }
        return { ...part, text: part["text"].replace(`\n\n${personEntry("Bob", "BOB-DESC")}`, "") };
      }),
  );
});

test("Bob going offline changes no native static byte and keeps his people entry", async () => {
  await using room = await people();
  await send(room.h, room.h.owner, "hello");
  expect(room.h.root.app.presence.read(room.bob.userId).online).toBe(true);
  room.bobOnline.abort();
  room.h.root.clock.advance(60_000);
  expect(room.h.root.app.presence.read(room.bob.userId).online).toBe(false);
  await send(room.h, room.h.owner, "still here?");
  const inputs = await personaInputs(room.h);
  const systems = inputs.map(inputSystem);
  expect(systems[0]).toContain(personEntry("Bob", "BOB-DESC"));
  expect(systems[1]).toBe(systems[0]);
  expect(inputSystemBlocks(inputs[1] ?? null).map(withoutCacheDirective)).toEqual(inputSystemBlocks(inputs[0] ?? null).map(withoutCacheDirective));
});

test("each real member persona book resolves user and persona against its own owner, independent of sender", async () => {
  await using room = await people();
  await attachPersonaLore(room.h, room.h.owner, room.alicePersona.id, "{{user}} likes tea ({{persona}})");
  await attachPersonaLore(room.h, room.bob, room.bobPersona.id, "{{user}} hates spiders ({{persona}})");
  await send(room.h, room.h.owner, "hello");
  await send(room.h, room.bob, "hey");
  const inputs = await personaInputs(room.h);
  const systems = inputs.map(inputSystem);
  expect(systems[0]).toContain("Alice likes tea (ALICE-DESC)");
  expect(systems[0]).toContain("Bob hates spiders (BOB-DESC)");
  expect(systems[0]).not.toContain("Alice hates spiders");
  expect(systems[1]).toBe(systems[0]);
  const staticText = nativeText(inputSystemBlocks(inputs[0] ?? null)[0] ?? null);
  expect(staticText).toContain("Alice likes tea (ALICE-DESC)");
  expect(staticText).toContain("Bob hates spiders (BOB-DESC)");
  expect(inputSystemBlocks(inputs[1] ?? null).map(withoutCacheDirective)).toEqual(inputSystemBlocks(inputs[0] ?? null).map(withoutCacheDirective));
});

test("Bob offline retains his persona lore and the exact native static block", async () => {
  await using room = await people();
  await attachPersonaLore(room.h, room.h.owner, room.alicePersona.id, "{{user}} likes tea ({{persona}})");
  await attachPersonaLore(room.h, room.bob, room.bobPersona.id, "{{user}} hates spiders ({{persona}})");
  await send(room.h, room.h.owner, "hello");
  expect(room.h.root.app.presence.read(room.bob.userId).online).toBe(true);
  room.bobOnline.abort();
  room.h.root.clock.advance(60_000);
  expect(room.h.root.app.presence.read(room.bob.userId).online).toBe(false);
  await send(room.h, room.h.owner, "still here?");
  const inputs = await personaInputs(room.h);
  const systems = inputs.map(inputSystem);
  expect(systems[0]).toContain("Bob hates spiders");
  expect(systems[1]).toBe(systems[0]);
  expect(nativeText(inputSystemBlocks(inputs[0] ?? null)[0] ?? null)).toContain("Bob hates spiders");
  expect(inputSystemBlocks(inputs[1] ?? null).map(withoutCacheDirective)).toEqual(inputSystemBlocks(inputs[0] ?? null).map(withoutCacheDirective));
});

test("Bob leaving withdraws his persona lore while Alice's real book stays", async () => {
  await using room = await people();
  await attachPersonaLore(room.h, room.h.owner, room.alicePersona.id, "{{user}} likes tea ({{persona}})");
  await attachPersonaLore(room.h, room.bob, room.bobPersona.id, "{{user}} hates spiders ({{persona}})");
  await send(room.h, room.h.owner, "hello");
  await room.h.root.services.chat.selfLeave({ principal: room.bob, chatId: room.h.chatId });
  await send(room.h, room.h.owner, "alone now");
  const inputs = await personaInputs(room.h);
  const systems = inputs.map(inputSystem);
  expect(systems[0]).toContain("Bob hates spiders");
  expect(systems[1]).not.toContain("hates spiders");
  expect(systems[1]).toContain("Alice likes tea");
  expect(nativeText(inputSystemBlocks(inputs[0] ?? null)[0] ?? null)).toContain("Bob hates spiders");
  expect(nativeText(inputSystemBlocks(inputs[1] ?? null)[0] ?? null)).not.toContain("hates spiders");
  expect(nativeText(inputSystemBlocks(inputs[1] ?? null)[0] ?? null)).toContain("Alice likes tea");
});

const PER_TURN_NOTE = "[PER-TURN NOTE]";
const DEPTH_TWO_NOTE = "[DEPTH-2 NOTE]";
const BELOW_HISTORY_NOTE = "[BELOW-HISTORY NOTE]";

async function placement(model: string, strict: boolean): Promise<JsonValue> {
  const pivot = DEFAULT_PROMPT_CONFIG.sections.findIndex((section) => section.type === "marker" && section.marker === "chat_history");
  const perTurn: PromptSection = {
    type: "literal",
    id: "per-turn",
    name: "per-turn",
    role: "system",
    enabled: true,
    content: PER_TURN_NOTE,
    trigger: ["normal"],
  };
  const depth: PromptSection = {
    type: "literal",
    id: "at-depth",
    name: "at-depth",
    role: "system",
    enabled: true,
    content: DEPTH_TWO_NOTE,
    inject: { depth: 2 },
  };
  const below: PromptSection = { type: "literal", id: "below", name: "below", role: "system", enabled: true, content: BELOW_HISTORY_NOTE };
  await using h = await personaRoom(["r"], {
    model,
    promptConfig: {
      ...DEFAULT_PROMPT_CONFIG,
      sections: [...DEFAULT_PROMPT_CONFIG.sections.slice(0, pivot), perTurn, depth, ...DEFAULT_PROMPT_CONFIG.sections.slice(pivot), below],
      params: strict ? { ...DEFAULT_PROMPT_CONFIG.params, advanced: { roleHandling: "strict" } } : DEFAULT_PROMPT_CONFIG.params,
    },
    group: { output: "per-speaker", policy: "list", allowSelfResponses: true },
    transcript: ["u1", "a1", "u2", "a2"].map((content, index) => ({ role: index % 2 === 0 ? ("user" as const) : ("assistant" as const), content })),
  });
  await send(h, h.owner, "u3");
  const inputs = await personaInputs(h);
  expect(inputs).toHaveLength(1);
  return inputs[0] ?? null;
}

test("a real mid-conversation-system model retains depth-two and below-history system rows in place", async () => {
  const input = await placement("claude-opus-5", false);
  const rows = inputMessages(input);
  const texts = rows.map(messageText);
  expect(inputSystem(input)).toContain(PER_TURN_NOTE);
  const blocks = inputSystemBlocks(input);
  expect(blocks).toHaveLength(2);
  expect(nativeText(blocks[0] ?? null)).not.toContain(PER_TURN_NOTE);
  expect(nativeText(blocks[1] ?? null)).toContain(PER_TURN_NOTE);
  expect(texts.some((text) => text.includes(PER_TURN_NOTE))).toBe(false);
  const index = texts.indexOf(DEPTH_TWO_NOTE);
  expect(rows[index]).toMatchObject({ role: "system" });
  expect([texts[index - 1], texts[index + 1]]).toEqual(["u2", "a2"]);
  expect(rows.at(-1)).toMatchObject({ role: "system" });
  expect(texts.at(-1)).toBe(BELOW_HISTORY_NOTE);
});

test("a real older model and strict preset fold the same system rows into user text at their authored position", async () => {
  for (const [model, strict] of [
    ["claude-haiku-4-5", false],
    ["claude-opus-5", true],
  ] as const) {
    const input = await placement(model, strict);
    const rows = inputMessages(input);
    const texts = rows.map(messageText);
    expect(rows.some((row) => row !== null && typeof row === "object" && !Array.isArray(row) && row["role"] === "system")).toBe(false);
    expect(inputSystem(input)).toContain(PER_TURN_NOTE);
    const blocks = inputSystemBlocks(input);
    expect(blocks).toHaveLength(2);
    expect(nativeText(blocks[0] ?? null)).not.toContain(PER_TURN_NOTE);
    expect(nativeText(blocks[1] ?? null)).toContain(PER_TURN_NOTE);
    const index = texts.findIndex((text) => text.includes(DEPTH_TWO_NOTE));
    expect(index).toBeGreaterThanOrEqual(0);
    expect(rows[index]).toMatchObject({ role: "user" });
    expect(texts[index + 1]).toBe("a2");
    expect(texts.at(-1)).toContain(BELOW_HISTORY_NOTE);
    expect(rows.at(-1)).toMatchObject({ role: "user" });
  }
});

test("an actual imported ST lorebook brackets the per-turn section at before-character and after-character anchors", async () => {
  const marker = (id: string, kind: "main_prompt" | "world_info_before" | "char_description" | "world_info_after" | "chat_history"): PromptSection => ({
    type: "marker",
    id,
    name: id,
    marker: kind,
    role: "system",
    enabled: true,
  });
  const config: PromptConfig = {
    ...DEFAULT_PROMPT_CONFIG,
    sections: [
      marker("main", "main_prompt"),
      marker("wi-before", "world_info_before"),
      marker("desc", "char_description"),
      { type: "literal", id: "mid", name: "mid", role: "system", enabled: true, content: "[MID]", trigger: ["normal"] },
      marker("wi-after", "world_info_after"),
      marker("history", "chat_history"),
    ],
  };
  await using h = await personaRoom(["r"], { promptConfig: config, group: { output: "per-speaker", policy: "list", allowSelfResponses: true } });
  const imported = await h.root.services.worldInfo.importFile({
    principal: h.owner,
    filename: "Port.json",
    fileText: JSON.stringify({
      entries: {
        "0": { uid: 0, key: ["harbor"], keysecondary: [], comment: "before", content: "BEFORE LORE", order: 100, position: 0, disable: false },
        "1": { uid: 1, key: ["harbor"], keysecondary: [], comment: "after", content: "AFTER LORE", order: 100, position: 1, disable: false },
      },
    }),
  });
  expect(imported.ok).toBe(true);
  const books = await h.root.services.worldInfo.listBooks({ principal: h.owner });
  expect(books).toHaveLength(1);
  const book = books[0];
  if (book === undefined) {
    throw new Error("the native imported lorebook did not persist");
  }
  await h.root.services.worldInfo.attachToChat({ principal: h.owner, chatId: h.chatId, bookId: book.id });
  await send(h, h.owner, "we reach the harbor at dusk");
  const inputs = await personaInputs(h);
  expect(inputs).toHaveLength(1);
  const system = inputSystem(inputs[0] ?? null);
  expect(system).toContain("BEFORE LORE\n\n[MID]\n\nAFTER LORE");
  const blocks = inputSystemBlocks(inputs[0] ?? null);
  expect(blocks).toHaveLength(2);
  expect(nativeText(blocks[0] ?? null)).not.toContain("LORE");
  expect(nativeText(blocks[1] ?? null)).toBe("BEFORE LORE\n\n[MID]\n\nAFTER LORE");
  expect(system.indexOf("BEFORE LORE")).toBeGreaterThanOrEqual(0);
  expect(system.match(/BEFORE LORE/gu)).toHaveLength(1);
  expect(system.match(/AFTER LORE/gu)).toHaveLength(1);
});
