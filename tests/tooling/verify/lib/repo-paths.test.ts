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
import { FIXTURE_GIT_CONFIG_ARGS, fixtureGitEnvironment, repoGitEnvironment } from "../../../../tooling/src/verify/lib/repo-paths.ts";
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
