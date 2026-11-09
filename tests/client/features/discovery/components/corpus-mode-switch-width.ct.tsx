// On a phone the Corpus mode switch that heads Content (the Insights landing, where the list is off screen) starts and ends on the
// Content pane's own inline edges, the ones the dashboard under it keeps; it takes no inset of its own.
import { CORPUS_MODE_LABELS, testId } from "@orb/client/lib";
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { CORPUS_MODE_NAME } from "#client/features/discovery/lib/corpus-control-names.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test("the mode switch heading the Insights landing spans the same inline edges as the dashboard under it", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES]),
  });
  await seedShellState(page, { activeSection: "corpus" });
  await mount<typeof ShellAmbientStory>(STORY, {});
  await page.getByRole("radiogroup", { name: CORPUS_MODE_NAME, exact: true }).getByRole("radio", { name: CORPUS_MODE_LABELS.insights, exact: true }).click();
  const content = page.locator('[data-slot="corpus-workspace-content"]');
  const modes = content.getByRole("radiogroup", { name: CORPUS_MODE_NAME, exact: true });
  await expect(modes).toBeVisible();
  const dashboard = page.getByTestId(testId("analyticsOverviewSurface"));
  await expect(dashboard).toBeVisible();
  const switchBox = await modes.boundingBox();
  const dashboardBox = await dashboard.boundingBox();
  if (switchBox === null || dashboardBox === null) {
    throw new Error("The mode switch and the dashboard must both be laid out");
  }
  expect(switchBox.x).toBeCloseTo(dashboardBox.x, 0);
  expect(switchBox.width).toBeCloseTo(dashboardBox.width, 0);
});
