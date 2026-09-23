// Everything that TOUCHES the tree or git for the doc tool: the governed-docs walk, document reads and
// formatted writes, the registry anchors, and the git facts the pure rules judge. Every reader takes
// the repository root so the tests drive it on a planted tree; git-dependent readers fail soft to an
// empty fact, never to a throw, because a missing branch is a drift finding and not a tool crash.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DOC_TOOL_TREE_PREFIXES, formatMarkdown, stableRulingAnchors } from "#doc-catalog";
import { REPO_ROOT } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { runNicedSync } from "../../_shared/proc.ts";
import { inheritedProcessEnv } from "../../_shared/process-env.ts";
import type { DocsRootEntry, DocTree, GovernedDoc } from "../contract/types.ts";
import { reservedRange } from "../lib/ledger.ts";

refuseDirectInvocation(import.meta.url, "pnpm doc <verb>");

export const root = REPO_ROOT;
const DOCS_DIR = "docs";
const MISSION_PATH = "docs/Mission.md";
const REGISTRY_PATH = "docs/architecture/core/Core-Path-Registry.md";
const MAIN = "main";
/** How far back `drift` reads `main` for `Closes:` trailers — enough for a day of merge trains. */
const RECENT_MAIN_COMMITS = "200";

export function today(): string {
  return new Date().toISOString().slice(0, "YYYY-MM-DD".length);
}

function git(repoRoot: string, args: readonly string[]): string | null {
  const result = runNicedSync("git", args, { cwd: repoRoot });
  return result.status === 0 ? result.stdout : null;
}

function walkMarkdown(repoRoot: string, rel: string): readonly string[] {
  const abs = join(repoRoot, rel);
  if (!existsSync(abs)) {
    return [];
  }
  const found: string[] = [];
  for (const entry of readdirSync(abs, { withFileTypes: true }).toSorted((left, right) => left.name.localeCompare(right.name))) {
    const path = `${rel}${entry.name}`;
    if (entry.isDirectory()) {
      found.push(...walkMarkdown(repoRoot, `${path}/`));
    } else if (entry.name.endsWith(".md")) {
      found.push(path);
    }
  }
  return found;
}

/** Every markdown file under the governed trees plus the mission doc, from the FILESYSTEM: a freshly
 *  minted, not-yet-tracked file must be judged too, or a lane could commit a broken one. */
export function governedPaths(repoRoot = root): readonly string[] {
  const paths = DOC_TOOL_TREE_PREFIXES.flatMap((prefix) => walkMarkdown(repoRoot, prefix));
  return existsSync(join(repoRoot, MISSION_PATH)) ? [...paths, MISSION_PATH] : paths;
}

export function readDoc(path: string, repoRoot = root): GovernedDoc {
  return { path, source: readFileSync(join(repoRoot, path), "utf8") };
}

function docsRoot(repoRoot: string): readonly DocsRootEntry[] {
  const abs = join(repoRoot, DOCS_DIR);
  if (!existsSync(abs)) {
    return [];
  }
  return readdirSync(abs, { withFileTypes: true }).map((entry) => ({ name: entry.name, directory: entry.isDirectory() }));
}

/** The registry's anchored ids and reserved range, or empty when the legacy registry is gone. */
export function registryFacts(repoRoot = root): Pick<DocTree, "registryIds" | "reserved"> {
  const abs = join(repoRoot, REGISTRY_PATH);
  if (!existsSync(abs)) {
    return { registryIds: new Set(), reserved: null };
  }
  const ids = new Set([...stableRulingAnchors(repoRoot).keys()].map(Number));
  return { registryIds: ids, reserved: reservedRange(readFileSync(abs, "utf8")) };
}

export function readDocTree(repoRoot = root): DocTree {
  return { root: docsRoot(repoRoot), docs: governedPaths(repoRoot).map((path) => readDoc(path, repoRoot)), ...registryFacts(repoRoot) };
}

/** Write a document through the repo's own formatter so a minted or rewritten file is born canonical.
 *  A formatter REFUSAL (a defect in the prose the tool did not touch) writes the bytes as given — the
 *  format check reports the defect by name; losing the structural write would hide it. */
