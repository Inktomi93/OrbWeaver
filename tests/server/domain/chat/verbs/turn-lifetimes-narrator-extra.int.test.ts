// @subject packages/server/src/domain/chat/verbs/turn.ts
import type { ChatBusEvent } from "@orb/contracts/chat";
import { SHIPPED_PROMPT_CACHE } from "@orb/contracts/inference";
import { characters, chats, messages } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { and, eq, sql } from "drizzle-orm";
import { textRoom } from "../scenario-physical.ts";
import { TAIL_ROSTER } from "./turn-lifetimes-roster.ts";

const SCENES = [
  { title: "an unavailable Utility route cannot degrade or warn a stored narrator and Smart room", utility: false, turns: 1 },
  { title: "a stored narrator and Smart auto-chain commits three real narrator slots without invoking available Utility", utility: true, turns: 3 },
] as const;

test.for(SCENES)("$title", async (scene) => {
  await using h = await textRoom(
    Array.from({ length: scene.turns }, (_, index) => `Narrated beat ${index + 1}.`),
    {
      characters: TAIL_ROSTER.slice(0, 2),
      group: { output: "narrator", policy: "natural", autoMode: scene.turns > 1, autoModeMaxTurns: 2, autoModeDelayMs: 0 },
    },
  );
  await h.root.db
    .update(chats)
    .set({ metadata: sql`json_set(${chats.metadata}, '$.group.policy', 'smart', '$.group.smartPicker', 'utility')` })
    .where(eq(chats.id, h.chatId));
  const principal = h.owner;
  const bindings = await h.root.services.connection.listBindings({ principal });
  const connectionId = bindings.find(({ task }) => task === "chat")?.binding?.connectionId;
  if (connectionId === undefined || connectionId === null) {
    throw new Error("the real narrator has no chat binding");
  }
  await h.root.services.connection.update({ principal, connectionId, patch: { promptCache: { ...SHIPPED_PROMPT_CACHE, enabled: false } } });
  await h.root.services.connection.setBinding({ principal, task: "summarize", connectionId: scene.utility ? connectionId : null });
  expect((await h.root.services.connection.listBindings({ principal })).find(({ task }) => task === "summarize")?.binding?.connectionId).toBe(
    scene.utility ? connectionId : null,
  );
  expect(await h.root.services.chat.getGroupConfigForChat({ principal, chatId: h.chatId })).toMatchObject({ output: "narrator", policy: "natural" });
  const events: ChatBusEvent[] = [];
  using subscriptions = new DisposableStack();
  subscriptions.defer(
    h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
      if (event.chatId === h.chatId) {
        events.push(event);
      }
    }),
  );
  const outcome = await h.root.services.chat.send({ principal, chatId: h.chatId, content: "Narrate the next whole-room beat." });
  expect(outcome.aborted).toBe(false);
  await h.root.settleBackground();
  const group = await h.root.db
    .select()
    .from(characters)
    .where(and(eq(characters.ownerId, principal.userId), eq(characters.synthetic, true)))
    .get();
  if (group === undefined) {
    throw new Error("the narrator did not mint its real group identity");
  }
  const canon = await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq);
  expect(canon.map(({ role }) => role)).toEqual(["user", ...Array.from({ length: scene.turns }, () => "assistant")]);
  expect(canon.filter(({ role }) => role === "assistant").map(({ characterId }) => characterId)).toEqual(Array.from({ length: scene.turns }, () => group.id));
  expect(h.requests.filter(({ method }) => method === "POST").map(({ url }) => new URL(url).pathname)).toEqual(
    Array.from({ length: scene.turns }, () => "/v1/chat/completions"),
  );
  expect(events.filter(({ type }) => type === "warning")).toEqual([]);
});
