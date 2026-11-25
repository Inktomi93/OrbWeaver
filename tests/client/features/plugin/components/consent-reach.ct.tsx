// An update that adds a model provider and turns on the automation opt-in is named on the plugin's consent card: the
// re-consent notice says both, each provider is listed with the added one alone marked as new, and the automation
// line carries the added mark. The unmarked first provider is the control for the mark. A redefined provider wears its own
// mark and says where its prompts go. Approving the card sends the echo the server requires, so the plugin comes up enabled
// with the provider and the opt-in answered. While the plugin is switched on, the notice says it runs without the unanswered
// reach, never that it stayed off. A one-word mark stays whole on one line at the narrowest width, whatever the names beside it.
import { spawn } from "node:child_process";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { makePluginProviderRow } from "@orb/testkit/iso";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makePluginBundle } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import {
  approveLabel,
  enablePluginLabel,
  PLUGIN_ADDED_MARK,
  PLUGIN_AUTOMATION_EVENTS_LINE,
  PLUGIN_AUTOMATION_EVENTS_PHRASE,
  PLUGIN_NO_PERMISSIONS_LINE,
  PLUGIN_NO_REACH_LINE,
  PLUGIN_PROVIDER_CHANGED_MARK,
  pluginCardLabel,
  pluginDetailsLabel,
  pluginPermissionsLabel,
  providerEndpointNote,
  RE_CONSENT_OFF_CLAIM,
  reConsentBody,
  reConsentNoticeLabel,
  statusCopy,
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
const STORY = "tests/client/features/plugin/components/_consent-layout-stories/PluginConsentLayoutStory";

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

type OwnerCaller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;

// An installed plugin upgraded from `before` to `after`, with the settings door's reads served from the root.
async function serveUpgradedCard(
  page: Page,
  root: ServerTestHarness,
  { before, after, grant }: { readonly before: object; readonly after: object; readonly grant: readonly "net.fetch"[] },
): Promise<OwnerCaller> {
  const owner = await root.principalFor(root.ownerId);
  const installed = await root.services.plugin.install({
    caller: owner,
    bundle: makePluginBundle(manifestOf("1.0.0", before), GUEST, root.clock.now()),
    grant: [...grant],
  });
  await root.services.plugin.upgrade({
    caller: owner,
    pluginId: installed.id,
    bundle: makePluginBundle(manifestOf("1.1.0", after), GUEST, root.clock.now()),
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
      "plugin.setEnabled",
      "connection.listBindings",
    ]),
  );
  return caller;
}

// An installed plugin whose update added a provider and turned the automation opt-in on.
function serveWidenedCard(page: Page, root: ServerTestHarness): Promise<OwnerCaller> {
  return serveUpgradedCard(page, root, {
    before: {},
    after: { providers: [firstProvider, addedProvider], matchAutomationEvents: true },
    grant: [],
  });
}

// A mark is one word on one line. A mark squeezed by its row breaks letter by letter, so its text spans several line boxes and its box is
// taller than it is wide.
async function expectWholeMark(mark: Locator): Promise<void> {
  await expect(mark).toBeVisible();
  const lineTops = await mark.evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return [...new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)))];
  });
  expect(lineTops).toHaveLength(1);
  const box = await mark.boundingBox();
  if (box === null) {
    throw new Error("the mark is not laid out");
  }
  expect(box.width).toBeGreaterThan(box.height);
}

test("an update's added provider and automation opt-in are named and marked on the consent card", async ({ page, mount }) => {
  await page.setViewportSize({ width: NARROWEST_WIDTH, height: 844 });
  await using root = await createServerHarness({ startJobs: false });
  await serveWidenedCard(page, root);
  await mount<typeof PluginConsentLayoutStory>(STORY, { width: NARROWEST_WIDTH });

  // The plugin is off, so the notice says so, and says both additions. This is the control for the switched-on case below.
  const notice = page.getByRole("alert", { name: reConsentNoticeLabel(MANIFEST_NAME), exact: true });
  await expect(notice).toContainText(RE_CONSENT_OFF_CLAIM);
  await expect(notice).toContainText(PLUGIN_AUTOMATION_EVENTS_PHRASE);
  await expect(notice).toContainText(reConsentBody(false));

  const added = page.getByRole("listitem").filter({ hasText: ADDED_LABEL });
  const first = page.getByRole("listitem").filter({ hasText: FIRST_LABEL });
  await expect(added.getByText(PLUGIN_ADDED_MARK, { exact: true })).toBeVisible();
  await expect(added.getByText(PLUGIN_PROVIDER_CHANGED_MARK, { exact: true })).toHaveCount(0);
  await expect(first).toBeVisible();
  await expect(first.getByText(PLUGIN_ADDED_MARK, { exact: true })).toHaveCount(0);
  await expect(first.getByText(PLUGIN_PROVIDER_CHANGED_MARK, { exact: true })).toHaveCount(0);

  const automation = page.getByText(PLUGIN_AUTOMATION_EVENTS_LINE, { exact: true });
  await expect(automation).toBeVisible();
  const automationMark = automation.locator("..").getByText(PLUGIN_ADDED_MARK, { exact: true });
  // At the narrowest width the mark stays whole and beside its sentence: one word on one line, not a letter to a line, and its centre
  // is within the sentence's own height, not on a line under it.
  await expectWholeMark(automationMark);
  const markBox = await automationMark.boundingBox();
  const sentenceBox = await automation.boundingBox();
  if (markBox === null || sentenceBox === null) {
    throw new Error("the automation line is not laid out");
  }
  expect(markBox.y + markBox.height / 2).toBeLessThan(sentenceBox.y + sentenceBox.height);
  // The card and the notice over it name the automation events with one phrase.
  await expect(automation).toContainText(PLUGIN_AUTOMATION_EVENTS_PHRASE);
});

