// active-turns — the in-memory per-chat controller registry (pure: no db/clock). Pins the Set-not-slot
// concurrency (N in-flight per chat), the release cleanup, and the OWNER-ONLY abort (rollback-theft defense).

import type { ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { createActiveTurns } from "#server/domain/chat/active-turns.ts";

const CHAT = castId<ChatId>("chat_a");
const OTHER = castId<ChatId>("chat_b");
const ALICE = castId<UserId>("user_alice");
const BOB = castId<UserId>("user_bob");

describe("createActiveTurns — registration + release", () => {
  test("register adds an in-flight controller; release removes it", async () => {
    await using reg = createActiveTurns();
    expect(reg.countActive(CHAT)).toBe(0);
    using h1 = reg.register(CHAT, ALICE);
    using h2 = reg.register(CHAT, ALICE);
    expect(reg.countActive(CHAT)).toBe(2);
    expect(h1.signal.aborted).toBe(false);
    h1.release();
    expect(reg.countActive(CHAT)).toBe(1);
    h2.release();
    expect(reg.countActive(CHAT)).toBe(0);
  });

  test("registrations are per-chat (no cross-chat bleed)", async () => {
    await using reg = createActiveTurns();
    using _handle = reg.register(CHAT, ALICE);
    expect(reg.countActive(OTHER)).toBe(0);
  });
});

// `using` is the spelling every turn verb uses (turn.ts ×5) — the release rides scope exit, so it fires on the
// THROW path too. That is the whole point: a verb that faults mid-turn must not strand a phantom in-flight
// registration (a stray one makes `abort` report `foreignInFlight` and refuse a legitimate caller).
describe("createActiveTurns — the Disposable contract (`using`)", () => {
  test("a `using` registration releases at scope exit", async () => {
    await using reg = createActiveTurns();
    const run = (): number => {
      using _handle = reg.register(CHAT, ALICE);
      return reg.countActive(CHAT);
    };
    expect(run()).toBe(1);
    expect(reg.countActive(CHAT)).toBe(0);
  });

  test("a `using` registration releases when the scope THROWS", async () => {
    await using reg = createActiveTurns();
    const run = (): never => {
      using _handle = reg.register(CHAT, ALICE);
      throw new Error("turn faulted");
    };
    expect(run).toThrow("turn faulted");
    expect(reg.countActive(CHAT)).toBe(0);
  });

  test("`[Symbol.dispose]` IS `release` — aliased, idempotent, and order-blind", async () => {
    await using reg = createActiveTurns();
    using handle = reg.register(CHAT, ALICE);
    expect(handle[Symbol.dispose]).toBe(handle.release);
    handle.release();
    expect(reg.countActive(CHAT)).toBe(0);
    // A second free (hand `release` then a `using` scope exit, or vice versa) must be inert — the alias would
    // be unsafe if either spelling double-counted or threw.
    handle[Symbol.dispose]();
    handle.release();
    expect(reg.countActive(CHAT)).toBe(0);
  });

  test("scope exit releases ONLY its own registration (a sibling turn stays in flight)", async () => {
    await using reg = createActiveTurns();
    using sibling = reg.register(CHAT, BOB);
    {
      using _mine = reg.register(CHAT, ALICE);
      expect(reg.countActive(CHAT)).toBe(2);
    }
    expect(reg.countActive(CHAT)).toBe(1);
    expect(sibling.signal.aborted).toBe(false);
  });
});

describe("createActiveTurns — abort is owner-only", () => {
  test("abort signals the caller's own turns + clears them", async () => {
    await using reg = createActiveTurns();
    using h1 = reg.register(CHAT, ALICE);
    using h2 = reg.register(CHAT, ALICE);
    const res = reg.abort(CHAT, ALICE);
    expect(res).toEqual({ aborted: 2, foreignInFlight: false });
    expect(h1.signal.aborted).toBe(true);
    expect(h2.signal.aborted).toBe(true);
    expect(reg.countActive(CHAT)).toBe(0);
  });

  test("a foreign turn is reported, never signalled (rollback-theft defense)", async () => {
    await using reg = createActiveTurns();
    using foreign = reg.register(CHAT, BOB);
    const res = reg.abort(CHAT, ALICE);
    expect(res).toEqual({ aborted: 0, foreignInFlight: true });
    expect(foreign.signal.aborted).toBe(false);
    expect(reg.countActive(CHAT)).toBe(1);
  });

  test("abort aborts own turns while leaving a concurrent foreign turn untouched", async () => {
    await using reg = createActiveTurns();
    using mine = reg.register(CHAT, ALICE);
    using theirs = reg.register(CHAT, BOB);
    const res = reg.abort(CHAT, ALICE);
    expect(res).toEqual({ aborted: 1, foreignInFlight: true });
    expect(mine.signal.aborted).toBe(true);
    expect(theirs.signal.aborted).toBe(false);
    expect(reg.countActive(CHAT)).toBe(1);
  });

  test("abort with nothing in flight is an idempotent no-op", async () => {
    await using reg = createActiveTurns();
    expect(reg.abort(CHAT, ALICE)).toEqual({ aborted: 0, foreignInFlight: false });
  });
});

// The ONE owner-blind sweep: the host deleted the room, so no turn in it can commit anything (its every write
// now FK-fails against the dropped `chats` row). The rollback-theft defense does not apply — there is nothing
// left to steal a rollback in.
describe("createActiveTurns — abortAll (the room-gone sweep)", () => {
  test("signals EVERY turn regardless of owner, returns the count, and clears the chat", async () => {
    await using reg = createActiveTurns();
    using mine = reg.register(CHAT, ALICE);
    using theirs = reg.register(CHAT, BOB);

    expect(reg.abortAll(CHAT)).toBe(2);
    expect(mine.signal.aborted).toBe(true);
    expect(theirs.signal.aborted).toBe(true);
    expect(reg.countActive(CHAT)).toBe(0);
  });

  test("touches only the named chat, and is an idempotent no-op when nothing is in flight", async () => {
    await using reg = createActiveTurns();
    using other = reg.register(OTHER, ALICE);

    expect(reg.abortAll(CHAT)).toBe(0);
    expect(other.signal.aborted).toBe(false);
    expect(reg.countActive(OTHER)).toBe(1);
  });
});
