// The install's Character trust defaults are one block: the "Default for characters" step and the internet-media switch
// side by side under one heading, as a character's Trust tab reads. The switch reads the stored block inverted: on
// loads internet media, and each flip writes the one stored key, `forbidExternalMedia`, through the real admin save.
// Production entry: the admin settings sections (`AdminResetNamesStory` mounts them all) over a composed server.
import { CHARACTER_TRUST_BLOCK_LABEL, DEFAULT_HTML_STEP_SETTING_LABEL, LOAD_INTERNET_MEDIA_LABEL } from "@orb/client/lib";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { AdminResetNamesStory } from "./_admin-action-groups-stories.tsx";

const STORY = "tests/client/features/user-admin/components/_admin-action-groups-stories/AdminResetNamesStory";

test.use({ viewport: { width: 1280, height: 900 } });

test("the install's Character trust block holds the default step and the internet-media switch, which writes the stored block inverted", async ({
  page,
  mount,
}) => {
  await using root = await createServerHarness({ startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateAppSettings({ partial: { forbidExternalMedia: true } });
  await page.route("**/api/auth/config", async (route) => {
    const response = await root.http.request("/api/auth/config");
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  const calls = await routeTrpc(
    page,
    serveCorpusProcedures(caller, [
      "sessions.me",
      "settings.getUserSettings",
      "settings.getAppSettingsWithOverrides",
      "settings.updateAppSettings",
      "admin.listUsers",
      "share.status",
      "share.signInMode",
    ]),
  );
  await mount<typeof AdminResetNamesStory>(STORY, { width: 960, appearance: appearanceSettingsSchema.parse({}) });
  const block = page.locator("section").filter({ has: page.getByRole("heading", { name: CHARACTER_TRUST_BLOCK_LABEL, exact: true }) });
  await expect(block).toHaveCount(1);
  await expect(block.getByRole("combobox", { name: DEFAULT_HTML_STEP_SETTING_LABEL, exact: true })).toBeVisible();
  const media = block.getByRole("switch", { name: LOAD_INTERNET_MEDIA_LABEL, exact: true });
  // The install blocks internet media, so the switch that loads it reads off.
  await expect(media).toHaveAttribute("aria-checked", "false");
  await media.click();
  await expect.poll(async () => (await caller.settings.getAppSettingsWithOverrides()).resolved.forbidExternalMedia).toBe(false);
  await expect(media).toHaveAttribute("aria-checked", "true");
  await media.click();
  await expect.poll(async () => (await caller.settings.getAppSettingsWithOverrides()).resolved.forbidExternalMedia).toBe(true);
  expect(calls.inputs("settings.updateAppSettings")).toEqual([{ partial: { forbidExternalMedia: false } }, { partial: { forbidExternalMedia: true } }]);
});
