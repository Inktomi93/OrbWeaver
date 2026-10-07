// _shared/git-fixture — the Git trust boundary for tooling-owned temporary repositories. A pre-commit
// hook exports its local repository paths; fixture commands must never follow those paths back into the
// checkout that launched the test.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runGit } from "@orb/tooling/_shared/git";
import { configureFixtureGitIdentity, execFixtureGit, FIXTURE_GIT_IDENTITY, fixtureGitEnvironment, runFixtureGit } from "@orb/tooling/_shared/git-fixture";
import { expect, test } from "../../support/tool-fixtures.ts";

test("a hook-style GIT_DIR cannot redirect fixture initialization into a sentinel repository", ({ scratch }) => {
  const sentinel = join(scratch, "sentinel");
  const fixture = join(scratch, "fixture");
  mkdirSync(sentinel);
  mkdirSync(fixture);

  expect(runFixtureGit(sentinel, ["init", "--quiet"]).status).toBe(0);
  const sentinelConfig = join(sentinel, ".git/config");
  const before = readFileSync(sentinelConfig);
  const inherited = {
    ...fixtureGitEnvironment(),
    ["ORB_FIXTURE_ENV_CONTROL"]: "retained",
    ["GIT_DIR"]: join(sentinel, ".git"),
    ["GIT_WORK_TREE"]: sentinel,
    ["GIT_INDEX_FILE"]: join(sentinel, ".git/index"),
  };

  expect(runFixtureGit(fixture, ["init", "--quiet"], inherited).status).toBe(0);

  expect(existsSync(join(fixture, ".git/config"))).toBe(true);
  expect(readFileSync(sentinelConfig)).toEqual(before);
  expect(fixtureGitEnvironment(inherited)).toMatchObject({ ["ORB_FIXTURE_ENV_CONTROL"]: "retained" });
  expect(Object.keys(fixtureGitEnvironment(inherited)).filter((name) => name.startsWith("GIT_"))).toEqual(["GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM"]);
});

test("persisted fixture identity reaches native Git children with absent or wrong operator identity", ({ scratch }) => {
  const home = join(scratch, "home");
  const root = join(scratch, "fixture");
  mkdirSync(home);
  mkdirSync(root);
  execFixtureGit(root, ["init", "--quiet"]);
  execFixtureGit(root, ["config", "--local", "user.useConfigOnly", "true"]);
  const env = { ...fixtureGitEnvironment(), ["HOME"]: home, ["XDG_CONFIG_HOME"]: home };
  const missing = runGit(root, ["commit", "--allow-empty", "-qm", "fixture control"], { env });
  expect(missing.status).not.toBe(0);
  expect(missing.stderr).toContain("identity unknown");
  writeFileSync(join(home, ".gitconfig"), "[user]\nname = Wrong Operator\nemail = wrong@example.invalid\n");
  configureFixtureGitIdentity(root);
  const committed = runGit(root, ["commit", "--allow-empty", "-qm", "fixture control"], { env });
  expect(committed.status, committed.stderr).toBe(0);
  const identity = runGit(root, ["log", "-1", "--format=%an <%ae>%n%cn <%ce>"], { env });
  const expected = `${FIXTURE_GIT_IDENTITY.name} <${FIXTURE_GIT_IDENTITY.email}>`;
  expect(identity.stdout.trim()).toBe(`${expected}\n${expected}`);
  expect(execFixtureGit(root, ["config", "--local", "user.name"]).trim()).toBe(FIXTURE_GIT_IDENTITY.name);
  expect(execFixtureGit(root, ["config", "--local", "user.email"]).trim()).toBe(FIXTURE_GIT_IDENTITY.email);
});
