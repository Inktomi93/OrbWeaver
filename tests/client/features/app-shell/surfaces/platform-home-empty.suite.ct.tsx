// Home on an account with no rooms says its room empty state once: the recents tile owns it, and the masthead greets
// without a second line that repeats it.
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createFirstBootHarness } from "@orb/testkit/node/composed";
import type { SectionShellStory } from "../_surface-stories.tsx";

const STORY = "tests/client/features/app-shell/_surface-stories/SectionShellStory";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test("an empty Home shows one empty state and a masthead greeting with no second line", async ({ corpus, corpusViewer, mount, page }) => {
  await using root = await createFirstBootHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, corpusViewer.userId),
    ...serveCorpusProcedures(caller, SECTION_PROCEDURES),
  });
  await seedShellState(page, { activeSection: "home" });
  await mount<typeof SectionShellStory>(STORY, { section: "home" });
  const masthead = page.locator('[data-home-tile="chat.masthead"]');
  await expect(masthead.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.locator('[data-home-tile="chat.recents"] [data-slot="empty-state-root"], [data-home-tile="chat.masthead"] [data-slot="empty-state-root"]'),
  ).toHaveCount(1);
  await expect(masthead.locator('[data-slot="text"]')).toHaveCount(0);
});
