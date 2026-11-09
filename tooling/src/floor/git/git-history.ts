// Git owns filename transitions; consumers own allocation and admission rules over these facts.
import { lstatSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { budgets } from "../host/load-budget.ts";
import { GIT_READ_PREFIX, runGit } from "./git.ts";
import type { GitPathChangeSet, GitPathHistory, GitPathHistoryRequest, GitPathHistoryResult } from "./git-history-contract.ts";

const COMMIT_ID = /^[0-9a-f]{40,64}$/u;
// Git's `%x01` as a log format: a byte no path or hash holds, so it splits one commit's entries from the next.
const COMMIT_MARK = "\u0001";
const CEILINGS_MS = budgets({ timeout: 30_000 });
const MAX_BYTES = 16_777_216;

function paths(source: string): readonly string[] {
  if (source !== "" && !source.endsWith("\0")) {
    throw new Error("Git filename output is not NUL-terminated");
  }
  return source === "" ? [] : source.slice(0, -1).split("\0");
}

function changes(tokens: readonly string[]): GitPathChangeSet {
  const added: string[] = [];
  const deleted: string[] = [];
  for (let index = 0; index < tokens.length; index += 2) {
    const status = tokens[index];
    const path = tokens[index + 1];
    if ((status !== "A" && status !== "D") || path === undefined || path === "") {
      throw new Error("Git filename history has malformed name-status output");
    }
    (status === "A" ? added : deleted).push(path);
  }
  return { added, deleted };
}

/** The per-commit changes of a log whose format is `COMMIT_MARK` alone: each commit's name-status entries
 *  follow its marker. A commit that changed the path without adding or deleting it carries none. */
function commitChanges(source: string): readonly GitPathChangeSet[] {
  const groups: string[][] = [];
  for (const token of paths(source)) {
    if (token === COMMIT_MARK) {
      groups.push([]);
      continue;
    }
    const group = groups.at(-1);
    if (group === undefined) {
      throw new Error("Git filename history has name-status output outside a commit");
    }
    // Git separates a format line from the name-status block with a newline, which lands on its first status.
    group.push(group.length === 0 ? token.replace(/^\n/u, "") : token);
  }
  return groups.map((group) => changes(group)).filter((set) => set.added.length + set.deleted.length > 0);
}

/** Read complete native Git history without consulting branch-name baselines or modifying the repository. */
export function readGitPathHistory(root: string, request: GitPathHistoryRequest): GitPathHistoryResult {
  const read = (args: readonly string[]): string => {
    const result = runGit(root, [...GIT_READ_PREFIX, ...args], { timeout: CEILINGS_MS.timeout, maxBuffer: MAX_BYTES });
    if (result.status !== 0) {
      throw new Error(`Git filename history cannot resolve ${args[0] ?? "command"}: ${result.stderr.trim()}`);
    }
    return result.stdout;
  };
  const repository = runGit(root, [...GIT_READ_PREFIX, "rev-parse", "--git-dir"], { timeout: CEILINGS_MS.timeout, maxBuffer: MAX_BYTES });
  try {
    if (repository.status !== 0) {
      if (hasGitWorktreeIdentity(root)) {
        throw new Error(`Git filename history cannot resolve repository: ${repository.stderr.trim()}`);
      }
      return { status: "missing", reason: "Git filename history has no repository" };
    }
    if (read(["rev-parse", "--is-shallow-repository"]).trim() !== "false") {
      throw new Error("Git filename history requires complete, non-shallow history");
    }
    const headResult = runGit(root, [...GIT_READ_PREFIX, "rev-parse", "--verify", "HEAD^{commit}"], { timeout: CEILINGS_MS.timeout, maxBuffer: MAX_BYTES });
    const head = headResult.status === 0 ? headResult.stdout.trim() : null;
    if (head !== null && !COMMIT_ID.test(head)) {
      throw new Error("Git filename history has malformed HEAD identity");
    }
    if (request.kind === "founded") {
      return { status: "ready", value: foundedHistory(read, head, request) };
    }
    const changeSets = head === null && request.kind === "head" ? [] : loggedChanges(read, request);
    return {
      status: "ready",
      value: {
        head,
        foundation: null,
        initialPaths: [],
        addedPaths: [...new Set(changeSets.flatMap((set) => set.added))].toSorted(),
        deletedPaths: [...new Set(changeSets.flatMap((set) => set.deleted))].toSorted(),
        changeSets,
      },
    };
  } catch (error) {
    return { status: "unresolved", reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Each commit's added and deleted paths under the request's path, on every ref or on HEAD's ancestry.
 *  First-parent merge diffs matter: a path a merge commit added or deleted, such as a lane's item merged in
 *  and landed by a later merge, is invisible to a plain log, which also prunes side branches whose merge
 *  is path-identical to its mainline parent. */
function loggedChanges(
  read: (args: readonly string[]) => string,
  request: Exclude<GitPathHistoryRequest, { readonly kind: "founded" }>,
): readonly GitPathChangeSet[] {
  return commitChanges(
    read([
      "log",
      ...(request.kind === "all-refs" ? ["--all"] : []),
      "--diff-merges=first-parent",
      "--no-renames",
      "--diff-filter=AD",
      "--name-status",
      "-z",
      "--format=%x01",
      "--",
      `:(literal)${request.path}`,
    ]),
  );
}

function foundedHistory(
  read: (args: readonly string[]) => string,
  head: string | null,
  request: Extract<GitPathHistoryRequest, { readonly kind: "founded" }>,
): GitPathHistory {
  if (head === null || !COMMIT_ID.test(request.foundation)) {
    throw new Error("Git filename history requires resolved HEAD and founding commit identities");
  }
  const foundation = read(["rev-parse", "--verify", `${request.foundation}^{commit}`]).trim();
  if (foundation !== request.foundation) {
    throw new Error("Git filename history founding identity differs from the requested commit");
  }
  read(["merge-base", "--is-ancestor", foundation, head]);
  const initialPaths = paths(read(["ls-tree", "-r", "--name-only", "-z", foundation, "--", `:(literal)${request.path}`]));
  const graph = read(["rev-list", "--ancestry-path", "--parents", `${foundation}..${head}`])
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((row) => row.split(" "));
  if (graph.some((row) => row.length < 2 || row.some((id) => !COMMIT_ID.test(id)))) {
    throw new Error("Git filename history has malformed ancestry output");
  }
  const descendants = new Set([foundation, ...graph.flatMap((row) => row.slice(0, 1))]);
  const changeSets: GitPathChangeSet[] = [];
  for (const [commit, ...parents] of graph) {
    if (commit === undefined) {
      throw new Error("Git filename history has no child commit identity");
    }
    // A side parent predating foundation cannot define membership of the founded tree.
    for (const parent of parents.filter((id) => descendants.has(id))) {
      changeSets.push(
        changes(paths(read(["diff-tree", "-r", "--no-renames", "--diff-filter=AD", "--name-status", "-z", parent, commit, "--", `:(literal)${request.path}`]))),
      );
    }
  }
  const value: GitPathHistory = {
    head,
    foundation,
    initialPaths: [...new Set(initialPaths)].toSorted(),
    addedPaths: [...new Set(changeSets.flatMap((set) => set.added))].toSorted(),
    deletedPaths: [...new Set(changeSets.flatMap((set) => set.deleted))].toSorted(),
    changeSets,
  };
  return value;
}

function hasGitWorktreeIdentity(root: string): boolean {
  let ancestor = resolve(root);
  for (;;) {
    // Git also discovers parent worktrees; a worktree .git file is identity, not an absent directory.
    if (lstatSync(join(ancestor, ".git"), { throwIfNoEntry: false }) !== undefined) {
      return true;
    }
    const parent = dirname(ancestor);
    if (parent === ancestor) {
      return false;
    }
    ancestor = parent;
  }
}
