// A plugin installed from a URL shows what its next version changes before the update applies: the review names
// the version and the new host it reaches, "Apply update" lands the previewed bytes, and "Not now" sends nothing.

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
  storedUpdateHeading,
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
): Promise<{ readonly caller: Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>; readonly calls: TrpcRecorder }> {
  const caller = await root.internalCallerFor(root.ownerId);
  source.bundle = makePluginBundle(FIRST, "orb.host(1);", root.clock.now());
  const preview = await caller.plugin.previewFromUrl({ url: SOURCE });
  await caller.plugin.installFromUrl({ url: SOURCE, expectedBundleHash: preview.bundleHash, grant: [] });
  source.bundle = makePluginBundle(NEXT, "orb.host(1);", root.clock.now());
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
