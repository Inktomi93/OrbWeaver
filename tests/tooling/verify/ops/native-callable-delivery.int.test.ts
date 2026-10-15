import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Node } from "ts-morph";
import { vi } from "vitest";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { gate as audit } from "../../../../tooling/src/verify/gates/audit-client-tests.ts";
import { gate as plugin } from "../../../../tooling/src/verify/gates/plugin-dump-guard.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { runScopedCli } from "../../../../tooling/src/verify/ops/scoped.ts";
import { runStructure } from "../../../../tooling/src/verify/ops/structure.ts";
import { scaledBudget } from "../../_load-budget.ts";

const MEMBRANE = "packages/server/src/infra/plugin-host/membrane.ts";
const NODE_TEST = "tests/server/helper.test.ts";
const BROWSER_TEST = "tests/client/helper.test.tsx";
const GUARDS = "packages/server/src/infra/plugin-host/guards.ts";
const SUPPORT = "tests/support/assertions.ts";
const POLICIES = [plugin, audit];

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
    JSON.stringify({ compilerOptions: { ...compilerOptions, lib: ["es2022"], types: ["node"] }, files: [MEMBRANE, NODE_TEST, GUARDS, SUPPORT] }),
  );
  write(
    "tsconfig.tests-dom.json",
    JSON.stringify({ compilerOptions: { ...compilerOptions, lib: ["es2022", "dom"], types: [] }, files: [BROWSER_TEST, SUPPORT] }),
  );
  write("tooling/tsconfig.json", JSON.stringify({ compilerOptions, files: POLICIES.map(({ id }) => `src/verify/gates/${id}.ts`) }));
  for (const { id } of POLICIES) {
    write(
      `tooling/src/verify/gates/${id}.ts`,
      `export {gate} from ${JSON.stringify(pathToFileURL(join(repoRoot, `tooling/src/verify/gates/${id}.ts`)).href)};`,
    );
  }
  write(
    MEMBRANE,
    `import type {QuickJSContext,QuickJSHandle} from 'quickjs-emscripten-core';
declare function handleSafeToDump(ctx:QuickJSContext,handle:QuickJSHandle):boolean;
const guard=handleSafeToDump;
export function tryDumpGuestValue(ctx:QuickJSContext,handle:QuickJSHandle):object {
  if(!guard(ctx,handle)){return {};}
  return ctx.dump(handle);
}
`,
  );
  write(GUARDS, "export declare function handleSafeToDump(ctx:object,handle:object):boolean;");
  write(SUPPORT, "declare function expect(value:number):{toBe(value:number):void}; export function expectImported(value:number):void{expect(value).toBe(1);}");
  for (const path of [NODE_TEST, BROWSER_TEST]) {
    write(
      path,
      `declare function test(name:string,fn:()=>void):void;
declare function expect(value:number):{toBe(value:number):void};
function expectOriginal(value:number):void{expect(value).toBe(1);}
const expectAlias=expectOriginal;
test('asserts through a local alias',()=>{expectAlias(1);});
`,
    );
  }
  execFixtureGit(root, ["init", "-q"]);
}

test(
  "native callable command doors never read syntax symbols and preserve bodyless guard and local helper identity",
  async ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const contexts = await import("../../../../tooling/src/verify/lib/project-context.ts");
    const context = projectCtx(scratch);
    const getContext = vi.spyOn(contexts, "projectCtx").mockReturnValue(context);
    const symbolFor = Node.prototype.getSymbol;
    const typeFor = Node.prototype.getType;
    const symbols = vi.spyOn(Node.prototype, "getSymbol").mockImplementation(function (this: Node) {
      if (this.getProject() === context.project) {
        throw new Error("syntax carrier symbol read");
      }
      return symbolFor.call(this);
    });
    const types = vi.spyOn(Node.prototype, "getType").mockImplementation(function (this: Node) {
      if (this.getProject() === context.project) {
        throw new Error("syntax carrier Type read");
      }
      return typeFor.call(this);
    });
    const exits: number[] = [];
    try {
      exits.push(await runStructure(scratch, [`--check=${plugin.id}`]));
      exits.push(await runScopedCli(scratch, ["--scope", "packages/server/src/infra/plugin-host"]));
      for (const path of [NODE_TEST, BROWSER_TEST]) {
        exits.push(await runStructure(scratch, [`--check=${audit.id}`, `--file=${path}`]));
        exits.push(await runScopedCli(scratch, ["--scope", path]));
      }
      expect(exits).toEqual([0, 0, 0, 0, 0, 0]);
    } finally {
      getContext.mockRestore();
      symbols.mockRestore();
      types.mockRestore();
    }
  },
  scaledBudget(60_000),
);

