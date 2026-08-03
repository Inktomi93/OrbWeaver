// entry/compose/emit-chat-changed — the `chatsChanged` MEMBER-FAN (PD user-bus lane; cross-device + multi-human
// chat-list recency). THE load-bearing SECURITY property: a `chatId` fans ONLY to users who are/were-at-this-
// moment members of that chat — every present human member receives (so member B's list reorders on member A's
// action in a shared room), and a NON-member NEVER does (the isolation boundary — the fan enumerates the roster,
// never trusts a caller id). Also pins the two modes: `detail` carries `chatId` (drives getChat); the
// terminal-path default omits it (list-only). Runs the REAL enumeration over a seeded roster + the REAL
// process-local user bus (`subscribeUserEvents`), so a leak would surface as a cross-channel yield.

import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createChatChangedEmitter } from "@orb/server/entry/compose";
import { publishUserEvent, subscribeUserEvents } from "@orb/server/transport/trpc";
import { describe } from "vitest";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures";
import { seedChat, seedParticipant, seedUser } from "../../domain/chat/_support.ts";

/** Read the next event off a live stream — `on()` buffered anything published after subscribe. */
async function next(stream: AsyncIterable<UserBusEvent>): Promise<UserBusEvent> {
  for await (const event of stream) {
    return event;
  }
  throw new Error("stream ended without yielding");
}

describe("emit-chat-changed — member fan + non-member isolation", () => {
  test("fans `chatsChanged` to EVERY present human member, and NEVER to a non-member", async () => {
    const db = await freshDb();
    const memberA = await seedUser(db, castId<Handle>("member_a"));
    const memberB = await seedUser(db, castId<Handle>("member_b"));
    const nonMemberC = await seedUser(db, castId<Handle>("nonmember_c"));
    const chatId = await seedChat(db, "shared");
    await seedParticipant(db, { chatId, key: "a", userId: memberA, role: "host" });
    await seedParticipant(db, { chatId, key: "b", userId: memberB, role: "member" });
    // nonMemberC is NOT seated in this chat.

    const emit = createChatChangedEmitter(db);
    const abortA = new AbortController();
    const abortB = new AbortController();
    const abortC = new AbortController();
    const streamA = subscribeUserEvents(memberA, abortA.signal);
    const streamB = subscribeUserEvents(memberB, abortB.signal);
    const streamC = subscribeUserEvents(nonMemberC, abortC.signal);

    // Member A's action fans to the whole present roster (A + B), with `detail` ⇒ the event carries `chatId`.
    await emit(chatId, { detail: true });
    // A SENTINEL published to C AFTER the fan: C's first (and only) yield must be the sentinel — proving the
    // fan never reached C (else C would yield `chatsChanged` first).
    const sentinel: UserBusEvent = { type: "settingsChanged" };
    publishUserEvent(nonMemberC, sentinel);

    expect(await next(streamA)).toEqual({ type: "chatsChanged", chatId });
    expect(await next(streamB)).toEqual({ type: "chatsChanged", chatId });
    expect(await next(streamC)).toEqual(sentinel);

    abortA.abort();
    abortB.abort();
    abortC.abort();
  });

  test("the terminal-path fan (no `detail`) omits `chatId`; `extraUserIds` reaches a just-left member", async () => {
    const db = await freshDb();
    const memberA = await seedUser(db, castId<Handle>("t_member_a"));
    const leftUser = await seedUser(db, castId<Handle>("t_left"));
    const chatId = await seedChat(db, "term");
    await seedParticipant(db, { chatId, key: "a", userId: memberA, role: "host" });
    // `leftUser` already left (leftSeq stamped) — NOT enumerated by the present-roster read, but a kick/delete
    // includes them via `extraUserIds` so their list drops the chat.
    await seedParticipant(db, {
      chatId,
      key: "left",
      userId: leftUser,
      role: "member",
      leftSeq: 5,
    });

    const emit = createChatChangedEmitter(db);
    const abortA = new AbortController();
    const abortLeft = new AbortController();
    const streamA = subscribeUserEvents(memberA, abortA.signal);
    const streamLeft = subscribeUserEvents(leftUser, abortLeft.signal);

    await emit(chatId, { extraUserIds: [leftUser] });

    // Present member A: list-only fan → `chatsChanged` with NO chatId (the terminal-path shape).
    expect(await next(streamA)).toEqual({ type: "chatsChanged" });
    // The just-left user still receives (via extras) so their list drops the chat.
    expect(await next(streamLeft)).toEqual({ type: "chatsChanged" });

    abortA.abort();
    abortLeft.abort();
  });
});
