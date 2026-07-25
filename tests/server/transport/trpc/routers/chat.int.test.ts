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
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { characters, chatParticipants } from "@orb/db";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import { publishChatEvent } from "@orb/server/transport/trpc";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, vi } from "vitest";
import { createChatBus } from "../../../../../packages/server/src/domain/chat/bus";
import { loadRoster } from "../../../../../packages/server/src/domain/chat/persistence/roster";
import { createRead } from "../../../../../packages/server/src/domain/chat/verbs/read";
import { createRoster } from "../../../../../packages/server/src/domain/chat/verbs/roster";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { makeChatContext, seedCharacter, seedChat, seedParticipant, seedUser } from "../../../domain/chat/_support";
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
