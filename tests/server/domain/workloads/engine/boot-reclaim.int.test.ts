// The boot reclaim reads what each orphan was doing when its process died: a row its owner had cancelled ends
// cancelled, and only a row still running goes back to the queue.
// @subject packages/server/src/domain/workloads/engine/boot-reclaim.ts
// @subject packages/server/src/domain/workloads/persistence/queries.ts
import type { Principal } from "@orb/contracts/identity";
import type { WorkloadId } from "@orb/kit/ids";
import { reclaimInFlightOnBoot } from "@orb/server/domain/workloads";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { bootGrantFor } from "@orb/testkit/node/helpers";
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

type BootReclaimReport = Awaited<ReturnType<typeof reclaimInFlightOnBoot>>;

/** Run the row to the point its body is executing, let `whileRunning` act on it, then boot over it. The body
 *  returns afterwards, as a run that outlived its process's bookkeeping would. */
async function bootOverInFlightRow(harness: ServerTestHarness, id: WorkloadId, whileRunning: () => Promise<void>): Promise<BootReclaimReport> {
  const reports: BootReclaimReport[] = [];
  using run = vi.spyOn(harness.app.workloadContributions["assets-backfill"], "run").mockImplementationOnce(async () => {
    await whileRunning();
    reports.push(
      await reclaimInFlightOnBoot({
        db: bootGrantFor(harness.db),
        logger: harness.logger,
        contributions: harness.app.workloadContributions,
        now: harness.clock.now(),
        emitEvent: harness.app.workloadEvents.emitWorkloadEvent,
      }),
    );
    return RESULT;
  });
  await executeAdmitted(harness, id);
  expect(run).toHaveBeenCalledTimes(1);
  const [report] = reports;
  if (report === undefined) {
    throw new Error("the run body never reached the boot reclaim");
  }
  return report;
}

test("a row cancelled just before the process died ends cancelled at boot, not back in the queue", async ({ harness }) => {
  const caller = await harness.principalFor((await harness.actor()).id);
  const id = await enqueue(harness, caller);

  const report = await bootOverInFlightRow(harness, id, async () => {
    expect(await harness.services.workloads.cancel({ caller, id })).toEqual({ status: "cancelling" });
  });

  expect(report).toEqual({ requeued: 0, reaped: 0, cancelled: 1 });
  expect((await harness.services.workloads.get({ caller, id })).status).toBe("cancelled");
  expect(harness.app.workloadEvents.getRecentWorkloadEvents(id).at(-1)).toMatchObject({ type: "cancelled", workloadId: id });
});

test("a row still running when the process died goes back to the queue at boot", async ({ harness }) => {
  const caller = await harness.principalFor((await harness.actor()).id);
  const id = await enqueue(harness, caller);

  const report = await bootOverInFlightRow(harness, id, () => Promise.resolve());

  expect(report).toEqual({ requeued: 1, reaped: 0, cancelled: 0 });
  expect((await harness.services.workloads.get({ caller, id })).status).toBe("queued");
  expect(harness.app.workloadEvents.getRecentWorkloadEvents(id).at(-1)).toMatchObject({ type: "status", status: "queued" });
});
