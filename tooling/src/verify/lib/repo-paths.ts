// Repo-relative path primitives shared by the selection resolver and its two derived views (program
// routing, the CT view). Split out of lib/selection.ts at the @orb/tooling P6 move (size cap §4.3) so the
// three modules agree on ONE root and ONE existence test rather than re-deriving either.
import { existsSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import process from "node:process";
import { GIT_READ_PREFIX, repoGitEnvironment } from "@orb/tooling/_shared/authored-repository";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { UsageError } from "@orb/tooling/_shared/run-tool";
import type { ChangedPath, ChangedPathClassification, ChangedPathStatus } from "../contract/selection.ts";

export const ROOT = process.cwd();

// biome-ignore lint/performance/noBarrelFile: compatibility front door keeps existing verifier imports stable after the shared path extraction.
export { GIT_READ_PREFIX, repoGitEnvironment } from "@orb/tooling/_shared/authored-repository";

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

/** The candidate mainline refs a branch's merge base is taken against. THE ORDER IS A TIE-BREAK, NOT A
 *  PREFERENCE — see `resolveMergeBase`. */
const MERGE_BASE_REFS = ["origin/main", "main"] as const;

const MERGE_BASE_SHA_RE = /^[0-9a-f]{7,64}$/u;

/** The branch point this checkout is measured from: WHICH ref answered, and the commit it resolved to. The
 *  ref is DERIVED from `MERGE_BASE_REFS` rather than re-spelled, so adding a candidate cannot leave a
 *  stale union behind; the policy receipt's own `mergeBase.ref` literal (`contract/policy-scope.ts`) is
 *  the wire shape this must stay assignable to, and tsc is the thing that notices when it stops being. */
export interface MergeBaseResolution {
  readonly ref: (typeof MERGE_BASE_REFS)[number];
  readonly commit: string;
  /** True when the base IS HEAD — this checkout sits ON the mainline tip, so there is no branch to measure
   *  and an empty committed diff is a fact about the CHECKOUT, not a clean bill of health. A caller whose
   *  selection came back empty must say which of the two it is (`ops/instrument-affected.ts` does). */
  readonly isHead: boolean;
}

/** THE ONE MERGE-BASE RESOLVER (#2472), shared with `lib/policy-repo-inventory.ts` — two copies of this
 *  question is how the two halves of "what changed" drift apart.
 *
 *  IT IS DERIVED, NOT ORDERED, AND THAT IS THE FIX. Both copies used to take the FIRST ref that resolved,
 *  with `origin/main` hardcoded ahead of `main`. In THIS repo the owner pushes by hand and rarely
 *  (`.claude/rules/orchestration.md`: "local `main` is the worktree base — the owner pushes manually, so
 *  `origin/main` can be far behind"), so that base is routinely tens of commits behind the branch point.
 *  Measured 2026-09-20 on a CLEAN local main: `origin/main` was 280 commits back and the "changed set" was
 *  **2932 files, 488 of them `tooling/src/**`** — the whole backlog, every run, wearing the word "changed".
 *
 *  THE OLD COMMENT'S SAFETY ARGUMENT WAS STRUCTURALLY INCAPABLE OF BEING ONE and has been deleted rather
 *  than softened: it said the union with the working tree "covers that". A union only ADDS paths. Nothing
 *  downstream of a stale base can shrink it.
 *
 *  THE RULE: of the candidate bases, take the one CLOSEST TO HEAD — the one every other candidate base is
 *  an ancestor of. That keeps the recorded ruling in `policy-repo-inventory.ts` intact instead of
 *  reversing it ("the remote-tracking ref is the durable published baseline"): whenever `origin/main` is
 *  NOT behind, its base is the closest one and it still wins, and an exact tie keeps it as the NAMED ref
 *  by `MERGE_BASE_REFS` order. Only when it has fallen behind does local `main` — the actual branch point
 *  — answer. Unrelated histories (neither base an ancestor of the other) keep the declared order.
 *
 *  `null` is "the question could not be answered", never "nothing changed": no candidate ref exists, or
 *  git failed. Callers must fail SAFE on it, never clean. */
export function resolveMergeBase(root: string = ROOT): MergeBaseResolution | null {
  const git = (args: readonly string[]): { readonly status: number; readonly stdout: string } => {
    const res = runNicedSync("git", [...GIT_READ_PREFIX, ...args], { cwd: root, env: repoGitEnvironment() });
    return { status: res.status ?? 1, stdout: res.stdout.trim() };
  };
  const candidates: { ref: (typeof MERGE_BASE_REFS)[number]; commit: string }[] = [];
  for (const ref of MERGE_BASE_REFS) {
    const result = git(["merge-base", "HEAD", ref]);
    if (result.status === 0 && MERGE_BASE_SHA_RE.test(result.stdout)) {
      candidates.push({ ref, commit: result.stdout });
    }
  }
  const closest = candidates.reduce<{ ref: (typeof MERGE_BASE_REFS)[number]; commit: string } | null>((best, candidate) => {
    if (best === null) {
      return candidate;
    }
    // `merge-base --is-ancestor A B` exits 0 iff A is an ancestor of B: the candidate is strictly closer
    // to HEAD. An exact tie is not "closer" and must not displace the earlier-declared ref.
    return candidate.commit !== best.commit && git(["merge-base", "--is-ancestor", best.commit, candidate.commit]).status === 0 ? candidate : best;
  }, null);
  if (closest === null) {
    return null;
  }
  const head = git(["rev-parse", "HEAD"]);
  return { ...closest, isHead: head.status === 0 && head.stdout === closest.commit };
}

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
  const base = resolveMergeBase(root);
  if (base === null) {
    return null;
  }
  const committed = git(["diff", "--name-only", "-z", base.commit, "HEAD"]);
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
