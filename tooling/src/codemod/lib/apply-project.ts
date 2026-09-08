// Preflight parent topology, apply ts-morph's queued writes, and clean up only empty directories this
// run created after a failure. This is not a filesystem transaction: saveSync may partially write.
import { mkdirSync, rmdirSync, statSync } from "node:fs";
import { dirname, relative, sep } from "node:path";
import type { Project } from "ts-morph";
import { warn } from "../../_shared/log.ts";
import type { FileSnapshot } from "../contract/types.ts";
import { CodemodError } from "./errors.ts";
import { absolutePath, repoRelative } from "./plans.ts";

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

function pathDepth(path: string, repoRoot: string): number {
  const rel = relative(repoRoot, path);
  return rel === "" ? 0 : rel.split(sep).length;
}

type DirectoryState = "directory" | "missing";

function parentInspectionError(path: string, repoRoot: string, error: unknown): CodemodError {
  return new CodemodError(`Cannot inspect source file parent: ${repoRelative(path, repoRoot)}.`, error instanceof Error ? error.message : String(error));
}

function directoryState(path: string, repoRoot: string): DirectoryState {
  try {
    if (!statSync(path).isDirectory()) {
      throw new CodemodError(
        `Cannot create source file parent: ${repoRelative(path, repoRoot)} is not a directory.`,
        "Choose a destination whose complete parent path is a directory.",
      );
    }
    return "directory";
  } catch (error) {
    if (error instanceof CodemodError) {
      throw error;
    }
    const code = errorCode(error);
    if (code === "ENOENT" || code === "ENOTDIR") {
      return "missing";
    }
    throw parentInspectionError(path, repoRoot, error);
  }
}

function missingParentDirectories(parent: string, repoRoot: string): readonly string[] {
  let cursor = parent;
  const missing: string[] = [];
  while (directoryState(cursor, repoRoot) === "missing") {
    missing.push(cursor);
    const next = dirname(cursor);
    if (next === cursor) {
      throw new CodemodError(`Cannot resolve source file parent: ${repoRelative(parent, repoRoot)}.`, "No existing directory ancestor was found.");
    }
    cursor = next;
  }
  return missing;
}

/** Prove every parent topology before creating the first directory. The returned set contains only
 *  missing directories, ordered shallow-to-deep so materialization can record exact ownership. */
function preflightCreatedFileParents(project: Project, snapshots: ReadonlyMap<string, FileSnapshot>, repoRoot: string): readonly string[] {
  const currentPaths = new Set(project.getSourceFiles().map((sourceFile) => sourceFile.getFilePath()));
  const parents = new Set<string>();
  for (const snapshot of snapshots.values()) {
    if (snapshot.wasCreated && currentPaths.has(snapshot.filePath)) {
      parents.add(absolutePath(dirname(snapshot.filePath), repoRoot));
    }
  }

  const missing = new Set<string>();
  for (const parent of [...parents].sort((left, right) => left.localeCompare(right))) {
    for (const directory of missingParentDirectories(parent, repoRoot)) {
      missing.add(directory);
    }
  }

  return [...missing].sort((left, right) => pathDepth(left, repoRoot) - pathDepth(right, repoRoot) || left.localeCompare(right));
}

function materializeCreatedFileParents(directories: readonly string[], repoRoot: string, created: string[]): void {
  for (const directory of directories) {
    // Recheck immediately before mutation so a changed symlink ancestor cannot reuse the earlier verdict.
    absolutePath(directory, repoRoot);
    mkdirSync(directory);
    created.push(directory);
  }
}

/** Remove only directories this run created, and only while they remain empty. A concurrent sibling
 *  or a partially-written file makes rmdir fail closed and leaves the shared bytes intact. */
function cleanupCreatedFileParents(created: readonly string[], repoRoot: string): void {
  const failures: string[] = [];
  for (const directory of created.toReversed()) {
    // @orb-gate-ignore caught-failure-ownership(empty:error): ENOENT is already-clean; other cleanup failures are retained and warned below while applyProject rethrows the original failure. Ends if those failures stop being surfaced.
    try {
      rmdirSync(directory);
    } catch (error) {
      if (errorCode(error) !== "ENOENT") {
        failures.push(`${repoRelative(directory, repoRoot)} (${error instanceof Error ? error.message : String(error)})`);
      }
    }
  }
  if (failures.length > 0) {
    warn(
      `\n⚠ Could not remove ${failures.length} codemod-created parent director${failures.length === 1 ? "y" : "ies"}:\n${failures.map((failure) => `  • ${failure}`).join("\n")}\n`,
    );
  }
}

export function applyProject(project: Project, snapshots: ReadonlyMap<string, FileSnapshot>, repoRoot: string): void {
  const parentDirectories = preflightCreatedFileParents(project, snapshots, repoRoot);
  const createdParents: string[] = [];
  try {
    materializeCreatedFileParents(parentDirectories, repoRoot, createdParents);
    project.saveSync();
  } catch (error) {
    cleanupCreatedFileParents(createdParents, repoRoot);
    throw error;
  }
}
