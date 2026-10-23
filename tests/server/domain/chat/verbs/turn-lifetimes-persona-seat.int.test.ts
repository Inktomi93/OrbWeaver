// @subject packages/server/src/domain/chat/verbs/turn.ts
// @subject packages/server/src/domain/chat/verbs/read.ts
import { createPersonaSchema } from "@orb/contracts/persona";
import { messages, messageVariants } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { eq } from "drizzle-orm";
import { personaInputs, personaRoom, seatPersona } from "../persona-cache-physical.ts";

test("an omitted send persona stamps the actual active seat while a subsequent streamed draft changes no canon or variant", async () => {
  await using h = await personaRoom(["The keeper replies.", "The user's drafted line."], { group: { output: "per-speaker", policy: "list" } });
  const active = await seatPersona(h, h.owner, "Active speaker", "The user's current voice.");
  const params = { principal: h.owner, chatId: h.chatId };
  const sent = await h.root.services.chat.send({ ...params, content: "Ask the keeper." });
  expect(sent.aborted).toBe(false);
  expect(sent.messages.filter(({ role }) => role === "user")).toMatchObject([{ authorUserId: h.owner.userId, personaId: active.id }]);
  const canon = await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq);
  const variants = await h.root.db.select().from(messageVariants).orderBy(messageVariants.id);
  expect(canon.map(({ role }) => role)).toEqual(["user", "assistant"]);
  const deltas: string[] = [];
  for await (const { delta } of h.root.services.chat.impersonateStream(params)) {
    deltas.push(delta);
  }
  expect(deltas.length).toBeGreaterThan(0);
  expect(deltas.join("")).toBe("The user's drafted line.");
  expect(await personaInputs(h)).toHaveLength(2);
  expect(await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq)).toEqual(canon);
  expect(await h.root.db.select().from(messageVariants).orderBy(messageVariants.id)).toEqual(variants);
});

test("the actual reattribute target follows a swapped active seat and stays null on an empty seat despite its pinned anchor", async () => {
  await using h = await personaRoom([], { group: { output: "per-speaker", policy: "list" } });
  await seatPersona(h, h.owner, "First speaker", "The original voice.");
  const spare = await h.root.services.persona.create({
    principal: h.owner,
    input: createPersonaSchema.parse({ name: "Swapped speaker", description: "The new voice." }),
  });
  const params = { principal: h.owner, chatId: h.chatId };
  await h.root.services.persona.setActivePersona({ ...params, personaId: spare.id });
  const swapped = await h.root.services.chat.commitMessage({ ...params, content: "After the swap." });
  expect(swapped.aborted).toBe(false);
  expect(swapped.messages).toMatchObject([{ personaId: spare.id }]);
  expect((await h.root.services.chat.getChat(params)).viewerActivePersonaId).toBe(spare.id);
  await h.root.services.chat.setChatAnchorPersona({ ...params, personaId: spare.id });
  await h.root.services.persona.setActivePersona({ ...params, personaId: null });
  const bare = await h.root.services.chat.commitMessage({ ...params, content: "No seat persona." });
  expect(bare.aborted).toBe(false);
  expect(bare.messages).toMatchObject([{ personaId: null }]);
  const room = await h.root.services.chat.getChat(params);
  expect(room.viewerActivePersonaId).toBeNull();
  expect(room.anchorPersonaId).toBe(spare.id);
  expect(await personaInputs(h)).toEqual([]);
});
