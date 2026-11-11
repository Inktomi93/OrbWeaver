// The staging root's filesystem reach for the import domain: resolve a staged handle to a contained path, remove a
// staged entry inside its root, and list what the root holds. The domain keeps the policy (which handle a row owns,
// which names a sweep removes); only the reads and the removal live here.

import type { Dirent } from "node:fs";
import { lstat, readdir, realpath, rm } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { DomainOperationError } from "@orb/kit/errors";
import { isStrictDescendant } from "@orb/kit/path-containment";
import { isAbsentPath, isMissingFile } from "#primitives/errno";

// The lexical containment pass runs on the host's own separator; `realpath` below is the authoritative half.
const HOST_PATH = { sep };

/**
 * Resolve a server-minted staging handle to an absolute path that is a PROPER STRICT DESCENDANT of
 * `stagingRoot`, or throw. The AUTHORITATIVE containment belt (the contract-layer charset regex is the outer
 * one): a handle resolving to the staging root itself, its parent, or anywhere outside is a path-traversal
 * attempt and throws BEFORE any fs read or rm — the workload fails cleanly, nothing is touched.
 * `basename()` is NOT a containment primitive (`basename("..") === ".."`); never use it as one.
 *
 * CONTAINMENT IS RESOLVED, NEVER STRING-MATCHED. A lexical `startsWith` says "inside the root" about a path
 * whose own components are symlinks pointing anywhere on the box — and `readFile` / the profile-tree walker
 * then follow them. So the string check is only the cheap first pass: the belt is `realpath`, on the root's PARENT
 * (the configured root may itself sit behind a link) and on the target, with the two required to agree.
 * "No writer of ours creates symlinks under the staging root" is not a containment argument either: the root
 * is operator-configurable (`IMPORT_STAGING_DIR`) and may point anywhere, including a shared directory.
 *
 * SECURITY: `stagingRoot` here is the OWNER'S folder, and a staging actor can replace that folder with a link. Its own
 * realpath would then move both ends of the comparison together and the handle would resolve wherever the link
 * points, so every read and every `rm` below would act there. The comparison anchors one level up for that reason.
 */
export async function resolveStagedPath(stagingRoot: string, stagedHandle: string): Promise<string> {
  const root = resolve(stagingRoot);
  const target = resolve(root, stagedHandle);
  if (!isStrictDescendant(root, target, HOST_PATH)) {
    throw new DomainOperationError("staged_path_escape", `staged handle escapes the staging root: ${stagedHandle}`);
  }
  const realRoot = await realpath(dirname(root))
    .then((parent) => join(parent, basename(root)))
    .catch(() => {
      throw new DomainOperationError("staged_path_escape", `staged handle escapes the staging root: ${stagedHandle}`);
    });
  const realTarget = await realpath(target).catch(() => {
    throw new DomainOperationError("staged_path_missing", `staged handle names nothing under the staging root: ${stagedHandle}`);
  });
  // Any symlinked component anywhere in the handle moves the real path off the expected one — refused even
  // when the link happens to land back inside the root (its target can be repointed between checks).
  if (realTarget !== resolve(realRoot, stagedHandle)) {
    throw new DomainOperationError("staged_path_escape", `staged handle escapes the staging root (symlinked path): ${stagedHandle}`);
  }
  return target;
}

/**
 * Belt-and-suspenders rm: remove `target` ONLY when it is provably a strict descendant of `stagingRoot`
 * AT THE rm CALLSITE — so even a future refactor that computed the path unsafely can never delete the
 * staging root, its parent, or anything outside it. A non-contained target is refused SILENTLY:
 * {@link resolveStagedPath} already rejected the traversal loudly at compute time, so reaching here with an
 * out-of-root path means a bug, and the safe response is to delete nothing. A path that names nothing has nothing to
 * delete; any other filesystem fault rejects, as the `rm` itself would.
 */
export async function removeContained(stagingRoot: string, target: string): Promise<void> {
  const root = resolve(stagingRoot);
  const resolved = resolve(target);
  if (!isStrictDescendant(root, resolved, HOST_PATH)) {
    return;
  }
  // A SYMLINK is never removed here. `rm` would unlink the link rather than its target, so this is not the
  // deletion hole — but a staged entry that turned into a link since the resolve is a tampering signal, and
  // deleting nothing is the safe response on a path this belt no longer recognizes.
  const link = await lstat(resolved).catch((error: unknown) => {
    if (!isAbsentPath(error)) {
      throw error;
    }
    return null;
  });
  if (link === null || link.isSymbolicLink()) {
    return;
  }
  await rm(resolved, { recursive: true, force: true });
}

/** One entry an owner's staging folder holds: the folder it sits in, its name and its path. */
interface StagedEntryName {
  readonly ownerRoot: string;
  readonly name: string;
  readonly path: string;
}

async function entriesOf(dir: string): Promise<readonly Dirent[]> {
  // A box that has never staged anything has no root to walk; the rethrow leaves every other fault to the boot sweep's log.
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (isMissingFile(err)) {
      return [];
    }
    throw err;
  }
}

/**
 * Every entry under each owner folder of `stagingRoot`. A link is never walked: a `Dirent` reports what the name is,
 * so a linked owner folder is no folder, and {@link removeContained} refuses a linked entry.
 */
export async function listStagedEntries(stagingRoot: string): Promise<readonly StagedEntryName[]> {
  const root = resolve(stagingRoot);
  const found: StagedEntryName[] = [];
  for (const owner of await entriesOf(root)) {
    if (!owner.isDirectory()) {
      continue;
    }
    const ownerRoot = join(root, owner.name);
    for (const { name } of await entriesOf(ownerRoot)) {
      found.push({ ownerRoot, name, path: join(ownerRoot, name) });
    }
  }
  return found;
}
