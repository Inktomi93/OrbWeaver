import { PROSE_SLOTS, USER_PROSE_SLOT_IDS } from "@orb/contracts/prose";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { ProseActionGroupsStory } from "./_prose-action-groups-stories.tsx";

const STORY = "tests/client/features/chat/components/_prose-action-groups-stories/ProseActionGroupsStory";
const SLOT_ID = USER_PROSE_SLOT_IDS[0];
if (SLOT_ID === undefined) {
  throw new Error("The prose reset case requires a user-home slot");
}
const SLOT = PROSE_SLOTS[SLOT_ID];
const TEXT = "A host's own wording for this slot.";
const WRITE = "settings.updateUserSettingsSection";

test("Reset to built-in asks first: Cancel writes nothing, Reset writes the clear once", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  const appearance = appearanceSettingsSchema.parse({});
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearance });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
  await caller.settings.updateUserSettingsSection({ section: "prose", patch: { [SLOT_ID]: { text: TEXT, baseVersion: SLOT.version } } });
  const calls = await routeTrpc(page, serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", WRITE]));
  await mount<typeof ProseActionGroupsStory>(STORY, { width: 600, appearance });
  const card = page.getByRole("group", { name: SLOT.title, exact: true });
  await expect(card.getByRole("textbox", { name: SLOT.title, exact: true })).toHaveValue(TEXT);

  await card.getByRole("button", { name: "Reset to built-in", exact: true }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(confirm).toHaveCount(0);
  expect(calls.inputs(WRITE)).toEqual([]);
  await expect(card.getByRole("textbox", { name: SLOT.title, exact: true })).toHaveValue(TEXT);

  await card.getByRole("button", { name: "Reset to built-in", exact: true }).click();
  await confirm.getByRole("button", { name: "Reset to built-in", exact: true }).click();
  await expect.poll(() => calls.inputs(WRITE).length).toBe(1);
  expect(calls.lastInput(WRITE)).toMatchObject({ section: "prose", patch: { [SLOT_ID]: null } });
});
