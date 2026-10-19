// Prototype exposure is independent of unrelated computed callable values.
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Node, Project, SyntaxKind, ts } from "ts-morph";
import { vi } from "vitest";
import { observeCallReturns } from "../../../../tooling/src/floor/code-facts/call-returns.ts";
import { readCallBindings } from "../../../../tooling/src/floor/code-facts/call-supplied.ts";
import {
  beginReferencePass,
  endReferencePass,
  inspectInheritedReadEffects,
  prototypeExposureStatistics,
  readPrototypeExposureCensus,
} from "../../../../tooling/src/floor/code-facts/reference-fact.ts";
import { readAuthoredCallableSources } from "../../../../tooling/src/floor/code-facts/value-carrier.ts";

for (const mutation of [false, true]) {
  test(`prototype census separates unrelated unknown dispatch from actual exposure: ${mutation}`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile(
      "/census.ts",
      `
      declare const key:string;
      const table={safe:()=>1};table[key]();
      ${mutation ? "Object.defineProperty(Object.prototype,'signal',{get(){this.settle=()=>2;}});" : ""}
      function consume(value:object|undefined){return value;}
      function selected(ctx:{settle:()=>number;signal?:object}){consume(ctx.signal);return ctx.settle();}
      const context={settle:()=>1};selected(context);
    `,
    );
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const selected = calls.find((call) => call.getExpression().getText() === "ctx.settle");
    const expected = source.getVariableDeclarationOrThrow("context").getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
    if (selected === undefined) {
      throw new Error("the selected sibling consumer is missing");
    }
    beginReferencePass();
    try {
      const captured = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
      const first = readAuthoredCallableSources(selected.getExpression(), undefined, captured);
      expect(first.kind, first.kind === "unresolved" ? `${first.detail} at ${first.node.getText()}` : "resolved").toBe(mutation ? "unresolved" : "resolved");
      expect(first.kind === "resolved" ? first.value.map((leaf) => leaf.value) : []).toEqual(mutation ? [] : [expected]);
    } finally {
      endReferencePass();
    }
  });
}

test("one generation census retains lexical allocation identity and releases native statistics inputs", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    "/allocations.ts",
    'function make(input:object){return {settle:()=>1};}function later(value:number){}make({a:1});make({b:2});later(3);Object.defineProperty({},"value",{value:1});',
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const make = source.getFunctionOrThrow("make");
  const later = source.getFunctionOrThrow("later");
  const receivers = calls.filter((call) => call.getExpression().getText() === "make");
  const downstream = calls.find((call) => call.getExpression().getText() === "later");
  const literal = make.getFirstDescendantByKindOrThrow(SyntaxKind.ObjectLiteralExpression);
  const first = receivers[0];
  const second = receivers[1];
  if (first === undefined || second === undefined || downstream === undefined) {
    throw new Error("the actual allocation consumers are missing");
  }
  beginReferencePass();
  let final: ReturnType<typeof prototypeExposureStatistics>;
  try {
    const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
    const program = observed.programs[0];
    if (program === undefined) {
      throw new Error("the actual native allocation capture is missing");
    }
    const bindings = readCallBindings(first, make, new Map());
    const unrelated = readCallBindings(downstream, later, bindings);
    const alternate = readCallBindings(second, make, new Map());
    for (const actual of [bindings, unrelated, alternate]) {
      expect(inspectInheritedReadEffects(literal, { program, bindings: actual }).kind).toBe("resolved");
    }
    final = prototypeExposureStatistics();
    expect(final).toMatchObject({ invocations: 3, distinctReceiverAllocations: 2, censusRuns: 1 });
    expect(final?.inputsSwept).toBeGreaterThan(0);
    expect(final?.inputsSweptPerInvocation.reduce((count, entry) => count + entry.invocations, 0)).toBe(3);
    expect(final?.inputsSweptPerInvocation.some((entry) => entry.inputs === 0 && entry.invocations >= 2)).toBe(true);
  } finally {
    endReferencePass();
  }
  expect(prototypeExposureStatistics()).toEqual(final);
  beginReferencePass();
  try {
    expect(prototypeExposureStatistics()).toMatchObject({ invocations: 0, distinctReceiverAllocations: 0, censusRuns: 0, inputsSwept: 0 });
  } finally {
    endReferencePass();
  }
});

