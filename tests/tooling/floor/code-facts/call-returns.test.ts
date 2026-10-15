// `readCallReturns` answers with a fact: every return of a reachable factory, or a refusal that says why. An empty
// list never stands in for an unreadable factory.

import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { CallExpression, Node } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import { vi } from "vitest";
import {
  observeCallReturns,
  readCallReturnProgram,
  readCallReturns,
  readObservedCallableConsumers,
} from "../../../../tooling/src/floor/code-facts/call-returns.ts";
import { beginReferencePass, endReferencePass, isDocumentationLinkReference } from "../../../../tooling/src/floor/code-facts/reference-fact.ts";
import { createSemanticWorkspace } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";

function callIn(code: string, name: string): CallExpression {
  const project = new Project({ useInMemoryFileSystem: true });
  const sf = project.createSourceFile("/repo/use.ts", code);
  return sf.getVariableDeclarationOrThrow(name).getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression);
}

function returnsOf(call: CallExpression): readonly string[] | string {
  const returns = readCallReturns(call);
  return returns.kind === "resolved" ? returns.value.map((node: Node) => node.getText()) : returns.detail;
}

test("readCallReturns hands back every return of a local factory and refuses an unreachable one", () => {
  const code = `
    function two(flag: boolean) {
      if (flag) { return { a: 1 }; }
      return { b: 2 };
    }
    export const both = two(true);
    export const missing = notDeclaredAnywhere();
  `;

  expect(returnsOf(callIn(code, "both"))).toEqual(["{ a: 1 }", "{ b: 2 }"]);
  expect(readCallReturns(callIn(code, "missing")).kind).toBe("unresolved");
});

test("readCallReturns enters a const-bound arrow and refuses a function that returns nothing", () => {
  const code = "const wrap = (x: number) => ({ x });\nfunction nothing() { return; }\nexport const arrow = wrap(1);\nexport const empty = nothing();\n";

  expect(returnsOf(callIn(code, "arrow"))).toEqual(["({ x })"]);
  expect(returnsOf(callIn(code, "empty"))).toContain("returns no expression");
});

const DOCUMENTED_CALLABLES = [
  { tag: "link", escape: false },
  { tag: "linkcode", escape: false },
  { tag: "linkplain", escape: false },
  { tag: "link", escape: true },
] as const;

for (const scenario of DOCUMENTED_CALLABLES) {
  test(`native callable documentation ${scenario.tag} with code escape ${scenario.escape}`, async ({ plantedTree, repoRoot }) => {
    const root = await plantedTree({
      "package.json": '{"type":"module"}',
      ".gitignore": "node_modules\n",
      "tsconfig.base.json": JSON.stringify({
        compilerOptions: { strict: true, skipLibCheck: true, target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", types: ["node"] },
      }),
      "packages/server/tsconfig.json": '{"extends":"../../tsconfig.base.json","include":["src/**/*.ts"]}',
      "packages/server/src/consumer.ts": `
        function factory(value: string) { return value; }
        /** Reference {@${scenario.tag} factory}. */
        export function documented() { return 'documentation'; }
        export const selected = factory('native');
        ${scenario.escape ? "/** @type {Array<typeof factory>} */ export const escaped = [factory];" : ""}
      `,
    });
    symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
    execFixtureGit(root, ["init", "--quiet", "--template="]);
    const source = createSemanticWorkspace({ root }).program("packages/server/tsconfig.json")?.sourceFile("packages/server/src/consumer.ts");
    if (source === undefined) {
      throw new Error("the native documented callable world omitted its source");
    }
    const factory = source.getFunctionOrThrow("factory");
    const call = source.getVariableDeclarationOrThrow("selected").getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression);
    beginReferencePass();
    try {
      const references = factory.findReferencesAsNodes();
      expect(source.getPreEmitDiagnostics()).toEqual([]);
      expect(references.some(isDocumentationLinkReference)).toBe(true);
      const observations = observeCallReturns([call], references);
      const captured = readCallReturnProgram(call, observations);
      expect(captured.kind).toBe("resolved");
      if (captured.kind === "unresolved") {
        throw new Error(captured.detail);
      }
      expect(captured.value.referencesObserved).toBe(true);
      expect(captured.value.escapingReferences.has(factory.compilerNode)).toBe(scenario.escape);
      const consumers = readObservedCallableConsumers(factory, captured.value);
      expect(consumers.kind, consumers.kind === "unresolved" ? consumers.detail : "").toBe(scenario.escape ? "unresolved" : "resolved");
    } finally {
      endReferencePass();
    }
  });
}

