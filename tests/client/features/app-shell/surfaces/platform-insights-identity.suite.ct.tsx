import { testId } from "@orb/client/lib";
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
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
      await expect(pane.getByRole("heading", { name: "Activity", exact: true })).toBeVisible();
      await expect(pane.getByText("This character · Aggregate only", { exact: true })).toBeVisible();
      await expect(pane.getByRole("button", { name: "Accounting coverage", exact: true })).toBeVisible();
      const bodyName = pane.getByText(stats.name, { exact: true });
      await expect(bodyName).toHaveCount(1);
      const painted = await bodyName.evaluate((node) => node.getBoundingClientRect().width > 1);
      expect(painted).toBe(!regime.coarse);
      const topbar = page.locator('.shell-topbar-identity[data-identity="narrow"] .shell-topbar-title');
      await expect(topbar).toHaveText(stats.name);
      await page.screenshot({ path: test.info().outputPath("insights-character-identity.png") });
    });
  });
}
