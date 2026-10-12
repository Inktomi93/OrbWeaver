import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { runGit } from "@orb/tooling/floor/git/git";
import { captureFixtureGitHistoryFoundation, configureFixtureGitIdentity, execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { Project } from "ts-morph";
import { vi } from "vitest";
import { gate } from "../../../../tooling/src/verify/gates/test-layout.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { authoredPathsUnder, resolveSelection } from "../../../../tooling/src/verify/lib/selection.ts";

const STAGED = "tests/legacy/server/staged.test.ts";
const UNTRACKED = "tests/legacy/server/untracked.test.ts";

function found(root: string): void {
  writeFileSync(join(root, "package.json"), '{"name":"selection-fixture","private":true}');
  writeFileSync(join(root, "tsconfig.json"), '{"compilerOptions":{"noEmit":true,"types":[]},"files":[]}');
  mkdirSync(join(root, "tests/legacy/server"), { recursive: true });
  execFixtureGit(root, ["init", "--quiet"]);
  configureFixtureGitIdentity(root);
  execFixtureGit(root, ["add", "-A"]);
  execFixtureGit(root, ["commit", "--quiet", "-m", "fixture"]);
}

function assertStructureOnly(selection: ReturnType<typeof resolveSelection>, paths: readonly string[]): void {
  expect(selection.checkScopeArgv).toEqual(expect.arrayContaining([...paths]));
  expect(selection.paths).toEqual([]);
  expect(selection.runtimeSubjects).toEqual([]);
  expect(selection.eslintPaths).toEqual([]);
  expect(selection.tsconfigs).toEqual([]);
}

test("staged and working legacy filenames remain structure subjects without entering compiler/runtime views", ({ scratch }) => {
  found(scratch);
  writeFileSync(join(scratch, STAGED), "export {};\n");
  execFixtureGit(scratch, ["add", STAGED]);
  writeFileSync(join(scratch, UNTRACKED), "export {};\n");
  const staged = resolveSelection({ kind: "staged" }, scratch);
  assertStructureOnly(staged, [STAGED]);
  expect(staged.label).toBe("staged (1 file)");
  expect(staged.checkScopeArgv).not.toContain(UNTRACKED);
  assertStructureOnly(resolveSelection({ kind: "changed", paths: [] }, scratch), [STAGED, UNTRACKED]);
  expect(resolveSelection({ kind: "file", paths: [UNTRACKED] }, scratch).checkScopeArgv).toContain(UNTRACKED);
});

test("a staged selection honors the hook temporary index at its actual invocation root", ({ scratch }) => {
  found(scratch);
  const index = join(scratch, ".git", "candidate-index");
  expect(runGit(scratch, ["read-tree", "HEAD"], { extra: { ["GIT_INDEX_FILE"]: index } }).status).toBe(0);
  writeFileSync(join(scratch, STAGED), "export {};\n");
  expect(runGit(scratch, ["add", STAGED], { extra: { ["GIT_INDEX_FILE"]: index } }).status).toBe(0);
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(scratch);
  vi.stubEnv("GIT_INDEX_FILE", index);
  try {
    assertStructureOnly(resolveSelection({ kind: "staged" }, scratch), [STAGED]);
  } finally {
    vi.unstubAllEnvs();
    cwd.mockRestore();
  }
  expect(resolveSelection({ kind: "staged" }, scratch).checkScopeArgv).not.toContain(STAGED);
});

for (const glob of ["tests/legacy", "tests/legacy/**"] as const) {
  for (const action of ["retained edit", "addition", "index-only addition"] as const) {
    test(`working ${glob} scope keeps structure admission for ${action}`, ({ scratch }) => {
      found(scratch);
      for (const path of ["packages/server/src/index.ts", "tooling/src/verify/index.ts", "tests/tooling/verify/index.test.ts", STAGED]) {
        mkdirSync(join(scratch, path.slice(0, path.lastIndexOf("/"))), { recursive: true });
        writeFileSync(join(scratch, path), "export {};\n");
      }
      execFixtureGit(scratch, ["add", "-A"]);
      execFixtureGit(scratch, ["commit", "--quiet", "-m", "fixture foundation"]);
      const foundation = captureFixtureGitHistoryFoundation(scratch);
      const subject = action === "retained edit" ? STAGED : UNTRACKED;
      writeFileSync(join(scratch, subject), "export const changed = true;\n");
      if (action === "index-only addition") {
        execFixtureGit(scratch, ["add", subject]);
        rmSync(join(scratch, subject));
      }
      const selection = resolveSelection({ kind: "scope", glob }, scratch);
      expect(selection.runtimeSubjects).toEqual([]);
      expect(selection.existingPaths).toEqual([]);
      expect(selection.eslintPaths).toEqual([]);
      expect(selection.tsconfigs).toEqual([]);
      expect(selection.checkScopeArgv).toEqual(["node", "tooling/src/verify/cli.ts", "scoped", "--scope", glob]);
      const result = runPolicyPass({
        policies: [gate],
        knownPolicies: [gate],
        root: scratch,
        project: new Project({ useInMemoryFileSystem: true }),
        requestedPaths: authoredPathsUnder("tests/legacy", scratch, true),
        resourceOptions: { gitHistoryFixtureFoundation: foundation },
        reviewedGrants: [],
        failOnWarnings: false,
      });
      expect(result.toolErrors).toEqual([]);
      expect(result.policies[0]?.owner.status).toBe("success");
      expect(result.authority.effectiveFindings.map(({ file, operation }) => [file, operation])).toEqual(
        action === "retained edit" ? [] : [[UNTRACKED, "legacy-added"]],
      );
    });
  }
}
