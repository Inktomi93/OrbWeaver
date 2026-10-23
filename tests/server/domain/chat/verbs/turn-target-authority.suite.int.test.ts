// @subject packages/server/src/domain/chat/verbs/turn.ts
// Public invitations and roster writes distinguish authorization, presence and mute without constructing domain context.
import { createCharacterSchema } from "@orb/contracts/character";
import { createPersonaSchema } from "@orb/contracts/persona";
import { messages, messageVariants } from "@orb/db";
import { ChatNotFoundError } from "@orb/server/domain/chat";
import type { ChatRoot } from "@orb/testkit/node/chat/composed.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";
import { textRoom } from "../scenario-physical.ts";

async function room(): Promise<
  AsyncDisposable & {
    readonly h: ChatRoot;
    readonly member: ChatRoot["owner"];
    readonly stranger: ChatRoot["owner"];
    readonly aria: ChatRoot["characters"][number];
    readonly bryn: ChatRoot["characters"][number];
    readonly claim: Awaited<ReturnType<ChatRoot["root"]["services"]["chat"]["commitMessage"]>>["messages"][number];
  }
> {
  await using construction = new AsyncDisposableStack();
  const h = construction.use(
    await textRoom(["Hi there", " more"], {
      server: { random: () => 0.99 },
      characters: ["aria", "bryn"].map((name) => createCharacterSchema.parse({ handle: name, name, description: `${name} has a public character card.` })),
      group: { output: "per-speaker", policy: "natural" },
    }),
  );
  const aria = h.characters[0];
  const bryn = h.characters[1];
  if (aria === undefined || bryn === undefined) {
    throw new Error("the physical root did not create both characters");
  }
  // These cases start claimed; fresh force-room initialization is a different production contract.
  const posted = await h.root.services.chat.commitMessage({ principal: h.owner, chatId: h.chatId, content: "The room is claimed." });
  const claim = posted.messages[0];
  if (claim === undefined) {
    throw new Error("the public claim produced no user row");
  }
  const member = await h.root.principalFor((await h.root.actor()).id);
  const stranger = await h.root.principalFor((await h.root.actor()).id);
  const invite = await h.root.services.chat.createInvite({ principal: h.owner, chatId: h.chatId, input: { invitedHandle: member.handle } });
  await h.root.services.chat.acceptInvite({ principal: member, inviteId: invite.invite.id });
  const lifetime = construction.move();
  return { h, aria, bryn, member, stranger, claim, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

async function canon(h: ChatRoot): Promise<{ readonly message: typeof messages.$inferSelect; readonly variant: typeof messageVariants.$inferSelect }[]> {
  return await h.root.db
    .select({ message: messages, variant: messageVariants })
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.messageId, messages.id))
    .where(eq(messages.chatId, h.chatId))
    .orderBy(messages.seq, messageVariants.idx);
}

async function muteBryn(f: Awaited<ReturnType<typeof room>>): Promise<void> {
  const seat = (await f.h.root.services.chat.listParticipants({ principal: f.h.owner, chatId: f.h.chatId })).find(
    ({ characterId }) => characterId === f.bryn.id,
  );
  if (seat === undefined) {
    throw new Error("the actual roster has no Bryn seat");
  }
  await f.h.root.services.chat.setSeatKnobs({ principal: f.h.owner, chatId: f.h.chatId, participantId: seat.id, patch: { disabled: true } });
}

async function drain(stream: ReturnType<ChatRoot["root"]["services"]["chat"]["impersonateStream"]>): Promise<void> {
  for await (const _delta of stream) {
    /* Drain the actual public iterator so its ownership guard executes. */
  }
}

test("the host forces a specific character to speak (no user row)", async () => {
  await using f = await room();
  const before = await canon(f.h);
  const outcome = await f.h.root.services.chat.forceCharacterTurn({ principal: f.h.owner, chatId: f.h.chatId, characterId: f.bryn.id });
  expect(outcome.messages).toHaveLength(1);
  expect(outcome.messages[0]).toMatchObject({ role: "assistant", characterId: f.bryn.id });
  expect((await canon(f.h)).slice(before.length).map(({ message }) => message.role)).toEqual(["assistant"]);
});

