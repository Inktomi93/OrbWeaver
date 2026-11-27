// @subject packages/client/src/features/workloads/components/schedules-section.tsx
// A schedule row says when it last ran beside its next run, and says so when its tick has never started a run.
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { SCHEDULE_LAST_RUN_LEAD, SCHEDULE_NEVER_RUN_TEXT } from "#client/features/workloads/lib/workloads-names.ts";
import { scheduleEnabledSwitchName } from "#client/features/workloads/lib/workloads-schedule-model.ts";
import type { ScheduleDialogDismissalStory } from "./_schedule-dialog-dismissal-stories.tsx";

const STORY = "tests/client/features/workloads/components/_schedule-dialog-dismissal-stories/ScheduleDialogDismissalStory";
/** A kind the corpus holds no schedule of, so the row this case adds is the only one of its name. */
const ADDED_KIND = "import-token-usage-backfill";
const READS = ["sessions.me", "workloads.listSchedules", "admin.listUsers", "settings.getUserSettings", "connection.listBindings", "connection.list"] as const;

test("a schedule whose tick has run shows its last run and one that never ran says so", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const created = await caller.workloads.createSchedule({ input: { kind: ADDED_KIND, params: {} }, mode: "singular", cadence: "daily", enabled: true });
  const listed = await caller.workloads.listSchedules({});
  const ran = listed.find((schedule) => schedule.lastRunAt !== null);
  const never = listed.find((schedule) => schedule.id === created.id);
  if (ran === undefined || never === undefined) {
    throw new Error("The corpus must hold a schedule its tick has run, and the case adds one that has not");
  }
  expect(never.lastRunAt).toBeNull();
  await routeTrpc(page, serveCorpusProcedures(caller, READS));
  await mount<typeof ScheduleDialogDismissalStory>(STORY, { width: 900 });

  const rowOf = (schedule: (typeof listed)[number]): ReturnType<typeof page.locator> =>
    page
      .locator('[data-slot="list-row-root"]')
      .filter({ has: page.getByRole("switch", { name: scheduleEnabledSwitchName({ ...schedule, ownerHandle: null }), exact: true }) });
  await expect(rowOf(ran)).toHaveCount(1);
  await expect(rowOf(ran).getByText(SCHEDULE_LAST_RUN_LEAD)).toBeVisible();
  await expect(rowOf(ran).getByText(SCHEDULE_NEVER_RUN_TEXT)).toHaveCount(0);
  await expect(rowOf(never)).toHaveCount(1);
  await expect(rowOf(never).getByText(SCHEDULE_NEVER_RUN_TEXT)).toBeVisible();
  await expect(rowOf(never).getByText(SCHEDULE_LAST_RUN_LEAD)).toHaveCount(0);
});
