// Guarded Git transport for plugin distribution. Every smart-HTTP request rides safeFetch, so redirects are
// revalidated hop by hop and private/IP-literal destinations never reach the network.

import type { Dirent, Stats } from "node:fs";
import { promises as fs } from "node:fs";
import { lstat, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import {
  PLUGIN_MAIN_ENTRY,
  PLUGIN_MANIFEST_ENTRY,
  PLUGIN_MANIFEST_ENTRY_MAX_BYTES,
  PLUGIN_SCRIPT_ENTRY_MAX_BYTES,
  PLUGIN_UI_ASSET_ENTRY_RE,
  PLUGIN_UI_ASSET_MAX_BYTES,
  PLUGIN_UI_ASSETS_MAX_COUNT,
  PLUGIN_UI_ASSETS_TOTAL_MAX_BYTES,
  PLUGIN_UI_ENTRY,
} from "@orb/contracts/plugin";
import type { GitHttpRequest, GitHttpResponse, HttpClient, TreeEntry } from "isomorphic-git";
import { clone, listServerRefs, readBlob, readTree, resolveRef } from "isomorphic-git";
import { packPreparedPluginDir } from "../plugin-source/pack-plugin-dir.ts";
import { ANY_HOST, safeFetch } from "./egress.ts";

const GIT_HTTP_MAX_BYTES = 5_000_000;
const GIT_BODY_MAX_BYTES = 5_000_000;
const GIT_SCRATCH_MAX_BYTES = 15_000_000;
const GIT_SCRATCH_MAX_ENTRIES = 1024;
const OID_RE = /^[0-9a-f]{40}$/u;

function assertSafeGitSourceUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (cause) {
    throw new Error("Git repository URL is invalid", { cause });
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Git repository URL must use HTTPS");
  }
  if (parsed.username !== "" || parsed.password !== "") {
    // isomorphic-git converts URL userinfo into a Basic Authorization header before invoking HttpClient.
    // Refuse at this outer boundary so credentials never enter the library or a redirect chain.
    throw new Error("Git repository URL cannot include credentials");
  }
}

async function collectRequestBody(body: AsyncIterableIterator<Uint8Array> | undefined): Promise<Uint8Array | undefined> {
  if (body === undefined) {
    return;
  }
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of body) {
    length += chunk.byteLength;
    if (length > GIT_BODY_MAX_BYTES) {
      throw new Error(`Git request body exceeds the ${GIT_BODY_MAX_BYTES}-byte cap`);
    }
    chunks.push(chunk);
  }
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

function responseBody(bytes: Uint8Array): AsyncIterableIterator<Uint8Array> {
  return Readable.from([bytes])[Symbol.asyncIterator]();
}

async function requestGitHttp(request: GitHttpRequest): Promise<GitHttpResponse> {
  const method = request.method ?? "GET";
  if (method !== "GET" && method !== "POST") {
    throw new Error(`unsupported Git HTTP method ${method}`);
  }
  const body = await collectRequestBody(request.body);
  const response = await safeFetch(request.url, {
    allowedHosts: ANY_HOST,
    method,
    ...(request.headers === undefined ? {} : { headers: request.headers }),
    ...(body === undefined ? {} : { body }),
    ...(request.signal === undefined ? {} : { signal: request.signal }),
    maxBytes: GIT_HTTP_MAX_BYTES,
  });
  const bytes = await response.bytes();
  return {
    url: response.url === undefined || response.url === "" ? request.url : response.url,
    method,
    headers: Object.fromEntries(response.headers.entries()),
    body: responseBody(bytes),
    statusCode: response.status,
    statusMessage: "",
  };
}

export const guardedGitHttp: HttpClient = { request: requestGitHttp };

export interface PluginGitSource {
  readonly clone: (url: string) => Promise<{ readonly bundle: Uint8Array; readonly commit: string }>;
  readonly head: (url: string) => Promise<string>;
}

