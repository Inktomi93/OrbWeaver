// A plugin installed from a URL shows what its next version changes before the update applies: the review names
// the version and the new host it reaches, "Apply update" lands the previewed bytes, and "Not now" sends nothing.
// It names a model provider by the label the consent card shows, and it says so when an earlier update's refusal
// still stands, so the owner is never told "nothing new" about an update that leaves the plugin off.

import { spawn } from "node:child_process";
import { PLUGIN_PROVIDER_ID_PREFIX, providerDefSchema } from "@orb/contracts/inference";
import type { PluginManifest, PluginView } from "@orb/contracts/plugin";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { TrpcRecorder } from "@orb/testkit/ct";
import { noticeToast, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makePluginBundle } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import {
  APPLY_UPDATE_LABEL,
  PLUGIN_AUTOMATION_EVENTS_PHRASE,
  PLUGIN_PROVIDERS_NOUN,
  pluginApplyUpdateLabel,
  pluginCheckForUpdatesLabel,
  pluginDetailsLabel,
  pluginUpdateReviewLabel,
  pluginUpdateToLabel,
  providerEndpointNote,
  STORED_UPDATE_NOTHING_NEW,
  storedUpdateHeading,
  storedUpdateStandingLine,
  UPDATE_REVIEW_DISMISS_LABEL,
  upgradeNeedsApprovalNotice,
} from "#client/features/plugin/lib/plugin-copy.ts";
import type { PluginActionGroupsStory } from "./_update-action-groups-stories.tsx";

const STORY = "tests/client/features/plugin/components/_update-action-groups-stories/PluginActionGroupsStory";
const SOURCE = "https://updates.example.test/review.zip";
const REACHED_HOST = "api.review.example";
const STORY_WIDTH = 720;

const FIRST = pluginManifestSchema.parse({
  id: "stored-update-review",
  name: "Stored update review witness",
  description: "A bundle whose next version reaches one new host.",
  version: "1.0.0",
  hostVersion: PLUGIN_HOST_VERSIONS[0],
  entry: PLUGIN_MAIN_ENTRY,
  capabilities: [],
});
const NEXT = pluginManifestSchema.parse({ ...FIRST, version: "1.1.0", capabilities: ["net.fetch"], netHosts: [REACHED_HOST] });

// The next version adds a model provider whose id is an internal name and whose label is what the consent card shows.
const VISION_PROVIDER = providerDefSchema.parse({
  id: `${PLUGIN_PROVIDER_ID_PREFIX}${FIRST.id}/vision`,
  label: "Review Vision",
  wire: "openai-compat",
  dialect: "openai-compatible",
  auth: "endpoint",
  apis: ["chat-completions"],
  catalog: "url",
  metered: false,
});
const WITH_PROVIDER = pluginManifestSchema.parse({ ...FIRST, version: "1.1.0", providers: [VISION_PROVIDER], matchAutomationEvents: true });

// A plugin the owner already allowed one host. Its refused next version adds a second, which the owner has not answered.
const ALLOWED_HOST = "api.allowed.example";
const ALLOWED = pluginManifestSchema.parse({ ...FIRST, capabilities: ["net.fetch"], netHosts: [ALLOWED_HOST] });
const REFUSED = pluginManifestSchema.parse({ ...ALLOWED, version: "1.1.0", netHosts: [ALLOWED_HOST, REACHED_HOST] });
// The version after the refused one declares what it declared, so it widens nothing against it.
const AFTER_REFUSED = pluginManifestSchema.parse({ ...REFUSED, version: "1.2.0" });

// A refused version that still stands, then a next version that adds a model provider on top of it: the review has both to say.
const AFTER_REFUSED_WITH_PROVIDER = pluginManifestSchema.parse({ ...REFUSED, version: "1.2.0", providers: [VISION_PROVIDER] });

// A hosted provider the plugin already runs, and a next version that redefines it at another host.
const HOSTED_FROM = "api.hosted-before.example";
const HOSTED_TO = "api.hosted-after.example";
const hostedVision = (host: string): typeof VISION_PROVIDER => providerDefSchema.parse({ ...VISION_PROVIDER, auth: "apiKey", baseUrl: `https://${host}/v1` });
const HOSTED_BEFORE = pluginManifestSchema.parse({ ...FIRST, capabilities: ["net.fetch"], netHosts: [HOSTED_FROM], providers: [hostedVision(HOSTED_FROM)] });
const HOSTED_AFTER = pluginManifestSchema.parse({
  ...HOSTED_BEFORE,
  version: "1.1.0",
  netHosts: [HOSTED_FROM, HOSTED_TO],
  providers: [hostedVision(HOSTED_TO)],
});

