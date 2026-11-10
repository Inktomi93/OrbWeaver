// The Connections list in the production settings pane holds at 200% text on a phone: its rows never push the pane sideways
// and keep every control reachable.

import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { enlargedTextFindings as findings, seedShellState, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { ConfigHeadingShellStory } from "./_config-heading-stories.tsx";

const STORY = "tests/client/features/app-shell/surfaces/_config-heading-stories/ConfigHeadingShellStory";
const TEXT_200 = 2;
const ROW_ACTIONS = '[data-slot="list-row-actions"]';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("the Connections rows stay inside the settings pane at 200% text", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [
      ...SECTION_PROCEDURES,
      "search.spaceStatus",
      "connection.list",
      "connection.listBindings",
      "connection.providersAvailable",
      "credentials.list",
    ]),
  });
  await seedShellState(page, { activeSection: "config" });
  await mount<typeof ConfigHeadingShellStory>(STORY, { group: "connections" });
  const content = page.locator('[data-slot="config-content"]');
  await expect(content.locator(ROW_ACTIONS).first()).toBeVisible();
  await setRootFontScale(page, channelName("fontScale"), TEXT_200);
  await expect.poll(() => findings(content)).toEqual([]);
});