test("a plain member is refused with not_host", async () => {
  await using f = await room();
  const before = await canon(f.h);
  await expect(f.h.root.services.chat.forceCharacterTurn({ principal: f.member, chatId: f.h.chatId, characterId: f.aria.id })).rejects.toMatchObject({
    code: "not_host",
  });
  expect(await canon(f.h)).toEqual(before);
});

test("forcing a non-roster character is a leak-free NOT_FOUND", async () => {
  await using f = await room();
  const before = await canon(f.h);
  const foreign = await f.h.root.services.character.create({
    principal: f.stranger,
    input: createCharacterSchema.parse({ handle: "foreign", name: "Foreign", description: "A stranger-owned character absent from this room." }),
  });
  await expect(f.h.root.services.chat.forceCharacterTurn({ principal: f.h.owner, chatId: f.h.chatId, characterId: foreign.id })).rejects.toBeInstanceOf(
    ChatNotFoundError,
  );
  expect(await canon(f.h)).toEqual(before);
});

test("a MUTED-but-present member is still force-summonable (drives a turn voiced by them)", async () => {
  await using f = await room();
  await muteBryn(f);
  const outcome = await f.h.root.services.chat.forceCharacterTurn({ principal: f.h.owner, chatId: f.h.chatId, characterId: f.bryn.id });
  expect(outcome.messages).toHaveLength(1);
  expect(outcome.messages[0]).toMatchObject({ role: "assistant", characterId: f.bryn.id });
});

test("the SAME muted member is excluded from a `natural` auto-round (send picks only the enabled one)", async () => {
  await using f = await room();
  await muteBryn(f);
  const outcome = await f.h.root.services.chat.send({ principal: f.h.owner, chatId: f.h.chatId, content: "hi all" });
  const assistants = outcome.messages.filter(({ role }) => role === "assistant");
  expect(assistants.length).toBeGreaterThan(0);
  expect(assistants.map(({ characterId }) => characterId)).toEqual([f.aria.id]);
});

test("a member generating for a character NOT in this roster is a leak-free NOT_FOUND, nothing committed", async () => {
  await using f = await room();
  const foreign = await f.h.root.services.character.create({
    principal: f.stranger,
    input: createCharacterSchema.parse({ handle: "foreign", name: "Foreign", description: "A stranger-owned character absent from this room." }),
  });
  const before = await canon(f.h);
  await expect(f.h.root.services.chat.generate({ principal: f.member, chatId: f.h.chatId, speakerCharacterId: foreign.id })).rejects.toBeInstanceOf(
    ChatNotFoundError,
  );
  expect(await canon(f.h)).toEqual(before);
});

test("a member generating for a DEPARTED (leftSeq set) character member is refused NOT_FOUND", async () => {
  await using f = await room();
  await f.h.root.services.chat.removeCharacterFromChat({ principal: f.h.owner, chatId: f.h.chatId, characterId: f.bryn.id });
  const before = await canon(f.h);
  await expect(f.h.root.services.chat.generate({ principal: f.member, chatId: f.h.chatId, speakerCharacterId: f.bryn.id })).rejects.toBeInstanceOf(
    ChatNotFoundError,
  );
  expect(await canon(f.h)).toEqual(before);
});

test("a member generating for a PRESENT character character succeeds (regression: the legitimate path stays open)", async () => {
  await using f = await room();
  const outcome = await f.h.root.services.chat.generate({ principal: f.member, chatId: f.h.chatId, speakerCharacterId: f.bryn.id });
  expect(outcome.messages).toHaveLength(1);
  expect(outcome.messages[0]).toMatchObject({ role: "assistant", characterId: f.bryn.id });
});

