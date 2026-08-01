// rpg.stream — the per-game LIVE relay (transport/trpc/routers/rpg.ts). The relay itself is thin: attach the
// process-local rpg bus channel for the input `chatId`, gate CHAT MEMBERSHIP per yield (rpg has no `ownerId`;
// authority derives `rpg_games.chatId → chat_participants`, D18/D20), and relay. These drive it through the
// REAL ladder (`createCaller` over a fake `Services`) and pin the two things the wire shape owes the client:
//   • every yield is a `tracked()` envelope carrying a per-stream ORDINAL (no durable resume exists here — the
//     id exists so the events and the error frame share ONE envelope shape the client can narrow on);
//   • a DomainError escaping the per-yield membership probe becomes the typed `__subscriptionError` TERMINAL
//     frame (`withSubscriptionErrors`), never a raw 500 — an unwrapped subscription throw is a RETRYABLE tRPC
//     500 that `httpSubscriptionLink` silently reconnects forever with zero client callbacks (the 2026-08-01
//     zombie-subscription incident).
// The withhold-not-throw arm (a non-member NOT_FOUND yields nothing) is the cross-tenant sweep's classification.

import type { RpgBusEvent } from "@orb/contracts/rpg";
import { DomainUnavailableError } from "@orb/kit/errors";
import type { ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ChatService } from "@orb/server/domain/chat";
import { publishRpgEvent } from "@orb/server/domain/rpg";
import type { Context } from "@orb/server/transport/trpc";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../support/fixtures";
import { caller, makeContext, principal } from "../_support.ts";

const MEMBER = castId<UserId>("user_member");
const CHAT = castId<ChatId>("chat_rpg_1");

const EVENT: RpgBusEvent = { type: "gameChanged", chatId: CHAT };

function ctxWith(chatEventBounds: ChatService["chatEventBounds"]): Context {
  return makeContext({ auth: principal("user", { userId: MEMBER }), services: { chat: { chatEventBounds } } });
}

/** The tracked envelope's parts (`[id, data, symbol]` on the server side of `createCaller`). */
function idOf(yielded: unknown): string {
  return (Array.isArray(yielded) ? yielded[0] : "") as string;
}
function dataOf(yielded: unknown): unknown {
  return Array.isArray(yielded) ? yielded[1] : yielded;
}

/** Pull ONE yield out of the live relay: start the pull (the async generator attaches its bus listener on the
 *  first `next()`), let the microtask queue drain, then publish — `on()` buffers from attach, so the event
 *  cannot be lost once the listener is up. */
async function firstYield(stream: AsyncIterable<unknown>, publish: () => void): Promise<unknown> {
  const iterator = stream[Symbol.asyncIterator]();
  const pull = iterator.next();
  await new Promise((resolve) => setTimeout(resolve, 0));
  publish();
  const result = await pull;
  await iterator.return?.(undefined);
  return result.value;
}

describe("rpg.stream — the per-game live relay", () => {
  test("relays a bus event to a member as a tracked envelope (per-stream ordinal id)", async () => {
    const chatEventBounds = vi.fn<ChatService["chatEventBounds"]>(() =>
      Promise.resolve({ minSeq: 0, maxSeq: 0, historyFloorSeq: 0, viewerIsHost: true, reasoningHostOnly: false }),
    );
    const sub = await caller(ctxWith(chatEventBounds)).rpg.stream({ chatId: CHAT });

    const yielded = await firstYield(sub as AsyncIterable<unknown>, () => publishRpgEvent(EVENT));

    expect(dataOf(yielded)).toEqual(EVENT);
    // The ordinal, not a durable cursor — first yield of this stream.
    expect(idOf(yielded)).toBe("1");
    // The membership gate ran for the caller, on this chat, before the relay.
    expect(chatEventBounds).toHaveBeenCalledWith(expect.objectContaining({ principal: expect.objectContaining({ userId: MEMBER }), chatId: CHAT }));
  });

  test("a DomainError from the per-yield membership probe becomes a typed terminal frame, not a 500", async () => {
    // NOT the leak-free NOT_FOUND (that one is caught and withholds) — any OTHER domain failure of the probe,
    // e.g. the chat read being transiently unavailable. Unwrapped this threw straight out of the generator.
    const chatEventBounds = vi.fn<ChatService["chatEventBounds"]>(() => Promise.reject(new DomainUnavailableError("chat read unavailable")));
    const sub = await caller(ctxWith(chatEventBounds)).rpg.stream({ chatId: CHAT });

    const yielded = await firstYield(sub as AsyncIterable<unknown>, () => publishRpgEvent(EVENT));

    expect(dataOf(yielded)).toEqual(expect.objectContaining({ __subscriptionError: true, code: "SERVICE_UNAVAILABLE", message: "chat read unavailable" }));
    // The frame carries the never-resumable sentinel id, so a reconnect's Last-Event-ID never resumes "from
    // the error" (subscriptions.ts).
    expect(idOf(yielded)).toBe("__error__");
  });
});
