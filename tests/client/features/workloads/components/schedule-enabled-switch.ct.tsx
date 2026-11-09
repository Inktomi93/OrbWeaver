// @subject packages/client/src/features/workloads/components/schedules-section.tsx
// Each schedule row's enable switch keeps one stable name for the schedule; `aria-checked` alone carries the state.
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { scheduleEnabledSwitchName } from "#client/features/workloads/lib/workloads-schedule-model.ts";
import type { ScheduleDialogDismissalStory } from "./_schedule-dialog-dismissal-stories.tsx";

const STORY = "tests/client/features/workloads/components/_schedule-dialog-dismissal-stories/ScheduleDialogDismissalStory";
/** A kind the corpus holds no schedule of, so each switch name belongs to one row. */
const ADDED_KIND = "import-token-usage-backfill";
const READS = [
  "sessions.me",
  "workloads.listSchedules",
  "workloads.setScheduleEnabled",
  "admin.listUsers",
  "settings.getUserSettings",
  "connection.listBindings",
  "connection.list",
] as const;

test("two schedules in opposite states are found by their stable names, and a flip moves only aria-checked", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const [corpusSchedule] = await caller.workloads.listSchedules({});
  if (corpusSchedule === undefined) {
    throw new Error("The corpus must contain a schedule");
  }
  await caller.workloads.createSchedule({
    input: { kind: ADDED_KIND, params: {} },
    mode: "singular",
    cadence: "daily",
    enabled: false,
  });
  await caller.workloads.setScheduleEnabled({ id: corpusSchedule.id, enabled: true });
  await routeTrpc(page, serveCorpusProcedures(caller, READS));
  await mount<typeof ScheduleDialogDismissalStory>(STORY, { width: 900 });

  const onSwitch = page.getByRole("switch", { name: scheduleEnabledSwitchName(corpusSchedule.kind), exact: true });
  const offSwitch = page.getByRole("switch", { name: scheduleEnabledSwitchName(ADDED_KIND), exact: true });
  await expect(onSwitch).toHaveAttribute("aria-checked", "true");
  await expect(offSwitch).toHaveAttribute("aria-checked", "false");
  await offSwitch.click();
  await expect(offSwitch).toHaveAttribute("aria-checked", "true");
  await expect(onSwitch).toHaveAttribute("aria-checked", "true");
});
