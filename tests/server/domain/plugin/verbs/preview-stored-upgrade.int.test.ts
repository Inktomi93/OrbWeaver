// An owner reviews what a stored-source upgrade changes before it applies: the preview fetches the remembered URL or
// clones the remembered repository, reports the new version and the reach it widens, and returns the identity the
// upgrade must echo. Applying refuses bytes or a commit the preview did not show. A stranger holding the real plugin id
// is refused before the server fetches anything; the owner's own preview is the control that does fetch.
// @subject packages/server/src/domain/plugin/verbs/preview-stored-upgrade.ts
// @subject packages/server/src/domain/plugin/verbs/upgrade-from-stored-url.ts
// @subject packages/server/src/domain/plugin/verbs/git-source.ts

import { PLUGIN_PROVIDER_ID_PREFIX } from "@orb/contracts/inference";
import type { PluginManifest, PluginView } from "@orb/contracts/plugin";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, PLUGIN_UI_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { CORPUS_PLUGIN_GIT_URL, createCorpusPluginGit, createServerHarness, makePluginBundle } from "@orb/testkit/node/composed";
import { strToU8 } from "fflate";

const BUNDLE_URL = "https://plugins.example.test/ledger.zip";
const SOURCE = 'orb.host(1).ui.registerCommand({ name: "note", describe: "Note a line", onRun: () => {} });';
const UI_SOURCE = "orb.ui(1);";
const REACHED_HOST = "api.ledger.example";

const FIRST = pluginManifestSchema.parse({
  id: "ledger",
  name: "Ledger",
  version: "1.0.0",
  hostVersion: PLUGIN_HOST_VERSIONS[0],
  entry: PLUGIN_MAIN_ENTRY,
  description: "Keeps a ledger.",
  capabilities: ["ui.surface"],
});

// The next version asks for egress to one new host, opts into automation-caused events and ships a browser script.
const WIDER = pluginManifestSchema.parse({
  ...FIRST,
  version: "1.1.0",
  uiEntry: PLUGIN_UI_ENTRY,
  capabilities: ["ui.surface", "net.fetch"],
  netHosts: [REACHED_HOST],
  matchAutomationEvents: true,
});

interface PluginSource {
  served: Uint8Array | null;
  requests: number;
}

function bundleOf(manifest: PluginManifest, at: number): Uint8Array {
  return makePluginBundle(manifest, SOURCE, at, manifest.uiEntry === undefined ? {} : { [manifest.uiEntry]: strToU8(UI_SOURCE) });
}

async function rootWithSource(source: PluginSource): Promise<ServerTestHarness> {
  return await createServerHarness({
    networkExecution: {
      resolver: () => Promise.resolve([PUBLIC_PEER_ADDRESS]),
      fetch: () => {
        source.requests += 1;
        return source.served === null ? Promise.reject(new Error("no bundle is served")) : Promise.resolve(new Response(Uint8Array.from(source.served)));
      },
    },
  });
}

// The owner installs 1.0.0 from the address with its one capability granted; the source then serves the wider 1.1.0.
async function installFromSource(root: ServerTestHarness, source: PluginSource): Promise<PluginView["id"]> {
  const owner = await root.internalCallerFor(root.ownerId);
  source.served = bundleOf(FIRST, root.clock.now());
  const { bundleHash } = await owner.plugin.previewFromUrl({ url: BUNDLE_URL });
  const installed = await owner.plugin.installFromUrl({ url: BUNDLE_URL, expectedBundleHash: bundleHash, grant: ["ui.surface"] });
  source.served = bundleOf(WIDER, root.clock.now());
  return installed.id;
}

test("a stored URL upgrade previews the new version and the reach it widens, and the upgrade applies the previewed bytes", async () => {
  const source: PluginSource = { served: null, requests: 0 };
  await using root = await rootWithSource(source);
  const pluginId = await installFromSource(root, source);
  const owner = await root.internalCallerFor(root.ownerId);

  const preview = await owner.plugin.previewStoredUpgrade({ pluginId });
  expect(preview).toMatchObject({
    pluginId,
    fromVersion: "1.0.0",
    toVersion: "1.1.0",
    shipsUiScript: { before: false, after: true },
    widening: { capabilities: ["net.fetch"], netHosts: [REACHED_HOST], providerIds: [], matchAutomationEvents: true },
    identity: { source: "url" },
  });
  if (preview.identity.source !== "url") {
    throw new Error("a url row previewed through a non-url source");
  }
  expect((await owner.plugin.list())[0]).toMatchObject({ id: pluginId, version: "1.0.0" });

  const upgraded = await owner.plugin.upgradeFromStoredUrl({ pluginId, expectedBundleHash: preview.identity.bundleHash });
  expect(upgraded).toMatchObject({ id: pluginId, version: "1.1.0", origin: "url", reconsentPending: true, widenedNetHosts: [REACHED_HOST] });
});

