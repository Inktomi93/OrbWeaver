// Git is the authored-file and change-identity authority for final policy scopes. Every child failure,
// malformed path, unresolved link, and root escape refuses instead of shrinking the manifest.
import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import type {
  PolicyChangedSelection,
  PolicyRepositoryInventory,
  PolicyScopeInventoryReceipt,
  PolicySemanticPath,
  PolicyWorkspacePackage,
} from "../contract/policy-scope.ts";
import { GIT_READ_PREFIX, repoGitEnvironment, resolveMergeBase } from "./repo-paths.ts";

const TRACKED_ARGS = [...GIT_READ_PREFIX, "ls-files", "-z"] as const;
const UNTRACKED_ARGS = [...GIT_READ_PREFIX, "ls-files", "--others", "--exclude-standard", "-z"] as const;
const ASCII_C0_MAX = 0x1f;
const ASCII_DELETE = 0x7f;
const SHA_RE = /^[0-9a-f]{7,64}$/u;
const RENAME_TOKEN_COUNT = 3;

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

export function assertPolicyRepoPath(value: unknown, label: string): asserts value is string {
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

function rootDirectory(root: string): string {
  const canonical = realpathSync(root);
  if (!statSync(canonical).isDirectory()) {
    throw new Error(`policy scope root is not a directory: ${root}`);
  }
  return canonical;
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function containedRelative(root: string, canonical: string, label: string): string {
  const rel = relative(root, canonical);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`${label} resolves outside repository`);
  }
  return rel.split(sep).join("/");
}

