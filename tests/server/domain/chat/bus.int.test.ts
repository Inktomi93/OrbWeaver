// The chat bus emitter + replay ring (the chat design doc §"the chat bus"; Part III §12 inv #10/#11). Proves the
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
/** A Db whose FIRST `insert` fails — either before the write reaches SQLite (`before-commit`) or after it has
 *  already landed (`after-commit`, the driver/transport dying on the way back). Everything else delegates
 *  untouched, and every later insert is real. The two flavours are the whole point: only one of them leaves a
 *  row behind, and a retry must be safe for both. */
function faultyAppendDb(real: Db, mode: "before-commit" | "after-commit"): Db {
  let inserts = 0;
  return new Proxy(real, {
    get(target, prop, receiver): unknown {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (prop !== "insert" || typeof value !== "function") {
        return value;
      }
      return (...args: unknown[]): unknown => {
        const builder = (value as (...a: unknown[]) => object).apply(target, args);
        inserts += 1;
        return inserts === 1 ? failingBuilder(builder, mode) : builder;
      };
    },
  }) as Db;
}

/** Wrap a drizzle builder so the awaited chain throws — running the real statement first for `after-commit`. */
function failingBuilder(node: object, mode: "before-commit" | "after-commit"): object {
  const boom = new Error("driver died mid-append");
  return new Proxy(node, {
    get(target, prop, receiver): unknown {
      if (prop === "then") {
        return (onFulfilled: unknown, onRejected: ((reason: unknown) => unknown) | undefined): Promise<unknown> => {
          void onFulfilled;
          const ran = mode === "after-commit" ? Promise.resolve(target as PromiseLike<unknown>) : Promise.resolve();
          return ran.then(
            () => (onRejected === undefined ? Promise.reject(boom) : onRejected(boom)),
            () => (onRejected === undefined ? Promise.reject(boom) : onRejected(boom)),
          );
        };
      }
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (typeof value !== "function") {
        return value;
      }
      return (...args: unknown[]): unknown => {
        const next = (value as (...a: unknown[]) => unknown).apply(target, args);
        return typeof next === "object" && next !== null ? failingBuilder(next, mode) : next;
      };
    },
  });
}

/** A Db whose FIRST `batch` RUNS FOR REAL and then reports failure — the `emitAfterClaim` twin of
 *  `faultyAppendDb("after-commit")`, which cannot reach that door (it wraps `insert`, and the claim door's
 *  statements ride `db.batch` unexecuted). This is the only fault shape that can leave a claim-carrying
 *  event's two planes committed while the caller is told nothing landed. */
