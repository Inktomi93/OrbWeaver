import { testId } from "@orb/client/lib";
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { resolvedLength, seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import { ACCOUNTING_COVERAGE_NAME, ANALYTICS_CHARACTER_IDENTITY_TEXT } from "#client/features/stats/lib/analytics-copy.ts";
import { ANALYTICS_ACTIVITY_HEADING } from "#client/features/stats/lib/analytics-names.ts";
import type { InsightsIdentityShellStory } from "./_insights-identity-stories.tsx";

const STORY = "tests/client/features/app-shell/surfaces/_insights-identity-stories/InsightsIdentityShellStory";
const REGIMES = [
  { name: "desktop", viewport: { width: 1440, height: 900 }, coarse: false, appearance: DEFAULT_APPEARANCE_SETTINGS },
  { name: "coarse portrait enlarged", viewport: { width: 390, height: 844 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
] as const;

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, isMobile: regime.coarse, hasTouch: regime.coarse });
    test("the actual Insights character keeps one painted identity without losing scope or accounting", async ({ page, mount, corpus }) => {
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: regime.appearance });
      await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
      const ranked = (await caller.stats.leaderboard({})).rows[0];
      if (ranked === undefined) {
        throw new Error("The corpus has no Insights character");
      }
      const stats = await caller.stats.character({ characterId: ranked.characterId });
      if (stats === null) {
        throw new Error("The selected corpus character has no rolled-up activity");
      }
      await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, SECTION_PROCEDURES) });
      await seedShellState(page, { activeSection: "corpus", panelOverrides: { corpus: { list: "collapsed", context: "collapsed" } } });
      await mount<typeof InsightsIdentityShellStory>(STORY, { characterId: ranked.characterId });
      const pane = page.getByTestId(testId("analyticsCharacterSurface"));
      await expect(pane.getByRole("heading", { name: ANALYTICS_ACTIVITY_HEADING, exact: true })).toBeVisible();
      await expect(pane.getByText(ANALYTICS_CHARACTER_IDENTITY_TEXT, { exact: true })).toBeVisible();
      await expect(pane.getByRole("button", { name: ACCOUNTING_COVERAGE_NAME, exact: true })).toBeVisible();
      // The heading is the one name in the outline; the pane paints the name as its hidden-from-assistive-technology twin, which
      // stands down where the phone's topbar paints it.
      const heading = pane.getByRole("heading", { level: 2, name: stats.name, exact: true });
      await expect(heading).toHaveCount(1);
      const twin = pane.locator('[aria-hidden="true"][data-shell-identity]').filter({ hasText: stats.name });
      await expect(twin).toHaveCount(1);
      const painted = await twin.evaluate((node) => node.getBoundingClientRect().width > 1);
      expect(painted).toBe(!regime.coarse);
      const topbar = page.locator('.shell-topbar-identity[data-identity="narrow"] .shell-topbar-title');
      await expect(topbar).toHaveText(stats.name);
      // The pane's notes are prose: each reads at the prose measure, however wide the pane is.
      const notes = pane.locator('[role="note"]:not(:has(*))');
      await expect(notes.first()).toBeVisible();
      for (const note of await notes.all()) {
        // The measure is in `ch`, so it resolves in each note's own font.
        const measure = await resolvedLength(page, `var(${TOKENS["reading.measure-prose"].cssVar})`, note);
        // The painted line, not the box: a block note's box spans the pane whatever its text does.
        const widest = await note.evaluate((node) => {
          const range = document.createRange();
          range.selectNodeContents(node);
          return Math.max(0, ...[...range.getClientRects()].map((rect) => rect.width));
        });
        expect(widest).toBeLessThanOrEqual(measure + 1);
      }
      await page.screenshot({ path: test.info().outputPath("insights-character-identity.png") });
    });
  });
}
