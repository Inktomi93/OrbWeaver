// The `chat` ROOM's DURABLE-REPLAY half, proven end-to-end against a REAL libSQL db (the #1
// first-turn-race SERVER pin), MOVED here with its generator from `routers/chat.int.test.ts` (SSE-1 S2).
// The client requests `sinceSeq: 0` for a just-created chat so the server replays the head deltas that raced
// past the fresh attach (use-chat-bus.ts). The client CT (message-list-surface.ct.tsx replay-seed case) pins
// the CLIENT path; this pins the SERVER path — the one that silently re-breaks: a fresh chat whose head
// deltas were written through the REAL durable-first bus, resumed via the REAL room source from a cursor of
// 0, must yield those delta events in seq order BEFORE draining live.
//
// Unlike the sibling `stream/sources/chat.test.ts` (fake `vi.fn` services, no db), this drives the room over
// the REAL reads-slice (`createRead(ctx, deps).replayChatEvents`/`chatEventBounds` — the only two the pump
// calls) backed by a real db and the REAL domain bus (`createChatBus(...).emit`, durable-first write to
// `chat_events`). It closes the gap the mock-based test structurally cannot: that the resume path returns
// real persisted DELTAS (the token-carrying member), not just that the wiring is shaped right.

import type { ChatBusEvent, JoinHistoryVisibility } from "@orb/contracts/chat";
import type { StreamDataFrame, StreamFrame } from "@orb/contracts/stream";
import type { Db } from "@orb/db";
import type { ChatId, Handle, MessageId, SocketId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { publishChatEvent } from "@orb/server/transport/trpc";
import { beforeEach, describe, vi } from "vitest";
import { createChatBus } from "../../../../../../packages/server/src/domain/chat/bus.ts";
import { loadMessageView } from "../../../../../../packages/server/src/domain/chat/persistence/queries.ts";
import { createRead } from "../../../../../../packages/server/src/domain/chat/verbs/read.ts";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { makeChatContext, seedChat, seedMessage, seedParticipant, seedUser } from "../../../../domain/chat/_support.ts";
import { caller, principal as callerPrincipal, makeContext } from "../../_support.ts";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

// The reads-slice deps — `replayChatEvents`/`chatEventBounds` (the only verbs the room's pump calls) touch
// only `ctx.db` + `requireParticipant`, never these resolvers; minimal stubs satisfy the type.
function readDeps(): Parameters<typeof createRead>[1] {
  return {
    loadParticipantViews: () => Promise.resolve([]),
    resolveConnection: () => Promise.reject(new Error("unused: the room's pump never previews a connection")),
    checkSendAvailability: () => Promise.reject(new Error("unused: the room's pump never checks availability")),
    resolveForeignInputs: () => Promise.reject(new Error("unused: the room's pump never resolves foreign inputs")),
  };
}

/** A fresh socketId per attach — the chat bus is process-local, so a distinct id keeps a stray publish from a
 *  prior test out of this one's frames. */
let socketSeq = 0;
function nextSocket(): SocketId {
  socketSeq += 1;
  return castId<SocketId>(`socket_chat_int_${socketSeq}`);
}

/** Unwrap a pulled frame — the socket yields `tracked(ordinal, frame)`; the DURABLE cursor is `frame.seq`. */
function frameOf(yielded: unknown): StreamFrame {
  return (Array.isArray(yielded) ? yielded[1] : yielded) as StreamFrame;
}
function chatFrame(result: IteratorResult<unknown>): Extract<StreamDataFrame, { channel: "chat" }> {
  const frame = frameOf(result.value);
  if (frame.channel !== "chat") {
    throw new Error(`expected a chat frame, got ${frame.channel}`);
  }
  return frame;
}
function dataOf(result: IteratorResult<unknown>): ChatBusEvent {
  return chatFrame(result).event;
}
function seqOf(result: IteratorResult<unknown>): number {
  return chatFrame(result).seq;
}

/** Attach the chat room over the REAL reads-slice as `userId`, connect, and drain the `attached` ack —
 *  leaving an iterator parked exactly where the deleted subscription's iterator started. */
async function openChatRoom(read: ReturnType<typeof createRead>, userId: UserId, chatId: ChatId, sinceSeq?: number): Promise<AsyncIterator<unknown>> {
  const ctx = makeContext({
    auth: callerPrincipal("user", { userId }),
    services: { chat: { replayChatEvents: read.replayChatEvents, chatEventBounds: read.chatEventBounds } },
  });
  const socketId = nextSocket();
  const call = caller(ctx);
  await call.stream.attach({ socketId, ref: { channel: "chat", chatId }, ...(sinceSeq === undefined ? {} : { sinceSeq }) });
  const socket = (await call.stream.connect({ socketId })) as AsyncIterable<unknown>;
  const iterator = socket[Symbol.asyncIterator]();
  expect(frameOf((await iterator.next()).value)).toEqual({ channel: "control", type: "attached", ref: { channel: "chat", chatId } });
  return iterator;
}

/** `bus.emit` is TOTAL — it resolves `null` when the durable append is dropped (the aggregate is gone).
 *  Every emit in this fixture targets a LIVE chat, so a `null` means the FIXTURE is broken, not the code
 *  under test: fail loudly rather than publishing a fabricated cursor (which would silently mis-key the
 *  live fan and make a clamp assertion meaningless).
 *
 *  Returns what was LOGGED — the cursor AND the event as stored, which is the §3.6-stamped copy, not the
 *  caller's. A fixture that fans its own object instead reproduces nothing real: an unstamped `delta` is
 *  withheld from members by design (fail-closed), so it would look like a passing strip while proving
 *  nothing. `entry/compose/services.ts::emitChatEvent` fans exactly this pair; so does every site here. */
async function emitLogged(bus: ReturnType<typeof createChatBus>, event: ChatBusEvent): Promise<{ readonly seq: number; readonly event: ChatBusEvent }> {
  const logged = await bus.emit(event);
  if (logged === null) {
    throw new Error("fixture: bus.emit dropped the event — the chat row is missing");
  }
  return logged;
}

describe("the chat room — durable delta replay over a real reads-slice (the #1 server pin)", () => {
  test("a fresh chat's head deltas persisted through the real bus replay via sinceSeq 0, in seq order", async () => {
    // Seed a chat whose caller is the host member (so the per-yield membership gate passes).
    const host = await seedUser(db, castId<Handle>("host"));
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

    // Drive the REAL room source with the REAL reads-slice behind the fake `Services` bundle (the two verbs
    // the pump calls), through the full middleware ladder.
    const read = createRead(ctx, readDeps());
    const iterator = await openChatRoom(read, host, chatId, 0);
    // PD-134: `chatOpened` synthesizes first at attach (seq = the resume cursor 0, non-advancing); no
    // `historyTruncated` (cursor 0 is not < minSeq(1) - 1). Then the durable head replays.
    const opened = await iterator.next();
    const a = await iterator.next();
    const b = await iterator.next();
    const c = await iterator.next();
    // Stop before the pump blocks on the (empty) live tail.
    await iterator.return?.(undefined);

    expect(dataOf(opened).type).toBe("chatOpened");
    expect(seqOf(opened)).toBe(0);
    // The durable head replays ASCENDING with each durable seq as the frame's resume cursor.
    expect([seqOf(a), seqOf(b), seqOf(c)]).toEqual([1, 2, 3]);
    expect([dataOf(a).type, dataOf(b).type, dataOf(c).type]).toEqual(["turnStarted", "delta", "delta"]);

    // The token-carrying delta payloads survived the JSON round-trip through the durable column.
    const deltaB = dataOf(b);
    const deltaC = dataOf(c);
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
    // The complement: a cursor-less attach (a direct chat-open, not the draft→committed seed) must NOT
    // replay the durable head — that would re-animate a finished turn as a ghost. With head deltas already
    // durable, only a LIVE event comes through, and `replayChatEvents` is never consulted.
    const host = await seedUser(db, castId<Handle>("host"));
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
    const iterator = await openChatRoom({ ...read, replayChatEvents: replaySpy }, host, chatId);
    // ⚠ RECONCILED (R3, caa06972c — the unit twin carries the full note): this pin used to assert
    // seq 0 on the cursor-less synthetic, and that 0 WAS the fresh-room message-loss window. The
    // synthetic now carries bounds.maxSeq (the durable high-water, here 1 — the seeded head delta)
    // as the client's resume floor. The REAL invariant this test protects is unchanged and asserted
    // below: replayChatEvents is never consulted on a cursor-less attach.
    const opened = await iterator.next();
    expect(dataOf(opened).type).toBe("chatOpened");
    expect(seqOf(opened)).toBe(1);

    const firstYield = iterator.next(); // resumes into the live loop
    // A live event published AFTER the attach (seq past the durable head) is the only thing that flows —
    // its durable seq is 2 (the emit above was seq 1). Publish through the transport bus.
    publishChatEvent({
      seq: 2,
      event: { type: "delta", chatId, slotSeq: 1, delta: { chatId, kind: "text", text: "live" } },
    });
    const first = await firstYield;
    await iterator.return?.(undefined);

    expect(seqOf(first)).toBe(2);
    expect(dataOf(first).type).toBe("delta");
    // The durable head was NEVER replayed — a cursor-less attach only tails live.
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
describe("the chat room — the D16 join-history clamp on the LIVE half (real participant rows)", () => {
  /** A room with a pre-join row (seq 1) and a post-join row (seq 5), a host, and one human joiner whose
   *  `joinSeq` is stamped at head 5. `visibility` is ALWAYS written explicitly — these are the clamp's own
   *  tests, so the host-RESTRICTED `from-join` policy is spelled out rather than inherited from the column
   *  default (which is `full`: an unrestricted invitee sees everything). */
  async function seedClampedRoom(
    key: string,
    visibility: JoinHistoryVisibility = "from-join",
  ): Promise<{ host: UserId; joiner: UserId; chatId: ChatId; preId: MessageId; postId: MessageId }> {
    const host = await seedUser(db, castId<Handle>(`${key}_host`));
    const joiner = await seedUser(db, castId<Handle>(`${key}_joiner`));
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

  /** Attach as `userId` over the REAL reads-slice and drain the `chatOpened` attach synthesis, leaving the
   *  pump parked in the live loop. */
  async function attach(read: ReturnType<typeof createRead>, userId: UserId, chatId: ChatId): Promise<AsyncIterator<unknown>> {
    const iterator = await openChatRoom(read, userId, chatId);
    expect(dataOf(await iterator.next()).type).toBe("chatOpened");
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

    // ONE emit, fanned to BOTH rooms — durable-first, exactly as the composition root's `emitChatEvent`
    // does it (the durable seq the log assigned IS the live cursor). The host edits the PRE-join row.
    const leak = await emitLogged(bus, { type: "messageEdited", chatId, messageId: preId, view: preView });
    publishChatEvent(leak);
    // Then a row the member is legitimately entitled to, so their pull has something to resolve on.
    const allowed = await emitLogged(bus, { type: "messageEdited", chatId, messageId: postId, view: postView });
    publishChatEvent(allowed);

    const hostGot = await hostPending;
    const memberGot = await memberPending;
    await hostIt.return?.(undefined);
    await memberIt.return?.(undefined);

    // The host — unclamped (a born-here seat, joinSeq 0) — receives the pre-join edit with its content.
    expect(seqOf(hostGot)).toBe(leak.seq);
    expect(JSON.stringify(hostGot.value)).toContain("pre-join greeting");
    // The clamped member skipped it entirely: their FIRST live frame is the post-join row at its own durable
    // seq (the withheld row left a gap; the cursor was never advanced to it, so nothing re-offers or stalls).
    expect(seqOf(memberGot)).toBe(allowed.seq);
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
    const logged = await emitLogged(bus, { type: "messageEdited", chatId, messageId: preId, view: preView });
    publishChatEvent(logged);
    const got = await pending;
    await memberIt.return?.(undefined);

    // Same room shape, same event, `joinSeq` still 5 — only the policy differs, so the floor resolves to 0.
    expect(seqOf(got)).toBe(logged.seq);
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
    const leak = await emitLogged(bus, { type: "delta", chatId, slotSeq: 1, delta: { chatId, kind: "text", text: "pre-join tokens" } });
    publishChatEvent(leak);
    const allowed = await emitLogged(bus, { type: "delta", chatId, slotSeq: 5, delta: { chatId, kind: "text", text: "post-join tokens" } });
    publishChatEvent(allowed);

    const got = await pending;
    await memberIt.return?.(undefined);

    // LIVE: the pre-join stream was dropped whole (no cursor advance — the next frame keeps its own seq), and
    // the post-join stream arrived. Before `slotSeq`, BOTH were withheld and this member never saw a token.
    expect(seqOf(got)).toBe(allowed.seq);
    expect(dataOf(got).type).toBe("delta");
    expect(JSON.stringify(got.value)).not.toContain("pre-join tokens");
    expect(JSON.stringify(got.value)).toContain("post-join tokens");

    // REPLAY: the same two durable rows, same caller, same verdict — one row delivered at its own seq, the
    // other absent (a gap, never a renumber). This is the live/replay coherence the clamp is built on.
    const replayed = await read.replayChatEvents({ principal: callerPrincipal("user", { userId: joiner }), chatId, afterSeq: 0 });
    expect(replayed.map((e) => e.seq)).toEqual([allowed.seq]);
    expect(JSON.stringify(replayed)).not.toContain("pre-join tokens");
    expect(JSON.stringify(replayed)).toContain("post-join tokens");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// §3.6 — THE MID-SLOT RECONNECT, over the multiplex. The hidden-span scrub is STATEFUL over one slot's
// delta stream (a `<lie …/>` opener is withheld until its `/>` arrives), and under the fold a room's PUMP
// restarts far more often than a subscription used to: a socket reconnect, a shed's resume, a rewind
// re-attach. Every one of those is a cold start mid-slot. If that state lived in the pump, the fresh one
// would see only the tail (`1234"/> …`), find no `<`, call it safe, and hand the member the secret's last
// bytes — and the withheld open makes the ghost visibly stall, so the member knows exactly when to
// reconnect. It lives at the PRODUCER instead (`memberText`), so this pins the property AT the room source:
// a cold pump reads the same stamped bytes as one that watched the whole slot. Driven through the REAL
// attach→connect ladder over a REAL durable bus.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
describe("the chat room — a hidden span open across a MEMBER's reconnect never leaks its tail", () => {
  const textDelta = (chatId: ChatId, text: string): ChatBusEvent => ({ type: "delta", chatId, slotSeq: 1, delta: { chatId, kind: "text", text } });

  test("the opener lands DURING the disconnect gap; the closer arrives LIVE on the resumed room", async () => {
    const host = await seedUser(db, castId<Handle>("reopen_host"));
    const member = await seedUser(db, castId<Handle>("reopen_member"));
    const chatId: ChatId = await seedChat(db, "reopen");
    await seedParticipant(db, { chatId, key: "reopen_h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "reopen_m", userId: member, role: "member" });

    const ctx = makeChatContext(db);
    const bus = createChatBus({ db, now: ctx.now, newEventId: ctx.newEventId });
    const read = createRead(ctx, readDeps());

    // Turn head: ordinary prose the member is entitled to (durable seq 1).
    await emitLogged(bus, textDelta(chatId, "The vault is "));

    // FIRST connection — the replay delivers the head; its frame `seq` is the resume cursor.
    const first = await openChatRoom(read, member, chatId, 0);
    expect(dataOf(await first.next()).type).toBe("chatOpened");
    const prose = await first.next();
    await first.return?.(undefined); // DISCONNECT (a blip, a tab close, or a deliberate one)
    const cursor = seqOf(prose);
    expect(JSON.stringify(prose.value)).toContain("The vault is ");

    // The gap: the model opens a hidden span (seq 2). Durable-only — nobody is attached to fan it live. A
    // lifecycle event follows it (seq 3): every member sees that one, so the resume cursor ADVANCES PAST the
    // still-open span — which is what forces the replay/live handoff below to be a real cold start.
    await emitLogged(bus, textDelta(chatId, '<lie character="Vex" truth="the vault code is '));
    await emitLogged(bus, {
      type: "turnStarted",
      chatId,
      intent: "send",
      api: "chat-completions",
      source: "openrouter",
      model: "m",
      speakerCharacterId: null,
      targetMessageId: null,
    });

    // RECONNECT at the last DELIVERED cursor. AWAIT the replayed lifecycle row: that pins the durable replay
    // as COMPLETE (it withheld the opener) before any live byte arrives.
    const second = await openChatRoom(read, member, chatId, cursor);
    expect(dataOf(await second.next()).type).toBe("chatOpened");
    const replayed = await second.next();
    expect(dataOf(replayed).type).toBe("turnStarted");
    const pending = second.next(); // now parked in the LIVE loop, span still open

    // The closer + the rest of the reply arrive LIVE on the resumed room.
    const tail = await emitLogged(bus, textDelta(chatId, '1234"/> The vault is empty.'));
    publishChatEvent(tail);

    const got = await pending;
    await second.return?.(undefined);

    const wire = JSON.stringify(got.value);
    // The secret's tail bytes — and the tag syntax framing them — must NEVER reach the member…
    expect(wire).not.toContain("1234");
    expect(wire).not.toContain('"/>');
    // …while the visible prose that followed the closed span still streams.
    expect(wire).toContain("The vault is empty.");
  });
});
