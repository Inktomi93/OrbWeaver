// @subject packages/server/src/domain/chat/assembly/turn-personas.ts
// @subject packages/server/src/domain/chat/verbs/participants.ts
// Persona resolution on the native provider bytes: a card's identity follows the room's pinned anchor, the prompt's
// voice follows the speaker's seat, and neither a seat swap nor a re-pin rewrites a stored message's persona stamp.
import { createCharacterSchema } from "@orb/contracts/character";
import { createPersonaSchema } from "@orb/contracts/persona";
import type { PromptSection } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { PersonaId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { readRoomCanon } from "@orb/testkit/node/composed";
import { inputMessages, inputSystem, invitePerson, messageText, personaInputs, personaRoom } from "./persona-cache-physical.ts";

const VOICE_PROBE: PromptSection = { type: "literal", id: "voice", name: "voice", role: "system", enabled: true, content: "PROMPT_USER=<{{user}}>" };
const CARD_DESCRIPTION = "CARD_USER=<{{user}}> CARD_PERSONA=<{{persona}}>";
// A card that never names {{persona}}, so an anchor description in the prompt can only come from the anchor block.
const BARE_CARD_DESCRIPTION = "CARD_USER=<{{user}}>";

function room(replies: readonly string[], description = CARD_DESCRIPTION): Promise<ChatRoot> {
  return personaRoom(replies, {
    promptConfig: { ...DEFAULT_PROMPT_CONFIG, sections: [VOICE_PROBE, ...DEFAULT_PROMPT_CONFIG.sections] },
    characters: [createCharacterSchema.parse({ handle: "mary", name: "Mary", description })],
    group: { output: "per-speaker", policy: "list", allowSelfResponses: true },
  });
}

async function persona(h: ChatRoot, name: string, description: string): Promise<PersonaId> {
  return (await h.root.services.persona.create({ principal: h.owner, input: createPersonaSchema.parse({ name, description }) })).id;
}

function probe(text: string, key: string): string | null {
  return new RegExp(`${key}=<([^>]*)>`, "u").exec(text)?.[1] ?? null;
}

/** The system block and the history text of the newest native request. */
async function newestInput(h: ChatRoot): Promise<{ readonly system: string; readonly history: string }> {
  const body = (await personaInputs(h)).at(-1);
  if (body === undefined) {
    throw new Error("the room made no native request");
  }
  return { system: inputSystem(body), history: inputMessages(body).map(messageText).join("\n") };
}

async function say(h: ChatRoot, content: string, personaId?: PersonaId): Promise<void> {
  const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content, ...(personaId === undefined ? {} : { personaId }) });
  expect(outcome.aborted).toBe(false);
}

async function seat(h: ChatRoot, personaId: PersonaId | null): Promise<void> {
  await h.root.services.persona.setActivePersona({ principal: h.owner, chatId: h.chatId, personaId });
}

async function pin(h: ChatRoot, personaId: PersonaId | null): Promise<void> {
  await h.root.services.chat.setChatAnchorPersona({ principal: h.owner, chatId: h.chatId, personaId });
}

test("anchor and seat on one persona: the card and the prompt both name it", async () => {
  await using h = await room(["one"]);
  const alex = await persona(h, "Alex", "Alex is a doctor");
  await seat(h, alex);
  await pin(h, alex);
  await say(h, "hello");
  const { system } = await newestInput(h);
  expect(probe(system, "CARD_USER")).toBe("Alex");
  expect(probe(system, "PROMPT_USER")).toBe("Alex");
});

