import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Node } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import { vi } from "vitest";
import { observeCallReturns, readCallReturnProgram, readObservedCallableConsumers } from "../../../../tooling/src/floor/code-facts/call-returns.ts";
import { CapturedSourceMap } from "../../../../tooling/src/floor/code-facts/capture-map.ts";
import { beginReferencePass, endReferencePass } from "../../../../tooling/src/floor/code-facts/reference-fact.ts";
import type { CallReturnObservation, CallReturnProgram, ReferenceFact } from "../../../../tooling/src/floor/code-facts/reference-fact-contract.ts";
import { nativeReferenceNodes } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";

function nodeKey(node: Node): string {
  return JSON.stringify([node.getSourceFile().getFilePath(), node.getKind(), node.getStart(), node.getEnd()]);
}

function factKey<T>(fact: ReferenceFact<T>, value: (item: T) => string | readonly string[]): string {
  const trace = { origin: nodeKey(fact.trace.origin), declarations: fact.trace.declarations.map(nodeKey) };
  return JSON.stringify(
    fact.kind === "resolved"
      ? { kind: fact.kind, value: value(fact.value), trace }
      : { kind: fact.kind, reason: fact.reason, detail: fact.detail, node: nodeKey(fact.node), trace },
  );
}

function observationKey(observation: CallReturnObservation): string {
  const nodes = (values: readonly Node[]): readonly string[] => values.map(nodeKey);
  return JSON.stringify({
    call: nodeKey(observation.call),
    target: factKey(observation.target, nodeKey),
    targets: factKey(observation.targets, nodes),
    invocation: observation.invocationTargets === undefined ? undefined : factKey(observation.invocationTargets, nodes),
    returns: factKey(observation.returns, nodes),
    alternatives: factKey(observation.alternatives, (values) =>
      values.map((alternative) =>
        JSON.stringify({
          target: nodeKey(alternative.target),
          returns: factKey(alternative.returns, nodes),
          explicit: alternative.explicitReturns === undefined ? undefined : factKey(alternative.explicitReturns, nodes),
          native: alternative.nativeReturns === undefined ? undefined : factKey(alternative.nativeReturns, nodes),
        }),
      ),
    ),
  });
}

function captureKey(program: CallReturnProgram): string {
  return JSON.stringify({
    calls: program.calls.map(observationKey),
    callers: [...program.callers].map(([owner, rows]) => [owner.pos, rows.map(observationKey)]),
    escapes: [...program.escapingReferences].map(([owner, rows]) => [owner.pos, rows.map((fact) => factKey(fact, () => []))]),
  });
}

