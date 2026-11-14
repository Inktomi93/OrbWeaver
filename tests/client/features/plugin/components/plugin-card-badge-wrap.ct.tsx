// An installed plugin's status badge and its permission badges wrap inside the Settings pane on a phone at enlarged text,
// so the pane never scrolls sideways. Production entry: the Plugins group of the Settings section, a plugin card whose
// update asked for more than the owner allowed.
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { actionGroupGeometry, LAYOUT_SUBPIXEL_PX, setRootFontScale, sidewaysReach } from "@orb/testkit/browser/spec";
import { channelName, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, makePluginBundle } from "@orb/testkit/node/composed";
import { pluginCardLabel, statusCopy } from "#client/features/plugin/lib/plugin-copy.ts";
import type { PluginConsentLayoutStory } from "./_consent-layout-stories.tsx";

const STORY = "tests/client/features/plugin/components/_consent-layout-stories/PluginConsentLayoutStory";
const PANE_WIDTH = 390;
const PANE = '[data-slot="config-content"]';
const BADGE = '[data-slot="badge"]';
const ENLARGED_TEXT = [
  { name: "200% text", factor: 2 },
  { name: "300% text", factor: 3 },
] as const;

const manifest = pluginManifestSchema.parse({
  id: "badge-wrap-witness",
  name: "Badge wrap witness",
  description: "A synthetic plugin whose update asks for more than the owner allowed.",
  version: "1.0.0",
  hostVersion: PLUGIN_HOST_VERSIONS[0],
  entry: PLUGIN_MAIN_ENTRY,
  capabilities: ["chat.read"],
});
// The update adds a permission that can spend and one that reaches further, so the card's grant list wears every badge it has.
const widened = pluginManifestSchema.parse({ ...manifest, version: "2.0.0", capabilities: ["chat.read", "chat.variables.write", "search.query"] });

test.use({ viewport: { width: PANE_WIDTH, height: 844 }, isMobile: true, hasTouch: true });

for (const scale of ENLARGED_TEXT) {
  test(`a plugin card's status and permission badges stay inside the settings pane at ${scale.name}`, async ({ mount, page }) => {
    await using root = await createCorpusHarness(undefined, { startJobs: false });
    const caller = await root.internalCallerFor(root.ownerId);
    const installed = await caller.plugin.install({
      bundleBase64: Buffer.from(makePluginBundle(manifest, "orb.host(1);", root.clock.now())).toString("base64"),
      grant: manifest.capabilities,
    });
    const upgraded = await caller.plugin.upgrade({
      pluginId: installed.id,
      bundleBase64: Buffer.from(makePluginBundle(widened, "orb.host(1);", root.clock.now())).toString("base64"),
    });
    await routeTrpc(
      page,
      serveCorpusProcedures(caller, [
        "sessions.me",
        "settings.getUserSettings",
        "plugin.list",
        "plugin.listSurfaces",
        "plugin.listDistributed",
        "connection.listBindings",
      ]),
    );
    await mount<typeof PluginConsentLayoutStory>(STORY, { width: PANE_WIDTH });
    const card = page.getByRole("group", { name: pluginCardLabel(upgraded.name), exact: true });
    await card.scrollIntoViewIfNeeded();
    const status = card.locator(BADGE).filter({ hasText: statusCopy(upgraded).label });
    await expect(status).toBeVisible();
    await setRootFontScale(page, channelName("fontScale"), scale.factor);

    const badges = await card.locator(BADGE).all();
    // The status badge and the grant list's badges are all on the card.
    expect(badges.length).toBeGreaterThan(1);
    const pane = page.locator(PANE);
    await expect.poll(async () => (await actionGroupGeometry(pane, badges)).inlineOverflow).toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);
    expect((await card.evaluate(sidewaysReach)).wideners).toEqual([]);
    expect((await pane.evaluate(sidewaysReach)).scrolls).toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);
  });
}
