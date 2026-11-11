// The two `ImportFsPort` trees. A staged tree trusts only the manifest the server wrote; a link is never part of it.
// ST_PROFILE_DIR has no writer to check against: it is operator configuration, so its links follow (docs/law/Tier-3-Infra.md).

import type { Dirent } from "node:fs";
import { lstat, readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import type { ImportDirectory, ImportFsPort } from "@orb/contracts/import";
import { DomainOperationError } from "@orb/kit/errors";
import { errnoCode, isMissingFile } from "#primitives/errno";
import type { StagedFile, StagedManifest } from "./staged-manifest.ts";
import { openLeaf, readVerified } from "./staged-manifest.ts";

type FsEntry = Awaited<ReturnType<ImportDirectory["list"]>>[number];

const PATH_SEPARATOR = "/";
const CURRENT_DIR = ".";
const PARENT_DIR = "..";
const MISSING_FILE_CODE = "ENOENT";
const NOT_A_DIRECTORY_CODE = "ENOTDIR";

/** An operator's leaf is no regular file. `code` makes the collector report it as a failed read, not a missing file. */
class NotARegularFileError extends DomainOperationError {
  constructor(path: string) {
    super("import_not_a_regular_file", `not a regular file: ${path}`);
    this.name = this.constructor.name;
  }
}

/** A plane an operator linked to a target that is not there. Reading on as an absent plane would drop its data silently. */
class DanglingPlaneLinkError extends DomainOperationError {
  constructor(path: string, options: ErrorOptions) {
    super("import_dangling_plane_link", `this folder is a link to a target that does not exist: ${path}`);
    this.name = this.constructor.name;
    this.cause = options.cause;
  }
}

/** A name a manifest never recorded. It reads as the collector's documented "missing" case, like an absent file on disk. */
class NoSuchStagedFileError extends Error {
  readonly code = MISSING_FILE_CODE;
  constructor(path: string) {
    super(`no such staged file: ${path}`);
    this.name = this.constructor.name;
  }
}

interface StagedNode {
  readonly files: Map<string, StagedFile>;
  readonly directories: Map<string, StagedNode>;
}

function emptyNode(): StagedNode {
  return { files: new Map(), directories: new Map() };
}

function indexManifest(manifest: StagedManifest): StagedNode {
  const root = emptyNode();
  for (const file of manifest) {
    const segments = file.path.split(PATH_SEPARATOR);
    const leaf = segments.pop() ?? file.path;
    let node = root;
    for (const segment of segments) {
      const child = node.directories.get(segment) ?? emptyNode();
      node.directories.set(segment, child);
      node = child;
    }
    node.files.set(leaf, file);
  }
  return root;
}

function stagedDirectory(root: string, node: StagedNode, path: string): ImportDirectory {
  const fileNamed = (name: string): StagedFile => {
    const file = node.files.get(name);
    if (file === undefined) {
      throw new NoSuchStagedFileError(join(path, name));
    }
    return file;
  };
  return {
    path,
    list: (): Promise<readonly FsEntry[]> =>
      Promise.resolve([
        ...[...node.files.keys()].map((name): FsEntry => ({ name, kind: "file" })),
        ...[...node.directories.keys()].map((name): FsEntry => ({ name, kind: "directory" })),
      ]),
    openDirectory: (name): Promise<ImportDirectory | null> => {
      const child = node.directories.get(name);
      return Promise.resolve(child === undefined ? null : stagedDirectory(root, child, join(path, name)));
    },
    readFile: async (name): Promise<Uint8Array> => await readVerified(root, fileNamed(name)),
    stat: async (name): Promise<{ readonly size: number }> => await Promise.resolve({ size: fileNamed(name).size }),
    [Symbol.asyncDispose]: (): Promise<void> => Promise.resolve(),
  };
}

/**
 * The staged tree at `root`, read through the manifest the server wrote. Listings come from the manifest, so nothing the
 * disk says later adds a name, and every byte passes {@link readVerified}. The caller verified `manifest` against the
 * digest its workload row carries.
 */
export function createStagedImportPort(root: string, manifest: StagedManifest): ImportFsPort {
  const tree = indexManifest(manifest);
  return {
    openTree: (): Promise<ImportDirectory | null> => Promise.resolve(stagedDirectory(root, tree, root)),
    join: (...parts): string => join(...parts),
  };
}

function childOf(path: string, name: string): string {
  // A climb or separator here would leave this directory, so only one plain entry name passes.
  if (name === CURRENT_DIR || name === PARENT_DIR || name !== basename(name)) {
    throw new Error(`not a single directory entry: ${name}`);
  }
  return join(path, name);
}

async function linkKind(path: string, danglingKind: FsEntry["kind"]): Promise<FsEntry["kind"]> {
  try {
    return (await stat(path)).isDirectory() ? "directory" : "other";
  } catch (error) {
    if (isMissingFile(error) || errnoCode(error) === NOT_A_DIRECTORY_CODE) {
      return danglingKind;
    }
    throw error;
  }
}

async function operatorEntryKind(path: string, entry: Dirent, danglingKind: FsEntry["kind"]): Promise<FsEntry["kind"]> {
  if (entry.isSymbolicLink()) {
    return await linkKind(join(path, entry.name), danglingKind);
  }
  if (entry.isFile()) {
    return "file";
  }
  return entry.isDirectory() ? "directory" : "other";
}

// Inside a profile a link with no target lists as a directory, so the collector that wants that plane opens it and gets
// the failure that names it, and one nothing reads stays harmless. At the top of the tree the loader opens every
// directory as a candidate profile, so a stray link there lists as `other` or it would fail the whole run.
const PROFILE_DANGLING_KIND = "directory" satisfies FsEntry["kind"];
const TREE_TOP_DANGLING_KIND = "other" satisfies FsEntry["kind"];

async function operatorDirectoryAt(path: string, danglingKind: FsEntry["kind"]): Promise<ImportDirectory | null> {
  try {
    return (await stat(path)).isDirectory() ? operatorDirectory(path, danglingKind) : null;
  } catch (error) {
    if (!isMissingFile(error) && errnoCode(error) !== NOT_A_DIRECTORY_CODE) {
      throw error;
    }
    // The path is already known absent or not a directory; only a missing entry reads as no link.
    const entry = await lstat(path).catch((lstatError: unknown) => {
      if (!isMissingFile(lstatError)) {
        throw lstatError;
      }
      return null;
    });
    if (entry?.isSymbolicLink() === true) {
      throw new DanglingPlaneLinkError(path, { cause: error });
    }
    return null;
  }
}

function operatorDirectory(path: string, danglingKind: FsEntry["kind"]): ImportDirectory {
  return {
    path,
    list: async (): Promise<readonly FsEntry[]> => {
      const entries = await readdir(path, { withFileTypes: true });
      return await Promise.all(
        entries.map(async (entry): Promise<FsEntry> => ({ name: entry.name, kind: await operatorEntryKind(path, entry, danglingKind) })),
      );
    },
    openDirectory: (name): Promise<ImportDirectory | null> => operatorDirectoryAt(childOf(path, name), PROFILE_DANGLING_KIND),
    readFile: async (name): Promise<Uint8Array> => {
      const child = childOf(path, name);
      await using handle = await openLeaf(child);
      if (!(await handle.stat()).isFile()) {
        throw new NotARegularFileError(child);
      }
      const data = await handle.readFile();
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    },
    stat: async (name): Promise<{ readonly size: number }> => ({ size: (await lstat(childOf(path, name))).size }),
    [Symbol.asyncDispose]: (): Promise<void> => Promise.resolve(),
  };
}

/** The operator's ST profile tree at `root`. A directory link follows at any depth; a leaf is read without following one. */
export function createOperatorImportPort(root: string): ImportFsPort {
  return {
    openTree: (): Promise<ImportDirectory | null> => operatorDirectoryAt(root, TREE_TOP_DANGLING_KIND),
    join: (...parts): string => join(...parts),
  };
}
