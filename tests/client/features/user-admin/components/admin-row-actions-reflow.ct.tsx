// @subject packages/client/src/features/user-admin/components/admin-user-row.tsx
// An account row's actions (a status badge, a role field, an enabled switch and a menu) hold the row's width at the largest browser text on a phone:
// the cluster wraps onto further lines instead of running past the row's end edge, and the pane never scrolls sideways.
import { brandedId } from "@orb/kit/ids";
import { LAYOUT_SUBPIXEL_PX, PLATFORM_TEXT_SCALES, setPlatformTextSize, sidewaysReach } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { Locator } from "@playwright/test";
import type { AdminUsersStory } from "./_admin-users-stories.tsx";

const STORIES = "tests/client/features/user-admin/components/_admin-users-stories";
const handleSchema = brandedId("Handle");
const PHONE = { width: 390, height: 844 } as const;
const ROW = '[data-slot="list-row-root"]';

test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

/** How far each of a row's action controls ends past the row's inline end edge. */
async function actionsPastRow(row: Locator): Promise<number[]> {
  return await row.evaluate((root) => {
    const edge = root.getBoundingClientRect().right;
    return [...root.querySelectorAll('[data-slot="list-row-actions"] :is(button, [role="switch"], [role="combobox"])')].map((control) =>
      Math.max(0, control.getBoundingClientRect().right - edge),
    );
  });
}

for (const scale of PLATFORM_TEXT_SCALES) {
  test.describe(`at ${String(scale * 100)}% text`, () => {
    test("an account row's actions stay inside the row", async ({ browserName, mount, page }) => {
      test.skip(browserName !== "chromium", "Only Chromium exposes the browser's default font size; WebKit has no text-size door");
      await using _textSize = await setPlatformTextSize(page, scale);
      await using root = await createServerHarness({ startJobs: false });
      const caller = await root.internalCallerFor(root.ownerId);
      const paused = handleSchema.parse("paused-member");
      const pausedRow = await caller.admin.createUser({ handle: paused, password: "paused-member-password" });
      await caller.admin.setEnabled({ userId: pausedRow.id, enabled: false });
      await routeTrpc(
        page,
        serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", "admin.listUsers", "admin.setEnabled", "admin.listSessions"]),
      );
      const component = await mount<typeof AdminUsersStory>(`${STORIES}/AdminUsersStory`, {});
      // The disabled member's row holds the widest cluster: the Disabled badge, a role field, the switch and the menu.
      const row = component.locator(ROW).filter({ has: page.getByRole("switch", { name: /paused-member/u }) });
      await expect(row).toBeVisible();
      await expect(row.getByText("Disabled", { exact: true })).toBeVisible();
      const controls = await actionsPastRow(row);
      expect(controls).toHaveLength(3);
      for (const past of controls) {
        expect(past).toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);
      }
      const reach = await row.evaluate(sidewaysReach);
      expect(reach.wideners).toEqual([]);
    });
  });
}
