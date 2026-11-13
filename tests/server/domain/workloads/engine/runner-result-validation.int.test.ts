// The runner checks a run's result against its kind's schema before it stores the row, so a result no read can
// publish fails the run with a coded reason instead of landing as a succeeded row that reads back empty.
// @subject packages/server/src/domain/workloads/engine/runner.ts
import type { LogLevel } from "@orb/contracts/settings";
import type { WorkloadRef } from "@orb/contracts/workloads";
import { WORKLOAD_RESULT_INVALID_REASON } from "@orb/contracts/workloads";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { vi } from "vitest";
import { executeAdmitted } from "../funding.fixtures.ts";

const LOG_LEVEL = "info" satisfies LogLevel;

const LOG_SCAN_LIMIT = 200;
const QUEUE_DELAY_MS = 60_000;

async function enqueueMaintenance(root: ServerTestHarness): Promise<WorkloadRef> {
  const owner = await root.principalFor(root.ownerId);
  return await root.services.workloads.start({
    caller: owner,
    ownerId: owner.userId,
    mode: "singular",
    input: { kind: "assets-backfill", params: { dryRun: true } },
    scheduledAt: root.clock.now() + QUEUE_DELAY_MS,
  });
}

test("a run whose result its kind's schema refuses fails with the coded reason and stores nothing", async () => {
  await using root = await createServerHarness({ logLevel: LOG_LEVEL });
  const ref = await enqueueMaintenance(root);
  // A count that divided by zero: it satisfies the result type, and JSON stores it as null.
  vi.spyOn(root.app.workloadContributions["assets-backfill"], "run").mockResolvedValue({ scanned: Number.NaN, changed: 0, dryRun: true });

  await executeAdmitted(root, ref.id);

  const failed = await root.services.workloads.get({ caller: null, id: ref.id });
  expect(failed).toMatchObject({ status: "failed", error: WORKLOAD_RESULT_INVALID_REASON, result: null, poison: false });
  const events = root.app.workloadEvents.getRecentWorkloadEvents(ref.id).map((event) => event.type);
  expect(events).toContain("failed");
  expect(events).not.toContain("succeeded");
  const logged = root.observability.logLines(LOG_SCAN_LIMIT).filter((line) => line.includes(ref.id) && line.includes("is not stored"));
  expect(logged).toHaveLength(1);
  expect(logged[0]).toContain("scanned");
});

test("a run whose result its kind's schema accepts is stored and reads back", async () => {
  await using root = await createServerHarness();
  const ref = await enqueueMaintenance(root);
  vi.spyOn(root.app.workloadContributions["assets-backfill"], "run").mockResolvedValue({ scanned: 3, changed: 1, dryRun: true });

  await executeAdmitted(root, ref.id);

  expect(await root.services.workloads.get({ caller: null, id: ref.id })).toMatchObject({
    status: "succeeded",
    error: null,
    result: { scanned: 3, changed: 1, dryRun: true },
  });
});