test("a redefined provider is marked Changed with the host its prompts go to, and a new one is marked New", async ({ page, mount }) => {
  await page.setViewportSize({ width: NARROWEST_WIDTH, height: 844 });
  await using root = await createServerHarness({ startJobs: false });
  const oldHost = "api.old.example";
  const newHost = "api.new.example";
  const hosted = (host: string): typeof firstProvider =>
    makePluginProviderRow(PLUGIN, "acme", { label: FIRST_LABEL, auth: "apiKey", baseUrl: `https://${host}/v1` });
  const caller = await serveUpgradedCard(page, root, {
    before: { capabilities: ["net.fetch"], netHosts: [oldHost], providers: [hosted(oldHost)] },
    after: { capabilities: ["net.fetch"], netHosts: [newHost], providers: [hosted(newHost), addedProvider] },
    grant: ["net.fetch"],
  });
  await mount<typeof PluginConsentLayoutStory>(STORY, { width: NARROWEST_WIDTH });
  expect((await caller.plugin.list())[0]).toMatchObject({
    widenedProviderIds: [firstProvider.id, addedProvider.id],
    widenedChangedProviderIds: [firstProvider.id],
  });

  const redefined = page.getByRole("listitem").filter({ hasText: FIRST_LABEL });
  await expect(redefined.getByText(PLUGIN_PROVIDER_CHANGED_MARK, { exact: true })).toBeVisible();
  await expect(redefined.getByText(PLUGIN_ADDED_MARK, { exact: true })).toHaveCount(0);
  await expect(redefined).toContainText(providerEndpointNote(newHost), { ignoreCase: true });

  const added = page.getByRole("listitem").filter({ hasText: ADDED_LABEL });
  await expect(added.getByText(PLUGIN_ADDED_MARK, { exact: true })).toBeVisible();
  await expect(added.getByText(PLUGIN_PROVIDER_CHANGED_MARK, { exact: true })).toHaveCount(0);
  await expect(added).not.toContainText(providerEndpointNote(newHost), { ignoreCase: true });
});

test("a mark stays whole beside a long host and a long provider label at the narrowest width", async ({ page, mount }) => {
  await page.setViewportSize({ width: NARROWEST_WIDTH, height: 844 });
  await using root = await createServerHarness({ startJobs: false });
  const longLabel = `Relay${"x".repeat(60)}`;
  const longHost = `${"a".repeat(50)}.${"b".repeat(50)}.example`;
  const hosted = (host: string): typeof firstProvider =>
    makePluginProviderRow(PLUGIN, "acme", { label: longLabel, auth: "apiKey", baseUrl: `https://${host}/v1` });
  await serveUpgradedCard(page, root, {
    before: { capabilities: ["net.fetch"], netHosts: ["api.old.example"], providers: [hosted("api.old.example")] },
    after: { capabilities: ["net.fetch"], netHosts: ["api.old.example", longHost], providers: [hosted(longHost), addedProvider], matchAutomationEvents: true },
    grant: ["net.fetch"],
  });
  await mount<typeof PluginConsentLayoutStory>(STORY, { width: NARROWEST_WIDTH });

  const notice = page.getByRole("alert", { name: reConsentNoticeLabel(MANIFEST_NAME), exact: true });
  // The long names wrap inside the notice; they never push it past the viewport.
  const noticeBox = await notice.boundingBox();
  expect(noticeBox).not.toBeNull();
  expect((noticeBox?.x ?? 0) + (noticeBox?.width ?? 0)).toBeLessThanOrEqual(NARROWEST_WIDTH);
  await expectWholeMark(notice.getByRole("listitem").filter({ hasText: longHost }).getByText(PLUGIN_ADDED_MARK, { exact: true }));
  await expectWholeMark(notice.getByRole("listitem").filter({ hasText: longLabel }).getByText(PLUGIN_PROVIDER_CHANGED_MARK, { exact: true }));
  await expectWholeMark(notice.getByRole("listitem").filter({ hasText: ADDED_LABEL }).getByText(PLUGIN_ADDED_MARK, { exact: true }));
  await expectWholeMark(notice.getByText(PLUGIN_AUTOMATION_EVENTS_LINE, { exact: true }).locator("..").getByText(PLUGIN_ADDED_MARK, { exact: true }));
});

