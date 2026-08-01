// reconcile-in-flight — the per-USER single-flight gate behind `stats.reconcile` (owner ruling 2026-08-02:
// a caller with a recompute in flight must WAIT, never start a second). Pure process state, no db/clock, so
// the gate is held OPEN here with a deferred promise — the only way to assert "refused WHILE the first is
// still running" deterministically. What matters: the refusal is a CONFLICT-mapping domain error, the slot
// releases on BOTH settle arms (a throwing rebuild must not wedge the owner out forever), and the key is the
// owner (one user's rebuild never blocks another's).

import { DomainConflictError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { createReconcileInFlight } from "../../../../packages/server/src/domain/stats/reconcile-in-flight.ts";
import { expect, test } from "../../../support/fixtures";

const ALICE: UserId = castId<UserId>("user_alice");
const BOB: UserId = castId<UserId>("user_bob");

/** A promise the test settles by hand — the running task stays parked until `resolve`/`reject` is called. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: Error) => void } {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createReconcileInFlight", () => {
  test("refuses a second call while the first is still running, then allows one once it completes", async () => {
    const gate = createReconcileInFlight();
    const gateOpen = deferred<string>();

    const first = gate.run(ALICE, () => gateOpen.promise);
    expect(gate.isRunning(ALICE)).toBe(true);

    // The refusal is decided synchronously on entry — no timing luck, the first task has not settled.
    await expect(gate.run(ALICE, () => Promise.resolve("second"))).rejects.toThrow(DomainConflictError);
    await expect(gate.run(ALICE, () => Promise.resolve("second"))).rejects.toThrow("a recompute is already running");

    gateOpen.resolve("first");
    expect(await first).toBe("first");
    expect(gate.isRunning(ALICE)).toBe(false);

    // Slot released ⇒ the next recompute is allowed (the owner is never permanently locked out).
    expect(await gate.run(ALICE, () => Promise.resolve("third"))).toBe("third");
  });

  test("a THROWING run releases the slot — a failed rebuild must not wedge the owner out", async () => {
    const gate = createReconcileInFlight();
    const gateOpen = deferred<string>();

    const first = gate.run(ALICE, () => gateOpen.promise);
    gateOpen.reject(new Error("rebuild blew up"));
    await expect(first).rejects.toThrow("rebuild blew up");

    expect(gate.isRunning(ALICE)).toBe(false);
    expect(await gate.run(ALICE, () => Promise.resolve("after the failure"))).toBe("after the failure");
  });

  test("a synchronously-throwing task also releases the slot", async () => {
    const gate = createReconcileInFlight();

    await expect(
      gate.run(ALICE, () => {
        throw new Error("threw before awaiting");
      }),
    ).rejects.toThrow("threw before awaiting");

    expect(gate.isRunning(ALICE)).toBe(false);
  });

  test("the gate is per-OWNER — one user's rebuild never blocks another's", async () => {
    const gate = createReconcileInFlight();
    const aliceGate = deferred<string>();

    const alice = gate.run(ALICE, () => aliceGate.promise);
    expect(await gate.run(BOB, () => Promise.resolve("bob ran"))).toBe("bob ran");
    expect(gate.isRunning(ALICE)).toBe(true);
    expect(gate.isRunning(BOB)).toBe(false);

    aliceGate.resolve("alice ran");
    expect(await alice).toBe("alice ran");
  });
});
