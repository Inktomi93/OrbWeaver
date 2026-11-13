// A listed schedule carries the refusal its tick meets, judged as the tick judges it: a schedule whose owner is disabled
// lists with the disabled-account code, so an admin sees why it never runs, and loses it once the owner is enabled.
// @subject packages/server/src/domain/workloads/verbs/list-schedules.ts

import type { StartWorkloadInput } from "@orb/contracts/workloads";
import { WORKLOAD_RUN_ACCOUNT_DISABLED } from "@orb/contracts/workloads";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";

const STATS = { kind: "reconcile-stats", params: {} } satisfies StartWorkloadInput;

test("a disabled owner's schedule lists with the disabled-account refusal, and an enabled owner's lists with none", async () => {
  await using root = await createServerHarness({ startJobs: false });
  const admin = await root.principalFor(root.ownerId);
  const member = await root.actor();
  const owner = await root.internalCallerFor(root.ownerId);
  const schedule = await (await root.internalCallerFor(member.id)).workloads.createSchedule({ input: STATS, cadence: "daily" });
  const listed = async (): Promise<unknown> => (await owner.workloads.listSchedules({})).find((row) => row.id === schedule.id);

  // Control: an enabled owner's schedule starts, so its row names no refusal.
  expect(await listed()).not.toHaveProperty("refusal");

  await root.services.admin.setEnabled({ principal: admin, userId: member.id, enabled: false });
  expect(await listed()).toMatchObject({ id: schedule.id, refusal: WORKLOAD_RUN_ACCOUNT_DISABLED });

  await root.services.admin.setEnabled({ principal: admin, userId: member.id, enabled: true });
  expect(await listed()).not.toHaveProperty("refusal");
});
