import { CSRF_HEADER } from "@orb/contracts/identity";
import { closeDb } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { vi } from "vitest";
import { freshHeldDb } from "./db.ts";
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";

test("root teardown cancels its actual service graph before joining a held real HTTP handler", async () => {
  await using database = new AsyncDisposableStack();
  const held = await freshHeldDb();
  database.defer(() => closeDb(held.db));
  await using harness = await createServerHarness({ db: held.db, env: { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "owner" } });
  const caller = await harness.internalCallerFor(harness.ownerId);
  const handle = castId<Handle>("held-native-login");
  const password = "a-real-password-through-the-real-session-verifier";
  await caller.admin.createUser({ handle, password });
  await harness.settleBackground();
  const gate = held.hold(/select "id", "password_hash", "enabled" from "users"/u);
  // biome-ignore lint/nursery/useDisposables: this borrowed graph bus is stopped by root disposal before the held handler can settle.
  const tap = harness.app.liveBuses.chatOpen;
  const setTap = tap.setChatOpenTap;
  let stopped = false;
  const observation = vi.spyOn(tap, "setChatOpenTap").mockImplementation((next) => {
    setTap.call(tap, next);
    if (next === null) {
      stopped = true;
    }
  });
  const response = Promise.resolve(
    harness.http.request("/api/auth/login", {
      method: "POST",
      headers: { [CSRF_HEADER]: "1" },
      body: new URLSearchParams({ handle, password }),
    }),
  );
  let disposal: Promise<void> | undefined;
  try {
    await gate.reached;
    let disposed = false;
    disposal = Promise.resolve(harness[Symbol.asyncDispose]()).then(() => {
      disposed = true;
    });
    await expect.poll(() => stopped).toBe(true);
    expect(disposed).toBe(false);
    expect(await held.db.all(sql`select 1 as retained`)).toEqual([{ retained: 1 }]);
  } finally {
    gate.release();
    await Promise.allSettled([response.then((result) => result.arrayBuffer()), disposal]);
    observation.mockRestore();
  }
  await disposal;
  expect(harness.timers.pending()).toBe(0);
  expect(await held.db.all(sql`select 1 as retained`)).toEqual([{ retained: 1 }]);
});
