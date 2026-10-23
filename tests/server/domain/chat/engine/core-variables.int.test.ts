// @subject packages/server/src/domain/chat/engine/engine.ts
// Real card macros author deltas; SQLite and the canonical fold own commit and retry behavior.
import { createCharacterSchema } from "@orb/contracts/character";
import { chats, messages, messageVariants } from "@orb/db";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { terminalSseLine } from "@orb/testkit/node/provider-stream.ts";
import { eq, sql } from "drizzle-orm";
import { coreFrame, coreHttpRoom, coreSse } from "./core-physical.ts";

const HP = "coreHp";

function reply(): Response {
  return coreSse([
    coreFrame({ choices: [{ delta: { content: "A real variable-bearing reply." } }] }),
    terminalSseLine({ usage: { promptTokens: 4, completionTokens: 2 } }),
  ]);
}

test("a real card's setvar lands once and survives the following empty-delta turn", async () => {
  await using h = await coreHttpRoom([reply, reply], {
    characters: [createCharacterSchema.parse({ handle: "runtime-setter", name: "Setter", description: `{{setvar::${HP}::1}}A keeper of the ledger.` })],
  });
  const character = h.characters[0];
  if (character === undefined) {
    throw new Error("the actual runtime setter has no character");
  }
  const first = await h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: character.id });
  expect(first.aborted).toBe(false);
  const firstVariant = first.messages[0]?.selectedVariantId;
  if (firstVariant === undefined) {
    throw new Error("the real variable turn committed no selected variant");
  }
  expect(await h.root.db.select().from(messageVariants).where(eq(messageVariants.id, firstVariant)).get()).toMatchObject({
    variableDelta: [{ op: "set", key: HP, value: "1" }],
  });
  expect(await h.root.services.chat.getRuntimeVariables({ principal: h.owner, chatId: h.chatId })).toEqual({ [HP]: "1" });
  await h.root.services.character.update({
    principal: h.owner,
    characterId: character.id,
    input: { description: "A keeper with no variable-writing template." },
  });
  const second = await h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: character.id });
  expect(second.aborted).toBe(false);
  const secondVariant = second.messages[0]?.selectedVariantId;
  if (secondVariant === undefined) {
    throw new Error("the real empty-delta turn committed no selected variant");
  }
  expect(await h.root.db.select().from(messageVariants).where(eq(messageVariants.id, secondVariant)).get()).toMatchObject({ variableDelta: [] });
  expect(await h.root.services.chat.getRuntimeVariables({ principal: h.owner, chatId: h.chatId })).toEqual({ [HP]: "1" });
  expect(await h.root.db.select().from(chats).where(eq(chats.id, h.chatId)).get()).toMatchObject({ runtimeVariables: { [HP]: "1" } });
});

test("a real scoped round gives each speaker only its own variable delta", async () => {
  await using h = await coreHttpRoom([reply, reply], {
    group: { output: "per-speaker", cardScope: "scoped", policy: "list", allowSelfResponses: true },
    characters: [
      createCharacterSchema.parse({ handle: "runtime-founder", name: "Founder", description: `{{setvar::${HP}::1}}The founder begins the count.` }),
      createCharacterSchema.parse({ handle: "runtime-increment", name: "Increment", description: `{{incvar::${HP}}}The next keeper increments it.` }),
    ],
  });
  const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Complete the two-keeper round." });
  expect(outcome.aborted).toBe(false);
  const assistant = outcome.messages.filter((message) => message.role === "assistant");
  expect(assistant).toHaveLength(2);
  expect(assistant.map((message) => message.characterId)).toEqual(h.characters.map((character) => character.id));
  const variants = await h.root.db
    .select({ characterId: messages.characterId, variableDelta: messageVariants.variableDelta })
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(eq(messages.chatId, h.chatId))
    .orderBy(messages.seq);
  expect(variants.filter((row) => row.characterId !== null)).toEqual([
    { characterId: h.characters[0]?.id, variableDelta: [{ op: "set", key: HP, value: "1" }] },
    { characterId: h.characters[1]?.id, variableDelta: [{ op: "inc", key: HP }] },
  ]);
  expect(await h.root.services.chat.getRuntimeVariables({ principal: h.owner, chatId: h.chatId })).toEqual({ [HP]: "2" });
});

test("a physical failed canon write leaves variable state untouched and a real retry applies its operation exactly once", async () => {
  await using h = await coreHttpRoom([reply, reply], {
    characters: [createCharacterSchema.parse({ handle: "runtime-retry", name: "Retry", description: `{{incvar::${HP}}}A keeper retries the written beat.` })],
  });
  const character = h.characters[0];
  if (character === undefined) {
    throw new Error("the actual variable retry has no character");
  }
  await h.root.db.run(
    sql`CREATE TEMP TRIGGER refuse_runtime_variant BEFORE INSERT ON ${messageVariants} BEGIN SELECT RAISE(ABORT, 'controlled variable canon refusal'); END`,
  );
  await expect(h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: character.id })).rejects.toThrow(
    "controlled variable canon refusal",
  );
  expect(await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId))).toEqual([]);
  expect(await h.root.db.select().from(chats).where(eq(chats.id, h.chatId)).get()).toMatchObject({ runtimeVariables: null });
  expect(await h.root.services.chat.getRuntimeVariables({ principal: h.owner, chatId: h.chatId })).toEqual({});
  await h.root.db.run(sql`DROP TRIGGER refuse_runtime_variant`);
  const retried = await h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: character.id });
  expect(retried.aborted).toBe(false);
  expect(retried.messages).toMatchObject([{ seq: 1, characterId: character.id }]);
  expect(await h.root.db.select().from(messageVariants)).toMatchObject([{ variableDelta: [{ op: "inc", key: HP }] }]);
  expect(await h.root.services.chat.getRuntimeVariables({ principal: h.owner, chatId: h.chatId })).toEqual({ [HP]: "1" });
  expect(h.requests.filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions"))).toHaveLength(2);
});
