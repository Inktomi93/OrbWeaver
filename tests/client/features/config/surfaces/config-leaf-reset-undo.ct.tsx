import { configSettingLabel } from "@orb/client/state";
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import type { SettingsCompositionStory } from "@orb/testkit/browser";
import { holdServed, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { SETTING_RESET_FAILED_TOAST, settingResetName } from "#client/components/shared-control-names.ts";
import { CHAT_MESSAGE_HANDLING_SUBCATEGORY } from "#client/features/chat/lib/chat-behavior-message-handling-model.ts";
import { CHAT_PANEL_UNDO_LABEL } from "#client/features/plugin/lib/plugin-copy.ts";
import type { UnmountableSectionStory } from "./_leaf-reset-unmount-stories.tsx";

const STORY = "tests/support/browser/ct-settings-composition-stories/SettingsCompositionStory";
const UNMOUNT_STORY = "tests/client/features/config/surfaces/_leaf-reset-unmount-stories/UnmountableSectionStory";
const STOPS_RESET = settingResetName(configSettingLabel(CHAT_MESSAGE_HANDLING_SUBCATEGORY, "customStoppingStrings"));
const SWIPE_RESET = settingResetName(configSettingLabel(CHAT_MESSAGE_HANDLING_SUBCATEGORY, "autoSwipe"));
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

  const reset = page.getByRole("button", { name: STOPS_RESET, exact: true });
  const rowId = await reset.locator("xpath=ancestor::*[@data-slot='setting-row'][1]").getAttribute("data-setting");
  const row = page.locator(`[data-slot="setting-row"][data-setting="${rowId}"]`);
  await reset.click();
  await expect.poll(() => calls.inputs(WRITE).length).toBe(1);
  expect((await caller.settings.getUserSettings()).config.chat.customStoppingStrings).toEqual([]);
  // The Reset button leaves with the reset, so the row's own control takes the focus it held.
  await expect(row.locator(":focus")).toHaveCount(1);
  await page.getByRole("button", { name: CHAT_PANEL_UNDO_LABEL, exact: true }).last().click();
  await expect.poll(() => calls.inputs(WRITE).length).toBe(2);
  expect((await caller.settings.getUserSettings()).config.chat.customStoppingStrings).toEqual(STOPS);
  // The Undo toast button leaves with the toast, so the returning Reset button takes the focus.
  await expect(reset).toBeFocused();

  await page.getByRole("button", { name: SWIPE_RESET, exact: true }).click();
  await expect.poll(() => calls.inputs(WRITE).length).toBe(3);
  expect((await caller.settings.getUserSettings()).config.chat.autoSwipe.blacklist).toEqual([]);
  await page.getByRole("button", { name: CHAT_PANEL_UNDO_LABEL, exact: true }).last().click();
  await expect.poll(() => calls.inputs(WRITE).length).toBe(4);
  expect((await caller.settings.getUserSettings()).config.chat.autoSwipe.blacklist).toEqual(SWIPE.blacklist);
});

test("the Undo toast still appears when the section unmounts while the reset write is in flight", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
  await caller.settings.updateUserSettingsSection({ section: "chat", patch: { customStoppingStrings: STOPS } });
  const hold = holdServed();
  await routeTrpc(
    page,
    serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", WRITE], (input) =>
      typeof input === "object" && "patch" in input ? hold : undefined,
    ),
  );
  await mount<typeof UnmountableSectionStory>(UNMOUNT_STORY, { sectionId: "chat-message-handling" });
  await page.getByRole("button", { name: STOPS_RESET, exact: true }).click();
  await hold.requested;
  await page.getByRole("button", { name: "Remove section", exact: true }).click();
  await expect(page.getByRole("button", { name: STOPS_RESET, exact: true })).toHaveCount(0);
  hold.release();
  await page.getByRole("button", { name: CHAT_PANEL_UNDO_LABEL, exact: true }).click();
  await expect.poll(async () => (await caller.settings.getUserSettings()).config.chat.customStoppingStrings).toEqual(STOPS);
});

test("a rejected reset write says so once, leaves the value, and offers no Undo", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
  await caller.settings.updateUserSettingsSection({ section: "chat", patch: { customStoppingStrings: STOPS } });
  await routeTrpc(
    page,
    serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", WRITE], (input) =>
      typeof input === "object" && "patch" in input ? trpcError({ code: "INTERNAL_SERVER_ERROR" }) : undefined,
    ),
  );
  await mount<typeof SettingsCompositionStory>(STORY, { sectionId: "chat-message-handling", width: 900 });
  await page.getByRole("button", { name: STOPS_RESET, exact: true }).click();
  const notices = page.getByText(SETTING_RESET_FAILED_TOAST);
  await expect(notices.first()).toBeVisible();
  await expect(page.getByRole("button", { name: CHAT_PANEL_UNDO_LABEL, exact: true })).toHaveCount(0);
  expect((await caller.settings.getUserSettings()).config.chat.customStoppingStrings).toEqual(STOPS);
  // One toast. The second text match is the page's alert live region, which mirrors the toast for screen readers.
  await expect(page.locator('[data-slot="toast-root"]')).toHaveCount(1);
  await expect(page.locator('[data-slot="toast-title"]').filter({ hasText: SETTING_RESET_FAILED_TOAST })).toHaveCount(1);
});