test("a member generating for a PRESENT-but-MUTED character character succeeds (mute gates arbitration, not manual targeting)", async () => {
  await using f = await room();
  await muteBryn(f);
  const outcome = await f.h.root.services.chat.generate({ principal: f.member, chatId: f.h.chatId, speakerCharacterId: f.bryn.id });
  expect(outcome.messages).toHaveLength(1);
  expect(outcome.messages[0]).toMatchObject({ role: "assistant", characterId: f.bryn.id });
});

test("an EXPLICIT foreign personaId is refused not_persona_owner — nothing committed (the trust boundary)", async () => {
  await using f = await room();
  const persona = await f.h.root.services.persona.create({
    principal: f.stranger,
    input: createPersonaSchema.parse({ name: "Private stranger", description: "A stranger-owned private persona." }),
  });
  const before = await canon(f.h);
  await expect(f.h.root.services.chat.commitMessage({ principal: f.member, chatId: f.h.chatId, content: "hi", personaId: persona.id })).rejects.toMatchObject({
    code: "not_persona_owner",
  });
  expect(await canon(f.h)).toEqual(before);
});

test("a member sending with ANOTHER user's personaId is refused not_persona_owner, nothing committed", async () => {
  await using f = await room();
  const persona = await f.h.root.services.persona.create({
    principal: f.stranger,
    input: createPersonaSchema.parse({ name: "Private stranger", description: "A stranger-owned private persona." }),
  });
  const before = await canon(f.h);
  await expect(f.h.root.services.chat.send({ principal: f.member, chatId: f.h.chatId, content: "hi", personaId: persona.id })).rejects.toMatchObject({
    code: "not_persona_owner",
  });
  await expect(drain(f.h.root.services.chat.impersonateStream({ principal: f.member, chatId: f.h.chatId, personaId: persona.id }))).rejects.toMatchObject({
    code: "not_persona_owner",
  });
  expect(await canon(f.h)).toEqual(before);
  expect(f.h.requests.filter((request) => new URL(request.url).pathname.endsWith("/chat/completions"))).toEqual([]);
});

test("a non-member is refused (leak-free NOT_FOUND — the membership gate)", async () => {
  await using f = await room();
  const before = await canon(f.h);
  await expect(f.h.root.services.chat.commitMessage({ principal: f.stranger, chatId: f.h.chatId, content: "hi" })).rejects.toBeInstanceOf(ChatNotFoundError);
  expect(await canon(f.h)).toEqual(before);
});

test("a non-member is refused (leak-free NOT_FOUND — can() default-deny)", async () => {
  await using f = await room();
  const before = await canon(f.h);
  await expect(f.h.root.services.chat.send({ principal: f.stranger, chatId: f.h.chatId, content: "hi" })).rejects.toBeInstanceOf(ChatNotFoundError);
  expect(await canon(f.h)).toEqual(before);
});

test("abort with nothing in flight is a no-op", async () => {
  await using f = await room();
  await expect(f.h.root.services.chat.abort({ principal: f.h.owner, chatId: f.h.chatId })).resolves.toBeUndefined();
});

test("swiping a non-assistant slot is a leak-free NOT_FOUND", async () => {
  await using f = await room();
  const before = await canon(f.h);
  await expect(f.h.root.services.chat.swipe({ principal: f.h.owner, chatId: f.h.chatId, messageId: f.claim.id })).rejects.toBeInstanceOf(ChatNotFoundError);
  expect(await canon(f.h)).toEqual(before);
});

test("undoContinue on a never-continued variant is refused no_continuation", async () => {
  await using f = await room();
  const sent = await f.h.root.services.chat.generate({ principal: f.h.owner, chatId: f.h.chatId, speakerCharacterId: f.aria.id });
  const reply = sent.messages[0];
  if (reply === undefined) {
    throw new Error("the actual generation produced no assistant");
  }
  const before = await canon(f.h);
  await expect(f.h.root.services.chat.undoContinue({ principal: f.h.owner, chatId: f.h.chatId, messageId: reply.id })).rejects.toMatchObject({
    code: "no_continuation",
  });
  expect(await canon(f.h)).toEqual(before);
});
