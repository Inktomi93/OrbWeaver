// @subject tooling/src/verify/gates/test-determinism.ts
// @subject tooling/src/verify/gates/test-mock-doctrine.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ToolFixtures } from "@orb/testkit/node/tool-fixtures.ts";
import { expect, plantFile, plantLink, test } from "@orb/testkit/node/tool-fixtures.ts";
import { deriveTypeConfigFiles, executePolicyPlan, planPolicyArgv, policySourceCandidates, projectCtx } from "@orb/tooling/verify";
import type { Project, SourceFile } from "ts-morph";
import { Project as MorphProject, SyntaxKind, ts } from "ts-morph";
import { beforeEach, vi } from "vitest";
import { observeCallReturns } from "../../../../tooling/src/floor/code-facts/call-returns.ts";
import { readCallableInvocation } from "../../../../tooling/src/floor/code-facts/reference-fact-invocation.ts";
import { descriptorVersion } from "../../../../tooling/src/floor/code-facts/semantic-inventory-inputs.ts";
import { predictedProgram } from "../../../../tooling/src/floor/compiler/project-worlds.ts";
import { createSemanticWorkspace, getWorkspace, registeredSemanticSourceView } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as determinism } from "../../../../tooling/src/verify/gates/test-determinism.ts";
import { gate as mocks } from "../../../../tooling/src/verify/gates/test-mock-doctrine.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { populationIncludes } from "../../../../tooling/src/verify/lib/population-resolver.ts";
import { nativeTypeFactOptions } from "../../../../tooling/src/verify/lib/project-context.ts";
import { readPackageExportOrigin } from "../../../../tooling/src/verify/lib/project-home-origin.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { nativeInventoryFixture } from "../../floor/compiler/native-inventory-fixture.ts";

// Composition/verdict assertions borrow an actual native snapshot; this process supplies no current-execution receipt.
beforeEach(async () => {
  const inventoryFactory = await import("@orb/tooling/floor/code-facts/semantic-inventory");
  const producer = vi.spyOn(inventoryFactory, "createSemanticInventory").mockImplementation(nativeInventoryFixture);
  return (): void => {
    producer.mockRestore();
  };
});

