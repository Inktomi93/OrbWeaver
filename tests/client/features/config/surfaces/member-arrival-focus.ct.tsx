// A drilled member of a settings collection takes focus when it opens from its row by keyboard: the landing's row is replaced by the
// member's editor in the same pane, so without a hand-off focus falls to the page body. Each member is opened through the production
// settings content over a corpus root, and focus is asserted on the editor the production surface stamps.
// @subject packages/client/src/features/regex/surfaces/regex-member-surface.tsx
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { CollectionCompositionStory } from "./_collection-composition-stories.tsx";

const STORY = "tests/client/features/config/surfaces/_collection-composition-stories/CollectionCompositionStory";
const SERVED = [
  ...SECTION_PROCEDURES,
  "worldInfo.listBooksWithUsage",
  "worldInfo.getBook",
  "worldInfo.listEntries",
  "rosterPreset.count",
  "rosterPreset.get",
  "automation.listRulePresets",
  "regex.listGlobal",
] as const;
const MEMBERS = [
  { group: "regex", editor: '[data-slot="regex-member-editor"]' },
  { group: "rosterPreset", editor: '[data-slot="roster-member-editor"]' },
] as const;

test.use({ viewport: { width: 1440, height: 900 } });

for (const { group, editor } of MEMBERS) {
  test(`opening a ${group} member from its row by keyboard lands focus on its editor`, async ({ mount, page }) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    await routeTrpc(page, serveCorpusProcedures(caller, SERVED));
    await mount<typeof CollectionCompositionStory>(STORY, { group, width: 960, height: 900, appearance: appearanceSettingsSchema.parse({}) });

    const row = page.locator('[data-slot="config-content"] [data-slot="list-row-body"]').first();
    await expect(row).toBeVisible();
    await row.focus();
    await page.keyboard.press("Enter");

    await expect(page.locator(editor)).toBeFocused();
  });
}