interface Source {
  bundle: Uint8Array;
}

type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;

// A plugin the owner turns on needs a real host to run in, so a case that does says so.
async function rootServing(source: Source, { hostsPlugins = false }: { readonly hostsPlugins?: boolean } = {}): Promise<ServerTestHarness> {
  return await createServerHarness({
    startJobs: false,
    ...(hostsPlugins ? { pluginSpawn: spawn } : {}),
    networkExecution: {
      fetch: (input) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url !== SOURCE) {
          throw new Error(`Unexpected update source: ${url}`);
        }
        return Promise.resolve(new Response(Uint8Array.from(source.bundle), { headers: { "content-type": "application/zip" } }));
      },
      resolver: (): Promise<readonly string[]> => Promise.resolve([PUBLIC_PEER_ADDRESS]),
    },
  });
}

// Install the first version from the URL, then serve the next one and route the page's reads to the root.
async function installAndRoute(
  page: Page,
  root: ServerTestHarness,
  source: Source,
  { first = FIRST, next = NEXT, failApply = false }: { readonly first?: PluginManifest; readonly next?: PluginManifest; readonly failApply?: boolean } = {},
): Promise<{ readonly caller: Caller; readonly calls: TrpcRecorder }> {
  const caller = await root.internalCallerFor(root.ownerId);
  source.bundle = makePluginBundle(first, "orb.host(1);", root.clock.now());
  const preview = await caller.plugin.previewFromUrl({ url: SOURCE });
  await caller.plugin.installFromUrl({ url: SOURCE, expectedBundleHash: preview.bundleHash, grant: first.capabilities });
  source.bundle = makePluginBundle(next, "orb.host(1);", root.clock.now());
  const calls = await routeTrpc(page, {
    ...serveCorpusProcedures(caller, [
      "sessions.me",
      "settings.getUserSettings",
      "plugin.list",
      "plugin.listSurfaces",
      "plugin.getLog",
      "plugin.checkForUpdates",
      "plugin.previewStoredUpgrade",
      "plugin.listCommands",
      "plugin.listMacros",
      "plugin.listBundleAssets",
    ]),
    // The apply is the one request a case may refuse, so the review is left open on a failed update.
    ...serveCorpusProcedures(caller, ["plugin.upgradeFromStoredUrl"], failApply ? () => trpcError() : () => undefined),
  });
  return { caller, calls };
}

// The owner applies the update that adds a host, so the plugin lands off with that host unanswered; the next bundle served is the one after it.
async function leaveRefusalStanding(caller: Caller, root: ServerTestHarness, source: Source, next: PluginManifest): Promise<PluginView> {
  const installed = (await caller.plugin.list())[0];
  if (installed === undefined) {
    throw new Error("the plugin did not install");
  }
  const refused = await caller.plugin.previewStoredUpgrade({ pluginId: installed.id });
  if (refused.identity.source !== "url") {
    throw new Error("a url row previewed through a non-url source");
  }
  await caller.plugin.upgradeFromStoredUrl({ pluginId: installed.id, expectedBundleHash: refused.identity.bundleHash });
  const standing = (await caller.plugin.list())[0];
  if (standing === undefined) {
    throw new Error("the plugin is not listed");
  }
  source.bundle = makePluginBundle(next, "orb.host(1);", root.clock.now());
  return standing;
}

async function openReview(page: Page): Promise<void> {
  await page.getByRole("button", { name: pluginDetailsLabel(FIRST.name), exact: true }).click();
  await page.getByRole("button", { name: pluginCheckForUpdatesLabel(FIRST.name), exact: true }).click();
  await page.getByRole("button", { name: pluginUpdateToLabel(FIRST.name, NEXT.version), exact: true }).click();
}

