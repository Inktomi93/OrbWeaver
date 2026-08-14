// transport/trpc/user-events-bus (PD user-bus lane) — the per-USER live fan-out the
// `sessions.streamUserEvents` subscription tails. THE load-bearing property: a subscriber receives ONLY its
// own `userId` channel — an emit for user A reaches A's stream and NEVER B's (the isolation assertion; the
// channel key is `ctx.auth.userId`, never client input). Pure module test over the process-local
// `EventEmitter` (`on()` buffers from subscribe, so publishing after subscribe loses nothing).
//
// Second surface, ADJACENT module: QUIET MODE (`withQuietBulkFanout`, W8 / owner fork F5) — the bulk-emit
// coalescer, which moved to `transport/trpc/quiet-fanout.ts` when it learned ROOM pairs as well as user ones
// (bridge design §5 / fork F-G; the room-plane half is pinned in `quiet-fanout.test.ts`). Its USER-plane
// behaviour is still proven here, against this bus's own wire. The pins below are written as A/B against the
// UNWRAPPED control in the same run, because that control IS the defect: N per-item emits deliver N events,
// which is what churned the visible library for the length of an ST import (staleness design §2.5).

import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { publishUserEvent, subscribeUserEvents, withQuietBulkFanout } from "@orb/server/transport/trpc";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const USER_A = castId<UserId>("user_a");
const USER_B = castId<UserId>("user_b");

/** Read the next event off a live stream — `on()` already buffered anything published after subscribe. */
async function next(stream: AsyncIterable<UserBusEvent>): Promise<UserBusEvent> {
  for await (const event of stream) {
    return event;
  }
  throw new Error("stream ended without yielding");
}

describe("user-events-bus — per-user channel isolation", () => {
  test("an emit for user A reaches A's stream and NEVER B's", async () => {
    const abortA = new AbortController();
    const abortB = new AbortController();
    const streamA = subscribeUserEvents(USER_A, abortA.signal);
    const streamB = subscribeUserEvents(USER_B, abortB.signal);

    const eventA: UserBusEvent = {
      type: "personasChanged",
      personaId: castId<PersonaId>("persona_a"),
    };
    const eventB: UserBusEvent = { type: "charactersChanged" };

    // Publish A's event to A's channel, then B's event to B's channel. If A's event leaked onto B's channel,
    // B's FIRST yield would be A's `personasChanged` — instead it must be B's own `charactersChanged`.
    publishUserEvent(USER_A, eventA);
    publishUserEvent(USER_B, eventB);

    expect(await next(streamA)).toEqual(eventA);
    expect(await next(streamB)).toEqual(eventB);

    abortA.abort();
    abortB.abort();
  });

  test("a second emit for B never appears on A's channel", async () => {
    const abortA = new AbortController();
    const streamA = subscribeUserEvents(USER_A, abortA.signal);

    // Two B emits then one A emit. A's first (and only) yield must be the A event — proving neither B emit
    // crossed channels (A would otherwise yield a `tagsChanged`/`presetsChanged` first).
    publishUserEvent(USER_B, { type: "tagsChanged" });
    publishUserEvent(USER_B, { type: "presetsChanged" });
    const aEvent: UserBusEvent = { type: "settingsChanged" };
    publishUserEvent(USER_A, aEvent);

    expect(await next(streamA)).toEqual(aEvent);

    abortA.abort();
  });
});

// ── QUIET MODE ────────────────────────────────────────────────────────────────────────────────────────────
// Every pin here uses a DRAINING collector rather than `next()`: the whole point is HOW MANY events arrive,
// so a helper that reads exactly one would assert the opposite of what matters.

/** Attach a background drain to `userId`'s channel and hand back the (growing) received list + a stop. */
function collect(userId: UserId): { readonly events: UserBusEvent[]; readonly stop: () => void } {
  const events: UserBusEvent[] = [];
  const abort = new AbortController();
  void (async (): Promise<void> => {
    for await (const event of subscribeUserEvents(userId, abort.signal)) {
      events.push(event);
    }
  })().catch(() => {
    // The abort below ends the generator; nothing to report.
  });
  return {
    events,
    stop: (): void => {
      abort.abort();
    },
  };
}

/** Let the background drain run. `on()` buffers synchronously at publish, so a couple of macrotask turns is
 *  enough for every buffered event to land in the collector. */
async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
}

const STORM = 50;

