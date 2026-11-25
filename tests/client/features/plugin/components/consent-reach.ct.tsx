// An update that adds a model provider and turns on the automation opt-in is named on the plugin's consent card: the
// re-consent sentence says both, each provider is listed with the added one alone marked new, and the automation line
// carries the same mark. The unmarked first provider is the control for the mark. Approving the card sends the echo the
// server requires, so the plugin comes up enabled with the provider and the opt-in answered.
import { spawn } from "node:child_process";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema, pluginViewSchema } from "@orb/contracts/plugin";
import { ID_PREFIX } from "@orb/kit/ids";
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
  PLUGIN_AUTOMATION_EVENTS_PHRASE,
  PLUGIN_NO_PERMISSIONS_LINE,
  PLUGIN_NO_REACH_LINE,
  pluginCardLabel,
  pluginDetailsLabel,
  pluginPermissionsLabel,
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
  await expect(page.getByText(RE_CONSENT_ONE_PROVIDER).filter({ hasText: PLUGIN_AUTOMATION_EVENTS_PHRASE })).toBeVisible();

  const added = page.getByRole("listitem").filter({ hasText: ADDED_LABEL });
  const first = page.getByRole("listitem").filter({ hasText: FIRST_LABEL });
  await expect(added.getByText(PLUGIN_ADDED_MARK, { exact: true })).toBeVisible();
  await expect(first).toBeVisible();
  await expect(first.getByText(PLUGIN_ADDED_MARK, { exact: true })).toHaveCount(0);

  const automation = page.getByText(PLUGIN_AUTOMATION_EVENTS_LINE, { exact: true });
  await expect(automation).toBeVisible();
  const automationMark = automation.locator("..").getByText(PLUGIN_ADDED_MARK, { exact: true });
  await expect(automationMark).toBeVisible();
  // At the narrowest width the mark stays beside its sentence: its centre is within the sentence's own height, not on a line under it.
  const markBox = await automationMark.boundingBox();
  const sentenceBox = await automation.boundingBox();
  if (markBox === null || sentenceBox === null) {
    throw new Error("the automation line is not laid out");
  }
  expect(markBox.y + markBox.height / 2).toBeLessThan(sentenceBox.y + sentenceBox.height);
  // The card and the sentence over it name the automation events with one phrase.
  await expect(automation).toContainText(PLUGIN_AUTOMATION_EVENTS_PHRASE);
  await expect(page.getByText(RE_CONSENT_ONE_PROVIDER).filter({ hasText: PLUGIN_AUTOMATION_EVENTS_PHRASE })).toBeVisible();
});

test("a plugin that asks for no permissions but adds a provider is never told it reaches nothing", async ({ page, mount }) => {
  await page.setViewportSize({ width: NARROWEST_WIDTH, height: 844 });
  await using root = await createServerHarness({ startJobs: false });
  await serveWidenedCard(page, root);
  await mount<typeof PluginConsentLayoutStory>("tests/client/features/plugin/components/_consent-layout-stories/PluginConsentLayoutStory", {
    width: NARROWEST_WIDTH,
  });

  // The providers are listed, so the line over them says what is true of the capabilities alone.
  await expect(page.getByRole("listitem").filter({ hasText: ADDED_LABEL })).toBeVisible();
  await expect(page.getByText(PLUGIN_NO_PERMISSIONS_LINE, { exact: true })).toBeVisible();
  await expect(page.getByText(PLUGIN_NO_REACH_LINE, { exact: true })).toHaveCount(0);
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

  // Once approved, the card's own disclosure still lists what the plugin reaches, and the card does not warn that nothing was granted.
  await page.getByRole("button", { name: pluginDetailsLabel(MANIFEST_NAME), exact: true }).click();
  await page.getByRole("button", { name: pluginPermissionsLabel(MANIFEST_NAME), exact: true }).click();
  await expect(page.getByRole("listitem").filter({ hasText: ADDED_LABEL })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: FIRST_LABEL })).toBeVisible();
  await expect(page.getByText(PLUGIN_AUTOMATION_EVENTS_LINE, { exact: true })).toBeVisible();
  await expect(page.getByText(PLUGIN_NO_REACH_LINE, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("group", { name: pluginCardLabel(MANIFEST_NAME), exact: true }).locator('[data-slot="badge"]')).toHaveCount(0);
});

test("a first ask that declares a provider and no capability never counts its permissions as zero", async ({ page, mount }) => {
  await page.setViewportSize({ width: NARROWEST_WIDTH, height: 844 });
  await using root = await createServerHarness({ startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  // A copy nobody has answered yet: nothing granted, no earlier version to widen from, one provider declared.
  const unanswered = pluginViewSchema.parse({
    id: root.idSource.typeId(ID_PREFIX.plugin),
    slug: PLUGIN,
    name: MANIFEST_NAME,
    version: "1.0.0",
    status: "disabled",
    origin: "upload",
    sourceUrl: null,
    sourceCommit: null,
    updateSource: null,
    grantedCapabilities: [],
    declaredCapabilities: [],
    netHosts: null,
    reconsentPending: true,
    widenedNetHosts: [],
    providers: [{ id: firstProvider.id, label: FIRST_LABEL }],
    matchAutomationEvents: false,
    widenedProviderIds: [],
    widenedMatchAutomationEvents: false,
    builtAgainst: null,
    description: "Adds providers.",
    lastError: null,
    installedAt: root.clock.now(),
    updatedAt: root.clock.now(),
  });
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", "plugin.listSurfaces", "plugin.listDistributed", "connection.listBindings"]),
    "plugin.list": [unanswered],
  });
  await mount<typeof PluginConsentLayoutStory>("tests/client/features/plugin/components/_consent-layout-stories/PluginConsentLayoutStory", {
    width: NARROWEST_WIDTH,
  });

  const notice = page.getByRole("alert").filter({ has: page.getByRole("listitem").filter({ hasText: FIRST_LABEL }) });
  // The positive control: the notice is the first ask and lists the provider it is asking about.
  await expect(notice.getByRole("button", { name: approveLabel(MANIFEST_NAME, 0), exact: true })).toBeVisible();
  await expect(notice).not.toContainText(/\b0 permissions\b/u);
});
