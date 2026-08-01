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
//   • a frame for a room nobody joined is dropped, never fanned out.

import type { RoomTransport } from "@orb/client/data";
import { createRoomRegistry } from "@orb/client/data";
import type { StreamDataFrame, StreamRoomRef } from "@orb/contracts/stream";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures";

const CHAT = castId<ChatId>("chat_reg_1");
const USER_ROOM: StreamRoomRef = { channel: "user" };
const RPG_ROOM: StreamRoomRef = { channel: "rpg", chatId: CHAT };
const USER_FRAME: StreamDataFrame = { channel: "user", event: { type: "tagsChanged" } };
const RPG_FRAME: StreamDataFrame = { channel: "rpg", chatId: CHAT, event: { type: "gameChanged", chatId: CHAT } };

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
    const registry = createRoomRegistry();
    const wire = fakeTransport();
    registry.bindTransport(wire.transport);

    const leaveA = registry.join(RPG_ROOM, { onEvent: () => undefined });
    const leaveB = registry.join(RPG_ROOM, { onEvent: () => undefined });

    expect(wire.attached).toEqual([RPG_ROOM]);

    leaveA();
    expect(wire.detached).toEqual([]);
    expect(registry.joined()).toEqual([`rpg:${CHAT}`]);

    leaveB();
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
    const registry = createRoomRegistry();
    registry.bindTransport(fakeTransport().transport);
    registry.socketLive();
    healCounter(registry, RPG_ROOM).leave(); // opened a game chat, then switched away

    const rejoined = healCounter(registry, RPG_ROOM); // …and switched back

    expect(rejoined.count()).toBe(1);
  });

  test("the gate is per ROOM — one room's history never heals another", () => {
    const registry = createRoomRegistry();
    registry.bindTransport(fakeTransport().transport);
    registry.socketLive();
    healCounter(registry, USER_ROOM).leave();

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

  test("roomFailed reaches only the failed room; a SOCKET fault reaches every room", () => {
    const registry = createRoomRegistry();
    registry.bindTransport(fakeTransport().transport);
    const userErrors: string[] = [];
    const rpgErrors: string[] = [];
    registry.join(USER_ROOM, { onEvent: () => undefined, onError: (m) => userErrors.push(m) });
    registry.join(RPG_ROOM, { onEvent: () => undefined, onError: (m) => rpgErrors.push(m) });

    registry.failed("room is gone", RPG_ROOM);
    expect(rpgErrors).toEqual(["room is gone"]);
    expect(userErrors).toEqual([]);

    registry.failed("the socket died");
    expect(userErrors).toEqual(["the socket died"]);
    expect(rpgErrors).toEqual(["room is gone", "the socket died"]);
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
    registry.join(USER_ROOM, { onEvent: () => undefined, sinceSeq: 0 });
    registry.socketLive();
    registry.socketLive(); // reconnect → re-announce with the merged request

    expect(requested).toEqual([12, 0]);
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
