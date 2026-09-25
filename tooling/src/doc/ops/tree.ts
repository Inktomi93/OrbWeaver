// Everything that TOUCHES the tree or git for the doc tool: the governed-docs walk, document reads and
// formatted writes, and the git facts the pure rules judge. Every reader takes
// the repository root so the tests drive it on a planted tree; git-dependent readers fail soft to an
// empty fact, never to a throw, because a missing branch is a drift finding and not a tool crash.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { REPO_ROOT } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { runGit } from "../../_shared/git.ts";
import type { RunNicedSyncResult } from "../../_shared/proc.ts";
import { runNicedSync } from "../../_shared/proc.ts";
import { inheritedProcessEnv } from "../../_shared/process-env.ts";
import type { CommitOutcome, DocsRootEntry, DocTree, GovernedDoc } from "../contract/types.ts";
import { DOC_TOOL_TREE_PREFIXES, DOC_TOOL_TREES } from "../contract/vocab.ts";
import { allItems } from "../lib/generated.ts";
import { isCommitId } from "../lib/items.ts";
import { basenameOf, padId, parseNumberedName } from "../lib/names.ts";
import { formatMarkdown } from "./format.ts";

refuseDirectInvocation(import.meta.url, "pnpm doc <verb>");

export const root = REPO_ROOT;
const DOCS_DIR = "docs";
const MISSION_PATH = "docs/Mission.md";
const MAIN = "main";

export function today(): string {
  return new Date().toISOString().slice(0, "YYYY-MM-DD".length);
}

/** Every git call runs on `repoRoot` alone: a git hook exports `GIT_DIR`/`GIT_INDEX_FILE` into its children,
 *  and inheriting them would aim a planted repository's command at the checkout running the hook. */
function git(repoRoot: string, args: readonly string[]): string | null {
  const result = runGit(repoRoot, args);
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

/** Every `main` commit carrying a `Closes:` trailer, newest first — the question `drift` actually asks is
 *  "which open item does some commit on `main` close", so this answers it directly instead of guessing a
 *  window: no count can outlive an arbitrarily long merge train, so any fixed window silently drops a
 *  closer that lands past it. `--grep` runs the same anchored line match `closesTrailer` does, in git's
 *  own C code, over the whole branch — on this repository's ~8k-commit history that costs under 0.1s,
 *  well inside a session-start hook's budget, so no bound by commit count or by an item's origin commit
 *  is needed. */
export function closingCommits(repoRoot = root): readonly { readonly sha: string; readonly message: string }[] {
  return commitList(repoRoot, [MAIN, "--grep=^Closes:", "-E"]);
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

/** The commit-message contract every hook commit must still meet; plumbing runs no `commit-msg` hook. */
const COMMIT_MSG_CHECK = join(root, "scripts", "commit-msg-check.sh");
/** The check's owner hand-commit waiver. A tool commit is never one, so the check runs without it. */
const HUMAN_COMMIT_WAIVER_ENV = "ORB_HUMAN_COMMIT";

/** A failed git step, with everything the child said: the sink is a refusal an operator reads. */
function gitFailure(step: string, result: RunNicedSyncResult): CommitOutcome {
  const said = `${result.stdout}${result.stderr}`.trim();
  return { ok: false, reason: `git ${step} failed (exit ${String(result.status)})${said === "" ? "" : `: ${said}`}` };
}

/** Commit the named paths ALONE, through plumbing, from a merge hook or by hand.
 *
 *  Plumbing, never `git commit`: the post-merge hook fires while git's `MERGE_HEAD` still exists, and a
 *  porcelain pathspec commit there dies with `cannot do a partial commit during a merge` (a whole-index
 *  commit would instead mint a second merge commit). A temporary index built from `HEAD` plus exactly these
 *  paths is what keeps a sibling's staged file on the shared main checkout off the commit. The message is
 *  checked against the commit-message contract first, since no `commit-msg` hook runs on this path. */
export function commitPaths(paths: readonly string[], message: string, repoRoot = root): CommitOutcome {
  const head = git(repoRoot, ["rev-parse", "--verify", "HEAD"])?.trim();
  if (head === undefined) {
    return { ok: false, reason: "git has no HEAD to commit on top of" };
  }
  const scratch = mkdtempSync(join(tmpdir(), "orb-landing-"));
  try {
    const messagePath = join(scratch, "message");
    writeFileSync(messagePath, `${message}\n`);
    const contract = runNicedSync("bash", [COMMIT_MSG_CHECK, messagePath], {
      cwd: repoRoot,
      env: inheritedProcessEnv({ [HUMAN_COMMIT_WAIVER_ENV]: undefined }),
    });
    if (contract.status !== 0) {
      return { ok: false, reason: `the landing message fails the commit-message contract: ${`${contract.stdout}${contract.stderr}`.trim()}` };
    }
    const scoped = { extra: { ["GIT_INDEX_FILE"]: join(scratch, "index") } };
    const steps: readonly (readonly [string, readonly string[]])[] = [
      ["read-tree", ["read-tree", head]],
      ["update-index", ["update-index", "--add", "--remove", "--", ...paths]],
    ];
    for (const [step, args] of steps) {
      const result = runGit(repoRoot, args, scoped);
      if (result.status !== 0) {
        return gitFailure(step, result);
      }
    }
    const tree = runGit(repoRoot, ["write-tree"], scoped);
    if (tree.status !== 0) {
      return gitFailure("write-tree", tree);
    }
    const commit = runGit(repoRoot, ["commit-tree", tree.stdout.trim(), "-p", head, "-F", messagePath]);
    if (commit.status !== 0) {
      return gitFailure("commit-tree", commit);
    }
    const sha = commit.stdout.trim();
    const subject = message.split("\n")[0] ?? "";
    const ref = runGit(repoRoot, ["update-ref", "-m", `commit: ${subject}`, "HEAD", sha, head]);
    if (ref.status !== 0) {
      return gitFailure("update-ref", ref);
    }
    // The checkout's own index follows for these paths, so `git status` reads clean for what just landed.
    const index = runGit(repoRoot, ["update-index", "--add", "--remove", "--", ...paths]);
    return index.status === 0 ? { ok: true, sha } : gitFailure("update-index", index);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** The commit that deleted item `id`'s file — its landing — or null when git has none. */
/** The highest id any file under a numbered tree ever carried, on any branch: every path git added or
 *  deleted there. A landed or removed id is a name forever (commit subjects, `Closes:` trailers and
 *  `landedCommit` key on it), so a mint counts history, not only the files on disk. Zero outside a
 *  repository, where the files alone decide. */
export function highestHistoricId(tree: "adr" | "work", repoRoot = root): number {
  const prefix = DOC_TOOL_TREES[tree];
  const res = runGit(repoRoot, ["log", "--all", "--diff-filter=AD", "--name-only", "--format=", "--", prefix]);
  if (res.status !== 0) {
    return 0;
  }
  let highest = 0;
  for (const line of res.stdout.split("\n")) {
    if (!line.startsWith(prefix)) {
      continue;
    }
    const name = parseNumberedName(basenameOf(line));
    if (name !== null) {
      highest = Math.max(highest, name.id);
    }
  }
  return highest;
}

export function landedCommit(id: number, repoRoot = root): string | null {
  const out = git(repoRoot, ["log", "-1", "--format=%H", "--diff-filter=D", "--", `:(glob)${DOC_TOOL_TREES.work}${padId(id)}-*.md`])?.trim() ?? "";
  return out === "" ? null : out;
}
