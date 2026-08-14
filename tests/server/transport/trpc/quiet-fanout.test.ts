// transport/trpc/quiet-fanout — the BULK COALESCER's ROOM-plane half (entity→room bridge §5 / fork F-B).
// The user-plane half is pinned against its own wire in `user-events-bus.test.ts`; what is left, and what
// nothing else can see, is the property that made this module move out of `user-events-bus.ts` in the first
// place: ONE scope now spans TWO planes.
//
// Every arm below is written A/B against the UNWRAPPED control in the same run, because the control IS the
// defect: a profile import touching N seated entities fans N×rooms `roomEntityChanged`, and each tick
// cancels+restarts every open member's in-flight refetch (the same storm math W8 contained on the user
// plane, `invalidation.ts`'s own measured note).
//
// The seam under test is `silenceRoomEntityFan(chatId, entity, terminal)` — the room plane's registration
// door — driven exactly as `entry/compose/services::emitChatEventLive` drives it: consult, and publish only
// if it returns false. The `fan()` helper below is that call shape and nothing else, so an arm here cannot
// pass by testing a different policy than the emit surface applies.

import type { RoomEntityKind } from "@orb/contracts/chat";
import type { ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { publishUserEvent, silenceRoomEntityFan, subscribeUserEvents, withQuietBulkFanout } from "@orb/server/transport/trpc";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const ROOM_A = castId<ChatId>("chat_quiet_a");
const ROOM_B = castId<ChatId>("chat_quiet_b");
/** An N big enough that "1 + 1 regardless of N" is a claim about the mechanism, not a coincidence. */
const STORM = 40;

/** What reached the wire, as `<room>/<entity>` — the fan is id-free, so the pair IS the whole payload. */
let delivered: string[];

/** The emit surface's own shape: consult the coalescer, publish iff it declined to silence. */
function fan(chatId: ChatId, entity: RoomEntityKind): void {
  const publish = (): void => {
    delivered.push(`${chatId}/${entity}`);
  };
  if (silenceRoomEntityFan(chatId, entity, publish)) {
    return;
  }
  publish();
}

describe("quiet-fanout — the ROOM plane (chatId, entity) pairs", () => {
  test("an N-item bulk run fans 1 + 1 per pair; the same storm UNWRAPPED fans N", async () => {
    delivered = [];
    // The control, in the same run — this is the pre-F-B behaviour, and the number it produces is the defect.
    for (let i = 0; i < STORM; i += 1) {
      fan(ROOM_A, "character");
    }
    expect(delivered).toHaveLength(STORM);

    delivered = [];
    await withQuietBulkFanout(async () => {
      for (let i = 0; i < STORM; i += 1) {
        fan(ROOM_A, "character");
      }
      return await Promise.resolve();
    });
    // START MARKER (so an open member repaints at the top of the run instead of staring at pre-run data for
    // minutes) + ONE terminal. The terminal needs no coarse FORM: `roomEntityChanged` is already id-free.
    expect(delivered).toEqual(["chat_quiet_a/character", "chat_quiet_a/character"]);
  });

  test("the pair is (room, ENTITY KIND) — two kinds in two rooms coalesce to four pairs, never to one", async () => {
    delivered = [];
    await withQuietBulkFanout(async () => {
      for (let i = 0; i < STORM; i += 1) {
        fan(ROOM_A, "character");
        fan(ROOM_A, "persona");
        fan(ROOM_B, "character");
        fan(ROOM_B, "world-info");
      }
      return await Promise.resolve();
    });
    // 4 start markers + 4 terminals. A coalescer keyed on the ROOM alone would collapse A's persona edit into
    // A's character edit and leave the member's roster stale; one keyed on the KIND alone would leak B's
    // refetch into A. Both failures look like "it works" until a bulk run touches two kinds.
    expect(delivered).toHaveLength(8);
    expect(delivered.slice(0, 4)).toEqual(["chat_quiet_a/character", "chat_quiet_a/persona", "chat_quiet_b/character", "chat_quiet_b/world-info"]);
    expect(delivered.slice(4).toSorted()).toEqual(["chat_quiet_a/character", "chat_quiet_a/persona", "chat_quiet_b/character", "chat_quiet_b/world-info"]);
  });

  test("a run that THROWS still fans its room terminals (the finally-shaped emit law, on this plane too)", async () => {
    delivered = [];
    const boom = new Error("import aborted mid-sweep");
    await expect(
      withQuietBulkFanout(async () => {
        fan(ROOM_A, "character");
        fan(ROOM_A, "character");
        await Promise.resolve();
        throw boom;
      }),
    ).rejects.toThrow(boom);
    // Silencing a room fan and then dying is strictly worse than never silencing it: the member is left on a
    // stale projection with nothing coming.
    expect(delivered).toEqual(["chat_quiet_a/character", "chat_quiet_a/character"]);
  });

  test("a room fan from OUTSIDE the scope is never silenced, even for a room the run is touching", async () => {
    delivered = [];
    let release = (): void => {
      // Replaced synchronously by the promise executor below.
    };
    const bulk = withQuietBulkFanout(async () => {
      fan(ROOM_A, "character");
      fan(ROOM_A, "character");
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    await Promise.resolve();
    // The async-context scoping rationale, on the room plane: a HUMAN editing that same seated card from
    // another tab mid-import must still repaint the room. Raised outside `quietScope.run`, so it passes.
    fan(ROOM_A, "character");
    expect(delivered).toEqual(["chat_quiet_a/character", "chat_quiet_a/character"]);

    release();
    await bulk;
    expect(delivered).toHaveLength(3);
  });

  test("ONE scope, TWO planes — the same bulk run coalesces user events and room fans independently", async () => {
    // THE REASON THIS MODULE EXISTS SEPARATELY FROM EITHER BUS. A profile import silences both planes at
    // once, and neither may swallow the other's start marker: a shared key space would make the first
    // `charactersChanged` count as the first `roomEntityChanged`, so one of the two planes would lose its
    // marker and repaint only at the end of a ten-minute run.
    delivered = [];
    const owner = castId<UserId>("user_quiet_two_plane");
    const userEvents: string[] = [];
    const abort = new AbortController();
    void (async (): Promise<void> => {
      for await (const event of subscribeUserEvents(owner, abort.signal)) {
        userEvents.push(event.type);
      }
    })().catch(() => {
      // The abort below ends the generator; nothing to report.
    });

    await withQuietBulkFanout(async () => {
      for (let i = 0; i < STORM; i += 1) {
        publishUserEvent(owner, { type: "charactersChanged" });
        fan(ROOM_A, "character");
      }
      return await Promise.resolve();
    });
    // `on()` buffers synchronously at publish; a couple of macrotask turns lands them in the collector.
    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setImmediate(resolve));
    abort.abort();

    expect(delivered).toEqual(["chat_quiet_a/character", "chat_quiet_a/character"]);
    expect(userEvents).toEqual(["charactersChanged", "charactersChanged"]);
  });
});
