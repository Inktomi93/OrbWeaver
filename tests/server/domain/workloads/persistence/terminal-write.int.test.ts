// @subject packages/server/src/domain/workloads/persistence/queries.ts
// @subject packages/server/src/domain/workloads/engine/runner.ts
// @subject packages/server/src/domain/workloads/engine/reaper.ts
import "@orb/testkit/node/composed-real.ts";
import type { Principal } from "@orb/contracts/identity";
import { workloads } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import type { WorkloadId } from "@orb/kit/ids";
import { reapOrphanedWorkloads } from "@orb/server/domain/workloads";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import type { ServerTestHarness } from "@orb/testkit/node/server.ts";
import { eq } from "drizzle-orm";
import { vi } from "vitest";
import { executeAdmitted } from "../funding.fixtures.ts";

const QUEUE_DELAY_MS = 60_000;
const RESULT = { scanned: 0, changed: 0, dryRun: true } as const;

async function enqueue(harness: ServerTestHarness, caller: Principal): Promise<WorkloadId> {
  const { id } = await harness.services.workloads.start({
    caller,
    ownerId: caller.userId,
    mode: "singular",
    input: { kind: "assets-backfill", params: { dryRun: true } },
    scheduledAt: harness.clock.now() + QUEUE_DELAY_MS,
  });
  return id;
}

async function stored(harness: ServerTestHarness, id: WorkloadId): Promise<{ status: string; result: unknown; error: string | null }> {
  const rows = await harness.db
    .select({ status: workloads.status, result: workloads.result, error: workloads.error })
    .from(workloads)
    .where(eq(workloads.id, id));
  return rows[0] ?? { status: "missing", result: undefined, error: null };
}

test("a run that finishes persists its result and no error", async ({ harness }) => {
  const caller = await harness.principalFor((await harness.actor()).id);
  const id = await enqueue(harness, caller);
  await executeAdmitted(harness, id);
  expect(await stored(harness, id)).toEqual({ status: "succeeded", result: RESULT, error: null });
});

test("a run that throws persists its message as the error and no result", async ({ harness }) => {
  const caller = await harness.principalFor((await harness.actor()).id);
  using run = vi.spyOn(harness.app.workloadContributions["assets-backfill"], "run").mockRejectedValueOnce(new Error("controlled failure"));
  const id = await enqueue(harness, caller);
  await executeAdmitted(harness, id);
  expect(run).toHaveBeenCalledTimes(1);
  expect(await stored(harness, id)).toEqual({ status: "failed", result: null, error: "controlled failure" });
});

test("a row reaped mid-run stays worker_died and the late success of its zombie run is refused", async ({ harness }) => {
  const caller = await harness.principalFor((await harness.actor()).id);
  const id = await enqueue(harness, caller);
  let reaped = -1;
  using run = vi.spyOn(harness.app.workloadContributions["assets-backfill"], "run").mockImplementationOnce(async () => {
    reaped = await reapOrphanedWorkloads({
      db: databaseHandle(harness.db),
      now: harness.clock.now() + QUEUE_DELAY_MS,
      staleThresholdMs: 0,
      reason: "heartbeat_stale",
      emitEvent: harness.app.workloadEvents.emitWorkloadEvent,
    });
    return RESULT;
  });
  await executeAdmitted(harness, id);
  expect(run).toHaveBeenCalledTimes(1);
  expect(reaped).toBe(1);
  expect(await stored(harness, id)).toEqual({ status: "worker_died", result: null, error: expect.any(String) });
});

test("a row cancelled while running ends cancelled and the late success of its run is refused", async ({ harness }) => {
  const caller = await harness.principalFor((await harness.actor()).id);
  const id = await enqueue(harness, caller);
  using run = vi.spyOn(harness.app.workloadContributions["assets-backfill"], "run").mockImplementationOnce(async () => {
    expect(await harness.services.workloads.cancel({ caller, id })).toEqual({ status: "cancelling" });
    return RESULT;
  });
  await executeAdmitted(harness, id);
  expect(run).toHaveBeenCalledTimes(1);
  expect(await stored(harness, id)).toEqual({ status: "cancelled", result: null, error: null });
});

test("a queued row cancelled before it runs is never claimed", async ({ harness }) => {
  const caller = await harness.principalFor((await harness.actor()).id);
  const id = await enqueue(harness, caller);
  expect(await harness.services.workloads.cancel({ caller, id })).toEqual({ status: "cancelled" });
  using run = vi.spyOn(harness.app.workloadContributions["assets-backfill"], "run");
  await executeAdmitted(harness, id);
  expect(run).not.toHaveBeenCalled();
  expect(await stored(harness, id)).toEqual({ status: "cancelled", result: null, error: null });
});
