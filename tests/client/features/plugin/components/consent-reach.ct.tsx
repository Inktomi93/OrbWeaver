// An update that adds a model provider and turns on the automation opt-in is named on the plugin's consent card: the
// re-consent sentence says both, each provider is listed with the added one alone marked as widened, and the automation
// line carries the added mark. The unmarked first provider is the control for the mark. Approving the card sends the echo the
// server requires, so the plugin comes up enabled with the provider and the opt-in answered.
import { spawn } from "node:child_process";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { makePluginProviderRow } from "@orb/testkit/iso";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makePluginBundle } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import {
  approveLabel,
  PLUGIN_ADDED_MARK,
  PLUGIN_AUTOMATION_EVENTS_LINE,
  PLUGIN_PROVIDER_WIDENED_MARK,
  RE_CONSENT_AUTOMATION_EVENTS,
  RE_CONSENT_ONE_PROVIDER,
} from "#client/features/plugin/lib/plugin-copy.ts";
import type { PluginConsentLayoutStory } from "./_consent-layout-stories.tsx";

const PLUGIN = "reach-plugin";
const MANIFEST_NAME = "Reach plugin";
// A guest that registers nothing, so enabling the plugin runs a real activation.
const GUEST = "// reach guest";
const FIRST_LABEL = "Acme Relay";
const ADDED_LABEL = "Beta Relay";
const firstProvider = makePluginProviderRow(PLUGIN, "acme", { label: FIRST_LABEL });
const addedProvider = makePluginProviderRow(PLUGIN, "beta", { label: ADDED_LABEL });
const NARROWEST_WIDTH = 390;

const manifestOf = (version: string, over: object): ReturnType<typeof pluginManifestSchema.parse> =>
  pluginManifestSchema.parse({
    id: PLUGIN,
    name: MANIFEST_NAME,
    version,
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    description: "Adds providers.",
    capabilities: [],
    providers: [firstProvider],
    ...over,
  });

// An installed plugin whose update added a provider and turned the automation opt-in on, with the settings door's
// reads served from the root.
async function serveWidenedCard(page: Page, root: ServerTestHarness): Promise<Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>> {
  const owner = await root.principalFor(root.ownerId);
  const installed = await root.services.plugin.install({
    caller: owner,
    bundle: makePluginBundle(manifestOf("1.0.0", {}), GUEST, root.clock.now()),
    grant: [],
  });
  await root.services.plugin.upgrade({
    caller: owner,
    pluginId: installed.id,
    bundle: makePluginBundle(manifestOf("1.1.0", { providers: [firstProvider, addedProvider], matchAutomationEvents: true }), GUEST, root.clock.now()),
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
      "plugin.setGrant",
      "connection.listBindings",
    ]),
  );
  return caller;
}

test("an update's added provider and automation opt-in are named and marked on the consent card", async ({ page, mount }) => {
  await page.setViewportSize({ width: NARROWEST_WIDTH, height: 844 });
  await using root = await createServerHarness({ startJobs: false });
  await serveWidenedCard(page, root);
  await mount<typeof PluginConsentLayoutStory>("tests/client/features/plugin/components/_consent-layout-stories/PluginConsentLayoutStory", {
    width: NARROWEST_WIDTH,
  });

  // One sentence names both additions.
  await expect(page.getByText(RE_CONSENT_ONE_PROVIDER).filter({ hasText: RE_CONSENT_AUTOMATION_EVENTS })).toBeVisible();

  const added = page.getByRole("listitem").filter({ hasText: ADDED_LABEL });
  const first = page.getByRole("listitem").filter({ hasText: FIRST_LABEL });
  await expect(added.getByText(PLUGIN_PROVIDER_WIDENED_MARK, { exact: true })).toBeVisible();
  await expect(first).toBeVisible();
  await expect(first.getByText(PLUGIN_PROVIDER_WIDENED_MARK, { exact: true })).toHaveCount(0);

  const automation = page.getByText(PLUGIN_AUTOMATION_EVENTS_LINE, { exact: true });
  await expect(automation).toBeVisible();
  await expect(automation.locator("..").getByText(PLUGIN_ADDED_MARK, { exact: true })).toBeVisible();
});

test("approving the card echoes the provider and the opt-in, and the plugin comes up with the question cleared", async ({ page, mount }) => {
  await page.setViewportSize({ width: NARROWEST_WIDTH, height: 844 });
  await using root = await createServerHarness({ startJobs: false, pluginSpawn: spawn });
  const caller = await serveWidenedCard(page, root);
  await mount<typeof PluginConsentLayoutStory>("tests/client/features/plugin/components/_consent-layout-stories/PluginConsentLayoutStory", {
    width: NARROWEST_WIDTH,
  });
  expect((await caller.plugin.list())[0]).toMatchObject({ reconsentPending: true, widenedProviderIds: [addedProvider.id], widenedMatchAutomationEvents: true });

  const approve = page.getByRole("button", { name: approveLabel(MANIFEST_NAME, 0), exact: true });
  await approve.click();
  await expect(approve).toHaveCount(0);

  expect((await caller.plugin.list())[0]).toMatchObject({
    status: "enabled",
    reconsentPending: false,
    widenedProviderIds: [],
    widenedMatchAutomationEvents: false,
    providers: [{ id: firstProvider.id }, { id: addedProvider.id }],
    matchAutomationEvents: true,
  });
});
