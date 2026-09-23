// The socket registry (transport/trpc/stream/socket-registry.ts) — the cell that outlives its own socket.
// These are the lifecycle properties the multiplex rests on, and every one of them is a race or a leak if
// it's wrong:
//   • order-independent creation (attach-before-connect AND connect-before-attach),
//   • attach→detach before connect collapsing to NO room (a command log would have replayed both),
//   • a foreign socketId collapsing to a leak-free NOT_FOUND — not a hijack, not a FORBIDDEN oracle,
//   • the two caps refusing rather than growing,
//   • reap AFTER the window, never before (a 3s EventSource retry must find its cell),
//   • a reconnect adopting the SAME cell, with its cursors,
//   • and (W7a) EVICTION on session death — per SESSION for logout, per USER for an admin revoke.

import type { StreamRoomRef } from "@orb/contracts/stream";
import { DomainNotFoundError, DomainRateLimitError } from "@orb/kit/errors";
import type { ChatId, SessionId, SocketId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SocketListener } from "@orb/server/transport/trpc";
import { createSocketRegistry, ROOMS_PER_SOCKET, SOCKET_REAP_MS, SOCKETS_PER_USER } from "@orb/server/transport/trpc";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";

const ALICE = castId<UserId>("user_alice");
const MALLORY = castId<UserId>("user_mallory");
const SOCKET = castId<SocketId>("socket_a");
// The two devices ONE human is signed in on — the shape the per-SESSION ruling (F4) exists for.
const PHONE = castId<SessionId>("sess_phone");
const DESKTOP = castId<SessionId>("sess_desktop");
const USER_ROOM: StreamRoomRef = { channel: "user" };
const rpgRoom = (n: number): StreamRoomRef => ({ channel: "rpg", chatId: castId<ChatId>(`chat_${n}`) });

/** An inert listener — also the OWNER TOKEN a `goDark` has to present (a superseded generator's teardown
 *  must not dark a cell that a successor already took over), so a test holds the one it went live with. */
function inertListener(): SocketListener {
  return { onAttach: () => undefined, onAnnounce: () => undefined, onDetach: () => undefined, onEvicted: () => undefined };
}

/** A registry over a hand-driven clock — reap is a TIME property, so it must never read the wall clock. */
function fixedClock(): { registry: ReturnType<typeof createSocketRegistry>; advance: (ms: number) => void } {
  let at = 1000;
  const registry = createSocketRegistry(() => at);
  return {
    registry,
    advance: (ms): void => {
      at += ms;
    },
  };
}

describe("cell creation is order-independent", () => {
  test("attach BEFORE connect: the cell exists with the room, and connect re-hydrates it", () => {
    const { registry } = fixedClock();
    registry.attach(ALICE, SOCKET, USER_ROOM, null);

    const cell = registry.adopt(ALICE, SOCKET, null);

    expect([...cell.rooms.keys()]).toEqual(["user"]);
    expect(cell.userId).toBe(ALICE);
  });

  test("connect BEFORE attach: the live cell picks the room up through its listener", () => {
    const { registry } = fixedClock();
    const cell = registry.adopt(ALICE, SOCKET, null);
    const attached: StreamRoomRef[] = [];
    registry.goLive(cell, { ...inertListener(), onAttach: (ref) => attached.push(ref) });

    registry.attach(ALICE, SOCKET, USER_ROOM, null);

    expect(attached).toEqual([USER_ROOM]);
    expect([...cell.rooms.keys()]).toEqual(["user"]);
  });

  test("attach then detach BEFORE connect collapses to NO room (desired state, not a command log)", () => {
    const { registry } = fixedClock();
    registry.attach(ALICE, SOCKET, USER_ROOM, null);
    registry.detach(ALICE, SOCKET, USER_ROOM);

    expect([...registry.adopt(ALICE, SOCKET, null).rooms.keys()]).toEqual([]);
  });
});

