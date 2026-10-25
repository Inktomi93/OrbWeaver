import { routeTrpc } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusWire } from "@orb/testkit/iso";
import { createCorpusReadResponder } from "@orb/testkit/iso";
import type { Locator, Page } from "@playwright/test";
import { OWNER_CSS_SHELL_CLASSES, OWNER_CSS_SLOTS, OWNER_CSS_TOKEN_VARS } from "../../../../../packages/client/owner-css-surface.ts";
import type { FirstBootStory } from "./_first-boot-stories.tsx";

// The custom-CSS editor, reached the way an author reaches it: Settings → Appearance → a new theme → advanced tools.

const SLOT = OWNER_CSS_SLOTS[0];
const TOKEN = OWNER_CSS_TOKEN_VARS[0];
const SHELL_CLASS = OWNER_CSS_SHELL_CLASSES[0];

async function openThemeCssEditor(page: Page, corpus: CorpusWire): Promise<void> {
  const { firstBoot } = corpus;
  if (firstBoot === undefined) {
    throw new Error("The corpus has no first-boot capture");
  }
  const { reads } = firstBoot;
  const [theme] = reads.themes.output;
  if (theme === undefined) {
    throw new Error("The first-boot capture lists no themes");
  }
  await routeTrpc(page, {
    "sessions.me": createCorpusReadResponder("sessions.me", [reads.viewer]),
    "settings.getUserSettings": createCorpusReadResponder("settings.getUserSettings", [reads.settings]),
    "settings.listThemes": createCorpusReadResponder("settings.listThemes", [reads.themes]),
    "settings.getAppSettingsWithOverrides": createCorpusReadResponder("settings.getAppSettingsWithOverrides", [reads.appSettings]),
    // Autosave mints a copy on the first edit; the editor under test does not depend on what comes back.
    "settings.duplicateTheme": () => theme,
    "settings.updateTheme": () => theme,
  });
}

async function typeIntoEditor(page: Page, text: string): Promise<void> {
  await page.getByRole("button", { name: /^New theme/u }).click();
  await page.getByRole("button", { name: "Show advanced theme tools" }).click();
  const editor = page.getByRole("textbox", { name: "Custom theme CSS" });
  await editor.click();
  await page.keyboard.type(text);
}

const completionOption = (page: Page, label: string): Locator => page.locator(".cm-tooltip-autocomplete [role=option]").filter({ hasText: label });

test.beforeEach(async ({ corpus, mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openThemeCssEditor(page, corpus);
  await mount<typeof FirstBootStory>("tests/client/features/config/surfaces/_first-boot-stories/FirstBootStory", {
    group: "appearance",
    phone: false,
    width: 900,
  });
});

test('[data-slot=" offers slot names and nothing else', async ({ page }) => {
  await typeIntoEditor(page, `[data-slot="${SLOT.slice(0, -1)}`);
  await expect(completionOption(page, SLOT)).toBeVisible();
  await expect(completionOption(page, TOKEN)).toHaveCount(0);
  await expect(completionOption(page, SHELL_CLASS)).toHaveCount(0);
});

test("var(-- offers tokens", async ({ page }) => {
  await typeIntoEditor(page, `a { color: var(${TOKEN.slice(0, -1)}`);
  await expect(completionOption(page, TOKEN)).toBeVisible();
  await expect(completionOption(page, SLOT)).toHaveCount(0);
});

test(".shell- offers shell classes", async ({ page }) => {
  await typeIntoEditor(page, `.${SHELL_CLASS.slice(0, -1)}`);
  await expect(completionOption(page, SHELL_CLASS)).toBeVisible();
  await expect(completionOption(page, SLOT)).toHaveCount(0);
});

test("accepting a slot completion writes the name into the selector", async ({ page }) => {
  await typeIntoEditor(page, `[data-slot="${SLOT.slice(0, -1)}`);
  await completionOption(page, SLOT).click();
  await expect(page.getByRole("textbox", { name: "Custom theme CSS" })).toContainText(`[data-slot="${SLOT}"`);
});