for (const dependency of ["unrelated", "missing admission", "guard reentrant admission", "whole sources", "whole sources size", "borrowed view"] as const) {
  test(`source admission preserves exact ${dependency} refinement dependencies`, () => {
    const snapshots = [false, true].map((complete) => {
      const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
      const source = project.createSourceFile(
        "/source.ts",
        "export function seed(){return 3;}function orphan(callback:()=>number){return callback();}const first={run:()=>1};const second={step:()=>2};first.run();second.step();declare function escape(value:object):void;function expose(){escape(seed);return 0;}const later=expose();",
      );
      const extra = project.createSourceFile("/extra.ts", 'import {seed} from "./source";export const alias=seed;');
      const later = source.getVariableDeclarationOrThrow("later").getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression);
      const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression).filter((call) => call !== later && call.getExpression().getText() !== "escape");
      const callback = calls.find((call) => call.getExpression().getText() === "callback");
      const first = source.getVariableDeclarationOrThrow("first").getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
      const second = source.getVariableDeclarationOrThrow("second").getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
      if (callback === undefined) {
        throw new Error("the native source-admission candidate is missing");
      }
      let program: CallReturnProgram | undefined;
      let borrowed: CallReturnProgram | undefined;
      let computations = 0;
      const admissions: string[] = [];
      const borrowedAdmissions: string[] = [];
      let wholeReads = 0;
      let checking = false;
      const wasForgotten = source.wasForgotten.bind(source);
      const freshness = vi.spyOn(source, "wasForgotten").mockImplementation(() => {
        if (
          dependency === "guard reentrant admission" &&
          checking &&
          program !== undefined &&
          new Error("reentrant source guard observation").stack?.includes("at readCallReturnProgram") === true
        ) {
          checking = false;
          try {
            admissions.push(readCallReturnProgram(extra, { programs: [program] }).kind);
          } finally {
            checking = true;
          }
        }
        return wasForgotten();
      });
      const callee = callback.getExpression();
      const original = callee.getSymbol.bind(callee);
      const inspectSources = (captured: CallReturnProgram): void => {
        checking = true;
        try {
          readCallReturnProgram(source, { programs: [captured] });
        } finally {
          checking = false;
        }
        switch (dependency) {
          case "missing admission":
            admissions.push(readCallReturnProgram(extra, { programs: [captured] }).kind);
            break;
          case "whole sources":
            wholeReads += [...captured.sources].length;
            break;
          case "whole sources size":
            wholeReads += captured.sources.size;
            break;
          case "borrowed view":
            if (borrowed !== undefined) {
              borrowedAdmissions.push(readCallReturnProgram(source, { programs: [borrowed] }).kind);
            }
            break;
          case "unrelated":
          case "guard reentrant admission":
            break;
        }
        if (complete) {
          wholeReads += captured.byCall.size;
        }
      };
      const resolving = vi.spyOn(callee, "getSymbol").mockImplementation(() => {
        if (new Error("source admission computation observer").stack?.includes("at refinedObservation") === true) {
          computations++;
          if (program !== undefined) {
            inspectSources(program);
          }
        }
        return original();
      });
      beginReferencePass();
      try {
        const observed = observeCallReturns(
          calls,
          calls.map((call) => call.getExpression()),
          { suppliedCallableTargets: true },
        );
        program = observed.programs[0];
        if (program?.demandReferenceSource === undefined) {
          throw new Error("the actual source capture owner is missing");
        }
        borrowed = { ...program, sources: new Map(program.sources) };
        expect(program.sources.has(extra)).toBe(false);
        expect(readObservedCallableConsumers(first, program).kind).toBe("resolved");
        expect(computations).toBeGreaterThan(0);
        expect(program.byCall.get(callback.compilerNode)?.targets.kind).toBe("unresolved");
        const dependsOnAdmission = dependency === "missing admission" || dependency === "guard reentrant admission";
        expect(admissions.includes("unresolved")).toBe(dependsOnAdmission);
        const before = captureKey(program);
        computations = 0;
        const seed = source.getFunctionOrThrow("seed").getNameNodeOrThrow();
        const reached = nativeReferenceNodes(seed).find((node) => node.getSourceFile() === extra);
        if (reached === undefined) {
          throw new Error("native references did not reach the source-admission control");
        }
        const admitted = program.demandReferenceSource(reached, seed);
        expect(admitted.kind, admitted.kind === "unresolved" ? admitted.detail : "resolved").toBe("resolved");
        expect(program.sources.has(extra)).toBe(true);
        expect(readObservedCallableConsumers(second, program).kind).toBe("resolved");
        expect(computations > 0).toBe(complete || dependency !== "unrelated");
        expect(admissions.includes("resolved")).toBe(dependsOnAdmission);
        expect(wholeReads > 0).toBe(complete || dependency === "whole sources" || dependency === "whole sources size");
        expect(borrowedAdmissions.includes("resolved")).toBe(dependency === "borrowed view");
        const after = captureKey(program);
        expect(program.escapingReferences.has(seed.getParentOrThrow().compilerNode)).toBe(false);
        expect(program.demandValueCall?.(later).kind).toBe("resolved");
        expect(program.escapingReferences.get(seed.getParentOrThrow().compilerNode)?.[0]?.kind).toBe("unresolved");
        return { before, after, escaped: captureKey(program) };
      } finally {
        endReferencePass();
        resolving.mockRestore();
        freshness.mockRestore();
      }
    });
    expect(snapshots[0]).toEqual(snapshots[1]);
  });
}

