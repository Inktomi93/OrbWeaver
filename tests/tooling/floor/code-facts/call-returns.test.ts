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