for (const expression of ["target", "(target)", "(target as typeof target)"]) {
  test(`callable consumer membership avoids descendant materialization for ${expression}`, () => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
    const source = project.createSourceFile("/consumer.ts", `function target(value:string){return value;}const selected=${expression}("value");`);
    const call = source.getVariableDeclarationOrThrow("selected").getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression);
    const observations = observeCallReturns([call], source.getDescendants(), { suppliedCallableTargets: true });
    const program = observations.programs[0];
    if (program === undefined) {
      throw new Error("the native call capture is missing");
    }
    const descendants = vi.spyOn(call.getExpression(), "getDescendants");
    try {
      const consumers = readObservedCallableConsumers(source.getFunctionOrThrow("target"), program);
      expect(consumers.kind).toBe("resolved");
      expect(consumers.kind === "resolved" && consumers.value.length === 1 && consumers.value[0]?.call === call).toBe(true);
      expect(descendants).not.toHaveBeenCalled();
    } finally {
      descendants.mockRestore();
    }
  });
}

test("settled captured indexes classify unchanged references only after a new call-array revision", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const source = project.createSourceFile(
    "/consumer.ts",
    "const actions={run:(value:number)=>value};actions.run(1);const unrelated=()=>2;const sentinel=unrelated;",
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const references = source.getDescendants();
  const sentinel = source.getVariableDeclarationOrThrow("sentinel").getNameNode();
  const classification = vi.spyOn(sentinel, "getAncestors");
  try {
    const observations = observeCallReturns(calls, references, { suppliedCallableTargets: true });
    const initial = classification.mock.calls.length;
    expect(initial).toBeGreaterThan(0);
    classification.mockClear();
    const program = observations.programs[0];
    const owner = source.getDescendantsOfKind(SyntaxKind.ArrowFunction)[0];
    if (program === undefined || owner === undefined) {
      throw new Error("the native captured owner is missing");
    }
    const prior = program.byCall;
    const consumers = readObservedCallableConsumers(owner, program);
    expect(consumers.kind === "resolved" ? consumers.value.map(({ call }) => call.getText()) : []).toEqual(["actions.run(1)"]);
    expect(program.byCall === prior).toBe(false);
    expect(classification.mock.calls.length).toBe(initial);
  } finally {
    classification.mockRestore();
  }
});

test("caller-expression membership does not admit a reference in the same call's argument", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const source = project.createSourceFile("/consumer.ts", "function target(value:object){return value;}const selected=target(()=>target);");
  const owner = source.getFunctionOrThrow("target");
  const call = source.getVariableDeclarationOrThrow("selected").getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression);
  const observations = observeCallReturns([call], [owner.getNameNodeOrThrow(), call.getExpression()], { suppliedCallableTargets: true });
  const program = observations.programs[0];
  if (program === undefined) {
    throw new Error("the sparse native capture is missing");
  }
  expect(program.escapingReferences.has(owner.compilerNode)).toBe(false);
  const consumers = readObservedCallableConsumers(owner, program);
  expect(consumers.kind).toBe("unresolved");
  expect(consumers.kind === "unresolved" && consumers.node === call.getArguments()[0]?.asKindOrThrow(SyntaxKind.ArrowFunction).getBody()).toBe(true);
});

test("settled capture invalidates replaced targets while retaining the previously published map", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const source = project.createSourceFile("/consumer.ts", "function invoke(callback:()=>number){return callback();}invoke(()=>1);");
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const callback = calls.find((call) => call.getExpression().getText() === "callback");
  const observations = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
  const program = observations.programs[0];
  const owner = source.getDescendantsOfKind(SyntaxKind.ArrowFunction)[0];
  if (program === undefined || callback === undefined || owner === undefined) {
    throw new Error("the supplied callback control is missing");
  }
  const prior = program.byCall;
  const count = program.calls.length;
  expect(prior.get(callback.compilerNode)?.targets.kind).toBe("unresolved");
  const consumers = readObservedCallableConsumers(owner, program);
  expect(consumers.kind === "resolved" && consumers.value.some(({ call }) => call === callback)).toBe(true);
  expect(program.calls.length).toBe(count);
  expect(program.byCall === prior).toBe(false);
  const targets = program.byCall.get(callback.compilerNode)?.targets;
  expect(targets?.kind === "resolved" && targets.value.length === 1 && targets.value[0] === owner).toBe(true);
  expect(prior.get(callback.compilerNode)?.targets.kind).toBe("unresolved");
});