test("capture-owned currentness reuses its validated population without replaying source-wrapper checks", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const source = project.createSourceFile("/source.ts", "function first(){return 1;}first();");
  const extra = project.createSourceFile("/extra.ts", "function second(){return 2;}second();");
  beginReferencePass();
  try {
    const observed = observeCallReturns([source, extra].flatMap((file) => file.getDescendantsOfKind(SyntaxKind.CallExpression)));
    const program = observed.programs[0];
    if (program === undefined) {
      throw new Error("the population currentness capture is missing");
    }
    const subject = source.getFunctionOrThrow("first").getNameNodeOrThrow();
    const checked = vi.spyOn(extra, "wasForgotten");
    try {
      const first = readCallReturnProgram(subject, observed);
      const before = checked.mock.calls.length;
      const second = readCallReturnProgram(subject, observed);
      const after = checked.mock.calls.length;
      expect(first.kind === "resolved" ? first.value : undefined).toBe(program);
      expect(second.kind === "resolved" ? second.value : undefined).toBe(program);
      expect(program.sources.has(extra)).toBe(true);
      expect(program.byCall.size).toBe(2);
      extra.forget();
      expect(readCallReturnProgram(subject, observed).kind).toBe("unresolved");
      expect(after).toBe(before);
    } finally {
      checked.mockRestore();
    }
  } finally {
    endReferencePass();
  }
});

for (const mutation of [
  "value",
  "same-size membership",
  "delete",
  "clear",
  "reentrant membership",
  "reentrant native check",
  "unavailable SDK authority",
] as const) {
  test(`capture-owned currentness fences actual ${mutation} source-map mutation`, () => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
    const source = project.createSourceFile("/source.ts", "function first(){return 1;}first();");
    const extra = project.createSourceFile("/extra.ts", "function second(){return 2;}second();");
    const foreign = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } }).createSourceFile(
      "/extra.ts",
      "function second(){return 2;}second();",
    );
    beginReferencePass();
    try {
      const observed = observeCallReturns([source, extra].flatMap((file) => file.getDescendantsOfKind(SyntaxKind.CallExpression)));
      const program = observed.programs[0];
      if (program === undefined || !CapturedSourceMap.owns(program.sources)) {
        throw new Error("the owned source capture is missing");
      }
      const sources = program.sources;
      const subject = source.getFunctionOrThrow("first").getNameNodeOrThrow();
      expect(readCallReturnProgram(subject, observed).kind).toBe("resolved");
      const native = project.getSourceFileCompilerNode.bind(project);
      const checked = vi.spyOn(project, "getSourceFileCompilerNode");
      const tokenRead = vi.spyOn(project, "getSourceFileCacheToken");
      const has = sources.has.bind(sources);
      const membership = vi.spyOn(sources, "has");
      try {
        sources.set(extra, extra.compilerNode);
        expect(readCallReturnProgram(subject, observed).kind).toBe("resolved");
        expect(checked).not.toHaveBeenCalled();
        switch (mutation) {
          case "value":
            sources.set(extra, source.compilerNode);
            break;
          case "same-size membership":
            sources.delete(extra);
            sources.set(foreign, foreign.compilerNode);
            break;
          case "delete":
            sources.delete(source);
            break;
          case "clear":
            sources.clear();
            break;
          case "reentrant membership":
            membership.mockImplementationOnce((file) => {
              const result = has(file);
              sources.delete(extra);
              sources.set(extra, extra.compilerNode);
              return result;
            });
            break;
          case "reentrant native check":
            sources.delete(extra);
            sources.set(extra, extra.compilerNode);
            checked.mockImplementationOnce((file, token) => {
              const result = native(file, token);
              sources.delete(extra);
              sources.set(extra, extra.compilerNode);
              return result;
            });
            break;
          case "unavailable SDK authority":
            tokenRead.mockReturnValueOnce(undefined);
            break;
        }
        expect(readCallReturnProgram(subject, observed).kind).toBe("unresolved");
        sources.clear();
        sources.set(source, source.compilerNode);
        sources.set(extra, extra.compilerNode);
        expect(readCallReturnProgram(subject, observed).kind).toBe("resolved");
        expect(checked).toHaveBeenCalled();
      } finally {
        membership.mockRestore();
        tokenRead.mockRestore();
        checked.mockRestore();
      }
    } finally {
      endReferencePass();
    }
  });
}

