// @subject packages/client/src/features/stats/surfaces/analytics-list-surface.tsx
// The Insights leaderboard at the browser's enlarged text on a phone: the pane's chrome (sort strip, search, skip link) grows and the
// rows' scroller keeps a window a touch can reach, instead of collapsing to no height under it.

import { CORPUS_MODE_LABELS, testId } from "@orb/client/lib";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { PLATFORM_TEXT_SCALES, resolvedLength, seedShellState, setPlatformTextSize } from "@orb/testkit/browser/spec";
import { routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/test";
import { CORPUS_INSIGHTS_LIST_DOOR_NAME, CORPUS_MODE_NAME } from "#client/features/discovery/lib/corpus-control-names.ts";
import { ANALYTICS_LEADERBOARD_NAME } from "#client/features/stats/lib/analytics-names.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const PHONE = { width: 390, height: 844 } as const;
const FINDER_PROCEDURES = ["search.suggest", "search.spaceStatus", "connection.list", "connection.listBindings", "workloads.list"] as const;

test.use({ hasTouch: true, isMobile: true, viewport: PHONE });

for (const scale of PLATFORM_TEXT_SCALES) {
  test(`the leaderboard's rows keep a window and a row in reach at ${String(scale * 100)}% text on a phone`, async ({ mount, page }) => {
    await using _textSize = await setPlatformTextSize(page, scale);
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    await routeTrpc(page, serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES, ...FINDER_PROCEDURES]));
    // The phone lands Corpus on its Explore finder; the list panel docked puts the finder on screen.
    await seedShellState(page, { activeSection: "corpus", panelOverrides: { corpus: { list: "docked", context: "collapsed" } } });
    await mount<typeof ShellAmbientStory>(STORY, {});
    await page.getByRole("radiogroup", { name: CORPUS_MODE_NAME, exact: true }).getByRole("radio", { name: CORPUS_MODE_LABELS.insights, exact: true }).click();
    // The phone lands Insights on its dashboard, so the finder sits behind the topbar's list door.
    await page.getByRole("button", { name: CORPUS_INSIGHTS_LIST_DOOR_NAME, exact: true }).click();
    const surface = page.getByTestId(testId("analyticsListSurface"));
    const list = surface.getByRole("list", { name: ANALYTICS_LEADERBOARD_NAME });
    await expect(list).toBeVisible();
    await expect(list.getByRole("listitem").first()).toBeVisible();
    const floor = await resolvedLength(page, `var(${TOKENS["height.scroll-short"].cssVar})`, surface);
    expect((await list.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(floor);
  });
}
