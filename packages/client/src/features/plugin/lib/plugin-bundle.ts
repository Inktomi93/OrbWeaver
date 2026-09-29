// plugin-bundle — the client's PREVIEW read of an upload: the bytes the user picked, unzipped far enough
// to show them the manifest they are about to consent to.
//
// THIS IS NOT A TRUST BOUNDARY, and the distinction is the whole reason this file is allowed to exist.
// The authoritative parse is `domain/plugin/substrate/manifest.ts::parseBundle` — the hardened funnel that
// runs on the untrusted bytes server-side (strict two-entry allow-list, decompression-bomb caps checked
// from the zip header pre-alloc, `pluginManifestSchema`), and it runs again on the SAME bytes this surface
// uploads. Nothing here can widen what installs: a bundle this preview mis-reads is refused by the server,
// and a bundle this preview refuses never reaches it. What the preview buys is CONSENT — the grant screen
// cannot ask "which of these capabilities do you allow?" without first showing the DECLARED list, and no
// server verb projects a declared list from un-installed bytes.
//
// The two halves are deliberately asymmetric about WHAT they re-spell:
//   · the SCHEMA is not re-spelled — `pluginManifestSchema` is imported from `@orb/contracts/plugin`, the
//     ONE home, so the preview and server share the STRUCTURAL verdict (including the netHosts ⟺ net.fetch
//     biconditional, which is the SSRF allowlist's integrity). The server then layers its lifecycle
//     compatibility check against `PLUGIN_HOST_VERSIONS`, producing `HostVersionUnservedError` for a
//     well-formed future major; this preview is not an install-authority substitute;
//   · the UNZIP is a second, DELIBERATELY SIMPLER read (`fflate`, the same engine the server uses). It
//     carries the bundle + entry byte caps so a bomb cannot be inflated in the user's TAB, but it does not
//     re-implement the server's pre-alloc header filter — that belt guards the HOST, and the host is not
//     what runs this code. If the funnel ever moves to a shared home below the cake (`@orb/contracts`, the
//     only package both the domain and the client can reach), this file collapses into one import; that
//     lift is recorded, not done here, because the funnel is security-owned code.
//
// It never reads `main.js`. The guest source is bytes the client has no business touching — it uploads the
// zip verbatim, and the preview's whole job is the metadata half.

import type { PluginManifest } from "@orb/contracts/plugin";
import {
  PLUGIN_BUNDLE_MAX_BYTES,
  PLUGIN_MAIN_ENTRY,
  PLUGIN_MANIFEST_ENTRY,
  PLUGIN_MANIFEST_ENTRY_MAX_BYTES,
  PLUGIN_SCRIPT_ENTRY_MAX_BYTES,
  PLUGIN_UI_ASSET_ENTRY_RE,
  PLUGIN_UI_ASSET_MAX_BYTES,
  PLUGIN_UI_ASSETS_MAX_COUNT,
  PLUGIN_UI_ASSETS_TOTAL_MAX_BYTES,
  PLUGIN_UI_ENTRY,
  pluginManifestSchema,
} from "@orb/contracts/plugin";
import { unzipSync, zipSync } from "fflate";
import { z } from "zod";

/** Mirrors the funnel's decompressed `manifest.json` cap. */
const MANIFEST_MAX_BYTES = PLUGIN_MANIFEST_ENTRY_MAX_BYTES;
const MANIFEST_ENTRY = PLUGIN_MANIFEST_ENTRY;
const MAIN_ENTRY = PLUGIN_MAIN_ENTRY;

/** A preview failure, already phrased for the person holding the file. */
export class PluginBundlePreviewError extends Error {}

/** What the grant screen renders: the manifest the user is consenting to, plus the raw bytes to upload. */
export interface PluginBundlePreview {
  readonly manifest: PluginManifest;
  /** The untouched zip — what `install`/`upgrade` send, base64-encoded at the call site. */
  readonly bytes: Uint8Array;
}

const BUNDLE_MTIME_MS = 331_257_600_000;

function selectedFolderPath(file: File): { readonly root: string | null; readonly path: string } | null {
  const relative = Reflect.get(file, "webkitRelativePath");
  if (typeof relative !== "string" || relative.length === 0) {
    return { root: null, path: file.name };
  }
  if (relative.includes("\\")) {
    return null;
  }
  const segments = relative.split("/");
  if (segments.length < 2 || segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return null;
  }
  const [root, ...entrySegments] = segments;
  return root === undefined ? null : { root, path: entrySegments.join("/") };
}

function entryCap(path: string): number | null {
  if (path === MANIFEST_ENTRY) {
    return PLUGIN_MANIFEST_ENTRY_MAX_BYTES;
  }
  if (path === MAIN_ENTRY || path === PLUGIN_UI_ENTRY) {
    return PLUGIN_SCRIPT_ENTRY_MAX_BYTES;
  }
  return PLUGIN_UI_ASSET_ENTRY_RE.test(path) ? PLUGIN_UI_ASSET_MAX_BYTES : null;
}

interface FolderSelection {
  readonly assetBytes: number;
  readonly assetCount: number;
  readonly root: string | null | undefined;
}