describe("the socket is bound to ONE principal", () => {
  test("a stranger adopting a foreign socketId gets a leak-free NOT_FOUND, never the cell", () => {
    const { registry } = fixedClock();
    registry.attach(ALICE, SOCKET, USER_ROOM, null);

    expect(() => registry.adopt(MALLORY, SOCKET, null)).toThrow(DomainNotFoundError);
    // …and Alice's cell is untouched by the attempt.
    expect([...registry.adopt(ALICE, SOCKET, null).rooms.keys()]).toEqual(["user"]);
  });

  test("a stranger cannot attach a room onto, or detach a room from, a foreign socket", () => {
    const { registry } = fixedClock();
    registry.attach(ALICE, SOCKET, USER_ROOM, null);

    expect(() => registry.attach(MALLORY, SOCKET, rpgRoom(1), null)).toThrow(DomainNotFoundError);
    expect(() => registry.detach(MALLORY, SOCKET, USER_ROOM)).toThrow(DomainNotFoundError);
    expect([...registry.adopt(ALICE, SOCKET, null).rooms.keys()]).toEqual(["user"]);
  });
});

describe("the caps refuse instead of growing", () => {
  test("the 33rd room on one socket is refused; the 32 already attached are kept", () => {
    const { registry } = fixedClock();
    for (let i = 0; i < ROOMS_PER_SOCKET; i++) {
      registry.attach(ALICE, SOCKET, rpgRoom(i), null);
    }

    expect(() => registry.attach(ALICE, SOCKET, rpgRoom(ROOMS_PER_SOCKET), null)).toThrow(DomainRateLimitError);
    expect(registry.adopt(ALICE, SOCKET, null).rooms.size).toBe(ROOMS_PER_SOCKET);
  });

  test("the 9th LIVE socket for one user is refused — and another user is unaffected", () => {
    const { registry } = fixedClock();
    for (let i = 0; i < SOCKETS_PER_USER; i++) {
      const cell = registry.adopt(ALICE, castId<SocketId>(`socket_${i}`), null);
      registry.goLive(cell, inertListener());
    }

    expect(() => registry.adopt(ALICE, castId<SocketId>("socket_overflow"), null)).toThrow(DomainRateLimitError);
    expect(() => registry.adopt(MALLORY, castId<SocketId>("socket_mallory"), null)).not.toThrow();
  });

  test("cap pressure evicts the oldest DARK reconnect cell instead of refusing a new live tab", () => {
    const { registry, advance } = fixedClock();
    const oldestId = castId<SocketId>("socket_dark_oldest");
    const oldest = registry.adopt(ALICE, oldestId, null);
    registry.attach(ALICE, oldestId, USER_ROOM, null);
    advance(1);

    const newerId = castId<SocketId>("socket_dark_newer");
    const newer = registry.adopt(ALICE, newerId, null);
    registry.attach(ALICE, newerId, rpgRoom(1), null);
    for (let i = 0; i < SOCKETS_PER_USER - 2; i++) {
      const cell = registry.adopt(ALICE, castId<SocketId>(`socket_live_${i}`), null);
      registry.goLive(cell, inertListener());
    }

    expect(() => registry.adopt(ALICE, castId<SocketId>("socket_replacement"), null)).not.toThrow();
    expect(registry.liveSocketCount(ALICE)).toBe(SOCKETS_PER_USER - 2);

    // Detach reaches a registered cell. The old object retaining its room proves it was the one removed;
    // the newer dark cell remains reconnectable and receives its detach normally.
    registry.detach(ALICE, oldestId, USER_ROOM);
    registry.detach(ALICE, newerId, rpgRoom(1));
    expect([...oldest.rooms.keys()]).toEqual(["user"]);
    expect(newer.rooms.size).toBe(0);
  });
});

describe("reaping and reconnect", () => {
  test("a dark cell survives the retry window and is reaped only AFTER it", () => {
    const { registry, advance } = fixedClock();
    const cell = registry.adopt(ALICE, SOCKET, null);
    const listener = inertListener();
    registry.goLive(cell, listener);
    registry.attach(ALICE, SOCKET, USER_ROOM, null);
    registry.goDark(cell, listener);

    advance(SOCKET_REAP_MS - 1);
    expect(registry.reap()).toBe(0);
    expect([...registry.adopt(ALICE, SOCKET, null).rooms.keys()]).toEqual(["user"]);

    advance(2);
    expect(registry.reap()).toBe(1);
    // A fresh cell — the rooms are gone with it (the client re-announces on its live edge).
    expect([...registry.adopt(ALICE, SOCKET, null).rooms.keys()]).toEqual([]);
  });

  test("a LIVE cell is never reaped, however long it has been connected", () => {
    const { registry, advance } = fixedClock();
    const cell = registry.adopt(ALICE, SOCKET, null);
    registry.goLive(cell, inertListener());

    advance(SOCKET_REAP_MS * 10);

    expect(registry.reap()).toBe(0);
    expect(registry.liveSocketCount(ALICE)).toBe(1);
  });

  test("a reconnect adopts the SAME cell, keeping each room's cursor", () => {
    const { registry, advance } = fixedClock();
    const first = registry.adopt(ALICE, SOCKET, null);
    const listener = inertListener();
    registry.goLive(first, listener);
    registry.attach(ALICE, SOCKET, USER_ROOM, null);
    const room = first.rooms.get("user");
    expect(room).toBeDefined();
    if (room !== undefined) {
      room.cursor = 42; // what a durable pump would have stamped
    }
    registry.goDark(first, listener);

    advance(3000); // the EventSource retry window
    const second = registry.adopt(ALICE, SOCKET, null);

    expect(second).toBe(first);
    expect(second.rooms.get("user")?.cursor).toBe(42);
  });
});

