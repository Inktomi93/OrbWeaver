// The chat_events APPEND writer (persistence/events.ts, extracted from bus.ts). Proves against
// a real libSQL db: the correlated-subquery per-chat seq is monotonic and per-chat independent, the full
// room-public payload round-trips, and the durable rows are exactly what `loadChatEventReplay` replays.

import type { Db } from "@orb/db";
import { chatEvents } from "@orb/db";
import { asc, eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { appendChatEvent } from "../../../../../packages/server/src/domain/chat/persistence/events.ts";
import { loadChatEventReplay } from "../../../../../packages/server/src/domain/chat/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeChatContext, seedChat } from "../_support.ts";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("appendChatEvent — the durable chat_events append", () => {
  test("assigns a monotonic per-chat seq and persists the full payload", async () => {
    const ctx = makeChatContext(db);
    const chatId = await seedChat(db, "a");

    const s1 = await appendChatEvent(db, {
      id: ctx.newEventId(),
      chatId,
      event: { type: "chatUpdated", chatId },
      createdAt: ctx.now(),
    });
    const s2 = await appendChatEvent(db, {
      id: ctx.newEventId(),
      chatId,
      event: { type: "chatCreated", chatId },
      createdAt: ctx.now(),
    });

    expect([s1, s2]).toEqual([1, 2]);
    const rows = await db.select().from(chatEvents).where(eq(chatEvents.chatId, chatId)).orderBy(asc(chatEvents.seq));
    expect(rows.map((r) => r.type)).toEqual(["chatUpdated", "chatCreated"]);
    expect(rows[0]?.payload).toEqual({ type: "chatUpdated", chatId });
  });

  test("the seq counters are independent across chats", async () => {
    const ctx = makeChatContext(db);
    const a = await seedChat(db, "a");
    const b = await seedChat(db, "b");

    await appendChatEvent(db, {
      id: ctx.newEventId(),
      chatId: a,
      event: { type: "chatUpdated", chatId: a },
      createdAt: ctx.now(),
    });
    const seqB = await appendChatEvent(db, {
      id: ctx.newEventId(),
      chatId: b,
      event: { type: "chatUpdated", chatId: b },
      createdAt: ctx.now(),
    });

    expect(seqB).toBe(1);
  });

  test("appended rows are exactly what loadChatEventReplay replays (the durable ramp-up path)", async () => {
    const ctx = makeChatContext(db);
    const chatId = await seedChat(db, "a");

    await appendChatEvent(db, {
      id: ctx.newEventId(),
      chatId,
      event: { type: "chatUpdated", chatId },
      createdAt: ctx.now(),
    });
    await appendChatEvent(db, {
      id: ctx.newEventId(),
      chatId,
      event: { type: "chatCreated", chatId },
      createdAt: ctx.now(),
    });

    const replay = await loadChatEventReplay(db, chatId, 1);
    expect(replay).toEqual([{ seq: 2, payload: { type: "chatCreated", chatId } }]);
  });
});