export function writeDoc(path: string, source: string, repoRoot = root): void {
  const { output, refusal } = formatMarkdown(source);
  const abs = join(repoRoot, path);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, refusal === null ? output : source);
}

/** Every tracked TEXT file's path, for the literal path rewrite `archive` does. */
export function trackedTextFiles(repoRoot = root): readonly string[] {
  const out = git(repoRoot, ["ls-files", "-z"]);
  return out === null ? [] : out.split("\0").filter((path) => path !== "" && /\.(?:md|ts|tsx|js|cjs|mjs|json|yaml|yml|sh)$/u.test(path));
}

export function currentBranch(repoRoot = root): string | null {
  return git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"])?.trim() ?? null;
}

export function isMainBranch(repoRoot = root): boolean {
  return currentBranch(repoRoot) === MAIN;
}

/** True when `sha` names a commit reachable from `main`. */
export function commitOnMain(sha: string, repoRoot = root): boolean {
  return git(repoRoot, ["merge-base", "--is-ancestor", sha, MAIN]) !== null;
}

export function headCommit(repoRoot = root): string | null {
  return git(repoRoot, ["rev-parse", "HEAD"])?.trim() ?? null;
}

/** The commits a merge just brought in: `ORIG_HEAD..HEAD`, oldest first. Empty when git cannot say. */
export function mergedCommits(repoRoot = root): readonly { readonly sha: string; readonly message: string }[] {
  return commitList(repoRoot, ["ORIG_HEAD..HEAD"]);
}

/** Recent `main` commits with their full messages, newest first. */
export function recentMainCommits(repoRoot = root): readonly { readonly sha: string; readonly message: string }[] {
  return commitList(repoRoot, [MAIN, "-n", RECENT_MAIN_COMMITS]);
}

function commitList(repoRoot: string, range: readonly string[]): readonly { readonly sha: string; readonly message: string }[] {
  const out = git(repoRoot, ["log", "--format=%H%x00%B%x01", ...range]);
  if (out === null) {
    return [];
  }
  return out
    .split("\u0001")
    .map((chunk) => chunk.replace(/^\n+/u, ""))
    .filter((chunk) => chunk.includes("\0"))
    .map((chunk) => {
      const [sha = "", message = ""] = chunk.split("\0");
      return { sha: sha.trim(), message };
    });
}

/** Branch names of every worktree beyond the main checkout. */
export function worktreeBranches(repoRoot = root): readonly string[] {
  const out = git(repoRoot, ["worktree", "list", "--porcelain"]);
  if (out === null) {
    return [];
  }
  return out
    .split("\n")
    .filter((line) => line.startsWith("branch refs/heads/"))
    .map((line) => line.slice("branch refs/heads/".length))
    .filter((branch) => branch !== MAIN);
}

export function unmergedBranches(repoRoot = root): readonly string[] {
  const out = git(repoRoot, ["branch", "--no-merged", MAIN, "--format=%(refname:short)"]);
  return out === null ? [] : out.split("\n").filter((line) => line !== "");
}

/** One git pass for the soft freshness tier: date + changed paths per commit since `since`. */
export function changesSince(since: string, repoRoot = root): string {
  return git(repoRoot, ["log", `--since=${since}`, "--name-only", "--format=%cs"]) ?? "";
}

/** Run a wake command; true when it exits 0. Never throws — a broken command is an unmet condition. */
export function wakeMet(command: string, repoRoot = root): boolean {
  return runNicedSync("bash", ["-lc", command], { cwd: repoRoot }).status === 0;
}

/** Stage paths and commit with the house message contract (a hook's own commit, on `main` only). The
 *  child inherits the process environment for PATH and git identity; the standing exception spelling
 *  (`LEFTHOOK_EXCLUDE=check`) is what lets a hook's commit skip the whole-tree check and keep the
 *  message contract. */
export function commitPaths(paths: readonly string[], message: string, repoRoot = root): boolean {
  if (git(repoRoot, ["add", "--", ...paths]) === null) {
    return false;
  }
  const env = inheritedProcessEnv({ ["LEFTHOOK_EXCLUDE"]: "check" });
  return runNicedSync("git", ["commit", "-q", "-m", message], { cwd: repoRoot, env }).status === 0;
}
