// The one git door: every spawn names its root, starts from an environment with the `GIT_*` namespace
// dropped (the variables a git hook exports to its children), and adds only the keys a caller spells.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execGit, GIT_READ_PREFIX, repoGitEnvironment, runGit } from "../../../tooling/src/_shared/git.ts";
import { inheritedProcessEnv, withProcessEnv } from "../../../tooling/src/_shared/process-env.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

/** Env records are built from entries: the keys are git's own SCREAMING names, not object members. */
function env(entries: readonly (readonly [string, string])[]): NodeJS.ProcessEnv {
  return Object.fromEntries(entries);
}

test("repoGitEnvironment drops every GIT_* key and keeps the rest", () => {
  const cleaned = repoGitEnvironment(
    env([
      ["GIT_DIR", "/x/.git"],
      ["GIT_INDEX_FILE", "/x/index"],
      ["PATH", "/bin"],
      ["HOME", "/h"],
    ]),
  );
  expect(cleaned).toEqual(
    env([
      ["PATH", "/bin"],
      ["HOME", "/h"],
    ]),
  );
});

test("a hook-exported GIT_DIR never reaches the child, so the command reads the root it was given", async () => {
  const foreign = mkdtempSync(join(tmpdir(), "orb-git-door-foreign-"));
  const root = mkdtempSync(join(tmpdir(), "orb-git-door-root-"));
  try {
    execGit(foreign, ["init", "-q", "-b", "main"]);
    execGit(root, ["init", "-q", "-b", "other"]);
    // `symbolic-ref` names an unborn branch; `rev-parse HEAD` needs a commit neither repository has.
    const branch = await withProcessEnv("GIT_DIR", join(foreign, ".git"), () => Promise.resolve(execGit(root, ["symbolic-ref", "--short", "HEAD"]).trim()));
    expect(branch, "GIT_DIR pointed at the foreign repository; the door must still answer for root").toBe("other");
  } finally {
    rmSync(foreign, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
});

test("extra keys are applied after the drop, and only the spelled ones", () => {
  const root = mkdtempSync(join(tmpdir(), "orb-git-door-extra-"));
  try {
    execGit(root, ["init", "-q", "-b", "main"]);
    // `GIT_DIR` in `extra` is honoured (spelled by the caller); the same key in `env` is dropped.
    const viaExtra = runGit(tmpdir(), ["rev-parse", "--is-inside-git-dir"], { extra: Object.fromEntries([["GIT_DIR", join(root, ".git")]]) });
    expect(viaExtra.status).toBe(0);
    const path = inheritedProcessEnv()["PATH"] ?? "";
    const viaEnv = runGit(tmpdir(), ["rev-parse", "--is-inside-git-dir"], {
      env: env([
        ["GIT_DIR", join(root, ".git")],
        ["PATH", path],
      ]),
    });
    expect(viaEnv.status, "an inherited GIT_DIR is dropped, so the OS temp dir is not a repository").not.toBe(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("execGit throws with git's own stderr on a failure, and GIT_READ_PREFIX is the read-only spelling", () => {
  const root = mkdtempSync(join(tmpdir(), "orb-git-door-fail-"));
  try {
    execGit(root, ["init", "-q", "-b", "main"]);
    expect(() => execGit(root, ["rev-parse", "--verify", "no-such-ref"])).toThrow(/rev-parse failed \(exit 128\)/u);
    expect(GIT_READ_PREFIX).toEqual(["--no-optional-locks"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
