// `readCallReturns` answers with a fact: every return of a reachable factory, or a refusal that says why. An empty
// list never stands in for an unreadable factory.

import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { CallExpression, Node } from "ts-morph";
import { Project, SyntaxKind, ts } from "ts-morph";
import { vi } from "vitest";
import {
  observeCallReturns,
  readCallReturnProgram,
  readCallReturns,
  readObservedCallableConsumers,
} from "../../../../tooling/src/floor/code-facts/call-returns.ts";
import { beginReferencePass, endReferencePass, isDocumentationLinkReference } from "../../../../tooling/src/floor/code-facts/reference-fact.ts";
import type {
  CallReturnAlternative,
  CallReturnCaptureOptions,
  CallReturnObservation,
  CallReturnProgram,
  ReferenceFact,
} from "../../../../tooling/src/floor/code-facts/reference-fact-contract.ts";
import { readReturnedValue } from "../../../../tooling/src/floor/code-facts/value-carrier.ts";
import { createSemanticWorkspace, nativeReferenceNodes } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";
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

test("reached imported initializers demand their actual calls without sweeping module initializers", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const values = project.createSourceFile(
    "/values.ts",
    'export function marker(){return 0;}function seed(){return "local";}function make(value:string){return {value};}declare function unrelated():object;export const ignored=unrelated();export const output=make(seed());',
  );
  const source = project.createSourceFile("/consumer.ts", 'import {marker,output} from "./values";marker();export const result=output;');
  const root = source.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
  const initializer = values.getVariableDeclarationOrThrow("output").getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression);
  const nested = initializer.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
  const ignored = values.getVariableDeclarationOrThrow("ignored").getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression);
  beginReferencePass();
  try {
    const observed = observeCallReturns([root], source.getDescendants(), { suppliedCallableTargets: true });
    const program = observed.programs[0];
    if (program === undefined) {
      throw new Error("the native value demand control has no captured owner");
    }
    expect(program.sources.has(values)).toBe(true);
    const before = program.byCall;
    const beforeCalls = program.calls;
    expect(before.has(initializer.compilerNode)).toBe(false);
    const result = readReturnedValue(source.getVariableDeclarationOrThrow("result").getNameNode(), ["value"], observed, {
      terminals: new Set(),
      bindings: new Map(),
    });
    expect(result.kind, result.kind === "unresolved" ? result.detail : "resolved").toBe("resolved");
    expect(result.kind === "resolved" && result.value.map((value) => value.value.getText())).toEqual(['"local"']);
    expect(program.byCall.has(initializer.compilerNode)).toBe(true);
    expect(program.byCall.has(nested.compilerNode)).toBe(true);
    expect(program.byCall.has(ignored.compilerNode)).toBe(false);
    expect(before.has(initializer.compilerNode)).toBe(false);
    expect(beforeCalls.map((call) => call.call.getText())).toEqual(["marker()"]);
    expect(program.calls.map((call) => call.call.getText())).toEqual(["marker()", "make(seed())", "seed()"]);
    const published = program.byCall;
    expect(program.demandValueCall?.(initializer).kind).toBe("resolved");
    expect(program.byCall === published).toBe(true);
  } finally {
    endReferencePass();
  }
});

test("reached value demand preserves same-body allocation bindings and defers uncalled argument bodies", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const source = project.createSourceFile(
    "/allocations.ts",
    'function marker(){return 0;}marker();function make(value:string,callback:()=>void){return {value,callback};}declare function deferred():void;const first=make("one",()=>deferred());const second=make("two",()=>deferred());',
  );
  const root = source.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
  beginReferencePass();
  try {
    const observed = observeCallReturns([root], source.getDescendants(), { suppliedCallableTargets: true });
    const program = observed.programs[0];
    if (program === undefined) {
      throw new Error("the captured allocation owner is missing");
    }
    const outputs = ["first", "second"].map((name) =>
      readReturnedValue(source.getVariableDeclarationOrThrow(name).getNameNode(), ["value"], observed, { terminals: new Set(), bindings: new Map() }),
    );
    expect(outputs.map((fact) => (fact.kind === "resolved" ? fact.value.map((value) => value.value.getText()) : fact.detail))).toEqual([['"one"'], ['"two"']]);
    expect(program.calls.map(({ call }) => call.getText())).toEqual(["marker()", 'make("one",()=>deferred())', 'make("two",()=>deferred())']);
  } finally {
    endReferencePass();
  }
});

test("reached value arguments capture computed method keys but not uncalled bodies or defaults", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const source = project.createSourceFile(
    "/argument-evaluation.ts",
    'function marker(){return 0;}marker();function key(){return "method";}function deferred(){return 0;}function make(value:object){return value;}const output=make({[key()](value=deferred()){return deferred();}});',
  );
  beginReferencePass();
  try {
    const observations = observeCallReturns([source.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression)], source.getDescendants());
    const program = observations.programs[0];
    const call = source.getVariableDeclarationOrThrow("output").getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression);
    if (program?.demandValueCall === undefined) {
      throw new Error("the argument capture owner is missing");
    }
    expect(program.demandValueCall(call).kind).toBe("resolved");
    expect(program.calls.map(({ call: actual }) => actual.getText())).toEqual(["marker()", "make({[key()](value=deferred()){return deferred();}})", "key()"]);
  } finally {
    endReferencePass();
  }
});

test("reached class initialization refusal does not poison an independent value demand", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const source = project.createSourceFile(
    "/unclosed-class.ts",
    "function marker(){return 0;}marker();function make(value:object){return value;}declare function deferred():number;const opaque=make(class {static value=deferred();});const safe=make({value:1});",
  );
  beginReferencePass();
  try {
    const observations = observeCallReturns([source.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression)], source.getDescendants());
    const program = observations.programs[0];
    const call = source.getVariableDeclarationOrThrow("opaque").getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression);
    if (program?.demandValueCall === undefined) {
      throw new Error("the actual demand owner is missing");
    }
    const refusal = program.demandValueCall(call);
    expect(refusal.kind === "unresolved" && refusal.reason === "unsupported").toBe(true);
    expect(program.byCall.has(call.compilerNode)).toBe(false);
    const safe = readReturnedValue(source.getVariableDeclarationOrThrow("safe").getNameNode(), ["value"], observations, new Set());
    expect(safe.kind === "resolved" && safe.value.map((value) => value.value.getText())).toEqual(["1"]);
  } finally {
    endReferencePass();
  }
});