export interface PluginGitSourceDeps {
  readonly makeScratch: () => Promise<string>;
  readonly removeScratch: (directory: string) => Promise<void>;
  readonly cloneInto: (directory: string, url: string) => Promise<void>;
  readonly resolveHead: (directory: string) => Promise<string>;
  readonly packDirectory: (directory: string) => Promise<Uint8Array>;
  readonly readRemoteHead: (url: string) => Promise<string>;
}

function assertRegularBlob(entry: TreeEntry | undefined, path: string, required: boolean): boolean {
  if (entry === undefined) {
    if (required) {
      throw new Error(`Git plugin source has no ${path}`);
    }
    return false;
  }
  if (entry.type !== "blob" || (entry.mode !== "100644" && entry.mode !== "100755")) {
    throw new Error(`Git plugin source entry ${path} must be a regular file`);
  }
  return true;
}

interface ScratchBudget {
  bytes: number;
  entries: number;
}

async function inspectScratchEntry(current: string, entry: Dirent, pending: string[], budget: ScratchBudget): Promise<void> {
  budget.entries += 1;
  if (budget.entries > GIT_SCRATCH_MAX_ENTRIES) {
    throw new Error(`Git scratch tree exceeds the ${GIT_SCRATCH_MAX_ENTRIES}-entry cap`);
  }
  const path = join(current, entry.name);
  const info: Stats = await lstat(path);
  if (info.isSymbolicLink()) {
    throw new Error("Git scratch tree contains a symbolic link");
  }
  if (info.isDirectory()) {
    pending.push(path);
    return;
  }
  if (!info.isFile()) {
    throw new Error("Git scratch tree contains a non-file entry");
  }
  budget.bytes += info.size;
  if (budget.bytes > GIT_SCRATCH_MAX_BYTES) {
    throw new Error(`Git scratch tree exceeds the ${GIT_SCRATCH_MAX_BYTES}-byte cap`);
  }
}

async function assertScratchBudget(directory: string): Promise<void> {
  const pending = [directory];
  const budget: ScratchBudget = { bytes: 0, entries: 0 };
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) {
      break;
    }
    for (const entry of await readdir(current, { withFileTypes: true })) {
      await inspectScratchEntry(current, entry, pending, budget);
    }
  }
}

function entryCap(path: string): number {
  if (path === PLUGIN_MANIFEST_ENTRY) {
    return PLUGIN_MANIFEST_ENTRY_MAX_BYTES;
  }
  if (path === PLUGIN_MAIN_ENTRY || path === PLUGIN_UI_ENTRY) {
    return PLUGIN_SCRIPT_ENTRY_MAX_BYTES;
  }
  return PLUGIN_UI_ASSET_MAX_BYTES;
}

async function collectPluginEntryPaths(directory: string, commit: string, root: readonly TreeEntry[], cache: object): Promise<string[]> {
  const rootEntry = (path: string): TreeEntry | undefined => root.find((entry) => entry.path === path);
  const paths = [PLUGIN_MANIFEST_ENTRY, PLUGIN_MAIN_ENTRY];
  assertRegularBlob(rootEntry(PLUGIN_MANIFEST_ENTRY), PLUGIN_MANIFEST_ENTRY, true);
  assertRegularBlob(rootEntry(PLUGIN_MAIN_ENTRY), PLUGIN_MAIN_ENTRY, true);
  if (assertRegularBlob(rootEntry(PLUGIN_UI_ENTRY), PLUGIN_UI_ENTRY, false)) {
    paths.push(PLUGIN_UI_ENTRY);
  }

  const ui = rootEntry("ui");
  if (ui !== undefined) {
    if (ui.type !== "tree") {
      throw new Error("Git plugin source ui entry must be a directory");
    }
    const uiTree = await readTree({ fs, dir: directory, oid: commit, filepath: "ui", cache });
    const assets = uiTree.tree.find((entry) => entry.path === "assets");
    if (assets !== undefined) {
      if (assets.type !== "tree") {
        throw new Error("Git plugin source ui/assets entry must be a directory");
      }
      const assetsTree = await readTree({ fs, dir: directory, oid: commit, filepath: "ui/assets", cache });
      const admitted = assetsTree.tree.filter((entry) => PLUGIN_UI_ASSET_ENTRY_RE.test(`ui/assets/${entry.path}`));
      if (admitted.length > PLUGIN_UI_ASSETS_MAX_COUNT) {
        throw new Error(`Git plugin source carries more than ${PLUGIN_UI_ASSETS_MAX_COUNT} ui/assets entries`);
      }
      for (const entry of admitted) {
        const path = `ui/assets/${entry.path}`;
        assertRegularBlob(entry, path, true);
        paths.push(path);
      }
    }
  }

  return paths;
}

