// The proof-fixture git posture (#2333). The resource runner writes fixture files and then runs `git init`
// and `git add --all` in the fixture root, so any config git reads there can name a command. The fixture
// grammar refuses a `.git` destination; this posture is the second layer. Each half is measured against a live
// payload that only its own clause stops:
//   - repository config `core.fsmonitor`: stopped by `-c core.fsmonitor=false` (command line outranks repo);
//   - host-global `core.attributesFile` + a `filter` driver that `git add` runs: stopped only by the
//     global/system config isolation. (A host-global fsmonitor is ALSO stopped by the `-c` override, so a
//     host fsmonitor payload cannot discriminate the isolation clause; measured 2026-09-13.)
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFixtureGit } from "@orb/tooling/_shared/git-fixture";
import {
  branchChangedPaths,
  FIXTURE_GIT_CONFIG_ARGS,
  fixtureGitEnvironment,
  repoGitEnvironment,
  resolveMergeBase,
} from "../../../../tooling/src/verify/lib/repo-paths.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

interface PayloadRun {
  readonly label: string;
  readonly plant: "repository-fsmonitor" | "host-filter";
  readonly args: readonly string[];
  readonly env: NodeJS.ProcessEnv;
}

/** Run the runner's two git steps in a fresh repository whose config names a sentinel-touching payload, and
 *  report whether the payload ran. Every planted config is valid, so a non-run is never a parse failure; the
 *  filter payload passes content through and exits 0 so `git add` itself succeeds either way. */
function payloadRan(scratch: string, { label, plant, args, env }: PayloadRun): boolean {
  const repo = join(scratch, `repo-${label}`);
  const home = join(scratch, `home-${label}`);
  const sentinel = join(scratch, `sentinel-${label}`);
  const script = join(scratch, `payload-${label}.sh`);
  mkdirSync(join(repo, ".git"), { recursive: true });
  mkdirSync(home);
  writeFileSync(join(repo, "a.txt"), "a\n");
  if (plant === "repository-fsmonitor") {
    writeFileSync(script, `#!/bin/sh\ntouch '${sentinel}'\nexit 1\n`);
    writeFileSync(join(repo, ".git", "config"), `[core]\n\tfsmonitor = ${script}\n`);
  } else {
    writeFileSync(script, `#!/bin/sh\ntouch '${sentinel}'\ncat\n`);
    const attributes = join(home, "attributes");
    writeFileSync(attributes, "* filter=cbbasprobe\n");
    writeFileSync(join(home, ".gitconfig"), `[core]\n\tattributesFile = ${attributes}\n[filter "cbbasprobe"]\n\tclean = ${script}\n`);
  }
  chmodSync(script, 0o755);
  // HOME/XDG point the host-global config lookup at the planted home, so no arm reads the operator's real
  // configuration.
  const withHome: NodeJS.ProcessEnv = Object.fromEntries([...Object.entries(env), ["HOME", home], ["XDG_CONFIG_HOME", join(home, ".config")]]);
  execFileSync("git", [...args, "init", "--quiet"], { cwd: repo, env: withHome });
  execFileSync("git", [...args, "add", "--all"], { cwd: repo, env: withHome });
  return existsSync(sentinel);
}

const HOOKS_ONLY = ["-c", "core.hooksPath=/dev/null"];

test("without the fixture posture git executes a repository fsmonitor payload and a host filter payload (the controls are live)", ({ scratch }) => {
  expect(payloadRan(scratch, { label: "repo-control", plant: "repository-fsmonitor", args: HOOKS_ONLY, env: repoGitEnvironment() })).toBe(true);
  expect(payloadRan(scratch, { label: "host-control", plant: "host-filter", args: HOOKS_ONLY, env: repoGitEnvironment() })).toBe(true);
});

test("the fixture config arguments neutralize a repository fsmonitor command", ({ scratch }) => {
  expect(payloadRan(scratch, { label: "repo-posture", plant: "repository-fsmonitor", args: FIXTURE_GIT_CONFIG_ARGS, env: repoGitEnvironment() })).toBe(false);
});

test("the fixture environment neutralizes a host-config filter command", ({ scratch }) => {
  expect(payloadRan(scratch, { label: "host-posture", plant: "host-filter", args: HOOKS_ONLY, env: fixtureGitEnvironment() })).toBe(false);
});

test("the fixture environment still strips inherited GIT_ redirections", () => {
  expect(
    Object.keys(fixtureGitEnvironment()).filter((name) => name.startsWith("GIT_") && name !== "GIT_CONFIG_GLOBAL" && name !== "GIT_CONFIG_NOSYSTEM"),
  ).toEqual([]);
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE MERGE-BASE DERIVATION, PINNED (#2472). Same module, second subject: `resolveMergeBase` +
// `branchChangedPaths`, folded in here because `repo-paths.ts` is their source and a spec named after a
// module that was never extracted is a `test-layout` mirror miss. The defect these arms keep dead is an
// instrument that measured the WHOLE UNPUSHED BACKLOG and called it "changed".
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
// ══════════════════════════════════════════════════════════════════════════════════════════════════════

function git(repo: string, ...args: string[]): string {
  return execFixtureGit(repo, ["-c", "user.name=pin", "-c", "user.email=pin@example.invalid", ...args]).trim();
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
