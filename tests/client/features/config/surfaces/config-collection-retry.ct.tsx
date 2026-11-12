// A library's Retry in the settings panes: one press recovers a failed read, and when the count and the rows both failed it recovers both.
// A settings visit asks only the census of each library, never its rows.
import { setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, routeTrpc, serveCorpusProcedures, trpcError, trpcHold } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusReadResponder } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { collectionFilterName } from "#client/features/config/lib/config-control-names.ts";
import { REGEX_GROUP_LABEL } from "#client/features/regex/lib/regex-names.ts";
import { ROSTER_GROUP_LABEL } from "#client/features/roster-preset/lib/roster-names.ts";
import { WORLD_INFO_GROUP_LABEL } from "#client/features/world-info/lib/world-info-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { ConfigPanesStory } from "./_list-stories.tsx";

const STORY = "tests/client/features/config/surfaces/_list-stories/ConfigPanesStory";
const FONT_SCALE_PROPERTY = channelName("fontScale");
const SCALES = [2, 3] as const;

/** Each library's census read and its rows read: the two reads one Retry must recover. */
const LIBRARIES = [
  { group: "worldInfo", label: WORLD_INFO_GROUP_LABEL, census: "worldInfo.countBooks", rows: "worldInfo.listBooksWithUsage" },
  { group: "regex", label: REGEX_GROUP_LABEL, census: "regex.countScripts", rows: "regex.listScripts" },
  { group: "rosterPreset", label: ROSTER_GROUP_LABEL, census: "rosterPreset.count", rows: "rosterPreset.list" },
] as const;

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

for (const factor of SCALES) {
  test(`one Retry recovers the World Info read and leaves no query error at ${String(factor * 100)}% text`, async ({ corpus, corpusViewer, mount, page }) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    let failing = true;
    await routeTrpc(page, {
      "sessions.me": createCorpusReadResponder("sessions.me", corpusViewer.userId, corpus.reads["sessions.me"]),
      "settings.getUserSettings": createCorpusReadResponder("settings.getUserSettings", corpusViewer.userId, corpus.reads["settings.getUserSettings"]),
      "settings.listThemes": createCorpusReadResponder("settings.listThemes", corpusViewer.userId, corpus.reads["settings.listThemes"]),
      "settings.getAppSettingsWithOverrides": () => trpcHold<"settings.getAppSettingsWithOverrides">(),
      ...serveCorpusProcedures(caller, ["worldInfo.listBooksWithUsage"]),
      ...serveCorpusProcedures(caller, ["worldInfo.countBooks"], () => (failing ? trpcError({ code: "INTERNAL_SERVER_ERROR" }) : undefined)),
    });
    await mount<typeof ConfigPanesStory>(STORY, { showList: false, initialGroup: "worldInfo" });
    await setRootFontScale(page, FONT_SCALE_PROPERTY, factor);
    const content = page.locator('[data-slot="config-content"]');
    const error = content.locator('[data-slot="query-error"]:visible');
    await expect(error).toHaveCount(1);
    failing = false;
    // The panes story is a desktop-wide row, so Retry is pressed by key, as the walk does.
    const retry = error.getByRole("button", { name: DIALOG_VERBS.retry, exact: true });
    await retry.focus();
    await retry.press("Enter");
    await expect(content.getByRole("textbox", { name: collectionFilterName(WORLD_INFO_GROUP_LABEL), exact: true })).toBeVisible();
    await expect(content.locator('[data-slot="query-error"]:visible')).toHaveCount(0);
  });
}

for (const library of LIBRARIES) {
  test(`one Retry recovers the ${library.label} count and rows when both reads failed`, async ({ corpus, corpusViewer, mount, page }) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    let failing = true;
    const failWhileDown = (): ReturnType<typeof trpcError> | undefined => (failing ? trpcError({ code: "INTERNAL_SERVER_ERROR" }) : undefined);
    await routeTrpc(page, {
      "sessions.me": createCorpusReadResponder("sessions.me", corpusViewer.userId, corpus.reads["sessions.me"]),
      "settings.getUserSettings": createCorpusReadResponder("settings.getUserSettings", corpusViewer.userId, corpus.reads["settings.getUserSettings"]),
      "settings.listThemes": createCorpusReadResponder("settings.listThemes", corpusViewer.userId, corpus.reads["settings.listThemes"]),
      "settings.getAppSettingsWithOverrides": () => trpcHold<"settings.getAppSettingsWithOverrides">(),
      ...serveCorpusProcedures(caller, [library.rows], failWhileDown),
      ...serveCorpusProcedures(caller, [library.census], failWhileDown),
    });
    await mount<typeof ConfigPanesStory>(STORY, { showList: false, initialGroup: library.group });
    const content = page.locator('[data-slot="config-content"]');
    const error = content.locator('[data-slot="query-error"]:visible');
    await expect(error).toHaveCount(1);
    failing = false;
    const retry = error.getByRole("button", { name: DIALOG_VERBS.retry, exact: true });
    await retry.focus();
    await retry.press("Enter");
    await expect(content.getByRole("textbox", { name: collectionFilterName(library.label), exact: true })).toBeVisible();
    await expect(error).toHaveCount(0);
  });
}

test("a settings visit asks each library's census and never its rows", async ({ corpus, corpusViewer, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const asked = { census: 0, rows: 0 };
  await routeTrpc(page, {
    "sessions.me": createCorpusReadResponder("sessions.me", corpusViewer.userId, corpus.reads["sessions.me"]),
    "settings.getUserSettings": createCorpusReadResponder("settings.getUserSettings", corpusViewer.userId, corpus.reads["settings.getUserSettings"]),
    "settings.listThemes": createCorpusReadResponder("settings.listThemes", corpusViewer.userId, corpus.reads["settings.listThemes"]),
    "settings.getAppSettingsWithOverrides": () => trpcHold<"settings.getAppSettingsWithOverrides">(),
    ...serveCorpusProcedures(caller, ["persona.list", "plugin.list", "settings.getVersion"]),
    ...serveCorpusProcedures(
      caller,
      LIBRARIES.map((library) => library.census),
      (): undefined => {
        asked.census += 1;
      },
    ),
    ...serveCorpusProcedures(
      caller,
      LIBRARIES.map((library) => library.rows),
      (): undefined => {
        asked.rows += 1;
      },
    ),
  });
  await mount<typeof ConfigPanesStory>(STORY, { showList: true, initialGroup: "about" });
  await expect(page.locator('[data-slot="config-group"]').first()).toBeVisible();
  // The positive control: every library's census was asked, so the zero below is a read the band never made.
  await expect.poll(() => asked.census).toBe(LIBRARIES.length);
  expect(asked.rows).toBe(0);
});
