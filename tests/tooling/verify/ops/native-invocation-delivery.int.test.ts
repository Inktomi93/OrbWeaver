import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Project } from "ts-morph";
import { Node } from "ts-morph";
import { beforeEach, vi } from "vitest";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { gate as determinism } from "../../../../tooling/src/verify/gates/test-determinism.ts";
import { gate as mocks } from "../../../../tooling/src/verify/gates/test-mock-doctrine.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { nativeInventoryFixture } from "../../floor/compiler/native-inventory-fixture.ts";
import { nativeVerifyFixture } from "../../floor/compiler/native-verify-fixture.ts";

// These adapter verdicts borrow a real child-produced pinned generation, not Vite execution authority.
beforeEach(async () => {
  const inventoryFactory = await import("../../../../tooling/src/floor/code-facts/semantic-inventory.ts");
  const producer = vi.spyOn(inventoryFactory, "createSemanticInventory").mockImplementation(nativeInventoryFixture);
  return (): void => {
    producer.mockRestore();
  };
});

const NODE_TEST = "tests/server/native-invocation.test.ts";
const BROWSER_TEST = "tests/client/native-invocation.test.tsx";
const MJS_HELPER = "tests/support/node/native-invocation.mjs";
const TEST_SOURCE = "import {mint,spy} from '#bound';\nexport const value=mint();\nspy('run');\n";
const POLICIES = [determinism, mocks];

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
    JSON.stringify({
      compilerOptions: { ...compilerOptions, allowJs: true, checkJs: true, lib: ["es2022"], types: ["node"] },
      files: [NODE_TEST, MJS_HELPER, "node-bound.ts", "browser-bound.ts", "packages/kit/src/ids/index.ts", "packages/server/src/domain/feature/subject.ts"],
    }),
  );
  write(
    "tsconfig.tests-dom.json",
    JSON.stringify({ compilerOptions: { ...compilerOptions, lib: ["es2022", "dom"], types: [], customConditions: ["browser"] }, files: [BROWSER_TEST] }),
  );
  write(
    "package.json",
    JSON.stringify({ name: "native-invocation-fixture", type: "module", imports: { "#bound": { browser: "./browser-bound.ts", default: "./node-bound.ts" } } }),
  );
  write(
    "packages/kit/src/ids/index.ts",
    "export function mintTypeId(prefix:string,generate?:(prefix:string)=>string):string{return generate?.(prefix)??prefix;}",
  );
  write("packages/server/src/domain/feature/subject.ts", "export function run():number{return 1;}");
  write(
    "node-bound.ts",
    `import {mintTypeId} from './packages/kit/src/ids/index.ts';
import {vi} from 'vitest';
import * as subject from './packages/server/src/domain/feature/subject.ts';
export const mint=mintTypeId.bind(null,'chat');
export const spy=vi.spyOn.bind(vi,subject);
`,
  );
  write(
    "browser-bound.ts",
    `import {mintTypeId} from './packages/kit/src/ids/index.ts';
import {vi} from 'vitest';
const seeded=(prefix:string):string=>prefix;
const collaborator={run:():number=>1};
export const mint=mintTypeId.bind(null,'chat',seeded);
export const spy=vi.spyOn.bind(vi,collaborator);
`,
  );
  for (const path of [NODE_TEST, BROWSER_TEST, MJS_HELPER]) {
    write(path, TEST_SOURCE);
  }
  write("tooling/tsconfig.json", JSON.stringify({ compilerOptions, files: POLICIES.map(({ id }) => `src/verify/gates/${id}.ts`) }));
  for (const { id } of POLICIES) {
    write(
      `tooling/src/verify/gates/${id}.ts`,
      `export {gate} from ${JSON.stringify(new URL(`../../../../tooling/src/verify/gates/${id}.ts`, import.meta.url).href)};`,
    );
  }
  execFixtureGit(root, ["init", "-q"]);
}

function poisonSyntax(project: Project): Disposable {
  const symbolFor = Node.prototype.getSymbol;
  const typeFor = Node.prototype.getType;
  const symbols = vi.spyOn(Node.prototype, "getSymbol").mockImplementation(function (this: Node) {
    if (this.getProject() === project) {
      throw new Error("syntax invocation Symbol read");
    }
    return symbolFor.call(this);
  });
  const types = vi.spyOn(Node.prototype, "getType").mockImplementation(function (this: Node) {
    if (this.getProject() === project) {
      throw new Error("syntax invocation Type read");
    }
    return typeFor.call(this);
  });
  return {
    [Symbol.dispose]: (): void => {
      symbols.mockRestore();
      types.mockRestore();
    },
  };
}

