// An omitted send persona stamps the active seat; a streamed draft afterwards leaves every stored canon
// row and variant row byte-for-byte unchanged.
// @subject packages/server/src/domain/chat/verbs/turn.ts
// @subject packages/server/src/domain/chat/verbs/read.ts

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
