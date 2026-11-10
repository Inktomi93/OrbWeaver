// @subject packages/client/src/features/workloads/components/workloads-jobs-section.tsx
// With no jobs, a filtered tab's empty state says where its next step is and offers no second Run a job door.
import { testId } from "@orb/client/lib";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { routeOrbSocket, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import { WORKLOAD_FILTER_LABELS, WORKLOAD_FILTERS } from "#client/features/workloads/lib/workloads-model.ts";
import type { WorkloadActionGroupsStory } from "./_action-groups-stories.tsx";

const STORY = "tests/client/features/workloads/components/_action-groups-stories/WorkloadActionGroupsStory";
const ROOT_OPTIONS = {
  env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
  physicalPeer: () => "127.0.0.1",
  startJobs: false,
} as const;
const READS = [
  "settings.getUserSettings",
  "sessions.me",
  "workloads.list",
  "admin.listUsers",
  "connection.listBindings",
  "connection.list",
  "stream.attach",
  "stream.detach",
] as const;
const FILTERED = WORKLOAD_FILTERS.filter((id) => id !== "all");

test("each filtered empty tab states its next step and leaves Run a job to the header", async ({ mount, page }) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const caller = await root.internalCallerFor(root.ownerId);
  expect(await caller.workloads.list({})).toEqual([]);
  await routeTrpc(page, serveCorpusProcedures(caller, READS));
  await routeOrbSocket(page, { awaitAttaches: 2 });
  await mount<typeof WorkloadActionGroupsStory>(STORY, { sectionId: "workloads-jobs", width: 960, appearance: appearanceSettingsSchema.parse({}) });

  const header = page.getByTestId(testId("workloadsRunButton"));
  await expect(header).toBeVisible();
  const allPanel = page.getByRole("tabpanel");
  await expect(allPanel.getByRole("button"), "the All tab offers its own action").toHaveCount(1);

  for (const id of FILTERED) {
    await page.getByRole("tab", { name: WORKLOAD_FILTER_LABELS[id], exact: true }).click();
    // The panel its tab names: a leaving panel can still be mounted during the switch.
    const panel = page.getByRole("tabpanel", { name: WORKLOAD_FILTER_LABELS[id], exact: true });
    await expect(panel.locator('[data-slot="empty-state-title"]')).toBeVisible();
    await expect(panel.locator('[data-slot="empty-state-description"]'), `the ${id} tab says where its next step is`).toBeVisible();
    await expect(panel.getByRole("button"), `the ${id} tab mints no second Run a job door`).toHaveCount(0);
    await expect(header).toBeVisible();
  }
});