test("bytes that change between the preview and the upgrade are refused, and the owner keeps the version they had", async () => {
  const source: PluginSource = { served: null, requests: 0 };
  await using root = await rootWithSource(source);
  const pluginId = await installFromSource(root, source);
  const owner = await root.internalCallerFor(root.ownerId);
  const preview = await owner.plugin.previewStoredUpgrade({ pluginId });
  if (preview.identity.source !== "url") {
    throw new Error("a url row previewed through a non-url source");
  }

  source.served = bundleOf(pluginManifestSchema.parse({ ...WIDER, version: "1.2.0" }), root.clock.now());
  await expect(owner.plugin.upgradeFromStoredUrl({ pluginId, expectedBundleHash: preview.identity.bundleHash })).rejects.toMatchObject({ code: "CONFLICT" });
  expect((await owner.plugin.list())[0]).toMatchObject({ id: pluginId, version: "1.0.0", reconsentPending: false });

  const current = await owner.plugin.previewStoredUpgrade({ pluginId });
  expect(current).toMatchObject({ toVersion: "1.2.0" });
  expect(current.identity).not.toEqual(preview.identity);
});

test("a stranger's preview of another owner's plugin is refused before the server fetches its stored address; the owner's preview fetches it", async () => {
  const source: PluginSource = { served: null, requests: 0 };
  await using root = await rootWithSource(source);
  const pluginId = await installFromSource(root, source);
  const stranger = await root.internalCallerFor((await root.actor()).id);
  const sent = source.requests;

  await expect(stranger.plugin.previewStoredUpgrade({ pluginId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(source.requests).toBe(sent);

  const owner = await root.internalCallerFor(root.ownerId);
  expect(await owner.plugin.previewStoredUpgrade({ pluginId })).toMatchObject({ pluginId, toVersion: "1.1.0" });
  expect(source.requests).toBe(sent + 1);
});

// A provider the ledger offers, under an id its slug owns; only the id varies between versions.
function ledgerProvider(name: string): NonNullable<PluginManifest["providers"]>[number] {
  return {
    id: `${PLUGIN_PROVIDER_ID_PREFIX}${FIRST.id}/${name}`,
    label: `Ledger ${name}`,
    wire: "openai-compat",
    dialect: "openai-compatible",
    auth: "endpoint",
    apis: ["chat-completions"],
    catalog: "url",
    metered: false,
  };
}

test("reach the installed version already holds is not shown as widening, and a dropped browser script is shown dropped", async () => {
  const source: PluginSource = { served: null, requests: 0 };
  await using root = await rootWithSource(source);
  const owner = await root.internalCallerFor(root.ownerId);
  const held = pluginManifestSchema.parse({ ...FIRST, uiEntry: PLUGIN_UI_ENTRY, matchAutomationEvents: true, providers: [ledgerProvider("text")] });
  source.served = bundleOf(held, root.clock.now());
  const { bundleHash } = await owner.plugin.previewFromUrl({ url: BUNDLE_URL });
  const installed = await owner.plugin.installFromUrl({ url: BUNDLE_URL, expectedBundleHash: bundleHash, grant: ["ui.surface"] });
  const added = ledgerProvider("vision");
  const { uiEntry: _dropped, ...withoutScript } = held;
  source.served = bundleOf(pluginManifestSchema.parse({ ...withoutScript, version: "1.1.0", providers: [ledgerProvider("text"), added] }), root.clock.now());

  expect(await owner.plugin.previewStoredUpgrade({ pluginId: installed.id })).toMatchObject({
    shipsUiScript: { before: true, after: false },
    widening: { capabilities: [], netHosts: [], providerIds: [added.id], matchAutomationEvents: false },
  });
});

test("a plugin installed from a file has no stored source to preview, and nothing is fetched", async () => {
  const source: PluginSource = { served: null, requests: 0 };
  await using root = await rootWithSource(source);
  const owner = await root.internalCallerFor(root.ownerId);
  const uploaded = await root.services.plugin.install({ caller: await root.principalFor(root.ownerId), bundle: bundleOf(FIRST, root.clock.now()), grant: [] });

  await expect(owner.plugin.previewStoredUpgrade({ pluginId: uploaded.id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(source.requests).toBe(0);
});

test("a stored Git upgrade previews through the repository, refuses a commit that moved after the preview, and applies the previewed one", {
  tags: ["slow"],
}, async ({ importStagingDir, clock }) => {
  const remote = await createCorpusPluginGit(importStagingDir, clock.now());
  await using root = await createServerHarness({ networkExecution: remote.networkExecution });
  const owner = await root.internalCallerFor(root.ownerId);
  const first = await owner.plugin.previewFromGit({ url: CORPUS_PLUGIN_GIT_URL });
  const installed = await owner.plugin.installFromGit({ url: CORPUS_PLUGIN_GIT_URL, expectedCommit: first.sourceCommit, grant: [] });

  const reviewed = await remote.advance();
  const preview = await owner.plugin.previewStoredUpgrade({ pluginId: installed.id });
  expect(preview).toMatchObject({
    pluginId: installed.id,
    fromVersion: first.manifest.version,
    toVersion: first.manifest.version,
    widening: { netHosts: [], providerIds: [], matchAutomationEvents: false },
    identity: { source: "git", sourceCommit: reviewed },
  });

  const moved = await remote.advance("A revision pushed after the review");
  await expect(owner.plugin.upgradeFromStoredGit({ pluginId: installed.id, expectedCommit: reviewed })).rejects.toMatchObject({ code: "CONFLICT" });
  expect((await owner.plugin.list())[0]).toMatchObject({ id: installed.id, sourceCommit: first.sourceCommit });

  const current = await owner.plugin.previewStoredUpgrade({ pluginId: installed.id });
  expect(current.identity).toEqual({ source: "git", sourceCommit: moved });
  expect(await owner.plugin.upgradeFromStoredGit({ pluginId: installed.id, expectedCommit: moved })).toMatchObject({ origin: "git", sourceCommit: moved });
});
