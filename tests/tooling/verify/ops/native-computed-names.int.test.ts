import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Node, Project } from "ts-morph";
import { vi } from "vitest";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { gate as audit } from "../../../../tooling/src/verify/gates/audit-client-tests.ts";
import { gate as plugin } from "../../../../tooling/src/verify/gates/plugin-dump-guard.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, nativeTypeFactSession, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { runScopedCli } from "../../../../tooling/src/verify/ops/scoped.ts";
import { runStructure } from "../../../../tooling/src/verify/ops/structure.ts";
import { scaledBudget } from "../../_load-budget.ts";

const MEMBRANE = "packages/server/src/infra/plugin-host/membrane.ts";
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
    JSON.stringify({ compilerOptions: { ...compilerOptions, lib: ["es2022"], types: ["node"] }, files: [MEMBRANE, NODE_TEST, "node.ts", "browser.ts"] }),
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
  write("tooling/tsconfig.json", JSON.stringify({ compilerOptions, files: [plugin, audit].map(({ id }) => `src/verify/gates/${id}.ts`) }));
  for (const { id } of [plugin, audit]) {
    write(
      `tooling/src/verify/gates/${id}.ts`,
      `export {gate} from ${JSON.stringify(pathToFileURL(join(repoRoot, `tooling/src/verify/gates/${id}.ts`)).href)};`,
    );
  }
  write(
    MEMBRANE,
    `import type {QuickJSContext,QuickJSHandle} from 'quickjs-emscripten-core';
declare function handleSafeToDump(ctx:QuickJSContext,handle:QuickJSHandle):boolean;
export function tryDumpGuestValue(ctx:QuickJSContext,handle:QuickJSHandle):object {
 if(!handleSafeToDump(ctx,handle)){return {};}
 return ctx.dump(handle);
}
const DUMP='dump'; const ALIAS=DUMP;
export function bypass(dumpReceiver:QuickJSContext,dumpHandle:QuickJSHandle):object{return dumpReceiver[ALIAS](dumpHandle);}
`,
  );
  write(NODE_TEST, TEST_SOURCE);
  write(BROWSER_TEST, TEST_SOURCE);
  execFixtureGit(root, ["init", "-q"]);
}

test(
  "computed-key command doors use native importing-world names without syntax Type or Symbol reads",
  async ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const contexts = await import("../../../../tooling/src/verify/lib/project-context.ts");
    const context = projectCtx(scratch);
    const getContext = vi.spyOn(contexts, "projectCtx").mockReturnValue(context);
    const symbolFor = Node.prototype.getSymbol;
    const typeFor = Node.prototype.getType;
    const symbols = vi.spyOn(Node.prototype, "getSymbol").mockImplementation(function (this: Node) {
      if (this.getProject() === context.project) {
        throw new Error("syntax computed-key Symbol read");
      }
      return symbolFor.call(this);
    });
    const types = vi.spyOn(Node.prototype, "getType").mockImplementation(function (this: Node) {
      if (this.getProject() === context.project) {
        throw new Error("syntax computed-key Type read");
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
      expect(exits).toEqual([1, 1, 1, 1, 0, 0]);
    } finally {
      getContext.mockRestore();
      symbols.mockRestore();
      types.mockRestore();
    }
  },
  scaledBudget(60_000),
);

test(
  "computed-name findings use the authored member and exact ordinary waiver position",
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
        knownPolicies: [plugin, audit],
        policies: [plugin, audit],
        reviewedGrants: [],
        failOnWarnings: false,
      });
      expect(result.toolErrors).toEqual([]);
      const membrane = context.project.getSourceFileOrThrow(join(scratch, MEMBRANE));
      const source = membrane.getFullText();
      const coordinate = membrane.getLineAndColumnAtPos(source.indexOf("[ALIAS]") + 1);
      expect(result.policies.find(({ id }) => id === plugin.id)?.findings).toMatchObject([
        { token: "ALIAS", line: coordinate.line, column: coordinate.column },
      ]);
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

test(
  "computed dump anchors distinguish earlier receiver spelling and escaped versus plain literal keys",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const original = readFileSync(join(scratch, MEMBRANE), "utf8");
    for (const [key, token, offset] of [
      ['["dump"]', "dump", 2],
      ['["du\\u006dp"]', '"du\\u006dp"', 1],
      ["[ALIAS]", "ALIAS", 1],
    ] as const) {
      const text = original.replace("[ALIAS]", key);
      writeFileSync(join(scratch, MEMBRANE), text);
      const context = projectCtx(scratch);
      const source = context.project.getSourceFileOrThrow(join(scratch, MEMBRANE));
      const coordinate = source.getLineAndColumnAtPos(text.indexOf("dumpReceiver" + key) + "dumpReceiver".length + offset);
      const result = runPolicyPass({
        root: scratch,
        project: context.project,
        ...nativeTypeFactOptions(context),
        knownPolicies: [plugin, audit],
        policies: [plugin],
        reviewedGrants: [],
        failOnWarnings: false,
      });
      expect(result.toolErrors).toEqual([]);
      expect(result.policies[0]?.findings).toMatchObject([{ token, line: coordinate.line, column: coordinate.column }]);
    }
  },
  scaledBudget(60_000),
);

test(
  "transparent computed dump anchors retain inner authored positions and reject hard-policy waivers",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const original = readFileSync(join(scratch, MEMBRANE), "utf8");
    const prefix = original.slice(0, original.indexOf("export function bypass("));
    const cases = [
      ['[("dump")]', "dump"],
      ["[(ALIAS)]", "ALIAS"],
      ['[("dump" as const)]', "dump"],
      ['[(ALIAS as "dump")]', "ALIAS"],
      ['[("dump" satisfies string)]', "dump"],
      ["[(ALIAS satisfies string)]", "ALIAS"],
      ["[(ALIAS!)]", "ALIAS"],
      ["[(\n ALIAS\n)]", "ALIAS"],
    ] as const;
    for (const waive of [false, true]) {
      const text =
        prefix +
        cases
          .map(
            ([key, token], index) =>
              `export function bypass${String(index)}(dumpReceiver:QuickJSContext,dumpHandle:QuickJSHandle):object {\n` +
              (waive ? `// @orb-waive plugin-dump-guard(${token}): wrapper anchor control; ends with this fixture.\n` : "") +
              `return dumpReceiver${key}(dumpHandle);\n}\n`,
          )
          .join("");
      writeFileSync(join(scratch, MEMBRANE), text);
      const context = projectCtx(scratch);
      const source = context.project.getSourceFileOrThrow(join(scratch, MEMBRANE));
      const expected = cases.map(([key, token]) => ({
        token,
        ...source.getLineAndColumnAtPos(text.indexOf(`dumpReceiver${key}`) + "dumpReceiver".length + key.indexOf(token)),
      }));
      const result = runPolicyPass({
        root: scratch,
        project: context.project,
        ...nativeTypeFactOptions(context),
        knownPolicies: [plugin, audit],
        policies: [plugin],
        reviewedGrants: [],
        failOnWarnings: false,
      });
      expect(result.toolErrors).toEqual([]);
      expect(result.policies[0]?.findings).toMatchObject(expected);
      expect(result.authority.waivedFindings).toEqual([]);
      expect(result.authority.effectiveFindings).toHaveLength(cases.length);
      expect(result.authority.authorityAlarms).toHaveLength(waive ? cases.length : 0);
    }
  },
  scaledBudget(60_000),
);