describe("re-attach is idempotent, and only a LOWER cursor means anything", () => {
  test("a re-attach at the same/higher cursor does not rewind the room forward — it ANNOUNCES instead", () => {
    const { registry } = fixedClock();
    const cell = registry.adopt(ALICE, SOCKET, null);
    const attaches: (number | null)[] = [];
    const announces: StreamRoomRef[] = [];
    registry.goLive(cell, { ...inertListener(), onAttach: (_ref, cursor) => attaches.push(cursor), onAnnounce: (ref) => announces.push(ref) });
    registry.attach(ALICE, SOCKET, USER_ROOM, 10);

    registry.attach(ALICE, SOCKET, USER_ROOM, 99);

    expect(cell.rooms.get("user")?.cursor).toBe(10);
    expect(attaches).toEqual([10]); // the second attach started no pump…
    // …but it is not silent: the socket needs to hear "the client still wants this room, and is not behind"
    // to lift a reconnect barrier that would otherwise hold the room forever (the announce carries no rewind
    // precisely when the client lost nothing).
    expect(announces).toEqual([USER_ROOM]);
  });

  test("a re-attach at a LOWER cursor IS a replay request and restarts the room there", () => {
    const { registry } = fixedClock();
    const cell = registry.adopt(ALICE, SOCKET, null);
    const attaches: (number | null)[] = [];
    const announces: StreamRoomRef[] = [];
    registry.goLive(cell, { ...inertListener(), onAttach: (_ref, cursor) => attaches.push(cursor), onAnnounce: (ref) => announces.push(ref) });
    registry.attach(ALICE, SOCKET, USER_ROOM, 10);

    registry.attach(ALICE, SOCKET, USER_ROOM, 0);

    expect(cell.rooms.get("user")?.cursor).toBe(0);
    expect(attaches).toEqual([10, 0]);
    // A rewind is an attach, never also an announce — one signal per call, so the socket cannot double-start.
    expect(announces).toEqual([]);
  });

  test("the reconnect barrier's flag: `announced` clears when the socket goes dark and returns on the re-attach", () => {
    // The server cursor counts what it handed a dying socket's WRITER, so a resumable room must not resume
    // until the client has said where IT got to. `announcedFor` is that state, and it is per CONNECTION —
    // an EPOCH rather than a flag, because the barrier cannot wait for the previous generator to die (a
    // half-open socket defers that for minutes while the client is already back).
    const { registry } = fixedClock();
    const cell = registry.adopt(ALICE, SOCKET, null);

    // The attach that MINTS the room lands while the cell is dark — it counts for the connection about to
    // take over, which is what makes the first connect deliver instead of deadlocking on the barrier.
    registry.attach(ALICE, SOCKET, USER_ROOM, null);
    expect(cell.rooms.get("user")?.announcedFor).toBe(1);
    const first = inertListener();
    registry.goLive(cell, first);
    expect(cell.connectionSeq).toBe(1);

    // A RECONNECT bumps the epoch, so the room's old announce no longer matches — the barrier is armed
    // WITHOUT the previous generator's teardown having run (it has not, here).
    const second = inertListener();
    registry.goLive(cell, second);
    expect(cell.connectionSeq).toBe(2);
    expect(cell.rooms.get("user")?.announcedFor).toBe(1);

    // …and the client's re-announce on the new connection lifts it.
    registry.attach(ALICE, SOCKET, USER_ROOM, null);
    expect(cell.rooms.get("user")?.announcedFor).toBe(2);
  });

  test("an announce that lands while the cell is DARK counts for the NEXT connection", () => {
    // Order-independence, the same property cell creation has: the re-announce POST can beat the
    // reconnected EventSource, and the barrier must not hold a room whose client already spoke.
    const { registry } = fixedClock();
    const cell = registry.adopt(ALICE, SOCKET, null);
    const first = inertListener();
    registry.attach(ALICE, SOCKET, USER_ROOM, null);
    registry.goLive(cell, first);
    registry.goDark(cell, first);

    registry.attach(ALICE, SOCKET, USER_ROOM, null); // while dark

    const second = inertListener();
    registry.goLive(cell, second);
    expect(cell.rooms.get("user")?.announcedFor).toBe(cell.connectionSeq);
  });

  test("a SUPERSEDED generator is evicted, and its late teardown cannot dark the live cell", () => {
    // The half-open-TCP overlap: the client reconnects at 45s while the server is still buffering writes
    // into a dead socket. Two generators legitimately share the cell — but only one owns it.
    const { registry } = fixedClock();
    const cell = registry.adopt(ALICE, SOCKET, null);
    let evicted = 0;
    const zombie: SocketListener = {
      ...inertListener(),
      onEvicted: (): void => {
        evicted += 1;
      },
    };
    registry.goLive(cell, zombie);

    const live = inertListener();
    registry.goLive(cell, live); // takeover

    expect(evicted).toBe(1); // the predecessor was told to stop producing
    expect(cell.listener).toBe(live);

    // The zombie's `finally` finally runs, minutes later. It must change NOTHING: a cleared listener would
    // silence every room on the live socket, and a dark+timestamped cell is reap-eligible WHILE serving.
    registry.goDark(cell, zombie);

    expect(cell.live).toBe(true);
    expect(cell.listener).toBe(live);
    expect(cell.lastSeenAt).toBeNull();
    expect(registry.liveSocketCount(ALICE)).toBe(1);
  });

  test("detaching a room nobody attached is a no-op, not an error", () => {
    const { registry } = fixedClock();
    registry.adopt(ALICE, SOCKET, null);

    expect(() => registry.detach(ALICE, SOCKET, rpgRoom(7))).not.toThrow();
    // …and an unknown socket entirely is equally inert (a client tearing down after a reap).
    expect(() => registry.detach(ALICE, castId<SocketId>("socket_ghost"), USER_ROOM)).not.toThrow();
  });
});

