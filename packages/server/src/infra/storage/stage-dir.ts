// stageDirectory — adapt an ALREADY-STAGED, already-validated directory tree on disk into the same
// `StagedArchive` contract `extractZip` yields, so the entity-agnostic bundle importer (`importStagedArchive`)
// can consume a folder upload exactly as it consumes an extracted zip. This is NOT a trust boundary: the
// folder-import HTTP route sanitizes every relative path + writes the files itself (fresh dir, O_EXCL |
// O_NOFOLLOW), so by the time this walks the tree the bytes are ours. Reads still go through O_NOFOLLOW as
// defense-in-depth, matching the zip staging reader.

import { constants as fsConstants } from "node:fs";
import { open, readdir, rm } from "node:fs/promises";
import { relative, sep } from "node:path";
import type { StagedArchive, StagedEntry } from "./zip.ts";

async function readNoFollow(path: string): Promise<Uint8Array> {
  // biome-ignore lint/suspicious/noBitwiseOperators: OR-ing POSIX open() flag bits is the intended API (same exemption zip.ts's staging reader carries).
  const handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const data = await handle.readFile();
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  } finally {
    await handle.close();
  }
}

/**
 * Walk `dir` recursively and present every regular file as a {@link StagedEntry} whose `path` is the
 * forward-slash relative path within `dir` (the bundle importer's routing key) and whose `read` lazily loads
 * the bytes off disk. `dispose()` removes `dir` (the workload owns cleanup, mirroring the zip staging path).
 */
export async function stageDirectory(dir: string): Promise<StagedArchive> {
  const dirents = await readdir(dir, { recursive: true, withFileTypes: true });
  const entries: StagedEntry[] = [];
  for (const dirent of dirents) {
    if (!dirent.isFile()) {
      continue;
    }
    const absolute = `${dirent.parentPath}${sep}${dirent.name}`;
    const rel = relative(dir, absolute).split(sep).join("/");
    entries.push({ path: rel, read: () => readNoFollow(absolute) });
  }
  return {
    entries,
    dispose: (): Promise<void> => rm(dir, { recursive: true, force: true }),
  };
}
