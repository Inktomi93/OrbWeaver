// entry/boot/apply-distributed-plugins — the once-per-user latch that offers the server-wide published
// plugin set to a user created AFTER the admin published (D147 clause (d)). It runs on the authed-request
// path for every user, so its three failure modes are all silent and all bad:
//
//   • a latch written on a FAILED pass ⇒ that user never gets the offer again (the plugins are simply
//     missing, forever, with no error anywhere);
//   • a latch that stops gating ⇒ every request re-runs the verb and RESURRECTS a distributed plugin the
//     recipient deliberately uninstalled (the #461 deletion-respect failure this latch exists to prevent);
//   • a memo keyed on anything but the userId ⇒ one user's settled pass suppresses everyone else's, so a
//     whole cohort silently never receives the published set.
//
// The module owns exactly the once-per-user question (all plugin logic is the verb's), so this file pins
// exactly that: the persisted-latch short-circuit, the in-process memo, the single in-flight promise under
// concurrency, the never-throw contract, retry-after-failure, and per-user isolation.

import type { Principal } from "@orb/contracts/identity";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { DistributedPluginApplierDeps } from "@orb/server/entry/boot";
import { createDistributedPluginApplier } from "@orb/server/entry/boot";
import type { Mock } from "vitest";
import { describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

function user(id: string): Principal {
  return { userId: castId<UserId>(id), role: "user", handle: castId<Handle>(id), externalId: null, via: "cookie" };
}

const ALICE = user("usr_alice");
const BOB = user("usr_bob");

interface Harness {
  readonly deps: DistributedPluginApplierDeps;
  readonly apply: Mock<DistributedPluginApplierDeps["apply"]>;
  readonly isApplied: Mock<DistributedPluginApplierDeps["isApplied"]>;
  readonly markApplied: Mock<DistributedPluginApplierDeps["markApplied"]>;
  /** The per-user persisted latch the fakes read/write — the settings fact this module owns. */
  readonly latched: Set<string>;
  /** Call order across all three ports, so "marked only after a successful apply" is checkable. */
  readonly order: string[];
}

function harness(): Harness {
  const latched = new Set<string>();
  const order: string[] = [];
  const isApplied = vi.fn<DistributedPluginApplierDeps["isApplied"]>((p) => {
    order.push(`isApplied:${p.userId}`);
    return Promise.resolve(latched.has(p.userId));
  });
  const apply = vi.fn<DistributedPluginApplierDeps["apply"]>((p) => {
    order.push(`apply:${p.userId}`);
    return Promise.resolve({ installedSlugs: ["published-thing"] });
  });
  const markApplied = vi.fn<DistributedPluginApplierDeps["markApplied"]>((p) => {
    order.push(`markApplied:${p.userId}`);
    latched.add(p.userId);
    return Promise.resolve();
  });
  return { deps: { apply, isApplied, markApplied }, apply, isApplied, markApplied, latched, order };
}

describe("createDistributedPluginApplier — the latch is the authority (never a missing-plugins heal)", () => {
  test("an ALREADY-LATCHED user is not offered the set again (an uninstall is theirs to keep)", async () => {
    const h = harness();
    h.latched.add(ALICE.userId);

    await createDistributedPluginApplier(h.deps).ensureApplied(ALICE);

    expect(h.isApplied).toHaveBeenCalledTimes(1);
    expect(h.apply).not.toHaveBeenCalled();
    expect(h.markApplied).not.toHaveBeenCalled();
  });

  test("a fresh user gets the offer, and the latch is written only AFTER the apply succeeds", async () => {
    const h = harness();

    await createDistributedPluginApplier(h.deps).ensureApplied(ALICE);

    expect(h.order).toStrictEqual([`isApplied:${ALICE.userId}`, `apply:${ALICE.userId}`, `markApplied:${ALICE.userId}`]);
  });

  test("the in-process memo makes a second request a no-op — the persisted latch is not even re-read", async () => {
    const h = harness();
    const applier = createDistributedPluginApplier(h.deps);

    await applier.ensureApplied(ALICE);
    await applier.ensureApplied(ALICE);
    await applier.ensureApplied(ALICE);

    expect(h.isApplied).toHaveBeenCalledTimes(1);
    expect(h.apply).toHaveBeenCalledTimes(1);
  });

  test("concurrent first requests share ONE in-flight pass (no double apply on a parallel burst)", async () => {
    const h = harness();
    // Hold the apply open so all three calls land while the first is still running.
    let release = (): void => undefined;
    h.apply.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = (): void => resolve({ installedSlugs: [] });
        }),
    );
    const applier = createDistributedPluginApplier(h.deps);

    const all = Promise.all([applier.ensureApplied(ALICE), applier.ensureApplied(ALICE), applier.ensureApplied(ALICE)]);
    await vi.waitFor(() => {
      expect(h.apply).toHaveBeenCalledTimes(1);
    });
    release();
    await all;

    expect(h.apply).toHaveBeenCalledTimes(1);
    expect(h.markApplied).toHaveBeenCalledTimes(1);
  });
});