test("the review names the new version and host, and applying it lands the previewed version", async ({ mount, page }) => {
  const source: Source = { bundle: new Uint8Array() };
  await using root = await rootServing(source);
  const { caller, calls } = await installAndRoute(page, root, source);
  await mount<typeof PluginActionGroupsStory>(STORY, { width: STORY_WIDTH, appearance: appearanceSettingsSchema.parse({}) });
  await openReview(page);

  const review = page.getByRole("group", { name: pluginUpdateReviewLabel(FIRST.name), exact: true });
  await expect(review).toContainText(storedUpdateHeading(FIRST.version, NEXT.version));
  await expect(review).toContainText(REACHED_HOST);
  expect(calls.count("plugin.upgradeFromStoredUrl")).toBe(0);

  // The heading stands above the lines under it.
  const headingSize = await review
    .getByText(storedUpdateHeading(FIRST.version, NEXT.version))
    .evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
  const lineSize = await review.getByText(REACHED_HOST).evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
  expect(headingSize).toBeGreaterThan(lineSize);

  await review.getByRole("button", { name: pluginApplyUpdateLabel(FIRST.name), exact: true }).click();
  await expect(review).toHaveCount(0);
  const applied = (await caller.plugin.list())[0];
  expect(applied).toMatchObject({ version: NEXT.version, status: "disabled", reconsentPending: true, widenedNetHosts: [REACHED_HOST] });
  if (applied === undefined) {
    throw new Error("the plugin is not listed");
  }
  // The first update that asks for this host leaves the plugin off, and the toast is the one for a plugin that is off.
  await expect(noticeToast(page, { title: upgradeNeedsApprovalNotice(FIRST.name, applied) })).toBeVisible();
  expect(upgradeNeedsApprovalNotice(FIRST.name, applied)).not.toBe(upgradeNeedsApprovalNotice(FIRST.name, { ...applied, status: "enabled" }));
  await expect(page.getByRole("button", { name: APPLY_UPDATE_LABEL })).toHaveCount(0);
});

test("dismissing the review sends no upgrade and keeps the installed version", async ({ mount, page }) => {
  const source: Source = { bundle: new Uint8Array() };
  await using root = await rootServing(source);
  const { caller, calls } = await installAndRoute(page, root, source);
  await mount<typeof PluginActionGroupsStory>(STORY, { width: STORY_WIDTH, appearance: appearanceSettingsSchema.parse({}) });
  await openReview(page);

  const review = page.getByRole("group", { name: pluginUpdateReviewLabel(FIRST.name), exact: true });
  await expect(review).toContainText(REACHED_HOST);
  await review.getByRole("button", { name: UPDATE_REVIEW_DISMISS_LABEL, exact: true }).click();
  await expect(review).toHaveCount(0);
  expect(calls.count("plugin.previewStoredUpgrade")).toBe(1);
  expect(calls.count("plugin.upgradeFromStoredUrl")).toBe(0);
  expect((await caller.plugin.list())[0]).toMatchObject({ version: FIRST.version });
});

test("the review names a model provider by the label the consent card shows, not by its id", async ({ mount, page }) => {
  const source: Source = { bundle: new Uint8Array() };
  await using root = await rootServing(source);
  await installAndRoute(page, root, source, { next: WITH_PROVIDER });
  await mount<typeof PluginActionGroupsStory>(STORY, { width: STORY_WIDTH, appearance: appearanceSettingsSchema.parse({}) });
  await openReview(page);

  const review = page.getByRole("group", { name: pluginUpdateReviewLabel(FIRST.name), exact: true });
  await expect(review).toContainText(VISION_PROVIDER.label);
  await expect(review).not.toContainText(VISION_PROVIDER.id);
  // The review calls them what the consent card calls them, and the automation events by the card's phrase.
  await expect(review).toContainText(PLUGIN_PROVIDERS_NOUN);
  await expect(review).toContainText(PLUGIN_AUTOMATION_EVENTS_PHRASE);
});

const WAITING_HOST_FACTS = { netHosts: [REACHED_HOST], providers: [], automationEvents: false } as const;

