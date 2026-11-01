// @subject packages/server/src/domain/chat/verbs/turn.ts
// @subject packages/server/src/domain/chat/verbs/read.ts
// @subject packages/server/src/domain/chat/verbs/read-inherited-chat-books.ts
// A held pin's book feeds the room's lore pool: read from the provider request, the assembly trace, the host
// preview and the inherited rack, each through the production door.
import { createCharacterSchema } from "@orb/contracts/character";
import { createPersonaSchema } from "@orb/contracts/persona";
import type { CreateEntryInput } from "@orb/contracts/world-info";
import { createBookSchema, createEntrySchema, updateEntrySchema } from "@orb/contracts/world-info";
import type { PersonaId, WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { connectDevice } from "@orb/testkit/node/composed";
import {
  attachPersonaLore,
  inputSystemBlocks,
  invitePerson,
  personaAutoTurn,
  personaInputs,
  personaRoom,
  seatPersona,
  withoutCacheDirective,
} from "../persona-cache-physical.ts";
import { textRoom, wireBodies, wireText } from "../scenario-physical.ts";

const PINNED_LORE = "{{user}} keeps the ledger";
const PINNED_RENDERED = "Ledgerkeeper keeps the ledger";
const SEAT_LORE = "SEAT-PERSONA-LORE";
const PIN_TITLE = "Pin probe";
const REPLIES = Array.from({ length: 12 }, (_, i) => `reply ${i + 1}`);

type Principal = ChatRoot["owner"];

async function pinLore(
  h: ChatRoot,
  principal: Principal,
  personaId: PersonaId,
  entryFields: Pick<CreateEntryInput, "content" | "keys" | "priority">,
): Promise<{ readonly bookId: WorldBookId; readonly entryId: WorldEntryId }> {
  const book = await h.root.services.worldInfo.createBook({ principal, input: createBookSchema.parse({ name: "Pin book" }) });
  const entry = await h.root.services.worldInfo.createEntry({
    principal,
    bookId: book.id,
    input: createEntrySchema.parse({ title: PIN_TITLE, ...entryFields }),
  });
  await h.root.services.worldInfo.attachToPersona({ principal, personaId, bookId: book.id });
  return { bookId: book.id, entryId: entry.id };
}

async function pin(h: ChatRoot, personaId: PersonaId | null): Promise<void> {
  await h.root.services.chat.setChatAnchorPersona({ principal: h.owner, chatId: h.chatId, personaId });
}

/** Bob's persona is pinned and carries a book; Bob then walks out and the pin holds. */
async function heldPinRoom(h: ChatRoot): Promise<{ readonly bob: Principal; readonly pinned: PersonaId }> {
  const bob = await invitePerson(h);
  const persona = await seatPersona(h, bob, "Ledgerkeeper", "The persona the room is pinned to.");
  await pinLore(h, bob, persona.id, { content: PINNED_LORE });
  await pin(h, persona.id);
  await h.root.services.chat.selfLeave({ principal: bob, chatId: h.chatId });
  return { bob, pinned: persona.id };
}

async function send(h: ChatRoot, principal: Principal = h.owner, content = "Go on.", chatId = h.chatId): Promise<void> {
  expect((await h.root.services.chat.send({ principal, chatId, content })).aborted).toBe(false);
}

/** A member's send generates only while the host is online; otherwise the turn defers. */
async function hostOnline(h: ChatRoot): Promise<Disposable> {
  const online = new AbortController();
  await connectDevice(h.root, h.owner.userId, online.signal);
  return { [Symbol.dispose]: (): void => online.abort() };
}

async function newestWire(h: ChatRoot): Promise<string> {
  const body = (await wireBodies(h)).at(-1);
  if (body === undefined) {
    throw new Error("the room made no chat-completions request");
  }
  return wireText(body);
}

async function previewOf(h: ChatRoot, chatId = h.chatId): Promise<{ readonly text: string; readonly activated: readonly string[] }> {
  const { prompt, trace } = await h.root.services.chat.previewAssembly({ principal: h.owner, chatId });
  return { text: `${prompt.static}\n${prompt.dynamic}`, activated: trace.worldInfoActivated.map(({ title }) => title) };
}

async function inheritedPersonaBooks(h: ChatRoot, principal: Principal = h.owner): Promise<readonly (string | null | undefined)[]> {
  const books = await h.root.services.worldInfo.listForChat({ principal, chatId: h.chatId, includeInherited: true });
  return books.filter((book) => book.inherited?.source === "persona").map((book) => book.inherited?.name);
}

test("the pin's book feeds a turn whose speaker is another persona, in the wire, the trace, the preview and the rack", async () => {
  await using h = await textRoom(REPLIES);
  const pinned = await seatPersona(h, h.owner, "Ledgerkeeper", "The pinned persona.");
  await pinLore(h, h.owner, pinned.id, { content: PINNED_LORE });
  await pin(h, pinned.id);
  const speaking = await seatPersona(h, h.owner, "Wanderer", "The persona speaking now.");
  await attachPersonaLore(h, h.owner, speaking.id, SEAT_LORE);

  const preview = await previewOf(h);
  expect(preview.text).toContain(PINNED_RENDERED);
  expect(preview.activated).toContain(PIN_TITLE);
  expect(await inheritedPersonaBooks(h)).toEqual(expect.arrayContaining(["Ledgerkeeper", "Wanderer"]));

  await send(h);
  const wire = await newestWire(h);
  expect(wire).toContain(PINNED_RENDERED);
  expect(wire).toContain(SEAT_LORE);
});

test("a pin whose owner left keeps its book for the host and a member, and a member's rack and preview stay closed", async () => {
  await using h = await textRoom(REPLIES);
  const carol = await invitePerson(h);
  await heldPinRoom(h);
  using _online = await hostOnline(h);

  await send(h);
  expect(await newestWire(h)).toContain(PINNED_RENDERED);
  await send(h, carol);
  expect(await wireBodies(h)).toHaveLength(2);
  expect(await newestWire(h)).toContain(PINNED_RENDERED);
  expect((await previewOf(h)).text).toContain(PINNED_RENDERED);
  expect(await inheritedPersonaBooks(h)).toEqual(["Ledgerkeeper"]);

  expect(await inheritedPersonaBooks(h, carol)).toEqual([]);
  await expect(h.root.services.chat.previewAssembly({ principal: carol, chatId: h.chatId })).rejects.toThrow();
});

test("a pin whose owner is disabled keeps its book, while a disabled seat's unpinned book drops", async () => {
  await using h = await textRoom(REPLIES);
  const bob = await invitePerson(h);
  const dave = await invitePerson(h);
  const pinned = await seatPersona(h, bob, "Ledgerkeeper", "The persona the room is pinned to.");
  await pinLore(h, bob, pinned.id, { content: PINNED_LORE });
  await pin(h, pinned.id);
  const seated = await seatPersona(h, dave, "Bystander", "An unpinned seat.");
  await attachPersonaLore(h, dave, seated.id, SEAT_LORE);

  await h.root.services.admin.setEnabled({ principal: h.owner, userId: bob.userId, enabled: false });
  await h.root.services.admin.setEnabled({ principal: h.owner, userId: dave.userId, enabled: false });
  const { text } = await previewOf(h);
  expect(text).toContain(PINNED_RENDERED);
  expect(text).not.toContain(SEAT_LORE);
});

test("a pin seated as the speaker contributes each entry once", async () => {
  await using h = await textRoom(REPLIES);
  const persona = await seatPersona(h, h.owner, "Ledgerkeeper", "Pinned and seated.");
  await pinLore(h, h.owner, persona.id, { content: PINNED_LORE });
  await pin(h, persona.id);

  expect((await previewOf(h)).activated.filter((title) => title === PIN_TITLE)).toHaveLength(1);
  await send(h);
  expect((await newestWire(h)).split(PINNED_RENDERED)).toHaveLength(2);
});

test("no pin adds nothing: an unseated persona's book stays out, and a re-pin moves the book in and out", async () => {
  await using h = await textRoom(REPLIES);
  const shelved = await seatPersona(h, h.owner, "Ledgerkeeper", "Not played, not pinned.");
  await pinLore(h, h.owner, shelved.id, { content: PINNED_LORE });
  await seatPersona(h, h.owner, "Wanderer", "The persona speaking now.");
  await pin(h, null);
  expect((await previewOf(h)).activated).toEqual([]);

  await pin(h, shelved.id);
  expect((await previewOf(h)).activated).toEqual([PIN_TITLE]);
  await pin(h, null);
  expect((await previewOf(h)).activated).toEqual([]);
  await send(h);
  expect(await newestWire(h)).not.toContain(PINNED_RENDERED);
});

test("a pin with no book adds nothing to the pool", async () => {
  await using h = await textRoom(REPLIES);
  const bookless = await seatPersona(h, h.owner, "Ledgerkeeper", "A pin with no book.");
  await pin(h, bookless.id);
  const speaking = await seatPersona(h, h.owner, "Wanderer", "The persona speaking now.");
  await attachPersonaLore(h, h.owner, speaking.id, SEAT_LORE);
  const { activated } = await previewOf(h);
  await pin(h, null);
  expect((await previewOf(h)).activated).toEqual(activated);
  expect(await inheritedPersonaBooks(h)).toEqual(["Wanderer"]);
});

test("a disabled entry, a detached book and a deleted book each leave the held pin's pool", async () => {
  await using h = await textRoom(REPLIES);
  const { bob, pinned } = await heldPinRoom(h);
  const kept = await pinLore(h, bob, pinned, { content: "SECOND-PIN-ENTRY" });
  const third = await pinLore(h, bob, pinned, { content: "THIRD-PIN-ENTRY" });
  expect((await previewOf(h)).text).toContain("SECOND-PIN-ENTRY");

  await h.root.services.worldInfo.updateEntry({ principal: bob, entryId: kept.entryId, input: updateEntrySchema.parse({ enabled: false }) });
  expect((await previewOf(h)).text).not.toContain("SECOND-PIN-ENTRY");

  await h.root.services.worldInfo.detachFromPersona({ principal: bob, personaId: pinned, bookId: third.bookId });
  expect((await previewOf(h)).text).not.toContain("THIRD-PIN-ENTRY");

  await h.root.services.worldInfo.attachToPersona({ principal: bob, personaId: pinned, bookId: third.bookId });
  expect((await previewOf(h)).text).toContain("THIRD-PIN-ENTRY");
  await h.root.services.worldInfo.removeBook({ principal: bob, bookId: third.bookId });
  const { text } = await previewOf(h);
  expect(text).not.toContain("THIRD-PIN-ENTRY");
  expect(text).toContain(PINNED_RENDERED);
});

test("deleting the pinned persona clears the pin and its book together", async () => {
  await using h = await textRoom(REPLIES);
  const { bob, pinned } = await heldPinRoom(h);
  await h.root.services.persona.create({ principal: bob, input: createPersonaSchema.parse({ name: "Spare", description: "Keeps the delete legal." }) });
  expect((await previewOf(h)).text).toContain(PINNED_RENDERED);
  await h.root.services.persona.remove({ principal: bob, personaId: pinned });
  expect((await previewOf(h)).text).not.toContain(PINNED_RENDERED);
});

test("the host's member-lore switch governs a member's pin as it governs a member's seat, and never the host's own pin", async () => {
  await using h = await textRoom(REPLIES);
  await heldPinRoom(h);
  await h.root.services.chat.setMemberPersonaLore({ principal: h.owner, chatId: h.chatId, enabled: false });
  expect((await previewOf(h)).activated).toEqual([]);
  expect(await inheritedPersonaBooks(h)).toEqual([]);
  await send(h);
  expect(await newestWire(h)).not.toContain(PINNED_RENDERED);

  await h.root.services.chat.setMemberPersonaLore({ principal: h.owner, chatId: h.chatId, enabled: true });
  expect((await previewOf(h)).activated).toEqual([PIN_TITLE]);

  await pin(h, null);
  const own = await seatPersona(h, h.owner, "Own Pin", "The host's pin.");
  await pinLore(h, h.owner, own.id, { content: "HOST-PIN-LORE" });
  await pin(h, own.id);
  await seatPersona(h, h.owner, "Wanderer", "The persona speaking now.");
  await h.root.services.chat.setMemberPersonaLore({ principal: h.owner, chatId: h.chatId, enabled: false });
  expect((await previewOf(h)).text).toContain("HOST-PIN-LORE");
});

test("group rounds, a forced turn and an automation turn carry the held pin's book", async () => {
  const characters = [
    createCharacterSchema.parse({ handle: "aria", name: "Aria", description: "Aria is a warden of the ford." }),
    createCharacterSchema.parse({ handle: "kai", name: "Kai", description: "Kai is a wandering bard." }),
  ];
  await using h = await textRoom(REPLIES, { characters, group: { output: "per-speaker", policy: "list" } });
  await heldPinRoom(h);

  await send(h);
  const groupRounds = await wireBodies(h);
  expect(groupRounds.length).toBeGreaterThan(1);
  expect(groupRounds.filter((body) => !wireText(body).includes(PINNED_RENDERED))).toEqual([]);

  const [aria] = await h.root.services.chat
    .getChat({ principal: h.owner, chatId: h.chatId })
    .then((chat) => chat.participants.flatMap((seat) => (seat.characterId === null ? [] : [seat.characterId])));
  if (aria === undefined) {
    throw new Error("the room seated no character");
  }
  await h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: aria });
  expect(await newestWire(h)).toContain(PINNED_RENDERED);

  const before = (await wireBodies(h)).length;
  await personaAutoTurn(h);
  const after = await wireBodies(h);
  expect(after.length).toBeGreaterThan(before);
  expect(wireText(after.at(-1) ?? null)).toContain(PINNED_RENDERED);
});

