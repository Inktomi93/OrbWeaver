// chat.streamMessages — the per-chat SSE subscription (PD-46's stream half; core/Tier-4-Transport.md §5).
// Load-bearing: on RECONNECT (`lastEventId`) it replays the durable `chat_events` rows with
// `seq > lastEventId` (via the member-gated `chat.replayChatEvents`) BEFORE draining live; the membership
// gate WITHHOLDS-not-throws (a NOT_FOUND probe yields nothing and keeps the stream open — the
// draft-tolerant subscribe + the kicked-member cutoff), and the per-yield gate runs on EVERY live event.
// Driven through the real ladder via `createCaller` (authed); the live bus is transport module state.

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ChatService } from "@orb/server/domain/chat";
import { ChatNotFoundError } from "@orb/server/domain/chat";
import { publishChatEvent } from "@orb/server/transport/trpc";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../support/fixtures";
import { caller, makeContext, principal } from "../_support.ts";

const MEMBER = castId<UserId>("user_member");
const CHAT = castId<ChatId>("chat_1");
const BOUNDS = { minSeq: 1, maxSeq: 3 };

const event = (type: "chatUpdated" | "chatDeleted" = "chatUpdated"): ChatBusEvent => ({
  type,
  chatId: CHAT,
});

// Unwrap a yielded subscription value — `tracked()` yields `[id, data, symbol]`; data is at index 1.
function dataOf(yielded: unknown): ChatBusEvent {
  const value = Array.isArray(yielded) ? yielded[1] : yielded;
  return value as ChatBusEvent;
}
function idOf(yielded: unknown): string {
  return (Array.isArray(yielded) ? yielded[0] : "") as string;
}

describe("chat.streamMessages — durable-first resume", () => {
  test("replays durable rows newer than lastEventId, ascending, before going live", async () => {
    const replayChatEvents = vi.fn<ChatService["replayChatEvents"]>(async ({ afterSeq }) => [
      { seq: (afterSeq ?? 0) + 1, event: event("chatDeleted") },
      { seq: (afterSeq ?? 0) + 2, event: event() },
    ]);
    const chatEventBounds = vi.fn<ChatService["chatEventBounds"]>(async () => BOUNDS);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { replayChatEvents, chatEventBounds } },
    });

    const sub = await caller(ctx).chat.streamMessages({ chatId: CHAT, lastEventId: "5" });
    const iterator = sub[Symbol.asyncIterator]();
    const first = await iterator.next();
    const second = await iterator.next();
    await iterator.return?.(undefined);

    // The durable replay ran with the resume cursor, member-gated…
    expect(replayChatEvents).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      afterSeq: 5,
    });
    // …and the missed events replay ASCENDING with their durable seq as the tracked id.
    expect(idOf(first.value)).toBe("6");
    expect(dataOf(first.value).type).toBe("chatDeleted");
    expect(idOf(second.value)).toBe("7");
  });

  test("withhold-not-throw: a NOT_FOUND gate silences yields (pre-start subscribe / kicked member) without tearing down", async () => {
    // The gate flips: not-a-member (event 1) → member (event 2) → kicked (event 3) → member (event 4).
    const verdicts = [false, true, false, true];
    let call = 0;
    const chatEventBounds = vi.fn<ChatService["chatEventBounds"]>(() => {
      const allowed = verdicts[call] ?? true;
      call += 1;
      return allowed ? Promise.resolve(BOUNDS) : Promise.reject(new ChatNotFoundError(CHAT));
    });
    const replayChatEvents = vi.fn<ChatService["replayChatEvents"]>(async () => []);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { replayChatEvents, chatEventBounds } },
    });

    // First subscribe (no lastEventId): no durable replay — live only.
    const sub = await caller(ctx).chat.streamMessages({ chatId: CHAT });
    const iterator = sub[Symbol.asyncIterator]();
    const firstYield = iterator.next();

    // Publish 4 live events; the gate withholds 1 and 3.
    publishChatEvent({ seq: 1, event: event("chatDeleted") });
    publishChatEvent({ seq: 2, event: event() });
    const first = await firstYield;
    publishChatEvent({ seq: 3, event: event("chatDeleted") });
    publishChatEvent({ seq: 4, event: event() });
    const second = await iterator.next();
    await iterator.return?.(undefined);

    // Only the gate-passing events came through (1 and 3 withheld; the stream never errored).
    expect(idOf(first.value)).toBe("2");
    expect(idOf(second.value)).toBe("4");
    expect(replayChatEvents).not.toHaveBeenCalled();
  });
});
