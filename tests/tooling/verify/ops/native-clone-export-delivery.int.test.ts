import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { gate } from "../../../../tooling/src/verify/gates/test-production-clone.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import type { nativeTypeFactOptions } from "../../../../tooling/src/verify/lib/project-context.ts";
import { projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { nativePolicyFixture } from "../../floor/compiler/native-verify-fixture.ts";

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

test("clone indexing uses native own export identities without the ordinary carrier's export table or checker", ({ scratch, repoRoot }) => {
  fixture(scratch, repoRoot, `function clean(value:string){${BODY}}export {clean,clean as renamed};`);
  const observed = nativePolicyFixture("clone-alias", scratch);
  expect(JSON.parse(observed.text)).toMatchObject({
    checkerReads: 0,
    exportReads: 0,
    passes: [
      {
        errors: [],
        policies: [["success", 1]],
        findings: [
          {
            message: expect.stringMatching(
              /^(?=[\s\S]*packages\/kit\/src\/rule\.ts#clean)(?=[\s\S]*packages\/kit\/src\/rule\.ts#renamed)(?![\s\S]*#fromBarrel)/u,
            ),
          },
        ],
      },
    ],
  });
  expect(observed.requests.map((request) => [request.descriptor.id, request.families])).toEqual([["tsconfig.json", ["runtime-exports"]]]);
});

test("clone indexing does not turn a public value alias into an exported private function body", ({ scratch, repoRoot }) => {
  fixture(scratch, repoRoot, `function clean(value:string){${BODY}}export const used=clean;`);
  expect(JSON.parse(nativePolicyFixture("clone-value", scratch).text)).toMatchObject({
    passes: [{ errors: [], policies: [["success", 0]] }],
  });
});

test("clone indexing refuses absent native services and worker failure instead of claiming an empty index", ({ scratch, repoRoot }) => {
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
  const failed = nativePolicyFixture("clone-failure", scratch);
  expect(failed.requests).toHaveLength(1);
  expect(JSON.parse(failed.text)).toMatchObject({
    passes: [
      {
        errors: [expect.objectContaining({ message: expect.stringContaining("injected native policy worker exit") })],
        policies: [[expect.stringMatching(/^(?!success$).+/u), 0]],
      },
    ],
  });
});