test("an earlier refusal that still stands is named, and the review says the plugin stays off when it is off", async ({ mount, page }) => {
  const source: Source = { bundle: new Uint8Array() };
  await using root = await rootServing(source);
  const { caller } = await installAndRoute(page, root, source, { first: ALLOWED, next: REFUSED });
  const refused = await leaveRefusalStanding(caller, root, source, AFTER_REFUSED);
  expect(refused).toMatchObject({ version: REFUSED.version, status: "disabled", reconsentPending: true, widenedNetHosts: [REACHED_HOST] });

  await mount<typeof PluginActionGroupsStory>(STORY, { width: STORY_WIDTH, appearance: appearanceSettingsSchema.parse({}) });
  await page.getByRole("button", { name: pluginDetailsLabel(FIRST.name), exact: true }).click();
  await page.getByRole("button", { name: pluginCheckForUpdatesLabel(FIRST.name), exact: true }).click();
  await page.getByRole("button", { name: pluginUpdateToLabel(FIRST.name, AFTER_REFUSED.version), exact: true }).click();

  const review = page.getByRole("group", { name: pluginUpdateReviewLabel(FIRST.name), exact: true });
  const said = await review.getByText(REACHED_HOST).evaluate((node) => node.textContent);
  await expect(review).not.toContainText(STORED_UPDATE_NOTHING_NEW);

  await review.getByRole("button", { name: pluginApplyUpdateLabel(FIRST.name), exact: true }).click();
  await expect(review).toHaveCount(0);
  const applied = (await caller.plugin.list())[0];
  expect(applied).toMatchObject({ version: AFTER_REFUSED.version, status: "disabled", reconsentPending: true, widenedNetHosts: [REACHED_HOST] });
  // The review said what the server then did: the plugin is off, and the line is the one for a plugin that stays off.
  expect(said).toBe(storedUpdateStandingLine(WAITING_HOST_FACTS, false));
  expect(said).not.toBe(storedUpdateStandingLine(WAITING_HOST_FACTS, true));
});

test("with the plugin on, the review and the toast say it stays on and what still waits", async ({ mount, page }) => {
  const source: Source = { bundle: new Uint8Array() };
  await using root = await rootServing(source, { hostsPlugins: true });
  const { caller } = await installAndRoute(page, root, source, { first: ALLOWED, next: REFUSED });
  const refused = await leaveRefusalStanding(caller, root, source, AFTER_REFUSED);
  // The owner turns it on with the host still unanswered: it runs without that host.
  await caller.plugin.setEnabled({ pluginId: refused.id, enabled: true });
  expect((await caller.plugin.list())[0]).toMatchObject({ status: "enabled", reconsentPending: true, widenedNetHosts: [REACHED_HOST] });

  await mount<typeof PluginActionGroupsStory>(STORY, { width: STORY_WIDTH, appearance: appearanceSettingsSchema.parse({}) });
  await page.getByRole("button", { name: pluginDetailsLabel(FIRST.name), exact: true }).click();
  await page.getByRole("button", { name: pluginCheckForUpdatesLabel(FIRST.name), exact: true }).click();
  await page.getByRole("button", { name: pluginUpdateToLabel(FIRST.name, AFTER_REFUSED.version), exact: true }).click();

  const review = page.getByRole("group", { name: pluginUpdateReviewLabel(FIRST.name), exact: true });
  const said = await review.getByText(REACHED_HOST).evaluate((node) => node.textContent);
  await review.getByRole("button", { name: pluginApplyUpdateLabel(FIRST.name), exact: true }).click();
  await expect(review).toHaveCount(0);

  // This update widened nothing, so the server turned the plugin back on with the earlier host still withheld.
  const applied = (await caller.plugin.list())[0];
  expect(applied).toMatchObject({ version: AFTER_REFUSED.version, status: "enabled", reconsentPending: true, widenedNetHosts: [REACHED_HOST] });
  if (applied === undefined) {
    throw new Error("the plugin is not listed");
  }
  // The review said what the server then did: the line is the one for a plugin that stays on, and never the one for off.
  expect(said).toBe(storedUpdateStandingLine(WAITING_HOST_FACTS, true));
  expect(said).not.toBe(storedUpdateStandingLine(WAITING_HOST_FACTS, false));

  // The toast is the one for a plugin that is on. It names the host that waits, and it does not call it new: this update added nothing.
  const toast = noticeToast(page, { title: upgradeNeedsApprovalNotice(FIRST.name, applied) });
  await expect(toast).toBeVisible();
  expect(upgradeNeedsApprovalNotice(FIRST.name, applied)).not.toBe(upgradeNeedsApprovalNotice(FIRST.name, { ...applied, status: "disabled" }));
  await expect(toast).toContainText(`${applied.widenedNetHosts.length} host`);
  await expect(toast).not.toContainText("newly");
});

