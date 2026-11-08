// Storage is the subject: every event the live chat channel delivers already has its chat_events row, under the
// seq the delivery carries. A publish ahead of the insert hands a resuming client a cursor the log cannot replay.
// @subject packages/server/src/domain/chat/bus.ts
// @subject packages/server/src/domain/chat/substrate/publication.ts

import type { ChatBusEvent } from "@orb/contracts/chat";
import { chatEvents } from "@orb/db";
import { nonEmpty } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { and, eq } from "drizzle-orm";
import { textRoom } from "../scenario-physical.ts";

interface Delivery {
  readonly seq: number | null;
  readonly type: ChatBusEvent["type"];
  /** The log row for the delivered seq, read the moment the live channel hands the event over. */
  readonly logged: Promise<readonly { readonly type: string }[]>;
}

test("a sent turn's live events each arrive after their durable row, under the seq that row holds", async () => {
  await using h = await textRoom(["Hi there"]);
  const deliveries: Delivery[] = [];
  const unsubscribe = h.root.app.liveBuses.chat.subscribeAllChatEvents(({ seq, event }) => {
    if (event.chatId !== h.chatId) {
      return;
    }
    // The listener runs inside the publish, so this read starts before the emitter regains control.
    const logged =
      seq === null
        ? Promise.resolve([])
        : h.root.db
            .select({ type: chatEvents.type })
            .from(chatEvents)
            .where(and(eq(chatEvents.chatId, h.chatId), eq(chatEvents.seq, seq)))
            .execute();
    deliveries.push({ seq, type: event.type, logged });
  });
  try {
    await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "hello" });
    await h.root.settleBackground();
  } finally {
    unsubscribe();
  }

  const observed = await Promise.all(nonEmpty(deliveries).map(async ({ seq, type, logged }) => ({ seq, type, logged: await logged })));
  // The turn's whole lifecycle went through the channel: both commits, its delta and its terminal.
  expect(observed.map(({ type }) => type)).toEqual(expect.arrayContaining(["messageCommitted", "turnStarted", "delta", "turnCompleted"]));
  expect(observed).toEqual(observed.map(({ type }) => ({ seq: expect.any(Number), type, logged: [{ type }] })));
  const seqs = observed.map(({ seq }) => seq ?? 0);
  expect(seqs).toEqual([...new Set(seqs)].toSorted((a, b) => a - b));
});
