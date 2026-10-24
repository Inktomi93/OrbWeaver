// @subject packages/server/src/domain/chat/engine/engine.ts
// A native new-slot delta anchors to the sequence its real reply commits after earlier canon.
import type { ChatBusEvent } from "@orb/contracts/chat";
import { expect, test } from "@orb/testkit/node";
import { coreHttpRoom, coreProse } from "./core-physical.ts";

test("native new-slot deltas anchor to the same sequence the real reply commits after earlier canon", async () => {
  await using h = await coreHttpRoom([(): Response => coreProse("earlier"), (): Response => coreProse("newest")]);
  await h.root.services.chat.commitMessage({ principal: h.owner, chatId: h.chatId, content: "An earlier user line." });
  expect((await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId })).aborted).toBe(false);
  const events: ChatBusEvent[] = [];
  using subscription = new DisposableStack();
  subscription.defer(
    h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
      if (event.chatId === h.chatId) {
        events.push(event);
      }
    }),
  );
  const newest = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId });
  expect(newest.aborted).toBe(false);
  const row = newest.messages[0];
  expect(row).toMatchObject({ seq: 3, content: "newest" });
  const anchors = events.flatMap((event) => (event.type === "delta" ? [event.slotSeq] : []));
  expect(anchors.length).toBeGreaterThan(0);
  expect([...new Set(anchors)]).toEqual([row?.seq]);
});