test(
  "native callable delivery preserves all plugin and assertion-helper declared verdicts",
  () => {
    expect(verifyPolicyProofs(POLICIES)).toEqual([]);
  },
  scaledBudget(60_000),
);

test(
  "native guard imports and imported assertion helpers retain their actual home and selected-file fence",
  async ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const membrane = readFileSync(join(scratch, MEMBRANE), "utf8").replace(
      "declare function handleSafeToDump(ctx:QuickJSContext,handle:QuickJSHandle):boolean;",
      "import {handleSafeToDump} from './guards';",
    );
    writeFileSync(join(scratch, MEMBRANE), membrane);
    for (const path of [NODE_TEST, BROWSER_TEST]) {
      writeFileSync(
        join(scratch, path),
        "import {expectImported as expectAlias} from '../support/assertions'; declare function test(name:string,fn:()=>void):void; test('imported assertion',()=>{expectAlias(1);});",
      );
    }
    expect(await runStructure(scratch, [`--check=${plugin.id}`])).toBe(1);
    expect(await runScopedCli(scratch, ["--scope", "packages/server/src/infra/plugin-host"])).toBe(1);
    for (const path of [NODE_TEST, BROWSER_TEST]) {
      expect(await runStructure(scratch, [`--check=${audit.id}`, `--file=${path}`])).toBe(1);
      expect(await runScopedCli(scratch, ["--scope", path])).toBe(1);
    }
  },
  scaledBudget(60_000),
);

test(
  "native callable services and worker failures withhold helper judgments through actual command doors",
  async ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const contexts = await import("../../../../tooling/src/verify/lib/project-context.ts");
    const original = contexts.projectCtx;
    const missing = vi.spyOn(contexts, "projectCtx").mockImplementation((root) => {
      const { nativeTypeFacts: omitted, ...context } = original(root);
      expect(omitted).toBeDefined();
      return context;
    });
    const refuse = async (): Promise<void> => {
      expect(await runStructure(scratch, [`--check=${audit.id}`, `--file=${NODE_TEST}`])).toBe(2);
      expect(await runScopedCli(scratch, ["--scope", NODE_TEST])).toBe(2);
    };
    try {
      await refuse();
    } finally {
      missing.mockRestore();
    }
    const workers = await import("../../../../tooling/src/floor/compiler/semantic-inventory-worker-run.ts");
    const failed = vi.spyOn(workers, "runInventoryPartitionWorker").mockImplementation(() => {
      throw new Error("native callable worker failure");
    });
    try {
      await refuse();
      expect(failed).toHaveBeenCalledTimes(2);
    } finally {
      failed.mockRestore();
    }
  },
  scaledBudget(60_000),
);

test(
  "native helper mutation refuses to certify assertions and preserves exact ordinary waiver identity",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const original = readFileSync(join(scratch, NODE_TEST), "utf8").replace("const expectAlias=", "let expectAlias=");
    for (const position of ["test", "describe"]) {
      writeFileSync(
        join(scratch, NODE_TEST),
        original.replace(
          "test('asserts",
          `// @orb-waive audit-client-tests(${position}): native callable identity control; ends with this fixture.\ntest('asserts`,
        ),
      );
      const context = projectCtx(scratch);
      const result = runPolicyPass({
        root: scratch,
        project: context.project,
        ...nativeTypeFactOptions(context),
        knownPolicies: POLICIES,
        policies: [audit],
        requestedPaths: [NODE_TEST],
        reviewedGrants: [],
        failOnWarnings: false,
      });
      expect(result.toolErrors).toEqual([]);
      expect(result.policies[0]?.findings).toMatchObject([{ file: NODE_TEST, token: "test" }]);
      expect(result.authority.waivedFindings).toHaveLength(position === "test" ? 1 : 0);
      expect(result.authority.effectiveFindings).toHaveLength(position === "test" ? 0 : 1);
      expect(result.authority.authorityAlarms).toHaveLength(position === "test" ? 0 : 1);
    }
  },
  scaledBudget(60_000),
);
