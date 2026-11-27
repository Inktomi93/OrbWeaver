// The admin's Global settings section lists each stored server-wide row by key with its value, ends a value the server
// cut in an ellipsis, and says so when the list holds only the first rows of a longer one.
import { testId } from "@orb/client/lib";
import { GLOBAL_SETTING_VALUE_PREVIEW_CHARS, GLOBAL_SETTINGS_LIST_LIMIT } from "@orb/contracts/settings";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { AdminGlobalSettingsStory } from "./_admin-global-settings-stories.tsx";

const STORY = "tests/client/features/user-admin/components/_admin-global-settings-stories/AdminGlobalSettingsStory";
const SHORT = { key: "application:ct-short", value: { marker: "kept" } } as const;
const LONG = { key: "application:ct-long", value: "x".repeat(GLOBAL_SETTING_VALUE_PREVIEW_CHARS * 2) } as const;
const FILL_PREFIX = "application:ct-fill-";

test("each stored global setting shows under its key with its value, and a value the server cut ends in an ellipsis", async ({ page, mount }) => {
  await using root = await createServerHarness({ startJobs: false });
  await root.services.settings.setGlobalSetting(SHORT.key, SHORT.value);
  await root.services.settings.setGlobalSetting(LONG.key, LONG.value);
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, serveCorpusProcedures(caller, ["sessions.me", "settings.listGlobalSettings"]));
  await mount<typeof AdminGlobalSettingsStory>(STORY, {});
  const section = page.getByTestId(testId("adminGlobalSettingsSection"));

  await expect(section.getByText(SHORT.key, { exact: true })).toBeVisible();
  await expect(section.getByText(JSON.stringify(SHORT.value), { exact: false })).toBeVisible();
  await expect(section.getByText(LONG.key, { exact: true })).toBeVisible();
  await expect(section.getByText(JSON.stringify(LONG.value), { exact: false })).toHaveCount(0);
  await expect(section.getByText("…", { exact: false })).toHaveCount(1);
  await expect(page.getByTestId(testId("adminGlobalSettingsPartial"))).toHaveCount(0);
});

test("a list holding only the first rows of a longer one says how many exist", async ({ page, mount }) => {
  await using root = await createServerHarness({ startJobs: false });
  for (let index = 0; index <= GLOBAL_SETTINGS_LIST_LIMIT; index += 1) {
    await root.services.settings.setGlobalSetting(`${FILL_PREFIX}${String(index).padStart(4, "0")}`, index);
  }
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, serveCorpusProcedures(caller, ["sessions.me", "settings.listGlobalSettings"]));
  await mount<typeof AdminGlobalSettingsStory>(STORY, {});

  await expect(page.getByTestId(testId("adminGlobalSettingsPartial"))).toBeVisible();
});