test("a plugin that asks for no permissions but adds a provider is never told it reaches nothing", async ({ page, mount }) => {
  await page.setViewportSize({ width: NARROWEST_WIDTH, height: 844 });
  await using root = await createServerHarness({ startJobs: false });
  await serveWidenedCard(page, root);
  await mount<typeof PluginConsentLayoutStory>(STORY, { width: NARROWEST_WIDTH });

  // The providers are listed, so the line over them says what is true of the capabilities alone, at the size of the lines beside it.
  await expect(page.getByRole("listitem").filter({ hasText: ADDED_LABEL })).toBeVisible();
  const line = page.getByText(PLUGIN_NO_PERMISSIONS_LINE, { exact: true });
  await expect(line).toBeVisible();
  await expect(page.getByText(PLUGIN_NO_REACH_LINE, { exact: true })).toHaveCount(0);
  const neighbour = page.getByText(PLUGIN_AUTOMATION_EVENTS_LINE, { exact: true });
  const fontSizeOf = (locator: Locator): Promise<number> => locator.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
  expect(await fontSizeOf(line)).toBe(await fontSizeOf(neighbour));
  const maxWidthOf = (locator: Locator): Promise<string> => locator.evaluate((node) => getComputedStyle(node).maxWidth);
  expect(await maxWidthOf(line)).toBe(await maxWidthOf(neighbour));
  expect(await maxWidthOf(line)).not.toBe("none");
});

test("approving the card echoes the provider and the opt-in, and the plugin comes up with the question cleared", async ({ page, mount }) => {
  await page.setViewportSize({ width: NARROWEST_WIDTH, height: 844 });
  await using root = await createServerHarness({ startJobs: false, pluginSpawn: spawn });
  const caller = await serveWidenedCard(page, root);
  await mount<typeof PluginConsentLayoutStory>(STORY, { width: NARROWEST_WIDTH });
  expect((await caller.plugin.list())[0]).toMatchObject({
    reconsentPending: true,
    widenedProviderIds: [addedProvider.id],
    widenedChangedProviderIds: [],
    widenedMatchAutomationEvents: true,
  });

  const approve = page.getByRole("button", { name: approveLabel(MANIFEST_NAME, 0), exact: true });
  await approve.click();
  await expect(approve).toHaveCount(0);

  expect((await caller.plugin.list())[0]).toMatchObject({
    status: "enabled",
    reconsentPending: false,
    widenedProviderIds: [],
    widenedChangedProviderIds: [],
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

test("an Enabled switch pressed while a re-consent is open says the plugin runs and what waits, and never that it stayed off", async ({ page, mount }) => {
  await page.setViewportSize({ width: NARROWEST_WIDTH, height: 844 });
  await using root = await createServerHarness({ startJobs: false, pluginSpawn: spawn });
  const caller = await serveWidenedCard(page, root);
  await mount<typeof PluginConsentLayoutStory>(STORY, { width: NARROWEST_WIDTH });
  const card = page.getByRole("group", { name: pluginCardLabel(MANIFEST_NAME), exact: true });
  const notice = card.getByRole("alert", { name: reConsentNoticeLabel(MANIFEST_NAME), exact: true });
  // Off first: the notice's off claim is on screen, so its absence below is a change and not a notice that never made it.
  await expect(notice).toContainText(RE_CONSENT_OFF_CLAIM);
  await card.getByRole("switch", { name: enablePluginLabel(MANIFEST_NAME), exact: true }).click();

  // The plugin runs, with the new provider and the opt-in withheld, and the card says so beside the notice that still asks.
  await expect.poll(async () => (await caller.plugin.list())[0]?.status).toBe("enabled");
  const running = (await caller.plugin.list())[0];
  expect(running).toMatchObject({ reconsentPending: true, widenedProviderIds: [addedProvider.id] });
  if (running === undefined) {
    throw new Error("the plugin is not listed");
  }
  await expect(card.getByText(statusCopy(running).label, { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: approveLabel(MANIFEST_NAME, 0), exact: true })).toBeVisible();
  await expect(notice).toContainText(reConsentBody(true));
  await expect(notice).toContainText(PLUGIN_AUTOMATION_EVENTS_PHRASE);
  await expect(notice).not.toContainText(RE_CONSENT_OFF_CLAIM);
  await expect(notice).not.toContainText(reConsentBody(false));
});
