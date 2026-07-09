// transport/trpc/user-events-bus (PD user-bus lane) — the per-USER live fan-out the
// `sessions.streamUserEvents` subscription tails. THE load-bearing property: a subscriber receives ONLY its
// own `userId` channel — an emit for user A reaches A's stream and NEVER B's (the isolation assertion; the
// channel key is `ctx.auth.userId`, never client input). Pure module test over the process-local
// `EventEmitter` (`on()` buffers from subscribe, so publishing after subscribe loses nothing).

import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { publishUserEvent, subscribeUserEvents } from "@orb/server/transport/trpc";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures";

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
