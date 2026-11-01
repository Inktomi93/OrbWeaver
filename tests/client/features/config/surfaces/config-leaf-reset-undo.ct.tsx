import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import type { SettingsCompositionStory } from "@orb/testkit/browser";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";

const STORY = "tests/support/browser/ct-settings-composition-stories/SettingsCompositionStory";
const WRITE = "settings.updateUserSettingsSection";
const STOPS = ["alpha stop", "beta stop"];
const SWIPE = { enabled: true, minLength: 40, blacklist: ["as an AI"], maxRetries: 3 };

test("a leaf holding a list or object resets with an Undo that restores what was typed", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
  await caller.settings.updateUserSettingsSection({ section: "chat", patch: { customStoppingStrings: STOPS, autoSwipe: SWIPE } });
  const calls = await routeTrpc(page, serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", WRITE]));
  await mount<typeof SettingsCompositionStory>(STORY, { sectionId: "chat-message-handling", width: 900 });

  await page.getByRole("button", { name: "Reset Custom stopping strings to its default", exact: true }).click();
  await expect.poll(() => calls.inputs(WRITE).length).toBe(1);
  expect((await caller.settings.getUserSettings()).config.chat.customStoppingStrings).toEqual([]);
  await page.getByRole("button", { name: "Undo", exact: true }).last().click();
  await expect.poll(() => calls.inputs(WRITE).length).toBe(2);
  expect((await caller.settings.getUserSettings()).config.chat.customStoppingStrings).toEqual(STOPS);

  await page.getByRole("button", { name: "Reset Auto-swipe short replies to its default", exact: true }).click();
  await expect.poll(() => calls.inputs(WRITE).length).toBe(3);
  expect((await caller.settings.getUserSettings()).config.chat.autoSwipe.blacklist).toEqual([]);
  await page.getByRole("button", { name: "Undo", exact: true }).last().click();
  await expect.poll(() => calls.inputs(WRITE).length).toBe(4);
  expect((await caller.settings.getUserSettings()).config.chat.autoSwipe.blacklist).toEqual(SWIPE.blacklist);
});
