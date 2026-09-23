// Everything that TOUCHES the tree or git for the doc tool: the governed-docs walk, document reads and
// formatted writes, and the git facts the pure rules judge. Every reader takes
// the repository root so the tests drive it on a planted tree; git-dependent readers fail soft to an
// empty fact, never to a throw, because a missing branch is a drift finding and not a tool crash.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DOC_TOOL_TREE_PREFIXES, DOC_TOOL_TREES, formatMarkdown } from "#doc-catalog";
import { REPO_ROOT } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { runNicedSync } from "../../_shared/proc.ts";
import { inheritedProcessEnv } from "../../_shared/process-env.ts";
import type { DocsRootEntry, DocTree, GovernedDoc } from "../contract/types.ts";
import { allItems } from "../lib/generated.ts";
import { isCommitId } from "../lib/items.ts";
import { padId } from "../lib/names.ts";

refuseDirectInvocation(import.meta.url, "pnpm doc <verb>");

export const root = REPO_ROOT;
const DOCS_DIR = "docs";
const MISSION_PATH = "docs/Mission.md";
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

/** Every file under `rel`, any extension, sorted; a walk that read `.md` only would never see a stray. */
function walkFiles(repoRoot: string, rel: string): readonly string[] {
  const abs = join(repoRoot, rel);
  if (!existsSync(abs)) {
    return [];
  }
  const found: string[] = [];
  for (const entry of readdirSync(abs, { withFileTypes: true }).toSorted((left, right) => left.name.localeCompare(right.name))) {
    const path = `${rel}${entry.name}`;
    if (entry.isDirectory()) {
      found.push(...walkFiles(repoRoot, `${path}/`));
    } else {
      found.push(path);
    }
  }
  return found;
}

/** Every file under the governed trees, from the FILESYSTEM: a freshly minted, not-yet-tracked file must
 *  be judged too, or a lane could commit a broken one. */
function governedFiles(repoRoot = root): readonly string[] {
  return DOC_TOOL_TREE_PREFIXES.flatMap((prefix) => walkFiles(repoRoot, prefix));
}

/** The markdown files under the governed trees plus the mission doc. */
export function governedPaths(repoRoot = root): readonly string[] {
  const paths = governedFiles(repoRoot).filter((path) => path.endsWith(".md"));
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

export function readDocTree(repoRoot = root): DocTree {
  const docs = governedPaths(repoRoot).map((path) => readDoc(path, repoRoot));
  const evidence = new Set(allItems(docs).flatMap((item) => (item.state === "done" && item.evidence !== null ? [item.evidence] : [])));
  return {
    root: docsRoot(repoRoot),
    docs,
    files: governedFiles(repoRoot),
    evidenceOnMain: new Set([...evidence].filter((sha) => commitOnMain(sha, repoRoot))),
  };
}

/** A document as the repo's own formatter writes it, so a minted or rewritten file is born canonical.
 *  A formatter REFUSAL (a defect in the prose the tool did not touch) keeps the bytes as given — the
 *  format check reports the defect by name; losing the structural write would hide it. */
export function formattedDoc(source: string): string {
  const { output, refusal } = formatMarkdown(source);
  return refusal === null ? output : source;
}

export function writeDoc(path: string, source: string, repoRoot = root): void {
  const abs = join(repoRoot, path);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, formattedDoc(source));
}

/** Every tracked TEXT file's path, for the path rewrites `archive` and a retitling `set` do. */
function trackedTextFiles(repoRoot = root): readonly string[] {
  const out = git(repoRoot, ["ls-files", "-z"]);
  return out === null ? [] : out.split("\0").filter((path) => path !== "" && /\.(?:md|ts|tsx|js|cjs|mjs|json|yaml|yml|sh)$/u.test(path));
}

/** The tracked text files plus the governed docs, which a fresh mint may not have tracked yet. */
export function textFiles(repoRoot = root): readonly string[] {
  return [...new Set([...trackedTextFiles(repoRoot), ...governedPaths(repoRoot)])].filter((path) => existsSync(join(repoRoot, path)));
}