test("source admission reuse refuses an unrelated captured source forgotten during native validation", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const source = project.createSourceFile(
    "/validation.ts",
    "function orphan(callback:()=>number){return callback();}const first={run:()=>1};const second={step:()=>2};first.run();second.step();",
  );
  const extra = project.createSourceFile("/extra.ts", "export const sentinel=1;");
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const first = source.getVariableDeclarationOrThrow("first").getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
  const second = source.getVariableDeclarationOrThrow("second").getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
  const service = project.getLanguageService().compilerObject;
  const create = service.createReadonlyReferencePass.bind(service);
  let armed = false;
  let interrupted = false;
  const restoreValidations: (() => void)[] = [];
  const acquisition = vi.spyOn(service, "createReadonlyReferencePass").mockImplementation(() => {
    const pass = create();
    const validate = pass.validate.bind(pass);
    const validation = vi.spyOn(pass, "validate").mockImplementation((file) => {
      validate(file);
      if (armed) {
        armed = false;
        interrupted = true;
        extra.forget();
      }
    });
    restoreValidations.push(() => validation.mockRestore());
    return pass;
  });
  beginReferencePass();
  try {
    const observed = observeCallReturns(calls, [...source.getDescendants(), ...extra.getDescendants()], { suppliedCallableTargets: true });
    const program = observed.programs[0];
    if (program === undefined) {
      throw new Error("the native validation capture is missing");
    }
    expect(readObservedCallableConsumers(first, program).kind).toBe("resolved");
    expect(restoreValidations.length).toBeGreaterThan(0);
    armed = true;
    expect(() => readObservedCallableConsumers(second, program)).toThrow("Program change");
    expect(interrupted).toBe(true);
  } finally {
    endReferencePass();
    for (const restore of restoreValidations) {
      restore();
    }
    acquisition.mockRestore();
  }
});

test("captured freshness scans the actual backing map despite overridden semantic keys and get methods", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const source = project.createSourceFile("/source.ts", "function first(){return 1;}first();");
  const extra = project.createSourceFile("/extra.ts", "function second(){return 2;}second();");
  const observed = observeCallReturns([source, extra].flatMap((file) => file.getDescendantsOfKind(SyntaxKind.CallExpression)));
  const program = observed.programs[0];
  if (program === undefined) {
    throw new Error("the physical source map capture is missing");
  }
  expect(program.sources.size).toBe(2);
  const empty = new Map(program.sources);
  empty.clear();
  const keys = vi.spyOn(program.sources, "keys").mockImplementation(() => empty.keys());
  const get = vi.spyOn(program.sources, "get").mockReturnValue(undefined);
  const checked = vi.spyOn(extra, "wasForgotten");
  try {
    expect(readCallReturnProgram(source, observed).kind).toBe("resolved");
    expect(checked).toHaveBeenCalled();
    expect(keys).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    extra.forget();
    expect(readCallReturnProgram(source, observed).kind).toBe("unresolved");
  } finally {
    checked.mockRestore();
    get.mockRestore();
    keys.mockRestore();
  }
});
