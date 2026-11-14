// A one-click upgrade re-fetches the address the plugin was installed from. Only the plugin's owner can make the server
// fetch it: a stranger holding the real plugin id is refused before any request leaves, and the owner's own upgrade is
// the control that does send one. A fetch that fails is a client error whose cause is logged once.
// @subject packages/server/src/domain/plugin/verbs/upgrade-from-stored-url.ts
// @subject packages/server/src/domain/plugin/context.ts

import type { PluginBundleHash, PluginManifest, PluginView } from "@orb/contracts/plugin";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makePluginBundle } from "@orb/testkit/node/composed";
import { z } from "zod";

const BUNDLE_URL = "https://plugins.example.test/ledger.zip";
const UPSTREAM_FAULT = "connection reset by the plugin source";
const SOURCE = 'orb.host(1).ui.registerCommand({ name: "note", describe: "Note a line", onRun: () => {} });';
const LOG_SCAN_LIMIT = 500;
const logRecordSchema = z.looseObject({ level: z.string(), err: z.looseObject({ message: z.string() }).optional() });

function manifest(version: string): PluginManifest {
  return pluginManifestSchema.parse({
    id: "ledger",
    name: "Ledger",
    version,
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    description: "Keeps a ledger.",
    capabilities: ["ui.surface"],
  });
}

// The plugin source at `BUNDLE_URL`: it serves `served` and counts every request the server sent it, or fails each one.
interface PluginSource {
  served: Uint8Array | null;
  requests: number;
}

async function rootWithSource(source: PluginSource): Promise<ServerTestHarness> {
  return await createServerHarness({
    logLevel: "warn",
    networkExecution: {
      resolver: () => Promise.resolve([PUBLIC_PEER_ADDRESS]),
      fetch: () => {
        source.requests += 1;
        return source.served === null ? Promise.reject(new Error(UPSTREAM_FAULT)) : Promise.resolve(new Response(source.served));
      },
    },
  });
}

function loggedCauses(root: ServerTestHarness): number {
  return root.observability
    .logLines(LOG_SCAN_LIMIT)
    .map((line) => logRecordSchema.parse(JSON.parse(line)))
    .filter((record) => record.level === "warn" && record.err?.message.includes(UPSTREAM_FAULT) === true).length;
}

// The owner installs version 1.0.0 from the address, so the plugin row remembers it, then the source serves 1.1.0.
async function installFromSource(
  root: ServerTestHarness,
  source: PluginSource,
): Promise<{ readonly pluginId: PluginView["id"]; readonly nextHash: PluginBundleHash }> {
  const owner = await root.internalCallerFor(root.ownerId);
  source.served = makePluginBundle(manifest("1.0.0"), SOURCE, root.clock.now());
  const { bundleHash } = await owner.plugin.previewFromUrl({ url: BUNDLE_URL });
  const installed = await owner.plugin.installFromUrl({ url: BUNDLE_URL, expectedBundleHash: bundleHash, grant: [] });
  source.served = makePluginBundle(manifest("1.1.0"), SOURCE, root.clock.now());
  const next = await owner.plugin.previewFromUrl({ url: BUNDLE_URL });
  return { pluginId: installed.id, nextHash: next.bundleHash };
}

test("a stranger's upgrade of another owner's plugin is refused before the server fetches its stored address; the owner's upgrade fetches it", async () => {
  const source: PluginSource = { served: null, requests: 0 };
  await using root = await rootWithSource(source);
  const { pluginId, nextHash } = await installFromSource(root, source);
  const stranger = await root.internalCallerFor((await root.actor()).id);
  const sent = source.requests;

  await expect(stranger.plugin.upgradeFromStoredUrl({ pluginId, expectedBundleHash: nextHash })).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(source.requests).toBe(sent);

  const owner = await root.internalCallerFor(root.ownerId);
  expect(await owner.plugin.upgradeFromStoredUrl({ pluginId, expectedBundleHash: nextHash })).toMatchObject({ id: pluginId, version: "1.1.0" });
  expect(source.requests).toBe(sent + 1);
});

test("an upgrade whose stored address cannot be fetched is a BAD_REQUEST, and the log keeps its cause once", async () => {
  const source: PluginSource = { served: null, requests: 0 };
  await using root = await rootWithSource(source);
  const { pluginId, nextHash } = await installFromSource(root, source);
  source.served = null;
  expect(loggedCauses(root)).toBe(0);

  const owner = await root.internalCallerFor(root.ownerId);
  await expect(owner.plugin.upgradeFromStoredUrl({ pluginId, expectedBundleHash: nextHash })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(loggedCauses(root)).toBe(1);
});
