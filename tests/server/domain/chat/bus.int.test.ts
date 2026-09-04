// The chat bus emitter + replay ring (chat.md §"the chat bus"; Part III §12 inv #10/#11). Proves the
// DURABLE-FIRST contract against a real libSQL db: `emit` commits the `chat_events` row (the replay source of
// truth) AND pushes to the in-process ring, the per-chat `seq` is monotonic, and the ring read honors the
// `afterSeq` cursor.

import type { DurableChatBusEvent } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { chatEvents, chatHandoffResumptions, chats } from "@orb/db";
import { batchMany, batchStmt, isConstraintViolation } from "@orb/db/kit";
import type { ChatEventId, ChatId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { getLog } from "@orb/server/foundation/observability";
import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, vi } from "vitest";
import { createChatBus } from "../../../../packages/server/src/domain/chat/bus.ts";
import { appendChatEvent } from "../../../../packages/server/src/domain/chat/persistence/events.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { FROZEN_AT, makeChatContext, seedChat, seedUser } from "./_support.ts";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("createChatBus.emit — durable-first + the replay ring", () => {
  test("a prepared chatCreated joins room birth and publishes its already-committed cursor without re-appending", async () => {
    const chatId = castId<ChatId>("chat_prepared_birth");
    const bus = createChatBus(makeChatContext(db));
    const prepared = bus.prepareCreation({ type: "chatCreated", chatId });

    await db.batch(batchMany([batchStmt(db.insert(chats).values({ id: chatId })), prepared.statement]));
    expect(bus.readRing(chatId)).toEqual([]);
    expect((await db.select().from(chatEvents).where(eq(chatEvents.chatId, chatId))).map((row) => [row.seq, row.type])).toEqual([[1, "chatCreated"]]);

    expect(prepared.publishCommitted()).toEqual({ seq: 1, event: { type: "chatCreated", chatId } });
    expect(bus.readRing(chatId)).toEqual([{ seq: 1, event: { type: "chatCreated", chatId } }]);
    expect(await db.select().from(chatEvents).where(eq(chatEvents.chatId, chatId))).toHaveLength(1);
  });

  test("emit commits a chat_events row (durable) and assigns a monotonic per-chat seq", async () => {
    const chatId = await seedChat(db, "a");
    const bus = createChatBus(makeChatContext(db));

    await bus.emit({ type: "chatUpdated", chatId });
    await bus.emit({ type: "chatCreated", chatId });

    const rows = await db.select().from(chatEvents).where(eq(chatEvents.chatId, chatId)).orderBy(asc(chatEvents.seq));
    expect(rows.map((r) => r.seq)).toEqual([1, 2]);
    expect(rows.map((r) => r.type)).toEqual(["chatUpdated", "chatCreated"]);
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
    await bus.emit({ type: "chatCreated", chatId });

    expect(bus.readRing(chatId)).toEqual([
      { seq: 1, event: { type: "chatUpdated", chatId } },
      { seq: 2, event: { type: "chatCreated", chatId } },
    ]);
    // The late-subscriber ramp-up: resume strictly after seq 1.
    expect(bus.readRing(chatId, 1)).toEqual([{ seq: 2, event: { type: "chatCreated", chatId } }]);
    // An empty ring for an unknown chat is not an error.
    expect(bus.readRing(await seedChat(db, "z"))).toEqual([]);
  });
});

/** A `delta` for `chatId` — the exact event shape the streaming engine fire-and-forgets per token. */
function deltaEvent(chatId: ChatId): DurableChatBusEvent {
  return { type: "delta", chatId, slotSeq: 1, delta: { chatId, kind: "text", text: ' "' } };
}