function afterCommitBatchDb(real: Db): Db {
  let batches = 0;
  return new Proxy(real, {
    get(target, prop, receiver): unknown {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (prop !== "batch" || typeof value !== "function") {
        return value;
      }
      return async (...args: unknown[]): Promise<unknown> => {
        batches += 1;
        const ran = (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
        if (batches !== 1) {
          return await ran;
        }
        await ran;
        throw new Error("driver died after the batch committed");
      };
    },
  }) as Db;
}

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

  test("a TRANSIENT live-chat append failure — one that never committed — is retried and the event survives (#1454)", async () => {
    const chatId = await seedChat(db, "retry");
    // A lost durable event on a LIVE chat is a permanent replay gap — a missing turn terminal, a missed
    // automation trigger, a stranded client — so the transient half of that class must not be reported as a
    // drop and forgotten. This fault dies BEFORE the write, so a replay is the whole recovery.
    const bus = createChatBus(makeChatContext(faultyAppendDb(db, "before-commit")));
    const errorSpy = vi.spyOn(getLog(), "error").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(getLog(), "warn").mockImplementation(() => undefined);

    const emitted = await bus.emit(deltaEvent(chatId));

    expect(emitted).not.toBeNull();
    expect((await db.select().from(chatEvents).where(eq(chatEvents.chatId, chatId))).map((r) => r.type)).toEqual(["delta"]);
    // The ring carries it too — a recovered event is a fanned event.
    expect(bus.readRing(chatId).map((e) => e.event.type)).toEqual(["delta"]);
    // Warned (a live-chat fault happened), never errored (it did not stay lost).
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  test("an append that COMMITS and then reports failure is never duplicated by the retry, and its live fan is RECOVERED (#1537, #1821)", async () => {
    const chatId = await seedChat(db, "retry-dup");
    // The dangerous half of a retry: the row LANDED and the driver/transport died on the way back. Because
    // the whole retry re-uses ONE event id, the second attempt trips the `chat_events` PK instead of writing
    // a second row under a fresh id — the durable log keeps exactly one copy, and durable-first replay
    // therefore delivers the event exactly once. #1821: `committedRowSeq` PROVES that standing row's seq, so
    // `emit` now publishes it on the live fan too — the SAME emission the ordinary success path returns —
    // retiring the earlier "we cannot prove what seq landed" premise that skipped the fan on this branch.
    const bus = createChatBus(makeChatContext(faultyAppendDb(db, "after-commit")));
    const errorSpy = vi.spyOn(getLog(), "error").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(getLog(), "warn").mockImplementation(() => undefined);

    const emitted = await bus.emit(deltaEvent(chatId));

    const rows = await db.select().from(chatEvents).where(eq(chatEvents.chatId, chatId));
    expect(rows.map((r) => r.type)).toEqual(["delta"]);
    // The live fan carries the PROVEN seq — the same shape the REGRESSION GUARD test asserts for the
    // ordinary success path — and the ring is fanned exactly like it.
    const stored = { ...deltaEvent(chatId), memberText: null };
    expect(emitted).toEqual({ seq: 1, event: stored });
    expect(bus.readRing(chatId)).toEqual([{ seq: 1, event: stored }]);
    // Still exactly one ERROR (a driver that lies about a commit is a genuine fault worth flagging even when
    // fully recovered); #1544 changed WHICH claim it makes, #1821 changes whether the fan is skipped.
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  // ── #1544: the terminal drop is reported BY BRANCH, because the two branches are opposite facts ────────
  // #1537 made the whole retry re-use ONE event id, which created a second way to reach the terminal drop:
  // the first attempt COMMITTED and the same-id retry tripped the PK. There the row — and therefore its
  // replay slot — STANDS, and only the live fan was lost, so "its replay slot is permanently missing" was
  // exactly backwards. The branch is decided on GROUND TRUTH (does the row under our id hold OUR event),
  // never on the driver's error code — the same rule the header states for `classifyFailedAppend`, and the
  // reason the second pin below matters: a bare id-existence probe would call it "committed" when the row
  // under that id belongs to a DIFFERENT event.
  const liveFanLostMsg =
    "chat bus: DURABLE APPEND reported failure AFTER committing on a live chat — recovered from ground truth: the row, its replay slot, and the live fan all stand";
  const replayGapMsg = "chat bus: DURABLE APPEND FAILED on a live chat — event dropped, its replay slot is permanently missing";

  test("#1544 the AFTER-COMMIT retry is reported as recovered, naming the seq that was fanned (#1821)", async () => {
    const chatId = await seedChat(db, "drop-msg-committed");
    const bus = createChatBus(makeChatContext(faultyAppendDb(db, "after-commit")));
    const errorSpy = vi.spyOn(getLog(), "error").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(getLog(), "warn").mockImplementation(() => undefined);

    // #1821: no longer null — the proven seq is now published on the live fan.
    await expect(bus.emit(deltaEvent(chatId))).resolves.toMatchObject({ seq: 1 });

    const reported = errorSpy.mock.calls.find((call) => call[1] === liveFanLostMsg);
    expect(reported).toBeDefined();
    // The seq that was ALSO just fanned — the log line and the return value agree.
    expect(reported?.[0]).toMatchObject({ chatId, type: "delta", seq: 1 });
    // The false claim is GONE from this branch (still ERROR, just no longer backwards).
    expect(errorSpy.mock.calls.map((call) => call[1])).not.toContain(replayGapMsg);
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  test("#1544 a genuinely LOST event still reports a permanent replay gap (the row under that id is someone else's)", async () => {
    const chatId = await seedChat(db, "drop-msg-lost");
    // A constant event id: the `chatUpdated` below takes the id first, so the delta's own append can never
    // land — a row EXISTS under that id and it is NOT this event. Ground truth, not id-existence.
    const bus = createChatBus({ ...makeChatContext(db), newEventId: () => castId<ChatEventId>("chat_event_1544_fixed") });
    await bus.emit({ type: "chatUpdated", chatId });
    const errorSpy = vi.spyOn(getLog(), "error").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(getLog(), "warn").mockImplementation(() => undefined);

    await expect(bus.emit(deltaEvent(chatId))).resolves.toBeNull();

    expect(errorSpy.mock.calls.map((call) => call[1])).toContain(replayGapMsg);
    expect(errorSpy.mock.calls.map((call) => call[1])).not.toContain(liveFanLostMsg);
    expect(warnSpy.mock.calls.map((call) => call[1])).not.toContain(liveFanLostMsg);
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

  // ── #1522: `emitAfterClaim` has no retry, and that is the RULING — not a gap ──────────────────────────
  // The row's premise is that a claim-carrying event lost to a transient fault is "terminal for replay". Both
  // halves of that are refuted by the ATOMICITY the door is built on, and these two pins are the receipts.
  // The pin above ("a claimed marker rolls back when the following append fails") is the BEFORE-commit half:
  // neither the claim nor the event lands, so there is nothing to replay and nothing was announced — a retry
  // would only re-do what the CALLER's own retry re-does. This is the AFTER-commit half, the one the row
  // calls terminal: the batch COMMITTED and the driver died reporting it, so the claim is consumed AND the
  // event row stands with its cursor. Only the LIVE FAN is lost, and a reconnect replays it from
  // `chat_events` exactly once — the same recoverable half #1544 names for `emit`.
  test("#1522 an AFTER-COMMIT batch fault leaves the claim consumed AND the event REPLAYABLE — never terminal", async () => {
    const chatId = await seedChat(db, "claim-after-commit");
    const acceptedByUserId = await seedUser(db, castId<Handle>("claim2"));
    await db.insert(chatHandoffResumptions).values({
      chatId,
      acceptedByUserId,
      actorRekeys: [],
      createdAt: FROZEN_AT,
      updatedAt: FROZEN_AT,
    });
    const claim = batchStmt(db.delete(chatHandoffResumptions).where(eq(chatHandoffResumptions.chatId, chatId)));
    const errorSpy = vi.spyOn(getLog(), "error").mockImplementation(() => undefined);
    const bus = createChatBus(makeChatContext(afterCommitBatchDb(db)));

    // The door reports "not published" — honest, because it cannot prove which seq landed.
    await expect(bus.emitAfterClaim({ type: "chatUpdated", chatId }, claim)).resolves.toBeNull();

    // …but BOTH planes committed, in one transaction: the claim was consumed exactly once…
    expect(await db.select().from(chatHandoffResumptions).where(eq(chatHandoffResumptions.chatId, chatId))).toHaveLength(0);
    // …and the event has a durable row with a cursor, which is what a reconnecting subscriber replays.
    const rows = await db.select().from(chatEvents).where(eq(chatEvents.chatId, chatId));
    expect(rows.map((r) => [r.seq, r.type])).toEqual([[1, "chatUpdated"]]);
    // Only the LIVE fan was lost — the ring is empty, and that is the whole cost.
    expect(bus.readRing(chatId)).toEqual([]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  test("#1522 …and a RE-RUN of the same claim statement cannot double-consume (the guard is `changes() > 0`)", async () => {
    const chatId = await seedChat(db, "claim-rerun");
    const acceptedByUserId = await seedUser(db, castId<Handle>("claim3"));
    await db.insert(chatHandoffResumptions).values({
      chatId,
      acceptedByUserId,
      actorRekeys: [],
      createdAt: FROZEN_AT,
      updatedAt: FROZEN_AT,
    });
    const claim = batchStmt(db.delete(chatHandoffResumptions).where(eq(chatHandoffResumptions.chatId, chatId)));
    const bus = createChatBus(makeChatContext(db));

    const first = await bus.emitAfterClaim({ type: "chatUpdated", chatId }, claim);
    // A SECOND call with the SAME claim — the shape a retry would take. The claim now changes zero rows, so
    // the co-statement append is a converged no-op and the door answers `false`: "someone already owned this
    // claim; there is nothing to publish". No second event row, no second consumption.
    const second = await bus.emitAfterClaim({ type: "chatUpdated", chatId }, claim);

    expect(first).toMatchObject({ seq: 1 });
    expect(second).toBe(false);
    expect(await db.select().from(chatEvents).where(eq(chatEvents.chatId, chatId))).toHaveLength(1);
    expect(bus.readRing(chatId)).toHaveLength(1);
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
