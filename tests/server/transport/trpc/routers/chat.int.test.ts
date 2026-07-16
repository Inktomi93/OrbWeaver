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
import type { ChatId } from "@orb/kit/ids";
import { publishChatEvent } from "@orb/server/transport/trpc";
import { beforeEach, describe, vi } from "vitest";
import { createChatBus } from "../../../../../packages/server/src/domain/chat/bus";
import { createRead } from "../../../../../packages/server/src/domain/chat/verbs/read";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { makeChatContext, seedChat, seedParticipant, seedUser } from "../../../domain/chat/_support";
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
    const a = await iterator.next();
    const b = await iterator.next();
    const c = await iterator.next();
    // Stop before the generator blocks on the (empty) live tail.
    await iterator.return?.(undefined);

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
    const firstYield = iterator.next(); // starts the generator: subscribe live, skip replay (no cursor)
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