/** Apply `rewrite` to every text file and write the ones it changes; returns their paths. */
export function rewriteTextFiles(rewrite: (path: string, source: string) => string, repoRoot = root): readonly string[] {
  const touched: string[] = [];
  for (const path of textFiles(repoRoot)) {
    const abs = join(repoRoot, path);
    const source = readFileSync(abs, "utf8");
    const next = rewrite(path, source);
    if (next !== source) {
      writeFileSync(abs, next);
      touched.push(path);
    }
  }
  return touched;
}

export function isMainBranch(repoRoot = root): boolean {
  return git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"])?.trim() === MAIN;
}

/** True when `sha` names a commit reachable from `main`. The value comes from a doc, so its SHAPE is
 *  judged first and it is passed after `--end-of-options`: `--help` is never a flag here. */
export function commitOnMain(sha: string, repoRoot = root): boolean {
  return isCommitId(sha) && git(repoRoot, ["merge-base", "--is-ancestor", "--end-of-options", sha, MAIN]) !== null;
}

export function headCommit(repoRoot = root): string | null {
  return git(repoRoot, ["rev-parse", "HEAD"])?.trim() ?? null;
}

/** The commits a merge just brought in, oldest first. The range is picked by which hook is asking, never
 *  by HEAD's shape: `headMerge` (post-commit, the door for a merge finished by a separate `git commit` —
 *  `--no-commit` or a conflict resolution) reads `HEAD^1..HEAD`, the merge commit's own second-parent
 *  range. Its absence (post-merge) reads `ORIG_HEAD..HEAD`. Shape is not a safe proxy for which hook fired:
 *  a fast-forward onto a branch whose TIP already is a merge commit still fires post-merge, and
 *  `HEAD^1..HEAD` there would see only that merge's second-parent side and drop every id the fast-forward
 *  carried in on the first-parent side. Empty when git cannot say. */
export function mergedCommits(repoRoot = root, headMerge = false): readonly { readonly sha: string; readonly message: string }[] {
  return commitList(repoRoot, [headMerge ? "HEAD^1..HEAD" : "ORIG_HEAD..HEAD"]);
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

/** The one tree fact a wake condition may ask: does this repository path exist. */
export function pathExists(path: string, repoRoot = root): boolean {
  return existsSync(join(repoRoot, path));
}

/** Stage the named paths and commit THEM ALONE (a pathspec commit ignores the rest of the index, so a
 *  sibling's staged file on the shared main checkout never rides a hook's commit). The child inherits the
 *  process environment for PATH and git identity; the standing exception spelling (`LEFTHOOK_EXCLUDE=check`)
 *  is what lets a hook's commit skip the whole-tree check and keep the message contract. */
export function commitPaths(paths: readonly string[], message: string, repoRoot = root): boolean {
  // A deleted path is staged as a removal, and it joins the pathspec only when HEAD tracks it: a pathspec
  // naming a file git never knew fails the whole commit.
  const present = paths.filter((path) => existsSync(join(repoRoot, path)));
  const gone = paths.filter((path) => !existsSync(join(repoRoot, path)));
  if (present.length > 0 && git(repoRoot, ["add", "--", ...present]) === null) {
    return false;
  }
  if (gone.length > 0 && git(repoRoot, ["rm", "-q", "--cached", "--ignore-unmatch", "--", ...gone]) === null) {
    return false;
  }
  const tracked = gone.length === 0 ? "" : (git(repoRoot, ["ls-tree", "-r", "--name-only", "HEAD", "--", ...gone]) ?? "");
  const pathspec = [...present, ...tracked.split("\n").filter((path) => path !== "")];
  if (pathspec.length === 0) {
    return true;
  }
  const env = inheritedProcessEnv({ ["LEFTHOOK_EXCLUDE"]: "check" });
  return runNicedSync("git", ["commit", "-q", "-m", message, "--", ...pathspec], { cwd: repoRoot, env }).status === 0;
}

/** The commit that deleted item `id`'s file — its landing — or null when git has none. */
export function landedCommit(id: number, repoRoot = root): string | null {
  const out = git(repoRoot, ["log", "-1", "--format=%H", "--diff-filter=D", "--", `:(glob)${DOC_TOOL_TREES.work}${padId(id)}-*.md`])?.trim() ?? "";
  return out === "" ? null : out;
}