for (const sparse of ["no reference inputs", "no demand service"] as const) {
  test(`reached value demand retains missing admission for ${sparse}`, () => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
    const source = project.createSourceFile("/sparse.ts", 'function marker(){return 0;}marker();function make(){return "value";}const output=make();');
    const observed = observeCallReturns(
      [source.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression)],
      sparse === "no reference inputs" ? undefined : source.getDescendants(),
    );
    const program = observed.programs[0];
    if (program === undefined) {
      throw new Error("the sparse capture is missing");
    }
    const { demandValueCall, ...withoutDemand } = program;
    expect(typeof demandValueCall).toBe(sparse === "no reference inputs" ? "undefined" : "function");
    const result = readReturnedValue(source.getVariableDeclarationOrThrow("output").getNameNode(), [], { programs: [withoutDemand] }, new Set());
    expect(result.kind === "unresolved" && result.reason === "missing" && result.detail.includes("not supplied")).toBe(true);
  });
}

for (const mutation of ["source", "options", "forgotten", "foreign", "closed pass", "disposed pass", "cancellation", "missing validation"] as const) {
  test(`reached value demand preserves ${mutation} admission before publication`, () => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
    const source = project.createSourceFile("/demand-epoch.ts", 'function marker(){return 0;}marker();function make(){return "value";}const output=make();');
    const service = project.getLanguageService().compilerObject;
    const create = service.createReadonlyReferencePass.bind(service);
    let pass: ts.ReadonlyReferencePass | undefined;
    const acquisition = vi.spyOn(service, "createReadonlyReferencePass").mockImplementation(() => {
      pass = create();
      return pass;
    });
    beginReferencePass();
    try {
      const observed = observeCallReturns([source.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression)], source.getDescendants());
      const program = observed.programs[0];
      if (program?.demandValueCall === undefined) {
        throw new Error("the actual value demand service is missing");
      }
      nativeReferenceNodes(source.getFunctionOrThrow("marker").getNameNodeOrThrow());
      let call = source.getVariableDeclarationOrThrow("output").getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression);
      const before = program.byCall;
      if (pass === undefined) {
        throw new Error("the native reference dependency was not observed");
      }
      const nativePass = pass;
      const changes = {
        source: (): void => {
          source.addStatements("const changed=1;");
        },
        options: (): void => {
          project.compilerOptions.set({ strict: true });
        },
        forgotten: (): void => {
          call.forget();
        },
        foreign: (): void => {
          call = callIn('function make(){return "value";}const output=make();', "output");
        },
        "closed pass": endReferencePass,
        "disposed pass": (): void => nativePass.dispose(),
        cancellation: (): void => {
          vi.spyOn(nativePass, "validate").mockImplementation(() => {
            throw new ts.OperationCanceledException();
          });
        },
        "missing validation": (): void => {
          Object.defineProperty(nativePass, "validate", { value: undefined });
        },
      };
      changes[mutation]();
      let result: ReferenceFact<true> | undefined;
      let cancelled = false;
      let disposed = false;
      try {
        result = program.demandValueCall(call);
      } catch (error) {
        cancelled = error instanceof ts.OperationCanceledException;
        disposed = error instanceof Error && error.message.includes("disposed");
        if (!(cancelled || disposed)) {
          throw error;
        }
      }
      expect(cancelled).toBe(mutation === "cancellation");
      expect(disposed).toBe(mutation === "disposed pass");
      expect(result?.kind).toBe(cancelled || disposed ? undefined : "unresolved");
      expect(result?.kind === "unresolved" ? result.reason : undefined).toBe(cancelled || disposed ? undefined : "unsupported");
      expect(program.byCall === before).toBe(true);
      expect(program.calls.length).toBe(1);
    } finally {
      endReferencePass();
      acquisition.mockRestore();
    }
  });
}

test("reached value demand queues a missing caller until the active refinement round publishes", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const source = project.createSourceFile(
    "/queued-values.ts",
    "function invoke(callback:()=>number){return callback();}invoke(()=>1);const later=invoke(()=>2);",
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const callback = calls[0];
  const first = calls[1];
  const later = calls[2];
  const firstOwner = source.getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
  if (callback === undefined || first === undefined || later === undefined) {
    throw new Error("the queued native caller fixture is incomplete");
  }
  beginReferencePass();
  try {
    const observed = observeCallReturns([callback, first], [callback.getExpression(), first.getExpression()], { suppliedCallableTargets: true });
    const program = observed.programs[0];
    if (program?.demandValueCall === undefined) {
      throw new Error("the demand-capable capture is missing");
    }
    const before = program.byCall;
    const callee = callback.getExpression();
    const original = callee.getSymbol.bind(callee);
    let queued = false;
    let queuedResult: ReferenceFact<true> | undefined;
    let queuedSnapshotSame = false;
    let queuedAbsent = false;
    const resolving = vi.spyOn(callee, "getSymbol").mockImplementation(() => {
      if (!queued && new Error("queued actual value demand").stack?.includes("at refinedObservation") === true) {
        queued = true;
        queuedResult = program.demandValueCall?.(later);
        queuedSnapshotSame = program.byCall === before;
        queuedAbsent = !program.byCall.has(later.compilerNode);
      }
      return original();
    });
    try {
      expect(readObservedCallableConsumers(firstOwner, program).kind).toBe("resolved");
    } finally {
      resolving.mockRestore();
    }
    expect(queued).toBe(true);
    expect(queuedResult?.kind === "unresolved" && queuedResult.reason === "missing" && queuedResult.detail.includes("queued")).toBe(true);
    expect(queuedSnapshotSame).toBe(true);
    expect(queuedAbsent).toBe(true);
    expect(before.has(later.compilerNode)).toBe(false);
    expect(program.byCall.has(later.compilerNode)).toBe(true);
    expect(program.callers.get(source.getFunctionOrThrow("invoke").compilerNode)?.map(({ call }) => call.getText())).toEqual([
      "invoke(()=>1)",
      "invoke(()=>2)",
    ]);
    const targets = program.byCall.get(callback.compilerNode)?.targets;
    expect(targets?.kind === "resolved" && targets.value.map((target) => target.getText())).toEqual(["()=>1", "()=>2"]);
    const complete = observeCallReturns([callback, first, later], source.getDescendants(), { suppliedCallableTargets: true });
    const completed = complete.programs[0];
    if (completed === undefined) {
      throw new Error("the complete native comparison is missing");
    }
    expect(readObservedCallableConsumers(firstOwner, completed).kind).toBe("resolved");
    expect(program.calls.map(capturedObservationText)).toEqual(completed.calls.map(capturedObservationText));
  } finally {
    endReferencePass();
  }
});