test("a fork carries the pin and so its book", async () => {
  await using h = await textRoom(REPLIES);
  await heldPinRoom(h);
  await send(h);
  const fork = await h.root.services.chat.forkChat({ principal: h.owner, chatId: h.chatId });
  expect((await previewOf(h, fork.chat.id)).text).toContain(PINNED_RENDERED);
  await send(h, h.owner, "Go on in the fork.", fork.chat.id);
  expect(await newestWire(h)).toContain(PINNED_RENDERED);
});

test("a keyword entry in the pin's book fires only on a scan hit", async () => {
  await using h = await textRoom(REPLIES);
  const pinned = await seatPersona(h, h.owner, "Ledgerkeeper", "The pinned persona.");
  await pinLore(h, h.owner, pinned.id, { content: "KEYED-PIN-ENTRY", keys: ["lantern"] });
  await pin(h, pinned.id);
  await seatPersona(h, h.owner, "Wanderer", "The persona speaking now.");

  await send(h, h.owner, "Nothing to see.");
  expect(await newestWire(h)).not.toContain("KEYED-PIN-ENTRY");
  await send(h, h.owner, "Light the lantern.");
  expect(await newestWire(h)).toContain("KEYED-PIN-ENTRY");
});

test("a held pin keeps the system blocks identical across senders; a re-pin is one change, then stable", async () => {
  await using h = await personaRoom(REPLIES, { group: { output: "per-speaker", policy: "list" } });
  const carol = await invitePerson(h);
  await heldPinRoom(h);
  const hostPersona = await seatPersona(h, h.owner, "Wanderer", "The host's seat.");
  using _online = await hostOnline(h);

  await send(h);
  await send(h, carol, "Carol speaks.");
  await pin(h, hostPersona.id);
  await send(h);
  await send(h, carol, "Carol speaks again.");

  const [first, second, third, fourth] = (await personaInputs(h)).map((body) => JSON.stringify(inputSystemBlocks(body).map(withoutCacheDirective)));
  expect(first).toContain(PINNED_RENDERED);
  expect(second).toBe(first);
  expect(third).not.toContain(PINNED_RENDERED);
  expect(fourth).toBe(third);
});