describe("createDistributedPluginApplier — a transient failure never latches and never propagates", () => {
  test("an apply failure is swallowed (the request must not 500) and leaves the latch UNSET", async () => {
    const h = harness();
    h.apply.mockRejectedValue(new Error("published asset mid-read"));

    await expect(createDistributedPluginApplier(h.deps).ensureApplied(ALICE)).resolves.toBeUndefined();

    expect(h.markApplied).not.toHaveBeenCalled();
    expect(h.latched.has(ALICE.userId)).toBe(false);
  });

  test("after a failure the user is RETRIED on their next touch (the memo is not poisoned)", async () => {
    const h = harness();
    h.apply.mockRejectedValueOnce(new Error("db blip"));
    const applier = createDistributedPluginApplier(h.deps);

    await applier.ensureApplied(ALICE);
    expect(h.apply).toHaveBeenCalledTimes(1);
    expect(h.markApplied).not.toHaveBeenCalled();

    await applier.ensureApplied(ALICE);
    expect(h.apply).toHaveBeenCalledTimes(2);
    expect(h.markApplied).toHaveBeenCalledTimes(1);
  });

  test("a markApplied failure also leaves the pass retryable (the latch write IS the success)", async () => {
    const h = harness();
    h.markApplied.mockImplementationOnce(() => Promise.reject(new Error("settings write failed")));
    const applier = createDistributedPluginApplier(h.deps);

    await expect(applier.ensureApplied(ALICE)).resolves.toBeUndefined();
    await applier.ensureApplied(ALICE);

    expect(h.apply).toHaveBeenCalledTimes(2);
  });

  test("an isApplied failure never throws out of the request path either", async () => {
    const h = harness();
    h.isApplied.mockRejectedValue(new Error("settings read failed"));

    await expect(createDistributedPluginApplier(h.deps).ensureApplied(ALICE)).resolves.toBeUndefined();
    expect(h.apply).not.toHaveBeenCalled();
  });
});

describe("createDistributedPluginApplier — the memo is PER USER (one user's pass is not everyone's)", () => {
  test("Alice's settled pass does not suppress Bob's offer", async () => {
    const h = harness();
    const applier = createDistributedPluginApplier(h.deps);

    await applier.ensureApplied(ALICE);
    await applier.ensureApplied(BOB);

    expect(h.apply.mock.calls.map((c) => c[0].userId)).toStrictEqual([ALICE.userId, BOB.userId]);
    expect(h.latched.has(BOB.userId)).toBe(true);
  });

  test("Alice's FAILED pass does not latch — or suppress — Bob", async () => {
    const h = harness();
    h.apply.mockImplementation((p) => {
      if (p.userId === ALICE.userId) {
        return Promise.reject(new Error("alice-only failure"));
      }
      return Promise.resolve({ installedSlugs: ["published-thing"] });
    });
    const applier = createDistributedPluginApplier(h.deps);

    await applier.ensureApplied(ALICE);
    await applier.ensureApplied(BOB);

    expect(h.latched.has(ALICE.userId)).toBe(false);
    expect(h.latched.has(BOB.userId)).toBe(true);
  });

  test("two users' concurrent first requests do NOT share one in-flight pass", async () => {
    const h = harness();
    const applier = createDistributedPluginApplier(h.deps);

    await Promise.all([applier.ensureApplied(ALICE), applier.ensureApplied(BOB)]);

    expect(h.apply).toHaveBeenCalledTimes(2);
  });
});
