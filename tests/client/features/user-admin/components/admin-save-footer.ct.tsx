// @subject packages/client/src/features/config/components/config-save-footer.tsx
// @subject packages/client/src/features/user-admin/components/system-tuning-section.tsx
// Admin's pane footer says Saved only while no explicit-Save draft in the pane is pending.

import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { AdminSaveFooterStory } from "./_admin-save-footer-stories.tsx";

const STORY = "tests/client/features/user-admin/components/_admin-save-footer-stories/AdminSaveFooterStory";
const SAVED = "Saved";
const NOT_SAVED = "Not saved";

test.use({ hasTouch: false, isMobile: false, viewport: { width: 1280, height: 900 } });

test("the footer holds back Saved while an edited draft waits for its Save, and says Saved once it is saved", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  await page.route("**/api/auth/config", async (route) => {
    const response = await root.http.request("/api/auth/config");
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  await routeTrpc(
    page,
    serveCorpusProcedures(caller, [
      "sessions.me",
      "settings.getUserSettings",
      "settings.listThemes",
      "settings.getAppSettingsWithOverrides",
      "settings.updateAppSettings",
      "admin.listUsers",
      "share.status",
      "share.signInMode",
    ]),
  );
  await mount<typeof AdminSaveFooterStory>(STORY, {});
  const footer = page.locator('[data-slot="config-save-footer"]');
  const depth = page.getByRole("textbox", { name: /^Prompt-cache depth floor/u });
  await expect(depth).toBeVisible();
  // Positive control: before any edit the pane's sections have reported and every one is saved.
  await expect(footer).toHaveText(SAVED);

  const floor = Number(await depth.inputValue());
  await depth.fill(String(floor + 1));
  await expect(footer).toContainText(NOT_SAVED);
  await expect(footer).not.toHaveText(SAVED);

  await page.getByRole("button", { name: "Save", exact: true, disabled: false }).click();
  await expect(footer).toHaveText(SAVED);
  expect((await caller.settings.getAppSettingsWithOverrides()).resolved.promptCacheMinDepth).toBe(floor + 1);
});