async function writePluginEntries(directory: string, commit: string, paths: readonly string[], cache: object): Promise<void> {
  let assetBytes = 0;
  for (const path of paths) {
    const { blob } = await readBlob({ fs, dir: directory, oid: commit, filepath: path, cache });
    const cap = entryCap(path);
    if (blob.byteLength > cap) {
      throw new Error(`Git plugin source entry ${path} exceeds its ${cap}-byte cap`);
    }
    if (PLUGIN_UI_ASSET_ENTRY_RE.test(path)) {
      assetBytes += blob.byteLength;
      if (assetBytes > PLUGIN_UI_ASSETS_TOTAL_MAX_BYTES) {
        throw new Error(`Git plugin source assets exceed the ${PLUGIN_UI_ASSETS_TOTAL_MAX_BYTES}-byte total cap`);
      }
    }
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await writeFile(join(directory, path), blob);
  }
}

/** Materialize only the closed plugin-entry set from a no-checkout clone. Unrelated blobs remain compressed
 * in the bounded object store; admitted blobs are size-checked before any worktree write. */
export async function materializePluginGitEntries(directory: string, cache: object = {}): Promise<void> {
  await assertScratchBudget(directory);
  const commit = await resolveRef({ fs, dir: directory, ref: "HEAD" });
  const root = await readTree({ fs, dir: directory, oid: commit, cache });
  const paths = await collectPluginEntryPaths(directory, commit, root.tree, cache);
  await writePluginEntries(directory, commit, paths, cache);
}

export function createPluginGitSource(deps: PluginGitSourceDeps): PluginGitSource {
  return {
    clone: async (url): Promise<{ readonly bundle: Uint8Array; readonly commit: string }> => {
      assertSafeGitSourceUrl(url);
      const directory = await deps.makeScratch();
      try {
        await deps.cloneInto(directory, url);
        const commit = await deps.resolveHead(directory);
        if (!OID_RE.test(commit)) {
          throw new Error("Git clone produced an invalid HEAD commit");
        }
        return { bundle: await deps.packDirectory(directory), commit };
      } finally {
        await deps.removeScratch(directory);
      }
    },
    head: async (url): Promise<string> => {
      assertSafeGitSourceUrl(url);
      const commit = await deps.readRemoteHead(url);
      if (!OID_RE.test(commit)) {
        throw new Error("Git remote produced an invalid HEAD commit");
      }
      return commit;
    },
  };
}

export const pluginGitSource = createPluginGitSource({
  makeScratch: () => mkdtemp(join(tmpdir(), "orb-plugin-git-")),
  removeScratch: (directory) => rm(directory, { recursive: true, force: true }),
  cloneInto: async (directory, url) => {
    // One cache keeps the patched pack-index resolution budget cumulative across every post-clone admitted
    // tree/blob read. A fresh cache per call would reset that aggregate resource wall.
    const cache = {};
    await clone({ fs, http: guardedGitHttp, dir: directory, url, depth: 1, singleBranch: true, noCheckout: true, noTags: true, cache });
    await materializePluginGitEntries(directory, cache);
  },
  resolveHead: (directory) => resolveRef({ fs, dir: directory, ref: "HEAD" }),
  packDirectory: packPreparedPluginDir,
  readRemoteHead: async (url) => {
    const refs = await listServerRefs({ http: guardedGitHttp, url, prefix: "HEAD", symrefs: true, protocolVersion: 1 });
    const head = refs.find((ref) => ref.ref === "HEAD");
    if (head === undefined) {
      throw new Error("Git remote did not advertise HEAD");
    }
    return head.oid;
  },
});
