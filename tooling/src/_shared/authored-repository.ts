import { lstatSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { AuthoredRepositoryInventory } from "./compiler-programs-contract.ts";
import { runNicedSync } from "./proc.ts";
import { inheritedProcessEnv } from "./process-env.ts";

export const GIT_READ_PREFIX: readonly string[] = ["--no-optional-locks"];
const ASCII_C0_MAX = 0x1f;
const ASCII_DELETE = 0x7f;

function compare(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function hasAsciiControl(value: string): boolean {
  return [...value].some((character) => {
    const point = character.codePointAt(0);
    return point !== undefined && (point <= ASCII_C0_MAX || point === ASCII_DELETE);
  });
}

export function assertRepoPath(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    hasAsciiControl(value) ||
    value.startsWith("/") ||
    /^[A-Za-z]:\//u.test(value) ||
    value.endsWith("/") ||
    value.includes("\\")
  ) {
    throw new Error(`${label} must be a repo-relative POSIX path`);
  }
  if (value.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw new Error(`${label} has an invalid path segment`);
  }
}

export function repoGitEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(inheritedProcessEnv()).filter(([name]) => !name.startsWith("GIT_")));
}

function containedRelative(root: string, canonical: string, label: string): string {
  const rel = relative(root, canonical);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`${label} resolves outside repository`);
  }
  return rel.split(sep).join("/");
}

function currentAuthoredFile(root: string, path: string): string | null {
  assertRepoPath(path, "repository inventory path");
  const candidate = resolve(root, path);
  let entry: ReturnType<typeof lstatSync>;
  try {
    entry = lstatSync(candidate);
  } catch (error) {
    const code = (error as { readonly code?: unknown } | null)?.code;
    if (code === "ENOENT") {
      return null;
    }
    throw error;
  }
  let canonical: string;
  try {
    canonical = realpathSync(candidate);
  } catch (error) {
    throw new Error(`repository inventory symlink cannot be resolved: ${path}`, { cause: error });
  }
  containedRelative(root, canonical, `repository inventory path ${path}`);
  if (entry.isSymbolicLink()) {
    return path;
  }
  return entry.isFile() ? path : null;
}

function readPathnames(root: string, args: readonly string[]): readonly string[] {
  const result = runNicedSync("git", args, { cwd: root, env: repoGitEnvironment() });
  if (result.status !== 0) {
    throw new Error(`git authored-file read failed with exit ${String(result.status)}: ${result.stderr.trim()}`);
  }
  const paths = result.stdout.split("\0").filter((path) => path !== "");
  for (const path of paths) {
    assertRepoPath(path, "repository inventory path");
  }
  return [...new Set(paths)].toSorted(compare);
}

/** Git-authored lexical identities before physical/symlink validation; ignored paths are already absent. */
export function readAuthoredRepositoryPathnames(root: string): readonly string[] {
  const canonicalRoot = realpathSync(root);
  const tracked = readPathnames(canonicalRoot, [...GIT_READ_PREFIX, "ls-files", "-z"]);
  const untracked = readPathnames(canonicalRoot, [...GIT_READ_PREFIX, "ls-files", "--others", "--exclude-standard", "-z"]);
  return [...new Set([...tracked, ...untracked])].toSorted(compare);
}

export function readAuthoredRepositoryInventory(root: string): AuthoredRepositoryInventory {
  const canonicalRoot = realpathSync(root);
  if (!statSync(canonicalRoot).isDirectory()) {
    throw new Error(`repository inventory root is not a directory: ${root}`);
  }
  const trackedPaths = readPathnames(canonicalRoot, [...GIT_READ_PREFIX, "ls-files", "-z"])
    .map((path) => currentAuthoredFile(canonicalRoot, path))
    .filter((path): path is string => path !== null);
  const untrackedPaths = readPathnames(canonicalRoot, [...GIT_READ_PREFIX, "ls-files", "--others", "--exclude-standard", "-z"])
    .map((path) => currentAuthoredFile(canonicalRoot, path))
    .filter((path): path is string => path !== null);
  const paths = [...new Set([...trackedPaths, ...untrackedPaths])].toSorted(compare);
  return { root: canonicalRoot, trackedPaths, untrackedPaths, paths };
}
