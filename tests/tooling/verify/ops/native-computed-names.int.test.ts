// Native child commands execute; in-process verdicts borrow pinned historical SQLite observations.
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import { afterEach, beforeEach, vi } from "vitest";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { gate as audit } from "../../../../tooling/src/verify/gates/audit-client-tests.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, nativeTypeFactSession, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { nativeInventoryFixture } from "../../floor/compiler/native-inventory-fixture.ts";
import { nativeVerifyFixture } from "../../floor/compiler/native-verify-fixture.ts";

const NODE_TEST = "tests/server/computed.test.ts";
const BROWSER_TEST = "tests/client/computed.test.tsx";
const TEST_SOURCE = `import {MODIFIER} from '#keys';
declare const test:{only(name:string,fn:()=>void):void;describe(name:string,fn:()=>void):void};
declare function expect(value:number):{toBe(value:number):void};
function expectOriginal(value:number):void{expect(value).toBe(1);}
const expectAlias=expectOriginal;
test[MODIFIER]('helper',()=>{expectAlias(1);});
test[MODIFIER]('stub',()=>{void 1;});
`;

function fixture(root: string, repoRoot: string): void {
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write(".gitignore", "node_modules\n.cache\nreports\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  const compilerOptions = { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, skipLibCheck: true };
  write(
    "tsconfig.json",
    JSON.stringify({ compilerOptions: { ...compilerOptions, lib: ["es2022"], types: ["node"] }, files: [NODE_TEST, "node.ts", "browser.ts"] }),
  );
  write(
    "tsconfig.tests-dom.json",
    JSON.stringify({ compilerOptions: { ...compilerOptions, lib: ["es2022", "dom"], types: [], customConditions: ["browser"] }, files: [BROWSER_TEST] }),
  );
  write(
    "package.json",
    JSON.stringify({ name: "native-computed-fixture", type: "module", imports: { "#keys": { browser: "./browser.ts", default: "./node.ts" } } }),
  );
  write("node.ts", "export const MODIFIER='only';");
  write("browser.ts", "export const MODIFIER='describe';");
  write("tooling/tsconfig.json", JSON.stringify({ compilerOptions, files: [`src/verify/gates/${audit.id}.ts`] }));
  for (const { id } of [audit]) {
    write(
      `tooling/src/verify/gates/${id}.ts`,
      `export {gate} from ${JSON.stringify(new URL(`../../../../tooling/src/verify/gates/${id}.ts`, import.meta.url).href)};`,
    );
  }
  write(NODE_TEST, TEST_SOURCE);
  write(BROWSER_TEST, TEST_SOURCE);
  execFixtureGit(root, ["init", "-q"]);
}

beforeEach(async () => {
  const inventoryFactory = await import("../../../../tooling/src/floor/code-facts/semantic-inventory.ts");
  vi.spyOn(inventoryFactory, "createSemanticInventory").mockImplementation(nativeInventoryFixture);
});
afterEach(() => vi.restoreAllMocks());

test(
  "computed-key command doors use native importing-world names without syntax Type or Symbol reads",
  async ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const exits: number[] = [];
    const syntaxReads: number[] = [];
    const workers: string[] = [];
    const observation = { forbidSyntax: true, syntaxReads, workers };
    for (const path of [NODE_TEST, BROWSER_TEST]) {
      exits.push(await nativeVerifyFixture(scratch, "structure", [`--check=${audit.id}`, `--file=${path}`], observation));
      exits.push(await nativeVerifyFixture(scratch, "scoped", ["--scope", path], observation));
    }
    expect(exits).toEqual([1, 1, 0, 0]);
    expect(syntaxReads).toEqual([0, 0, 0, 0]);
    expect(workers.length).toBeGreaterThan(0);
  },
  scaledBudget(60_000),
);

test(
  "historical native computed-name findings use the authored member and exact ordinary waiver position",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const original = readFileSync(join(scratch, NODE_TEST), "utf8");
    for (const position of ["test[MODIFIER]", "test"]) {
      const text = original.replace(
        "test[MODIFIER]('stub'",
        `// @orb-waive audit-client-tests(${position}): exact computed-key fixture position; ends with this test.\ntest[MODIFIER]('stub'`,
      );
      writeFileSync(join(scratch, NODE_TEST), text);
      const context = projectCtx(scratch);
      const result = runPolicyPass({
        root: scratch,
        project: context.project,
        ...nativeTypeFactOptions(context),
        knownPolicies: [audit],
        policies: [audit],
        reviewedGrants: [],
        failOnWarnings: false,
      });
      expect(result.toolErrors).toEqual([]);
      expect(result.policies.find(({ id }) => id === audit.id)?.findings).toMatchObject([{ file: NODE_TEST, token: "test[MODIFIER]" }]);
      expect(result.authority.waivedFindings).toHaveLength(position === "test[MODIFIER]" ? 1 : 0);
      expect(result.authority.effectiveFindings.filter(({ policyId }) => policyId === audit.id)).toHaveLength(position === "test[MODIFIER]" ? 0 : 1);
      expect(result.authority.authorityAlarms).toHaveLength(position === "test[MODIFIER]" ? 0 : 1);
    }
  },
  scaledBudget(60_000),
);

test("primitive computed spellings need no native acquisition and keep the test root name-based", () => {
  const root = "/primitive-keys";
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(
    `${root}/tests/tooling/primitive.test.ts`,
    `const test={only:(name:string,fn:()=>void)=>fn()}; test['only']('literal',()=>{expect(1)['toBe'](1);});`,
  );
  const acquire = vi.fn((): never => {
    throw new Error("primitive syntax requested native facts");
  });
  const result = runPolicyPass({
    root,
    project,
    nativeTypeFacts: () => nativeTypeFactSession(acquire),
    knownPolicies: [audit],
    policies: [audit],
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(acquire).not.toHaveBeenCalled();
});
