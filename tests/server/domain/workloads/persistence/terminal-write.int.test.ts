import "@orb/testkit/node/composed-real.ts";
import { workloads } from "@orb/db";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";
import { markCancelling, markStarted, markTerminal } from "#server/domain/workloads/persistence/queries.ts";

test("actual terminal writes preserve void success, failure and cancellation payloads and reject stale transitions", async ({ harness }) => {
  const caller = await harness.principalFor((await harness.actor()).id);
  for (const terminal of [
    { status: "succeeded", result: undefined },
    { status: "failed", error: "controlled failure" },
    { status: "worker_died", error: "controlled dead worker" },
    { status: "cancelled" },
  ] as const) {
    const { id } = await harness.services.workloads.start({
      caller,
      ownerId: caller.userId,
      mode: "singular",
      input: { kind: "assets-backfill", params: { dryRun: true } },
      scheduledAt: harness.clock.now() + 60_000,
    });
    expect(await markStarted(harness.db, id, harness.clock.now())).not.toBeNull();
    expect(await markTerminal(harness.db, { id, now: harness.clock.now(), ...terminal })).toBe(true);
    expect(await markTerminal(harness.db, { id, now: harness.clock.now(), status: "failed", error: "stale writer" })).toBe(false);
    expect(
      await harness.db.select({ status: workloads.status, result: workloads.result, error: workloads.error }).from(workloads).where(eq(workloads.id, id)),
    ).toEqual([{ status: terminal.status, result: null, error: "error" in terminal ? terminal.error : null }]);
  }
  const { id } = await harness.services.workloads.start({
    caller,
    ownerId: caller.userId,
    mode: "singular",
    input: { kind: "assets-backfill", params: { dryRun: true } },
    scheduledAt: harness.clock.now() + 60_000,
  });
  await markStarted(harness.db, id, harness.clock.now());
  expect(await markCancelling(harness.db, id, harness.clock.now())).toEqual({ status: "cancelling" });
  expect(await markTerminal(harness.db, { id, now: harness.clock.now(), status: "succeeded", result: "late" })).toBe(false);
  expect(await markTerminal(harness.db, { id, now: harness.clock.now(), status: "cancelled" })).toBe(true);
});
