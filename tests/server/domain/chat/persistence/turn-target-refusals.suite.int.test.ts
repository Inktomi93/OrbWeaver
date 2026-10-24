// Invitations and roster writes distinguish authorization, presence and mute: every refused target leaves
// the stored message and variant rows byte-for-byte untouched.
// @subject packages/server/src/domain/chat/verbs/turn.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { createPersonaSchema } from "@orb/contracts/persona";
import { messages, messageVariants } from "@orb/db";
import { ChatNotFoundError } from "@orb/server/domain/chat";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";
import { drain, room } from "../verbs/turn-target-authority.fixtures.ts";

async function canon(h: ChatRoot): Promise<{ readonly message: typeof messages.$inferSelect; readonly variant: typeof messageVariants.$inferSelect }[]> {
  return await h.root.db
    .select({ message: messages, variant: messageVariants })
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.messageId, messages.id))
    .where(eq(messages.chatId, h.chatId))
    .orderBy(messages.seq, messageVariants.idx);
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
