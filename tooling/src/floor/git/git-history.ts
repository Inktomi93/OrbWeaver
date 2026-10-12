// Git owns filename transitions; consumers own allocation and admission rules over these facts.
import { lstatSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { budget } from "../host/load-budget.ts";
import { GIT_READ_PREFIX, runGit } from "./git.ts";
import type { GitPathHistory, GitPathHistoryRequest, GitPathHistoryResult } from "./git-history-contract.ts";

const COMMIT_ID = /^[0-9a-f]{40,64}$/u;
const TIMEOUT_BASE_MS = 30_000;
const TIMEOUT_MS = budget(TIMEOUT_BASE_MS);
const MAX_BYTES = 16_777_216;

function paths(source: string): readonly string[] {
  if (source !== "" && !source.endsWith("\0")) {
    throw new Error("Git filename output is not NUL-terminated");
  }
  return source === "" ? [] : source.slice(0, -1).split("\0");
}

function changes(source: string): { readonly added: readonly string[]; readonly deleted: readonly string[] } {
  const tokens = paths(source);
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

/** Read complete native Git history without consulting branch-name baselines or modifying the repository. */
export function readGitPathHistory(root: string, request: GitPathHistoryRequest): GitPathHistoryResult {
  const read = (args: readonly string[]): string => {
    const result = runGit(root, [...GIT_READ_PREFIX, ...args], { timeout: TIMEOUT_MS, maxBuffer: MAX_BYTES });
    if (result.status !== 0) {
      throw new Error(`Git filename history cannot resolve ${args[0] ?? "command"}: ${result.stderr.trim()}`);
    }
    return result.stdout;
  };
  const repository = runGit(root, [...GIT_READ_PREFIX, "rev-parse", "--git-dir"], { timeout: TIMEOUT_MS, maxBuffer: MAX_BYTES });
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
    const headResult = runGit(root, [...GIT_READ_PREFIX, "rev-parse", "--verify", "HEAD^{commit}"], { timeout: TIMEOUT_MS, maxBuffer: MAX_BYTES });
    const head = headResult.status === 0 ? headResult.stdout.trim() : null;
    if (head !== null && !COMMIT_ID.test(head)) {
      throw new Error("Git filename history has malformed HEAD identity");
    }
    if (request.kind === "all-refs") {
      const history = changes(
        read(["log", "--all", "--no-renames", "--diff-filter=AD", "--name-status", "-z", "--format=", "--", `:(literal)${request.path}`]),
      );
      return {
        status: "ready",
        value: {
          head,
          foundation: null,
          initialPaths: [],
          addedPaths: [...new Set(history.added)].toSorted(),
          deletedPaths: [...new Set(history.deleted)].toSorted(),
        },
      };
    }
    return { status: "ready", value: foundedHistory(read, head, request) };
  } catch (error) {
    return { status: "unresolved", reason: error instanceof Error ? error.message : String(error) };
  }
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
  const added: string[] = [];
  const deleted: string[] = [];
  for (const [commit, ...parents] of graph) {
    if (commit === undefined) {
      throw new Error("Git filename history has no child commit identity");
    }
    // A side parent predating foundation cannot define membership of the founded tree.
    for (const parent of parents.filter((id) => descendants.has(id))) {
      const delta = changes(
        read(["diff-tree", "-r", "--no-renames", "--diff-filter=AD", "--name-status", "-z", parent, commit, "--", `:(literal)${request.path}`]),
      );
      added.push(...delta.added);
      deleted.push(...delta.deleted);
    }
  }
  const value: GitPathHistory = {
    head,
    foundation,
    initialPaths: [...new Set(initialPaths)].toSorted(),
    addedPaths: [...new Set(added)].toSorted(),
    deletedPaths: [...new Set(deleted)].toSorted(),
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
