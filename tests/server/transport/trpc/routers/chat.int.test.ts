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

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { chatParticipants, users } from "@orb/db";
import type { ChatId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { publishChatEvent } from "@orb/server/transport/trpc";
import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, vi } from "vitest";
import { createChatBus } from "../../../../../packages/server/src/domain/chat/bus";
import { createRead } from "../../../../../packages/server/src/domain/chat/verbs/read";
import { freshDb } from "../../../../support/db";
import { expect, OTHER_USER_ID, OWNER_USER_ID, test } from "../../../../support/fixtures";
import { makeChatContext, seedAgent, seedChat, seedParticipant, seedUser } from "../../../domain/chat/_support";
import { caller, principal as callerPrincipal, makeContext } from "../_support";

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
    await bus.emit({ type: "delta", chatId, delta: { chatId, kind: "text", text: "Hello " } });
    await bus.emit({ type: "delta", chatId, delta: { chatId, kind: "text", text: "world" } });

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
      event: { type: "delta", chatId, delta: { chatId, kind: "text", text: "live" } },
    });
    const first = await firstYield;
    await iterator.return?.(undefined);

    expect(idOf(first.value)).toBe("2");
    expect(dataOf(first.value).type).toBe("delta");
    // The durable head was NEVER replayed — a cursor-less open only tails live.
    expect(replaySpy).not.toHaveBeenCalled();
  });
});

// chat.seatAgent — the P6 wire (D60, agent-principal-design/04 §3). Drives the REAL composition root (the
// `app` fixture) end-to-end: the host caller (OWNER_USER_ID) seats a present member's (OTHER_USER_ID) buddy
// through the tRPC chat router → the real `provisionAgentPrincipal` (lazy mint) → `resolveAgentActor` → the
// roster upsert. The two refusal codes the client renders (`owner_not_present`, `agent_disabled`) must
// surface as BAD_REQUEST on the wire (a coded operational refusal), never a 500.
describe("chat.seatAgent — the P6 route round-trip over the real graph", () => {
  test("the host seats a present member's buddy → an agent participant lands (mint + seat rides the wire)", async ({ db: appDb, ownerCaller, otherCaller }) => {
    void otherCaller; // seeds OTHER_USER_ID's users row (the buddy owner) so provisionAgentPrincipal can mint
    const chatId = await seedChat(appDb, "seat");
    await seedParticipant(appDb, { chatId, key: "seat_h", userId: OWNER_USER_ID, role: "host" });
    await seedParticipant(appDb, { chatId, key: "seat_o", userId: OTHER_USER_ID, role: "member" });

    const view = await ownerCaller.chat.seatAgent({ chatId, ownerUserId: OTHER_USER_ID, sourceKind: "buddy" });

    expect(view.kind).toBe("agent");
    expect(view.characterId).toBeNull();
    expect(view.role).toBe("member");
    const rows = await appDb
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.kind, "agent")));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.leftSeq).toBeNull();
  });

  test("an owner who is not a present member → owner_not_present surfaces as BAD_REQUEST on the wire", async ({ db: appDb, ownerCaller, otherCaller }) => {
    void otherCaller; // OTHER exists as a user but is NOT seated in this room
    const chatId = await seedChat(appDb, "seat_absent");
    await seedParticipant(appDb, { chatId, key: "sa_h", userId: OWNER_USER_ID, role: "host" });

    await expect(ownerCaller.chat.seatAgent({ chatId, ownerUserId: OTHER_USER_ID, sourceKind: "buddy" })).toThrowTRPCError("BAD_REQUEST");
    const rows = await appDb.select().from(chatParticipants).where(eq(chatParticipants.kind, "agent"));
    expect(rows).toHaveLength(0);
  });

  test("a DISABLED agent principal → agent_disabled surfaces as BAD_REQUEST (the containment kill switch on the wire)", async ({
    db: appDb,
    ownerCaller,
    otherCaller,
  }) => {
    void otherCaller;
    // Pre-mint the deterministic-handle agent principal for OTHER, then DISABLE it — provisionAgentPrincipal
    // adopts it by handle (created:false), and resolveAgentActor's `enabled:false` refuses the seat.
    const agentHandle = castId<Handle>(`__agent__buddy__${OTHER_USER_ID}`);
    await seedAgent(appDb, OTHER_USER_ID, agentHandle);
    await appDb.update(users).set({ enabled: false }).where(eq(users.handle, agentHandle));
    const chatId = await seedChat(appDb, "seat_disabled");
    await seedParticipant(appDb, { chatId, key: "sd_h", userId: OWNER_USER_ID, role: "host" });
    await seedParticipant(appDb, { chatId, key: "sd_o", userId: OTHER_USER_ID, role: "member" });

    await expect(ownerCaller.chat.seatAgent({ chatId, ownerUserId: OTHER_USER_ID, sourceKind: "buddy" })).toThrowTRPCError("BAD_REQUEST");
    const rows = await appDb
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.kind, "agent")));
    expect(rows).toHaveLength(0);
  });
});

