// stageDirectory — adapt an ALREADY-STAGED, already-validated directory tree on disk into the same
// `StagedArchive` contract `extractZip` yields, so the entity-agnostic bundle importer (`importStagedArchive`)
// can consume a folder upload exactly as it consumes an extracted zip. The folder-import HTTP route sanitizes
// every relative path and writes the files itself. Reads stay bound to the directories held here (`held-dir.ts`).

import { rm } from "node:fs/promises";
import type { StagedArchive, StagedEntry } from "./contract.ts";
import type { HeldDirectory } from "./held-dir.ts";
import { holdChild, holdTree, listHeld, readHeldFile } from "./held-dir.ts";

/**
 * Walk `dir` and present every regular file as a {@link StagedEntry} whose `path` is the forward-slash relative path
 * within `dir` (the bundle importer's routing key) and whose `read` lazily loads the bytes off disk. `dispose()`
 * releases the held directories and removes `dir` (the workload owns cleanup, mirroring the zip staging path).
 */
export async function stageDirectory(dir: string): Promise<StagedArchive> {
  await using holds = new AsyncDisposableStack();
  const entries: StagedEntry[] = [];
  const walk = async (held: HeldDirectory | null, prefix: string): Promise<void> => {
    if (held === null) {
      return;
    }
    for (const dirent of await listHeld(held)) {
      const { name } = dirent;
      const path = `${prefix}${name}`;
      if (dirent.isFile()) {
        entries.push({ path, read: () => readHeldFile(held, name) });
      } else if (dirent.isDirectory()) {
        await walk(holds.use(await holdChild(held, name)), `${path}/`);
      }
    }
  };
  await walk(holds.use(await holdTree(dir)), "");
  const lifetime = holds.move();
  return {
    entries,
    dispose: async (): Promise<void> => {
      await lifetime.disposeAsync();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
