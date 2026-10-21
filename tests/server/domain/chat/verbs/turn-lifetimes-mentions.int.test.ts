// @subject packages/server/src/domain/chat/verbs/turn.ts
import "@orb/testkit/node/composed-real.ts";
import { characters, messages } from "@orb/db";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { and, eq } from "drizzle-orm";
import { textRoom } from "../scenario-physical.ts";
import { TAIL_ROSTER } from "./turn-lifetimes-roster.ts";

const MENTIONS = [
  { title: "an eligible public mention coerces a narrator room to the actual named character", content: "@bryn hello", named: true },
  { title: "an unknown public mention leaves the actual synthetic narrator as author", content: "@Gandalf hello", named: false },
] as const;

test.for(MENTIONS)("$title", async (scene) => {
  await using h = await textRoom(["The selected voice answers."], { characters: TAIL_ROSTER.slice(0, 2), group: { output: "narrator", policy: "natural" } });
  const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: scene.content });
  expect(outcome.aborted).toBe(false);
  const assistants = outcome.messages.filter(({ role }) => role === "assistant");
  expect(assistants).toHaveLength(1);
  const group = await h.root.db
    .select()
    .from(characters)
    .where(and(eq(characters.ownerId, h.owner.userId), eq(characters.synthetic, true)))
    .get();
  const expectedAuthor = scene.named ? h.characters[1]?.id : group?.id;
  if (expectedAuthor === undefined) {
    throw new Error("the selected voice has no actual seated or synthetic identity");
  }
  expect(assistants[0]?.characterId).toBe(expectedAuthor);
  expect(
    (await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq)).map(({ role, characterId }) => ({
      role,
      characterId,
    })),
  ).toEqual([
    { role: "user", characterId: null },
    { role: "assistant", characterId: assistants[0]?.characterId },
  ]);
  expect(h.requests.filter(({ method }) => method === "POST")).toHaveLength(1);
});
