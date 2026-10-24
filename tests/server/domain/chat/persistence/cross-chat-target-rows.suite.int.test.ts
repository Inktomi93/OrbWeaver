// A foreign chat's swipe, continue and undo-continue against another room's message leave both rooms'
// message and variant rows and the stats_canon_versions counters byte-for-byte unchanged.
// @subject packages/server/src/domain/chat/verbs/turn.ts

import { createCharacterSchema } from "@orb/contracts/character";
import type { MessageView } from "@orb/contracts/chat";
import { messages, messageVariants, statsCanonVersions } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { ChatNotFoundError } from "@orb/server/domain/chat";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";
import { textRoom } from "../scenario-physical.ts";

interface TwoRooms extends AsyncDisposable {
  readonly h: ChatRoot;
  readonly attacker: ChatRoot["owner"];
  readonly attackerChatId: ChatId;
  readonly reply: MessageView;
}

async function room(): Promise<TwoRooms> {
  await using construction = new AsyncDisposableStack();
  const h = construction.use(await textRoom(["victim canon", "Hi there"], { group: { output: "per-speaker", policy: "list" } }));
  await h.root.services.chat.commitMessage({ principal: h.owner, chatId: h.chatId, content: "claim victim" });
  const speaker = h.characters[0];
  if (speaker === undefined) {
    throw new Error("the real victim room has no character");
  }
  const generated = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId, speakerCharacterId: speaker.id });
  const reply = generated.messages[0];
  if (reply === undefined) {
    throw new Error("the actual victim generation produced no slot");
  }
  const attacker = await h.root.principalFor((await h.root.actor()).id);
  const attackerCard = await h.root.services.character.create({
    principal: attacker,
    input: createCharacterSchema.parse({ handle: "attacker-card", name: "Attacker card", description: "A distinct owner's own character." }),
  });
  const attackerRoom = await h.root.services.chat.startChat({ principal: attacker, characterIds: [attackerCard.id], opening: "none" });
  const lifetime = construction.move();
  return { h, attacker, attackerChatId: attackerRoom.chat.id, reply, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

async function canon(
  f: TwoRooms,
  chatId: ChatId,
): Promise<{ readonly message: typeof messages.$inferSelect; readonly variant: typeof messageVariants.$inferSelect }[]> {
  return await f.h.root.db
    .select({ message: messages, variant: messageVariants })
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.messageId, messages.id))
    .where(eq(messages.chatId, chatId))
    .orderBy(messages.seq, messageVariants.idx);
}

const VERIFY = {
  swipe: async (pending: ReturnType<ChatRoot["root"]["services"]["chat"]["swipe"]>): Promise<void> => {
    await expect(pending).rejects.toBeInstanceOf(ChatNotFoundError);
  },
  continueTurn: async (pending: ReturnType<ChatRoot["root"]["services"]["chat"]["continueTurn"]>): Promise<void> => {
    await expect(pending).rejects.toBeInstanceOf(ChatNotFoundError);
  },
  undoContinue: async (pending: ReturnType<ChatRoot["root"]["services"]["chat"]["undoContinue"]>): Promise<void> => {
    await expect(pending).rejects.toMatchObject({ code: "no_continuation" });
  },
};

test("swipe with a chat-B messageId is refused identically to a nonexistent id — B's canon untouched", async () => {
  await using f = await room();

  const victim = await canon(f, f.h.chatId);
  const attacker = await canon(f, f.attackerChatId);
  const versions = await f.h.root.db.select().from(statsCanonVersions).orderBy(statsCanonVersions.ownerId);
  await VERIFY.swipe(f.h.root.services.chat.swipe({ principal: f.attacker, chatId: f.attackerChatId, messageId: f.reply.id }));
  await VERIFY.swipe(f.h.root.services.chat.swipe({ principal: f.attacker, chatId: f.attackerChatId, messageId: mintTypeId(ID_PREFIX.message) }));
  expect(await canon(f, f.h.chatId)).toEqual(victim);
  expect(await canon(f, f.attackerChatId)).toEqual(attacker);
  expect(await f.h.root.db.select().from(statsCanonVersions).orderBy(statsCanonVersions.ownerId)).toEqual(versions);
  expect(victim.map(({ variant }) => variant.content)).toEqual(["claim victim", "victim canon"]);
});

test("continueTurn with a chat-B messageId is refused identically to a nonexistent id — B's canon untouched", async () => {
  await using f = await room();

  const victim = await canon(f, f.h.chatId);
  const attacker = await canon(f, f.attackerChatId);
  const versions = await f.h.root.db.select().from(statsCanonVersions).orderBy(statsCanonVersions.ownerId);
  await VERIFY.continueTurn(f.h.root.services.chat.continueTurn({ principal: f.attacker, chatId: f.attackerChatId, messageId: f.reply.id }));
  await VERIFY.continueTurn(f.h.root.services.chat.continueTurn({ principal: f.attacker, chatId: f.attackerChatId, messageId: mintTypeId(ID_PREFIX.message) }));
  expect(await canon(f, f.h.chatId)).toEqual(victim);
  expect(await canon(f, f.attackerChatId)).toEqual(attacker);
  expect(await f.h.root.db.select().from(statsCanonVersions).orderBy(statsCanonVersions.ownerId)).toEqual(versions);
  expect(victim.map(({ variant }) => variant.content)).toEqual(["claim victim", "victim canon"]);
});

test("undoContinue with a chat-B messageId is refused no_continuation — B's real continuation stays intact", async () => {
  await using f = await room();
  const continued = await f.h.root.services.chat.continueTurn({ principal: f.h.owner, chatId: f.h.chatId, messageId: f.reply.id });
  expect(continued.messages[0]?.content).toBe("victim canonHi there");
  const victim = await canon(f, f.h.chatId);
  const attacker = await canon(f, f.attackerChatId);
  const versions = await f.h.root.db.select().from(statsCanonVersions).orderBy(statsCanonVersions.ownerId);
  await VERIFY.undoContinue(f.h.root.services.chat.undoContinue({ principal: f.attacker, chatId: f.attackerChatId, messageId: f.reply.id }));
  await VERIFY.undoContinue(f.h.root.services.chat.undoContinue({ principal: f.attacker, chatId: f.attackerChatId, messageId: mintTypeId(ID_PREFIX.message) }));
  expect(await canon(f, f.h.chatId)).toEqual(victim);
  expect(await canon(f, f.attackerChatId)).toEqual(attacker);
  expect(await f.h.root.db.select().from(statsCanonVersions).orderBy(statsCanonVersions.ownerId)).toEqual(versions);
  expect(victim.map(({ variant }) => variant.content)).toEqual(["claim victim", "victim canonHi there"]);
});