test("a seat swap leaves the card on the anchor, moves the prompt to the seat, and keeps a stamped line on its author", async () => {
  await using h = await room(["one", "two"]);
  const alex = await persona(h, "Alex", "Alex is a doctor");
  const steve = await persona(h, "Steve", "Steve is a soldier");
  await seat(h, alex);
  await pin(h, alex);
  await say(h, "{{user}} waves");
  const before = await newestInput(h);
  expect(probe(before.system, "PROMPT_USER")).toBe("Alex");

  await seat(h, steve);
  await say(h, "Steve answers");
  const { system, history } = await newestInput(h);
  expect(probe(system, "CARD_USER")).toBe("Alex");
  expect(probe(system, "PROMPT_USER")).toBe("Steve");
  // The earlier line carries Alex's stamp, so it keeps Alex even though Steve now holds the seat.
  expect(history).toContain("Alex waves");
  expect(history).not.toContain("Steve waves");
});

test("re-pinning the anchor moves the card's identity and drops the previous anchor's description", async () => {
  await using h = await room(["one", "two"], BARE_CARD_DESCRIPTION);
  const alex = await persona(h, "Alex", "my hair is brown");
  const steve = await persona(h, "Steve", "Steve is a mage");
  await seat(h, steve);
  await pin(h, alex);
  await say(h, "first");
  const swapped = await newestInput(h);
  expect(probe(swapped.system, "CARD_USER")).toBe("Alex");
  // The anchor is not speaking, so its description still reaches the model; this is the positive control for the absence below.
  expect(swapped.system).toContain("my hair is brown");

  await pin(h, steve);
  await say(h, "second");
  const rePinned = await newestInput(h);
  expect(probe(rePinned.system, "CARD_USER")).toBe("Steve");
  expect(rePinned.system).not.toContain("my hair is brown");
});

test("a card's {{persona}} resolves the anchor's description, never the speaking seat's", async () => {
  await using h = await room(["one"]);
  const alex = await persona(h, "Alex", "a traveling doctor");
  const steve = await persona(h, "Steve", "a hardened soldier");
  await seat(h, steve);
  await pin(h, alex);
  await say(h, "hello");
  const { system } = await newestInput(h);
  expect(probe(system, "CARD_PERSONA")).toBe("a traveling doctor");
});

test("swapping the seat or re-pinning the anchor never rewrites a stored message's persona stamp", async () => {
  await using h = await room(["one", "two"]);
  const alex = await persona(h, "Alex", "Alex is a doctor");
  const steve = await persona(h, "Steve", "Steve is a soldier");
  await seat(h, alex);
  await pin(h, alex);
  await say(h, "from alex");
  const userStamps = async (): Promise<(PersonaId | null)[]> =>
    (await readRoomCanon(h.root, h.owner, h.chatId)).filter(({ role }) => role === "user").map(({ personaId }) => personaId);
  expect(await userStamps()).toEqual([alex]);

  await seat(h, steve);
  await pin(h, steve);
  expect(await userStamps()).toEqual([alex]);

  // Positive control: the same room does stamp the new seat on the next send.
  await say(h, "from steve");
  expect(await userStamps()).toEqual([alex, steve]);
});

test("in a two-human room each stored line resolves {{user}} to the persona it was stamped with", async () => {
  await using h = await room(["one", "two"]);
  const bob = await invitePerson(h);
  const online = new AbortController();
  using _presence = { [Symbol.dispose]: (): void => online.abort() };
  h.root.app.presence.connect(h.owner.userId, online.signal);
  h.root.app.presence.connect(bob.userId, online.signal);
  const nova = await persona(h, "Nova", "Nova leads");
  const juno = (await h.root.services.persona.create({ principal: bob, input: createPersonaSchema.parse({ name: "Juno", description: "Juno follows" }) })).id;
  await seat(h, nova);
  await h.root.services.persona.setActivePersona({ principal: bob, chatId: h.chatId, personaId: juno });
  await pin(h, nova);

  for (const speaker of [h.owner, bob]) {
    const outcome = await h.root.services.chat.send({ principal: speaker, chatId: h.chatId, content: "{{user}} waves" });
    expect(outcome.aborted).toBe(false);
  }

  const { history } = await newestInput(h);
  // The host's line is not retargeted to the member's persona, nor the member's line to the anchor.
  expect(history.split("Nova waves").length - 1).toBe(1);
  expect(history.split("Juno waves").length - 1).toBe(1);
});