// chat.unseatAgent — the symmetric agent-unseat route (the solo-operator seat-lifecycle fix, 2026-07-17).
// The seatAgent twin on the UNGATED chat surface (`authedProcedure`, NOT the multi-human belt): a solo host
// must be able to REMOVE its own seated buddy in every auth mode — that a solo host could seat but not
// unseat was the whole bug. Drives the REAL composition root end-to-end.
describe("chat.unseatAgent — the P6 route round-trip over the real graph", () => {
  test("the host seats then unseats a buddy → the agent seat clears (leftSeq stamped)", async ({ db: appDb, ownerCaller, otherCaller }) => {
    void otherCaller; // seeds OTHER_USER_ID (the buddy owner) so the seat can mint
    const chatId = await seedChat(appDb, "unseat_rt");
    await seedParticipant(appDb, { chatId, key: "urt_h", userId: OWNER_USER_ID, role: "host" });
    await seedParticipant(appDb, { chatId, key: "urt_o", userId: OTHER_USER_ID, role: "member" });
    const seat = await ownerCaller.chat.seatAgent({ chatId, ownerUserId: OTHER_USER_ID, sourceKind: "buddy" });
    const agentUserId = seat.userId ?? OTHER_USER_ID;

    await ownerCaller.chat.unseatAgent({ chatId, agentUserId });

    const present = await appDb
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.kind, "agent"), isNull(chatParticipants.leftSeq)));
    expect(present).toHaveLength(0);
  });

  test("single-human mode: chat.unseatAgent works even when the multi-human belt is CLOSED — the kick path is NOT_FOUND, unseatAgent succeeds", async ({
    db: appDb,
    app,
    ownerCaller,
    otherCaller,
  }) => {
    void otherCaller; // seeds OTHER_USER_ID (the buddy owner)
    const chatId = await seedChat(appDb, "solo_unseat");
    await seedParticipant(appDb, { chatId, key: "su_h", userId: OWNER_USER_ID, role: "host" });
    await seedParticipant(appDb, { chatId, key: "su_o", userId: OTHER_USER_ID, role: "member" });
    const seat = await ownerCaller.chat.seatAgent({ chatId, ownerUserId: OTHER_USER_ID, sourceKind: "buddy" });
    const agentUserId = seat.userId ?? OTHER_USER_ID;

    // A SINGLE-USER-mode caller: multiHumanCapable=false ⇒ the multiHumanProcedure belt answers NOT_FOUND for
    // `invites.*`. Drives the REAL chat service so the mutation actually lands.
    const solo = caller(
      makeContext({ auth: callerPrincipal("owner", { userId: OWNER_USER_ID }), services: { chat: app.services.chat }, multiHumanCapable: false }),
    );

    // The belt is genuinely CLOSED for this caller — the old kick-based unseat is refused as nonexistent.
    await expect(solo.invites.kick({ chatId, userId: agentUserId })).toThrowTRPCError("NOT_FOUND");
    // …but the dedicated ungated verb works: the seat clears. This is the fix.
    await solo.chat.unseatAgent({ chatId, agentUserId });

    const present = await appDb
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.kind, "agent"), isNull(chatParticipants.leftSeq)));
    expect(present).toHaveLength(0);
  });
});