test("the review describes itself by what it says, so a keyboard user hears the changes before Apply", async ({ mount, page }) => {
  const source: Source = { bundle: new Uint8Array() };
  await using root = await rootServing(source);
  await installAndRoute(page, root, source, { next: WITH_PROVIDER });
  await mount<typeof PluginActionGroupsStory>(STORY, { width: STORY_WIDTH, appearance: appearanceSettingsSchema.parse({}) });
  await openReview(page);

  const review = page.getByRole("group", { name: pluginUpdateReviewLabel(FIRST.name), exact: true });
  await expect(review).toHaveAccessibleDescription(
    new RegExp(`${storedUpdateHeading(FIRST.version, WITH_PROVIDER.version)}.*${VISION_PROVIDER.label}.*${PLUGIN_AUTOMATION_EVENTS_PHRASE}`, "u"),
  );
  // The description is the review's own text: it names the version, the provider and the events, and no button.
  await expect(review).not.toHaveAccessibleDescription(new RegExp(APPLY_UPDATE_LABEL, "u"));
});

// A next version that declares what the installed one does: nothing to approve, so the review says so.
const NOTHING_NEW = pluginManifestSchema.parse({ ...FIRST, version: NEXT.version });

test("an update that asks for nothing new says so, and a keyboard user hears it before Apply", async ({ mount, page }) => {
  const source: Source = { bundle: new Uint8Array() };
  await using root = await rootServing(source);
  await installAndRoute(page, root, source, { next: NOTHING_NEW });
  await mount<typeof PluginActionGroupsStory>(STORY, { width: STORY_WIDTH, appearance: appearanceSettingsSchema.parse({}) });
  await openReview(page);

  const review = page.getByRole("group", { name: pluginUpdateReviewLabel(FIRST.name), exact: true });
  await expect(review.getByText(STORED_UPDATE_NOTHING_NEW)).toBeVisible();
  await expect(review).toHaveAccessibleDescription(new RegExp(`${storedUpdateHeading(FIRST.version, NOTHING_NEW.version)}.*${STORED_UPDATE_NOTHING_NEW}`, "u"));
});

test("an earlier refusal that still stands leads the review in the notice's weight, ahead of the changes it sits beside", async ({ mount, page }) => {
  const source: Source = { bundle: new Uint8Array() };
  await using root = await rootServing(source);
  const { caller } = await installAndRoute(page, root, source, { first: ALLOWED, next: REFUSED });
  await leaveRefusalStanding(caller, root, source, AFTER_REFUSED_WITH_PROVIDER);

  await mount<typeof PluginActionGroupsStory>(STORY, { width: STORY_WIDTH, appearance: appearanceSettingsSchema.parse({}) });
  await page.getByRole("button", { name: pluginDetailsLabel(FIRST.name), exact: true }).click();
  await page.getByRole("button", { name: pluginCheckForUpdatesLabel(FIRST.name), exact: true }).click();
  await page.getByRole("button", { name: pluginUpdateToLabel(FIRST.name, AFTER_REFUSED_WITH_PROVIDER.version), exact: true }).click();

  const review = page.getByRole("group", { name: pluginUpdateReviewLabel(FIRST.name), exact: true });
  const standing = review.getByText(REACHED_HOST);
  const change = review.getByText(VISION_PROVIDER.label);
  await expect(standing).toBeVisible();
  await expect(change).toBeVisible();
  const standingBox = await standing.boundingBox();
  const changeBox = await change.boundingBox();
  if (standingBox === null || changeBox === null) {
    throw new Error("the review is not laid out");
  }
  expect(standingBox.y).toBeLessThan(changeBox.y);
  const fontSizeOf = (line: typeof standing): Promise<number> => line.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
  expect(await fontSizeOf(standing)).toBeGreaterThan(await fontSizeOf(change));
});