for (const boundary of ["source", "reference pass", "native cancellation", "reentrant census"] as const) {
  test("prototype census cannot publish across native classification drift: " + boundary, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile("/transition.ts", 'const target={};Object.defineProperty(target,"value",{value:1});');
    const call = source.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
    const target = call.getArguments()[0]?.asKindOrThrow(SyntaxKind.Identifier);
    if (target === undefined) {
      throw new Error("the actual native descriptor target is missing");
    }
    beginReferencePass();
    try {
      const observed = observeCallReturns([call], source.getDescendants(), { suppliedCallableTargets: true });
      const program = observed.programs[0];
      if (program === undefined) {
        throw new Error("the actual transition capture is missing");
      }
      const nativeSymbol = target.getSymbol.bind(target);
      const cancellation = new ts.OperationCanceledException();
      let changed = false;
      let nested: ReturnType<typeof inspectInheritedReadEffects> | undefined;
      const hook = vi.spyOn(target, "getSymbol").mockImplementation(() => {
        if (!changed) {
          changed = true;
          if (boundary === "source") {
            project.createSourceFile("/exposure.ts", 'Object.defineProperty(Object.prototype,"value",{get(){return 2;}});');
          } else if (boundary === "reference pass") {
            endReferencePass();
          } else if (boundary === "native cancellation") {
            throw cancellation;
          } else {
            nested = inspectInheritedReadEffects(source, { program });
          }
        }
        return nativeSymbol();
      });
      try {
        let first: ReturnType<typeof inspectInheritedReadEffects> | undefined;
        let cancelled = false;
        try {
          first = inspectInheritedReadEffects(source, { program });
        } catch (error) {
          if (error !== cancellation) {
            throw error;
          }
          cancelled = true;
        }
        expect(cancelled).toBe(boundary === "native cancellation");
        const completedKind = boundary === "reentrant census" ? "resolved" : "unresolved";
        expect(first?.kind).toBe(boundary === "native cancellation" ? undefined : completedKind);
        expect(nested?.kind).toBe(boundary === "reentrant census" ? "unresolved" : undefined);
        expect(nested?.kind === "unresolved" ? nested.reason : undefined).toBe(boundary === "reentrant census" ? "cycle" : undefined);
        expect(changed).toBe(true);
      } finally {
        hook.mockRestore();
      }
      const retry = boundary === "native cancellation" ? inspectInheritedReadEffects(source, { program }) : undefined;
      expect(retry?.kind).toBe(boundary === "native cancellation" ? "resolved" : undefined);
    } finally {
      endReferencePass();
    }
  });
}

test("prototype census reports actual mutation sites once and refuses foreign or forgotten subjects", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile("/selected.ts", "const context={settle:()=>1};context.settle();");
  const effect = project.createSourceFile("/effect.ts", 'Object.defineProperty(Object.prototype,"signal",{get(){this.settle=()=>2;}});');
  const foreign = new Project({ useInMemoryFileSystem: true }).createSourceFile("/foreign.ts", "const foreign={};");
  beginReferencePass();
  try {
    const captured = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants(), { suppliedCallableTargets: true });
    const program = captured.programs[0];
    if (program === undefined) {
      throw new Error("the actual selected native capture is missing");
    }
    expect(program.sources.has(effect)).toBe(false);
    const census = readPrototypeExposureCensus(source, program.program);
    expect(census.kind === "resolved" ? census.value.map((site) => site.getText()) : census.detail).toEqual([
      effect.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression).getText(),
    ]);
    expect(readPrototypeExposureCensus(foreign, program.program).kind).toBe("unresolved");
    const literal = source.getVariableDeclarationOrThrow("context").getInitializerOrThrow();
    expect(Node.isObjectLiteralExpression(literal)).toBe(true);
    literal.forget();
    expect(readPrototypeExposureCensus(literal, program.program).kind).toBe("unresolved");
  } finally {
    endReferencePass();
  }
});

