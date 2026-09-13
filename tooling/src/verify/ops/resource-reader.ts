// Invocation-local disk/overlay acquisition. This internal reader is never part of a policy context.

import type { Dirent } from "node:fs";
import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ResourceFileSnapshot, ResourceLoad, ResourceReader, ResourceReaderOptions, ResourceTreeEntry } from "../contract/resource.ts";
import { assertRepoPathIdentity } from "../lib/policy-validation.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:structure");

// Installed and generated trees are separate resource families, never authored-tree members.
const NON_AUTHORED_DIRECTORIES = new Set(["node_modules", ".git", "dist", ".cache"]);

function childPath(directory: string, name: string): string {
  return directory === "" ? name : `${directory}/${name}`;
}

function isDescendant(path: string, child: string): boolean {
  return path === "" || child.startsWith(`${path}/`);
}

function isAuthoredOverlayChild(path: string, child: string, value: string | null): value is string {
  return (
    value !== null &&
    isDescendant(path, child) &&
    !child
      .split("/")
      .slice(0, -1)
      .some((segment) => NON_AUTHORED_DIRECTORIES.has(segment))
  );
}

function firstOverlayParentIndex(path: string): number {
  return path === "" ? 1 : path.split("/").length + 1;
}

function comparePath(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function hasNonAuthoredSegment(path: string): boolean {
  return path.split("/").some((segment) => NON_AUTHORED_DIRECTORIES.has(segment));
}

function unavailable(status: "missing" | "empty" | "unresolved", path: string, reason: string): ResourceLoad<never> {
  return { status, paths: [path], members: 0, reason };
}

function failure(path: string, error: unknown): ResourceLoad<never> {
  const missing = error instanceof Error && "code" in error && error.code === "ENOENT";
  return unavailable(missing ? "missing" : "unresolved", path, error instanceof Error ? error.message : String(error));
}

function freezeLoad<T>(load: ResourceLoad<T>): ResourceLoad<T> {
  Object.freeze(load.paths);
  return Object.freeze(load);
}

/** Snapshot inputs so caller mutations cannot change one invocation's resource identity. */
export function createResourceReader(options: ResourceReaderOptions): ResourceReader {
  const root = resolve(options.root);
  const overlay = new Map(Object.entries(options.overlay ?? {}));
  for (const [path, value] of overlay) {
    assertRepoPathIdentity(path, "resource overlay path");
    if (hasNonAuthoredSegment(path)) {
      throw new Error(`resource overlay cannot mutate a non-authored tree: ${path}`);
    }
    if (value !== null && typeof value !== "string") {
      throw new Error(`resource overlay must contain text or a deletion: ${path}`);
    }
    const segments = path.split("/");
    for (let index = 1; index < segments.length; index += 1) {
      if (overlay.has(segments.slice(0, index).join("/"))) {
        throw new Error(`resource overlay has conflicting ancestor and child entries: ${path}`);
      }
    }
  }
  const directories = new Map<string, ResourceLoad<readonly Dirent[]>>();
  const bytes = new Map<string, ResourceLoad<Buffer>>();
  const texts = new Map<string, ResourceLoad<string>>();
  const trees = new Map<string, ResourceLoad<readonly ResourceTreeEntry[]>>();

  const hidden = (path: string): boolean => [...overlay].some(([entry, value]) => value === null && (path === entry || path.startsWith(`${entry}/`)));
  const assertDiskPath = (path: string): void => {
    const segments = path.split("/");
    for (let index = 1; index <= segments.length; index += 1) {
      if (lstatSync(join(root, ...segments.slice(0, index))).isSymbolicLink()) {
        throw new Error(`authored resource traverses a symbolic link: ${path}`);
      }
    }
  };
  const directoryEntries = (path: string): ResourceLoad<readonly Dirent[]> => {
    const cached = directories.get(path);
    if (cached !== undefined) {
      return cached;
    }
    let load: ResourceLoad<readonly Dirent[]>;
    try {
      if (path !== "") {
        assertDiskPath(path);
      }
      const value = readdirSync(join(root, path), { withFileTypes: true });
      load = { status: "ready", value, paths: path === "" ? [] : [path], members: value.length };
    } catch (error) {
      load = failure(path, error);
    }
    directories.set(path, load);
    return load;
  };
  const directoryMember = (directory: string, name: string, path: string): ResourceLoad<Dirent> => {
    const listing = directoryEntries(directory);
    if (listing.status !== "ready") {
      return listing;
    }
    const entry = listing.value.find((candidate) => candidate.name === name);
    if (entry === undefined) {
      return unavailable("missing", path, `resource is absent from the invocation inventory: ${path}`);
    }
    if (entry.isSymbolicLink()) {
      return unavailable("unresolved", path, `authored resource traverses a symbolic link: ${path}`);
    }
    return { status: "ready", value: entry, paths: [path], members: 1 };
  };
  const diskMembership = (path: string): ResourceLoad<Dirent> => {
    const segments = path.split("/");
    for (const [index, name] of segments.entries()) {
      const member = directoryMember(segments.slice(0, index).join("/"), name, path);
      if (member.status !== "ready" || index === segments.length - 1) {
        return member;
      }
      if (!member.value.isDirectory()) {
        return unavailable("unresolved", path, `resource ancestor is not a directory in the invocation inventory: ${path}`);
      }
    }
    return unavailable("unresolved", path, `resource path has no member: ${path}`);
  };
  const diskBytes = (path: string): ResourceLoad<Buffer> => {
    const membership = diskMembership(path);
    if (membership.status !== "ready") {
      return membership;
    }
    assertDiskPath(path);
    if (!(membership.value.isFile() && lstatSync(join(root, path)).isFile())) {
      throw new Error(`resource is not a regular file: ${path}`);
    }
    return { status: "ready", value: readFileSync(join(root, path)), paths: [path], members: 1 };
  };
  const readBytes = (path: string): ResourceLoad<Buffer> => {
    assertRepoPathIdentity(path, "resource path");
    const cached = bytes.get(path);
    if (cached !== undefined) {
      return cached;
    }
    let load: ResourceLoad<Buffer>;
    try {
      if (hidden(path)) {
        load = unavailable("missing", path, `resource deleted by overlay: ${path}`);
      } else {
        const replacement = overlay.get(path);
        load = typeof replacement === "string" ? { status: "ready", value: Buffer.from(replacement), paths: [path], members: 1 } : diskBytes(path);
      }
    } catch (error) {
      load = failure(path, error);
    }
    bytes.set(path, freezeLoad(load));
    return load;
  };
  const read = (path: string): ResourceLoad<string> => {
    const cached = texts.get(path);
    if (cached !== undefined) {
      return cached;
    }
    const content = readBytes(path);
    let load: ResourceLoad<string>;
    if (content.status !== "ready") {
      load = content;
    } else {
      try {
        const value = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(content.value);
        load = value.length === 0 ? unavailable("empty", path, `resource file is empty: ${path}`) : { ...content, value };
      } catch (error) {
        load = failure(path, error);
      }
    }
    texts.set(path, freezeLoad(load));
    return load;
  };
  const fileEntry = (path: string): ResourceTreeEntry => {
    const content = readBytes(path);
    if (content.status !== "ready") {
      throw new Error(content.reason);
    }
    let newlines = 0;
    let nulBytes = 0;
    const nulLines: number[] = [];
    for (const byte of content.value) {
      if (byte === 0) {
        nulBytes += 1;
        nulLines.push(newlines + 1);
      }
      newlines += Number(byte === 10);
    }
    return Object.freeze({
      path,
      kind: "file",
      bytes: content.value.length,
      lines: newlines + 1,
      nulBytes,
      nulLines: Object.freeze(nulLines),
      origin: overlay.has(path) ? "overlay" : "disk",
    });
  };
  const addDirectory = (entries: Map<string, ResourceTreeEntry>, directory: string, origin: ResourceTreeEntry["origin"]): void => {
    if (!entries.has(directory)) {
      entries.set(directory, Object.freeze({ path: directory, kind: "directory", bytes: 0, lines: 0, nulBytes: 0, nulLines: Object.freeze([]), origin }));
    }
  };
  const walk = (entries: Map<string, ResourceTreeEntry>, directory: string): void => {
    const listing = directoryEntries(directory);
    if (listing.status !== "ready") {
      throw new Error(listing.reason);
    }
    for (const entry of listing.value) {
      const child = childPath(directory, entry.name);
      if (hidden(child) || (entry.isDirectory() && NON_AUTHORED_DIRECTORIES.has(entry.name))) {
        continue;
      }
      if (entry.isDirectory() && !overlay.has(child)) {
        addDirectory(entries, child, "disk");
        walk(entries, child);
      } else {
        entries.set(child, fileEntry(child));
      }
    }
  };
  const mergeOverlay = (entries: Map<string, ResourceTreeEntry>, path: string): void => {
    for (const [child, value] of overlay) {
      if (!isAuthoredOverlayChild(path, child, value)) {
        continue;
      }
      entries.set(child, fileEntry(child));
      const segments = child.split("/");
      for (let index = firstOverlayParentIndex(path); index < segments.length; index += 1) {
        const directory = segments.slice(0, index).join("/");
        if (entries.get(directory)?.kind === "file") {
          throw new Error(`overlay child is beneath a file: ${child}`);
        }
        addDirectory(entries, directory, "overlay");
      }
    }
  };
  const diskTreePresent = (path: string): boolean => {
    const membership = diskMembership(path);
    if (membership.status === "missing") {
      return false;
    }
    if (membership.status !== "ready") {
      throw new Error(membership.reason);
    }
    if (!membership.value.isDirectory()) {
      throw new Error(`resource tree was not a directory in the invocation inventory: ${path}`);
    }
    return true;
  };
  const loadTree = (path: string): ResourceLoad<readonly ResourceTreeEntry[]> => {
    if (hidden(path)) {
      return unavailable("missing", path, `resource tree deleted by overlay: ${path}`);
    }
    if (overlay.has(path)) {
      throw new Error(`resource tree is an overlay file: ${path}`);
    }
    const entries = new Map<string, ResourceTreeEntry>();
    const present = diskTreePresent(path);
    if (present) {
      walk(entries, path);
    }
    mergeOverlay(entries, path);
    const value = Object.freeze([...entries.values()].toSorted((left, right) => left.path.localeCompare(right.path)));
    return value.length > 0
      ? { status: "ready", value, paths: value.map((entry) => entry.path), members: value.length }
      : unavailable(present ? "empty" : "missing", path, `resource tree has no members: ${path}`);
  };
  const tree = (path: string): ResourceLoad<readonly ResourceTreeEntry[]> => {
    assertRepoPathIdentity(path, "resource tree path");
    const cached = trees.get(path);
    if (cached !== undefined) {
      return cached;
    }
    let load: ResourceLoad<readonly ResourceTreeEntry[]>;
    try {
      load = loadTree(path);
    } catch (error) {
      load = unavailable("unresolved", path, error instanceof Error ? error.message : String(error));
    }
    trees.set(path, freezeLoad(load));
    return load;
  };
  const snapshotFile = (path: string): ResourceFileSnapshot => {
    assertRepoPathIdentity(path, "resource snapshot path");
    if (hasNonAuthoredSegment(path)) {
      throw new Error(`resource snapshot cannot include a non-authored tree: ${path}`);
    }
    const target = join(root, path);
    if (!overlay.has(path) && lstatSync(target).isSymbolicLink()) {
      const canonical = realpathSync(target);
      const rel = relative(root, canonical);
      if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
        throw new Error(`authored resource symlink resolves outside the invocation root: ${path}`);
      }
      return Object.freeze({ path, kind: "symlink", targetPath: rel.split(sep).join("/"), origin: "disk" });
    }
    const loaded = readBytes(path);
    if (loaded.status !== "ready") {
      throw new Error(loaded.reason);
    }
    return Object.freeze({
      path,
      kind: "file",
      bytes: new Uint8Array(loaded.value),
      origin: overlay.has(path) ? "overlay" : "disk",
    });
  };
  const snapshot = (paths: readonly string[]): ResourceLoad<readonly ResourceFileSnapshot[]> => {
    try {
      const files = [...new Set(paths)].toSorted(comparePath).map(snapshotFile);
      return freezeLoad({ status: "ready", value: Object.freeze(files), paths: files.map((entry) => entry.path), members: files.length });
    } catch (error) {
      return freezeLoad(unavailable("unresolved", "", error instanceof Error ? error.message : String(error)));
    }
  };
  return Object.freeze({ read, tree, snapshot });
}
