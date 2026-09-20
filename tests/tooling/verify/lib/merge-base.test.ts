// THE MERGE-BASE DERIVATION, PINNED (#2472) — the defect this file exists to keep dead is an instrument
// that measured the WHOLE UNPUSHED BACKLOG and called it "changed".
//
// WHAT WENT WRONG, measured 2026-09-20 on this checkout's clean local main: `lib/repo-paths.ts` and
// `lib/policy-repo-inventory.ts` each hardcoded `["origin/main", "main"]` and took the FIRST ref that
// resolved. The owner of this repo pushes `origin` by hand and rarely, so `origin/main` was 280 commits
// behind local main — and "every path this branch touched" came back as 2932 files, 488 of them under
// `tooling/src/`. `tests:instrument-affected` recertified essentially the whole `tests:tooling` battery at
// every `static` barrier, and every `pnpm verify --changed` on the checkout was a whole-tree run wearing a
// scoped label. The old comment claimed "the union with the working tree below covers that"; a union only
// ADDS paths and can never shrink a stale base, which is why the fix is the base and not the union.
//
// EVERY ARM DRIVES A REAL, SYNTHETIC GIT REPOSITORY rather than the checkout the suite runs in. A pin whose
// subject is "which ref answers" cannot be written against whatever state this worktree happens to be in —
// it would pass or fail on the operator's push history, which is exactly the variable that hid the defect.
//
// RED-FIRST RECEIPT: the `branchChangedPaths` arms below are written against the signature the UNMODIFIED
// source already had (`readonly string[] | null`), so they compile and RUN against pre-fix `repo-paths.ts`
// — and they go red there, naming the backlog file. They are a defect proof, not a build error.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { branchChangedPaths, resolveMergeBase } from "../../../../tooling/src/verify/lib/repo-paths.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

/** Isolate every fixture repository from the operator's git configuration and from any inherited GIT_*.
 *  Built through `fromEntries` because env-var names are SCREAMING_SNAKE and an object literal spelling
 *  them is a `useNamingConvention` violation. */
const GIT_ENV: NodeJS.ProcessEnv = Object.fromEntries([
  ["PATH", "/usr/bin:/bin"],
  ["HOME", "/nonexistent"],
  ["GIT_CONFIG_GLOBAL", "/dev/null"],
  ["GIT_CONFIG_NOSYSTEM", "1"],
  ["GIT_AUTHOR_NAME", "pin"],
  ["GIT_AUTHOR_EMAIL", "pin@example.invalid"],
  ["GIT_COMMITTER_NAME", "pin"],
  ["GIT_COMMITTER_EMAIL", "pin@example.invalid"],
]);

function git(repo: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: repo, env: GIT_ENV, encoding: "utf-8" }).trim();
}

/** Commit one file, so each commit is identifiable by the path it introduced. */
function commit(repo: string, path: string): void {
  const abs = join(repo, path);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, `${path}\n`);
  git(repo, "add", "--all");
  git(repo, "commit", "--quiet", "--message", `add ${path}`);
}

/**
 * THE REPOSITORY SHAPE THIS REPO ACTUALLY HAS.
 *
 *   origin/main ──▶ backlog.ts ──▶ main ──▶ lane.ts (HEAD, branch `lane`)
 *
 * `backlog.ts` is a commit that is ON local main and NOT published — the 280-commit `@orb/inference`
 * program, in miniature. `lane.ts` is the branch's own work. A correct base answers "lane.ts"; the old
 * first-ref-wins base answers "backlog.ts AND lane.ts", which is the defect.
 *
 * `origin/main` is created as a REAL remote-tracking ref (`refs/remotes/origin/main`) with no network and
 * no remote repository: it is a ref, and `merge-base` does not care how it got there.
 */
function laneRepo(scratch: string, name: string): string {
  const repo = join(scratch, name);
  mkdirSync(repo, { recursive: true });
  git(repo, "init", "--quiet", "--initial-branch", "main");
  commit(repo, "published.ts");
  const published = git(repo, "rev-parse", "HEAD");
  git(repo, "update-ref", "refs/remotes/origin/main", published);
  commit(repo, "backlog.ts");
  git(repo, "checkout", "--quiet", "-b", "lane");
  commit(repo, "lane.ts");
  return repo;
}

test("the base is the branch point, NOT a far-behind origin/main — the backlog is not this branch's work", ({ scratch }) => {
  const repo = laneRepo(scratch, "lane");
  const changed = branchChangedPaths(repo);
  // Not `toEqual([...])`: the CLAIM is about which commits the base excludes, and an exact-array assertion
  // would also be asserting the ordering of a Set spread, which is not the property under test.
  expect(changed).not.toBeNull();
  expect(changed).toContain("lane.ts");
  expect(changed, "the unpushed backlog belongs to main, not to this branch").not.toContain("backlog.ts");
  expect(changed, "a commit older than origin/main can never be in a branch answer").not.toContain("published.ts");
});

