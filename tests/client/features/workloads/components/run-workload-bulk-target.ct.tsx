// A bulk import names the user whose library receives it; the start call must carry the user the owner picked.
// @subject packages/client/src/features/workloads/components/run-workload-dialog.tsx

import { testId } from "@orb/client/lib";
import { routeOrbSocket, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { WORKLOAD_KIND_LABELS } from "#client/features/workloads/lib/workloads-model.ts";
import { WORKLOAD_BULK_MODE_NAME, WORKLOAD_BULK_TARGET_NAME, WORKLOAD_JOB_FIELD_NAME } from "#client/features/workloads/lib/workloads-names.ts";
import type { RunDependencyStory } from "./_run-dependency-stories.tsx";

const STORY = "tests/client/features/workloads/components/_run-dependency-stories/RunDependencyStory";
const RELOAD_READS_NAME = "Reload reads";
// A far-off start keeps the job worker off the row this test starts.
const RUN_AT = "2031-05-17T10:30";

test.use({ viewport: { width: 1440, height: 900 } });

test("a bulk import start carries the user picked as its target, and not another user", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const bystander = await root.actor();
  const picked = await root.actor();
  const caller = await root.internalCallerFor(root.ownerId);
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
  await dialog.getByRole("combobox", { name: WORKLOAD_JOB_FIELD_NAME, exact: true }).click();
  await page.getByRole("option", { name: WORKLOAD_KIND_LABELS["import-st"], exact: true }).click();
  await dialog.getByRole("switch", { name: WORKLOAD_BULK_MODE_NAME, exact: true }).click();
  await dialog.getByRole("combobox", { name: WORKLOAD_BULK_TARGET_NAME, exact: true }).click();
  await page.getByRole("option", { name: picked.handle, exact: true }).click();
  await dialog.getByLabel("Run at", { exact: true }).fill(RUN_AT);

  const started = page.waitForRequest(/workloads\.start/u);
  await dialog.getByTestId(testId("runWorkloadSubmit")).click();
  const body = (await started).postData();
  expect(body).toContain(picked.id);
  expect(body).not.toContain(bystander.id);
  await expect(dialog).toBeHidden();
});
