import { ROW_DELETE_NAME } from "@orb/client/lib";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { PRESET_EDITOR_NAME } from "#client/features/preset/lib/preset-names.ts";
import type { PresetActionGroupsStory } from "./_preset-action-groups-stories.tsx";

const STORY = "tests/client/features/preset/components/_preset-action-groups-stories/PresetActionGroupsStory";
const PROCEDURES = [
  "sessions.me",
  "settings.getUserSettings",
  "settings.updateUserSettingsSection",
  "preset.list",
  "preset.get",
  "preset.remove",
  "preset.resolveEffective",
  "connection.resolveChatCapability",
  "connection.providersAvailable",
  "connection.list",
] as const;

test("deleting the open preset from its row closes the editor on that id", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const preset = await caller.preset.create({ name: "Disposable open preset", kind: "generation" });
  await routeTrpc(page, serveCorpusProcedures(caller, PROCEDURES));
  await mount<typeof PresetActionGroupsStory>(STORY, { width: 960, appearance: appearanceSettingsSchema.parse({}), subject: "section" });
  const open = page.getByRole("button", { name: preset.name, exact: true });
  const editor = page.getByRole("region", { name: PRESET_EDITOR_NAME, exact: true });
  await open.click();
  await expect(editor).toBeVisible();
  const row = page.locator('[data-slot="list-row-root"]').filter({ has: open });
  await row.hover();
  await row.locator('button[aria-haspopup="menu"]').click();
  await page.getByRole("menu").getByRole("menuitem", { name: ROW_DELETE_NAME, exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: ROW_DELETE_NAME, exact: true }).click();
  await expect(open).toHaveCount(0);
  await expect(editor).toHaveCount(0);
});
