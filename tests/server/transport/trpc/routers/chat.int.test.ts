// chat.streamMessages — the DURABLE-REPLAY half, proven end-to-end against a REAL libSQL db (the #1
// first-turn-race SERVER pin). The client seeds `lastEventId:"0"` for a just-created chat so the server
// replays the head deltas that raced past the fresh SSE attach (use-chat-bus.ts). The client CT
// (message-list-surface.ct.tsx replay-seed case) pins the CLIENT path; this pins the SERVER path — the
// one that silently re-breaks: a fresh chat whose head deltas were written through the REAL durable-first
// bus, resumed via the REAL `chatEventStream` generator with `lastEventId:"0"`, must yield those delta
// events in seq order as `tracked()` envelopes BEFORE draining live.
//
// Unlike the sibling `chat.test.ts` (fake `vi.fn` services, no db), this drives the generator over the
// REAL reads-slice (`createRead(ctx, deps).replayChatEvents`/`chatEventBounds` — the only two the
// generator calls) backed by a real db and the REAL domain bus (`createChatBus(...).emit`, durable-first
// write to `chat_events`). It closes the gap the mock-based test structurally cannot: that the resume
// path returns real persisted DELTAS (the token-carrying member), not just that the wiring is shaped right.

import type { CharacterCard } from "@orb/contracts/character";
import type { ChatBusEvent, JoinHistoryVisibility } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { characters, chatParticipants } from "@orb/db";
import type { CharacterId, ChatId, MessageId, UserId } from "@orb/kit/ids";
import { publishChatEvent } from "@orb/server/transport/trpc";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, vi } from "vitest";
import { createChatBus } from "../../../../../packages/server/src/domain/chat/bus";
import { loadMessageView } from "../../../../../packages/server/src/domain/chat/persistence/queries";
import { loadRoster } from "../../../../../packages/server/src/domain/chat/persistence/roster";
import { createRead } from "../../../../../packages/server/src/domain/chat/verbs/read";
import { createRoster } from "../../../../../packages/server/src/domain/chat/verbs/roster";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { makeChatContext, seedCharacter, seedChat, seedMessage, seedParticipant, seedUser } from "../../../domain/chat/_support";
import { caller, principal as callerPrincipal, makeContext } from "../_support";

/** Owner-scoped `getCard` fake mirroring the real one (D28) — `addCharacterToChat` resolves the card only
 *  for its OWNER (a foreign character reads as missing, leak-free). */
function ownedCard(rosterDb: Db): (params: { readonly ownerId: UserId; readonly characterId: CharacterId }) => Promise<CharacterCard | null> {
  return async ({ ownerId, characterId }) => {
    const [row] = await rosterDb.select().from(characters).where(eq(characters.id, characterId));
    // FABRICATION-OK: minimal CharacterCard double — the roster read only needs name + avatarAssetId.
    return row !== undefined && row.ownerId === ownerId ? ({ name: row.name, avatarAssetId: null } as unknown as CharacterCard) : null;
  };
}

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

// The reads-slice deps — `replayChatEvents`/`chatEventBounds` (the only verbs the stream generator calls)
// touch only `ctx.db` + `requireParticipant`, never these resolvers; minimal stubs satisfy the type.
function readDeps(): Parameters<typeof createRead>[1] {
  return {
    loadParticipantViews: () => Promise.resolve([]),
    resolveConnection: () => Promise.reject(new Error("unused: the stream generator never previews a connection")),
    checkSendAvailability: () => Promise.reject(new Error("unused: the stream generator never checks availability")),
    resolveForeignInputs: () => Promise.reject(new Error("unused: the stream generator never resolves foreign inputs")),
  };
}

/** Unwrap a `tracked()` yield — `[id, data, symbol]`; the resume cursor is index 0, the event index 1. */
function idOf(yielded: unknown): string {
  return (Array.isArray(yielded) ? yielded[0] : "") as string;
}
function dataOf(yielded: unknown): ChatBusEvent {
  return (Array.isArray(yielded) ? yielded[1] : yielded) as ChatBusEvent;
}

/** `bus.emit` is TOTAL — it resolves `null` when the durable append is dropped (the aggregate is gone).
 *  Every emit in this fixture targets a LIVE chat, so a `null` means the FIXTURE is broken, not the code
 *  under test: fail loudly rather than publishing a fabricated cursor (which would silently mis-key the
 *  live fan and make a clamp assertion meaningless). */