function admitFolderFile(selected: Map<string, File>, file: File, selection: FolderSelection): FolderSelection {
  const selectedPath = selectedFolderPath(file);
  if (selectedPath === null) {
    return selection;
  }
  const cap = entryCap(selectedPath.path);
  if (cap === null) {
    return selection;
  }
  if (selection.root !== undefined && selection.root !== selectedPath.root) {
    throw new PluginBundlePreviewError("Choose one plugin source folder at a time.");
  }
  if (selected.has(selectedPath.path)) {
    throw new PluginBundlePreviewError(`That folder contains more than one ${selectedPath.path} entry.`);
  }
  if (file.size > cap) {
    throw new PluginBundlePreviewError(`That folder's ${selectedPath.path} exceeds its ${cap}-byte cap.`);
  }

  let { assetBytes, assetCount } = selection;
  if (PLUGIN_UI_ASSET_ENTRY_RE.test(selectedPath.path)) {
    assetCount += 1;
    assetBytes += file.size;
    if (assetCount > PLUGIN_UI_ASSETS_MAX_COUNT || assetBytes > PLUGIN_UI_ASSETS_TOTAL_MAX_BYTES) {
      throw new PluginBundlePreviewError("That folder carries too many or too-large ui/assets files.");
    }
  }
  selected.set(selectedPath.path, file);
  return { assetBytes, assetCount, root: selectedPath.root };
}

/** Pack a browser-selected folder into the one bundle shape the server judges. Files outside the admitted
 * root entries are ignored; traversal, nested assets and platform separators cannot match the closed names.
 * @public Test-anchored module surface; tests/client/features/plugin/lib/plugin-bundle.dom.test.ts calls
 * it directly. */
export async function packPluginFolder(files: readonly File[]): Promise<Uint8Array> {
  const selected = new Map<string, File>();
  let selection: FolderSelection = { assetBytes: 0, assetCount: 0, root: undefined };
  for (const file of files) {
    selection = admitFolderFile(selected, file, selection);
  }

  const entries: Record<string, [Uint8Array, { mtime: number }]> = {};
  for (const [path, file] of [...selected].sort(([a], [b]) => a.localeCompare(b))) {
    entries[path] = [new Uint8Array(await file.arrayBuffer()), { mtime: BUNDLE_MTIME_MS }];
  }
  let bytes: Uint8Array;
  try {
    bytes = zipSync(entries);
  } catch (cause) {
    throw new PluginBundlePreviewError("That folder couldn't be packed as a plugin bundle.", { cause });
  }
  if (bytes.byteLength > PLUGIN_BUNDLE_MAX_BYTES) {
    throw new PluginBundlePreviewError("That folder packs to more than the 1 MB plugin bundle limit.");
  }
  return bytes;
}

/** Decode a `manifest.json` entry's bytes, refusing a lying/oversized entry the same way the funnel does. */
function decodeManifestEntry(bytes: Uint8Array): unknown {
  if (bytes.byteLength > MANIFEST_MAX_BYTES) {
    throw new PluginBundlePreviewError("That bundle's manifest.json is too large to be a plugin manifest.");
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (cause) {
    throw new PluginBundlePreviewError("That bundle's manifest.json isn't valid JSON.", { cause });
  }
}

/** Unzip + validate far enough to show the manifest. Every failure is a `PluginBundlePreviewError` whose
 *  message is host copy — the server re-runs the real gate on the same bytes regardless. */
export async function readPluginBundle(file: File): Promise<PluginBundlePreview> {
  if (file.size > PLUGIN_BUNDLE_MAX_BYTES) {
    throw new PluginBundlePreviewError("A plugin bundle must be 1 MB or smaller.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  return previewPluginBundleBytes(bytes);
}

/** Pack and preview a browser-selected plugin source folder. The server re-runs the authoritative funnel on
 * these exact bytes during install. */
export async function readPluginFolder(files: readonly File[]): Promise<PluginBundlePreview> {
  return previewPluginBundleBytes(await packPluginFolder(files));
}

function previewPluginBundleBytes(bytes: Uint8Array): PluginBundlePreview {
  if (bytes.byteLength === 0) {
    throw new PluginBundlePreviewError("That file is empty.");
  }

  let entries: Record<string, Uint8Array>;
  try {
    // The filter is the preview's own bomb bound: an entry that CLAIMS to be larger than its cap is never
    // inflated, and an entry outside the two-name allow-list is never inflated either.
    entries = unzipSync(bytes, {
      filter: (entry) =>
        (entry.name === MANIFEST_ENTRY && entry.originalSize <= MANIFEST_MAX_BYTES) ||
        (entry.name === MAIN_ENTRY && entry.originalSize <= PLUGIN_BUNDLE_MAX_BYTES),
    });
  } catch (cause) {
    throw new PluginBundlePreviewError("That file isn't a readable .zip bundle.", { cause });
  }

  const manifestBytes = entries[MANIFEST_ENTRY];
  if (manifestBytes === undefined) {
    throw new PluginBundlePreviewError("That bundle has no manifest.json. A plugin bundle is a .zip holding manifest.json and main.js.");
  }
  if (entries[MAIN_ENTRY] === undefined) {
    throw new PluginBundlePreviewError("That bundle has no main.js. A plugin bundle is a .zip holding manifest.json and main.js.");
  }

  const parsed = pluginManifestSchema.safeParse(decodeManifestEntry(manifestBytes));
  if (!parsed.success) {
    // `prettifyError`, not a hand-flattened `issues[0].message`: the PATH is what makes a manifest refusal
    // actionable ("capabilities" vs "netHosts" vs "version"), and a hand-flatten drops it.
    throw new PluginBundlePreviewError(`That manifest isn't valid.\n${z.prettifyError(parsed.error)}`);
  }
  return { manifest: parsed.data, bytes };
}

/** The spread width of the base64 walk — small enough that `String.fromCharCode(...chunk)` stays inside the
 *  engine's argument limit for a 1 MiB bundle. */
const BASE64_CHUNK_BYTES = 32_768;

/** The upload encoding the `install`/`upgrade` mutations take (`bundleBase64`). Chunked so a 1 MiB bundle
 *  cannot blow the argument limit of `String.fromCharCode(...spread)`. */
export function toBundleBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_BYTES) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK_BYTES));
  }
  return btoa(binary);
}