for (const alias of [false, true]) {
  test(`reached value demand publishes a previously absent ${alias ? "aliased" : "direct"} callable escape`, () => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
    const source = project.createSourceFile(
      "/demanded-escape.ts",
      `function marker(){return 0;}marker();function leaf(){return 1;}declare function escape(value:object):void;function expose(){${alias ? "const alias=leaf;escape(alias);" : "escape(leaf);"}return 0;}const output=expose();`,
    );
    const root = source.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
    const call = source.getVariableDeclarationOrThrow("output").getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression);
    const leaf = source.getFunctionOrThrow("leaf");
    beginReferencePass();
    try {
      const observed = observeCallReturns([root], [root.getExpression()], { suppliedCallableTargets: true });
      const program = observed.programs[0];
      if (program?.demandValueCall === undefined) {
        throw new Error("the reached escape capture is missing");
      }
      const pinned = program.escapingReferences;
      expect(pinned.has(leaf.compilerNode)).toBe(false);
      expect(program.demandValueCall(call).kind).toBe("resolved");
      const escapeFact = program.escapingReferences.get(leaf.compilerNode)?.[0];
      expect(escapeFact?.kind).toBe(alias ? undefined : "unresolved");
      expect(pinned.has(leaf.compilerNode)).toBe(false);
      const consumers = readObservedCallableConsumers(leaf, program);
      expect(consumers.kind).toBe("unresolved");
      const complete = observeCallReturns([root, call], [root.getExpression()], { suppliedCallableTargets: true }).programs[0];
      if (complete === undefined) {
        throw new Error("the complete escape comparison is missing");
      }
      expect(capturedFactText(escapeFact, () => [])).toBe(capturedFactText(complete.escapingReferences.get(leaf.compilerNode)?.[0], () => []));
      expect(capturedFactText(consumers, (rows) => rows.map(capturedObservationText))).toBe(
        capturedFactText(readObservedCallableConsumers(leaf, complete), (rows) => rows.map(capturedObservationText)),
      );
    } finally {
      endReferencePass();
    }
  });
}

test("reached value capture does not publish a partial closure when native observation throws", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const source = project.createSourceFile(
    "/partial.ts",
    'function marker(){return 0;}marker();function make(value:string){return value;}function nested(){return "value";}const output=make(nested());',
  );
  beginReferencePass();
  try {
    const observed = observeCallReturns([source.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression)], source.getDescendants());
    const program = observed.programs[0];
    const call = source.getVariableDeclarationOrThrow("output").getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression);
    if (program?.demandValueCall === undefined) {
      throw new Error("the complete demand owner is missing");
    }
    const before = program.byCall;
    const calls = program.calls;
    const interruption = new ts.OperationCanceledException();
    const callee = call.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression).getExpression();
    const original = callee.getSymbol.bind(callee);
    let interrupted = false;
    const read = vi.spyOn(callee, "getSymbol").mockImplementation(() => {
      if (new Error("staged native call observation").stack?.includes("at observeCall") === true) {
        interrupted = true;
        throw interruption;
      }
      return original();
    });
    try {
      expect(() => program.demandValueCall?.(call)).toThrow();
      expect(interrupted).toBe(true);
      expect(program.byCall === before).toBe(true);
      expect(program.calls === calls).toBe(true);
      expect(calls.length).toBe(1);
    } finally {
      read.mockRestore();
    }
  } finally {
    endReferencePass();
  }
});

for (const body of ["return output;", "return opaque();"] as const) {
  test(`reached value demand preserves unresolved closure: ${body}`, () => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
    const source = project.createSourceFile(
      "/unclosed.ts",
      `function marker(){return 0;}marker();declare function opaque():string;function make(){${body}}const output=make();`,
    );
    beginReferencePass();
    try {
      const observed = observeCallReturns([source.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression)], source.getDescendants());
      const result = readReturnedValue(source.getVariableDeclarationOrThrow("output").getNameNode(), [], observed, new Set());
      expect(result.kind).toBe("unresolved");
      const complete = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants());
      const baseline = readReturnedValue(source.getVariableDeclarationOrThrow("output").getNameNode(), [], complete, new Set());
      expect(capturedFactText(result, (values) => values.map((value) => value.value.getText()))).toBe(
        capturedFactText(baseline, (values) => values.map((value) => value.value.getText())),
      );
    } finally {
      endReferencePass();
    }
  });
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