describe("user-events-bus — quiet mode (W8: bulk emits coalesce to start + terminal)", () => {
  test("the UNWRAPPED control delivers N events; the SAME N inside a scope deliver exactly 1 + 1", async () => {
    // The control first, in the same run: this is the pre-W8 behaviour, and the number it produces is the
    // defect (`character/verbs/create.ts` emits once per imported CARD).
    const control = collect(USER_A);
    for (let i = 0; i < STORM; i += 1) {
      publishUserEvent(USER_A, { type: "charactersChanged" });
    }
    await settle();
    expect(control.events).toHaveLength(STORM);
    control.stop();

    const quiet = collect(USER_A);
    await withQuietBulkFanout(async () => {
      for (let i = 0; i < STORM; i += 1) {
        publishUserEvent(USER_A, { type: "charactersChanged" });
      }
      return await Promise.resolve();
    });
    await settle();
    // START MARKER (so a watching library refetches at the top of the run) + ONE coarse terminal.
    expect(quiet.events).toEqual([{ type: "charactersChanged" }, { type: "charactersChanged" }]);
    quiet.stop();
  });

  test("coalescing is per (user, TYPE) — a mixed-domain import fans one terminal per type, and the terminal is COARSE", async () => {
    const seen = collect(USER_A);
    await withQuietBulkFanout(async () => {
      // Two types, interleaved, with ID HINTS — the shape a real import produces (per-card create, per-book
      // lorebook import). The hints must survive on the start marker and be DROPPED on the terminal: a bulk
      // run touched too many entities for any one id to be an honest hint.
      for (let i = 0; i < STORM; i += 1) {
        publishUserEvent(USER_A, { type: "charactersChanged" });
        publishUserEvent(USER_A, { type: "tagsChanged" });
      }
      return await Promise.resolve();
    });
    await settle();

    expect(seen.events).toHaveLength(4);
    expect(seen.events.slice(0, 2)).toEqual([{ type: "charactersChanged" }, { type: "tagsChanged" }]);
    const terminalTypes = seen.events.slice(2).map((e) => e.type);
    expect(terminalTypes.toSorted()).toEqual(["charactersChanged", "tagsChanged"]);
    seen.stop();
  });

  test("a concurrent emit from OUTSIDE the scope is NEVER silenced, even for the same user", async () => {
    // The rationale behind async-context scoping, pinned: a suppressor keyed on the userId alone would eat
    // this human's unrelated edit from another tab for the whole ten-minute import. The persona save below is
    // raised outside `quietScope.run`, so it must arrive verbatim.
    const seen = collect(USER_A);
    let releaseImport = (): void => {
      // Replaced synchronously by the promise executor below; never called in this shape.
    };
    const importDone = withQuietBulkFanout(async () => {
      publishUserEvent(USER_A, { type: "charactersChanged" });
      publishUserEvent(USER_A, { type: "charactersChanged" });
      await new Promise<void>((resolve) => {
        releaseImport = resolve;
      });
    });
    await settle();

    const outside: UserBusEvent = { type: "personasChanged", personaId: castId<PersonaId>("persona_live") };
    publishUserEvent(USER_A, outside);
    await settle();
    // Mid-import: the start marker + the un-silenced concurrent edit, complete with its id hint.
    expect(seen.events).toEqual([{ type: "charactersChanged" }, outside]);

    releaseImport();
    await importDone;
    await settle();
    expect(seen.events).toEqual([{ type: "charactersChanged" }, outside, { type: "charactersChanged" }]);
    seen.stop();
  });

  test("a run that THROWS still fans its terminal (the finally-shaped emit law)", async () => {
    const seen = collect(USER_A);
    const boom = new Error("import aborted mid-sweep");
    await expect(
      withQuietBulkFanout(async () => {
        publishUserEvent(USER_A, { type: "charactersChanged" });
        publishUserEvent(USER_A, { type: "charactersChanged" });
        await Promise.resolve();
        throw boom;
      }),
    ).rejects.toThrow(boom);
    await settle();
    // Silencing an event and then dying would be strictly worse than never silencing it — the cards that DID
    // land before the abort are announced.
    expect(seen.events).toEqual([{ type: "charactersChanged" }, { type: "charactersChanged" }]);
    seen.stop();
  });

  test("a NESTED scope joins the outer one — one terminal for the whole gesture, not one per sub-batch", async () => {
    const seen = collect(USER_A);
    await withQuietBulkFanout(async () => {
      publishUserEvent(USER_A, { type: "charactersChanged" });
      await withQuietBulkFanout(async () => {
        publishUserEvent(USER_A, { type: "charactersChanged" });
        publishUserEvent(USER_A, { type: "charactersChanged" });
        return await Promise.resolve();
      });
      publishUserEvent(USER_A, { type: "charactersChanged" });
    });
    await settle();
    expect(seen.events).toHaveLength(2);
    seen.stop();
  });

  test("quiet mode is per-USER: a storm for A leaves B's channel untouched, and B's own storm coalesces on B", async () => {
    const a = collect(USER_A);
    const b = collect(USER_B);
    await withQuietBulkFanout(async () => {
      for (let i = 0; i < STORM; i += 1) {
        publishUserEvent(USER_A, { type: "charactersChanged" });
        publishUserEvent(USER_B, { type: "charactersChanged" });
      }
      return await Promise.resolve();
    });
    await settle();
    // The per-owner ingest/sweep fans (`databank/ingest`, the corpus passes) run one scope over MANY owners,
    // so the debt ledger has to be keyed by user, not global.
    expect(a.events).toHaveLength(2);
    expect(b.events).toHaveLength(2);
    a.stop();
    b.stop();
  });
});
