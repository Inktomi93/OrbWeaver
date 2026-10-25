import { routeTrpc, serveCorpusProcedures, trpcHold } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusReadResponder } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { ConfigListStory } from "./_list-stories.tsx";

let root: Awaited<ReturnType<typeof createCorpusHarness>>;
test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.beforeEach(async ({ corpus, mount, page }) => {
  const overridesHold = trpcHold<"settings.getAppSettingsWithOverrides">();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await routeTrpc(page, {
    "sessions.me": createCorpusReadResponder("sessions.me", corpus.reads["sessions.me"]),
    "settings.getUserSettings": createCorpusReadResponder("settings.getUserSettings", corpus.reads["settings.getUserSettings"]),
    "settings.listThemes": createCorpusReadResponder("settings.listThemes", corpus.reads["settings.listThemes"]),
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