// W7a — SESSION DEATH → SOCKET DEATH.
// A socket freezes its Principal at connect and lives for the connection's lifetime, so before this a
// revoked cookie left its stream running: the tab kept receiving events until the socket died of natural
// causes. Two granularities, and the DIFFERENCE between them is the ruling — logout is per SESSION (the
// phone must not close the desktop), admin revoke is per USER.

describe("eviction on session death (W7a)", () => {
  /** Two live sockets for ONE human, on two different sessions — the multi-device shape F4 turns on. */
  function twoDevices(): { registry: ReturnType<typeof createSocketRegistry>; stopped: string[] } {
    const { registry } = fixedClock();
    const stopped: string[] = [];
    const phoneCell = registry.adopt(ALICE, castId<SocketId>("socket_phone"), PHONE);
    registry.goLive(phoneCell, { ...inertListener(), onEvicted: () => stopped.push("phone") });
    const deskCell = registry.adopt(ALICE, castId<SocketId>("socket_desktop"), DESKTOP);
    registry.goLive(deskCell, { ...inertListener(), onEvicted: () => stopped.push("desktop") });
    return { registry, stopped };
  }

  test("LOGOUT: evicting one session closes THAT device's socket and leaves the other's alone", () => {
    const { registry, stopped } = twoDevices();

    expect(registry.evictSession(PHONE)).toBe(1);

    expect(stopped).toEqual(["phone"]);
  });

  test("ADMIN REVOKE: evicting the USER closes both of that human's sockets", () => {
    const { registry, stopped } = twoDevices();

    expect(registry.evictUser(ALICE)).toBe(2);

    expect(stopped).toEqual(["phone", "desktop"]);
  });

  test("another human's socket is never touched by either arm", () => {
    const { registry } = fixedClock();
    const theirs = registry.adopt(MALLORY, castId<SocketId>("socket_mallory"), castId<SessionId>("sess_mallory"));
    let stopped = 0;
    registry.goLive(theirs, {
      ...inertListener(),
      onEvicted: (): void => {
        stopped += 1;
      },
    });

    expect(registry.evictSession(PHONE)).toBe(0);
    expect(registry.evictUser(ALICE)).toBe(0);
    expect(stopped).toBe(0);
  });

  test("a SESSIONLESS socket (owner fallback / header SSO) survives evictSession but not evictUser", () => {
    // Those arms mint no `sessions` row, so no session id can name them — which is exactly why the admin/
    // disable arm has to be per-USER rather than a loop over revoked session ids.
    const { registry } = fixedClock();
    const cell = registry.adopt(ALICE, SOCKET, null);
    let stopped = 0;
    registry.goLive(cell, {
      ...inertListener(),
      onEvicted: (): void => {
        stopped += 1;
      },
    });

    expect(registry.evictSession(PHONE)).toBe(0);
    expect(stopped).toBe(0);
    expect(registry.evictUser(ALICE)).toBe(1);
    expect(stopped).toBe(1);
  });

  test("a RECONNECT re-stamps the session — a re-login is not evicted by the session it replaced", () => {
    // The cell survives its own socket, so a stale stamp would make the NEXT logout evict nothing (and the
    // PREVIOUS session's logout kill a connection it no longer owns).
    const { registry } = fixedClock();
    const first = registry.adopt(ALICE, SOCKET, PHONE);
    const listener = inertListener();
    registry.goLive(first, listener);
    registry.goDark(first, listener);

    const second = registry.adopt(ALICE, SOCKET, DESKTOP);
    let stopped = 0;
    registry.goLive(second, {
      ...inertListener(),
      onEvicted: (): void => {
        stopped += 1;
      },
    });

    expect(registry.evictSession(PHONE)).toBe(0);
    expect(stopped).toBe(0);
    expect(registry.evictSession(DESKTOP)).toBe(1);
  });

  test("an ATTACH never blanks the stamp — order-independence must not disarm the eviction", () => {
    // `attach` may MINT the cell (attach-before-connect), so it goes through a create-or-return that leaves
    // the stamp alone. Overwriting it here would silently unhook logout from every announcing tab.
    const { registry } = fixedClock();
    const cell = registry.adopt(ALICE, SOCKET, PHONE);
    registry.goLive(cell, inertListener());

    registry.attach(ALICE, SOCKET, USER_ROOM, null);

    expect(cell.sessionId).toBe(PHONE);
  });

  test("eviction keeps the cell's ROOMS — the surviving-device reconnect resumes them", () => {
    // Eviction is a STOP signal, not a teardown: a device whose own cookie is still valid reconnects and
    // resumes through the existing barrier. (The dark/reap transition is the generator's own `goDark`.)
    const { registry } = fixedClock();
    const cell = registry.adopt(ALICE, SOCKET, PHONE);
    registry.goLive(cell, inertListener());
    registry.attach(ALICE, SOCKET, USER_ROOM, 12);

    registry.evictSession(PHONE);

    expect([...cell.rooms.keys()]).toEqual(["user"]);
    expect(cell.rooms.get("user")?.cursor).toBe(12);
  });

  test("a DARK cell is not evicted — there is no generator to stop", () => {
    const { registry } = fixedClock();
    const cell = registry.adopt(ALICE, SOCKET, PHONE);
    const listener = inertListener();
    registry.goLive(cell, listener);
    registry.goDark(cell, listener);

    expect(registry.evictSession(PHONE)).toBe(0);
    expect(registry.evictUser(ALICE)).toBe(0);
  });
});

describe("the live-socket counter (the starvation regression pin)", () => {
  test("counts LIVE sockets only, per user and overall", () => {
    const { registry } = fixedClock();
    const one = registry.adopt(ALICE, castId<SocketId>("socket_1"), null);
    const two = registry.adopt(ALICE, castId<SocketId>("socket_2"), null);
    const theirs = registry.adopt(MALLORY, castId<SocketId>("socket_3"), null);
    const oneListener = inertListener();
    registry.goLive(one, oneListener);
    registry.goLive(theirs, inertListener());

    expect(registry.liveSocketCount(ALICE)).toBe(1); // `two` was adopted but never connected
    expect(registry.liveSocketCount()).toBe(2);

    registry.goLive(two, inertListener());
    expect(registry.liveSocketCount(ALICE)).toBe(2);

    registry.goDark(one, oneListener);
    expect(registry.liveSocketCount(ALICE)).toBe(1);
  });
});
