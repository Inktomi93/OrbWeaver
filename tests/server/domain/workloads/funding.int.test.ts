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
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { tickWorkloadSchedules } from "@orb/server/domain/workloads";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, SECRET_BOX_TEST_KEY, seedRecallRoom } from "@orb/testkit/node/composed";
import { card, DISTILL, executeAdmitted, fundedOwner, physicalWire, WORKLOAD_FUNDER_HEADER } from "./funding.fixtures.ts";

test("a bulk schedule persists its owner's funding through the trusted tick and disable stops new admission", async () => {
  const wire = physicalWire();
  await using root = await createServerHarness({ providerFetch: wire.execute, secretBoxKey: SECRET_BOX_TEST_KEY });
  const owner = await root.principalFor(root.ownerId);
  await fundedOwner(root, owner);
  await card(root, owner);
  await root.settleBackground();
  const schedule = await root.services.workloads.createSchedule({ caller: owner, ownerId: owner.userId, mode: "bulk", cadence: "daily", input: DISTILL });
  root.clock.advance(CADENCE_INTERVAL_MS.daily);
  const tick = { db: databaseHandle(root.db), logger: root.logger, now: root.clock.now, start: root.services.workloads.start };
  await tickWorkloadSchedules(tick);
  const due = await root.services.workloads.list({ caller: owner, kind: "distill-characters" });
  expect(due).toHaveLength(1);
  const ref = due[0];
  if (ref === undefined) {
    throw new Error("schedule did not admit its workload");
  }
  expect(ref).toMatchObject({ ownerId: null, funderUserId: owner.userId });
  const fundersBefore = wire.funders.length;
  await executeAdmitted(root, ref.id);
  expect(new Set(wire.funders.slice(fundersBefore))).toEqual(new Set([owner.userId]));
  await root.services.workloads.setScheduleEnabled({ caller: owner, id: schedule.id, enabled: false });
  root.clock.advance(CADENCE_INTERVAL_MS.daily);
  await tickWorkloadSchedules(tick);
  expect(await root.services.workloads.list({ caller: owner, kind: "distill-characters" })).toHaveLength(1);
});