test("settled captured indexes reuse lexical classification across a new call-array revision", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const source = project.createSourceFile(
    "/consumer.ts",
    "const actions={run:(value:number)=>value};actions.run(1);const unrelated=()=>2;const sentinel=unrelated;",
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const references = source.getDescendants();
  const classifications = new Map<ts.Node, number>();
  const probes = references.map((reference) => {
    const ancestors = reference.getAncestors.bind(reference);
    return vi.spyOn(reference, "getAncestors").mockImplementation(() => {
      if (new Error("lexical classification observation").stack?.includes("at referenceCandidate") === true) {
        const node = reference.compilerNode;
        classifications.set(node, (classifications.get(node) ?? 0) + 1);
      }
      return ancestors();
    });
  });
  try {
    const observations = observeCallReturns(calls, references, { suppliedCallableTargets: true });
    const initial = [...classifications.values()].reduce((sum, count) => sum + count, 0);
    expect(initial).toBeGreaterThan(0);
    const program = observations.programs[0];
    const owner = source.getDescendantsOfKind(SyntaxKind.ArrowFunction)[0];
    if (program === undefined || owner === undefined) {
      throw new Error("the native captured owner is missing");
    }
    const prior = program.byCall;
    const consumers = readObservedCallableConsumers(owner, program);
    expect(consumers.kind === "resolved" ? consumers.value.map(({ call }) => call.getText()) : []).toEqual(["actions.run(1)"]);
    expect(program.byCall === prior).toBe(false);
    const after = [...classifications.values()].reduce((sum, count) => sum + count, 0);
    console.info("native lexical classification work", { initial, after, distinct: classifications.size });
    expect(after).toBe(initial);
  } finally {
    for (const probe of probes) {
      probe.mockRestore();
    }
  }
});

test("lexical classification preserves changed call admission with unchanged reference inputs", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const source = project.createSourceFile("/admission.ts", "function marker(){return 0;}marker();function target(){return 1;}const output=target();");
  const root = source.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
  const call = source.getVariableDeclarationOrThrow("output").getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression);
  const target = source.getFunctionOrThrow("target");
  beginReferencePass();
  try {
    const observations = observeCallReturns([root], source.getDescendants(), { suppliedCallableTargets: true });
    const program = observations.programs[0];
    if (program?.demandValueCall === undefined) {
      throw new Error("the native admission control is missing");
    }
    const before = program.escapingReferences;
    const revision = program.callableContext?.referenceRevision;
    expect(before.get(target.compilerNode)?.map((fact) => fact.node)).toEqual([call.getExpression()]);
    expect(program.byCall.has(call.compilerNode)).toBe(false);
    expect(program.demandValueCall(call).kind).toBe("resolved");
    expect(program.callableContext?.referenceRevision).toBe(revision);
    expect(program.escapingReferences.has(target.compilerNode)).toBe(false);
    expect(readObservedCallableConsumers(target, program).kind).toBe("resolved");
    expect(before.get(target.compilerNode)?.map((fact) => fact.node)).toEqual([call.getExpression()]);
  } finally {
    endReferencePass();
  }
});