test("settled capture includes newly entered calls and reference escapes without modifying a pinned map", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const source = project.createSourceFile(
    "/consumer.ts",
    "declare function escape(value:object):void;function leaf(){return 1;}function invoke(callback:()=>number){return callback();}invoke(()=>{escape(leaf);return leaf();});",
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const root = calls.find((call) => call.getExpression().getText() === "invoke");
  const leafCall = calls.find((call) => call.getExpression().getText() === "leaf");
  const owner = source.getDescendantsOfKind(SyntaxKind.ArrowFunction)[0];
  if (root === undefined || leafCall === undefined || owner === undefined) {
    throw new Error("the entered-body controls are missing");
  }
  const observations = observeCallReturns([root], [root.getExpression()], { suppliedCallableTargets: true });
  const program = observations.programs[0];
  if (program === undefined) {
    throw new Error("the root-only native capture is missing");
  }
  const prior = program.byCall;
  expect(prior.has(leafCall.compilerNode)).toBe(false);
  expect(program.escapingReferences.has(source.getFunctionOrThrow("leaf").compilerNode)).toBe(false);
  expect(readObservedCallableConsumers(owner, program).kind).toBe("resolved");
  expect(program.byCall.has(leafCall.compilerNode)).toBe(true);
  expect(prior.has(leafCall.compilerNode)).toBe(false);
  expect(program.escapingReferences.has(source.getFunctionOrThrow("leaf").compilerNode)).toBe(true);
});

test("settled capture does not reuse indexes after an observed wrapper is forgotten in the same Program", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const source = project.createSourceFile("/consumer.ts", "const actions={run:()=>1};actions.run();const sentinel=1;");
  const observations = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants(), { suppliedCallableTargets: true });
  const program = observations.programs[0];
  const owner = source.getDescendantsOfKind(SyntaxKind.ArrowFunction)[0];
  if (program === undefined || owner === undefined) {
    throw new Error("the native capture is missing");
  }
  source.getVariableDeclarationOrThrow("sentinel").getNameNode().forget();
  expect(project.getProgram().compilerObject === program.program).toBe(true);
  expect(() => readObservedCallableConsumers(owner, program)).toThrow(/forgotten/);
});

for (const mutation of ["options", "source", "foreign"] as const) {
  test(`settled captured consumers refuse ${mutation} native context changes`, () => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
    const source = project.createSourceFile("/consumer.ts", "const actions={run:()=>1};actions.run();");
    const observations = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants(), { suppliedCallableTargets: true });
    const program = observations.programs[0];
    let owner = source.getDescendantsOfKind(SyntaxKind.ArrowFunction)[0];
    if (program === undefined || owner === undefined) {
      throw new Error("the native capture is missing");
    }
    if (mutation === "options") {
      project.compilerOptions.set({ strict: true });
    } else if (mutation === "source") {
      source.replaceWithText("const changed=true;");
    } else {
      const foreign = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
      owner = foreign.createSourceFile("/consumer.ts", "const actions={run:()=>1};actions.run();").getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
    }
    const result = readObservedCallableConsumers(owner, program);
    expect({ kind: result.kind, reason: result.kind === "unresolved" ? result.reason : undefined }).toEqual({ kind: "unresolved", reason: "unsupported" });
  });
}

test("captured epoch validation visits every source without materializing map entries", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const first = project.createSourceFile("/first.ts", "export function first(){return 1;}first();");
  const second = project.createSourceFile("/second.ts", "export function second(){return 2;}second();");
  const sources = [first, second];
  const observations = observeCallReturns(sources.flatMap((source) => source.getDescendantsOfKind(SyntaxKind.CallExpression)));
  const program = observations.programs[0];
  if (program === undefined) {
    throw new Error("the native source capture is missing");
  }
  expect(program.sources.size).toBe(2);
  const entries = vi.spyOn(program.sources, Symbol.iterator);
  const firstChecked = vi.spyOn(first, "wasForgotten");
  const secondChecked = vi.spyOn(second, "wasForgotten");
  const nativeChecked = vi.spyOn(project, "getProgram");
  try {
    for (const source of sources) {
      const result = readCallReturnProgram(source, observations);
      expect(result.kind === "resolved" && result.value === program).toBe(true);
    }
    expect(firstChecked.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(secondChecked.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(nativeChecked.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(entries).not.toHaveBeenCalled();
  } finally {
    entries.mockRestore();
    firstChecked.mockRestore();
    secondChecked.mockRestore();
    nativeChecked.mockRestore();
  }
  second.forget();
  const refused = readCallReturnProgram(first, observations);
  expect({ kind: refused.kind, reason: refused.kind === "unresolved" ? refused.reason : undefined }).toEqual({ kind: "unresolved", reason: "unsupported" });
});