// The observed production crash (server.log 12:45:05Z / 12:47:54Z): a chat deleted mid-turn cascade-drops the
// `chats` row, the in-flight turn's NEXT `delta` INSERT trips the `chat_events.chat_id` FK, and because the
// engine emits deltas fire-and-forget (`void deps.emit(…)`) the rejection was UNHANDLED — the node process
// exited, taking every user's server with it. `emit` is therefore TOTAL (bus.ts FLAG[emit-is-total]).
describe("createChatBus.emit — a failed durable append never rejects (the process-kill floor)", () => {
  test("the raw append into a DELETED chat is a FOREIGN-KEY violation — the exact crash `emit` must absorb", async () => {
    const chatId = await seedChat(db, "a");
    await db.delete(chats).where(eq(chats.id, chatId));

    const err = await appendChatEvent(db, {
      id: castId<ChatEventId>("chat_event_raw"),
      chatId,
      event: deltaEvent(chatId),
      createdAt: FROZEN_AT,
    }).catch((e: unknown) => e);

    expect(isConstraintViolation(err)?.kind).toBe("foreign-key");
  });

  test("a delta emitted into a deleted chat resolves null, writes nothing, does not push the ring, and is NOT an error", async () => {
    const chatId = await seedChat(db, "a");
    const bus = createChatBus(makeChatContext(db));
    await bus.emit({ type: "chatUpdated", chatId });
    await db.delete(chats).where(eq(chats.id, chatId));
    const errorSpy = vi.spyOn(getLog(), "error").mockImplementation(() => undefined);
    const debugSpy = vi.spyOn(getLog(), "debug").mockImplementation(() => undefined);

    await expect(bus.emit(deltaEvent(chatId))).resolves.toBeNull();

    // Dropped, not written; the ring still holds only the pre-delete event (no phantom cursor for the fan).
    expect(await db.select().from(chatEvents).where(eq(chatEvents.chatId, chatId))).toEqual([]);
    expect(bus.readRing(chatId).map((e) => e.event.type)).toEqual(["chatUpdated"]);
    // The aggregate is gone: an EXPECTED race — debug, never the error channel that pages someone.
    expect(errorSpy).not.toHaveBeenCalled();
    expect(debugSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
    debugSpy.mockRestore();
  });

  test("a durable append that fails while the chat is ALIVE is a real fault — logged at ERROR, still not thrown", async () => {
    const chatId = await seedChat(db, "a");
    // A constant event id ⇒ the second append is a PRIMARY-KEY collision on a live chat: a genuine db fault,
    // not the delete race, so it must surface loudly instead of being classified as benign.
    const bus = createChatBus({ ...makeChatContext(db), newEventId: () => castId<ChatEventId>("chat_event_fixed") });
    await bus.emit({ type: "chatUpdated", chatId });
    const errorSpy = vi.spyOn(getLog(), "error").mockImplementation(() => undefined);
    const debugSpy = vi.spyOn(getLog(), "debug").mockImplementation(() => undefined);

    await expect(bus.emit(deltaEvent(chatId))).resolves.toBeNull();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(debugSpy).not.toHaveBeenCalled();
    expect((await db.select().from(chatEvents).where(eq(chatEvents.chatId, chatId))).map((r) => r.type)).toEqual(["chatUpdated"]);
    errorSpy.mockRestore();
    debugSpy.mockRestore();
  });

  test("a TRANSIENT live-chat append failure is retried and the event survives (#1454)", async () => {
    const chatId = await seedChat(db, "retry");
    // The first append collides on the PK; the retry mints a fresh id and lands. A lost durable event on a
    // LIVE chat is a permanent replay gap — a missing turn terminal, a missed automation trigger, a stranded
    // client — so the transient half of that class must not be reported as a drop and forgotten.
    const taken = castId<ChatEventId>("chat_event_taken");
    let mints = 0;
    const newEventId = (): ChatEventId => {
      mints += 1;
      return mints === 1 ? taken : castId<ChatEventId>(`chat_event_fresh_${mints}`);
    };
    const bus = createChatBus({ ...makeChatContext(db), newEventId });
    const errorSpy = vi.spyOn(getLog(), "error").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(getLog(), "warn").mockImplementation(() => undefined);

    // Occupy the id the first attempt will mint.
    await appendChatEvent(db, { id: taken, chatId, event: { type: "chatUpdated", chatId }, createdAt: FROZEN_AT });

    const emitted = await bus.emit(deltaEvent(chatId));

    expect(emitted).not.toBeNull();
    expect((await db.select().from(chatEvents).where(eq(chatEvents.chatId, chatId))).map((r) => r.type)).toEqual(["chatUpdated", "delta"]);
    // The ring carries it too — a recovered event is a fanned event.
    expect(bus.readRing(chatId).map((e) => e.event.type)).toEqual(["delta"]);
    // Warned (a live-chat fault happened), never errored (it did not stay lost).
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  test("a DELETED chat is still terminal on the first look — never retried (#1454)", async () => {
    const chatId = await seedChat(db, "gone-noretry");
    const bus = createChatBus(makeChatContext(db));
    await db.delete(chats).where(eq(chats.id, chatId));
    const debugSpy = vi.spyOn(getLog(), "debug").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(getLog(), "warn").mockImplementation(() => undefined);

    await expect(bus.emit(deltaEvent(chatId))).resolves.toBeNull();

    // Exactly ONE classification: a cascade-dropped row does not come back, so a retry would be pure noise
    // on the hot delta path.
    expect(debugSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
    debugSpy.mockRestore();
    warnSpy.mockRestore();
  });

  test("a claimed marker rolls back when the following append fails", async () => {
    const chatId = await seedChat(db, "atomic-fault");
    const fixedEventId = castId<ChatEventId>("chat_event_fixed_claim");
    const bus = createChatBus({ ...makeChatContext(db), newEventId: () => fixedEventId });
    const errorSpy = vi.spyOn(getLog(), "error").mockImplementation(() => undefined);
    await bus.emit({ type: "chatUpdated", chatId });
    const acceptedByUserId = await seedUser(db, castId<Handle>("claim"));
    await db.insert(chatHandoffResumptions).values({
      chatId,
      acceptedByUserId,
      actorRekeys: [],
      createdAt: FROZEN_AT,
      updatedAt: FROZEN_AT,
    });
    const claim = batchStmt(db.delete(chatHandoffResumptions).where(eq(chatHandoffResumptions.chatId, chatId)));

    await expect(bus.emitAfterClaim({ type: "chatUpdated", chatId }, claim)).resolves.toBeNull();

    expect(await db.select().from(chatEvents).where(eq(chatEvents.chatId, chatId))).toHaveLength(1);
    expect(await db.select().from(chatHandoffResumptions).where(eq(chatHandoffResumptions.chatId, chatId))).toHaveLength(1);
    expect(bus.readRing(chatId)).toHaveLength(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  test("REGRESSION GUARD: a normal emit into a live chat still writes durably, returns what it logged, and fans the ring", async () => {
    const chatId = await seedChat(db, "a");
    const bus = createChatBus(makeChatContext(db));

    const logged = await bus.emit(deltaEvent(chatId));

    // `emit` returns the durable cursor AND the event AS STORED — the §3.6-stamped copy, so the composition
    // root fans byte-for-byte what a reconnect will replay. A clean tick stamps `memberText: null` ("identical
    // to `delta.text`"), which is what keeps the durable log from carrying a second copy of every token.
    const stored = { ...deltaEvent(chatId), memberText: null };
    expect(logged).toEqual({ seq: 1, event: stored });
    const rows = await db.select().from(chatEvents).where(eq(chatEvents.chatId, chatId));
    expect(rows.map((r) => r.type)).toEqual(["delta"]);
    expect(rows[0]?.payload).toEqual(stored);
    expect(bus.readRing(chatId)).toEqual([{ seq: 1, event: stored }]);
  });
});
