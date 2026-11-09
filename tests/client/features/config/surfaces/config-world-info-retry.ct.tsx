// The World Info library's Retry on a phone at enlarged text: one press recovers the read and leaves no second failure behind.
import { setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, routeTrpc, serveCorpusProcedures, trpcError, trpcHold } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusReadResponder } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { collectionFilterName } from "#client/features/config/lib/config-control-names.ts";
import { WORLD_INFO_GROUP_LABEL } from "#client/features/world-info/lib/world-info-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { ConfigPanesStory } from "./_list-stories.tsx";

const STORY = "tests/client/features/config/surfaces/_list-stories/ConfigPanesStory";
const FONT_SCALE_PROPERTY = channelName("fontScale");
const SCALES = [2, 3] as const;

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
