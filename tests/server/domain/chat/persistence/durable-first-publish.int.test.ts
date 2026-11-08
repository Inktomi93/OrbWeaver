// Storage is the subject: the live chat channel delivers an event only after its chat_events row commits, under the seq
// that row holds. A publish ahead of the insert hands a resuming client a cursor the log may never hold.
// @subject packages/server/src/domain/chat/bus.ts
// @subject packages/server/src/domain/chat/substrate/publication.ts

import { setImmediate as eventLoopTurn } from "node:timers/promises";
import type { ChatBusEvent } from "@orb/contracts/chat";
import { chatEvents } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { freshHeldDb } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";
import { textRoom } from "../scenario-physical.ts";

// Enough event-loop turns for a publish that skipped its await to reach the listener.
const SETTLE_TURNS = 5;

interface Delivery {
  readonly seq: number | null;
  readonly type: ChatBusEvent["type"];
}

test("an edit's live event waits for its held chat_events insert, then arrives under the seq that row holds", async () => {
  using held = await freshHeldDb();
  await using h = await textRoom([], { server: { db: held.db } });
  const outcome = await h.root.services.chat.commitMessage({ principal: h.owner, chatId: h.chatId, content: "The first line." });
  const [line] = outcome.messages;
  if (line === undefined) {
    throw new Error("the commit returned no message");
  }
  await h.root.settleBackground();
  const deliveries: Delivery[] = [];
  const unsubscribe = h.root.app.liveBuses.chat.subscribeAllChatEvents(({ seq, event }) => {
    if (event.chatId === h.chatId) {
      deliveries.push({ seq, type: event.type });
    }
  });
  try {
    const insert = held.hold(/insert into "chat_events"/u);
    const editing = h.root.services.chat.editMessage({ principal: h.owner, chatId: h.chatId, messageId: line.id, content: "The edited line." });
    await insert.reached;
    for (let turn = 0; turn < SETTLE_TURNS; turn += 1) {
      await eventLoopTurn();
    }
    // Held: the row has not committed, so nothing may have reached the channel.
    expect(deliveries).toEqual([]);

    insert.release();
    await editing;
    const logged = await h.root.db.select({ seq: chatEvents.seq, type: chatEvents.type }).from(chatEvents).where(eq(chatEvents.chatId, h.chatId));
    const edited = logged.filter(({ type }) => type === "messageEdited");
    expect(deliveries).toEqual(edited);
    expect(edited).toEqual([{ seq: expect.any(Number), type: "messageEdited" }]);
  } finally {
    unsubscribe();
  }
});