test("a fresh outer record does not qualify a computed prototype receiver", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    "/nested-write.ts",
    `
    const key="__proto__";const data={};data[key].signal=1;
    function consume(value:object|undefined){return value;}
    function selected(ctx:{settle:()=>number;signal?:object}){consume(ctx.signal);return ctx.settle();}
    const context={settle:()=>1};selected(context);
  `,
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const selected = calls.find((call) => call.getExpression().getText() === "ctx.settle");
  if (selected === undefined) {
    throw new Error("the selected derived receiver contrast is missing");
  }
  beginReferencePass();
  try {
    const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
    expect(readAuthoredCallableSources(selected.getExpression(), undefined, observed).kind).toBe("unresolved");
  } finally {
    endReferencePass();
  }
});

for (const fresh of [true, false]) {
  test(`prototype census distinguishes a fresh record write from an unknown receiver: ${fresh}`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile(
      "/write.ts",
      `
      declare const key:string;${fresh ? "const data={};" : "declare const data:object;"}data[key]=1;
      function consume(value:object|undefined){return value;}
      function selected(ctx:{settle:()=>number;signal?:object}){consume(ctx.signal);return ctx.settle();}
      const context={settle:()=>1};selected(context);
    `,
    );
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const selected = calls.find((call) => call.getExpression().getText() === "ctx.settle");
    if (selected === undefined) {
      throw new Error("the selected write contrast is missing");
    }
    beginReferencePass();
    try {
      const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
      const first = readAuthoredCallableSources(selected.getExpression(), undefined, observed);
      expect(first.kind, first.kind === "unresolved" ? `${first.detail} at ${first.node.getText()}` : "resolved").toBe(fresh ? "resolved" : "unresolved");
    } finally {
      endReferencePass();
    }
  });
}

// A fresh target is only safe from `__proto__` when no inherited setter can re-parent it: a primitive value, a number
// key, an own-key define, or a null-prototype target. Model-chosen keys reach such writes (tool-call argument salvage).
test.for([
  { name: "a string key with an object value", write: "const bag={};bag[key]=value;", sound: false },
  { name: "Reflect.set with a string key", write: "const bag={};Reflect.set(bag,key,value);", sound: false },
  { name: "a primitive value", write: "const bag={};bag[key]=1;", sound: true },
  { name: "a number key", write: "declare const index:number;const bag:object[]=[];bag[index]=value;", sound: true },
  { name: "a null-prototype target", write: "const bag={__proto__:null};bag[key]=value;", sound: true },
])("prototype census refuses a fresh target that a __proto__ key could re-parent: $name", ({ write, sound }) => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    "/fresh-reparent.ts",
    `
    function consume(value:object|undefined){return value;}
    function selected(ctx:{settle:()=>number;signal?:object}){consume(ctx.signal);return ctx.settle();}
    declare const key:string;declare const value:object;${write}
    const context={settle:()=>1};selected(context);
  `,
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const selected = calls.find((call) => call.getExpression().getText() === "ctx.settle");
  if (selected === undefined) {
    throw new Error("the selected re-parent contrast is missing");
  }
  beginReferencePass();
  try {
    const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
    const first = readAuthoredCallableSources(selected.getExpression(), undefined, observed);
    expect(first.kind, first.kind === "unresolved" ? `${first.detail} at ${first.node.getText()}` : "resolved").toBe(sound ? "resolved" : "unresolved");
  } finally {
    endReferencePass();
  }
});

for (const intrinsic of [false, true]) {
  test("prototype census distinguishes data fields from an actual global capability: " + intrinsic, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile(
      "/global-fields.ts",
      `
      ${intrinsic ? "const capability=globalThis.Object;" : "const data={Object:1,Reflect:2};const first=data.Object;const second=data.Reflect;"}
      function consume(value:object|undefined){return value;}
      function selected(ctx:{settle:()=>number;signal?:object}){consume(ctx.signal);return ctx.settle();}
      const context={settle:()=>1};selected(context);
    `,
    );
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const selected = calls.find((call) => call.getExpression().getText() === "ctx.settle");
    if (selected === undefined) {
      throw new Error("the actual global capability contrast is missing");
    }
    beginReferencePass();
    try {
      const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
      const first = readAuthoredCallableSources(selected.getExpression(), undefined, observed);
      expect(first.kind).toBe(intrinsic ? "unresolved" : "resolved");
    } finally {
      endReferencePass();
    }
  });
}
