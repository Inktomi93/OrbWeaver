import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { runGit } from "@orb/tooling/floor/git/git";
import { captureFixtureGitHistoryFoundation, configureFixtureGitIdentity, execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { Project } from "ts-morph";
import { vi } from "vitest";
import { gate } from "../../../../tooling/src/verify/gates/test-layout.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { assertGateResourceDeclarations } from "../../../../tooling/src/verify/lib/policy-validation.ts";
import { bindPolicyResources } from "../../../../tooling/src/verify/lib/resource-policy.ts";
import { createResourceHost } from "../../../../tooling/src/verify/ops/resource-host.ts";

const LEGACY = "tests/legacy/server/retained.test.ts";
const ADDED = "tests/legacy/server/added.test.ts";
const BASE = {
  "packages/server/src/index.ts": "export {};\n",
  "tooling/src/verify/index.ts": "export {};\n",
  "tests/tooling/verify/index.test.ts": "export {};\n",
  [LEGACY]: "export {};\n",
};

function found(root: string): ReturnType<typeof captureFixtureGitHistoryFoundation> {
  for (const [path, text] of Object.entries(BASE)) {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  execFixtureGit(root, ["init", "--quiet"]);
  configureFixtureGitIdentity(root);
  execFixtureGit(root, ["add", "-A"]);
  execFixtureGit(root, ["commit", "--quiet", "-m", "fixture"]);
  return captureFixtureGitHistoryFoundation(root);
}

test("history snapshots once, keeps empty transitions ready, and does not promote overlay paths into history", ({ scratch }) => {
  const foundation = found(scratch);
  const invocation = createResourceHost({ root: scratch, gitHistoryFixtureFoundation: foundation, overlay: { [ADDED]: "export {};\n" } });
  const fact = invocation.host.gitPathHistory("legacy-tests");
  expect(fact).toMatchObject({
    status: "ready",
    value: { history: { foundation: foundation.commit, initialPaths: [LEGACY], addedPaths: [], deletedPaths: [] }, candidatePaths: [LEGACY] },
  });
  writeFileSync(join(scratch, ADDED), "export {};\n");
  execFixtureGit(scratch, ["add", ADDED]);
  expect(invocation.host.gitPathHistory("legacy-tests")).toBe(fact);
  expect(invocation.receipts()).toHaveLength(1);
  expect(createResourceHost({ root: scratch, gitHistoryFixtureFoundation: foundation }).host.gitPathHistory("legacy-tests")).toMatchObject({
    status: "ready",
    value: { candidatePaths: [ADDED, LEGACY] },
  });
  expect(createResourceHost({ root: scratch }).host.gitPathHistory("legacy-tests")).toMatchObject({ status: "unresolved" });
});

test("a foundation from another fixture cannot authorize this invocation", ({ scratch, plantedTree }) => {
  const foundation = found(scratch);
  return plantedTree({}).then((other) => {
    expect(createResourceHost({ root: other, gitHistoryFixtureFoundation: foundation }).host.gitPathHistory("legacy-tests")).toMatchObject({
      status: "unresolved",
      reason: expect.stringContaining("another invocation root"),
    });
  });
});

test("the resource preserves a real hook candidate index rather than the ordinary index or unstaged disk", ({ scratch }) => {
  const foundation = found(scratch);
  const index = join(scratch, ".git", "candidate-index");
  expect(runGit(scratch, ["read-tree", "HEAD"], { extra: { ["GIT_INDEX_FILE"]: index } }).status).toBe(0);
  writeFileSync(join(scratch, ADDED), "export {};\n");
  expect(runGit(scratch, ["add", ADDED], { extra: { ["GIT_INDEX_FILE"]: index } }).status).toBe(0);
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(scratch);
  vi.stubEnv("GIT_INDEX_FILE", index);
  try {
    expect(createResourceHost({ root: scratch, gitHistoryFixtureFoundation: foundation }).host.gitPathHistory("legacy-tests")).toMatchObject({
      status: "ready",
      value: { candidatePaths: [ADDED, LEGACY] },
    });
  } finally {
    vi.unstubAllEnvs();
    cwd.mockRestore();
  }
  expect(createResourceHost({ root: scratch, gitHistoryFixtureFoundation: foundation }).host.gitPathHistory("legacy-tests")).toMatchObject({
    status: "ready",
    value: { candidatePaths: [LEGACY] },
  });
});

test("malformed ancestry refuses the policy with no partial finding", async ({ scratch, fakeBin }) => {
  const foundation = found(scratch);
  await fakeBin(
    "git",
    `const args=process.argv.slice(2); if(args.includes('--git-dir')) process.stdout.write('.git\\n'); else if(args.includes('--is-shallow-repository')) process.stdout.write('false\\n'); else if(args.includes('rev-parse')) process.stdout.write(${JSON.stringify(foundation.commit)}+'\\n'); else if(args.includes('rev-list')) process.stdout.write('not-a-commit\\n');`,
  );
  const result = runPolicyPass({
    policies: [gate],
    knownPolicies: [gate],
    root: scratch,
    project: new Project({ useInMemoryFileSystem: true }),
    resourceOptions: { gitHistoryFixtureFoundation: foundation },
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(result.toolErrors).toMatchObject([{ policyId: "test-layout", phase: "population", message: expect.stringContaining("malformed ancestry") }]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual(["test-layout"]);
});

test("history identities are closed and undeclared reads are refused", ({ scratch }) => {
  const foundation = found(scratch);
  const invocation = createResourceHost({ root: scratch, gitHistoryFixtureFoundation: foundation });
  expect(() => assertGateResourceDeclarations([{ kind: "git-path-history", id: "arbitrary" }])).toThrow("unknown for git-path-history");
  const host = bindPolicyResources({ host: invocation.host, declarations: [], context: { receipt: vi.fn(), resourcePaths: [] } });
  expect(() => host.gitPathHistory("legacy-tests")).toThrow("undeclared");
});
