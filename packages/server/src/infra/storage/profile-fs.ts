import type { Dirent } from "node:fs";
import { join } from "node:path";
import type { ImportDirectory, ImportFsPort } from "@orb/contracts/import";
import type { HeldDirectory } from "./held-dir.ts";
import { heldFileSize, holdChild, holdTree, listHeld, readHeldFile } from "./held-dir.ts";

type FsEntry = Awaited<ReturnType<ImportDirectory["list"]>>[number];

function direntKind(e: Dirent): FsEntry["kind"] {
  if (e.isFile()) {
    return "file";
  }
  return e.isDirectory() ? "directory" : "other";
}

function importDirectory(held: HeldDirectory | null, path: string): ImportDirectory | null {
  if (held === null) {
    return null;
  }
  return {
    path,
    list: async (): Promise<readonly FsEntry[]> => (await listHeld(held)).map((e): FsEntry => ({ name: e.name, kind: direntKind(e) })),
    openDirectory: async (name): Promise<ImportDirectory | null> => importDirectory(await holdChild(held, name), join(path, name)),
    readFile: (name): Promise<Uint8Array> => readHeldFile(held, name),
    stat: async (name): Promise<{ readonly size: number }> => ({ size: await heldFileSize(held, name) }),
    [Symbol.asyncDispose]: () => held[Symbol.asyncDispose](),
  };
}

/** The real node:fs `ImportFsPort` for a profile tree. Each directory it opens is held, so reads stay bound to it. */
export function createNodeFsImportPort(): ImportFsPort {
  return {
    openTree: async (root): Promise<ImportDirectory | null> => importDirectory(await holdTree(root), root),
    join: (...parts): string => join(...parts),
  };
}