test("lexical classification does not cover references admitted during its escape rebuild", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const source = project.createSourceFile(
    "/reentrant-reference.ts",
    "function marker(){return 0;}marker();function selected(){return 2;}const actions={run:()=>1};actions.run();declare function escape(value:object):void;escape(selected);",
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const root = calls[0];
  const escaped = calls[2]?.getArguments()[0];
  if (root === undefined || escaped === undefined) {
    throw new Error("the native reference re-entry fixture is incomplete");
  }
  const owner = source.getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
  const selected = source.getFunctionOrThrow("selected");
  beginReferencePass();
  try {
    const roots = calls.slice(0, 2);
    const observed = observeCallReturns(
      roots,
      roots.map((call) => call.getExpression()),
      { suppliedCallableTargets: true },
    );
    const program = observed.programs[0];
    if (program?.demandReferenceSource === undefined) {
      throw new Error("the public reference demand owner is missing");
    }
    const before = program.escapingReferences;
    const revision = program.callableContext?.referenceRevision;
    const reference = root.getExpression();
    const parent = reference.getParent.bind(reference);
    let requested = false;
    let result: ReferenceFact<true> | undefined;
    const priorLimit = Error.stackTraceLimit;
    Error.stackTraceLimit = 100;
    const admission = vi.spyOn(reference, "getParent").mockImplementation(() => {
      if (!requested && new Error("reference admission re-entry").stack?.includes("at admittedReference") === true) {
        requested = true;
        result = program.demandReferenceSource?.(escaped, selected.getNameNodeOrThrow());
      }
      return parent();
    });
    try {
      expect(readObservedCallableConsumers(owner, program).kind).toBe("resolved");
    } finally {
      admission.mockRestore();
      Error.stackTraceLimit = priorLimit;
    }
    expect(requested).toBe(true);
    expect(result?.kind).toBe("resolved");
    expect(program.callableContext?.referenceRevision).toBe((revision ?? 0) + 1);
    expect(program.escapingReferences.get(selected.compilerNode)?.map((fact) => fact.node)).toEqual([escaped]);
    expect(readObservedCallableConsumers(selected, program).kind).toBe("unresolved");
    expect(before.has(selected.compilerNode)).toBe(false);
  } finally {
    endReferencePass();
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

for (const dependency of ["guard only", "whole index", "negative membership"] as const) {
  test(`callable guard inspection preserves ${dependency} dependencies across unrelated captured growth`, () => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
    const source = project.createSourceFile(
      "/composed-dependencies.ts",
      "function selected(){return 1;}function invoke(deps){deps.data;deps.data;return deps.selected();}const deps={selected,data:{}};invoke(deps);const first={selected:()=>2};first.selected();function unrelated(){return 3;}const later=unrelated();",
    );
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const selected = calls.find((call) => call.getExpression().getText() === "deps.selected");
    const later = source.getVariableDeclarationOrThrow("later").getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression);
    const owner = source.getVariableDeclarationOrThrow("first").getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
    if (selected === undefined) {
      throw new Error("the supplied callable dependency is missing");
    }
    let program: CallReturnProgram | undefined;
    let computations = 0;
    let wholeReads = 0;
    const membership: boolean[] = [];
    const callee = selected.getExpression();
    const getSymbol = callee.getSymbol.bind(callee);
    const priorLimit = Error.stackTraceLimit;
    Error.stackTraceLimit = 100;
    const resolution = vi.spyOn(callee, "getSymbol").mockImplementation(() => {
      if (new Error("composed callable computation").stack?.includes("at refinedObservation") === true) {
        computations++;
        if (dependency === "whole index" && program !== undefined) {
          wholeReads += program.calls.length;
        }
      }
      return getSymbol();
    });
    const data = source.getFunctionOrThrow("invoke").getFirstDescendantByKindOrThrow(SyntaxKind.PropertyAccessExpression).getExpression();
    const ancestors = data.getAncestors.bind(data);
    const uses = vi.spyOn(data, "getAncestors").mockImplementation(() => {
      if (dependency === "negative membership" && new Error("inner proof dependency").stack?.includes("at computeCallableClosedUses") === true) {
        const admitted = program?.callableContext?.admitted;
        if (admitted !== undefined) {
          membership.push(admitted.has(later.compilerNode));
        }
      }
      return ancestors();
    });
    beginReferencePass();
    try {
      const observed = observeCallReturns(
        calls.filter((call) => call !== later),
        source.getDescendants(),
        { suppliedCallableTargets: true },
      );
      program = observed.programs[0];
      if (program?.demandValueCall === undefined) {
        throw new Error("the captured value demand owner is missing");
      }
      expect(readObservedCallableConsumers(owner, program).kind).toBe("resolved");
      const before = program.byCall.get(selected.compilerNode)?.targets;
      expect(before?.kind === "resolved" && before.value[0] === source.getFunctionOrThrow("selected")).toBe(true);
      expect(computations).toBeGreaterThan(0);
      expect(program.byCall.has(later.compilerNode)).toBe(false);
      expect(membership.includes(false)).toBe(dependency === "negative membership");
      computations = 0;
      expect(program.demandValueCall(later).kind).toBe("resolved");
      expect(program.byCall.has(later.compilerNode)).toBe(true);
      expect(capturedFactText(program.byCall.get(selected.compilerNode)?.targets, (nodes) => nodes.map(capturedNodeText))).toBe(
        capturedFactText(before, (nodes) => nodes.map(capturedNodeText)),
      );
      expect(computations > 0).toBe(dependency !== "guard only");
      expect(wholeReads > 0).toBe(dependency === "whole index");
      expect(membership.includes(true)).toBe(dependency === "negative membership");
    } finally {
      endReferencePass();
      resolution.mockRestore();
      uses.mockRestore();
      Error.stackTraceLimit = priorLimit;
    }
  });
}

for (const native of [false, true]) {
  for (const mode of ["tracked", "opaque index read", "missing validation"] as const) {
    test(`unrelated callable demand preserves ${native ? "native-query" : "no-native-query"} ${mode} semantics`, () => {
      const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
      const source = project.createSourceFile(
        "/dependency.ts",
        `${native ? "function orphan(callback:()=>number){return callback();}" : "declare const opaque:()=>number;opaque();"}const first={run:()=>1};const second={step:()=>2};first.run();second.step();`,
      );
      const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
      const opaque = calls.find((call) => call.getExpression().getText() === (native ? "callback" : "opaque"));
      const secondCall = calls.find((call) => call.getExpression().getText() === "second.step");
      const owners = source.getDescendantsOfKind(SyntaxKind.ArrowFunction);
      const firstOwner = owners[0];
      const secondOwner = owners[1];
      if (opaque === undefined || secondCall === undefined || firstOwner === undefined || secondOwner === undefined) {
        throw new Error("the native dependency demand fixture is incomplete");
      }
      const service = project.getLanguageService().compilerObject;
      const create = service.createReadonlyReferencePass.bind(service);
      let validations = 0;
      const acquisition = vi.spyOn(service, "createReadonlyReferencePass").mockImplementation(() => {
        const pass = create();
        if (mode === "missing validation") {
          Object.defineProperty(pass, "validate", { value: undefined });
        } else {
          const validate = pass.validate.bind(pass);
          vi.spyOn(pass, "validate").mockImplementation((file) => {
            validations++;
            validate(file);
          });
        }
        return pass;
      });
      let program: CallReturnProgram | undefined;
      const callee = opaque.getExpression();
      const original = callee.getSymbol.bind(callee);
      let refinements = 0;
      let wholeReads = 0;
      const resolving = vi.spyOn(callee, "getSymbol").mockImplementation(() => {
        if (new Error("native refinement computation observer").stack?.includes("at refinedObservation") === true) {
          refinements++;
          if (mode === "opaque index read" && program !== undefined) {
            wholeReads += program.byCall.size;
          }
        }
        return original();
      });
      beginReferencePass();
      try {
        const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
        program = observed.programs[0];
        if (program === undefined) {
          throw new Error("the captured program is missing");
        }
        expect(readObservedCallableConsumers(firstOwner, program).kind).toBe("resolved");
        const before = program.byCall;
        const refusal = before.get(opaque.compilerNode)?.targets;
        const priorSecond = before.get(secondCall.compilerNode)?.targets;
        expect(refusal?.kind).toBe("unresolved");
        refinements = 0;
        validations = 0;
        expect(readObservedCallableConsumers(secondOwner, program).kind).toBe("resolved");
        const target = program.byCall.get(secondCall.compilerNode)?.targets;
        expect(target?.kind === "resolved" && target.value.length === 1 && target.value[0] === secondOwner).toBe(true);
        expect(capturedFactText(program.byCall.get(opaque.compilerNode)?.targets, (nodes) => nodes.map(capturedNodeText))).toBe(
          capturedFactText(refusal, (nodes) => nodes.map(capturedNodeText)),
        );
        expect(before.get(secondCall.compilerNode)?.targets === priorSecond).toBe(true);
        expect(refinements === 0).toBe(mode === "tracked" || (!native && mode === "missing validation"));
        expect(validations > 0).toBe(native && mode === "tracked");
        expect(wholeReads > 0).toBe(mode === "opaque index read");
      } finally {
        endReferencePass();
        resolving.mockRestore();
        acquisition.mockRestore();
      }
    });
  }
}

function capturedNodeText(node: Node): string {
  return JSON.stringify([node.getSourceFile().getFilePath(), node.getKind(), node.getStart(), node.getEnd()]);
}

function capturedFactText<T>(fact: ReferenceFact<T> | undefined, value: (item: T) => string | readonly string[]): string {
  if (fact === undefined) {
    return "absent";
  }
  const trace = { origin: capturedNodeText(fact.trace.origin), declarations: fact.trace.declarations.map(capturedNodeText) };
  return JSON.stringify(
    fact.kind === "resolved"
      ? { kind: fact.kind, value: value(fact.value), trace }
      : { kind: fact.kind, reason: fact.reason, detail: fact.detail, node: capturedNodeText(fact.node), trace },
  );
}

function capturedAlternativeText(value: CallReturnAlternative): string {
  const nodes = (values: readonly Node[]): readonly string[] => values.map(capturedNodeText);
  return JSON.stringify({
    target: capturedNodeText(value.target),
    returns: capturedFactText(value.returns, nodes),
    explicit: capturedFactText(value.explicitReturns, nodes),
    native: capturedFactText(value.nativeReturns, nodes),
  });
}

function capturedObservationText(value: CallReturnObservation): string {
  const nodes = (values: readonly Node[]): readonly string[] => values.map(capturedNodeText);
  return JSON.stringify({
    call: capturedNodeText(value.call),
    target: capturedFactText(value.target, capturedNodeText),
    targets: capturedFactText(value.targets, nodes),
    invocation: capturedFactText(value.invocationTargets, nodes),
    returns: capturedFactText(value.returns, nodes),
    alternatives: capturedFactText(value.alternatives, (values) => values.map(capturedAlternativeText)),
  });
}

for (const initiallyPresent of [false, true]) {
  test(`refinement invalidates ${initiallyPresent ? "positive" : "negative"} caller reads after body discovery`, () => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
    const source = project.createSourceFile(
      "/caller-dependencies.ts",
      `
      function invoke(callback:()=>number){return callback();}
      function activate(factory:()=>number){return factory();}
      ${initiallyPresent ? "invoke(()=>1);" : ""}
      activate(()=>invoke(()=>2));
    `,
    );
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const callback = calls.find((call) => call.getExpression().getText() === "callback");
    const activate = calls.find((call) => call.getExpression().getText() === "activate");
    const invoke = source.getFunctionOrThrow("invoke");
    const initial = calls.find((call) => call.getExpression().getText() === "invoke" && call.getArguments()[0]?.getText() === "()=>1");
    const outer = activate?.getArguments()[0]?.asKindOrThrow(SyntaxKind.ArrowFunction);
    if (callback === undefined || activate === undefined || outer === undefined) {
      throw new Error("the caller discovery fixture is incomplete");
    }
    const roots = [callback, activate, ...(initial === undefined ? [] : [initial])];
    beginReferencePass();
    try {
      const observed = observeCallReturns(
        roots,
        roots.map((call) => call.getExpression()),
        { suppliedCallableTargets: true },
      );
      const program = observed.programs[0];
      if (program === undefined) {
        throw new Error("the native caller capture is missing");
      }
      const before = program.byCall;
      expect(program.callers.has(invoke.compilerNode)).toBe(initiallyPresent);
      expect(before.get(callback.compilerNode)?.targets.kind).toBe("unresolved");
      expect(readObservedCallableConsumers(outer, program).kind).toBe("resolved");
      const target = program.byCall.get(callback.compilerNode)?.targets;
      expect(target?.kind).toBe("resolved");
      expect(target?.kind === "resolved" ? target.value.map((node) => node.getText()) : []).toEqual(initiallyPresent ? ["()=>1", "()=>2"] : ["()=>2"]);
      expect(program.callers.get(invoke.compilerNode)?.length).toBe(initiallyPresent ? 2 : 1);
      expect(before.get(callback.compilerNode)?.targets.kind).toBe("unresolved");
    } finally {
      endReferencePass();
    }
  });
}

