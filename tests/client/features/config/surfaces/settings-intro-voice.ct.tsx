// A settings section's opening gloss reads at the prose step inside the prose measure, the way its sibling sections' intros do.
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import type { SettingsCompositionStory } from "@orb/testkit/browser";
import { expectCacheProse } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";

const STORY = "tests/support/browser/ct-settings-composition-stories/SettingsCompositionStory";
const WIDTH = 960;
const SECTION_IDS = ["connections-keys", "backup-import", "automation-library-rules"] as const;

test.use({ viewport: { width: 1280, height: 900 } });

for (const sectionId of SECTION_IDS) {
  test(`${sectionId} opens with its gloss at the prose step`, async ({ mount, page }) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
    await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
    await routeTrpc(
      page,
      serveCorpusProcedures(caller, [
        "sessions.me",
        "settings.getUserSettings",
        "connection.list",
        "connection.providersAvailable",
        "credentials.list",
        "automation.getOwnerBudgets",
        "automation.listOwnerRules",
      ]),
    );
    await mount<typeof SettingsCompositionStory>(STORY, { sectionId, width: WIDTH });
    const intro = page.locator('p[data-voice="gloss"]').first();
    await expect(intro).toBeVisible();
    await expectCacheProse(intro);
  });
}
