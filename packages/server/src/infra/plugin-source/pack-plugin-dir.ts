// Runtime packer for a private Git materialization. It reads only the admitted built entries and hands
// the resulting zip to the one bundle validator; it never compiles or executes repository source.

import { constants } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { lstat, open, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  PLUGIN_BUNDLE_MAX_BYTES,
  PLUGIN_MAIN_ENTRY,
  PLUGIN_MANIFEST_ENTRY,
  PLUGIN_MANIFEST_ENTRY_MAX_BYTES,
  PLUGIN_SCRIPT_ENTRY_MAX_BYTES,
  PLUGIN_UI_ASSET_ENTRY_RE,
  PLUGIN_UI_ASSET_MAX_BYTES,
  PLUGIN_UI_ASSETS_DIR,
  PLUGIN_UI_ASSETS_MAX_COUNT,
  PLUGIN_UI_ASSETS_TOTAL_MAX_BYTES,
  PLUGIN_UI_ENTRY,
} from "@orb/contracts/plugin";
import { zipSync } from "fflate";

const BUNDLE_MTIME_MS = 331_257_600_000;

async function readOptionalPathEntry(directory: string, entry: string, maxBytes: number): Promise<Uint8Array | null> {
  try {
    return await readPathEntry(directory, entry, maxBytes);
  } catch (error) {
    if (isMissing(error)) {
      return null;
    }
    throw error;
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR");
}

function isNoFollowRefusal(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ELOOP";
}

async function readBoundedFile(handle: FileHandle, entry: string, maxBytes: number): Promise<Uint8Array> {
  const buffer = Buffer.allocUnsafe(maxBytes + 1);
  let length = 0;
  while (length < buffer.byteLength) {
    const { bytesRead } = await handle.read(buffer, length, buffer.byteLength - length, null);
    if (bytesRead === 0) {
      break;
    }
    length += bytesRead;
  }
  if (length > maxBytes) {
    throw new Error(`plugin source entry ${entry} exceeds its ${maxBytes}-byte cap`);
  }
  return new Uint8Array(buffer.subarray(0, length));
}

async function readPathEntry(directory: string, entry: string, maxBytes: number): Promise<Uint8Array> {
  const path = join(directory, entry);
  let handle: FileHandle;
  try {
    // biome-ignore lint/suspicious/noBitwiseOperators: open(2) requires the bitwise union of file flags.
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (isNoFollowRefusal(error)) {
      throw new Error(`plugin source entry ${entry} must be a regular file`, { cause: error });
    }
    throw error;
  }
  try {
    const info = await handle.stat();
    if (!info.isFile()) {
      throw new Error(`plugin source entry ${entry} must be a regular file`);
    }
    if (info.size > maxBytes) {
      throw new Error(`plugin source entry ${entry} exceeds its ${maxBytes}-byte cap`);
    }
    return await readBoundedFile(handle, entry, maxBytes);
  } finally {
    await handle.close();
  }
}

async function readPathAssetNames(directory: string): Promise<string[]> {
  const uiDir = join(directory, "ui");
  try {
    const info = await lstat(uiDir);
    if (info.isSymbolicLink()) {
      throw new Error("plugin source ui directory must not be a symbolic link");
    }
    if (!info.isDirectory()) {
      return [];
    }
  } catch (error) {
    if (isMissing(error)) {
      return [];
    }
    throw error;
  }
  const dir = join(directory, PLUGIN_UI_ASSETS_DIR);
  let names: string[];
  try {
    const info = await lstat(dir);
    if (!info.isDirectory()) {
      throw new Error(`${PLUGIN_UI_ASSETS_DIR} must be a directory`);
    }
    names = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (!PLUGIN_UI_ASSET_ENTRY_RE.test(`${PLUGIN_UI_ASSETS_DIR}${entry.name}`)) {
        continue;
      }
      if (!entry.isFile()) {
        throw new Error(`plugin source entry ${PLUGIN_UI_ASSETS_DIR}${entry.name} must be a regular file`);
      }
      names.push(entry.name);
    }
  } catch (error) {
    if (isMissing(error)) {
      return [];
    }
    throw error;
  }
  return names.sort();
}

async function readPathAssets(directory: string): Promise<{ path: string; bytes: Uint8Array }[]> {
  const names = await readPathAssetNames(directory);
  if (names.length > PLUGIN_UI_ASSETS_MAX_COUNT) {
    throw new Error(`plugin source carries more than ${PLUGIN_UI_ASSETS_MAX_COUNT} ${PLUGIN_UI_ASSETS_DIR} entries`);
  }
  const assets: { path: string; bytes: Uint8Array }[] = [];
  let totalBytes = 0;
  for (const name of names) {
    const path = `${PLUGIN_UI_ASSETS_DIR}${name}`;
    const bytes = await readPathEntry(directory, path, PLUGIN_UI_ASSET_MAX_BYTES);
    totalBytes += bytes.byteLength;
    if (totalBytes > PLUGIN_UI_ASSETS_TOTAL_MAX_BYTES) {
      throw new Error(`plugin source assets exceed the ${PLUGIN_UI_ASSETS_TOTAL_MAX_BYTES}-byte total cap`);
    }
    assets.push({ path, bytes });
  }
  return assets;
}

function packEntries(
  required: readonly [Uint8Array, Uint8Array],
  uiSource: Uint8Array | null,
  assets: readonly { path: string; bytes: Uint8Array }[],
): Uint8Array {
  const entries: Record<string, [Uint8Array, { mtime: number }]> = {
    [PLUGIN_MANIFEST_ENTRY]: [required[0], { mtime: BUNDLE_MTIME_MS }],
    [PLUGIN_MAIN_ENTRY]: [required[1], { mtime: BUNDLE_MTIME_MS }],
  };
  if (uiSource !== null) {
    entries[PLUGIN_UI_ENTRY] = [uiSource, { mtime: BUNDLE_MTIME_MS }];
  }
  for (const asset of assets) {
    entries[asset.path] = [asset.bytes, { mtime: BUNDLE_MTIME_MS }];
  }
  const bundle = zipSync(entries);
  if (bundle.byteLength > PLUGIN_BUNDLE_MAX_BYTES) {
    throw new Error(`packed plugin bundle exceeds the ${PLUGIN_BUNDLE_MAX_BYTES}-byte cap`);
  }
  return bundle;
}

/** Pack a directory whose full tree is owned by this process rather than selected by a caller. The Git
 * adapter materializes admitted blobs into a private scratch directory before calling this path. */
export async function packPreparedPluginDir(directory: string): Promise<Uint8Array> {
  const required = await Promise.all([
    readPathEntry(directory, PLUGIN_MANIFEST_ENTRY, PLUGIN_MANIFEST_ENTRY_MAX_BYTES),
    readPathEntry(directory, PLUGIN_MAIN_ENTRY, PLUGIN_SCRIPT_ENTRY_MAX_BYTES),
  ]);
  return packEntries(required, await readOptionalPathEntry(directory, PLUGIN_UI_ENTRY, PLUGIN_SCRIPT_ENTRY_MAX_BYTES), await readPathAssets(directory));
}
