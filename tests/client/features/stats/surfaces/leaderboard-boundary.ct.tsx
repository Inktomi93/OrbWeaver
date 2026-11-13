// @subject packages/client/src/features/stats/surfaces/analytics-list-surface.tsx
// The Insights leaderboard reads through the shared boundary: a held read shows the loading skeleton, a failed one the
// shared error block, and Retry shows the rows. A search keystroke keeps the prior rows on screen while the next page loads.

import { testId } from "@orb/client/lib";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { holdServed, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { expect, test } from "@playwright/test";
import { CHARACTER_SEARCH_NAME } from "#client/components/shared-control-names.ts";
import { ANALYTICS_LEADERBOARD_NAME } from "#client/features/stats/lib/analytics-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const SERVED = [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES].filter((path) => path !== "stats.leaderboard");

test.use({ hasTouch: false, isMobile: false, viewport: { width: 1440, height: 900 } });

test("a held leaderboard read shows the loading skeleton, a failed one the shared error block, and Retry shows the rows", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const hold = holdServed();
  let held = false;
  let failing = true;
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, SERVED),
    ...serveCorpusProcedures(caller, ["stats.leaderboard"], () => {
      if (!held) {
        held = true;
        return hold;
      }
      return failing ? trpcError() : undefined;
    }),
  });
  await seedShellState(page, { activeSection: "analytics" });
  await mount<typeof ShellAmbientStory>(STORY, {});
  await hold.requested;
  await expect(page.getByTestId(testId("analyticsListSurface")).locator('[aria-busy="true"]')).toBeVisible();
  hold.fail();
  await expect(page.getByText("Couldn't load the leaderboard.", { exact: true })).toBeVisible();
  failing = false;
  await page.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
  await expect(page.getByText("Couldn't load the leaderboard.", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("list", { name: ANALYTICS_LEADERBOARD_NAME })).toBeVisible();
});

test("a search typed after a failed read shows its rows instead of the standing error", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, SERVED),
    ...serveCorpusProcedures(caller, ["stats.leaderboard"], (input) => (input?.search === undefined ? trpcError({ code: "BAD_REQUEST" }) : undefined)),
  });
  await seedShellState(page, { activeSection: "analytics" });
  await mount<typeof ShellAmbientStory>(STORY, {});
  await expect(page.getByText("Couldn't load the leaderboard.", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: CHARACTER_SEARCH_NAME, exact: true }).fill("a");
  await expect(page.getByText("Couldn't load the leaderboard.", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("list", { name: ANALYTICS_LEADERBOARD_NAME })).toBeVisible();
});

test("a search keystroke keeps the prior rows on screen while the next page is held", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const hold = holdServed();
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, SERVED),
    ...serveCorpusProcedures(caller, ["stats.leaderboard"], (input) => (input?.search === undefined ? undefined : hold)),
  });
  await seedShellState(page, { activeSection: "analytics" });
  await mount<typeof ShellAmbientStory>(STORY, {});
  const list = page.getByRole("list", { name: ANALYTICS_LEADERBOARD_NAME });
  const firstRow = list.getByRole("listitem").first();
  await expect(firstRow).toBeVisible();
  const name = (await firstRow.textContent()) ?? "";
  await page.getByRole("textbox", { name: CHARACTER_SEARCH_NAME, exact: true }).fill("zz");
  await hold.requested;
  await expect(firstRow).toBeVisible();
  await expect(firstRow).toHaveText(name);
  await expect(page.getByTestId(testId("analyticsListSurface")).locator('[aria-busy="true"]')).toHaveCount(0);
});
