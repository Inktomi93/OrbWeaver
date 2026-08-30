// transport/trpc/chat-events-bus — the per-chat live fan the `chat` ROOM tails, plus the all-chats
// firehose. The machinery is `bus-channel`'s (pinned there); what is THIS module's own is the routing key
// (`entry.event.chatId` — a wrong field would fan a private room's canon to another room's subscribers)
// and the firehose LISTENER ISOLATION: the event is already durable when the callback runs, so an
// observer that throws must not take the publisher down with it. The two `seq` arms (a durable numbered
// entry vs the live-only `seq: null` lane) ride through unchanged — the bus carries the cursor, it does
// not invent one.

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, vi } from "vitest";
import type { ChatLiveEvent } from "../../../../packages/server/src/transport/trpc/chat-events-bus.ts";
import { publishChatEvent, subscribeAllChatEvents, subscribeChatEvents } from "../../../../packages/server/src/transport/trpc/chat-events-bus.ts";
import { expect, test } from "../../../support/fixtures.ts";

const CHAT_A = castId<ChatId>("chat_a");
const CHAT_B = castId<ChatId>("chat_b");

function reorderEvent(chatId: ChatId): ChatBusEvent {
  return { type: "messagesReordered", chatId };
}

async function next(stream: AsyncIterable<ChatLiveEvent>): Promise<ChatLiveEvent> {
  for await (const entry of stream) {
    return entry;
  }
  throw new Error("stream ended without yielding");
}

describe("chat-events-bus — the routing key is the event's own chatId", () => {
  test("a chat's entry reaches that chat's room and NEVER another's", async () => {
    const abortA = new AbortController();
    const abortB = new AbortController();
    const streamA = subscribeChatEvents(CHAT_A, abortA.signal);
    const streamB = subscribeChatEvents(CHAT_B, abortB.signal);

    publishChatEvent({ seq: 7, event: reorderEvent(CHAT_A) });
    // POSITIVE CONTROL — B's own chat delivers, so A-only above is the key working, not a dead stream.
    publishChatEvent({ seq: 8, event: reorderEvent(CHAT_B) });

    await expect(next(streamA)).resolves.toStrictEqual({ seq: 7, event: reorderEvent(CHAT_A) });
    await expect(next(streamB)).resolves.toStrictEqual({ seq: 8, event: reorderEvent(CHAT_B) });
    abortA.abort();
    abortB.abort();
  });

  test("the durable cursor rides through verbatim — the bus carries `seq`, it never assigns one", async () => {
    const abort = new AbortController();
    const stream = subscribeChatEvents(CHAT_A, abort.signal);

    publishChatEvent({ seq: 42, event: reorderEvent(CHAT_A) });

    await expect(next(stream)).resolves.toMatchObject({ seq: 42 });
    abort.abort();
  });
});

describe("chat-events-bus — the firehose isolates a faulting observer", () => {
  test("a throwing listener neither breaks the publisher nor starves the next observer", () => {
    const boom = vi.fn(() => {
      throw new Error("observer exploded");
    });
    const quiet = vi.fn();
    const offBoom = subscribeAllChatEvents(boom);
    const offQuiet = subscribeAllChatEvents(quiet);

    // The entry is ALREADY durable at this point: a callback fault cannot roll that back, so `publish`
    // must not propagate it.
    expect(() => {
      publishChatEvent({ seq: 1, event: reorderEvent(CHAT_A) });
    }).not.toThrow();

    expect(boom).toHaveBeenCalledTimes(1);
    expect(quiet).toHaveBeenCalledTimes(1);
    offBoom();
    offQuiet();
  });

  test("the firehose spans every chat, and its unsubscribe stops delivery", () => {
    const seen = vi.fn();
    const off = subscribeAllChatEvents(seen);

    publishChatEvent({ seq: 1, event: reorderEvent(CHAT_A) });
    publishChatEvent({ seq: 2, event: reorderEvent(CHAT_B) });
    off();
    publishChatEvent({ seq: 3, event: reorderEvent(CHAT_A) });

    expect(seen.mock.calls.map(([entry]) => (entry as ChatLiveEvent).seq)).toStrictEqual([1, 2]);
  });
});
