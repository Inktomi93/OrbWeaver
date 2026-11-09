// @subject packages/client/src/features/workloads/components/schedules-section.tsx
// A member who holds no schedule reads the section's EmptyState; its New schedule action stays inside the phone column at 300% layout.
import { testId } from "@orb/client/lib";
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { LAYOUT_SUBPIXEL_PX, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { ScheduleDialogDismissalStory } from "./_schedule-dialog-dismissal-stories.tsx";

const STORY = "tests/client/features/workloads/components/_schedule-dialog-dismissal-stories/ScheduleDialogDismissalStory";
const PHONE = { width: 320, height: 568 } as const;
const LAYOUT_300 = 3;
const READS = ["sessions.me", "workloads.listSchedules", "admin.listUsers", "settings.getUserSettings", "connection.listBindings", "connection.list"] as const;

test.describe("the empty Schedules section at 300% layout on the 320px phone", () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  test("keeps its New schedule action inside the column", async ({ mount, page }) => {
    await using root = await createCorpusHarness();
    const member = await root.actor();
    const caller = await root.internalCallerFor(member.id);
    await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
    expect(await caller.workloads.listSchedules({})).toEqual([]);
    await routeTrpc(page, serveCorpusProcedures(caller, READS));
    await mount<typeof ScheduleDialogDismissalStory>(STORY, { width: PHONE.width });

    const section = page.getByTestId(testId("workloadsSchedulesSection"));
    const action = section.locator('[data-slot="empty-state-action"]').getByTestId(testId("scheduleCreateButton"));
    await expect(action).toBeVisible();
    // !important: the appearance writer owns the inline value and rewrites it after boot.
    await setRootFontScale(page, channelName("fontScale"), LAYOUT_300);
    await expect
      .poll(async () => {
        const [within, box] = await Promise.all([section.boundingBox(), action.boundingBox()]);
        return within !== null && box !== null && box.x >= within.x - LAYOUT_SUBPIXEL_PX && box.x + box.width <= within.x + within.width + LAYOUT_SUBPIXEL_PX;
      })
      .toBe(true);
  });
});