for (const alias of [false, true]) {
  test(`refinement ${alias ? "retains native alias refusal" : "invalidates an absent escape"} after body references appear`, () => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
    const source = project.createSourceFile(
      "/escape-dependencies.ts",
      `
      declare function escape(value:object):void;
      function invoke(callback:()=>number){return callback();}
      function activate(factory:()=>number){return factory();}
      invoke(()=>1);
      activate(()=>{${alias ? "const alias=invoke;escape(alias);" : "escape(invoke);"}return 0;});
    `,
    );
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const initial = calls.find((call) => call.getExpression().getText() === "invoke");
    const activate = calls.find((call) => call.getExpression().getText() === "activate");
    const callback = calls.find((call) => call.getExpression().getText() === "callback");
    const outer = activate?.getArguments()[0]?.asKindOrThrow(SyntaxKind.ArrowFunction);
    const invoke = source.getFunctionOrThrow("invoke");
    if (initial === undefined || activate === undefined || callback === undefined || outer === undefined) {
      throw new Error("the native escape discovery fixture is incomplete");
    }
    beginReferencePass();
    try {
      const roots = [initial, activate];
      const observed = observeCallReturns(
        roots,
        roots.map((call) => call.getExpression()),
        { suppliedCallableTargets: true },
      );
      const program = observed.programs[0];
      if (program === undefined) {
        throw new Error("the native escape capture is missing");
      }
      const before = program.escapingReferences;
      expect(before.has(invoke.compilerNode)).toBe(false);
      expect(readObservedCallableConsumers(outer, program).kind).toBe("resolved");
      const escaped = program.escapingReferences.get(invoke.compilerNode)?.[0];
      const target = program.byCall.get(callback.compilerNode)?.targets;
      const escapeCall = calls.find((call) => call.getExpression().getText() === "escape");
      const evidence = alias
        ? {
            kind: target?.kind,
            consumer: readObservedCallableConsumers(invoke, program).kind,
            captured: escapeCall !== undefined && program.byCall.has(escapeCall.compilerNode),
          }
        : {
            escaped: escaped !== undefined,
            sameRefusal: target?.kind === "unresolved" && target.node === escaped?.node && target.reason === escaped.reason && target.detail === escaped.detail,
          };
      expect(evidence).toEqual(alias ? { kind: "unresolved", consumer: "unresolved", captured: true } : { escaped: true, sameRefusal: true });
      expect(before.has(invoke.compilerNode)).toBe(false);
    } finally {
      endReferencePass();
    }
  });
}