test(
  "native invocation command doors preserve importing-world bound arguments without syntax Type or Symbol reads",
  async ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const contexts = await import("../../../../tooling/src/verify/lib/project-context.ts");
    const context = projectCtx(scratch);
    const getContext = vi.spyOn(contexts, "projectCtx").mockReturnValue(context);
    using _poison = poisonSyntax(context.project);
    try {
      const exits: number[] = [];
      for (const path of [NODE_TEST, BROWSER_TEST, MJS_HELPER]) {
        for (const { id } of POLICIES) {
          exits.push(await nativeVerifyFixture(scratch, "structure", [`--check=${id}`, `--file=${path}`], { forbidSyntax: true }));
        }
      }
      exits.push(await nativeVerifyFixture(scratch, "scoped", ["--scope", `${NODE_TEST},${BROWSER_TEST},${MJS_HELPER}`], { forbidSyntax: true }));
      expect(exits).toEqual([1, 1, 0, 0, 1, 1, 1]);
      const result = runPolicyPass({
        root: scratch,
        project: context.project,
        ...nativeTypeFactOptions(context),
        knownPolicies: POLICIES,
        policies: POLICIES,
        requestedPaths: [NODE_TEST, BROWSER_TEST, MJS_HELPER],
        reviewedGrants: [],
        failOnWarnings: false,
      });
      expect(result.toolErrors).toEqual([]);
      expect(result.policies.map(({ id, findings }) => ({ id, findings: findings.map(({ file, token }) => ({ file, token })) }))).toEqual([
        {
          id: determinism.id,
          findings: [
            { file: NODE_TEST, token: "mint" },
            { file: MJS_HELPER, token: "mint" },
          ],
        },
        {
          id: mocks.id,
          findings: [
            { file: NODE_TEST, token: "spy" },
            { file: MJS_HELPER, token: "spy" },
          ],
        },
      ]);
    } finally {
      getContext.mockRestore();
    }
  },
  scaledBudget(60_000),
);

test(
  "native invocation projections preserve strict strings, exact undefined unions, class/logger judgments and ordinary waiver positions",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const text = `import {mint,spy} from '#bound';
import {mintTypeId} from '../../packages/kit/src/ids/index.ts';
import {vi} from 'vitest';
import {Thing} from '../../packages/server/src/domain/feature/thing.ts';
import {logger} from '../../packages/server/src/foundation/observability/logger.ts';
const seeded=(prefix:string):string=>prefix;
declare const maybe:((prefix:string)=>string)|undefined;
mintTypeId('union',maybe);
mintTypeId('seeded',seeded);
vi.spyOn(Thing.prototype,'run');
vi.spyOn(logger,'info');
let TARGET='node:fs';vi.mock(TARGET);
vi.mock('node:fs');
// @orb-waive test-determinism(mint): deliberate ambient fixture; ends with this control.
mint();
// @orb-waive test-mock-doctrine(spy): deliberate namespace fixture; ends with this control.
spy('run');
`;
    writeFileSync(join(scratch, NODE_TEST), text);
    writeFileSync(join(scratch, "packages/server/src/domain/feature/thing.ts"), "export const Thing=class {run():number{return 1;}};");
    mkdirSync(join(scratch, "packages/server/src/foundation/observability"), { recursive: true });
    writeFileSync(join(scratch, "packages/server/src/foundation/observability/logger.ts"), "export const logger={info:():void=>{}};");
    const context = projectCtx(scratch);
    using _poison = poisonSyntax(context.project);
    const result = runPolicyPass({
      root: scratch,
      project: context.project,
      ...nativeTypeFactOptions(context),
      knownPolicies: POLICIES,
      policies: POLICIES,
      requestedPaths: [NODE_TEST],
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.toolErrors).toEqual([]);
    expect(
      result.policies.map(({ id, findings }) => ({ id, findings: findings.map(({ file, line, column, token }) => ({ file, line, column, token })) })),
    ).toEqual([
      {
        id: determinism.id,
        findings: [
          { file: NODE_TEST, line: 8, column: 1, token: "mintTypeId" },
          { file: NODE_TEST, line: 15, column: 1, token: "mint" },
        ],
      },
      {
        id: mocks.id,
        findings: [
          { file: NODE_TEST, line: 10, column: 4, token: "spyOn" },
          { file: NODE_TEST, line: 11, column: 4, token: "spyOn" },
          { file: NODE_TEST, line: 12, column: 25, token: "mock" },
          { file: NODE_TEST, line: 17, column: 1, token: "spy" },
        ],
      },
    ]);
    expect(
      result.authority.waivedFindings.map(({ finding }) => ({ policyId: finding.policyId, line: finding.line, column: finding.column, token: finding.token })),
    ).toEqual([
      { policyId: determinism.id, line: 15, column: 1, token: "mint" },
      { policyId: mocks.id, line: 17, column: 1, token: "spy" },
    ]);
    expect(result.authority.grantedFindings).toEqual([]);
    expect(result.authority.effectiveFindings).toHaveLength(4);
  },
  scaledBudget(60_000),
);
