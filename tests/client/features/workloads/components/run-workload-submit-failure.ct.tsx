// A refused Run job is said once, inline, in the dialog that stays open, and the dialog keeps the time the person typed.
// @subject packages/client/src/features/workloads/components/run-workload-dialog.tsx

import { testId } from "@orb/client/lib";
import { watchToastMounts } from "@orb/testkit/browser/spec";
import { routeOrbSocket, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { RunDependencyStory } from "./_run-dependency-stories.tsx";

const STORY = "tests/client/features/workloads/components/_run-dependency-stories/RunDependencyStory";
const RUN_AT = "2031-05-17T10:30";

test.use({ viewport: { width: 1440, height: 900 } });

test("a refused Run job keeps the typed run time in the open dialog and says the refusal there", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, [
      "sessions.me",
      "workloads.list",
      "workloads.estimateModelCalls",
      "workloads.listSchedules",
      "admin.listUsers",
      "connection.listBindings",
      "connection.list",
      "stream.attach",
      "stream.detach",
    ]),
    ...serveCorpusProcedures(caller, ["workloads.start"], () => trpcError()),
  });
  await routeOrbSocket(page, { awaitAttaches: 0 });
  const toastMounts = await watchToastMounts(page);
  await mount<typeof RunDependencyStory>(STORY, { reloadName: "Reload reads" });

  await page.getByTestId(testId("workloadsRunButton")).click();
  const dialog = page.getByTestId(testId("runWorkloadDialog"));
  const runAt = dialog.getByLabel("Run at", { exact: true });
  await runAt.fill(RUN_AT);
  await dialog.getByTestId(testId("runWorkloadSubmit")).click();

  await expect(dialog.getByRole("alert")).toBeVisible();
  expect(await toastMounts()).toBe(0);
  await expect(runAt).toHaveValue(RUN_AT);
});