const REFINEMENT_PARITY_CASES = [
  { name: "ordered caller alternatives", code: "function run(fn:()=>number){return fn();}run(()=>1);run(()=>2);" },
  {
    name: "optional callee and absent return",
    code: "declare const choose:boolean;function run(fn:(()=>number)|undefined){return fn?.();}run(choose?()=>1:undefined);",
  },
  {
    name: "distinct allocations with an escape",
    code: "declare function escape(value:object):void;function make(ctx:{run:()=>number}){return()=>ctx.run();}const first={run:()=>1};const second={run:()=>2};make(first)();escape(first);make(second)();",
  },
  {
    name: "cycle beside independent owner",
    code: "function recur(ctx:{run:()=>number}){recur(ctx);return ctx.run();}const context={run:()=>1};recur(context);const independent={read:()=>2};independent.read();",
  },
  {
    name: "nested caller bodies",
    code: "function invoke(callback:()=>number){return callback();}function activate(factory:()=>number){return factory();}activate(()=>invoke(()=>2));",
  },
] as const;
for (const scenario of REFINEMENT_PARITY_CASES) {
  test(`dependency-directed refinement matches complete ordered facts for ${scenario.name}`, () => {
    const snapshots = [false, true].map((forceComplete) => {
      const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
      const source = project.createSourceFile("/refinement-parity.ts", scenario.code);
      const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
      let program: CallReturnProgram | undefined;
      let wholeReads = 0;
      const observers = calls.map((call) => {
        const original = call.getExpression.bind(call);
        return vi.spyOn(call, "getExpression").mockImplementation(() => {
          if (forceComplete && program !== undefined) {
            wholeReads += program.byCall.size;
          }
          return original();
        });
      });
      beginReferencePass();
      try {
        const observed = observeCallReturns(calls, source.getDescendants(), {
          suppliedCallableTargets: true,
          explicitAbsentReturns: true,
          nativeValueTransfers: true,
        });
        const captured = observed.programs[0];
        if (captured === undefined) {
          throw new Error("the native parity capture is missing");
        }
        program = captured;
        const outcomes = source
          .getDescendantsOfKind(SyntaxKind.ArrowFunction)
          .map((owner) => capturedFactText(readObservedCallableConsumers(owner, captured), (rows) => rows.map(capturedObservationText)));
        expect(wholeReads > 0).toBe(forceComplete);
        return {
          outcomes,
          calls: program.calls.map(capturedObservationText),
          callers: [...program.callers].map(([owner, rows]) => [owner.pos, rows.map(capturedObservationText)]),
          escapes: [...program.escapingReferences].map(([owner, rows]) => [owner.pos, rows.map((fact) => capturedFactText(fact, () => []))]),
        };
      } finally {
        endReferencePass();
        for (const observer of observers) {
          observer.mockRestore();
        }
      }
    });
    expect(snapshots[0]).toEqual(snapshots[1]);
  });
}

for (const change of ["cancellation", "disposed handle", "source", "options", "forgotten source", "new invocation"] as const) {
  test(`scheduled native reuse retains ${change} admission`, () => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
    const source = project.createSourceFile(
      "/native-dependency.ts",
      "function orphan(callback:()=>number){return callback();}const first={run:()=>1};const second={step:()=>2};first.run();second.step();",
    );
    const extra = project.createSourceFile("/extra.ts", "export const sentinel=1;");
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const callback = calls.find((call) => call.getExpression().getText() === "callback");
    const owners = source.getDescendantsOfKind(SyntaxKind.ArrowFunction);
    const first = owners[0];
    const second = owners[1];
    if (callback === undefined || first === undefined || second === undefined) {
      throw new Error("the guarded dependency fixture is missing");
    }
    const service = project.getLanguageService().compilerObject;
    const create = service.createReadonlyReferencePass.bind(service);
    let pass: ts.ReadonlyReferencePass | undefined;
    const acquisition = vi.spyOn(service, "createReadonlyReferencePass").mockImplementation(() => {
      pass = create();
      return pass;
    });
    const callee = callback.getExpression();
    const getSymbol = callee.getSymbol.bind(callee);
    let refinements = 0;
    const resolving = vi.spyOn(callee, "getSymbol").mockImplementation(() => {
      if (new Error("guarded refinement observer").stack?.includes("at refinedObservation") === true) {
        refinements++;
      }
      return getSymbol();
    });
    beginReferencePass();
    try {
      const observed = observeCallReturns(calls, [...source.getDescendants(), ...extra.getDescendants()], { suppliedCallableTargets: true });
      const program = observed.programs[0];
      if (program === undefined) {
        throw new Error("the native guard capture is missing");
      }
      expect(readObservedCallableConsumers(first, program).kind).toBe("resolved");
      refinements = 0;
      if (pass === undefined) {
        throw new Error("the dependency did not use a native pass");
      }
      const before = program.byCall;
      const nativePass = pass;
      let cancellationRequested = false;
      const originalValidate = pass.validate.bind(pass);
      const validation = vi.spyOn(pass, "validate").mockImplementation((file) => {
        if (cancellationRequested) {
          throw new ts.OperationCanceledException();
        }
        originalValidate(file);
      });
      const mutations = {
        cancellation: (): void => {
          cancellationRequested = true;
        },
        "disposed handle": (): void => nativePass.dispose(),
        "new invocation": (): void => {
          endReferencePass();
          beginReferencePass();
        },
        source: (): void => {
          extra.addStatements("export const changed=2;");
        },
        options: (): void => {
          project.compilerOptions.set({ strict: true });
        },
        "forgotten source": (): void => extra.forget(),
      };
      mutations[change]();
      let kind: string | undefined;
      let reason: string | undefined;
      let cancelled = false;
      let disposed = false;
      try {
        const result = readObservedCallableConsumers(second, program);
        kind = result.kind;
        reason = result.kind === "unresolved" ? result.reason : undefined;
      } catch (error) {
        cancelled = error instanceof ts.OperationCanceledException;
        disposed = error instanceof Error && error.message.includes("disposed");
        if (!(cancelled || disposed)) {
          throw error;
        }
      } finally {
        validation.mockRestore();
      }
      const unsupported = { kind: "unresolved", reason: "unsupported", cancelled: false, disposed: false };
      const expected = {
        cancellation: { kind: undefined, reason: undefined, cancelled: true, disposed: false },
        "disposed handle": { kind: undefined, reason: undefined, cancelled: false, disposed: true },
        "new invocation": { kind: "resolved", reason: undefined, cancelled: false, disposed: false },
        source: unsupported,
        options: unsupported,
        "forgotten source": unsupported,
      };
      expect({ kind, reason, cancelled, disposed }).toEqual(expected[change]);
      expect(refinements > 0).toBe(change === "new invocation");
      expect(change === "new invocation" ? project.getProgram().compilerObject === program.program : program.byCall === before).toBe(true);
    } finally {
      endReferencePass();
      resolving.mockRestore();
      acquisition.mockRestore();
    }
  });
}

