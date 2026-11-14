// A settings control never carries the name of another door on the plane it sits on: no row in the Settings list repeats a
// rail section's name, and the theme builder's colour field repeats no row of the Appearance list beside it.
import { routeTrpc, SECTION_LABELS, serveCorpusProcedures, trpcHold } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusReadResponder } from "@orb/testkit/iso";
import { createCorpusHarness, createFirstBootHarness } from "@orb/testkit/node/composed";
import { CONFIG_NEW_THEME_LEAD, CONFIG_THEME_BACKGROUND_FIELD_NAME } from "#client/features/config/lib/config-control-names.ts";
import type { ConfigListStory, ConfigPanesStory } from "./_list-stories.tsx";

// What the list's collection groups and the content pane's collection landings count before they show their rows.
const COLLECTION_READS = [
  "persona.list",
  "regex.countScripts",
  "regex.listScripts",
  "worldInfo.countBooks",
  "worldInfo.listBooksWithUsage",
  "rosterPreset.count",
  "rosterPreset.list",
  "plugin.list",
] as const;

test.use({ viewport: { width: 1280, height: 800 } });

test("no row in the Settings list carries the name of a rail section's door", async ({ corpus, corpusViewer, mount, page }) => {
  await using root = await createCorpusHarness();
  const overridesHold = trpcHold<"settings.getAppSettingsWithOverrides">();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await routeTrpc(page, {
    "sessions.me": createCorpusReadResponder("sessions.me", corpusViewer.userId, corpus.reads["sessions.me"]),
    "settings.getUserSettings": createCorpusReadResponder("settings.getUserSettings", corpusViewer.userId, corpus.reads["settings.getUserSettings"]),
    "settings.listThemes": createCorpusReadResponder("settings.listThemes", corpusViewer.userId, corpus.reads["settings.listThemes"]),
    "settings.getAppSettingsWithOverrides": () => overridesHold,
    ...serveCorpusProcedures(await root.internalCallerFor(root.ownerId), COLLECTION_READS),
  });
  await mount<typeof ConfigListStory>("tests/client/features/config/surfaces/_list-stories/ConfigListStory", {});
  const groups = page.locator('[data-slot="config-group"]').filter({ has: page.locator("button[aria-expanded]") });
  await expect(groups.first()).toBeVisible();
  const total = await groups.count();
  expect(total).toBeGreaterThan(1);
  for (let index = 0; index < total; index += 1) {
    const band = groups.nth(index).locator("button[aria-expanded]");
    if ((await band.getAttribute("aria-expanded")) !== "true") {
      await band.click();
    }
    await expect(band).toHaveAttribute("aria-expanded", "true");
    // Positive control: the opened group lists at least one section row, so a name match below has rows to find.
    await expect(groups.nth(index).getByRole("group").first().getByRole("button").first()).toBeVisible();
  }
  // The rail prints each of these names (`SECTION_LABELS` reads the modules the rail entries render from).
  for (const [section, label] of Object.entries(SECTION_LABELS)) {
    await expect(page.getByRole("button", { name: label, exact: true }), `a Settings row is named ${label}, like the ${section} door`).toHaveCount(0);
  }
});

test("the theme builder's Background colour field shares no name with a row of the Appearance list", async ({ mount, page }) => {
  await using root = await createFirstBootHarness();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await routeTrpc(
    page,
    serveCorpusProcedures(await root.internalCallerFor(root.ownerId), [
      "sessions.me",
      "settings.getUserSettings",
      "settings.listThemes",
      "settings.getAppSettingsWithOverrides",
      "settings.duplicateTheme",
      "settings.updateTheme",
      ...COLLECTION_READS,
    ]),
  );
  await mount<typeof ConfigPanesStory>("tests/client/features/config/surfaces/_list-stories/ConfigPanesStory", { showList: true, initialGroup: "appearance" });
  await page.getByRole("button", { name: new RegExp(`^${RegExp.escape(CONFIG_NEW_THEME_LEAD)}`, "u") }).click();
  // The editor's field is on the page; a list row of the same name would make this two controls.
  await expect(page.getByRole("button", { name: CONFIG_THEME_BACKGROUND_FIELD_NAME, exact: true })).toHaveCount(1);
});
