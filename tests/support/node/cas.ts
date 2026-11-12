// The content store a root writes, opened from the record's `ASSETS_DIR` through the production factory, so a
// suite can age or remove a blob: a blob's mtime and presence are filesystem facts no injected clock moves.

import { readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createCas } from "@orb/server/infra/storage/cas";
import type { ServerTestHarness } from "./server.ts";

export function casOf(root: Pick<ServerTestHarness, "env" | "logger">): ReturnType<typeof createCas> {
  return createCas(root.env.ASSETS_DIR, root.logger);
}

// Every file under the store root with its size, by path.
async function storedFiles(dir: string): Promise<ReadonlyMap<string, number>> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name));
  return new Map(await Promise.all(files.map(async (path): Promise<[string, number]> => [path, (await stat(path)).size])));
}

/**
 * Run one store of `bytes`, then overwrite the blob file it wrote with `damaged`: a blob that rots or is cut short on
 * disk after a valid store, which sync tools and antivirus on a native install can cause. The disk is the external
 * edge, so the file is found by listing the store root before and after the store, never by the store's layout; when
 * the store wrote more than one file, the blob is the one whose size equals the stored bytes.
 */
export async function storeThenDamageBlob<T>(
  root: Pick<ServerTestHarness, "env">,
  bytes: Uint8Array,
  store: () => Promise<T>,
  damaged: Uint8Array,
): Promise<T> {
  const before = await storedFiles(root.env.ASSETS_DIR);
  const stored = await store();
  const written = [...(await storedFiles(root.env.ASSETS_DIR))].filter(([path]) => !before.has(path));
  const blob = written.length === 1 ? written[0] : written.find(([, size]) => size === bytes.byteLength);
  if (blob === undefined) {
    throw new Error(`the store wrote ${String(written.length)} new files, none of them the stored blob`);
  }
  await writeFile(blob[0], damaged);
  return stored;
}