test("captured dependency indexes retain native Map and Set iteration contracts", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const source = project.createSourceFile("/iteration.ts", "function target(){return 1;}target();target();");
  const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants(), { suppliedCallableTargets: true });
  const program = observed.programs[0];
  if (program === undefined) {
    throw new Error("the iteration fixture is missing");
  }
  const map = program.byCall;
  const keys = [...map.keys()];
  const values = [...map.values()];
  const entries = [...map.entries()];
  expect(map instanceof Map).toBe(true);
  expect(map.size).toBe(keys.length);
  expect([...map].every(([key, value], index) => key === keys[index] && value === values[index] && entries[index]?.[0] === key)).toBe(true);
  const ordered: ts.CallExpression[] = [];
  const receiver = { keys: ordered };
  map.forEach(function (this: typeof receiver, value, key, owner) {
    expect(owner === map && value === map.get(key)).toBe(true);
    this.keys.push(key);
  }, receiver);
  expect(receiver.keys.every((key, index) => key === keys[index])).toBe(true);
  const admitted = program.callableContext?.admitted;
  if (admitted === undefined) {
    throw new Error("the actual admission set is missing");
  }
  const members: ts.CallExpression[] = [];
  const seen = { keys: members };
  admitted.forEach(function (this: typeof seen, value, key, owner) {
    expect(owner === admitted && value === key).toBe(true);
    this.keys.push(key);
  }, seen);
  expect(admitted instanceof Set).toBe(true);
  expect(admitted.size).toBe(seen.keys.length);
  expect([...admitted.entries()].every(([key, value], index) => key === value && value === seen.keys[index])).toBe(true);
});

for (const complete of [false, true]) {
  test(`refinement retains changed return facts with unchanged target in ${complete ? "complete" : "scheduled"} mode`, () => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
    const source = project.createSourceFile(
      "/return-facts.ts",
      "const callback=()=>1;callback?.();const first={run:()=>2};const second={step:()=>3};first.run();second.step();",
    );
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const call = calls.find((candidate) => candidate.getExpression().getText() === "callback");
    const first = source.getVariableDeclarationOrThrow("first").getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
    const second = source.getVariableDeclarationOrThrow("second").getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
    const callback = source.getVariableDeclarationOrThrow("callback").getInitializerOrThrow();
    if (call === undefined) {
      throw new Error("the optional native call is missing");
    }
    const projection: { -readonly [Key in keyof CallReturnCaptureOptions]: CallReturnCaptureOptions[Key] } = { suppliedCallableTargets: true };
    let current: CallReturnProgram | undefined;
    let reads = 0;
    const expression = call.getExpression.bind(call);
    const opaque = vi.spyOn(call, "getExpression").mockImplementation(() => {
      if (complete && current !== undefined) {
        reads += current.byCall.size;
      }
      return expression();
    });
    beginReferencePass();
    try {
      const observed = observeCallReturns(calls, source.getDescendants(), projection);
      const program = observed.programs[0];
      if (program === undefined) {
        throw new Error("the native return fact capture is missing");
      }
      current = program;
      expect(readObservedCallableConsumers(first, program).kind).toBe("resolved");
      const before = program.byCall.get(call.compilerNode);
      expect(before?.targets.kind === "resolved" && before.targets.value[0] === callback).toBe(true);
      expect(before?.alternatives.kind === "resolved" && before.alternatives.value[0]?.explicitReturns === undefined).toBe(true);
      projection.explicitAbsentReturns = true;
      expect(readObservedCallableConsumers(second, program).kind).toBe("resolved");
      const after = program.byCall.get(call.compilerNode);
      expect(after?.targets.kind === "resolved" && after.targets.value[0] === callback).toBe(true);
      expect(after?.alternatives.kind === "resolved" && after.alternatives.value[0]?.explicitReturns?.kind === "resolved").toBe(true);
      expect(before?.alternatives.kind === "resolved" && before.alternatives.value[0]?.explicitReturns === undefined).toBe(true);
      expect(reads > 0).toBe(complete);
    } finally {
      endReferencePass();
      opaque.mockRestore();
    }
  });
}
