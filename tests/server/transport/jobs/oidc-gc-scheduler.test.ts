// Unit test: the oidc-gc-scheduler DRIVER. Mocks the injected `sweep` op + a frozen clock, asserting the reap
// fires with the current instant, the boot-sweep + recurring interval are armed, and a sweep failure never
// escapes the loop — zero db, zero wall time (testing §3).

import { describe, vi } from "vitest";
import { runOidcGc, startOidcGcScheduler } from "../../../../packages/server/src/transport/jobs/oidc-gc-scheduler.ts";
import { expect, test } from "../../../support/fixtures";
import { makeOidcGcDeps, T0 } from "./_support.ts";

describe("oidc-gc-scheduler reap", () => {
  test("sweeps expired transactions with the current instant", async () => {
    const deps = makeOidcGcDeps({ now: () => T0 });

    await runOidcGc(deps);

    expect(deps.sweep).toHaveBeenCalledTimes(1);
    expect(deps.sweep).toHaveBeenCalledWith(T0);
  });

  test("a sweep error propagates out of the core (the loop wrapper is what swallows it)", async () => {
    const sweep = vi.fn(() => Promise.reject(new Error("db exploded")));
    const deps = makeOidcGcDeps({ sweep });

    await expect(runOidcGc(deps)).rejects.toThrow("db exploded");
  });
});

describe("oidc-gc-scheduler loop", () => {
  test("fires a boot sweep immediately and arms the recurring interval", async () => {
    const clearInterval = vi.fn();
    const scheduleInterval = vi.fn(() => clearInterval);
    const deps = makeOidcGcDeps({ scheduleInterval });

    const clear = startOidcGcScheduler(deps);
    // The boot sweep runs async — let it settle.
    await Promise.resolve();
    await Promise.resolve();

    expect(deps.sweep).toHaveBeenCalledTimes(1);
    expect(scheduleInterval).toHaveBeenCalledTimes(1);
    clear();
    expect(clearInterval).toHaveBeenCalledTimes(1);
  });

  test("a boot-sweep failure never escapes (logged, the next tick retries)", async () => {
    const sweep = vi.fn(() => Promise.reject(new Error("sweep failed")));
    const deps = makeOidcGcDeps({ sweep });

    expect(() => startOidcGcScheduler(deps)).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });
});
