// Dependency-directed refinement of call-return facts matches a complete ordered recapture and keeps every
// admission a changed source, option, handle or invocation must refuse.

import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project, SyntaxKind, ts } from "ts-morph";
import { vi } from "vitest";
import { observeCallReturns, readObservedCallableConsumers } from "../../../../tooling/src/floor/code-facts/call-returns.ts";
import { beginReferencePass, endReferencePass } from "../../../../tooling/src/floor/code-facts/reference-fact.ts";
import type { CallReturnCaptureOptions, CallReturnProgram } from "../../../../tooling/src/floor/code-facts/reference-fact-contract.ts";
import { capturedFactText, capturedObservationText } from "./_call-returns-support.ts";

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
