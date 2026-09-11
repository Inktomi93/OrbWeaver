// Repo-relative path primitives shared by the selection resolver and its two derived views (program
// routing, the CT view). Split out of lib/selection.ts at the @orb/tooling P6 move (size cap §4.3) so the
// three modules agree on ONE root and ONE existence test rather than re-deriving either.
import { existsSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import process from "node:process";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { inheritedProcessEnv } from "@orb/tooling/_shared/process-env";
import { UsageError } from "@orb/tooling/_shared/run-tool";
import type { ChangedPath, ChangedPathClassification, ChangedPathStatus } from "../contract/selection.ts";

export const ROOT = process.cwd();

function changedPath(path: string, status: ChangedPathStatus, previousPath: string | null = null): ChangedPath {
  return { path, status, previousPath };
}

function classifyEntries(entries: readonly ChangedPath[], root: string): ChangedPathClassification {
  const uniqueEntries = [...new Map(entries.map((entry) => [`${entry.status}\0${entry.path}`, entry])).values()];
  const paths = [...new Set(uniqueEntries.map((entry) => entry.path))];
  return {
    entries: uniqueEntries,
    paths,
    existingPaths: paths.filter((path) => existsRel(path, root)),
    deletedPaths: uniqueEntries.filter((entry) => entry.status === "deleted").map((entry) => entry.path),
  };
}

/** Parse git's NUL-delimited name-status stream. A rename is deliberately two semantic changes: old
 * deletion + existing target. Copies add only the target; the source did not change. */
function classifyGitNameStatus(source: string, root: string = ROOT): ChangedPathClassification {
  const tokens = source.split("\0").filter((token) => token !== "");
  const entries: ChangedPath[] = [];
  for (let index = 0; index < tokens.length; ) {
    const statusToken = tokens[index++] ?? "";
    const status = statusToken[0];
    const first = tokens[index++] ?? "";
    if (status === "R" || status === "C") {
      const target = tokens[index++] ?? "";
      if (status === "R") {
        entries.push(changedPath(first, "deleted"), changedPath(target, "renamed-existing", first));
      } else {
        entries.push(changedPath(target, "added", first));
      }
      continue;
    }
    if (status === "D") {
      entries.push(changedPath(first, "deleted"));
    } else if (status === "A") {
      entries.push(changedPath(first, "added"));
    } else {
      entries.push(changedPath(first, "modified"));
    }
  }
  return classifyEntries(entries, root);
}

/** VERIFY NEVER TAKES `.git/index.lock` (#1583). `git diff HEAD` is a READ, but git opportunistically
 *  REFRESHES the index's stat cache while it runs — and that refresh takes `.git/index.lock`, so a lane
 *  saw the lock held for the length of a `pnpm verify --changed` stage and read it as a git WRITE inside a
 *  checker. There is no write here (this whole tree runs `diff`/`ls-files`/`rev-parse`/`log`/`show`/
 *  `grep --cached` and nothing else — re-derived 2026-09-05), but a checker has no business locking the
 *  operator's index while they work: `--no-optional-locks` is git's own flag for exactly this reader
 *  posture (it is what an IDE polling `status` is supposed to pass). It changes no output. */
export const GIT_READ_PREFIX: readonly string[] = ["--no-optional-locks"];

/** Explicit repository roots must not inherit a caller's alternate repository or index. */
export function repoGitEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(inheritedProcessEnv()).filter(([name]) => !name.startsWith("GIT_")));
}

/** The authoritative git-changed classification: staged + unstaged vs HEAD, with rename identity. */
export function gitChangedPathClassification(root: string = ROOT): ChangedPathClassification {
  const result = runNicedSync("git", [...GIT_READ_PREFIX, "diff", "--name-status", "-z", "--find-renames", "HEAD"], { cwd: root, env: repoGitEnvironment() });
  if (result.status !== 0) {
    throw new Error(`git changed-path read failed (${String(result.status)}): ${result.stderr.trim()}`);
  }
  return classifyGitNameStatus(result.stdout, root);
}

/** Compatibility read for the structure-scoped door: deletions remain in this all-path view. */
export function gitChangedPaths(root: string = ROOT): readonly string[] {
  return gitChangedPathClassification(root).paths;
}

// THE BRANCH-DIFF READ IS GONE (#1842). `branchChangedPaths` — the merge-base diff unioned with the
// working tree — existed for ONE caller: #1523's `tests:tooling` push-tier precondition ("did this branch
// touch an instrument?"). The owner took the instrument battery off `--push` entirely on 2026-09-06, so
// the predicate (lib/registry-preconditions.ts) and this read went with the rung they served rather than
// staying as an export nothing calls. `git log -- tooling/src/verify/lib/repo-paths.ts` has it if a future
// `tierPrecondition` row needs the same question; the FIELD it hung on is still in contract/stage.ts.

/** Explicit changed/file requests carry no git status vocabulary. Classify by the one fact direct tools
 * need: current existence; the deletion-aware views still retain every normalized path. */
export function classifyExplicitPaths(raw: readonly string[], root: string = ROOT): ChangedPathClassification {
  const paths = [
    ...new Set(
      raw.map((arg) => {
        const path = toRepoRel(arg, root);
        if (path === undefined) {
          throw new UsageError(`explicit selection path resolves outside repository: ${JSON.stringify(arg)}`);
        }
        return path;
      }),
    ),
  ];
  return classifyEntries(
    paths.map((path) => changedPath(path, existsRel(path, root) ? "modified" : "deleted")),
    root,
  );
}

/** Normalize a caller-supplied path (abs or cwd-relative) to a repo-relative posix path. undefined tells
 * the explicit-selection boundary to refuse an out-of-repository operand. In-repo deletions are kept. */
function toRepoRel(arg: string, root: string = ROOT): string | undefined {
  const abs = isAbsolute(arg) ? arg : resolve(root, arg);
  const rel = relative(root, abs);
  return rel.startsWith("..") ? undefined : rel;
}

/** True iff a repo-relative path currently exists on disk. A git-changed set (`git diff --name-only HEAD`)
 *  KEEPS deletions; the per-tool file-list views (eslint/depcruise/docs — each hands CONCRETE file args to
 *  a child that errors on a nonexistent path) must drop them, while `paths` + `tsconfigs` keep them (the
 *  structure walk + the deleted file's OWNING per-package typecheck legitimately reason about a deletion). */
export function existsRel(rel: string, root: string = ROOT): boolean {
  return existsSync(resolve(root, rel));
}

export function packageDir(name: string): string {
  return name.startsWith("@orb/") ? name.slice("@orb/".length) : name;
}

// The caller-facing existence check for `--file` paths used to live HERE as `badPaths`, private to
// verify. It moved to `_shared/scoped-run-paths.ts` (#1192) when the two scoped TEST runners were found
// to have no such check at all: one rule, three doors, one refusal sentence. `lib/run-argv.ts` calls it.