async function memberSendDrained(h: ChatRoot, between: () => Promise<void>): Promise<string> {
  const carol = await invitePerson(h);
  await heldPinRoom(h);
  await h.root.services.chat.send({ principal: carol, chatId: h.chatId, content: "An owed reply." });
  expect(await wireBodies(h)).toHaveLength(0);
  await between();
  using _online = await hostOnline(h);
  await expect.poll(async () => (await wireBodies(h)).length, { timeout: 15_000 }).toBeGreaterThan(0);
  await h.root.settleBackground();
  return await newestWire(h);
}

test("a deferred drain carries the held pin's book", async () => {
  await using h = await textRoom(REPLIES, { group: { policy: "list", output: "per-speaker" } });
  expect(await memberSendDrained(h, () => Promise.resolve())).toContain(PINNED_RENDERED);
});

test("a deferred drain reads the pin at drain time, so a pin cleared while it waited sends no book", async () => {
  await using h = await textRoom(REPLIES, { group: { policy: "list", output: "per-speaker" } });
  expect(await memberSendDrained(h, () => pin(h, null))).not.toContain(PINNED_RENDERED);
});

test("generate, continue and impersonate carry the held pin's book", async () => {
  await using h = await textRoom(REPLIES);
  await heldPinRoom(h);
  await send(h);

  const beforeGenerate = (await wireBodies(h)).length;
  const generated = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId });
  expect((await wireBodies(h)).length).toBeGreaterThan(beforeGenerate);
  expect(await newestWire(h)).toContain(PINNED_RENDERED);

  const tail = generated.messages.at(-1);
  if (tail === undefined) {
    throw new Error("generate returned no message");
  }
  const beforeContinue = (await wireBodies(h)).length;
  await h.root.services.chat.continueTurn({ principal: h.owner, chatId: h.chatId, messageId: tail.id });
  expect((await wireBodies(h)).length).toBeGreaterThan(beforeContinue);
  expect(await newestWire(h)).toContain(PINNED_RENDERED);

  const beforeImpersonate = (await wireBodies(h)).length;
  for await (const _delta of h.root.services.chat.impersonateStream({ principal: h.owner, chatId: h.chatId })) {
    // The stream only runs while it is drained.
  }
  expect((await wireBodies(h)).length).toBeGreaterThan(beforeImpersonate);
  expect(await newestWire(h)).toContain(PINNED_RENDERED);
});