async function emitSeq(bus: ReturnType<typeof createChatBus>, event: ChatBusEvent): Promise<number> {
  const seq = await bus.emit(event);
  if (seq === null) {
    throw new Error("fixture: bus.emit dropped the event — the chat row is missing");
  }
  return seq;
}

describe("chat.streamMessages — durable delta replay over a real reads-slice (the #1 server pin)", () => {
  test("a fresh chat's head deltas persisted through the real bus replay via lastEventId '0', in seq order", async () => {
    // Seed a chat whose caller is the host member (so the per-yield membership gate passes).
    const host = await seedUser(db, "host");
    const chatId: ChatId = await seedChat(db, "room");
    await seedParticipant(db, { chatId, key: "room_h", userId: host, role: "host" });

    // Write the HEAD of a turn through the REAL domain bus (durable-first: chat_events INSERT commits
    // before the ring push) — turnStarted + two text deltas, exactly the shape that races the attach.
    const ctx = makeChatContext(db);
    const bus = createChatBus({ db, now: ctx.now, newEventId: ctx.newEventId });
    await bus.emit({
      type: "turnStarted",
      chatId,
      intent: "send",
      api: "chat-completions",
      source: "openrouter",
      model: "test-model",
      speakerCharacterId: null,
      targetMessageId: null,
    });
    // The fresh room's first reply lands at `messages.seq` 1 — the slot these tokens fill (the D16 anchor).
    await bus.emit({ type: "delta", chatId, slotSeq: 1, delta: { chatId, kind: "text", text: "Hello " } });
    await bus.emit({ type: "delta", chatId, slotSeq: 1, delta: { chatId, kind: "text", text: "world" } });

    // Drive the REAL streamMessages generator with the REAL reads-slice behind the fake `Services` bundle
    // (the two verbs the generator calls), through the full middleware ladder.
    const read = createRead(ctx, readDeps());
    const txCtx = makeContext({
      auth: callerPrincipal("user", { userId: host }),
      services: {
        chat: {
          replayChatEvents: read.replayChatEvents,
          chatEventBounds: read.chatEventBounds,
        },
      },
    });

    const sub = await caller(txCtx).chat.streamMessages({ chatId, lastEventId: "0" });
    const iterator = sub[Symbol.asyncIterator]();
    // PD-134: `chatOpened` synthesizes first at attach (id = the resume cursor "0", non-advancing); no
    // `historyTruncated` (cursor 0 is not < minSeq(1) - 1). Then the durable head replays.
    const opened = await iterator.next();
    const a = await iterator.next();
    const b = await iterator.next();
    const c = await iterator.next();
    // Stop before the generator blocks on the (empty) live tail.
    await iterator.return?.(undefined);

    expect(dataOf(opened.value).type).toBe("chatOpened");
    expect(idOf(opened.value)).toBe("0");
    // The durable head replays ASCENDING with each durable seq as the tracked resume id.
    expect([idOf(a.value), idOf(b.value), idOf(c.value)]).toEqual(["1", "2", "3"]);
    expect([dataOf(a.value).type, dataOf(b.value).type, dataOf(c.value).type]).toEqual(["turnStarted", "delta", "delta"]);

    // The token-carrying delta payloads survived the JSON round-trip through the durable column.
    const deltaB = dataOf(b.value);
    const deltaC = dataOf(c.value);
    expect(deltaB.type === "delta" ? deltaB.delta : null).toEqual({
      chatId,
      kind: "text",
      text: "Hello ",
    });
    expect(deltaC.type === "delta" ? deltaC.delta : null).toEqual({
      chatId,
      kind: "text",
      text: "world",
    });
  });

  test("an existing chat with NO resume cursor never replays the durable head (only a live attach)", async () => {
    // The complement: a cursor-less subscribe (a direct chat-open, not the draft→committed seed) must NOT
    // replay the durable head — that would re-animate a finished turn as a ghost. With head deltas already
    // durable, only a LIVE event comes through, and `replayChatEvents` is never consulted.
    const host = await seedUser(db, "host");
    const chatId: ChatId = await seedChat(db, "room2");
    await seedParticipant(db, { chatId, key: "room2_h", userId: host, role: "host" });

    const ctx = makeChatContext(db);
    const bus = createChatBus({ db, now: ctx.now, newEventId: ctx.newEventId });
    await bus.emit({
      type: "delta",
      chatId,
      slotSeq: 1,
      delta: { chatId, kind: "text", text: "durable-head" },
    });

    const read = createRead(ctx, readDeps());
    const replaySpy = vi.fn(read.replayChatEvents);
    const txCtx = makeContext({
      auth: callerPrincipal("user", { userId: host }),
      services: { chat: { replayChatEvents: replaySpy, chatEventBounds: read.chatEventBounds } },
    });

    const sub = await caller(txCtx).chat.streamMessages({ chatId });
    const iterator = sub[Symbol.asyncIterator]();
    // The generator subscribes live, then synthesizes `chatOpened` at attach (PD-134; id "0", the
    // null-cursor floor) BEFORE entering the live tail — no replay (no cursor).
    const opened = await iterator.next();
    expect(dataOf(opened.value).type).toBe("chatOpened");
    expect(idOf(opened.value)).toBe("0");

    const firstYield = iterator.next(); // resumes into the live loop
    // A live event published AFTER the subscribe attaches (seq past the durable head) is the only thing
    // that flows — its durable seq is 2 (the emit above was seq 1). Publish through the transport bus.
    publishChatEvent({
      seq: 2,
      event: { type: "delta", chatId, slotSeq: 1, delta: { chatId, kind: "text", text: "live" } },
    });
    const first = await firstYield;
    await iterator.return?.(undefined);

    expect(idOf(first.value)).toBe("2");
    expect(dataOf(first.value).type).toBe("delta");
    // The durable head was NEVER replayed — a cursor-less open only tails live.
    expect(replaySpy).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// D16 join-history clamp — the LIVE half, end-to-end over REAL `chat_participants` rows. The durable replay
// half was already clamped inside the domain; the per-yield live loop fanned the in-process bus out
// UNFILTERED, and that bus is keyed by chatId ONLY — so every subscriber of a room saw every event. The
// exploitable slice is a POST-join emit carrying a PRE-join `MessageView` (a host editing / re-voicing an
// old slot while a clamped member is connected): a HIGH durable seq with a LOW view seq, which a cursor
// floor cannot catch. Here the floor is not stubbed — it is resolved from the subscriber's own participant
// row by the same `requireParticipant` chokepoint every read path uses.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
describe("chat.streamMessages — the D16 join-history clamp on the LIVE half (real participant rows)", () => {
  /** A room with a pre-join row (seq 1) and a post-join row (seq 5), a host, and one human joiner whose
   *  `joinSeq` is stamped at head 5. `visibility` is ALWAYS written explicitly — these are the clamp's own
   *  tests, so the host-RESTRICTED `from-join` policy is spelled out rather than inherited from the column
   *  default (which is `full`: an unrestricted invitee sees everything). */
  async function seedClampedRoom(
    key: string,
    visibility: JoinHistoryVisibility = "from-join",
  ): Promise<{ host: UserId; joiner: UserId; chatId: ChatId; preId: MessageId; postId: MessageId }> {
    const host = await seedUser(db, `${key}_host`);
    const joiner = await seedUser(db, `${key}_joiner`);
    const chatId: ChatId = await seedChat(db, key);
    await seedParticipant(db, { chatId, key: `${key}_h`, userId: host, role: "host" });
    const pre = await seedMessage(db, chatId, 1, { role: "assistant", content: "pre-join greeting" });
    const post = await seedMessage(db, chatId, 5, { role: "assistant", content: "post-join reply" });
    await seedParticipant(db, {
      chatId,
      key: `${key}_m`,
      userId: joiner,
      role: "member",
      joinSeq: 5,
      joinHistoryVisibility: visibility,
    });
    return { host, joiner, chatId, preId: pre.messageId, postId: post.messageId };
  }

  /** Subscribe as `userId` over the REAL reads-slice and drain the `chatOpened` attach synthesis, leaving the
   *  generator parked in the live loop. */
  async function attach(read: ReturnType<typeof createRead>, userId: UserId, chatId: ChatId): Promise<AsyncIterator<unknown>> {
    const txCtx = makeContext({
      auth: callerPrincipal("user", { userId }),
      services: { chat: { replayChatEvents: read.replayChatEvents, chatEventBounds: read.chatEventBounds } },
    });
    const sub = await caller(txCtx).chat.streamMessages({ chatId });
    const iterator = sub[Symbol.asyncIterator]();
    expect(dataOf((await iterator.next()).value).type).toBe("chatOpened");
    return iterator;
  }

  test("a from-join member does NOT receive a live edit of a PRE-join row; the HOST on the same event does", async () => {
    const { host, joiner, chatId, preId, postId } = await seedClampedRoom("clamped");
    const ctx = makeChatContext(db);
    const bus = createChatBus({ db, now: ctx.now, newEventId: ctx.newEventId });
    const preView = await loadMessageView(db, preId);
    const postView = await loadMessageView(db, postId);
    if (preView === undefined || postView === undefined) {
      throw new Error("the seeded slots must resolve to MessageViews — otherwise the clamp has nothing to decide on");
    }

    const read = createRead(ctx, readDeps());
    const hostIt = await attach(read, host, chatId);
    const memberIt = await attach(read, joiner, chatId);
    const hostPending = hostIt.next();
    const memberPending = memberIt.next();

    // ONE emit, fanned to BOTH subscribers — durable-first, exactly as the composition root's `emitChatEvent`
    // does it (the durable seq the log assigned IS the live cursor). The host edits the PRE-join row.
    const leak: ChatBusEvent = { type: "messageEdited", chatId, messageId: preId, view: preView };
    const leakSeq = await emitSeq(bus, leak);
    publishChatEvent({ seq: leakSeq, event: leak });
    // Then a row the member is legitimately entitled to, so their pull has something to resolve on.
    const allowed: ChatBusEvent = { type: "messageEdited", chatId, messageId: postId, view: postView };
    const allowedSeq = await emitSeq(bus, allowed);
    publishChatEvent({ seq: allowedSeq, event: allowed });

    const hostGot = await hostPending;
    const memberGot = await memberPending;
    await hostIt.return?.(undefined);
    await memberIt.return?.(undefined);

    // The host — unclamped (a born-here seat, joinSeq 0) — receives the pre-join edit with its content.
    expect(idOf(hostGot.value)).toBe(String(leakSeq));
    expect(JSON.stringify(hostGot.value)).toContain("pre-join greeting");
    // The clamped member skipped it entirely: their FIRST live yield is the post-join row at its own durable
    // seq (the withheld row left a gap; the cursor was never advanced to it, so nothing re-offers or stalls).
    expect(idOf(memberGot.value)).toBe(String(allowedSeq));
    expect(JSON.stringify(memberGot.value)).not.toContain("pre-join greeting");
    expect(JSON.stringify(memberGot.value)).toContain("post-join reply");
  });

  test("a `full` member receives that same pre-join-view event live — the policy's other arm, on the live path too", async () => {
    const { joiner, chatId, preId } = await seedClampedRoom("unclamped", "full");
    const ctx = makeChatContext(db);
    const bus = createChatBus({ db, now: ctx.now, newEventId: ctx.newEventId });
    const preView = await loadMessageView(db, preId);
    if (preView === undefined) {
      throw new Error("the seeded slot must resolve to a MessageView");
    }

    const memberIt = await attach(createRead(ctx, readDeps()), joiner, chatId);
    const pending = memberIt.next();
    const event: ChatBusEvent = { type: "messageEdited", chatId, messageId: preId, view: preView };
    const seq = await emitSeq(bus, event);
    publishChatEvent({ seq, event });
    const got = await pending;
    await memberIt.return?.(undefined);

    // Same room shape, same event, `joinSeq` still 5 — only the policy differs, so the floor resolves to 0.
    expect(idOf(got.value)).toBe(String(seq));
    expect(JSON.stringify(got.value)).toContain("pre-join greeting");
  });

  test("token STREAMING is restored for a from-join member — post-join deltas flow live, pre-join deltas do not, and the durable replay agrees row-for-row", async () => {
    // The `slotSeq` payoff, end-to-end over a REAL `chat_participants` row carrying the host-set
    // `from-join` restriction: a clamped member must stream the tokens of a turn writing into a slot at/above their
    // floor (they used to get nothing until commit), while a host swiping/continuing a PRE-join slot must
    // still stream them nothing. Both events go through the REAL durable-first bus and are ALSO fanned live
    // under the same seq, so the second half of this test re-reads them through `replayChatEvents` and pins
    // that the two halves return the identical verdict — visibility must not depend on being connected.
    const { joiner, chatId } = await seedClampedRoom("streaming");
    const ctx = makeChatContext(db);
    const bus = createChatBus({ db, now: ctx.now, newEventId: ctx.newEventId });
    const read = createRead(ctx, readDeps());

    const memberIt = await attach(read, joiner, chatId);
    const pending = memberIt.next();
    // slot 1 = the PRE-join greeting the host is re-voicing; slot 5 = the post-join reply being generated.
    const leak: ChatBusEvent = { type: "delta", chatId, slotSeq: 1, delta: { chatId, kind: "text", text: "pre-join tokens" } };
    const leakSeq = await emitSeq(bus, leak);
    publishChatEvent({ seq: leakSeq, event: leak });
    const allowed: ChatBusEvent = { type: "delta", chatId, slotSeq: 5, delta: { chatId, kind: "text", text: "post-join tokens" } };
    const allowedSeq = await emitSeq(bus, allowed);
    publishChatEvent({ seq: allowedSeq, event: allowed });

    const got = await pending;
    await memberIt.return?.(undefined);

    // LIVE: the pre-join stream was dropped whole (no cursor advance — the next yield keeps its own seq), and
    // the post-join stream arrived. Before `slotSeq`, BOTH were withheld and this member never saw a token.
    expect(idOf(got.value)).toBe(String(allowedSeq));
    expect(dataOf(got.value).type).toBe("delta");
    expect(JSON.stringify(got.value)).not.toContain("pre-join tokens");
    expect(JSON.stringify(got.value)).toContain("post-join tokens");

    // REPLAY: the same two durable rows, same caller, same verdict — one row delivered at its own seq, the
    // other absent (a gap, never a renumber). This is the live/replay coherence the clamp is built on.
    const replayed = await read.replayChatEvents({ principal: callerPrincipal("user", { userId: joiner }), chatId, afterSeq: 0 });
    expect(replayed.map((e) => e.seq)).toEqual([allowedSeq]);
    expect(JSON.stringify(replayed)).not.toContain("pre-join tokens");
    expect(JSON.stringify(replayed)).toContain("post-join tokens");
  });
});

describe("chat.removeCharacterFromChat — the symmetric drop, driven through the real router + roster service", () => {
  test("the host removes a present character seat — leftSeq-stamped out of the roster read-model", async () => {
    const host = await seedUser(db, "host");
    const characterId = await seedCharacter(db, host, "aria");
    const chatId: ChatId = await seedChat(db, "room");
    await seedParticipant(db, { chatId, key: "room_h", userId: host, role: "host" });

    const roster = createRoster(makeChatContext(db, { getCard: ownedCard(db) }), { emit: () => Promise.resolve() });
    const hostCtx = makeContext({
      auth: callerPrincipal("user", { userId: host }),
      services: { chat: { addCharacterToChat: roster.addCharacterToChat, removeCharacterFromChat: roster.removeCharacterFromChat } },
    });

    await caller(hostCtx).chat.addCharacterToChat({ chatId, characterId });
    // Present roster (leftSeq IS NULL) carries the seat.
    expect((await loadRoster(db, chatId)).some((p) => p.characterId === characterId)).toBe(true);

    await caller(hostCtx).chat.removeCharacterFromChat({ chatId, characterId });

    // Gone from the present read-model; the row survives leftSeq-stamped (reversible via a re-add).
    expect((await loadRoster(db, chatId)).some((p) => p.characterId === characterId)).toBe(false);
    const [row] = await db
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.characterId, characterId)));
    expect(row?.leftSeq).not.toBeNull();
  });

  test("a plain member caller is rejected — the seat stays present, unstamped", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const characterId = await seedCharacter(db, host, "aria");
    const chatId: ChatId = await seedChat(db, "room");
    await seedParticipant(db, { chatId, key: "room_h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "room_m", userId: member, role: "member" });

    const roster = createRoster(makeChatContext(db, { getCard: ownedCard(db) }), { emit: () => Promise.resolve() });
    const hostCtx = makeContext({
      auth: callerPrincipal("user", { userId: host }),
      services: { chat: { addCharacterToChat: roster.addCharacterToChat, removeCharacterFromChat: roster.removeCharacterFromChat } },
    });
    const memberCtx = makeContext({
      auth: callerPrincipal("user", { userId: member }),
      services: { chat: { removeCharacterFromChat: roster.removeCharacterFromChat } },
    });

    await caller(hostCtx).chat.addCharacterToChat({ chatId, characterId });

    await expect(caller(memberCtx).chat.removeCharacterFromChat({ chatId, characterId })).rejects.toThrow();

    // The refusal was total: the seat is still present and unstamped.
    expect((await loadRoster(db, chatId)).some((p) => p.characterId === characterId)).toBe(true);
    const [row] = await db
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.characterId, characterId)));
    expect(row?.leftSeq).toBeNull();
  });
});
