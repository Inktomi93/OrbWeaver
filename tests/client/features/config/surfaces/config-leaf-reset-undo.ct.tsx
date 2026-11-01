import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import type { SettingsCompositionStory } from "@orb/testkit/browser";
import { holdServed, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { CHAT_PANEL_UNDO_LABEL } from "#client/features/plugin/lib/plugin-copy.ts";
import type { UnmountableSectionStory } from "./_leaf-reset-unmount-stories.tsx";

const STORY = "tests/support/browser/ct-settings-composition-stories/SettingsCompositionStory";
const UNMOUNT_STORY = "tests/client/features/config/surfaces/_leaf-reset-unmount-stories/UnmountableSectionStory";
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
  await page.getByRole("button", { name: CHAT_PANEL_UNDO_LABEL, exact: true }).last().click();
  await expect.poll(() => calls.inputs(WRITE).length).toBe(2);
  expect((await caller.settings.getUserSettings()).config.chat.customStoppingStrings).toEqual(STOPS);

  await page.getByRole("button", { name: "Reset Auto-swipe short replies to its default", exact: true }).click();
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
  await page.getByRole("button", { name: "Reset Custom stopping strings to its default", exact: true }).click();
  await hold.requested;
  await page.getByRole("button", { name: "Remove section", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reset Custom stopping strings to its default", exact: true })).toHaveCount(0);
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
  await page.getByRole("button", { name: "Reset Custom stopping strings to its default", exact: true }).click();
  const notices = page.getByText("Couldn't reset the setting.");
  await expect(notices.first()).toBeVisible();
  await expect(page.getByRole("button", { name: CHAT_PANEL_UNDO_LABEL, exact: true })).toHaveCount(0);
  expect((await caller.settings.getUserSettings()).config.chat.customStoppingStrings).toEqual(STOPS);
  // One toast. The second text match is the page's alert live region, which mirrors the toast for screen readers.
  await expect(page.locator('[data-slot="toast-root"]')).toHaveCount(1);
  await expect(page.locator('[data-slot="toast-title"]').filter({ hasText: "Couldn't reset the setting." })).toHaveCount(1);
});
