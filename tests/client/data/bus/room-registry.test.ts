// The client room registry (data/bus/room-registry.ts) — the half of the multiplex that decides when
// "a component wants this room" becomes an attach on the wire. The CT drives it through a real browser;
// these pin the decisions themselves, which are the ones that used to be invisible network facts:
//   • N subscribers of one room cost ONE attach, and only the LAST leaver detaches,
//   • a join made before the socket mounted is flushed on bind (children commit before their parent),
//   • a reconnect re-announces (the 60s cell reap would otherwise strand a slept laptop) but the FIRST
//     live edge does not (every room already announced itself),
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

describe("the live edge", () => {
  test("the FIRST live edge heals but does NOT re-announce (the join already did)", () => {
    const registry = createRoomRegistry();
    const wire = fakeTransport();
    registry.bindTransport(wire.transport);
    let heals = 0;
    registry.join(USER_ROOM, {
      onEvent: () => undefined,
      onSocketLive: (): void => {
        heals += 1;
      },
    });

    registry.socketLive();

    expect(wire.attached).toEqual([USER_ROOM]);
    expect(heals).toBe(1);
  });

  test("a RECONNECT re-announces every room — the server may have reaped the cell", () => {
    const registry = createRoomRegistry();
    const wire = fakeTransport();
    registry.bindTransport(wire.transport);
    let heals = 0;
    registry.join(USER_ROOM, {
      onEvent: () => undefined,
      onSocketLive: (): void => {
        heals += 1;
      },
    });
    registry.socketLive(); // first connect

    registry.socketLive(); // reconnect

    expect(wire.attached).toEqual([USER_ROOM, USER_ROOM]);
    expect(heals).toBe(2);
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
});
