// The admin's Global settings section lists each stored server-wide row by key with its value and write time, and a
// value past the preview cap ends in an ellipsis instead of printing whole.
import { testId } from "@orb/client/lib";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import { ADMIN_GLOBAL_SETTING_VALUE_PREVIEW_CHARS } from "#client/features/user-admin/lib/user-admin-names.ts";
import type { AdminGlobalSettingsStory } from "./_admin-global-settings-stories.tsx";

const STORY = "tests/client/features/user-admin/components/_admin-global-settings-stories/AdminGlobalSettingsStory";
const SHORT = { key: "application:ct-short", value: { marker: "kept" } } as const;
const LONG = { key: "application:ct-long", value: "x".repeat(ADMIN_GLOBAL_SETTING_VALUE_PREVIEW_CHARS * 2) } as const;

test("each stored global setting shows under its key with its value, and a value past the cap is cut", async ({ page, mount }) => {
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
});
