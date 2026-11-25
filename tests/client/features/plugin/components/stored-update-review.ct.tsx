// A plugin installed from a URL shows what its next version changes before the update applies: the review names
// the version and the new host it reaches, "Apply update" lands the previewed bytes, and "Not now" sends nothing.
// It names a model provider by the label the consent card shows, and it says so when an earlier update's refusal
// still stands, so the owner is never told "nothing new" about an update that leaves the plugin off.

import { PLUGIN_PROVIDER_ID_PREFIX, providerDefSchema } from "@orb/contracts/inference";
import type { PluginManifest } from "@orb/contracts/plugin";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { TrpcRecorder } from "@orb/testkit/ct";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makePluginBundle } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import {
  APPLY_UPDATE_LABEL,
  pluginApplyUpdateLabel,
  pluginCheckForUpdatesLabel,
  pluginDetailsLabel,
  pluginUpdateToLabel,
  STORED_UPDATE_NOTHING_NEW,
  storedUpdateHeading,
  storedUpdateStandingLine,
  UPDATE_REVIEW_DISMISS_LABEL,
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
const WITH_PROVIDER = pluginManifestSchema.parse({ ...FIRST, version: "1.1.0", providers: [VISION_PROVIDER] });

// A plugin the owner already allowed one host. Its refused next version adds a second, which the owner has not answered.
const ALLOWED_HOST = "api.allowed.example";
const ALLOWED = pluginManifestSchema.parse({ ...FIRST, capabilities: ["net.fetch"], netHosts: [ALLOWED_HOST] });
const REFUSED = pluginManifestSchema.parse({ ...ALLOWED, version: "1.1.0", netHosts: [ALLOWED_HOST, REACHED_HOST] });
// The version after the refused one declares what it declared, so it widens nothing against it.
const AFTER_REFUSED = pluginManifestSchema.parse({ ...REFUSED, version: "1.2.0" });

interface Source {
  bundle: Uint8Array;
}

async function rootServing(source: Source): Promise<ServerTestHarness> {
  return await createServerHarness({
    startJobs: false,
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
  { first = FIRST, next = NEXT }: { readonly first?: PluginManifest; readonly next?: PluginManifest } = {},
): Promise<{ readonly caller: Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>; readonly calls: TrpcRecorder }> {
  const caller = await root.internalCallerFor(root.ownerId);
  source.bundle = makePluginBundle(first, "orb.host(1);", root.clock.now());
  const preview = await caller.plugin.previewFromUrl({ url: SOURCE });
  await caller.plugin.installFromUrl({ url: SOURCE, expectedBundleHash: preview.bundleHash, grant: first.capabilities });
  source.bundle = makePluginBundle(next, "orb.host(1);", root.clock.now());
  const calls = await routeTrpc(
    page,
    serveCorpusProcedures(caller, [
      "sessions.me",
      "settings.getUserSettings",
      "plugin.list",
      "plugin.listSurfaces",
      "plugin.getLog",
      "plugin.checkForUpdates",
      "plugin.previewStoredUpgrade",
      "plugin.upgradeFromStoredUrl",
      "plugin.listCommands",
      "plugin.listMacros",
      "plugin.listBundleAssets",
    ]),
  );
  return { caller, calls };
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

  const review = page.getByRole("group", { name: pluginApplyUpdateLabel(FIRST.name), exact: true });
  await expect(review).toContainText(storedUpdateHeading(FIRST.version, NEXT.version));
  await expect(review).toContainText(REACHED_HOST);
  expect(calls.count("plugin.upgradeFromStoredUrl")).toBe(0);

  await review.getByRole("button", { name: pluginApplyUpdateLabel(FIRST.name), exact: true }).click();
  await expect(review).toHaveCount(0);
  expect((await caller.plugin.list())[0]).toMatchObject({ version: NEXT.version, reconsentPending: true, widenedNetHosts: [REACHED_HOST] });
  await expect(page.getByRole("button", { name: APPLY_UPDATE_LABEL })).toHaveCount(0);
});

test("dismissing the review sends no upgrade and keeps the installed version", async ({ mount, page }) => {
  const source: Source = { bundle: new Uint8Array() };
  await using root = await rootServing(source);
  const { caller, calls } = await installAndRoute(page, root, source);
  await mount<typeof PluginActionGroupsStory>(STORY, { width: STORY_WIDTH, appearance: appearanceSettingsSchema.parse({}) });
  await openReview(page);

  const review = page.getByRole("group", { name: pluginApplyUpdateLabel(FIRST.name), exact: true });
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

  const review = page.getByRole("group", { name: pluginApplyUpdateLabel(FIRST.name), exact: true });
  await expect(review).toContainText(VISION_PROVIDER.label);
  await expect(review).not.toContainText(VISION_PROVIDER.id);
});

test("an earlier refusal that still stands is named, and the review says the plugin stays off until it is answered", async ({ mount, page }) => {
  const source: Source = { bundle: new Uint8Array() };
  await using root = await rootServing(source);
  const { caller } = await installAndRoute(page, root, source, { first: ALLOWED, next: REFUSED });
  // The owner applies the update that adds a host: the plugin lands off with that host unanswered.
  const installed = (await caller.plugin.list())[0];
  if (installed === undefined) {
    throw new Error("the plugin did not install");
  }
  const pluginId = installed.id;
  const refused = await caller.plugin.previewStoredUpgrade({ pluginId });
  if (refused.identity.source !== "url") {
    throw new Error("a url row previewed through a non-url source");
  }
  await caller.plugin.upgradeFromStoredUrl({ pluginId, expectedBundleHash: refused.identity.bundleHash });
  expect((await caller.plugin.list())[0]).toMatchObject({ version: REFUSED.version, reconsentPending: true, widenedNetHosts: [REACHED_HOST] });
  source.bundle = makePluginBundle(AFTER_REFUSED, "orb.host(1);", root.clock.now());

  await mount<typeof PluginActionGroupsStory>(STORY, { width: STORY_WIDTH, appearance: appearanceSettingsSchema.parse({}) });
  await page.getByRole("button", { name: pluginDetailsLabel(FIRST.name), exact: true }).click();
  await page.getByRole("button", { name: pluginCheckForUpdatesLabel(FIRST.name), exact: true }).click();
  await page.getByRole("button", { name: pluginUpdateToLabel(FIRST.name, AFTER_REFUSED.version), exact: true }).click();

  const review = page.getByRole("group", { name: pluginApplyUpdateLabel(FIRST.name), exact: true });
  await expect(review).toContainText(storedUpdateStandingLine([REACHED_HOST]));
  await expect(review).not.toContainText(STORED_UPDATE_NOTHING_NEW);

  await review.getByRole("button", { name: pluginApplyUpdateLabel(FIRST.name), exact: true }).click();
  await expect(review).toHaveCount(0);
  expect((await caller.plugin.list())[0]).toMatchObject({ version: AFTER_REFUSED.version, reconsentPending: true, widenedNetHosts: [REACHED_HOST] });
});
