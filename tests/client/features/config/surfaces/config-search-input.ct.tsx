import { routeTrpc, serveCorpusProcedures, trpcHold } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusReadResponder } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { makePluginRow } from "@orb/testkit/node/helpers";
import type { ConfigListStory } from "./_list-stories.tsx";

const PLUGIN_SLUG = "zephyr-notes";

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
    // The admin-only overrides read only decorates the Modified marks; leaving it pending is the honest cold state.
    "settings.getAppSettingsWithOverrides": () => overridesHold,
    ...serveCorpusProcedures(await root.internalCallerFor(root.ownerId), [
      "persona.list",
      "regex.countScripts",
      "regex.listScripts",
      "worldInfo.countBooks",
      "worldInfo.listBooksWithUsage",
      "rosterPreset.count",
      "rosterPreset.list",
    ]),
    "plugin.list": () => [makePluginRow({ slug: PLUGIN_SLUG, name: "Zephyr Notes" })],
  });
  await mount<typeof ConfigListStory>("tests/client/features/config/surfaces/_list-stories/ConfigListStory", {});
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

test("@in: offers the visible group names as completions", async ({ page }) => {
  const search = page.getByRole("combobox", { name: "Search settings" });
  await search.fill("@in:appear");
  await expect(page.getByRole("option", { name: /@in:appearance/u })).toBeVisible();
  await page.getByRole("option", { name: /@in:appearance/u }).click();
  await expect(search).toHaveValue("@in:appearance ");
});

test("@plugin: offers the installed plugin slugs as completions", async ({ page }) => {
  const search = page.getByRole("combobox", { name: "Search settings" });
  await search.fill("@plugin:zeph");
  await expect(page.getByRole("option", { name: new RegExp(`@plugin:${PLUGIN_SLUG}`, "u") })).toBeVisible();
});

test("a search with no match is announced through a status live region", async ({ page }) => {
  await page.getByRole("combobox", { name: "Search settings" }).fill("qqzzxxnomatch");
  const status = page.getByRole("status").filter({ hasText: "qqzzxxnomatch" });
  await expect(status).toHaveCount(1);
});
