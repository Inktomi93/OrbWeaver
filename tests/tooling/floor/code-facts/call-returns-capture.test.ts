// A settled call-return capture reuses its indexes and lexical classification only while every native input it
// read is unchanged; a changed input refuses or invalidates, never serves the stale map.

import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { ts } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import { vi } from "vitest";
import { observeCallReturns, readCallReturnProgram, readObservedCallableConsumers } from "../../../../tooling/src/floor/code-facts/call-returns.ts";
import { beginReferencePass, endReferencePass } from "../../../../tooling/src/floor/code-facts/reference-fact.ts";
import type { CallReturnProgram, ReferenceFact } from "../../../../tooling/src/floor/code-facts/reference-fact-contract.ts";
import { capturedFactText, capturedNodeText } from "./_call-returns-support.ts";

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
