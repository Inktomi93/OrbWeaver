// Finite physical download responses retain production URL admission, bundle parsing and consent binding.
import { pluginManifestSchema } from "@orb/contracts/plugin";
import { CORPUS_PLUGIN_MANIFEST } from "./corpus-plugin.ts";
import { makePluginBundle } from "./factories/plugin.ts";
import type { ServerHarnessOptions, ServerTestHarness } from "./server.ts";

type PluginCaller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>["plugin"];

export interface CorpusPluginDownloads {
  readonly networkExecution: NonNullable<ServerHarnessOptions["networkExecution"]>;
  readonly enqueue: (bytes: Uint8Array, status?: number) => void;
  readonly remaining: () => number;
  readonly requested: readonly string[];
}

export interface CorpusPluginSource {
  readonly preview: Awaited<ReturnType<PluginCaller["previewFromUrl"]>>;
  readonly changedPreview: Awaited<ReturnType<PluginCaller["previewFromUrl"]>>;
  readonly installed: Awaited<ReturnType<PluginCaller["installFromUrl"]>>;
  readonly current: Awaited<ReturnType<PluginCaller["checkForUpdates"]>>;
  readonly offered: Awaited<ReturnType<PluginCaller["checkForUpdates"]>>;
  readonly unavailable: Awaited<ReturnType<PluginCaller["checkForUpdates"]>>;
  readonly malformed: Awaited<ReturnType<PluginCaller["checkForUpdates"]>>;
}

export const CORPUS_PLUGIN_SOURCE_URL = "https://plugins.example.test/ledger.zip";

/** An exhausted download script refuses; it cannot fall through to a live network request. */
export function createCorpusPluginDownloads(): CorpusPluginDownloads {
  const pending: { readonly bytes: Uint8Array; readonly status: number }[] = [];
  const requested: string[] = [];
  const execute: typeof fetch = (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url !== CORPUS_PLUGIN_SOURCE_URL) {
      return Promise.reject(new Error(`unscripted plugin download: ${url}`));
    }
    const next = pending.shift();
    if (next === undefined) {
      return Promise.reject(new Error("plugin download script exhausted"));
    }
    requested.push(url);
    return Promise.resolve(new Response(Uint8Array.from(next.bytes), { status: next.status, headers: { "content-type": "application/zip" } }));
  };
  return {
    networkExecution: { fetch: execute, resolver: (): Promise<readonly string[]> => Promise.resolve(["93.184.215.14"]) },
    enqueue: (bytes: Uint8Array, status = 200): void => {
      pending.push({ bytes, status });
    },
    remaining: (): number => pending.length,
    requested,
  };
}

/** Capture exact URL consent identities and update variants through the real parser and owner-scoped lifecycle. */
export async function seedCorpusPluginSource(root: ServerTestHarness, downloads: CorpusPluginDownloads): Promise<CorpusPluginSource> {
  const rpc = await root.internalCallerFor(root.ownerId);
  const firstBytes = makePluginBundle(CORPUS_PLUGIN_MANIFEST, "orb.host(1);", root.clock.now());
  const nextManifest = pluginManifestSchema.parse({ ...CORPUS_PLUGIN_MANIFEST, version: "2.0.0" });
  const nextBytes = makePluginBundle(nextManifest, "orb.host(1);", root.clock.now());
  downloads.enqueue(firstBytes);
  const preview = await rpc.plugin.previewFromUrl({ url: CORPUS_PLUGIN_SOURCE_URL });
  downloads.enqueue(firstBytes);
  const installed = await rpc.plugin.installFromUrl({ url: CORPUS_PLUGIN_SOURCE_URL, expectedBundleHash: preview.bundleHash, grant: [] });
  downloads.enqueue(firstBytes);
  const current = await rpc.plugin.checkForUpdates();
  downloads.enqueue(nextBytes);
  const offered = await rpc.plugin.checkForUpdates();
  downloads.enqueue(new Uint8Array([0]), 404);
  const unavailable = await rpc.plugin.checkForUpdates();
  downloads.enqueue(new Uint8Array([0]));
  const malformed = await rpc.plugin.checkForUpdates();
  downloads.enqueue(nextBytes);
  const changedPreview = await rpc.plugin.previewFromUrl({ url: CORPUS_PLUGIN_SOURCE_URL });
  return { preview, installed, current, offered, unavailable, malformed, changedPreview };
}
