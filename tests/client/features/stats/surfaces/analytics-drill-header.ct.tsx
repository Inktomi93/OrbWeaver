// An Insights character drill heads itself the way a Labels drill does: Back and the name on one row, the name after the Back.
import { CORPUS_MODE_LABELS, sectionBackName, testId } from "@orb/client/lib";
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { CORPUS_MODE_NAME } from "#client/features/discovery/lib/corpus-control-names.ts";
import { LEADERBOARD_ROW_ATTR } from "#client/features/stats/lib/leaderboard-row-attr.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";

test.use({ viewport: { width: 1280, height: 900 } });

test("the Insights character drill puts Back and the name on one row", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [
      ...SECTION_PROCEDURES,
      ...SHELL_MOUNT_PROCEDURES,
      "stats.leaderboard",
      "stats.character",
      "stats.latency",
      "character.get",
    ]),
  });
  await seedShellState(page, { activeSection: "corpus" });
  await mount<typeof ShellAmbientStory>(STORY, {});
  await page.getByRole("radiogroup", { name: CORPUS_MODE_NAME, exact: true }).getByRole("radio", { name: CORPUS_MODE_LABELS.insights, exact: true }).click();
  await page.locator(`[${LEADERBOARD_ROW_ATTR}]`).first().getByRole("button").click();
  const content = page.getByTestId(testId("analyticsCharacterSurface"));
  const back = content.getByRole("button", { name: sectionBackName(CORPUS_MODE_LABELS.insights), exact: true });
  const heading = content.getByRole("heading", { level: 2 });
  await expect(heading).toHaveCount(1);
  // The h2 names the drill for the outline; the line a reader sees is its visible twin, hidden from the outline.
  const name = content.locator('[aria-hidden="true"][data-shell-identity]').filter({ hasText: (await heading.textContent()) ?? "" });
  await expect(name).toBeVisible();
  const backBox = await back.boundingBox();
  const nameBox = await name.boundingBox();
  if (backBox === null || nameBox === null) {
    throw new Error("The drill's Back and name must both be laid out");
  }
  expect(nameBox.x).toBeGreaterThanOrEqual(backBox.x + backBox.width);
  expect(Math.abs(nameBox.y + nameBox.height / 2 - (backBox.y + backBox.height / 2))).toBeLessThanOrEqual(backBox.height / 2);
});
