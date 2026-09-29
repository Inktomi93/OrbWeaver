// Runtime packer for the two directory install doors. It reads only the admitted built entries and hands
// the resulting zip to the one bundle validator; it never compiles or executes repository source.

import { constants } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { lstat, open, readdir } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
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

// Node exposes no portable openat(2). Linux's procfs descriptor namespace gives this dev-only caller-selected
// path a kernel-anchored traversal; other platforms fail closed rather than falling back to a racy pathname.
const FILE_DESCRIPTOR_ROOT = process.platform === "linux" ? "/proc/self/fd" : null;

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

function isNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isNoFollowRefusal(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ELOOP";
}

function isDirectoryRefusal(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error.code === "ELOOP" || error.code === "ENOTDIR");
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

function descriptorOpenFlags(): number {
  if (FILE_DESCRIPTOR_ROOT === null || !("O_NOFOLLOW" in constants) || !("O_DIRECTORY" in constants)) {
    throw new Error("secure unpacked plugin loading is unavailable on this platform");
  }
  // biome-ignore lint/suspicious/noBitwiseOperators: open(2) requires the bitwise union of directory flags.
  return constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_DIRECTORY;
}

function descriptorPath(directory: FileHandle, entry?: string): string {
  if (FILE_DESCRIPTOR_ROOT === null) {
    throw new Error("secure unpacked plugin loading is unavailable on this platform");
  }
  return entry === undefined ? `${FILE_DESCRIPTOR_ROOT}/${directory.fd}` : `${FILE_DESCRIPTOR_ROOT}/${directory.fd}/${entry}`;
}

async function openPinnedDirectory(path: string, label: string): Promise<FileHandle> {
  let handle: FileHandle;
  try {
    handle = await open(path, descriptorOpenFlags());
  } catch (error) {
    if (isDirectoryRefusal(error)) {
      throw new Error(`plugin source ${label} must be a real directory`, { cause: error });
    }
    throw error;
  }
  try {
    const info = await handle.stat();
    if (info.isDirectory()) {
      return handle;
    }
    throw new Error(`plugin source ${label} must be a directory`);
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function openOptionalPinnedDirectory(parent: FileHandle, name: string, label: string): Promise<FileHandle | null> {
  try {
    return await openPinnedDirectory(descriptorPath(parent, name), label);
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }
}

async function readPinnedEntry(directory: FileHandle, name: string, entry: string, maxBytes: number): Promise<Uint8Array> {
  let handle: FileHandle;
  try {
    // biome-ignore lint/suspicious/noBitwiseOperators: open(2) requires the bitwise union of file flags.
    handle = await open(descriptorPath(directory, name), constants.O_RDONLY | constants.O_NOFOLLOW);
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

async function readOptionalPinnedEntry(directory: FileHandle, name: string, entry: string, maxBytes: number): Promise<Uint8Array | null> {
  try {
    return await readPinnedEntry(directory, name, entry, maxBytes);
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }
}

async function readPinnedAssets(root: FileHandle): Promise<{ path: string; bytes: Uint8Array }[]> {
  const ui = await openOptionalPinnedDirectory(root, "ui", "ui directory");
  if (ui === null) {
    return [];
  }
  try {
    const assetsDirectory = await openOptionalPinnedDirectory(ui, "assets", PLUGIN_UI_ASSETS_DIR);
    if (assetsDirectory === null) {
      return [];
    }
    try {
      const names = (await readdir(descriptorPath(assetsDirectory), { withFileTypes: true }))
        .map((entry) => entry.name)
        .filter((name) => PLUGIN_UI_ASSET_ENTRY_RE.test(`${PLUGIN_UI_ASSETS_DIR}${name}`))
        .sort();
      if (names.length > PLUGIN_UI_ASSETS_MAX_COUNT) {
        throw new Error(`plugin source carries more than ${PLUGIN_UI_ASSETS_MAX_COUNT} ${PLUGIN_UI_ASSETS_DIR} entries`);
      }
      const assets: { path: string; bytes: Uint8Array }[] = [];
      let totalBytes = 0;
      for (const name of names) {
        const path = `${PLUGIN_UI_ASSETS_DIR}${name}`;
        const bytes = await readPinnedEntry(assetsDirectory, name, path, PLUGIN_UI_ASSET_MAX_BYTES);
        totalBytes += bytes.byteLength;
        if (totalBytes > PLUGIN_UI_ASSETS_TOTAL_MAX_BYTES) {
          throw new Error(`plugin source assets exceed the ${PLUGIN_UI_ASSETS_TOTAL_MAX_BYTES}-byte total cap`);
        }
        assets.push({ path, bytes });
      }
      return assets;
    } finally {
      await assetsDirectory.close();
    }
  } finally {
    await ui.close();
  }
}

/** Pack a caller-selected local source while every lookup is rooted at an open directory descriptor. Root,
 * `ui`, and `ui/assets` remain pinned until their children are opened, so renames and symlink swaps cannot
 * redirect a later lookup outside the directory the local caller selected. Unsupported platforms fail closed. */
export async function packPluginDir(directory: string): Promise<Uint8Array> {
  const root = await openPinnedDirectory(directory, "root");
  try {
    const required = await Promise.all([
      readPinnedEntry(root, PLUGIN_MANIFEST_ENTRY, PLUGIN_MANIFEST_ENTRY, PLUGIN_MANIFEST_ENTRY_MAX_BYTES),
      readPinnedEntry(root, PLUGIN_MAIN_ENTRY, PLUGIN_MAIN_ENTRY, PLUGIN_SCRIPT_ENTRY_MAX_BYTES),
    ]);
    const uiSource = await readOptionalPinnedEntry(root, PLUGIN_UI_ENTRY, PLUGIN_UI_ENTRY, PLUGIN_SCRIPT_ENTRY_MAX_BYTES);
    return packEntries(required, uiSource, await readPinnedAssets(root));
  } finally {
    await root.close();
  }
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
