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
import type { ReferenceFact } from "../../../../tooling/src/floor/code-facts/reference-fact-contract.ts";
import { readReturnedValue } from "../../../../tooling/src/floor/code-facts/value-carrier.ts";
import { createSemanticWorkspace, nativeReferenceNodes } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { capturedFactText, capturedObservationText } from "./_call-returns-support.ts";

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