test("…and it NAMES the ref it chose, so an empty or enormous answer is readable", ({ scratch }) => {
  const repo = laneRepo(scratch, "named");
  const base = resolveMergeBase(repo);
  expect(base?.ref).toBe("main");
  expect(base?.commit).toBe(git(repo, "rev-parse", "main"));
  expect(base?.isHead).toBe(false);
});

// THE OTHER DIRECTION, and the reason the fix is a DERIVATION rather than a flipped array. The recorded
// ruling in `policy-repo-inventory.ts` — "the remote-tracking ref is the durable published baseline" —
// survives: when `origin/main` is NOT behind, it is still the base and still the named ref. Swapping the
// array to `["main", "origin/main"]` would have passed the arm above and FAILED this one.
test("when origin/main is AHEAD of local main it is still the base — the published-baseline ruling survives", ({ scratch }) => {
  const repo = join(scratch, "ahead");
  mkdirSync(repo, { recursive: true });
  git(repo, "init", "--quiet", "--initial-branch", "main");
  commit(repo, "published.ts");
  const staleMain = git(repo, "rev-parse", "HEAD");
  commit(repo, "newer-upstream.ts");
  git(repo, "update-ref", "refs/remotes/origin/main", git(repo, "rev-parse", "HEAD"));
  // Local `main` is left BEHIND at the first commit, which is the "fetched but never fast-forwarded"
  // checkout. The branch forks from the UPSTREAM tip.
  git(repo, "checkout", "--quiet", "-b", "lane");
  git(repo, "branch", "--quiet", "--force", "main", staleMain);
  commit(repo, "lane.ts");

  const base = resolveMergeBase(repo);
  expect(base?.ref).toBe("origin/main");
  expect(base?.commit).toBe(git(repo, "rev-parse", "refs/remotes/origin/main"));
  expect(branchChangedPaths(repo), "the upstream commit is not this branch's work either").not.toContain("newer-upstream.ts");
});

test("an exact tie keeps origin/main as the NAMED ref — the declared order is the tie-break", ({ scratch }) => {
  const repo = join(scratch, "tie");
  mkdirSync(repo, { recursive: true });
  git(repo, "init", "--quiet", "--initial-branch", "main");
  commit(repo, "published.ts");
  git(repo, "update-ref", "refs/remotes/origin/main", git(repo, "rev-parse", "HEAD"));
  git(repo, "checkout", "--quiet", "-b", "lane");
  commit(repo, "lane.ts");
  expect(resolveMergeBase(repo)?.ref).toBe("origin/main");
});

// THE ARM THE ORCHESTRATOR'S COMPENSATING CONTROL KEYS ON. On the mainline tip the base IS HEAD, so the
// affected set is legitimately empty — and that emptiness must be DISTINGUISHABLE from "I measured and
// found nothing changed", because a caller that cannot tell them apart prints a clean zero over a checkout
// it never examined (`ops/instrument-affected.ts` turns this flag into a `[verify-notice]`).
test("on the mainline tip the base IS HEAD, and it says so rather than reporting a bare empty set", ({ scratch }) => {
  const repo = join(scratch, "on-main");
  mkdirSync(repo, { recursive: true });
  git(repo, "init", "--quiet", "--initial-branch", "main");
  commit(repo, "published.ts");
  git(repo, "update-ref", "refs/remotes/origin/main", git(repo, "rev-parse", "HEAD"));
  commit(repo, "backlog.ts");

  const base = resolveMergeBase(repo);
  expect(base?.isHead, "HEAD is main's tip, so there is no branch to measure").toBe(true);
  expect(base?.commit).toBe(git(repo, "rev-parse", "HEAD"));
  expect(branchChangedPaths(repo)).toEqual([]);
});

// THE BARE-ZERO LAW. A repository with NO candidate ref cannot answer the question, and "cannot answer"
// must never collapse into "nothing changed" — `ops/instrument-affected.ts` runs the WHOLE battery on
// `null`. A planted positive control sits beside it: the same fixture WITH a ref answers non-null, so a
// green here is never just "the helper always returns null".
test("no usable base ref is UNCOMPUTABLE (null), never an empty changed set", ({ scratch }) => {
  const repo = join(scratch, "orphan");
  mkdirSync(repo, { recursive: true });
  git(repo, "init", "--quiet", "--initial-branch", "solo");
  commit(repo, "only.ts");

  expect(resolveMergeBase(repo), "neither `main` nor `origin/main` exists here").toBeNull();
  expect(branchChangedPaths(repo)).toBeNull();

  // The control: give the SAME repository a `main` ref and the identical call answers.
  git(repo, "branch", "main", "HEAD");
  expect(resolveMergeBase(repo)).not.toBeNull();
});
