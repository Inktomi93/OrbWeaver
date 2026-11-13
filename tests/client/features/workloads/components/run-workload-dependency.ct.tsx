import { testId } from "@orb/client/lib";
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { CADENCE_INTERVAL_MS } from "@orb/contracts/workloads";
import { routeOrbSocket, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { WORKLOAD_RUN_AFTER_NAME } from "#client/features/workloads/lib/workloads-names.ts";
import type { RunDependencyStory } from "./_run-dependency-stories.tsx";

const STORY = "tests/client/features/workloads/components/_run-dependency-stories/RunDependencyStory";
const RELOAD_READS_NAME = "Reload reads";

test.use({ viewport: { width: 1440, height: 900 } });

test("a dependency that ends while the dialog is open still gates the run", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
  const dependency = await caller.workloads.start({
    input: { kind: "reconcile-stats", params: {} },
    mode: "singular",
    scheduledAt: root.clock.now() + CADENCE_INTERVAL_MS.daily,
  });
  await routeTrpc(
    page,
    serveCorpusProcedures(caller, [
      "sessions.me",
      "workloads.list",
      "workloads.start",
      "workloads.estimateModelCalls",
      "workloads.listSchedules",
      "admin.listUsers",
      "connection.listBindings",
      "connection.list",
      "stream.attach",
      "stream.detach",
    ]),
  );
  await routeOrbSocket(page, { awaitAttaches: 0 });
  await mount<typeof RunDependencyStory>(STORY, { reloadName: RELOAD_READS_NAME });

  await page.getByTestId(testId("workloadsRunButton")).click();
  const dialog = page.getByTestId(testId("runWorkloadDialog"));
  const gate = dialog.getByRole("group", { name: WORKLOAD_RUN_AFTER_NAME, exact: true });
  await gate.getByRole("button").first().click();

  await caller.workloads.cancel({ id: dependency.id });
  await page.getByText(RELOAD_READS_NAME, { exact: true }).dispatchEvent("click");
  await expect(gate).toBeHidden();

  const started = page.waitForRequest(/workloads\.start/u);
  await page.getByTestId(testId("runWorkloadSubmit")).click();
  expect((await started).postData()).toContain(dependency.id);
});
