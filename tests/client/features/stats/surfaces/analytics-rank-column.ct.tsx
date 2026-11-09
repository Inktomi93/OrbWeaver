// The Insights leaderboard's rows: the rank sits in a fixed track, so the name column starts at one inline edge at rank 9 and at rank 10,
// and the row's meta line reads at the label step.
import { CORPUS_MODE_LABELS } from "@orb/client/lib";
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { resolvedLength, seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Page } from "@playwright/test";
import { CORPUS_MODE_NAME } from "#client/features/discovery/lib/corpus-control-names.ts";
import { LEADERBOARD_ROW_ATTR } from "#client/features/stats/lib/leaderboard-row-attr.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const LAST_ONE_DIGIT_RANK = 9;
const FIRST_TWO_DIGIT_RANK = 10;

test.use({ viewport: { width: 1280, height: 1100 } });

/** Serves the corpus's Insights reads to the production shell and seeds the Corpus section; the corpus owns at least ten ranked characters. */
async function serveLeaderboard(
  root: Awaited<ReturnType<typeof createCorpusHarness>>,
  page: Page,
  corpus: Parameters<typeof createShellAmbientReads>[0],
): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
  const board = await caller.stats.leaderboard({});
  expect(board.rows.length).toBeGreaterThanOrEqual(FIRST_TWO_DIGIT_RANK);
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES, "stats.leaderboard"]),
  });
  await seedShellState(page, { activeSection: "corpus" });
}

async function openInsights(page: Page): Promise<void> {
  await page.getByRole("radiogroup", { name: CORPUS_MODE_NAME, exact: true }).getByRole("radio", { name: CORPUS_MODE_LABELS.insights, exact: true }).click();
  await expect(page.locator(`[${LEADERBOARD_ROW_ATTR}]`).nth(FIRST_TWO_DIGIT_RANK - 1)).toBeVisible();
}

test("the leaderboard's names start at one inline edge at rank 9 and rank 10", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  await serveLeaderboard(root, page, corpus);
  await mount<typeof ShellAmbientStory>(STORY, {});
  await openInsights(page);
  const rows = page.locator(`[${LEADERBOARD_ROW_ATTR}]`);
  const nameEdge = async (rank: number): Promise<number> => {
    const box = await rows
      .nth(rank - 1)
      .locator('[data-slot="list-row-content"]')
      .boundingBox();
    if (box === null) {
      throw new Error(`The leaderboard row for rank ${String(rank)} has no box`);
    }
    return box.x;
  };
  expect(await nameEdge(FIRST_TWO_DIGIT_RANK)).toBe(await nameEdge(LAST_ONE_DIGIT_RANK));
});

test("a leaderboard row's reply and time line reads at the label step", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  await serveLeaderboard(root, page, corpus);
  await mount<typeof ShellAmbientStory>(STORY, {});
  await openInsights(page);
  const meta = page.locator(`[${LEADERBOARD_ROW_ATTR}]`).first().locator('[data-slot="list-row-subtitle"]');
  const size = await meta.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
  expect(size).toBe(await resolvedLength(page, `var(${TOKENS["text.label"].cssVar})`, meta));
});
