import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { vi } from "vitest";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { gate } from "../../../../tooling/src/verify/gates/test-production-clone.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";

const PRODUCT = "packages/kit/src/rule.ts";
const COPY = "tests/kit/rule.test.ts";
const BODY = 'if(value.length===0){throw new Error("empty");}return value.trim();';

function fixture(root: string, repoRoot: string, product: string): void {
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write(".gitignore", "node_modules\n.cache\nreports\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  write(
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: { strict: true, target: "ES2022", module: "ESNext", moduleResolution: "Bundler", skipLibCheck: true, types: [] },
      files: [PRODUCT, COPY, "packages/kit/src/barrel.ts"],
    }),
  );
  write(PRODUCT, product);
  write("packages/kit/src/barrel.ts", 'export {clean as fromBarrel} from "./rule";');
  write(COPY, `export function copied(value:string){${BODY}}`);
  execFixtureGit(root, ["init", "-q"]);
}

test("clone indexing uses native own export identities without the ordinary carrier's export table or checker", async ({ scratch, repoRoot }) => {
  fixture(scratch, repoRoot, `function clean(value:string){${BODY}}export {clean,clean as renamed};`);
  const context = projectCtx(scratch);
  const workers = await import("../../../../tooling/src/floor/compiler/semantic-inventory-worker-run.ts");
  const worker = vi.spyOn(workers, "runInventoryPartitionWorker");
  const source = context.project.getSourceFileOrThrow(join(scratch, PRODUCT));
  const exports = vi.spyOn(source, "getExportedDeclarations").mockImplementation(() => {
    throw new Error("ordinary clone export fallback");
  });
  const checker = vi.spyOn(context.project, "getTypeChecker").mockImplementation(() => {
    throw new Error("ordinary clone checker fallback");
  });
  try {
    const pass = runPolicyPass({
      root: scratch,
      project: context.project,
      ...nativeTypeFactOptions(context),
      knownPolicies: [gate],
      policies: [gate],
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(pass.toolErrors).toEqual([]);
    expect(pass.policies.map(({ owner, findings }) => [owner.status, findings.length])).toEqual([["success", 1]]);
    const finding = pass.policies[0]?.findings[0];
    expect(finding?.message).toContain(`${PRODUCT}#clean`);
    expect(finding?.message).toContain(`${PRODUCT}#renamed`);
    expect(finding?.message).not.toContain("#fromBarrel");
    expect(exports).not.toHaveBeenCalled();
    expect(checker).not.toHaveBeenCalled();
    expect(worker.mock.calls.map(([request]) => [request.descriptor.id, request.families])).toEqual([["tsconfig.json", ["runtime-exports"]]]);
  } finally {
    worker.mockRestore();
    exports.mockRestore();
    checker.mockRestore();
  }
});

test("clone indexing does not turn a public value alias into an exported private function body", ({ scratch, repoRoot }) => {
  fixture(scratch, repoRoot, `function clean(value:string){${BODY}}export const used=clean;`);
  const context = projectCtx(scratch);
  const pass = runPolicyPass({
    root: scratch,
    project: context.project,
    ...nativeTypeFactOptions(context),
    knownPolicies: [gate],
    policies: [gate],
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(pass.toolErrors).toEqual([]);
  expect(pass.policies.map(({ owner, findings }) => [owner.status, findings.length])).toEqual([["success", 0]]);
});

test("clone indexing refuses absent native services and worker failure instead of claiming an empty index", async ({ scratch, repoRoot }) => {
  fixture(scratch, repoRoot, `export function clean(value:string){${BODY}}`);
  const context = projectCtx(scratch);
  const run = (native: ReturnType<typeof nativeTypeFactOptions>): ReturnType<typeof runPolicyPass> =>
    runPolicyPass({
      root: scratch,
      project: context.project,
      ...native,
      knownPolicies: [gate],
      policies: [gate],
      reviewedGrants: [],
      failOnWarnings: false,
    });
  const absent = run({});
  expect(absent.toolErrors.length).toBeGreaterThan(0);
  expect(absent.policies.every(({ owner, findings }) => owner.status !== "success" && findings.length === 0)).toBe(true);
  const workers = await import("../../../../tooling/src/floor/compiler/semantic-inventory-worker-run.ts");
  const worker = vi.spyOn(workers, "runInventoryPartitionWorker").mockImplementation(() => {
    throw new Error("native clone export worker failure");
  });
  try {
    const failed = run(nativeTypeFactOptions(context));
    expect(failed.toolErrors.some(({ message }) => message.includes("native clone export worker failure"))).toBe(true);
    expect(failed.policies.every(({ owner, findings }) => owner.status !== "success" && findings.length === 0)).toBe(true);
    expect(worker).toHaveBeenCalledOnce();
  } finally {
    worker.mockRestore();
  }
});
