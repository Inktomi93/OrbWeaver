// The client room registry (data/bus/room-registry.ts) — the half of the multiplex that decides when
// "a component wants this room" becomes an attach on the wire. The CT drives it through a real browser;
// these pin the decisions themselves, which are the ones that used to be invisible network facts:
//   • N subscribers of one room cost ONE attach, and only the LAST leaver detaches,
//   • a join made before the socket mounted is flushed on bind (children commit before their parent),
//   • a reconnect re-announces (the 60s cell reap would otherwise strand a slept laptop) but the FIRST
//     live edge does not (every room already announced itself),
//   • BOOT-4X: `onSocketLive` (the gap-heal) fires only once a room HAS ALREADY been live in this page —
//     never on its first live edge, whether that arrives via the socket's first connect or via joining an
//     already-live socket,
//   • a frame for a room nobody joined is dropped, never fanned out,
//   • a REMOUNT (leave then re-join back to back — StrictMode's double effect, a Suspense retry) costs the
//     wire nothing: the detach is deferred by a grace window and the re-join reclaims the room, so there is
//     no detach, no second attach, and no gap-heal for a room that never went dark.
//
// The retire grace is a TIMER, so every test that wants a real detach advances past it (`PAST_RETIRE_GRACE_MS`
// is "well past", not the constant itself — the tests pin the BEHAVIOUR, not the tuning).

