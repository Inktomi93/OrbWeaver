// @subject tooling/src/floor/code-facts/reference-fact-invocation.ts
import { readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import type { ToolFixtures } from "@orb/testkit/node/tool-fixtures.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { observeCallReturns } from "@orb/tooling/floor/code-facts/call-returns";
import type { InstanceMethodInvocation, ReferenceFact } from "@orb/tooling/floor/code-facts/reference-fact-contract";
import { declaredByPackage } from "@orb/tooling/floor/code-facts/type-member-origin";
import { createSemanticWorkspace } from "@orb/tooling/floor/compiler/ts-workspace";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import type { Node, Project, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import {
  readCallableBinding,
  readCallableInvocation,
  readInstanceMethodInvocation,
} from "../../../../tooling/src/floor/code-facts/reference-fact-invocation.ts";
import { scaledBudget } from "../../_load-budget.ts";

function method(fact: ReferenceFact<InstanceMethodInvocation>): InstanceMethodInvocation {
  if (fact.kind === "unresolved") {
    throw new Error(fact.detail);
  }
  return fact.value;
}

function value<T>(fact: ReferenceFact<T>): T {
  if (fact.kind === "unresolved") {
    throw new Error(fact.detail);
  }
  return fact.value;
}

function returned(source: SourceFile, name: string): Node {
  const call = source.getFunctionOrThrow(name).getDescendantsOfKind(SyntaxKind.ReturnStatement)[0]?.getExpression();
  if (call === undefined) {
    throw new Error(`native instance control ${name} lost its return`);
  }
  return call;
}

interface NativeInstanceProgram {
  readonly project: Project;
  readonly source: SourceFile;
  readonly root: string;
}
async function fixture({ plantedTree, repoRoot }: Pick<ToolFixtures, "plantedTree" | "repoRoot">): Promise<NativeInstanceProgram> {
  const root = await plantedTree({
    "package.json": '{"type":"module"}',
    ".gitignore": "node_modules\n",
    "tsconfig.json": JSON.stringify({ extends: join(repoRoot, "tsconfig.world-node.json"), files: ["reset.d.ts", "platform.d.ts"], include: ["*.ts"] }),
    "reset.d.ts": readFileSync(join(repoRoot, "reset.d.ts"), "utf8"),
    "platform.d.ts": readFileSync(join(repoRoot, "platform.d.ts"), "utf8"),
    "consumer.ts": `import {createDb,closeDb,userSettings,type Db} from '@orb/db';
export async function factory(){const db=await createDb(':memory:');try{const insert=db.insert.bind(db);return insert(userSettings);}finally{closeDb(db);}}
export function native(db:Db,other:Db){
 const alias=db;
 const plain=db.insert(userSettings);
 const insert=db.insert.bind(db);const bound=insert(userSettings);
 const held=db.insert.bind(alias,userSettings);const prefixed=held();
 const called=db.insert.call(db,userSettings);
 const applied=db.insert.apply(db,[userSettings]);
 const spread=db.insert.call(...[db,userSettings] as const);
 const captured=db.insert;const extracted=captured.call(db,userSettings);
 const different=db.insert.bind(other);const changedThis=different(userSettings);
 const twice=held.bind(other);const rebound=twice();
 const boundCall=insert.call(other,userSettings);
 const boundApply=insert.apply(other,[userSettings]);
 const bindSpread=db.insert.bind(...[db,userSettings] as const);const spreadPrefix=bindSpread();
 return {plain,bound,prefixed,called,applied,spread,extracted,changedThis,rebound,boundCall,boundApply,spreadPrefix};
}
export function local(db:{insert:(table:object)=>void}){const insert=db.insert.bind(db);return insert(userSettings);}
export function borrowed(db:{insert:Db['insert']}){const insert=db.insert.bind(db);return insert(userSettings);}
export function mutable(db:Db){let insert=db.insert.bind(db);return insert(userSettings);}
export function written(db:Db,other:Db){const insert=db.insert.bind(db);db=other;return insert(userSettings);}
export function shadow(){const fake={bind:()=>()=>1};return fake.bind()();}
export function opaque(db:Db,args:Parameters<Db['insert']>){return db.insert.apply(db,args);}
export function defaults(values:readonly string[]){const slice=values.slice.bind(values);const absent=slice();const explicit=slice(undefined);return {absent,explicit};}
export const directBinding=Date.now;
export const capturedBinding=Date.now.bind(Date);
export const reboundBinding=capturedBinding.bind(null);
export const executedBinding=capturedBinding();
`,
    "mutations.ts": "import {type Db,userSettings} from '@orb/db';export function replaced(db:Db){db.insert=db.insert;return db.insert(userSettings);}",
  });
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  execFixtureGit(root, ["init", "--quiet", "--template="]);
  const world = createSemanticWorkspace({ root }).program("tsconfig.json");
  if (world === undefined) {
    throw new Error("the native instance compiler program was not admitted");
  }
  const project = world.project();
  const source = world.sourceFile("consumer.ts");
  if (source === undefined) {
    throw new Error("the native instance consumer is missing");
  }
  expect(project.getPreEmitDiagnostics().map((diagnostic) => diagnostic.getMessageText())).toEqual([]);
  return { project, source, root };
}

test("installed instance declarations, wrapper arguments and effective receivers remain independent native facts", { timeout: scaledBudget(20_000) }, async ({
  plantedTree,
  repoRoot,
}) => {
  const { project, source, root } = await fixture({ plantedTree, repoRoot });
  const native = source.getFunctionOrThrow("native");
  for (const [name, receiver] of [
    ["plain", "db"],
    ["bound", "db"],
    ["prefixed", "alias"],
    ["called", "db"],
    ["applied", "db"],
    ["spread", "db"],
    ["extracted", "db"],
    ["changedThis", "other"],
    ["rebound", "alias"],
    ["boundCall", "db"],
    ["boundApply", "db"],
    ["spreadPrefix", "db"],
  ] as const) {
    const node = native.getVariableDeclarationOrThrow(name).getInitializerOrThrow();
    const invocation = method(readInstanceMethodInvocation(node));
    expect(declaredByPackage(invocation.target.member.declarations, "drizzle-orm")).toBe(true);
    expect(invocation.target.signature.kind).toBe("resolved");
    expect(value(invocation.arguments).map((argument) => argument.getText())).toEqual(["userSettings"]);
    expect(value(invocation.thisArgument)?.getText()).toBe(receiver);
    expect(invocation.receiverSource).toMatchObject({ kind: "unresolved", reason: "missing" });
    expect(invocation.executedSignature.kind).toBe("resolved");
    expect(readCallableInvocation(node).kind).toBe("unresolved");
  }
  const prefix = method(readInstanceMethodInvocation(native.getVariableDeclarationOrThrow("prefixed").getInitializerOrThrow()));
  expect(prefix.captureDeclarations.some((declaration) => declaration.getText().startsWith("held="))).toBe(true);
  expect(value(prefix.target.signature).getDeclaration().getSourceFile().getFilePath()).toContain("/node_modules/drizzle-orm/");
  expect(value(prefix.executedSignature).getDeclaration().getSourceFile().getBaseName()).toBe("lib.es5.d.ts");
  const defaults = source.getFunctionOrThrow("defaults");
  expect(value(method(readInstanceMethodInvocation(defaults.getVariableDeclarationOrThrow("absent").getInitializerOrThrow())).arguments)).toEqual([]);
  expect(
    value(method(readInstanceMethodInvocation(defaults.getVariableDeclarationOrThrow("explicit").getInitializerOrThrow())).arguments).map((node) =>
      node.getText(),
    ),
  ).toEqual(["undefined"]);
  for (const name of ["local", "borrowed"]) {
    const invocation = method(readInstanceMethodInvocation(returned(source, name)));
    expect(declaredByPackage(invocation.target.member.declarations, "drizzle-orm")).toBe(false);
  }
  for (const name of ["mutable", "shadow"]) {
    expect(readInstanceMethodInvocation(returned(source, name)).kind).toBe("unresolved");
  }
  const replaced = returned(project.getSourceFileOrThrow(join(root, "mutations.ts")), "replaced");
  expect(readInstanceMethodInvocation(replaced)).toMatchObject({ kind: "unresolved", reason: "write" });
  const written = returned(source, "written");
  const opaque = returned(source, "opaque");
  expect(method(readInstanceMethodInvocation(written)).receiverSource).toMatchObject({ kind: "unresolved", reason: "write" });
  expect(method(readInstanceMethodInvocation(opaque)).arguments).toMatchObject({ kind: "unresolved" });
  const factory = returned(source, "factory");
  expect(method(readInstanceMethodInvocation(factory)).receiverSource).toMatchObject({ kind: "unresolved", reason: "dynamic" });
  const observations = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants());
  expect(readInstanceMethodInvocation(factory, observations).kind).toBe("resolved");
  const foreign = createSemanticWorkspace({ root }).program("tsconfig.json")?.sourceFile("consumer.ts");
  if (foreign === undefined) {
    throw new Error("the foreign native compiler world lost its source");
  }
  const foreignCall = returned(foreign, "factory");
  expect(readInstanceMethodInvocation(foreignCall, observations)).toMatchObject({ kind: "unresolved", reason: "unsupported" });
  source.insertStatements(0, "// next source epoch");
  expect(readInstanceMethodInvocation(factory, observations)).toMatchObject({ kind: "unresolved", reason: "unsupported" });
});

test("legacy native binding shapes distinguish direct values from captured and rebound binds", { timeout: scaledBudget(20_000) }, async ({
  plantedTree,
  repoRoot,
}) => {
  const { source } = await fixture({ plantedTree, repoRoot });
  const direct = value(readCallableBinding(source.getVariableDeclarationOrThrow("directBinding").getNameNode()));
  expect(Object.keys(direct)).toEqual(["target", "callee", "arguments"]);
  expect(Reflect.get(direct, "invocation")).toBeUndefined();
  for (const name of ["capturedBinding", "reboundBinding"]) {
    const binding = value(readCallableBinding(source.getVariableDeclarationOrThrow(name).getNameNode()));
    expect.soft(Object.keys(binding)).toEqual(["invocation", "target", "callee", "arguments"]);
    expect.soft(Reflect.get(binding, "invocation")).toBe("bind");
  }
  const executed = value(readCallableInvocation(source.getVariableDeclarationOrThrow("executedBinding").getInitializerOrThrow()));
  expect(Object.keys(executed)).toEqual(["invocation", "target", "callee", "arguments"]);
  expect(executed.invocation).toBe("call");
});
