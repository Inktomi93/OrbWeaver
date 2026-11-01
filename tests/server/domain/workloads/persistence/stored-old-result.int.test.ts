// A succeeded import-token-usage-backfill row stored before the owner census keys were dropped must still list and get.
// @subject packages/server/src/domain/workloads/persistence/queries.ts
import { workloads } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { eq, sql } from "drizzle-orm";

const OLD_RESULT = {
  scanned: 4,
  exactRecovered: 1,
  legacyPromoted: 1,
  estimated: 1,
  alreadyMeasured: 1,
  alreadyEstimated: 0,
  compareAndSetSkipped: 0,
  dryRun: false,
  ownersScanned: 2,
  ownersReconciled: 2,
};

test("a stored import-token-usage-backfill result carrying the retired owner census keys still lists and reads without them", async ({ harness }) => {
  const caller = await harness.principalFor(harness.ownerId);
  const ref = await harness.services.workloads.start({
    caller,
    ownerId: caller.userId,
    mode: "singular",
    input: { kind: "import-token-usage-backfill", params: { dryRun: false } },
    scheduledAt: harness.clock.now() + 10_000,
  });
  await harness.db
    .update(workloads)
    .set({ status: "succeeded", result: sql`${JSON.stringify(OLD_RESULT)}` })
    .where(eq(workloads.id, ref.id));
  const { ownersScanned: _scanned, ownersReconciled: _reconciled, ...expected } = OLD_RESULT;
  const listed = await harness.services.workloads.list({ caller });
  expect(listed.find((row) => row.id === ref.id)?.result).toEqual(expected);
  expect((await harness.services.workloads.get({ caller, id: ref.id })).result).toEqual(expected);
});
