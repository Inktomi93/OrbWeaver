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

/** The git posture for a proof FIXTURE repository, whose files were just written by the proof (#2333).
 *  `core.hooksPath=/dev/null` disables hooks; `core.fsmonitor=false` beats any repository-level fsmonitor
 *  command, because command-line config outranks repository config. The fixture grammar already refuses a
 *  `.git` destination (`lib/policy-validation.ts#namesGitControlSegment`), which is the load-bearing defense:
 *  this posture covers only the runner's own `init`/`add`, and the resource readers' later git reads in the
 *  same root do not use it. Measured 2026-09-13: with the grammar clause cut, a planted `.git/config` fsmonitor
 *  still ran during the proof pass with this posture in place. Each half is pinned against a live payload in
 *  `tests/tooling/verify/lib/repo-paths.test.ts`. */
export const FIXTURE_GIT_CONFIG_ARGS: readonly string[] = ["-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false"];

/** `repoGitEnvironment` plus host-config isolation: the operator's global and system git config can also
 *  name commands (fsmonitor, filter drivers), and a fixture repository has no business reading either. */
export function fixtureGitEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries([...Object.entries(repoGitEnvironment()), ["GIT_CONFIG_GLOBAL", "/dev/null"], ["GIT_CONFIG_NOSYSTEM", "1"]]);
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

// THE BRANCH-DIFF READ WENT WITH ITS CALLER AT #1842 AND IS BACK WITH A NEW ONE (#1967, 2026-09-19).
// `branchChangedPaths` existed for #1523's `tests:tooling` push-tier precondition; the owner took the
// instrument battery off `--push` on 2026-09-06 and the read went with the rung it served, with that
// comment saying in so many words that `git log` has it "if a future row needs the same question". A
// future row does: `tests:instrument-affected` (ops/instrument-affected.ts), which runs the family tests
// of the instruments a branch CHANGED. It needs the branch answer and not the working-tree one for the
// reason #1842's own note implies — at `--push` the changes are COMMITTED and the working tree is clean,
// so a working-tree read selects nothing and the stage passes vacuously, which is the #1967 defect in a
// new costume. Restored verbatim from `8d9f25183`, including its `null`-is-not-empty contract.

/** The refs a branch's merge base is taken against, in order of preference. `origin/main` is the real
 *  base for a lane; local `main` is the fallback for a checkout with no remote (the owner pushes by hand,
 *  so `origin/main` can also be far behind — the union with the working tree below covers that). */
const MERGE_BASE_REFS = ["origin/main", "main"] as const;

/** EVERY PATH THIS BRANCH TOUCHED: the merge-base diff UNIONED with the working tree vs HEAD (#1523).
 *
 *  `null` means the question could not be answered — no usable base ref, or git failed. That is NOT an
 *  empty set: a caller gating work on "did this touch X" must RUN the work when the answer is unknown,
 *  because an uncomputable precondition that reads as "nothing changed" is the exact shape of a silent
 *  false clean. The caller (`ops/instrument-affected.ts`) fails safe on `null`. */
export function branchChangedPaths(root: string = ROOT): readonly string[] | null {
  // `runNicedSync` over `execNicedSync` DELIBERATELY: the latter returns the child's STDERR on failure,
  // which a splitter would happily turn into "changed paths". A status check is the only honest read.
  const git = (args: readonly string[]): string | null => {
    const res = runNicedSync("git", [...GIT_READ_PREFIX, ...args], { cwd: root, env: repoGitEnvironment() });
    return res.status === 0 ? res.stdout : null;
  };
  const base = MERGE_BASE_REFS.map((ref) => git(["merge-base", "HEAD", ref])?.trim()).find((sha) => sha !== undefined && /^[0-9a-f]{7,40}$/u.test(sha));
  if (base === undefined) {
    return null;
  }
  const committed = git(["diff", "--name-only", "-z", base, "HEAD"]);
  const working = git(["diff", "--name-only", "-z", "HEAD"]);
  if (committed === null || working === null) {
    return null;
  }
  return [...new Set([...committed.split("\0"), ...working.split("\0")].filter((path) => path !== ""))];
}

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