function currentAuthoredFile(root: string, path: string): string | null {
  assertPolicyRepoPath(path, "repository inventory path");
  const candidate = resolve(root, path);
  let entry: ReturnType<typeof lstatSync>;
  try {
    entry = lstatSync(candidate);
  } catch (error) {
    if (isMissing(error)) {
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

function gitRead(root: string, args: readonly string[]): string {
  const result = runNicedSync("git", args, { cwd: root, env: repoGitEnvironment() });
  if (result.status !== 0) {
    const detail = result.stderr.trim();
    throw new Error(`git ${args.find((arg) => !arg.startsWith("-")) ?? "read"} failed with exit ${String(result.status)}${detail === "" ? "" : `: ${detail}`}`);
  }
  return result.stdout;
}

function nulPaths(source: string, label: string): readonly string[] {
  const paths = source.split("\0").filter((path) => path !== "");
  for (const path of paths) {
    assertPolicyRepoPath(path, label);
  }
  return paths;
}

function canonicalFiles(root: string, paths: readonly string[]): readonly string[] {
  const files = paths.map((path) => currentAuthoredFile(root, path)).filter((path): path is string => path !== null);
  return [...new Set(files)].toSorted(compare);
}

export function readPolicyRepositoryInventory(root: string): PolicyRepositoryInventory {
  const canonicalRoot = rootDirectory(root);
  const trackedPaths = canonicalFiles(canonicalRoot, nulPaths(gitRead(canonicalRoot, TRACKED_ARGS), "tracked Git path"));
  const untrackedPaths = canonicalFiles(canonicalRoot, nulPaths(gitRead(canonicalRoot, UNTRACKED_ARGS), "untracked Git path"));
  const paths = [...new Set([...trackedPaths, ...untrackedPaths])].toSorted(compare);
  const receipt: PolicyScopeInventoryReceipt = {
    source: "git",
    trackedCommand: ["git", ...TRACKED_ARGS],
    untrackedCommand: ["git", ...UNTRACKED_ARGS],
    trackedCount: trackedPaths.length,
    untrackedCount: untrackedPaths.filter((path) => !trackedPaths.includes(path)).length,
    authoredCount: paths.length,
    mergeBase: null,
  };
  return { root: canonicalRoot, trackedPaths, untrackedPaths, paths, receipt };
}

export function resolveExistingPolicyPath(inventory: PolicyRepositoryInventory, path: string, kind: "file" | "folder"): string {
  if (path !== ".") {
    assertPolicyRepoPath(path, `${kind} scope path`);
  } else if (kind !== "folder") {
    throw new Error(`${kind} scope path must be a repo-relative POSIX path`);
  }
  const candidate = path === "." ? inventory.root : resolve(inventory.root, path);
  let entry: ReturnType<typeof lstatSync>;
  try {
    entry = lstatSync(candidate);
  } catch (error) {
    if (isMissing(error)) {
      throw new Error(`${kind} scope path does not exist: ${path}`, { cause: error });
    }
    throw error;
  }
  let canonical: string;
  try {
    canonical = realpathSync(candidate);
  } catch (error) {
    if (isMissing(error)) {
      throw new Error(`${kind} scope path does not exist: ${path}`, { cause: error });
    }
    throw error;
  }
  containedRelative(inventory.root, canonical, `${kind} scope path ${path}`);
  const stat = statSync(canonical);
  const matchesKind = kind === "file" ? entry.isFile() || entry.isSymbolicLink() : stat.isDirectory();
  if (!matchesKind) {
    throw new Error(`${kind} scope path is not a ${kind}: ${path}`);
  }
  if (kind === "file" && !inventory.paths.includes(path)) {
    throw new Error(`file scope path is not an authored file: ${path}`);
  }
  return path;
}

function packageRow(value: unknown, inventory: PolicyRepositoryInventory): PolicyWorkspacePackage {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("workspace package row must be an object");
  }
  const name = Reflect.get(value, "name");
  const path = Reflect.get(value, "path");
  if (typeof name !== "string" || name.trim() !== name || name.length === 0 || hasAsciiControl(name)) {
    throw new Error("workspace package name must be a nonempty control-free string");
  }
  if (typeof path !== "string" || !isAbsolute(path)) {
    throw new Error(`workspace package ${name} path must be absolute`);
  }
  const canonical = realpathSync(path);
  if (!statSync(canonical).isDirectory()) {
    throw new Error(`workspace package ${name} path is not a directory`);
  }
  const rel = containedRelative(inventory.root, canonical, `workspace package ${name} path`);
  const packagePath = rel === "" ? "." : rel;
  const manifestPath = packagePath === "." ? "package.json" : `${packagePath}/package.json`;
  if (!inventory.paths.includes(manifestPath)) {
    throw new Error(`workspace package ${name} manifest is not authored: ${manifestPath}`);
  }
  const manifest = JSON.parse(readFileSync(resolve(inventory.root, manifestPath), "utf8")) as unknown;
  if (typeof manifest !== "object" || manifest === null || Reflect.get(manifest, "name") !== name) {
    throw new Error(`workspace package ${name} disagrees with ${manifestPath}`);
  }
  return { name, path: packagePath };
}

export function readPolicyWorkspacePackages(inventory: PolicyRepositoryInventory): readonly PolicyWorkspacePackage[] {
  const result = runNicedSync("pnpm", ["list", "-r", "--depth", "-1", "--json"], { cwd: inventory.root });
  if (result.status !== 0) {
    throw new Error(`pnpm workspace enumeration failed with exit ${String(result.status)}: ${result.stderr.trim()}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout) as unknown;
  } catch (error) {
    throw new Error("pnpm workspace enumeration returned malformed JSON", { cause: error });
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("pnpm workspace enumeration returned no packages");
  }
  const packages = parsed.map((row) => packageRow(row, inventory)).toSorted((left, right) => compare(left.name, right.name));
  if (new Set(packages.map((pkg) => pkg.name)).size !== packages.length) {
    throw new Error("pnpm workspace enumeration returned duplicate package names");
  }
  if (new Set(packages.map((pkg) => pkg.path)).size !== packages.length) {
    throw new Error("pnpm workspace enumeration returned duplicate package paths");
  }
  return packages;
}

/** THE RULING HERE SURVIVED #2472; ITS INPUT CHANGED. The deleted comment said "the remote-tracking ref is
 *  the durable published baseline even on a local main checkout", and hardcoded `origin/main` ahead of
 *  `main` accordingly. That was safe when written — it assumes a checkout whose remote tracks its work —
 *  and it is FALSE HERE: the owner pushes by hand and rarely, so `origin/main` measured 280 commits behind
 *  local main on 2026-09-20 and this `changed` scope selected 2932 files on a CLEAN tree. Every "scoped,
 *  fast inner loop" `pnpm verify --changed` on this checkout was a whole-tree run wearing a scoped label.
 *  The baseline preference is preserved and no longer assumed: `resolveMergeBase` DERIVES the closest base
 *  to HEAD, so `origin/main` still answers whenever it is not behind, and a tie still names it. */
function mergeBase(root: string): NonNullable<PolicyScopeInventoryReceipt["mergeBase"]> {
  const base = resolveMergeBase(root);
  if (base === null || !SHA_RE.test(base.commit)) {
    throw new Error("changed scope could not resolve a merge base from main or origin/main");
  }
  // Destructured, NOT spread: the resolver's `isHead` is `ops/instrument-affected.ts`'s concern (it decides
  // whether an empty selection is "on the mainline tip" or "nothing changed"), and the scope receipt is a
  // declared wire shape. Passing the whole object through would smuggle an undeclared field into it —
  // TypeScript permits that through a variable, so the contract is the only thing that says no.
  return { ref: base.ref, commit: base.commit };
}

function semanticPath(path: string, status: PolicySemanticPath["status"], previousPath: string | null = null): PolicySemanticPath {
  assertPolicyRepoPath(path, "changed Git path");
  if (previousPath !== null) {
    assertPolicyRepoPath(previousPath, "changed Git previous path");
  }
  return { path, status, previousPath };
}

function compareSemantic(left: PolicySemanticPath, right: PolicySemanticPath): number {
  return compare(left.path, right.path) || compare(left.status, right.status) || compare(left.previousPath ?? "", right.previousPath ?? "");
}

interface ParsedGitChange {
  readonly paths: readonly PolicySemanticPath[];
  readonly nextIndex: number;
}

function parseGitChange(tokens: readonly string[], index: number): ParsedGitChange {
  const statusToken = tokens[index];
  const first = tokens[index + 1];
  if (statusToken === undefined || first === undefined) {
    throw new Error("git changed stream ended before a status/path pair");
  }
  const status = statusToken.charAt(0);
  if (status === "R") {
    const target = tokens[index + 2];
    if (target === undefined) {
      throw new Error("git changed stream ended before a rename target");
    }
    return {
      paths: [semanticPath(first, "deleted"), semanticPath(target, "renamed-existing", first)],
      nextIndex: index + RENAME_TOKEN_COUNT,
    };
  }
  if (status === "D") {
    return { paths: [semanticPath(first, "deleted")], nextIndex: index + 2 };
  }
  if (status === "A") {
    return { paths: [semanticPath(first, "added")], nextIndex: index + 2 };
  }
  if (status === "M" || status === "T" || status === "U") {
    return { paths: [semanticPath(first, "modified")], nextIndex: index + 2 };
  }
  throw new Error(`git changed stream returned unsupported status ${JSON.stringify(statusToken)}`);
}

export function readPolicyChangedSelection(inventory: PolicyRepositoryInventory): PolicyChangedSelection {
  const base = mergeBase(inventory.root);
  const source = gitRead(inventory.root, [...GIT_READ_PREFIX, "diff", "--name-status", "-z", "--find-renames", base.commit]);
  const tokens = source.split("\0").filter((token) => token !== "");
  const semanticPaths: PolicySemanticPath[] = [];
  for (let index = 0; index < tokens.length; ) {
    const parsed = parseGitChange(tokens, index);
    semanticPaths.push(...parsed.paths);
    index = parsed.nextIndex;
  }
  const knownCurrent = new Set(semanticPaths.filter((path) => path.status !== "deleted").map((path) => path.path));
  for (const path of inventory.untrackedPaths) {
    if (!knownCurrent.has(path)) {
      semanticPaths.push(semanticPath(path, "added"));
    }
  }
  const identities = new Map(semanticPaths.map((path) => [`${path.status}\0${path.path}\0${path.previousPath ?? ""}`, path]));
  return { semanticPaths: [...identities.values()].toSorted(compareSemantic), mergeBase: base };
}
