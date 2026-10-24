// Speakerless manual generation commits nothing: every stored canon row is byte-for-byte unchanged and
// the accepted slot closes without a turn starting.
// @subject packages/server/src/domain/chat/verbs/turn.ts

import { createCharacterSchema } from "@orb/contracts/character";
import type { ChatBusEvent } from "@orb/contracts/chat";
import { messages } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { eq } from "drizzle-orm";
import { textRoom } from "../scenario-physical.ts";
import { priorExchange } from "../verbs/turn-generate-policy.fixtures.ts";

test("speakerless manual generation commits nothing and closes its accepted slot without starting a turn", async () => {
  await using h = await textRoom([], {
    characters: [
      createCharacterSchema.parse({ handle: "aria", name: "Aria", description: "A bold knight." }),
      createCharacterSchema.parse({ handle: "bryn", name: "Bryn", description: "An observant mage." }),
    ],
    group: { output: "per-speaker", policy: "manual" },
    transcript: priorExchange("aria", "The prior answer."),
  });
  const before = await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq);
  const events: ChatBusEvent[] = [];
  const unsubscribe = h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => events.push(event));
  try {
    const outcome = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId });
    expect(outcome).toEqual({ messages: [], aborted: false, abortReason: undefined });
    expect(await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq)).toEqual(before);
    expect(events.map(({ type }) => type)).not.toContain("turnStarted");
    expect(events.at(-1)).toMatchObject({ type: "turnCompleted", intent: "generate", messageId: null });
    expect(h.requests.filter((request) => new URL(request.url).pathname.endsWith("/chat/completions"))).toEqual([]);
  } finally {
    unsubscribe();
  }
});
