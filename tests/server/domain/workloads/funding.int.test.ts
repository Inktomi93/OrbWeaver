// @subject packages/server/src/domain/workloads/verbs/start.ts
// @subject packages/server/src/domain/workloads/verbs/retry.ts
// @subject packages/server/src/domain/workloads/verbs/estimate-model-calls.ts
// @subject packages/server/src/domain/workloads/engine/schedule-tick.ts
// @subject packages/server/src/domain/workloads/engine/runner.ts
// @subject packages/server/src/domain/workloads/persistence/queries.ts
// @subject packages/server/src/domain/discovery/workload-contributions.ts
// @subject packages/server/src/domain/refinery/workload-contributions.ts
// @subject packages/server/src/domain/chat/memory/generate/segments.ts
// @subject packages/server/src/domain/chat/substrate/backfill.ts
// @subject packages/server/src/domain/chat/workload-contributions.ts

import { CADENCE_INTERVAL_MS } from "@orb/contracts/workloads";
import { databaseHandle } from "@orb/db/wiring-driver";
import { tickWorkloadSchedules } from "@orb/server/domain/workloads";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { card, DISTILL, executeAdmitted, fundedOwner, physicalWire } from "./funding.fixtures.ts";

test("a bulk schedule persists its owner's funding through the trusted tick and disable stops new admission", async () => {
  const wire = physicalWire();
  await using root = await createServerHarness({ providerFetch: wire.execute, secretBoxKey: Buffer.alloc(32, 1) });
  const owner = await root.principalFor(root.ownerId);
  await fundedOwner(root, owner);
  await card(root, owner);
  await root.settleBackground();
  const schedule = await root.services.workloads.createSchedule({ caller: owner, ownerId: owner.userId, mode: "bulk", cadence: "daily", input: DISTILL });
  root.clock.advance(CADENCE_INTERVAL_MS.daily);
  const tick = { db: databaseHandle(root.db), now: root.clock.now, start: root.services.workloads.start };
  await tickWorkloadSchedules(tick);
  const due = await root.services.workloads.list({ caller: owner, kind: "distill-characters" });
  expect(due).toHaveLength(1);
  const ref = due[0];
  if (ref === undefined) {
    throw new Error("schedule did not admit its workload");
  }
  expect(ref).toMatchObject({ ownerId: null, funderUserId: owner.userId });
  await executeAdmitted(root, ref.id);
  expect(wire.funders.at(-1)).toBe(owner.userId);
  await root.services.workloads.setScheduleEnabled({ caller: owner, id: schedule.id, enabled: false });
  root.clock.advance(CADENCE_INTERVAL_MS.daily);
  await tickWorkloadSchedules(tick);
  expect(await root.services.workloads.list({ caller: owner, kind: "distill-characters" })).toHaveLength(1);
});

for (const withdrawal of ["consent", "credential"] as const) {
  test(`queued paid work honors current ${withdrawal} withdrawal without foreign fallback`, async () => {
    const wire = physicalWire();
    await using root = await createServerHarness({ providerFetch: wire.execute, secretBoxKey: Buffer.alloc(32, 1) });
    const owner = await root.principalFor(root.ownerId);
    const member = await root.principalFor((await root.actor()).id);
    const connections = await fundedOwner(root, owner);
    await fundedOwner(root, member);
    await card(root, owner);
    const credential = await root.services.credentials.add({
      principal: owner,
      provider: "custom-openai",
      key: "workload-funding-test-key",
      metadata: { auth: "endpoint" },
    });
    await root.services.connection.update({ principal: owner, connectionId: connections.text.id, patch: { credentialId: credential.id } });
    await root.settleBackground();
    const allowed = await root.services.workloads.start({ caller: owner, ownerId: owner.userId, mode: "bulk", input: DISTILL });
    await executeAdmitted(root, allowed.id);
    expect(await root.services.workloads.get({ caller: owner, id: allowed.id })).toMatchObject({ status: "succeeded" });
    const queued = await root.services.workloads.retry({ caller: owner, id: allowed.id });
    if (withdrawal === "consent") {
      await root.services.connection.update({ principal: owner, connectionId: connections.text.id, patch: { allowBackground: false } });
    } else {
      await root.services.credentials.markRevokedByUser({ principal: owner, credentialId: credential.id });
    }
    const before = [...wire.funders];
    await executeAdmitted(root, queued.id);
    expect(await root.services.workloads.get({ caller: owner, id: queued.id })).toMatchObject({ status: "failed", funderUserId: owner.userId });
    expect(wire.funders).toEqual(before);
  });
}