import type { RoomTransport } from "@orb/client/data";
import { createRoomRegistry } from "@orb/client/data";
import type { StreamDataFrame, StreamRoomRef } from "@orb/contracts/stream";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { afterEach, describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const CHAT = castId<ChatId>("chat_reg_1");
const USER_ROOM: StreamRoomRef = { channel: "user" };
const RPG_ROOM: StreamRoomRef = { channel: "rpg", chatId: CHAT };
const ANNOUNCE_FAILED_COPY = /Live updates could not be started/u;
/** #215: the alert fires on surfaces with no room open, so the copy may not name one. */
const ROOM_NOUN = /room/iu;
const USER_FRAME: StreamDataFrame = { channel: "user", event: { type: "tagsChanged" } };
const RPG_FRAME: StreamDataFrame = { channel: "rpg", chatId: CHAT, event: { type: "gameChanged", chatId: CHAT } };
/** Well past the registry's retire grace — the point where a room nobody wants is genuinely given back. */
const PAST_RETIRE_GRACE_MS = 1000;

afterEach(() => {
  vi.useRealTimers();
});

/** A recording transport — the wire the registry would otherwise reach through `useOrbSocket`. */
function fakeTransport(): {
  attached: StreamRoomRef[];
  detached: StreamRoomRef[];
  transport: RoomTransport;
} {
  const attached: StreamRoomRef[] = [];
  const detached: StreamRoomRef[] = [];
  return {
    attached,
    detached,
    transport: {
      attach: (ref): Promise<void> => {
        attached.push(ref);
        return Promise.resolve();
      },
      detach: (ref): Promise<void> => {
        detached.push(ref);
        return Promise.resolve();
      },
    },
  };
}

describe("ref-counting", () => {
  test("two subscribers of ONE room cost one attach; only the last leaver detaches", () => {
    // @orb-waive test-determinism(vi.useFakeTimers): legacy fake-timers usage not yet migrated to the frozen-clock composition seam; ends when this test adopts tests/support/clock.ts
    vi.useFakeTimers();
    const registry = createRoomRegistry();
    const wire = fakeTransport();
    registry.bindTransport(wire.transport);

    const leaveA = registry.join(RPG_ROOM, { onEvent: () => undefined });
    const leaveB = registry.join(RPG_ROOM, { onEvent: () => undefined });

    expect(wire.attached).toEqual([RPG_ROOM]);

    leaveA();
    vi.advanceTimersByTime(PAST_RETIRE_GRACE_MS);
    expect(wire.detached).toEqual([]);
    expect(registry.joined()).toEqual([`rpg:${CHAT}`]);

    leaveB();
    // The detach is deferred by the retire grace (a remount inside it reclaims the room); past the window,
    // a room nobody wants is genuinely given back.
    expect(wire.detached).toEqual([]);
    vi.advanceTimersByTime(PAST_RETIRE_GRACE_MS);
    expect(wire.detached).toEqual([RPG_ROOM]);
    expect(registry.joined()).toEqual([]);
  });

  test("both subscribers of one room receive its frame", () => {
    const registry = createRoomRegistry();
    registry.bindTransport(fakeTransport().transport);
    const seen: string[] = [];
    registry.join(RPG_ROOM, { onEvent: () => seen.push("a") });
    registry.join(RPG_ROOM, { onEvent: () => seen.push("b") });

    registry.deliver(RPG_FRAME);

    expect(seen).toEqual(["a", "b"]);
  });
});

describe("late transport binding", () => {
  test("a room joined BEFORE the socket mounted is attached on bind", () => {
    const registry = createRoomRegistry();
    const wire = fakeTransport();

    registry.join(USER_ROOM, { onEvent: () => undefined });
    expect(wire.attached).toEqual([]);

    registry.bindTransport(wire.transport);

    expect(wire.attached).toEqual([USER_ROOM]);
  });

  // `useOrbSocket`'s effect is double-invoked on a dev mount too, and binding flushes every joined room —
  // which is how a room already attached with this exact request bought a second, identical attach.
  test("RE-binding does not re-announce a room already attached with the same request", () => {
    const registry = createRoomRegistry();
    const wire = fakeTransport();
    registry.bindTransport(wire.transport);
    registry.join(USER_ROOM, { onEvent: () => undefined });

    registry.bindTransport(null);
    registry.bindTransport(wire.transport);

    expect(wire.attached).toEqual([USER_ROOM]);
  });

  // The dedupe must never eat the insurance: after a real drop the server may have reaped the cell, so the
  // reconnect's announce goes out even though nothing about the room changed.
  test("a RECONNECT announces past the dedupe", () => {
    const registry = createRoomRegistry();
    const wire = fakeTransport();
    registry.bindTransport(wire.transport);
    registry.join(USER_ROOM, { onEvent: () => undefined });
    registry.socketLive();

    registry.socketDown();
    registry.socketLive();

    expect(wire.attached).toEqual([USER_ROOM, USER_ROOM]);
  });
});

describe("the live edge — BOOT-4X: the gap-heal is a RE-connect instrument", () => {
  /** A joined room that counts its heals. */
  function healCounter(registry: ReturnType<typeof createRoomRegistry>, ref: StreamRoomRef): { count: () => number; leave: () => void } {
    let heals = 0;
    const leave = registry.join(ref, {
      onEvent: () => undefined,
      onSocketLive: (): void => {
        heals += 1;
      },
    });
    return { count: () => heals, leave };
  }

  test("the FIRST live edge does NOT heal — and does not re-announce (the join already did)", () => {
    const registry = createRoomRegistry();
    const wire = fakeTransport();
    registry.bindTransport(wire.transport);
    const room = healCounter(registry, USER_ROOM);

    registry.socketLive();

    expect(wire.attached).toEqual([USER_ROOM]);
    // The measured regression: healing here re-fetched every mounted user root a second time on every
    // page load. The mount's own reads ARE that page's fresh state.
    expect(room.count()).toBe(0);
  });

  test("a RECONNECT heals every room AND re-announces it (the server may have reaped the cell)", () => {
    const registry = createRoomRegistry();
    const wire = fakeTransport();
    registry.bindTransport(wire.transport);
    const room = healCounter(registry, USER_ROOM);
    registry.socketLive(); // first connect

    registry.socketDown();
    registry.socketLive(); // reconnect

    expect(wire.attached).toEqual([USER_ROOM, USER_ROOM]);
    expect(room.count()).toBe(1);
  });

  test("a room joining an ALREADY-live socket for the FIRST time does not heal", () => {
    const registry = createRoomRegistry();
    registry.bindTransport(fakeTransport().transport);
    registry.socketLive();

    const room = healCounter(registry, RPG_ROOM);

    // Its panel is mounting and fetching right now — nothing to close.
    expect(room.count()).toBe(0);
  });

  test("a room RE-joining after a detach heals — its cache went stale while nothing announced writes", () => {
    // @orb-waive test-determinism(vi.useFakeTimers): legacy fake-timers usage not yet migrated to the frozen-clock composition seam; ends when this test adopts tests/support/clock.ts
    vi.useFakeTimers();
    const registry = createRoomRegistry();
    registry.bindTransport(fakeTransport().transport);
    registry.socketLive();
    healCounter(registry, RPG_ROOM).leave(); // opened a game chat, then switched away
    vi.advanceTimersByTime(PAST_RETIRE_GRACE_MS); // …long enough that the room was really given back

    const rejoined = healCounter(registry, RPG_ROOM); // …and switched back

    expect(rejoined.count()).toBe(1);
  });

  // The other side of that rule, and the reason the boot double-attached: a REMOUNT is not a visit away. The
  // room never left, so re-joining inside the grace must cost nothing — no detach, no attach, and no heal
  // (a heal here re-fetched every root of the surface that was merely re-rendering).
  test("a re-join INSIDE the retire grace reclaims the room — no detach, no second attach, no heal", () => {
    // @orb-waive test-determinism(vi.useFakeTimers): legacy fake-timers usage not yet migrated to the frozen-clock composition seam; ends when this test adopts tests/support/clock.ts
    vi.useFakeTimers();
    const registry = createRoomRegistry();
    const wire = fakeTransport();
    registry.bindTransport(wire.transport);
    registry.socketLive();
    healCounter(registry, RPG_ROOM).leave(); // the remount's cleanup…

    const remounted = healCounter(registry, RPG_ROOM); // …and its setup, in the same commit
    vi.advanceTimersByTime(PAST_RETIRE_GRACE_MS);

    expect(wire.attached).toEqual([RPG_ROOM]);
    expect(wire.detached).toEqual([]);
    expect(remounted.count()).toBe(0);
    expect(registry.joined()).toEqual([`rpg:${CHAT}`]);
  });

  test("the gate is per ROOM — one room's history never heals another", () => {
    // @orb-waive test-determinism(vi.useFakeTimers): legacy fake-timers usage not yet migrated to the frozen-clock composition seam; ends when this test adopts tests/support/clock.ts
    vi.useFakeTimers();
    const registry = createRoomRegistry();
    registry.bindTransport(fakeTransport().transport);
    registry.socketLive();
    healCounter(registry, USER_ROOM).leave();
    vi.advanceTimersByTime(PAST_RETIRE_GRACE_MS);

    const user = healCounter(registry, USER_ROOM);
    const rpg = healCounter(registry, RPG_ROOM);

    expect(user.count()).toBe(1); // been live before
    expect(rpg.count()).toBe(0); // first time
  });

  test("roomLagged heals ONLY that room", () => {
    const registry = createRoomRegistry();
    registry.bindTransport(fakeTransport().transport);
    let userHeals = 0;
    let rpgHeals = 0;
    registry.join(USER_ROOM, {
      onEvent: () => undefined,
      onSocketLive: (): void => {
        userHeals += 1;
      },
    });
    registry.join(RPG_ROOM, {
      onEvent: () => undefined,
      onSocketLive: (): void => {
        rpgHeals += 1;
      },
    });

    registry.lagged(RPG_ROOM);

    expect(rpgHeals).toBe(1);
    expect(userHeals).toBe(0);
  });
});

// `liveEpoch` publishes the SAME ledger the gap-heal gate above reads — "how many times has this room
// entered live delivery in this page?" — for the one caller that needs the answer without being a
// subscriber: the invalidation seam's `chatOpened` row (#514). The attach synthesis re-fires on EVERY
// attach including the first, and on the FIRST there is nothing for it to heal, so the seam asks here
// instead of refetching the room read the open itself just issued.
describe("liveEpoch — how much can this room have missed?", () => {
  test("a room that never attached reports 0 — the caller cannot assume anything", () => {
    const registry = createRoomRegistry();
    registry.bindTransport(fakeTransport().transport);

    expect(registry.liveEpoch(RPG_ROOM)).toBe(0);
  });

  test("the FIRST live edge is epoch 1 — whether the socket goes live after the join or before it", () => {
    const afterJoin = createRoomRegistry();
    afterJoin.bindTransport(fakeTransport().transport);
    afterJoin.join(RPG_ROOM, { onEvent: () => undefined });
    afterJoin.socketLive();

    const beforeJoin = createRoomRegistry();
    beforeJoin.bindTransport(fakeTransport().transport);
    beforeJoin.socketLive();
    beforeJoin.join(RPG_ROOM, { onEvent: () => undefined });

    expect(afterJoin.liveEpoch(RPG_ROOM)).toBe(1);
    expect(beforeJoin.liveEpoch(RPG_ROOM)).toBe(1);
  });

  test("a RECONNECT climbs the epoch — the room was dark in between", () => {
    const registry = createRoomRegistry();
    registry.bindTransport(fakeTransport().transport);
    registry.join(RPG_ROOM, { onEvent: () => undefined });
    registry.socketLive();

    registry.socketDown();
    registry.socketLive();

    expect(registry.liveEpoch(RPG_ROOM)).toBe(2);
  });

  test("a re-join after a real detach climbs it; a REMOUNT inside the retire grace does not", () => {
    // @orb-waive test-determinism(vi.useFakeTimers): legacy fake-timers usage not yet migrated to the frozen-clock composition seam; ends when this test adopts tests/support/clock.ts
    vi.useFakeTimers();
    const registry = createRoomRegistry();
    registry.bindTransport(fakeTransport().transport);
    registry.socketLive();

    // The remount (leave + re-join in one commit): the room never left, so nothing can have been missed.
    registry.join(RPG_ROOM, { onEvent: () => undefined })();
    registry.join(RPG_ROOM, { onEvent: () => undefined })();
    expect(registry.liveEpoch(RPG_ROOM)).toBe(1);

    // …and a real visit away and back: the room WAS given back, so its cache aged with nothing announcing.
    vi.advanceTimersByTime(PAST_RETIRE_GRACE_MS);
    registry.join(RPG_ROOM, { onEvent: () => undefined });

    expect(registry.liveEpoch(RPG_ROOM)).toBe(2);
  });

  // A shed is a DELIVERY gap with no socket transition — frames this room was owed never arrived — so it
  // counts exactly like a reconnect. Without this a room that lagged on its first attach would still say
  // "nothing can be missed", which is precisely what the shed disproves.
  test("a LAG climbs the epoch of the lagged room only", () => {
    const registry = createRoomRegistry();
    registry.bindTransport(fakeTransport().transport);
    registry.join(RPG_ROOM, { onEvent: () => undefined });
    registry.join(USER_ROOM, { onEvent: () => undefined });
    registry.socketLive();

    registry.lagged(RPG_ROOM);

    expect(registry.liveEpoch(RPG_ROOM)).toBe(2);
    expect(registry.liveEpoch(USER_ROOM)).toBe(1);
  });
});

describe("routing and failure", () => {
  test("a frame for a room nobody joined is dropped, not fanned out", () => {
    const registry = createRoomRegistry();
    registry.bindTransport(fakeTransport().transport);
    const seen: StreamDataFrame[] = [];
    registry.join(USER_ROOM, { onEvent: (frame) => seen.push(frame) });

    registry.deliver(RPG_FRAME);
    registry.deliver(USER_FRAME);

    expect(seen).toEqual([USER_FRAME]);
  });

  // REVERSES A RECORDED PIN, deliberately (#222). This test used to read "roomFailed reaches only the
  // failed room; a SOCKET fault reaches every room", and `use-orb-socket.ts` justified the second half:
  // "Every room loses freshness, so every room's consumer hears it; the reconnect's gap-heal closes the
  // data gap when the client re-subscribes." The PURPOSE — freshness recovery — is real and survives
  // untouched: `onSocketLive` fires it per room on the re-connect edge (BOOT-4X), which is what actually
  // closed the gap. What the fan-out bought on top was pure duplication: every room hook's `onError` is a
  // `notify.error`, so ONE socket death raised N byte-identical toasts of the raw server sentence, and one
  // consumer turned a recoverable blip into a terminal claim ("The import stream ended"). So `failed` is
  // ref-REQUIRED now and means only what its name says; the socket tells its own story once
  // (`use-orb-socket.ts` `reportSocketFault`), which `use-orb-socket.ct.tsx` pins in pixels.
  test("failed() reaches ONLY the named room — a fault is never fanned across rooms", () => {
    const registry = createRoomRegistry();
    registry.bindTransport(fakeTransport().transport);
    const userErrors: string[] = [];
    const rpgErrors: string[] = [];
    registry.join(USER_ROOM, { onEvent: () => undefined, onError: (m) => userErrors.push(m) });
    registry.join(RPG_ROOM, { onEvent: () => undefined, onError: (m) => rpgErrors.push(m) });

    registry.failed("room is gone", RPG_ROOM);
    expect(rpgErrors).toEqual(["room is gone"]);
    expect(userErrors).toEqual([]);

    registry.failed("the user room is gone", USER_ROOM);
    expect(userErrors).toEqual(["the user room is gone"]);
    // The rpg room hears nothing about a room that is not its own — the whole point of the ref.
    expect(rpgErrors).toEqual(["room is gone"]);
  });

  test("a durable room's attach carries the LOWEST replay request among its subscribers", () => {
    const registry = createRoomRegistry();
    const requested: (number | null)[] = [];
    registry.bindTransport({
      attach: (_ref, sinceSeq): Promise<void> => {
        requested.push(sinceSeq);
        return Promise.resolve();
      },
      detach: (): Promise<void> => Promise.resolve(),
    });

    registry.join(USER_ROOM, { onEvent: () => undefined, sinceSeq: 12 });
    // The SECOND join LOWERS the room's request, so it re-announces on the spot (#1484) — the merged
    // request is not something the next reconnect gets around to.
    registry.join(USER_ROOM, { onEvent: () => undefined, sinceSeq: 0 });
    registry.socketLive();
    registry.socketLive(); // reconnect → re-announce with the merged request

    expect(requested).toEqual([12, 0, 0]);
  });

  test("a subscriber joining an ALREADY-LIVE room with a LOWER cursor is re-announced, not silently starved (#1484)", () => {
    // THE DEFECT THIS PINS: the join-time announce used to be gated on `subscribers.size === 1`, so a
    // second hook joining a room that was ALREADY attached was added to the Set and nothing told the wire.
    // The room stayed attached at the FIRST joiner's cursor, and every durable event between the two
    // cursors was never replayed to the newcomer — a chat that quietly lacks rows it can prove it missed.
    // The SHAPE matters: the room must go LIVE before the second join, or this exercises the
    // first-subscriber path twice and passes against the bug.
    const registry = createRoomRegistry();
    const requested: (number | null)[] = [];
    registry.bindTransport({
      attach: (_ref, sinceSeq): Promise<void> => {
        requested.push(sinceSeq);
        return Promise.resolve();
      },
      detach: (): Promise<void> => Promise.resolve(),
    });

    registry.join(RPG_ROOM, { onEvent: () => undefined, sinceSeq: 40 });
    registry.socketLive(); // attached and LIVE — no reconnect is coming to save the newcomer
    expect(requested).toEqual([40]);

    registry.join(RPG_ROOM, { onEvent: () => undefined, sinceSeq: 8 });

    // The wire now holds the LOWER mark, so the server restarts this room's pump at 8 and replays 8..40.
    expect(requested).toEqual([40, 8]);
  });

  test("a joiner that does NOT lower the room's request costs the wire nothing — N subscribers, ONE attach", () => {
    // The other half of #1484's fix: re-announcing on every join is safe ONLY because the dedupe drops the
    // ones that would repeat an identical attach. Without this arm the fix trades a starved subscriber for
    // a round-trip per mount — exactly the churn this registry's ref-counting exists to prevent.
    const registry = createRoomRegistry();
    const requested: (number | null)[] = [];
    registry.bindTransport({
      attach: (_ref, sinceSeq): Promise<void> => {
        requested.push(sinceSeq);
        return Promise.resolve();
      },
      detach: (): Promise<void> => Promise.resolve(),
    });

    registry.join(RPG_ROOM, { onEvent: () => undefined, sinceSeq: 8 });
    registry.socketLive();
    registry.join(RPG_ROOM, { onEvent: () => undefined, sinceSeq: 40 }); // a HIGHER mark — already covered
    registry.join(RPG_ROOM, { onEvent: () => undefined }); // live-only — wants no replay at all

    expect(requested).toEqual([8]);
  });

  test("a THUNK replay request is re-read at every announce — the reconnect heal's whole mechanism", () => {
    // A durable room's resume point moves as the client applies rows, so the re-announce must carry TODAY's
    // request (the chat bus passes its seq-guard high-water mark), not the one it joined with. A join-time
    // snapshot would re-attach a reconnecting room at a stale seq: either re-replaying the whole log every
    // time, or — after a shed/in-flight loss — asking for a cursor the client has already passed.
    const registry = createRoomRegistry();
    const requested: (number | null)[] = [];
    registry.bindTransport({
      attach: (_ref, sinceSeq): Promise<void> => {
        requested.push(sinceSeq);
        return Promise.resolve();
      },
      detach: (): Promise<void> => Promise.resolve(),
    });

    let applied: number | null = null;
    registry.join(USER_ROOM, { onEvent: () => undefined, sinceSeq: () => applied });
    registry.socketLive(); // first live edge — no re-announce
    applied = 41; // the client applies durable rows…
    registry.socketDown();
    registry.socketLive(); // …and the reconnect asks to resume from exactly there
    applied = 77;
    registry.socketDown();
    registry.socketLive();

    // The JOIN announced `null` (nothing applied yet), then each reconnect announced the CURRENT mark.
    expect(requested).toEqual([null, 41, 77]);
  });
});

// The announce is not a fire-and-forget nicety any more: the SERVER WAITS for it (the reconnect barrier in
// `stream/socket.ts` holds a durable room until it lands), so a swallowed failure costs the room ALL of its
// delivery for the life of the connection — silently, with the ping keeping the socket alive so nothing ever
// reconnects to retry. These pin the two halves of the answer: retry, then say so.
describe("a failed announce is retried, and never silently abandoned", () => {
  test("an announce that fails twice and then succeeds still attaches the room", async () => {
    // @orb-waive test-determinism(vi.useFakeTimers): legacy fake-timers usage not yet migrated to the frozen-clock composition seam; ends when this test adopts tests/support/clock.ts
    vi.useFakeTimers();
    const registry = createRoomRegistry();
    const attempts: (number | null)[] = [];
    let fail = 2;
    registry.bindTransport({
      attach: (_ref, sinceSeq): Promise<void> => {
        attempts.push(sinceSeq);
        if (fail > 0) {
          fail -= 1;
          return Promise.reject(new Error("network flap"));
        }
        return Promise.resolve();
      },
      detach: (): Promise<void> => Promise.resolve(),
    });
    const errors: string[] = [];

    registry.join(USER_ROOM, { onEvent: () => undefined, onError: (message) => errors.push(message), sinceSeq: 7 });
    await vi.advanceTimersByTimeAsync(2000);

    // Three attempts, the last one landing — and the replay request is re-read each time, so a retry never
    // resurrects a stale cursor.
    expect(attempts).toEqual([7, 7, 7]);
    expect(errors).toEqual([]);
  });

  test("an announce that exhausts its retries on a LIVE socket surfaces instead of holding it silently", async () => {
    // @orb-waive test-determinism(vi.useFakeTimers): legacy fake-timers usage not yet migrated to the frozen-clock composition seam; ends when this test adopts tests/support/clock.ts
    vi.useFakeTimers();
    const registry = createRoomRegistry();
    let calls = 0;
    registry.bindTransport({
      attach: (): Promise<void> => {
        calls += 1;
        return Promise.reject(new Error("refused"));
      },
      detach: (): Promise<void> => Promise.resolve(),
    });
    const errors: string[] = [];

    registry.socketLive();
    registry.join(USER_ROOM, { onEvent: () => undefined, onError: (message) => errors.push(message) });
    await vi.advanceTimersByTimeAsync(2000);

    expect(calls).toBe(3);
    // The room is genuinely not receiving; a live socket must not be allowed to look like a quiet chat.
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(ANNOUNCE_FAILED_COPY);
    // …and it says so WITHOUT naming a room: the always-on rooms fail on surfaces (home) where no room is
    // open, and "for this room" named nothing the reader could see (#215).
    expect(errors[0]).not.toMatch(ROOM_NOUN);
  });

  // ── ONE ALERT PER CAUSE (#215, side-eye home re-score 2026-08-18) ─────────────────────────────────────
  // A tab over the per-origin socket cap raised THREE alerts for ONE cause: the socket's own "Too many tabs
  // are open" (the only remedy that works) plus one identical "…for this room. Reload to try again." per
  // always-on room. The duplication is structural — every room announces independently — so it is deduped
  // at the PRODUCER, keyed on the cause, never in the toast surface where distinct causes would collapse too.

  test("a socket that never went live is the SOCKET's story: no room repeats it", async () => {
    // @orb-waive test-determinism(vi.useFakeTimers): legacy fake-timers usage not yet migrated to the frozen-clock composition seam; ends when this test adopts tests/support/clock.ts
    vi.useFakeTimers();
    const registry = createRoomRegistry();
    // `stream.attach` mints the socket cell, so the per-user cap refuses it with the same error the connect
    // got — every room's failure here IS the socket's failure, and `useOrbSocket` already named the remedy.
    registry.bindTransport({
      attach: (): Promise<void> => Promise.reject(new Error("Too many open streams (8). Close a tab and retry.")),
      detach: (): Promise<void> => Promise.resolve(),
    });
    const errors: string[] = [];
    const onError = (message: string): void => {
      errors.push(message);
    };

    registry.join(USER_ROOM, { onEvent: () => undefined, onError });
    registry.join({ channel: "notifications" }, { onEvent: () => undefined, onError });
    await vi.advanceTimersByTimeAsync(2000);

    expect(errors).toEqual([]);
  });

  test("with the socket live, N rooms failing for one hiccup is still ONE alert", async () => {
    // @orb-waive test-determinism(vi.useFakeTimers): legacy fake-timers usage not yet migrated to the frozen-clock composition seam; ends when this test adopts tests/support/clock.ts
    vi.useFakeTimers();
    const registry = createRoomRegistry();
    registry.bindTransport({
      attach: (): Promise<void> => Promise.reject(new Error("hiccup")),
      detach: (): Promise<void> => Promise.resolve(),
    });
    const errors: string[] = [];
    const onError = (message: string): void => {
      errors.push(message);
    };

    registry.socketLive();
    registry.join(USER_ROOM, { onEvent: () => undefined, onError });
    registry.join({ channel: "notifications" }, { onEvent: () => undefined, onError });
    await vi.advanceTimersByTimeAsync(2000);

    expect(errors).toHaveLength(1);

    // …and the NEXT live edge re-arms it: a later episode is a new thing that happened.
    registry.socketDown();
    registry.socketLive();
    await vi.advanceTimersByTimeAsync(2000);
    expect(errors).toHaveLength(2);
  });

  test("a room LEFT mid-retry stops retrying — a torn-down surface never announces or errors", async () => {
    // @orb-waive test-determinism(vi.useFakeTimers): legacy fake-timers usage not yet migrated to the frozen-clock composition seam; ends when this test adopts tests/support/clock.ts
    vi.useFakeTimers();
    const registry = createRoomRegistry();
    let calls = 0;
    registry.bindTransport({
      attach: (): Promise<void> => {
        calls += 1;
        return Promise.reject(new Error("flap"));
      },
      detach: (): Promise<void> => Promise.resolve(),
    });
    const errors: string[] = [];

    const leave = registry.join(USER_ROOM, { onEvent: () => undefined, onError: (message) => errors.push(message) });
    await vi.advanceTimersByTimeAsync(0); // the first attempt has failed; a backoff is pending
    leave();
    await vi.advanceTimersByTimeAsync(2000);

    expect(calls).toBe(1);
    expect(errors).toEqual([]);
  });
});