test.for([
  ["older", true],
  ["newer", false],
] as const)("a book the seat and a pin %s than it both hold renders against the seat", async ([, pinFirst]) => {
  await using h = await textRoom(REPLIES);
  const first = await seatPersona(h, h.owner, pinFirst ? "Pinned" : "Speaking", "The older persona.");
  const second = await seatPersona(h, h.owner, pinFirst ? "Speaking" : "Pinned", "The newer persona.");
  const [pinned, speaking] = pinFirst ? [first, second] : [second, first];
  const { bookId } = await pinLore(h, h.owner, pinned.id, { content: "SHARED {{user}} walks" });
  await h.root.services.worldInfo.attachToPersona({ principal: h.owner, personaId: speaking.id, bookId });
  await h.root.services.persona.setActivePersona({ principal: h.owner, chatId: h.chatId, personaId: speaking.id });
  await pin(h, pinned.id);

  expect((await previewOf(h)).text).toContain("SHARED Speaking walks");
  await send(h);
  const wire = await newestWire(h);
  expect(wire).toContain("SHARED Speaking walks");
  expect(wire).not.toContain("SHARED Pinned walks");
});

test("a pin book joins the ordinary budget walk: a lower entry drops and the trace names it", async () => {
  await using h = await textRoom(REPLIES);
  const lower = await h.root.services.worldInfo.createBook({ principal: h.owner, input: createBookSchema.parse({ name: "Chat book" }) });
  const dropped = await h.root.services.worldInfo.createEntry({
    principal: h.owner,
    bookId: lower.id,
    input: createEntrySchema.parse({ title: "Chat entry", content: "LOWER-CHAT-ENTRY ".repeat(20), priority: 1 }),
  });
  await h.root.services.worldInfo.attachToChat({ principal: h.owner, chatId: h.chatId, bookId: lower.id });
  await h.root.services.settings.updateUserSettingsSection({ principal: h.owner, input: { section: "worldInfo", patch: { tokenBudget: 150 } } });
  const pinned = await seatPersona(h, h.owner, "Ledgerkeeper", "The pinned persona.");
  await pin(h, pinned.id);
  await seatPersona(h, h.owner, "Wanderer", "The persona speaking now.");
  expect((await previewOf(h)).text).toContain("LOWER-CHAT-ENTRY");

  await pinLore(h, h.owner, pinned.id, { content: "HIGHER-PIN-ENTRY ".repeat(20), priority: 100 });
  const { prompt, trace } = await h.root.services.chat.previewAssembly({ principal: h.owner, chatId: h.chatId });
  expect(prompt.static).toContain("HIGHER-PIN-ENTRY");
  expect(prompt.static).not.toContain("LOWER-CHAT-ENTRY");
  expect(trace.worldInfoDropped).toEqual([{ id: dropped.id, reason: "budget" }]);
});