for (const withdrawal of ["consent", "credential"] as const) {
  test(`queued paid work honors current ${withdrawal} withdrawal without foreign fallback`, async () => {
    const wire = physicalWire();
    await using root = await createServerHarness({ providerFetch: wire.execute, secretBoxKey: SECRET_BOX_TEST_KEY });
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

test("a disabled member's schedule enqueues nothing on the tick, and the next tick after re-enable runs it on their own connection", async () => {
  const wire = physicalWire();
  await using root = await createServerHarness({ providerFetch: wire.execute, secretBoxKey: SECRET_BOX_TEST_KEY });
  const admin = await root.principalFor(root.ownerId);
  const member = await root.principalFor((await root.actor()).id);
  await fundedOwner(root, member);
  await card(root, member);
  await root.settleBackground();
  await root.services.workloads.createSchedule({ caller: member, ownerId: member.userId, mode: "singular", cadence: "daily", input: DISTILL });
  const tick = { db: databaseHandle(root.db), logger: root.logger, now: root.clock.now, start: root.services.workloads.start };
  const memberRuns = (): ReturnType<typeof root.services.workloads.list> =>
    root.services.workloads.list({ caller: admin, ownerId: member.userId, kind: "distill-characters" });

  await root.services.admin.setEnabled({ principal: admin, userId: member.userId, enabled: false });
  root.clock.advance(CADENCE_INTERVAL_MS.daily);
  const fundersBefore = wire.funders.length;
  await tickWorkloadSchedules(tick);
  expect(await memberRuns()).toEqual([]);
  expect(wire.funders).toHaveLength(fundersBefore);

  // Re-enabling resumes the schedule the way an unpaused one does: it is still due, so the next tick admits it.
  await root.services.admin.setEnabled({ principal: admin, userId: member.userId, enabled: true });
  await tickWorkloadSchedules(tick);
  const admitted = await memberRuns();
  expect(admitted).toHaveLength(1);
  const ref = admitted[0];
  if (ref === undefined) {
    throw new Error("the resumed schedule admitted no run");
  }
  await executeAdmitted(root, ref.id);
  expect(new Set(wire.funders.slice(fundersBefore))).toEqual(new Set([member.userId]));
});

test("a run queued for a member who is then disabled fails without a provider request, and a run started after re-enable succeeds", async () => {
  const wire = physicalWire();
  await using root = await createServerHarness({ providerFetch: wire.execute, secretBoxKey: SECRET_BOX_TEST_KEY });
  const admin = await root.principalFor(root.ownerId);
  const member = await root.principalFor((await root.actor()).id);
  await fundedOwner(root, member);
  await card(root, member);
  await root.settleBackground();
  const queued = await root.services.workloads.start({ caller: member, ownerId: member.userId, mode: "singular", input: DISTILL });
  await root.services.admin.setEnabled({ principal: admin, userId: member.userId, enabled: false });
  const fundersBefore = wire.funders.length;
  await executeAdmitted(root, queued.id);
  expect(await root.services.workloads.get({ caller: admin, id: queued.id })).toMatchObject({ status: "failed" });
  expect(wire.funders).toHaveLength(fundersBefore);

  await root.services.admin.setEnabled({ principal: admin, userId: member.userId, enabled: true });
  const resumed = await root.services.workloads.start({ caller: member, ownerId: member.userId, mode: "singular", input: DISTILL });
  await executeAdmitted(root, resumed.id);
  expect(await root.services.workloads.get({ caller: admin, id: resumed.id })).toMatchObject({ status: "succeeded" });
  expect(new Set(wire.funders.slice(fundersBefore))).toEqual(new Set([member.userId]));
});

test("a bulk memory sweep spends nothing on a disabled host's room, and covers it again once the host is re-enabled", async () => {
  const wire = physicalWire();
  // Every embed request names the encoder's owner, so the witness is who the sweep spent on, not what it stored.
  const embedFunders: (string | null)[] = [];
  const execute: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.method === "POST" && new URL(request.url).pathname.endsWith("/embeddings")) {
      embedFunders.push(request.headers.get(WORKLOAD_FUNDER_HEADER));
    }
    return await wire.execute(request);
  };
  await using root = await createServerHarness({ providerFetch: execute });
  const admin = await root.principalFor(root.ownerId);
  await fundedOwner(root, admin);
  await root.services.connection.setBinding({ principal: admin, task: "embed", connectionId: null });
  const adminCaller = await root.internalCallerFor(admin.userId);
  await adminCaller.settings.updateAppSettings({ partial: { memoryDefaults: { mode: "mixB", maxTier: 0 } } });
  const host = await root.principalFor((await root.actor()).id);
  const connections = await fundedOwner(root, host);
  await root.services.connection.update({
    principal: host,
    connectionId: connections.embed.id,
    patch: { transport: { headers: { [WORKLOAD_FUNDER_HEADER]: host.userId } } },
  });
  const hostCaller = await root.internalCallerFor(host.userId);
  await hostCaller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: true } });
  const chatId = await seedRecallRoom(hostCaller);
  for (let seq = 0; seq < 16; seq += 1) {
    await hostCaller.chat.commitMessage({
      chatId,
      timeZone: UTC_TIME_ZONE,
      content: `Hosted scene ${seq}: ${"The traveller repairs the orbital loom and preserves each witness. ".repeat(16)}`,
    });
  }
  await root.settleBackground();
  const sweep = async (): Promise<void> => {
    const ref = await root.services.workloads.start({ caller: admin, ownerId: admin.userId, mode: "bulk", input: { kind: "memory-backfill", params: {} } });
    await executeAdmitted(root, ref.id);
    expect(await root.services.workloads.get({ caller: admin, id: ref.id })).toMatchObject({ status: "succeeded" });
  };

  await root.services.admin.setEnabled({ principal: admin, userId: host.userId, enabled: false });
  const embedsBefore = embedFunders.length;
  const utilityBefore = wire.funders.length;
  await sweep();
  expect(embedFunders.slice(embedsBefore)).toEqual([]);
  expect(wire.funders).toHaveLength(utilityBefore);

  await root.services.admin.setEnabled({ principal: admin, userId: host.userId, enabled: true });
  await sweep();
  expect(new Set(embedFunders.slice(embedsBefore))).toEqual(new Set([host.userId]));
  expect(wire.funders.length).toBeGreaterThan(utilityBefore);
});
