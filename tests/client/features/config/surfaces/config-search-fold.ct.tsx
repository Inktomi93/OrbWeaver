import { routeTrpc, serveCorpusProcedures, trpcHold } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusReadResponder } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { ConfigPanesStory } from "./_list-stories.tsx";

let root: Awaited<ReturnType<typeof createCorpusHarness>>;
test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

test("a search hit on a section inside a closed fold opens the fold", async ({ corpus, corpusViewer, mount, page }) => {
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
  await mount<typeof ConfigPanesStory>("tests/client/features/config/surfaces/_list-stories/ConfigPanesStory", { showList: true, initialGroup: "appearance" });
  const fold = page.getByRole("button", { name: /Customize this look/u });
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("combobox", { name: "Search settings" }).fill("effects");
  await page
    .getByRole("option", { name: /Effects/u })
    .first()
    .click();
  await expect(fold).toHaveAttribute("aria-expanded", "true");
});
