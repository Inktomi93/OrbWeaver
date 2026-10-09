// _shared/git-fixture — the Git trust boundary for tooling-owned temporary repositories. A pre-commit
// hook exports its local repository paths; fixture commands must never follow those paths back into the
// checkout that launched the test.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runGit } from "@orb/tooling/_shared/git";
import {
  configureFixtureGitIdentity,
  execFixtureGit,
  FIXTURE_GIT_CONFIG_ARGS,
  FIXTURE_GIT_IDENTITY,
  fixtureGitEnvironment,
  runFixtureGit,
} from "@orb/tooling/_shared/git-fixture";
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

function automaticPackingRepo(root: string): void {
  mkdirSync(root);
  execFixtureGit(root, ["init", "--quiet", "--object-format=sha1"]);
  configureFixtureGitIdentity(root);
  execFixtureGit(root, ["config", "--local", "gc.auto", "1"]);
  execFixtureGit(root, ["config", "--local", "gc.autoDetach", "false"]);
  // Git samples loose objects in bucket 17; two deterministic blobs trip the smallest auto-GC threshold.
  let candidate = 0;
  for (const name of ["first.txt", "second.txt"]) {
    let content: string;
    let oid: string;
    do {
      content = `fixture maintenance ${String(candidate)}\n`;
      candidate += 1;
      oid = createHash("sha1")
        .update(`blob ${String(Buffer.byteLength(content))}\0`)
        .update(content)
        .digest("hex");
    } while (!oid.startsWith("17"));
    writeFileSync(join(root, name), content);
    execFixtureGit(root, ["hash-object", "-w", name]);
  }
}

test("fixture commits suppress automatic maintenance while explicit garbage collection remains available", ({ scratch }) => {
  const control = join(scratch, "control");
  automaticPackingRepo(control);
  const packed = runGit(
    control,
    [...FIXTURE_GIT_CONFIG_ARGS, "-c", "gc.auto=1", "-c", "maintenance.auto=true", "commit", "--allow-empty", "-qm", "maintenance control"],
    { env: fixtureGitEnvironment() },
  );
  expect(packed.status, packed.stderr).toBe(0);
  expect(
    readdirSync(join(control, ".git/objects/pack")).some((name) => name.endsWith(".pack")),
    "the native control really auto-packs",
  ).toBe(true);

  const fixture = join(scratch, "fixture");
  automaticPackingRepo(fixture);
  const committed = runFixtureGit(fixture, ["commit", "--allow-empty", "-qm", "fixture commit"]);
  expect(committed.status, committed.stderr).toBe(0);
  expect(readdirSync(join(fixture, ".git/objects/pack")), "fixture commits must not start a pack writer that can outlive cleanup").toEqual([]);
  execFixtureGit(fixture, ["gc", "--prune=now"]);
  expect(readdirSync(join(fixture, ".git/objects/pack")).some((name) => name.endsWith(".pack"))).toBe(true);
});
