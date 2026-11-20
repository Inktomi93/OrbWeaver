// @subject packages/client/src/features/stats/surfaces/analytics-list-surface.tsx
// The Insights LIST on a library with no rolled-up activity draws its designed empty state, and a search that matches no
// character draws the no-match state with its way back (client-architecture-state-and-gates.md §11, the three states).
import { CLEAR_SEARCH_NAME, CORPUS_MODE_LABELS, NO_MATCHES_TITLE } from "@orb/client/lib";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { createFirstBootHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { CHARACTER_SEARCH_NAME } from "#client/components/shared-control-names.ts";
import { ANALYTICS_NO_ACTIVITY_TEXT } from "#client/features/stats/lib/analytics-copy.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const LIST = '.shell-panel[data-panel-side="list"]';
const EMPTY_STATE = '[data-slot="empty-state-root"]';

test.use({ viewport: { width: 1280, height: 900 } });

/** A first-boot root, whose owner has no rolled-up activity, served to the production shell open on Corpus Insights. */
async function openEmptyInsights(page: Page, root: Awaited<ReturnType<typeof createFirstBootHarness>>): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  // The subject's own claim, read through the production verb: no character has activity to rank.
  expect((await caller.stats.leaderboard({})).rows).toEqual([]);
  await routeTrpc(page, serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES]));
  await seedShellState(page, { activeSection: "corpus" });
}

test("an Insights LIST with no activity draws the empty state, and a search with no match draws the no-match state that clears it", async ({ mount, page }) => {
  await using root = await createFirstBootHarness();
  await openEmptyInsights(page, root);
  await mount<typeof ShellAmbientStory>(STORY, {});
  await page.getByRole("radio", { name: CORPUS_MODE_LABELS.insights, exact: true }).click();
  const list = page.locator(LIST);
  const search = list.getByLabel(CHARACTER_SEARCH_NAME, { exact: true });
  await expect(search).toBeVisible();

  await expect(list.locator(EMPTY_STATE).getByText(ANALYTICS_NO_ACTIVITY_TEXT, { exact: true })).toBeVisible();

  await search.fill("zz-no-such-character");
  const noMatch = list.locator(EMPTY_STATE);
  await expect(noMatch.getByText(NO_MATCHES_TITLE, { exact: true })).toBeVisible();
  await noMatch.getByRole("button", { name: CLEAR_SEARCH_NAME, exact: true }).click();
  await expect(search).toHaveValue("");
  await expect(list.locator(EMPTY_STATE).getByText(ANALYTICS_NO_ACTIVITY_TEXT, { exact: true })).toBeVisible();
});
