// The Connections list in the production settings pane holds at 200% and 300% text on a phone: its rows never push the pane sideways
// and keep every control reachable.

import { ALLOW_BACKGROUND_SETTING } from "@orb/client/lib";
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { enlargedTextFindings as findings, seedShellState, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { ConfigHeadingShellStory } from "./_config-heading-stories.tsx";

const STORY = "tests/client/features/app-shell/surfaces/_config-heading-stories/ConfigHeadingShellStory";
const ENLARGED_TEXT = [
  { name: "200% text", factor: 2 },
  { name: "300% text", factor: 3 },
] as const;
const ROW_ACTIONS = '[data-slot="list-row-actions"]';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

for (const scale of ENLARGED_TEXT) {
  test(`the Connections rows stay inside the settings pane at ${scale.name}`, async ({ corpus, mount, page }) => {
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
    await setRootFontScale(page, channelName("fontScale"), scale.factor);
    await expect.poll(() => findings(content)).toEqual([]);
    // The switch's label is whole: it wraps onto a line of its own and never leaves the pane or reads cut.
    const reach = await content.evaluate((pane, label) => {
      const right = pane.getBoundingClientRect().right;
      return [...pane.querySelectorAll('[data-slot="list-row-actions"] [data-slot="text"]')]
        .filter((node) => node.textContent === label)
        .map((node) => node.getBoundingClientRect().right - right);
    }, ALLOW_BACKGROUND_SETTING);
    expect(reach.length).toBeGreaterThan(0);
    expect(Math.max(...reach)).toBeLessThanOrEqual(0);
  });
}