test("a redefined provider is named as changed, with the host its prompts go to, and no line calls it added", async ({ mount, page }) => {
  const source: Source = { bundle: new Uint8Array() };
  await using root = await rootServing(source);
  await installAndRoute(page, root, source, { first: HOSTED_BEFORE, next: HOSTED_AFTER });
  await mount<typeof PluginActionGroupsStory>(STORY, { width: STORY_WIDTH, appearance: appearanceSettingsSchema.parse({}) });
  await openReview(page);

  const review = page.getByRole("group", { name: pluginUpdateReviewLabel(FIRST.name), exact: true });
  const changed = review.getByText(VISION_PROVIDER.label);
  await expect(changed).toContainText(providerEndpointNote(HOSTED_TO));
  // The old endpoint is not claimed anywhere in the review: the owner is told where prompts go now.
  await expect(review).not.toContainText(HOSTED_FROM);
  await expect(changed).toContainText(`Changes ${PLUGIN_PROVIDERS_NOUN}`);
  await expect(review).not.toContainText(`Adds ${PLUGIN_PROVIDERS_NOUN}`);
});

test("keyboard focus moves into the review when it opens and back to the row's update check when it closes", async ({ mount, page }) => {
  const source: Source = { bundle: new Uint8Array() };
  await using root = await rootServing(source);
  await installAndRoute(page, root, source);
  await mount<typeof PluginActionGroupsStory>(STORY, { width: STORY_WIDTH, appearance: appearanceSettingsSchema.parse({}) });
  await page.getByRole("button", { name: pluginDetailsLabel(FIRST.name), exact: true }).click();
  const check = page.getByRole("button", { name: pluginCheckForUpdatesLabel(FIRST.name), exact: true });
  const update = page.getByRole("button", { name: pluginUpdateToLabel(FIRST.name, NEXT.version), exact: true });
  const review = page.getByRole("group", { name: pluginUpdateReviewLabel(FIRST.name), exact: true });

  // Not now: the review takes focus, and the press that closes it hands focus back to the check.
  await check.focus();
  await page.keyboard.press("Enter");
  await update.focus();
  await page.keyboard.press("Enter");
  await expect(review).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(review.getByRole("button", { name: UPDATE_REVIEW_DISMISS_LABEL, exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(review).toHaveCount(0);
  await expect(check).toBeFocused();

  // Apply update: the same door in, and the applied update leaves focus on the check.
  await page.keyboard.press("Enter");
  await update.focus();
  await page.keyboard.press("Enter");
  await expect(review).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(review.getByRole("button", { name: pluginApplyUpdateLabel(FIRST.name), exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(review).toHaveCount(0);
  await expect(check).toBeFocused();
  // The group is named for the review, never for its Apply press.
  await expect(page.getByRole("group", { name: pluginApplyUpdateLabel(FIRST.name), exact: true })).toHaveCount(0);
});

test("a failed Apply leaves the review open with keyboard focus still on Apply", async ({ mount, page }) => {
  const source: Source = { bundle: new Uint8Array() };
  await using root = await rootServing(source);
  const { caller, calls } = await installAndRoute(page, root, source, { failApply: true });
  await mount<typeof PluginActionGroupsStory>(STORY, { width: STORY_WIDTH, appearance: appearanceSettingsSchema.parse({}) });
  await page.getByRole("button", { name: pluginDetailsLabel(FIRST.name), exact: true }).click();
  await page.getByRole("button", { name: pluginCheckForUpdatesLabel(FIRST.name), exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: pluginUpdateToLabel(FIRST.name, NEXT.version), exact: true }).focus();
  await page.keyboard.press("Enter");
  const review = page.getByRole("group", { name: pluginUpdateReviewLabel(FIRST.name), exact: true });
  await expect(review).toBeFocused();
  await page.keyboard.press("Tab");
  const apply = review.getByRole("button", { name: pluginApplyUpdateLabel(FIRST.name), exact: true });
  await expect(apply).toBeFocused();
  await page.keyboard.press("Enter");

  // The request was refused and has settled: Apply is no longer busy, the plugin is unchanged, and focus never left Apply.
  await expect.poll(() => calls.count("plugin.upgradeFromStoredUrl")).toBe(1);
  await expect(apply).not.toHaveAttribute("aria-busy", "true");
  await expect(review).toBeVisible();
  await expect(apply).toBeFocused();
  expect((await caller.plugin.list())[0]).toMatchObject({ version: FIRST.version });
});
