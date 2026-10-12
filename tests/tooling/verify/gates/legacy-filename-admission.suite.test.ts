import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { FixtureGitHistoryFoundation } from "@orb/tooling/floor/git/git-fixture";
import { captureFixtureGitHistoryFoundation, configureFixtureGitIdentity, execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { Project } from "ts-morph";
import type { PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { gate } from "../../../../tooling/src/verify/gates/test-layout.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";

const RETAINED = "tests/legacy/server/retained.test.ts";
const ADDED = "tests/legacy/server/added.test.ts";
const BASE = {
  "packages/server/src/index.ts": "export {};\n",
  "tooling/src/verify/index.ts": "export {};\n",
  "tests/tooling/verify/index.test.ts": "export {};\n",
  [RETAINED]: "export const original = true;\n",
};

function write(root: string, path: string, text = "export {};\n"): void {
  mkdirSync(join(root, dirname(path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

function commit(root: string): void {
  execFixtureGit(root, ["add", "-A"]);
  execFixtureGit(root, ["commit", "--quiet", "-m", "fixture"]);
}

function found(root: string): FixtureGitHistoryFoundation {
  for (const [path, text] of Object.entries(BASE)) {
    write(root, path, text);
  }
  execFixtureGit(root, ["init", "--quiet"]);
  configureFixtureGitIdentity(root);
  commit(root);
  return captureFixtureGitHistoryFoundation(root);
}

function pass(root: string, requestedPaths: readonly string[], foundation: FixtureGitHistoryFoundation): PolicyPassResult {
  return runPolicyPass({
    policies: [gate],
    knownPolicies: [gate],
    root,
    project: new Project({ useInMemoryFileSystem: true }),
    requestedPaths,
    resourceOptions: { gitHistoryFixtureFoundation: foundation },
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

for (const operation of ["add", "replacement", "return"] as const) {
  test(`legacy filename admission refuses ${operation} below the count ceiling`, ({ scratch }) => {
    const foundation = found(scratch);
    let path = ADDED;
    if (operation !== "add") {
      rmSync(join(scratch, RETAINED));
    }
    if (operation === "return") {
      commit(scratch);
      path = RETAINED;
    }
    write(scratch, path);
    const result = pass(scratch, [path], foundation);
    expect(result.toolErrors).toEqual([]);
    expect(result.authority.effectiveFindings).toMatchObject([{ policyId: "test-layout", file: path, operation: "legacy-added" }]);
  });
}

for (const operation of ["delete", "edit"] as const) {
  test(`legacy filename admission allows retained-file ${operation}`, ({ scratch }) => {
    const foundation = found(scratch);
    if (operation === "delete") {
      rmSync(join(scratch, RETAINED));
    } else {
      write(scratch, RETAINED, "export const original = false;\n");
    }
    const result = pass(scratch, [RETAINED], foundation);
    expect(result.toolErrors).toEqual([]);
    expect(result.authority.effectiveFindings).toEqual([]);
  });
}

for (const admission of ["staged", "committed", "index-only", "overlay"] as const) {
  test(`legacy admission sees an addition in ${admission} evidence`, ({ scratch }) => {
    const foundation = found(scratch);
    if (admission !== "overlay") {
      write(scratch, ADDED);
      execFixtureGit(scratch, ["add", ADDED]);
    }
    if (admission === "committed") {
      commit(scratch);
    } else if (admission === "index-only") {
      rmSync(join(scratch, ADDED));
    }
    const result = runPolicyPass({
      policies: [gate],
      knownPolicies: [gate],
      root: scratch,
      project: new Project({ useInMemoryFileSystem: true }),
      resourceOptions: { gitHistoryFixtureFoundation: foundation, ...(admission === "overlay" ? { overlay: { [ADDED]: "export {};\n" } } : {}) },
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.authority.effectiveFindings).toMatchObject([{ file: ADDED, operation: "legacy-added" }]);
  });
}

test("committing an addition then deleting it does not erase the invalid transition", ({ scratch }) => {
  const foundation = found(scratch);
  write(scratch, ADDED);
  commit(scratch);
  rmSync(join(scratch, ADDED));
  commit(scratch);
  const result = pass(scratch, [ADDED], foundation);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([{ file: ADDED, operation: "legacy-added" }]);
});

test("a whole population permits deletion without lowering a count constant", ({ scratch }) => {
  const foundation = found(scratch);
  rmSync(join(scratch, RETAINED));
  commit(scratch);
  const result = runPolicyPass({
    policies: [gate],
    knownPolicies: [gate],
    root: scratch,
    project: new Project({ useInMemoryFileSystem: true }),
    resourceOptions: { gitHistoryFixtureFoundation: foundation },
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
});

for (const failure of ["missing", "shallow", "unreachable"] as const) {
  test(`legacy history ${failure} refuses the owner rather than granting admission`, ({ scratch }) => {
    const foundation = found(scratch);
    if (failure === "shallow") {
      writeFileSync(join(scratch, ".git/shallow"), `${foundation.commit}\n`);
    } else if (failure === "unreachable") {
      execFixtureGit(scratch, ["checkout", "--orphan", "unrelated"]);
      write(scratch, "unrelated.ts");
      commit(scratch);
    }
    const result = runPolicyPass({
      policies: [gate],
      knownPolicies: [gate],
      root: scratch,
      project: new Project({ useInMemoryFileSystem: true }),
      ...(failure === "missing" ? {} : { resourceOptions: { gitHistoryFixtureFoundation: foundation } }),
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.toolErrors).toMatchObject([{ policyId: "test-layout", phase: "population", message: expect.stringContaining("git-path-history") }]);
    expect(result.authority.withheldPolicyIds).toEqual(["test-layout"]);
    expect(result.authority.effectiveFindings).toEqual([]);
  });
}

test("a merge cannot restore a filename deleted by a founded parent", ({ scratch }) => {
  const foundation = found(scratch);
  const original = execFixtureGit(scratch, ["branch", "--show-current"]).trim();
  execFixtureGit(scratch, ["checkout", "-b", "deleting"]);
  rmSync(join(scratch, RETAINED));
  commit(scratch);
  execFixtureGit(scratch, ["checkout", original]);
  write(scratch, "unrelated.ts");
  commit(scratch);
  execFixtureGit(scratch, ["merge", "--no-commit", "--no-ff", "deleting"]);
  write(scratch, RETAINED);
  commit(scratch);
  const result = pass(scratch, [RETAINED], foundation);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([{ file: RETAINED, operation: "legacy-added" }]);
});

test("a side parent predating foundation cannot invent a legacy addition", ({ scratch }) => {
  execFixtureGit(scratch, ["init", "--quiet"]);
  configureFixtureGitIdentity(scratch);
  write(scratch, "before.ts");
  commit(scratch);
  const original = execFixtureGit(scratch, ["branch", "--show-current"]).trim();
  execFixtureGit(scratch, ["branch", "pre-foundation"]);
  for (const [path, text] of Object.entries(BASE)) {
    write(scratch, path, text);
  }
  commit(scratch);
  const foundation = captureFixtureGitHistoryFoundation(scratch);
  execFixtureGit(scratch, ["checkout", "pre-foundation"]);
  write(scratch, "side.ts");
  commit(scratch);
  execFixtureGit(scratch, ["checkout", original]);
  execFixtureGit(scratch, ["merge", "--no-ff", "-m", "fixture merge", "pre-foundation"]);
  const result = pass(scratch, [RETAINED], foundation);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
});

test("application qualification judges historical resource additions even when the file is no longer an application subject", ({ scratch }) => {
  const foundation = found(scratch);
  write(scratch, ADDED);
  commit(scratch);
  rmSync(join(scratch, ADDED));
  commit(scratch);
  const result = runPolicyPass({
    policies: [gate],
    knownPolicies: [gate],
    root: scratch,
    project: new Project({ useInMemoryFileSystem: true }),
    applicationPaths: ["packages/server/src/index.ts"],
    resourceOptions: { gitHistoryFixtureFoundation: foundation },
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([{ file: ADDED, operation: "legacy-added" }]);
});
