import { routeTrpc, serveCorpusProcedures, trpcHold } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusReadResponder } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { ConfigListStory, ConfigPanesStory } from "./_list-stories.tsx";

let root: Awaited<ReturnType<typeof createCorpusHarness>>;
test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.beforeEach(async ({ corpus, corpusViewer, mount, page }) => {
  const overridesHold = trpcHold<"settings.getAppSettingsWithOverrides">();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await routeTrpc(page, {
    "sessions.me": createCorpusReadResponder("sessions.me", corpusViewer.userId, corpus.reads["sessions.me"]),
    "settings.getUserSettings": createCorpusReadResponder("settings.getUserSettings", corpusViewer.userId, corpus.reads["settings.getUserSettings"]),
    "settings.listThemes": createCorpusReadResponder("settings.listThemes", corpusViewer.userId, corpus.reads["settings.listThemes"]),
    "settings.getAppSettingsWithOverrides": () => overridesHold,
    ...serveCorpusProcedures(await root.internalCallerFor(root.ownerId), [
      "persona.list",
      "regex.countScripts",
      "regex.listScripts",
      "worldInfo.countBooks",
      "worldInfo.listBooksWithUsage",
      "rosterPreset.count",
      "rosterPreset.list",
      "plugin.list",
    ]),
  });
  await mount<typeof ConfigListStory>("tests/client/features/config/surfaces/_list-stories/ConfigListStory", {});
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

const BANDS = '[data-slot="config-group"] button[aria-expanded]';

test("the arrival default opens the first group, and moving on folds it without a remembered disclosure", async ({ page }) => {
  const bands = page.locator(BANDS);
  const first = bands.nth(0);
  const second = bands.nth(1);
  await expect(first).toHaveAttribute("aria-expanded", "true");
  await expect(second).toHaveAttribute("aria-expanded", "false");
  await second.click();
  await expect(second).toHaveAttribute("aria-expanded", "true");
  await expect(first).toHaveAttribute("aria-expanded", "false");
});

test("a group the reader opened stays open after they move on", async ({ page }) => {
  const bands = page.locator(BANDS);
  const first = bands.nth(0);
  const second = bands.nth(1);
  await expect(first).toHaveAttribute("aria-expanded", "true");
  await first.click();
  await second.click();
  await expect(second).toHaveAttribute("aria-expanded", "true");
  await expect(first).toHaveAttribute("aria-expanded", "true");
});

test("a late settings list preserves focus already owned by the content pane", async ({ mount, page }) => {
  const mounted = await mount<typeof ConfigPanesStory>("tests/client/features/config/surfaces/_list-stories/ConfigPanesStory", { showList: false });
  const content = page.locator('[data-slot="config-content"]');
  await expect(content).toBeVisible();
  await content.focus();
  await expect(content).toBeFocused();
  await mounted.update({ showList: true });
  await expect(page.locator(BANDS).first()).toBeVisible();
  await expect(content).toBeFocused();
});

test("a late settings list still takes arrival focus from navigation", async ({ mount, page }) => {
  const mounted = await mount<typeof ConfigPanesStory>("tests/client/features/config/surfaces/_list-stories/ConfigPanesStory", { showList: false });
  await page.getByRole("button", { name: "Navigation origin", exact: true }).focus();
  await mounted.update({ showList: true });
  await expect(page.locator(BANDS).first()).toBeFocused();
});

test("a late settings list preserves the actual control selected by a content deep link", async ({ mount, page }) => {
  const mounted = await mount<typeof ConfigPanesStory>("tests/client/features/config/surfaces/_list-stories/ConfigPanesStory", {
    showList: false,
    initialGroup: "appearance",
  });
  const control = page.locator('[data-slot="config-content"]').getByRole("button").first();
  await expect(control).toBeVisible();
  await control.focus();
  await expect(control).toBeFocused();
  await mounted.update({ showList: true, initialGroup: "appearance" });
  await expect(page.locator(BANDS).first()).toBeVisible();
  await expect(control).toBeFocused();
});
