// Native TypeScript config expansion over a source-FILENAME overlay. Config bytes, inheritance and
// references remain physical; only the transaction's final source tree is projected in memory.
import type { Dirent } from "node:fs";
import { lstatSync, readdirSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { ts } from "ts-morph";
import type { CompilerSourceOverlay, PolicyRepositoryInventory } from "../contract/policy-scope.ts";
import { assertPolicyRepoPath } from "./policy-repo-inventory.ts";

interface DirectoryEntries {
  readonly files: readonly string[];
  readonly directories: readonly string[];
}

type MatchFiles = (
  ...args: [
    path: string,
    extensions: readonly string[] | undefined,
    excludes: readonly string[] | undefined,
    includes: readonly string[] | undefined,
    useCaseSensitiveFileNames: boolean,
    currentDirectory: string,
    depth: number | undefined,
    getFileSystemEntries: (path: string) => DirectoryEntries,
    realpath: (path: string) => string,
  ]
) => string[];

interface CompilerSourceFilenameReader {
  readonly parseHost: ts.ParseConfigHost;
  readonly isAdded: (fileName: string) => boolean;
  readonly isDeleted: (fileName: string) => boolean;
  readonly isAuthored: (fileName: string) => boolean;
  readonly repoRelative: (fileName: string) => string;
}

function contained(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || !(rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel));
}

function missing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR");
}

/** Resolve the nearest existing ancestor through symlinks, then project its unborn suffix. */
function physicalIdentity(path: string): string {
  let existing = resolve(path);
  const unborn: string[] = [];
  for (;;) {
    try {
      lstatSync(existing);
    } catch (error) {
      if (!missing(error)) {
        throw error;
      }
      const parent = dirname(existing);
      if (parent === existing) {
        throw new Error(`compiler source path has no resolvable ancestor: ${path}`, { cause: error });
      }
      unborn.unshift(basename(existing));
      existing = parent;
      continue;
    }
    try {
      return resolve(realpathSync(existing), ...unborn);
    } catch (error) {
      throw new Error(`compiler source path ancestry cannot be resolved: ${path}`, { cause: error });
    }
  }
}

function matchFilesRuntime(): MatchFiles {
  const candidate: unknown = Reflect.get(ts, "matchFiles");
  if (typeof candidate !== "function") {
    throw new Error(`TypeScript ${ts.version} does not expose the native matchFiles runtime required for compiler source overlays`);
  }
  return candidate as MatchFiles;
}

function pathSet(paths: readonly string[], inventory: PolicyRepositoryInventory, label: string): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (const path of paths) {
    assertPolicyRepoPath(path, label);
    const identity = physicalIdentity(resolve(inventory.root, path));
    if (!contained(inventory.root, identity)) {
      throw new Error(`${label} resolves outside repository: ${path}`);
    }
    const physical = relative(inventory.root, identity);
    if (physical.split(sep).includes("node_modules")) {
      throw new Error(`${label} is not authored repository source: ${path}`);
    }
    result.set(identity, path);
  }
  return result;
}

function authoredIdentities(inventory: PolicyRepositoryInventory): ReadonlySet<string> {
  return new Set(inventory.paths.map((path) => physicalIdentity(resolve(inventory.root, path))));
}

function diskEntries(directory: string, deleted: ReadonlyMap<string, string>): DirectoryEntries {
  let entries: Dirent<string>[];
  // @orb-gate-ignore caught-failure-ownership(empty:catch): native ts.sys.readDirectory treats an unreadable
  // directory as empty. This adapter preserves that behavior; virtual entries are merged separately below.
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return { files: [], directories: [] };
  }
  const files: string[] = [];
  const directories: string[] = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    let kind: ReturnType<typeof statSync> | typeof entry = entry;
    if (entry.isSymbolicLink()) {
      // @orb-gate-ignore caught-failure-ownership(empty:catch): native ts.sys directory reads skip dangling
      // or unreadable symlink entries. Ends if this absence becomes an authored-path authorization decision.
      try {
        kind = statSync(path);
      } catch {
        continue;
      }
    }
    if (deleted.has(physicalIdentity(path))) {
      continue;
    }
    if (kind.isFile()) {
      files.push(entry.name);
    } else if (kind.isDirectory()) {
      directories.push(entry.name);
    }
  }
  return { files, directories };
}

function virtualEntries(root: string, added: ReadonlyMap<string, string>): ReadonlyMap<string, DirectoryEntries> {
  const entries = new Map<string, { files: Set<string>; directories: Set<string> }>();
  const at = (directory: string): { files: Set<string>; directories: Set<string> } => {
    const existing = entries.get(directory) ?? { files: new Set<string>(), directories: new Set<string>() };
    entries.set(directory, existing);
    return existing;
  };
  for (const identity of added.keys()) {
    at(dirname(identity)).files.add(basename(identity));
    let child = dirname(identity);
    while (child !== root) {
      const parent = dirname(child);
      if (parent === child || !contained(root, parent)) {
        break;
      }
      at(parent).directories.add(basename(child));
      child = parent;
    }
  }
  return new Map([...entries].map(([directory, value]) => [directory, { files: [...value.files], directories: [...value.directories] }]));
}

export function createCompilerSourceFilenameReader(
  inventory: PolicyRepositoryInventory,
  overlay: CompilerSourceOverlay | undefined,
): CompilerSourceFilenameReader {
  const added = pathSet(overlay?.addedPaths ?? [], inventory, "virtual compiler source");
  const deleted = pathSet(overlay?.deletedPaths ?? [], inventory, "deleted compiler source");
  for (const [identity, path] of added) {
    if (deleted.has(identity)) {
      throw new Error(`compiler source overlay adds and deletes the same physical path: ${path}`);
    }
  }
  const authored = authoredIdentities(inventory);
  const virtual = virtualEntries(inventory.root, added);
  const matchFiles = matchFilesRuntime();
  const identity = (fileName: string): string => physicalIdentity(fileName);
  const repoRelative = (fileName: string): string => {
    const rel = relative(inventory.root, resolve(fileName));
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      throw new Error(`compiler member resolves outside repository: ${fileName}`);
    }
    const path = rel.split(sep).join("/");
    assertPolicyRepoPath(path, "compiler member");
    return path;
  };
  const directoryEntries = (directory: string): DirectoryEntries => {
    const physical = identity(directory);
    const disk = diskEntries(directory, deleted);
    const additions = virtual.get(physical);
    return {
      files: [...new Set([...disk.files, ...(additions?.files ?? [])])],
      directories: [...new Set([...disk.directories, ...(additions?.directories ?? [])])],
    };
  };
  return {
    parseHost: {
      ...ts.sys,
      readDirectory: (...args: Parameters<ts.ParseConfigHost["readDirectory"]>): readonly string[] => {
        const [directory, extensions, excludes, includes, depth] = args;
        return matchFiles(
          directory,
          extensions,
          excludes,
          includes,
          ts.sys.useCaseSensitiveFileNames,
          ts.sys.getCurrentDirectory(),
          depth,
          directoryEntries,
          identity,
        );
      },
    },
    isAdded: (fileName): boolean => added.has(identity(fileName)),
    isDeleted: (fileName): boolean => deleted.has(identity(fileName)),
    isAuthored: (fileName): boolean => authored.has(identity(fileName)) || added.has(identity(fileName)),
    repoRelative,
  };
}
