// @subject tooling/src/floor/code-facts/reference-fact-call.ts
// @subject tooling/src/floor/code-facts/reference-fact-same-file-merge.ts
import { symlinkSync } from "node:fs";
import { join } from "node:path";
import type { ToolFixtures } from "@orb/testkit/node/tool-fixtures.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { CallExpression, SourceFile } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import { observeCallReturns } from "../../../../tooling/src/floor/code-facts/call-returns.ts";
import { resolveModuleMemberOrigin } from "../../../../tooling/src/floor/code-facts/reference-fact.ts";
import {
  resolveCallableDeclaration,
  resolveCallableValueDeclaration,
  resolveCallableValueOrigin,
} from "../../../../tooling/src/floor/code-facts/reference-fact-call.ts";
import { createSemanticWorkspace } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";

const NATIVE_CALL = 'export function render() { return useRender({defaultTagName:"button",props:{"aria-label":"native"}}); }';
interface CallableFixture {
  readonly project: Project;
  readonly source: SourceFile;
  readonly call: CallExpression;
}
async function nativeCallableFixture(
  { plantedTree, repoRoot }: Pick<ToolFixtures, "plantedTree" | "repoRoot">,
  body: string = NATIVE_CALL,
  extras: Readonly<Record<string, string>> = {},
): Promise<CallableFixture> {
  const module = join(repoRoot, "packages/ui/node_modules/@base-ui/react/use-render/index.js");
  const config = "packages/server/tsconfig.json";
  const path = "packages/server/src/consumer.ts";
  const root = await plantedTree({
    "package.json": '{"type":"module"}',
    ".gitignore": "node_modules\n",
    "tsconfig.base.json": JSON.stringify({
      compilerOptions: { strict: true, skipLibCheck: true, target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", types: ["node"] },
    }),
    [config]: '{"extends":"../../tsconfig.base.json","include":["src/**/*.ts"]}',
    [path]: `import {useRender} from ${JSON.stringify(module)}; ${body}`,
    ...extras,
  });
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  execFixtureGit(root, ["init", "--quiet", "--template="]);
  const program = createSemanticWorkspace({ root }).program(config);
  if (program === undefined) {
    throw new Error("the supplied native callable world was not admitted");
  }
  const project = program.project();
  const source = program.sourceFile(path);
  const call = source?.getDescendantsOfKind(SyntaxKind.CallExpression).find((candidate) => candidate.getExpression().getText() === "useRender");
  if (call === undefined || source === undefined) {
    throw new Error("the actual callable invocation is missing");
  }
  return { project, source, call };
}

test("native callable VALUE distinguishes installed BaseUI function from its namespace origin", async ({ plantedTree, repoRoot }) => {
  const { project, call } = await nativeCallableFixture({ plantedTree, repoRoot });
  expect(project.getPreEmitDiagnostics().map((diagnostic) => diagnostic.getMessageText())).toEqual([]);
  expect(resolveModuleMemberOrigin(call.getExpression())).toMatchObject({ kind: "unresolved", reason: "ambiguous" });
  expect(resolveCallableDeclaration(call)).toMatchObject({ kind: "unresolved", reason: "ambiguous" });
  const value = resolveCallableValueDeclaration(call);
  expect(value.kind).toBe("resolved");
  if (value.kind === "unresolved") {
    throw new Error(value.detail);
  }
  expect(value.value.declaration.getKind()).toBe(SyntaxKind.FunctionDeclaration);
  expect(value.value.sourceFile.getFilePath()).toContain("/node_modules/@base-ui/react/use-render/useRender.d.ts");
  expect(value.value.body).toBeUndefined();
  const origin = resolveCallableValueOrigin(call);
  expect(origin.kind === "resolved" ? origin.value.target : undefined).toMatchObject({
    kind: "module",
    exportedName: "useRender",
    memberPath: [],
    canonical: { kind: "project", exportedName: "useRender" },
  });
});

test("native callable VALUE refuses a same-typed shadow formal", async ({ plantedTree, repoRoot }) => {
  const { project, call } = await nativeCallableFixture(
    { plantedTree, repoRoot },
    'const installed=useRender; export function render(useRender: typeof installed) { return useRender({defaultTagName:"button"}); }',
  );
  expect(project.getPreEmitDiagnostics().map((diagnostic) => diagnostic.getMessageText())).toEqual([]);
  expect(resolveCallableValueDeclaration(call).kind).toBe("unresolved");
  expect(resolveCallableValueOrigin(call).kind).toBe("unresolved");
});

test("native callable VALUE rejects a stale captured invocation", async ({ plantedTree, repoRoot }) => {
  const { project, source, call } = await nativeCallableFixture({ plantedTree, repoRoot });
  expect(project.getPreEmitDiagnostics().map((diagnostic) => diagnostic.getMessageText())).toEqual([]);
  const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants());
  expect(resolveCallableValueDeclaration(call, observed).kind).toBe("resolved");
  source.insertStatements(0, "// advance the owned source epoch");
  expect(resolveCallableValueDeclaration(call, observed)).toMatchObject({ kind: "unresolved", reason: "unsupported" });
  expect(resolveCallableValueOrigin(call, observed)).toMatchObject({ kind: "unresolved", reason: "unsupported" });
});

const VALUE_CONTROLS = [
  {
    name: "valid overload plus namespace keeps the implementation home",
    api: "export function chosen(value:string):string; export function chosen(value:number):number; export function chosen(value:string | number) {return value;} export namespace chosen {export const version=1;}",
    subject: "chosen(1)",
    resolved: true,
  },
  { name: "namespace alone supplies no callable value", api: "export namespace chosen {export const version=1;}", subject: "chosen", resolved: false },
  {
    name: "multiple implementations remain ambiguous",
    api: "export function chosen(value:number) {return value;} export function chosen(value:number) {return value+1;} export namespace chosen {export const version=1;}",
    subject: "chosen(1)",
    resolved: false,
  },
  {
    name: "cross-file namespace augmentation remains ambiguous",
    api: "export function chosen(value:number) {return value;} export namespace chosen {export const version=1;}",
    extra: 'import "./api.js"; declare module "./api.js" { namespace chosen {type Extra=string;} }',
    subject: "chosen(1)",
    resolved: false,
  },
  {
    name: "reassigned merged function supplies no stable value",
    api: "export function chosen(value:number) {return value;} export namespace chosen {export const version=1;} chosen=(value:number)=>value+1;",
    subject: "chosen(1)",
    resolved: false,
  },
] as const;
for (const scenario of VALUE_CONTROLS) {
  test(`callable VALUE ${scenario.name}`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile("/repo/api.ts", scenario.api);
    const extra = "extra" in scenario ? 'import "./extra.js";' : "";
    if ("extra" in scenario) {
      project.createSourceFile("/repo/extra.ts", scenario.extra);
    }
    const source = project.createSourceFile("/repo/use.ts", `import {chosen} from "./api.js"; ${extra} export const subject=${scenario.subject};`);
    const node = source.getVariableDeclarationOrThrow("subject").getInitializerOrThrow();
    const value = resolveCallableValueDeclaration(node);
    expect(value.kind).toBe(scenario.resolved ? "resolved" : "unresolved");
    if (scenario.resolved && value.kind === "resolved" && value.value.body?.getText() !== "{return value;}") {
      throw new Error("the overload did not retain its actual implementation");
    }
    expect(resolveCallableValueOrigin(node).kind).toBe(scenario.resolved ? "resolved" : "unresolved");
  });
}
