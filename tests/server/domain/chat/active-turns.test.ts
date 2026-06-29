// active-turns — the in-memory per-chat controller registry (pure: no db/clock). Pins the Set-not-slot
// concurrency (N in-flight per chat), the release cleanup, and the OWNER-ONLY abort (rollback-theft defense).

import type { ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, expect, test } from "vitest";
import { createActiveTurns } from "../../../../packages/server/src/domain/chat/active-turns";

const CHAT = castId<ChatId>("chat_a");
const OTHER = castId<ChatId>("chat_b");
const ALICE = castId<UserId>("user_alice");
const BOB = castId<UserId>("user_bob");

describe("createActiveTurns — registration + release", () => {
  test("register adds an in-flight controller; release removes it", () => {
    const reg = createActiveTurns();
    expect(reg.countActive(CHAT)).toBe(0);
    const h1 = reg.register(CHAT, ALICE);
    const h2 = reg.register(CHAT, ALICE);
    expect(reg.countActive(CHAT)).toBe(2);
    expect(h1.signal.aborted).toBe(false);
    h1.release();
    expect(reg.countActive(CHAT)).toBe(1);
    h2.release();
    expect(reg.countActive(CHAT)).toBe(0);
  });

  test("registrations are per-chat (no cross-chat bleed)", () => {
    const reg = createActiveTurns();
    reg.register(CHAT, ALICE);
    expect(reg.countActive(OTHER)).toBe(0);
  });
});

describe("createActiveTurns — abort is owner-only", () => {
  test("abort signals the caller's own turns + clears them", () => {
    const reg = createActiveTurns();
    const h1 = reg.register(CHAT, ALICE);
    const h2 = reg.register(CHAT, ALICE);
    const res = reg.abort(CHAT, ALICE);
    expect(res).toEqual({ aborted: 2, foreignInFlight: false });
    expect(h1.signal.aborted).toBe(true);
    expect(h2.signal.aborted).toBe(true);
    expect(reg.countActive(CHAT)).toBe(0);
  });

  test("a foreign turn is reported, never signalled (rollback-theft defense)", () => {
    const reg = createActiveTurns();
    const foreign = reg.register(CHAT, BOB);
    const res = reg.abort(CHAT, ALICE);
    expect(res).toEqual({ aborted: 0, foreignInFlight: true });
    expect(foreign.signal.aborted).toBe(false);
    expect(reg.countActive(CHAT)).toBe(1);
  });

  test("abort aborts own turns while leaving a concurrent foreign turn untouched", () => {
    const reg = createActiveTurns();
    const mine = reg.register(CHAT, ALICE);
    const theirs = reg.register(CHAT, BOB);
    const res = reg.abort(CHAT, ALICE);
    expect(res).toEqual({ aborted: 1, foreignInFlight: true });
    expect(mine.signal.aborted).toBe(true);
    expect(theirs.signal.aborted).toBe(false);
    expect(reg.countActive(CHAT)).toBe(1);
  });

  test("abort with nothing in flight is an idempotent no-op", () => {
    const reg = createActiveTurns();
    expect(reg.abort(CHAT, ALICE)).toEqual({ aborted: 0, foreignInFlight: false });
  });
});
