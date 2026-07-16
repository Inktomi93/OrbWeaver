// The chat bus emitter + replay ring (chat.md §"the chat bus"; Part III §12 inv #10/#11). Proves the
// DURABLE-FIRST contract against a real libSQL db: `emit` commits the `chat_events` row (the replay source of
// truth) AND pushes to the in-process ring, the per-chat `seq` is monotonic, and the ring read honors the
// `afterSeq` cursor.

import type { Db } from "@orb/db";
import { chatEvents } from "@orb/db";
import { asc, eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { createChatBus } from "../../../../packages/server/src/domain/chat/bus";
import { freshDb } from "../../../support/db";
import { expect, test } from "../../../support/fixtures";
import { makeChatContext, seedChat } from "./_support";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("createChatBus.emit — durable-first + the replay ring", () => {
  test("emit commits a chat_events row (durable) and assigns a monotonic per-chat seq", async () => {
    const chatId = await seedChat(db, "a");
    const bus = createChatBus(makeChatContext(db));

    await bus.emit({ type: "chatUpdated", chatId });
    await bus.emit({ type: "chatDeleted", chatId });

    const rows = await db.select().from(chatEvents).where(eq(chatEvents.chatId, chatId)).orderBy(asc(chatEvents.seq));
    expect(rows.map((r) => r.seq)).toEqual([1, 2]);
    expect(rows.map((r) => r.type)).toEqual(["chatUpdated", "chatDeleted"]);
    // The full room-public event is persisted as the payload (the replay carrier).
    expect(rows[0]?.payload).toEqual({ type: "chatUpdated", chatId });
  });

  test("the per-chat seq is independent across chats", async () => {
    const a = await seedChat(db, "a");
    const b = await seedChat(db, "b");
    const bus = createChatBus(makeChatContext(db));

    await bus.emit({ type: "chatUpdated", chatId: a });
    await bus.emit({ type: "chatUpdated", chatId: b });

    expect(bus.readRing(a).map((e) => e.seq)).toEqual([1]);
    expect(bus.readRing(b).map((e) => e.seq)).toEqual([1]);
  });

  test("readRing returns the in-process tail; afterSeq replays only newer events", async () => {
    const chatId = await seedChat(db, "a");
    const bus = createChatBus(makeChatContext(db));

    await bus.emit({ type: "chatUpdated", chatId });
    await bus.emit({ type: "chatDeleted", chatId });

    expect(bus.readRing(chatId)).toEqual([
      { seq: 1, event: { type: "chatUpdated", chatId } },
      { seq: 2, event: { type: "chatDeleted", chatId } },
    ]);
    // The late-subscriber ramp-up: resume strictly after seq 1.
    expect(bus.readRing(chatId, 1)).toEqual([{ seq: 2, event: { type: "chatDeleted", chatId } }]);
    // An empty ring for an unknown chat is not an error.
    expect(bus.readRing(await seedChat(db, "z"))).toEqual([]);
  });
});
