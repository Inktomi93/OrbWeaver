// @subject packages/server/src/domain/chat/verbs/turn.ts
// @subject packages/contracts/src/chat/metadata.ts
import { createCharacterSchema } from "@orb/contracts/character";
import type { ChatBusEvent } from "@orb/contracts/chat";
import { SHIPPED_PROMPT_CACHE } from "@orb/contracts/inference";
import { characters, chats, messages } from "@orb/db";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { and, eq, sql } from "drizzle-orm";
import { textRoom } from "../scenario-physical.ts";

test("an actual stored narrator and Smart combination heals to Natural without calling its available Utility model", async () => {
  await using h = await textRoom(["The room answers together."], {
    characters: [
      createCharacterSchema.parse({ handle: "aria", name: "Aria", description: "An observant keeper." }),
      createCharacterSchema.parse({ handle: "bryn", name: "Bryn", description: "A patient traveller." }),
    ],
    group: { output: "narrator", policy: "natural" },
  });
  // Historical/imported bytes exercise the stored read rather than normalization by today's public writer.
  await h.root.db
    .update(chats)
    .set({ metadata: sql`json_set(${chats.metadata}, '$.group.policy', 'smart', '$.group.smartPicker', 'utility')` })
    .where(eq(chats.id, h.chatId));
  const params = { principal: h.owner, chatId: h.chatId };
  const bindings = await h.root.services.connection.listBindings({ principal: h.owner });
  const connectionId = bindings.find(({ task }) => task === "chat")?.binding?.connectionId;
  if (connectionId === undefined || connectionId === null) {
    throw new Error("the actual narrator room has no saved chat connection");
  }
  await h.root.services.connection.update({ principal: h.owner, connectionId, patch: { promptCache: { ...SHIPPED_PROMPT_CACHE, enabled: false } } });
  expect((await h.root.services.connection.get({ principal: h.owner, connectionId })).promptCache?.enabled).toBe(false);
  expect(await h.root.services.chat.getGroupConfigForChat(params)).toMatchObject({ output: "narrator", policy: "natural" });
  expect((await h.root.services.connection.listBindings({ principal: h.owner })).find(({ task }) => task === "summarize")?.binding).toMatchObject({
    connectionId: expect.any(String),
  });
  const events: ChatBusEvent[] = [];
  using subscription = new DisposableStack();
  subscription.defer(
    h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
      if (event.chatId === h.chatId) {
        events.push(event);
      }
    }),
  );
  const outcome = await h.root.services.chat.send({ ...params, content: "Narrate the whole room." });
  expect(outcome.aborted).toBe(false);
  const assistants = outcome.messages.filter(({ role }) => role === "assistant");
  expect(assistants).toHaveLength(1);
  const group = await h.root.db
    .select()
    .from(characters)
    .where(and(eq(characters.ownerId, h.owner.userId), eq(characters.synthetic, true)))
    .get();
  if (group === undefined) {
    throw new Error("the real narrator did not mint its canonical group character");
  }
  expect(assistants).toMatchObject([{ kind: "narrator", characterId: group.id, content: "The room answers together." }]);
  expect(
    await h.root.db
      .select({ characterId: messages.characterId })
      .from(messages)
      .where(and(eq(messages.chatId, h.chatId), eq(messages.role, "assistant"))),
  ).toEqual([{ characterId: group.id }]);
  expect(h.requests.filter((request) => request.method === "POST").map((request) => new URL(request.url).pathname)).toEqual(["/v1/chat/completions"]);
  expect(events.filter(({ type }) => type === "warning")).toEqual([]);
});
