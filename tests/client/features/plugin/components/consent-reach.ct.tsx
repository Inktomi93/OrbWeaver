// An update that adds a model provider and turns on the automation opt-in is named on the plugin's consent card: the
// re-consent sentence says both, each provider is listed with the added one alone marked new, and the automation line
// carries the same mark. The unmarked first provider is the control for the mark.
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { makePluginProviderRow, pluginProviderId } from "@orb/testkit/iso";
import { createServerHarness, makePluginBundle } from "@orb/testkit/node/composed";
import { PLUGIN_ADDED_MARK, PLUGIN_AUTOMATION_EVENTS_LINE, reConsentLine } from "#client/features/plugin/lib/plugin-copy.ts";
import type { PluginConsentLayoutStory } from "./_consent-layout-stories.tsx";

const PLUGIN = "reach-plugin";
const FIRST_LABEL = "Acme Relay";
const ADDED_LABEL = "Beta Relay";
const firstProvider = makePluginProviderRow(PLUGIN, "acme", { label: FIRST_LABEL });
const addedProvider = makePluginProviderRow(PLUGIN, "beta", { label: ADDED_LABEL });
const NARROWEST_WIDTH = 390;

const manifestOf = (version: string, over: object): ReturnType<typeof pluginManifestSchema.parse> =>
  pluginManifestSchema.parse({
    id: PLUGIN,
    name: "Reach plugin",
    version,
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    description: "Adds providers.",
    capabilities: [],
    providers: [firstProvider],
    ...over,
  });

test("an update's added provider and automation opt-in are named and marked on the consent card", async ({ page, mount }) => {
  await page.setViewportSize({ width: NARROWEST_WIDTH, height: 844 });
  await using root = await createServerHarness({ startJobs: false });
  const owner = await root.principalFor(root.ownerId);
  const installed = await root.services.plugin.install({ caller: owner, bundle: makePluginBundle(manifestOf("1.0.0", {}), "", root.clock.now()), grant: [] });
  await root.services.plugin.upgrade({
    caller: owner,
    pluginId: installed.id,
    bundle: makePluginBundle(manifestOf("1.1.0", { providers: [firstProvider, addedProvider], matchAutomationEvents: true }), "", root.clock.now()),
  });
  const caller = await root.internalCallerFor(root.ownerId);
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
  await mount<typeof PluginConsentLayoutStory>("tests/client/features/plugin/components/_consent-layout-stories/PluginConsentLayoutStory", {
    width: NARROWEST_WIDTH,
  });

  const sentence = reConsentLine([], { netHosts: [], providerIds: [pluginProviderId(PLUGIN, "beta")], matchAutomationEvents: true });
  await expect(page.getByText(sentence, { exact: true })).toBeVisible();

  const added = page.getByRole("listitem").filter({ hasText: ADDED_LABEL });
  const first = page.getByRole("listitem").filter({ hasText: FIRST_LABEL });
  await expect(added.getByText(PLUGIN_ADDED_MARK, { exact: true })).toBeVisible();
  await expect(first).toBeVisible();
  await expect(first.getByText(PLUGIN_ADDED_MARK, { exact: true })).toHaveCount(0);

  const automation = page.getByText(PLUGIN_AUTOMATION_EVENTS_LINE, { exact: true });
  await expect(automation).toBeVisible();
  await expect(automation.locator("..").getByText(PLUGIN_ADDED_MARK, { exact: true })).toBeVisible();
});