interface NativeProgram {
  readonly project: Project;
  readonly source: SourceFile;
  readonly root: string;
}
async function nativeProgram(
  { plantedTree, repoRoot }: Pick<ToolFixtures, "plantedTree" | "repoRoot">,
  body: string,
  extraFiles: Readonly<Record<string, string>> = {},
): Promise<NativeProgram> {
  const mint = join(repoRoot, "packages/kit/src/ids/index.ts");
  const source = `import {mintTypeId} from '../../../packages/kit/src/ids/index.ts'; import {vi} from 'vitest';\n${body}`;
  const root = await plantedTree({
    "package.json": '{"type":"module"}',
    ".gitignore": "node_modules\n",
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        strict: true,
        skipLibCheck: true,
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        allowImportingTsExtensions: true,
        noEmit: true,
        types: ["node"],
      },
      include: ["tests/**/*.ts"],
    }),
    "tests/support/node/consumer.ts": source,
    "packages/kit/src/ids/index.ts": readFileSync(mint, "utf8"),
    "packages/server/src/subject.ts": "export class Subject {run():number{return 1;}} export function run():number{return 1;}",
    ...extraFiles,
  });
  plantLink(root, "node_modules", join(repoRoot, "node_modules"), "dir");
  execFixtureGit(root, ["init", "--quiet", "--template="]);
  const view = createSemanticWorkspace({ root }).program("tsconfig.json");
  if (view === undefined) {
    throw new Error("the native testkit policy compiler world was not admitted");
  }
  const project = view.project();
  expect(project.getPreEmitDiagnostics().map((diagnostic) => diagnostic.getMessageText())).toEqual([]);
  const consumer = view.sourceFile("tests/support/node/consumer.ts");
  if (consumer === undefined) {
    throw new Error("the native invocation consumer is missing");
  }
  return { root, project, source: consumer };
}
async function nativePolicy(
  fixtures: Pick<ToolFixtures, "plantedTree" | "repoRoot">,
  body: string,
  policy: GatePolicy,
): Promise<ReturnType<typeof runPolicyPass>> {
  const { root } = await nativeProgram(fixtures, body);
  return nativePolicyPass(root, policy);
}
function nativePolicyPass(root: string, policy: GatePolicy): ReturnType<typeof runPolicyPass> {
  const context = projectCtx(root);
  return runPolicyPass({
    knownPolicies: [policy],
    policies: [policy],
    root,
    project: context.project,
    ...nativeTypeFactOptions(context),
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

test("native MJS helpers retain Node ownership and both semantic policy boundaries", async ({ plantedTree, repoRoot }) => {
  const configs = deriveTypeConfigFiles(repoRoot);
  const elapsed = ["performance", "now"].join(".");
  const business = ["Date", "now"].join(".");
  const marker = `// @orb-waive test-determinism(${elapsed}): measures actual native work, not product time\n`;
  const path = "tests/support/node/consumer.mjs";
  const { project, root } = await nativeProgram({ plantedTree, repoRoot }, "export {mintTypeId,vi};", {
    "tsconfig.base.json": readFileSync(join(repoRoot, "tsconfig.base.json"), "utf8"),
    "tsconfig.world-node.json": configs["tsconfig.world-node.json"] ?? "",
    "tsconfig.json": configs["tsconfig.json"] ?? "",
    "tests/support/node/crypto-door.mjs": "export {randomUUID as draw} from 'node:crypto';",
    [path]: `import {draw} from './crypto-door.mjs';
import {mintTypeId} from '../../../packages/kit/src/ids/index.ts';
import {vi} from 'vitest';
import * as subject from '../../../packages/server/src/subject.ts';
const captured=draw.bind(null);
export const opaque=captured();
export const ambient=mintTypeId('chat');
export const seeded=mintTypeId('chat',prefix=>prefix);
const {spyOn:watch}=vi;
watch(subject,'run');
watch(subject.Subject.prototype,'run');
const injected={run:()=>1};
watch(injected,'run');
watch(String.prototype,'indexOf');
export const prompt=JSON.parse('[]').map((block)=>block.text).join('\\n');
${marker}const started=${elapsed}();
${marker}export const physical={ms:${elapsed}()-started};
export const businessTime=${business}();`,
  });
  expect(predictedProgram(path)).toBe("tsconfig.json");
  expect(project.getCompilerOptions()).toMatchObject({ allowJs: true });
  expect(project.getCompilerOptions().checkJs ?? false).toBe(false);
  const source = project.getSourceFileOrThrow(join(root, path));
  expect(source.compilerNode).toBe(project.getProgram().compilerObject.getSourceFile(source.getFilePath()));
  expect(source.getScriptKind()).toBe(ts.ScriptKind.JS);
  expect(source.getImportDeclarationOrThrow("./crypto-door.mjs").getModuleSpecifierSourceFile()?.getFilePath()).toBe(
    join(root, "tests/support/node/crypto-door.mjs"),
  );
  expect(
    getWorkspace({ root })
      .getSourceFiles()
      .map((file) => file.getFilePath()),
  ).toContain(join(root, path));
  expect(policySourceCandidates([path, "tests/support/node-extra/consumer.mjs", "tests/support/browser/consumer.mjs", "eslint.config.js"])).toEqual([path]);
  expect(populationIncludes({ in: ["@tests"], ext: ["mjs"] }, path)).toBe(true);
  const policies = [determinism, mocks];
  const corpus = { gates: policies, families: policies.map(({ family }) => family) };
  const planned = planPolicyArgv(root, ["--file", path, "--check", determinism.id, "--check", mocks.id, "--strict-scope"], corpus);
  expect(planned.ok).toBe(true);
  if (!planned.ok || planned.plan.mode !== "run") {
    throw new Error("native MJS policy plan did not resolve");
  }
  const plan = planned.plan;
  for (const policy of plan.policies) {
    expect(policy.population.effectiveSourcePaths).toEqual([path]);
  }
  const context = projectCtx(root);
  const executed = executePolicyPlan({ root, project: context.project, ...nativeTypeFactOptions(context), plan, corpus, reviewedGrants: [] });
  expect(executed.ok).toBe(true);
  if (!executed.ok) {
    throw new Error(executed.message);
  }
  expect(executed.exitCode).toBe(1);
  expect(executed.pass.toolErrors).toEqual([]);
  expect(executed.pass.authority.withheldPolicyIds).toEqual([]);
  expect(executed.pass.authority.authorityAlarms).toEqual([]);
  expect(executed.pass.authority.waivedFindings).toHaveLength(2);
  const deterministicFindings = executed.pass.authority.effectiveFindings.filter(({ policyId }) => policyId === determinism.id);
  expect(deterministicFindings.map(({ line }) => line).toSorted((left, right) => left - right)).toEqual(
    ["opaque", "ambient", "businessTime"].map((name) => source.getVariableDeclarationOrThrow(name).getStartLineNumber()),
  );
  const mockFindings = executed.pass.authority.effectiveFindings.filter(({ policyId }) => policyId === mocks.id);
  expect(mockFindings).toHaveLength(2);
  expect(mockFindings.map(({ message }) => message)).toEqual(
    expect.arrayContaining([expect.stringContaining("internal module namespace"), expect.stringContaining("authored class prototype")]),
  );
  const rejectNativeSource = (nativeSourceView: NonNullable<Parameters<typeof executePolicyPlan>[0]["nativeSourceView"]>, reason: string): void => {
    const refused = executePolicyPlan({ root, project: context.project, nativeSourceView, plan, corpus, reviewedGrants: [] });
    expect(refused.ok).toBe(true);
    if (!refused.ok) {
      throw new Error(refused.message);
    }
    expect(refused.exitCode).toBe(2);
    expect(refused.pass.toolErrors).toHaveLength(policies.length);
    expect(refused.pass.toolErrors.every(({ message }) => message.includes(reason))).toBe(true);
    expect(refused.pass.authority.withheldPolicyIds).toEqual(policies.map(({ id }) => id));
  };
  rejectNativeSource(() => undefined, "no compiler owner");
  rejectNativeSource(() => context.nativeSourceView?.("tests/support/node/crypto-door.mjs"), "foreign compiler owner");
  const native = context.nativeSourceView?.(path);
  if (native === undefined) {
    throw new Error("the accepted MJS source lost its native owner");
  }
  native.sourceFile.insertText(native.sourceFile.getFullWidth(), "\n");
  rejectNativeSource(() => native, "authored source version");
  const generated = configs["tsconfig.json"] ?? "";
  const withoutJavaScript = generated.replace('"allowJs": true', '"allowJs": false');
  expect(withoutJavaScript).not.toBe(generated);
  plantFile(root, "tsconfig.json", withoutJavaScript);
  expect(planPolicyArgv(root, ["--file", path, "--check", determinism.id, "--strict-scope"], corpus)).toMatchObject({
    ok: false,
    exitCode: 2,
    message: expect.stringContaining("compiler program membership"),
  });
});

for (const altered of ["descriptor", "live-project"] as const) {
  test(`native MJS rejects altered ${altered} compiler meaning behind the same config and source`, async ({ plantedTree, repoRoot }) => {
    const configs = deriveTypeConfigFiles(repoRoot);
    const path = "tests/support/node/consumer.mjs";
    const { root } = await nativeProgram({ plantedTree, repoRoot }, "export {mintTypeId,vi};", {
      "tsconfig.base.json": readFileSync(join(repoRoot, "tsconfig.base.json"), "utf8"),
      "tsconfig.world-node.json": configs["tsconfig.world-node.json"] ?? "",
      "tsconfig.json": configs["tsconfig.json"] ?? "",
      [path]: "import {vi} from 'vitest'; vi.mock('./subject.mjs'); export const value=1;",
      "tests/support/node/subject.mjs": "export const subject=1;",
      "shadow.mjs": "export const vi={mock:()=>{}};",
    });
    const canonical = createSemanticWorkspace({ root }).program("tsconfig.json");
    if (canonical === undefined) {
      throw new Error("canonical native compiler owner was not admitted");
    }
    const descriptor = canonical.descriptor;
    const version = descriptorVersion(descriptor);
    const corpus = { gates: [mocks], families: [mocks.family] };
    const planned = planPolicyArgv(root, ["--file", path, "--check", mocks.id, "--strict-scope"], corpus);
    if (!planned.ok || planned.plan.mode !== "run") {
      throw new Error("native compiler meaning control has no execution plan");
    }
    const plan = planned.plan;
    const context = projectCtx(root);
    const execute = (owner: typeof canonical): ReturnType<typeof executePolicyPlan> => {
      const source = owner.sourceFile(path);
      if (source === undefined) {
        throw new Error("native compiler meaning control lost its MJS source");
      }
      const view = registeredSemanticSourceView(source);
      expect(view?.sourceFile.getFullText()).toBe(context.project.getSourceFileOrThrow(join(root, path)).getFullText());
      return executePolicyPlan({ root, project: context.project, nativeSourceView: () => view, plan, corpus, reviewedGrants: [] });
    };
    expect(execute(canonical)).toMatchObject({
      ok: true,
      exitCode: 1,
      pass: { toolErrors: [], authority: { effectiveFindings: [{ policyId: mocks.id }], withheldPolicyIds: [] } },
    });
    const overlaid = createSemanticWorkspace({ root, overlay: { addedPaths: [], deletedPaths: ["tests/support/node/subject.mjs"] } }).program("tsconfig.json");
    if (overlaid === undefined) {
      throw new Error("the native filename overlay lost its compiler owner");
    }
    expect(overlaid.descriptor.files).not.toContain("tests/support/node/subject.mjs");
    expect(
      runPolicyPass({
        knownPolicies: [mocks],
        policies: [mocks],
        root,
        project: overlaid.project(),
        requestedPaths: [path],
        reviewedGrants: [],
        failOnWarnings: false,
      }),
    ).toMatchObject({ toolErrors: [], authority: { effectiveFindings: [{ policyId: mocks.id }], withheldPolicyIds: [] } });
    const options = { ...descriptor.commandLine.options, baseUrl: root, paths: { vitest: ["./shadow.mjs"] } };
    const foreign = createSemanticWorkspace({
      root,
      ...(altered === "descriptor" ? { programs: [{ ...descriptor, commandLine: { ...descriptor.commandLine, options } }] } : {}),
    }).program("tsconfig.json");
    if (foreign === undefined) {
      throw new Error("the altered native compiler control was not constructed");
    }
    if (altered === "live-project") {
      foreign.project().compilerOptions.set(options);
    }
    expect(descriptorVersion(foreign.descriptor) === version).toBe(altered === "live-project");
    expect(foreign.sourceFile(path)?.getImportDeclarationOrThrow("vitest").getModuleSpecifierSourceFile()?.getFilePath()).toBe(join(root, "shadow.mjs"));
    const refused = execute(foreign);
    expect(refused.ok).toBe(true);
    if (!refused.ok) {
      throw new Error(refused.message);
    }
    expect(refused.exitCode).toBe(2);
    expect(refused.pass.toolErrors).toEqual([{ policyId: mocks.id, phase: "visitFile", message: expect.stringContaining("noncanonical compiler meaning") }]);
    expect(refused.pass.authority.effectiveFindings).toEqual([]);
    expect(refused.pass.authority.withheldPolicyIds).toEqual([mocks.id]);
  });
}

const ORIGIN_CASES = [
  { name: "bound canonical mint without generator", body: "const mint=mintTypeId.bind(null); export const id=mint('chat');", count: 1 },
  {
    name: "bound canonical mint with generator",
    body: "const mint=mintTypeId.bind(null); const next=(prefix:string)=>prefix; export const id=mint('chat',next);",
    count: 0,
  },
  { name: "native call preserves missing generator slot", body: "export const id=mintTypeId.call(null,'chat');", count: 1 },
  {
    name: "native call preserves supplied generator slot",
    body: "const next=(prefix:string)=>prefix; export const id=mintTypeId.call(null,'chat',next);",
    count: 0,
  },
  { name: "native apply preserves explicit undefined generator", body: "export const id=mintTypeId.apply(null,['chat',undefined]);", count: 1 },
  {
    name: "native apply preserves supplied generator",
    body: "const next=(prefix:string)=>prefix; export const id=mintTypeId.apply(null,['chat',next]);",
    count: 0,
  },
  {
    name: "native bind prefixes the actual argument order",
    body: "const next=(prefix:string)=>prefix; const mint=mintTypeId.bind(null,'chat',next); export const id=mint();",
    count: 0,
  },
  { name: "bound ambient entropy retains its actual target", body: 'const draw=Math["random"].bind(Math); export const value=draw();', count: 1 },
  {
    name: "bound local shadow is not ambient entropy",
    body: "const Math={random:()=>1}; const draw=Math.random.bind(Math); export const value=draw();",
    count: 0,
  },
  {
    name: "bound vendor generator remains ambient at the business mint",
    body: "import {typeidUnboxed} from 'typeid-js'; const next=typeidUnboxed.bind(null); export const id=mintTypeId('chat',next);",
    count: 1,
  },
  {
    name: "bound vendor mint remains ambient",
    body: "import {typeidUnboxed} from 'typeid-js'; const mint=typeidUnboxed.bind(null); export const id=mint('chat');",
    count: 1,
  },
  {
    name: "unknown apply tuple refuses argument evidence",
    body: "declare const args: [string,((prefix:string)=>string)?]; export const id=mintTypeId.apply(null,args);",
    count: -1,
  },
  {
    name: "mutating apply tuple refuses original argument evidence",
    body: "const args:[string,((prefix:string)=>string)?]=['chat']; args.push('foreign'); export const id=mintTypeId.apply(null,args);",
    count: -1,
  },
  {
    name: "closed const apply tuple preserves generator",
    body: "const next=(prefix:string)=>prefix; const args:[string,((prefix:string)=>string)?]=['chat',next]; export const id=mintTypeId.apply(null,args);",
    count: 0,
  },
  {
    name: "opaque containing apply tuple refuses argument evidence",
    body: "const args:[string,((prefix:string)=>string)?]=['chat']; declare function escape(value:typeof args):void; escape(args); export const id=mintTypeId.apply(null,args);",
    count: -1,
  },
  { name: "bound Date constructor retains zero-argument ambient read", body: "const Clock=Date.bind(null); export const value=new Clock();", count: 1 },
  { name: "void bound generator executes the ambient default", body: "const mint=mintTypeId.bind(null,'chat',void 0); export const value=mint();", count: 1 },
  { name: "bound native fake timer invocation retains its origin", body: "const freeze=vi.useFakeTimers.bind(vi); freeze();", count: 1 },
  {
    name: "bound Date constructor preserves explicit deterministic input",
    body: "const Clock=Date.bind(null); export const value=new Clock(1234);",
    count: 0,
  },
  { name: "native fake timer bind construction is not execution", body: "export const freeze=vi.useFakeTimers.bind(vi);", count: 0 },
  { name: "mutable native bound callable withholds capture", body: "let mint=mintTypeId.bind(null); export const value=mint('chat');", count: -1 },
  {
    name: "written native bound callable withholds capture",
    body: 'const draw=Math["random"].bind(Math); draw.call=draw.call; export const value=draw();',
    count: -1,
  },
  {
    name: "mutable generator capture cannot become seeded by its annotation",
    body: "import {typeidUnboxed} from 'typeid-js'; let next:(prefix:string)=>string=typeidUnboxed; const mint=mintTypeId.bind(null,'chat',next); next=(prefix:string)=>prefix; export const value=mint();",
    count: -1,
  },
] as const;
for (const scenario of ORIGIN_CASES) {
  test(`native testkit determinism ${scenario.name}`, async ({ plantedTree, repoRoot }) => {
    const result = await nativePolicy({ plantedTree, repoRoot }, scenario.body, determinism);
    const refused = scenario.count < 0;
    expect(result.toolErrors.map(({ message }) => message)).toEqual(refused ? [expect.stringContaining("test-determinism cannot prove")] : []);
    expect(result.policies[0]?.owner.status === "success").toBe(!refused);
    expect(result.authority.withheldPolicyIds).toEqual(refused ? [determinism.id] : []);
    expect(result.authority.effectiveFindings).toHaveLength(Math.max(0, scenario.count));
  });
}

const MOCK_CASES = [
  { name: "destructured mock cannot replace internal module", body: "const {mock:replace}=vi; replace('../../../packages/server/src/subject.js');", count: 1 },
  { name: "bound mock cannot replace internal module", body: "const replace=vi.mock.bind(vi); replace('../../../packages/server/src/subject.js');", count: 1 },
  { name: "bound mock preserves external target", body: "const replace=vi.mock.bind(vi); replace('node:fs');", count: 0 },
  {
    name: "destructured spy preserves authored prototype identity",
    body: "import {Subject} from '../../../packages/server/src/subject.js'; const {spyOn:watch}=vi; watch(Subject.prototype,'run');",
    count: 1,
  },
  { name: "destructured spy preserves injected object", body: "const port={run:()=>1}; const {spyOn:watch}=vi; watch(port,'run');", count: 0 },
  { name: "native call retains internal replacement argument", body: "vi.mock.call(vi,import('../../../packages/server/src/subject.js')); ", count: 1 },
  {
    name: "unknown native apply replacement tuple withholds",
    body: "declare const args:[Promise<typeof import('../../../packages/server/src/subject.js')>]; vi.mock.apply(vi,args);",
    count: -1,
  },
] as const;
for (const scenario of MOCK_CASES) {
  test(`native testkit mock doctrine ${scenario.name}`, async ({ plantedTree, repoRoot }) => {
    const result = await nativePolicy({ plantedTree, repoRoot }, scenario.body, mocks);
    const refused = scenario.count < 0;
    expect(result.toolErrors.map(({ message }) => message)).toEqual(
      refused ? [expect.stringContaining("test-mock-doctrine cannot prove replacement arguments")] : [],
    );
    expect(result.policies[0]?.owner.status === "success").toBe(!refused);
    expect(result.authority.withheldPolicyIds).toEqual(refused ? [mocks.id] : []);
    expect(result.authority.effectiveFindings).toHaveLength(Math.max(0, scenario.count));
  });
}

for (const scenario of [
  { name: "same-typed callable formal", body: "export function use(draw:typeof Math.random) {return draw.bind(Math)();}", resolved: false },
  { name: "mutable bound alias", body: 'let draw=Math["random"].bind(Math); export const value=draw();', resolved: false },
  { name: "written bound alias", body: 'const draw=Math["random"].bind(Math); draw.call=draw.call; export const value=draw();', resolved: false },
  { name: "native wrapper shadow", body: "const fake={bind:()=>()=>1}; export const value=fake.bind()();", resolved: false },
  {
    name: "rebound target preserves prefix order",
    body: "const first=mintTypeId.bind(null,'chat'); const next=(prefix:string)=>prefix; const second=first.bind(null,next); export const value=second();",
    resolved: true,
  },
] as const) {
  test(`native callable invocation ${scenario.name}`, async ({ plantedTree, repoRoot }) => {
    const { source } = await nativeProgram({ plantedTree, repoRoot }, scenario.body);
    const node =
      source.getVariableDeclaration("value")?.getInitializer() ?? source.getFunctionOrThrow("use").getDescendantsOfKind(SyntaxKind.CallExpression)[0];
    if (node === undefined) {
      throw new Error("the actual native invocation is missing");
    }
    const result = readCallableInvocation(node);
    expect(result.kind).toBe(scenario.resolved ? "resolved" : "unresolved");
    const target = result.kind === "resolved" ? result.value.target : undefined;
    expect(target?.kind === "module" ? target.canonical.exportedName : undefined).toEqual(scenario.resolved ? "mintTypeId" : undefined);
    const arguments_ =
      result.kind === "resolved" && result.value.arguments.kind === "resolved" ? result.value.arguments.value.map((argument) => argument.getText()) : undefined;
    expect(arguments_).toEqual(scenario.resolved ? ["'chat'", "next"] : undefined);
  });
}

test("native callable invocation refuses stale captured world", async ({ plantedTree, repoRoot }) => {
  const { source } = await nativeProgram({ plantedTree, repoRoot }, "const mint=mintTypeId.bind(null); export const value=mint('chat');");
  const node = source.getVariableDeclarationOrThrow("value").getInitializerOrThrow();
  const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants());
  expect(readCallableInvocation(node, observed).kind).toBe("resolved");
  source.insertStatements(0, "// replace the captured source epoch");
  expect(readCallableInvocation(node, observed)).toMatchObject({ kind: "unresolved", reason: "unsupported" });
});

test("native imported bound mint retains actual construction origin", async ({ plantedTree, repoRoot }) => {
  const { source, root } = await nativeProgram({ plantedTree, repoRoot }, "import {mint as bound} from './bindings.js'; export const value=bound('chat');", {
    "tests/support/node/bindings.ts": "import {mintTypeId} from '../../../packages/kit/src/ids/index.ts'; export const mint=mintTypeId.bind(null);",
  });
  const result = nativePolicyPass(root, determinism);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toHaveLength(1);
  const fact = readCallableInvocation(source.getVariableDeclarationOrThrow("value").getInitializerOrThrow());
  expect(fact.kind === "resolved" ? fact.value.target : undefined).toMatchObject({ kind: "module", canonical: { exportedName: "mintTypeId" } });
});

for (const scenario of [
  {
    name: "vendor mint",
    body: "import {mint} from './exports.js'; const bound=mint.bind(null); export const value=bound('chat');",
    exports: "export {typeidUnboxed as mint} from 'typeid-js';",
    policy: determinism,
  },
  {
    name: "Vitest replacement",
    body: "import {runner} from './exports.js'; const replace=runner.mock.bind(runner); replace('../../../packages/server/src/subject.js');",
    exports: "export {vi as runner} from 'vitest';",
    policy: mocks,
  },
]) {
  test(`native reexported ${scenario.name} retains its declaring package`, async ({ plantedTree, repoRoot }) => {
    const { root } = await nativeProgram({ plantedTree, repoRoot }, scenario.body, { "tests/support/node/exports.ts": scenario.exports });
    const result = nativePolicyPass(root, scenario.policy);
    expect(result.toolErrors).toEqual([]);
    expect(result.policies[0]?.owner.status).toBe("success");
    expect(result.authority.effectiveFindings).toHaveLength(1);
  });
}

test("native same-named foreign mint cannot borrow the renamed package origin", async ({ plantedTree, repoRoot }) => {
  const { root } = await nativeProgram(
    { plantedTree, repoRoot },
    "import {mint} from './exports.js'; const bound=mint.bind(null); export const value=bound('chat');",
    {
      "tests/support/node/exports.ts": "export {typeidUnboxed as mint} from './foreign.js';",
      "tests/support/node/foreign.ts": "export function typeidUnboxed(prefix:string):string{return prefix;}",
    },
  );
  const result = nativePolicyPass(root, determinism);
  expect(result.toolErrors).toEqual([]);
  expect(result.policies[0]?.owner.status).toBe("success");
  expect(result.authority.effectiveFindings).toEqual([]);
});

test("callable bind cycle refuses rather than recursing through invalid source", () => {
  const project = new MorphProject({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    "/bound-cycle.ts",
    "const left:(prefix:string)=>string=right.bind(null); const right:(prefix:string)=>string=left.bind(null); export const value=left('chat');",
  );
  expect(project.getPreEmitDiagnostics().length).toBeGreaterThan(0);
  expect(readCallableInvocation(source.getVariableDeclarationOrThrow("value").getInitializerOrThrow())).toMatchObject({ kind: "unresolved", reason: "cycle" });
});

test("native callable invocation refuses another captured compiler world", async ({ plantedTree, repoRoot }) => {
  const body = "const mint=mintTypeId.bind(null); export const value=mint('chat');";
  const original = await nativeProgram({ plantedTree, repoRoot }, body);
  const other = await nativeProgram({ plantedTree, repoRoot }, body);
  const observed = observeCallReturns(original.source.getDescendantsOfKind(SyntaxKind.CallExpression), original.source.getDescendants());
  expect(readCallableInvocation(other.source.getVariableDeclarationOrThrow("value").getInitializerOrThrow(), observed)).toMatchObject({
    kind: "unresolved",
    reason: "unsupported",
  });
});

for (const waived of [false, true]) {
  test(`native elapsed observation ${waived ? "consumes exact law-sanctioned waivers" : "is not automatically permitted by subtraction"}`, async ({
    plantedTree,
    repoRoot,
  }) => {
    const marker = waived
      ? "// @orb-waive test-determinism(performance.now): the SUBJECT records actual elapsed execution; no injected clock measures physical work\n"
      : "";
    // eslint-disable-next-line orb/test-ambient-source-string -- This elapsed-waiver control is parsed, never executed; remove with the native policy control.
    const clock = "performance.now()";
    const body = `${marker}const started=${clock};\n${marker}export const measurement={ms:${clock}-started};`;
    const result = await nativePolicy({ plantedTree, repoRoot }, body, determinism);
    expect(result.toolErrors).toEqual([]);
    expect(result.authority.effectiveFindings).toHaveLength(waived ? 0 : 2);
    expect(result.authority.waivedFindings).toHaveLength(waived ? 2 : 0);
    expect(result.authority.authorityAlarms).toEqual([]);
  });
}

test("native external JWT protocol values remain an explicit policy fork", async ({ plantedTree, repoRoot }) => {
  // eslint-disable-next-line orb/test-ambient-source-string -- This protocol-time rejection fixture is parsed, never executed; remove with the policy control.
  const clock = "Date.now()";
  const body = `import {randomUUID} from 'node:crypto'; import {SignJWT} from 'jose'; const token=new SignJWT({iss:'native-issuer',iat:Math.floor(${clock}/1000),jti:randomUUID()}); export const protocol=token;`;
  const result = await nativePolicy({ plantedTree, repoRoot }, body, determinism);
  expect(result.toolErrors).toEqual([]);
  expect(result.policies[0]?.owner.status).toBe("success");
  expect(result.authority.effectiveFindings).toHaveLength(2);
  expect(result.authority.authorityAlarms).toEqual([]);
});

test("native Node crypto identity retains ambient draws without classifying local or foreign UUID declarations", async ({ plantedTree, repoRoot }) => {
  const { root, source } = await nativeProgram(
    { plantedTree, repoRoot },
    // eslint-disable-next-line orb/test-ambient-source-string -- This crypto-origin fixture is parsed, never executed; remove with these native identity controls.
    `import {randomUUID} from 'node:crypto';
import {randomUUID as renamed} from 'crypto';
import * as crypto from 'node:crypto';
import {draw as republished} from './crypto-door.ts';
import {randomUUID as foreign} from './foreign-uuid.ts';
const bound=randomUUID.bind(null);
export const named=randomUUID();
export const alias=renamed();
export const member=crypto['randomUUID']();
export const captured=bound();
export const called=randomUUID.call(null);
export const applied=randomUUID.apply(null,[]);
export const barrel=republished();
const local={randomUUID:()=> 'fixed-local'};
export const shadow=local.randomUUID();
export const unrelated=foreign();`,
    {
      "tests/support/node/crypto-door.ts": "export {randomUUID as draw} from 'node:crypto';",
      "tests/support/node/foreign-uuid.ts": "export const randomUUID=():string=>'fixed-foreign';",
    },
  );
  const ambient = ["named", "alias", "member", "captured", "called", "applied", "barrel"];
  for (const name of ambient) {
    const invocation = readCallableInvocation(source.getVariableDeclarationOrThrow(name).getInitializerOrThrow());
    expect(invocation.kind).toBe("resolved");
    if (invocation.kind !== "resolved") {
      throw new Error(`native crypto invocation ${name} did not resolve`);
    }
    expect(readPackageExportOrigin(invocation.value.callee, ["node:crypto", "crypto"], new Set(["randomUUID"]))).toEqual({
      verdict: "home",
      exportedName: "randomUUID",
    });
  }
  for (const name of ["shadow", "unrelated"]) {
    const initializer = source.getVariableDeclarationOrThrow(name).getInitializerIfKindOrThrow(SyntaxKind.CallExpression);
    expect(readPackageExportOrigin(initializer.getExpression(), ["node:crypto", "crypto"], new Set(["randomUUID"])).verdict).toBe("other");
  }
  const result = nativePolicyPass(root, determinism);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
  expect(result.authority.effectiveFindings).toHaveLength(ambient.length);
  expect(result.authority.effectiveFindings.map(({ line }) => line).sort((left, right) => left - right)).toEqual(
    ambient.map((name) => source.getVariableDeclarationOrThrow(name).getInitializerOrThrow().getStartLineNumber()).sort((left, right) => left - right),
  );
  expect(result.authority.authorityAlarms).toEqual([]);
});

for (const policy of [determinism, mocks]) {
  test(`maintained ${policy.id} declared boundaries retain their verdicts`, () => {
    expect(verifyPolicyProofs([policy])).toEqual([]);
  });
}

for (const position of ["watch", "spyOn"]) {
  test(`native aliased spy waiver ${position === "watch" ? "binds its actual callee" : "rejects a semantic name absent from the call"}`, async ({
    plantedTree,
    repoRoot,
  }) => {
    const body = `import {Subject} from '../../../packages/server/src/subject.js'; const {spyOn:watch}=vi;\n// @orb-waive test-mock-doctrine(${position}): this control observes the actual shared prototype; ends when the subject is an injected port\nwatch(Subject.prototype,'run');`;
    const result = await nativePolicy({ plantedTree, repoRoot }, body, mocks);
    const correct = position === "watch";
    expect(result.toolErrors).toEqual([]);
    expect(result.authority.effectiveFindings).toHaveLength(correct ? 0 : 1);
    expect(result.authority.waivedFindings).toHaveLength(correct ? 1 : 0);
    expect(result.authority.authorityAlarms).toHaveLength(correct ? 0 : 1);
    expect(result.authority.authorityAlarms.map(({ message }) => message)).toEqual(correct ? [] : [expect.stringContaining("position")]);
  });
}

const REVIEW_CORRECTIONS = [
  {
    name: "seeded call wrapper spread",
    body: "const next=(prefix:string)=>prefix; export const value=mintTypeId.call(...[null,'chat',next] as const);",
    policy: determinism,
    count: 0,
  },
  {
    name: "seeded bind wrapper spread",
    body: "const next=(prefix:string)=>prefix; const mint=mintTypeId.bind(...[null,'chat',next] as const); export const value=mint();",
    policy: determinism,
    count: 0,
  },
  { name: "unseeded call wrapper spread", body: "export const value=mintTypeId.call(...[null,'chat'] as const);", policy: determinism, count: 1 },
  {
    name: "unseeded bind wrapper spread",
    body: "const mint=mintTypeId.bind(...[null,'chat'] as const); export const value=mint();",
    policy: determinism,
    count: 1,
  },
  {
    name: "internal mock call wrapper spread",
    body: "vi.doMock.call(...[vi,import('../../../packages/server/src/subject.js')] as const);",
    policy: mocks,
    count: 1,
  },
  {
    name: "internal mock apply wrapper spread",
    body: "const args:[Promise<typeof import('../../../packages/server/src/subject.js')>]=[import('../../../packages/server/src/subject.js')]; vi.doMock.apply(...[vi,args] as const);",
    policy: mocks,
    count: 1,
  },
  {
    name: "opaque promise target under wrapper spread remains unproved",
    body: "const target=Promise.resolve({}); vi.doMock.call(...[vi,target] as const);",
    policy: mocks,
    count: 1,
  },
  {
    name: "unknown call wrapper spread withholds",
    body: "declare const args:[typeof vi,Promise<typeof import('../../../packages/server/src/subject.js')>]; vi.doMock.call(...args);",
    policy: mocks,
    count: -1,
  },
  { name: "parenthesized mutable ambient bind", body: 'let draw=(Math["random"].bind(Math)); export const value=draw();', policy: determinism, count: -1 },
  {
    name: "parenthesized mutable native mock bind",
    body: "let replace=(vi.doMock.bind(vi)); replace('../../../packages/server/src/subject.js');",
    policy: mocks,
    count: -1,
  },
  {
    name: "unknown bound Date constructor arguments withhold",
    body: "const Clock=Date.bind(null); function getArgs():[]{return [];} const args=getArgs(); export const value=new Clock(...args);",
    policy: determinism,
    count: -1,
  },
  { name: "direct Date function reads actual ambient clock", body: "export const value=Date();", policy: determinism, count: 1 },
  { name: "bound Date function reads actual ambient clock", body: "const Clock=Date.bind(null); export const value=Clock();", policy: determinism, count: 1 },
  { name: "native Date call wrapper reads actual ambient clock", body: "export const value=Date.call(null);", policy: determinism, count: 1 },
  {
    name: "authored Date function does not borrow the ambient target",
    body: "function Date():string{return 'frozen';} export const value=Date();",
    policy: determinism,
    count: 0,
  },
] as const;
for (const scenario of REVIEW_CORRECTIONS) {
  test(`974 review correction ${scenario.name}`, async ({ plantedTree, repoRoot }) => {
    const result = await nativePolicy({ plantedTree, repoRoot }, scenario.body, scenario.policy);
    const refused = scenario.count < 0;
    expect(result.toolErrors.map(({ message }) => message)).toEqual(refused ? [expect.stringContaining(`${scenario.policy.id} cannot prove`)] : []);
    expect(result.policies[0]?.owner.status === "success").toBe(!refused);
    expect(result.authority.withheldPolicyIds).toEqual(refused ? [scenario.policy.id] : []);
    expect(result.authority.effectiveFindings).toHaveLength(Math.max(0, scenario.count));
  });
}
