// The runner checks a run's result against its kind's schema before it stores the row, so a result no read can
// publish fails the run with a coded reason instead of landing as a succeeded row that reads back empty. The engine
// knows no domain (D117): a contribution is its input, so the test hands the production runner door a contribution
// whose run returns what its kind's schema refuses.
// @subject packages/server/src/domain/workloads/engine/runner.ts
import type { LogLevel } from "@orb/contracts/settings";
import type { WorkloadRef, WorkloadRunnableRow } from "@orb/contracts/workloads";
import { WORKLOAD_RESULT_INVALID_REASON } from "@orb/contracts/workloads";
import type { WorkloadContributions } from "@orb/server/domain/workloads";
import { runWorkload } from "@orb/server/domain/workloads";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";

const LOG_LEVEL = "info" satisfies LogLevel;
const KIND = "assets-backfill";

const LOG_SCAN_LIMIT = 200;
const QUEUE_DELAY_MS = 60_000;

async function enqueueMaintenance(root: ServerTestHarness): Promise<WorkloadRef> {
  const owner = await root.principalFor(root.ownerId);
  return await root.services.workloads.start({
    caller: owner,
    ownerId: owner.userId,
    mode: "singular",
    input: { kind: KIND, params: { dryRun: true } },
    scheduledAt: root.clock.now() + QUEUE_DELAY_MS,
  });
}

async function admitted(root: ServerTestHarness, ref: WorkloadRef): Promise<WorkloadRunnableRow> {
  const row = await root.services.workloads.get({ caller: null, id: ref.id });
  if (row.poison) {
    throw new Error("admitted workload has malformed params");
  }
  return row;
}

async function runThrough(root: ServerTestHarness, row: WorkloadRunnableRow, contributions: WorkloadContributions): Promise<void> {
  await runWorkload({ ...root.workloadExecution, contributions, heartbeatMs: 0, cancelPollMs: 0 }, row, new AbortController().signal);
}

test("a run whose result its kind's schema refuses fails with the coded reason, stores nothing, and its owner reads the reason", async () => {
  await using root = await createServerHarness({ logLevel: LOG_LEVEL });
  const owner = await root.principalFor(root.ownerId);
  const ref = await enqueueMaintenance(root);
  const real = root.workloadExecution.contributions;
  // A count that divided by zero: it satisfies the result type, and JSON would store it as null.
  const refused: WorkloadContributions = { ...real, [KIND]: { ...real[KIND], run: async () => ({ scanned: Number.NaN, changed: 0, dryRun: true }) } };

  await runThrough(root, await admitted(root, ref), refused);

  expect(await root.services.workloads.get({ caller: owner, id: ref.id })).toMatchObject({
    status: "failed",
    error: WORKLOAD_RESULT_INVALID_REASON,
    result: null,
    poison: false,
  });
  const events = root.app.workloadEvents.getRecentWorkloadEvents(ref.id).map((event) => event.type);
  expect(events).toContain("failed");
  expect(events).not.toContain("succeeded");
  const logged = root.observability.logLines(LOG_SCAN_LIMIT).filter((line) => line.includes(ref.id) && line.includes("is not stored"));
  expect(logged).toHaveLength(1);
  expect(logged[0]).toContain("scanned");
});

test("the kind's own run on the same row succeeds and its result reads back", async () => {
  await using root = await createServerHarness();
  const owner = await root.principalFor(root.ownerId);
  const ref = await enqueueMaintenance(root);

  await runThrough(root, await admitted(root, ref), root.workloadExecution.contributions);

  expect(await root.services.workloads.get({ caller: owner, id: ref.id })).toMatchObject({
    status: "succeeded",
    error: null,
    result: { dryRun: true, scanned: expect.any(Number), changed: expect.any(Number) },
  });
});
