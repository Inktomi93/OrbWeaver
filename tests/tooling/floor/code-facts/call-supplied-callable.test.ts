// @subject tooling/src/floor/code-facts/call-supplied.ts
// @subject tooling/src/floor/code-facts/call-returns.ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { CallExpression, SourceFile } from "ts-morph";
import { Node, Project, SyntaxKind, ts } from "ts-morph";
import { vi } from "vitest";
import {
  observeCallReturns,
  readCallTargets,
  readObservedCallableConsumers,
  readSuppliedParameter,
} from "../../../../tooling/src/floor/code-facts/call-returns.ts";
import { readCallReturnReference } from "../../../../tooling/src/floor/code-facts/call-supplied.ts";
import { beginReferencePass, endReferencePass } from "../../../../tooling/src/floor/code-facts/reference-fact.ts";
import type { CallReturnObservations } from "../../../../tooling/src/floor/code-facts/reference-fact-contract.ts";
import { readAuthoredCallableSources, readReturnedValue } from "../../../../tooling/src/floor/code-facts/value-carrier.ts";
import { nativeReferenceNodes } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";

function queriedTargets(call: CallExpression, observations: CallReturnObservations): ReturnType<typeof readCallTargets> {
  const program = observations.programs[0];
  return readCallTargets(call, program === undefined ? undefined : new Set(program.byCall.keys()), observations);
}

for (const scenario of [
  {
    name: "direct destructured namespace",
    binding: "const {createLifecycle}",
    callee: "createLifecycle",
    capture: true,
    references: true,
    escape: "",
    expected: true,
  },
  {
    name: "renamed destructured namespace",
    binding: "const {createLifecycle:build}",
    callee: "build",
    capture: true,
    references: true,
    escape: "",
    expected: true,
  },
  {
    name: "a const alias of the destructured namespace",
    binding: "const {createLifecycle}",
    callee: "alias",
    capture: true,
    references: true,
    escape: "const alias=createLifecycle;",
    expected: true,
  },
  {
    name: "an omitted actual caller",
    binding: "const {createLifecycle}",
    callee: "createLifecycle",
    capture: false,
    references: true,
    escape: "",
    expected: false,
  },
  {
    name: "omitted reference coverage",
    binding: "const {createLifecycle}",
    callee: "createLifecycle",
    capture: true,
    references: false,
    escape: "",
    expected: false,
  },
  {
    name: "an escaping destructured namespace alias",
    binding: "const {createLifecycle}",
    callee: "createLifecycle",
    capture: true,
    references: true,
    escape: "declare function escape(value:object):void;const alias=createLifecycle;escape(alias);",
    expected: false,
  },
  {
    name: "a mutable destructured namespace",
    binding: "let {createLifecycle}",
    callee: "createLifecycle",
    capture: true,
    references: true,
    escape: "",
    expected: false,
  },
] as const) {
  test(`dynamic namespace supplied consumers: ${scenario.name}`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const producer = project.createSourceFile(
      "/repo/lifecycle.ts",
      'export function createLifecycle(options={mode:"local"}){return options.mode;}function seed(){return 1;}seed();',
    );
    const source = project.createSourceFile(
      "/repo/entry.ts",
      `${scenario.binding}=await import("./lifecycle.ts");${scenario.escape}const lifecycle=${scenario.callee}();`,
    );
    const owner = producer.getFunctionOrThrow("createLifecycle");
    const parameter = owner.getParameters()[0];
    const actual = source.getVariableDeclarationOrThrow("lifecycle").getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression);
    if (parameter === undefined) {
      throw new Error("the actual lifecycle options formal is missing");
    }
    beginReferencePass();
    try {
      const calls = [...producer.getDescendantsOfKind(SyntaxKind.CallExpression), ...source.getDescendantsOfKind(SyntaxKind.CallExpression)].filter(
        (call) => scenario.capture || call !== actual,
      );
      const observed = observeCallReturns(calls, scenario.references ? [...producer.getDescendants(), ...source.getDescendants()] : undefined, {
        suppliedCallableTargets: true,
      });
      const program = observed.programs[0];
      if (program === undefined) {
        throw new Error("the actual native capture is missing");
      }
      expect(program.byCall.has(actual.compilerNode)).toBe(scenario.capture);
      expect(program.referencesObserved).toBe(scenario.references);
      const target = program.byCall.get(actual.compilerNode)?.target;
      expect(!scenario.expected || (target?.kind === "resolved" && target.value.compilerNode === owner.compilerNode)).toBe(true);
      expect(scenario.capture || (program.callers.get(owner.compilerNode) ?? []).length === 0).toBe(true);
      const consumers = readObservedCallableConsumers(owner, program);
      const supplied = readSuppliedParameter(parameter.getNameNode(), new Map(), program);
      expect(consumers.kind, consumers.kind === "unresolved" ? `${consumers.detail} at ${consumers.node.getText()}` : scenario.name).toBe(
        scenario.expected ? "resolved" : "unresolved",
      );
      expect(supplied.kind).toBe(scenario.expected ? "resolved" : "unresolved");
      expect(consumers.kind === "resolved" ? consumers.value.map((consumer) => consumer.call.compilerNode) : []).toEqual(
        scenario.expected ? [actual.compilerNode] : [],
      );
      expect(supplied.kind === "resolved" ? supplied.value.map((value) => value.value.compilerNode) : []).toEqual(
        scenario.expected ? [parameter.getInitializerOrThrow().compilerNode] : [],
      );
    } finally {
      endReferencePass();
    }
  });
}

test("captured actual supplied members retain the composition wrapper target", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    "/repo/producer.ts",
    `
    function settle(batch: number[]) { batch.push(1); }
    function createParticipants(ctx: {settle:(batch:number[])=>void}) {
      return (batch:number[]) => ctx.settle(batch);
    }
    function createService(ctx: {settle:(batch:number[])=>void}) { return createParticipants(ctx); }
    const context = {settle:(batch:number[]) => settle(batch)};
    const invoke = createService(context);
    invoke([]);
  `,
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const call = calls.find((candidate) => candidate.getExpression().getText() === "ctx.settle");
  if (call === undefined) {
    throw new Error("the actual injected invocation is missing");
  }
  const strict = observeCallReturns(calls, source.getDescendants());
  expect(strict.programs[0]?.byCall.get(call.compilerNode)?.targets.kind).toBe("unresolved");
  const observations = observeCallReturns(calls, source.getDescendants(), { ...{ suppliedCallableTargets: true as const } });
  const targets = queriedTargets(call, observations);
  expect(targets.kind).toBe("resolved");
  expect(targets.kind === "resolved" ? targets.value.map((target) => target.getText()) : []).toEqual(["(batch:number[]) => settle(batch)"]);
});

const CONTROLS = [
  { name: "opaque containing argument", before: "declare function escape(value:object):void;", extra: "escape(context);", formal: "", supply: "context" },
  { name: "formal member overwrite", before: "", extra: "", formal: "ctx.settle = () => {};", supply: "context" },
  { name: "actual member overwrite", before: "", extra: "context.settle = () => {};", formal: "", supply: "context" },
  { name: "alias member overwrite", before: "", extra: "const alias=context; alias.settle=()=>{};", formal: "", supply: "context" },
  {
    name: "opaque alternative",
    before: "declare const foreign: typeof context; declare const choose:boolean;",
    extra: "",
    formal: "",
    supply: "choose ? context : foreign",
  },
  { name: "missing member alternative", before: "declare const choose:boolean;", extra: "", formal: "", supply: "choose ? context : {}" },
  { name: "unsupplied formal", before: "", extra: "", formal: "", supply: "" },
] as const;
for (const scenario of CONTROLS) {
  test(`supplied callable refuses ${scenario.name}`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile(
      "/repo/producer.ts",
      `
      ${scenario.before}
      function create(ctx: {settle:()=>void}) { ${scenario.formal} return () => ctx.settle(); }
      const context={settle:()=>1}; ${scenario.extra}
      create(${scenario.supply});
    `,
    );
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const call = calls.find((candidate) => candidate.getExpression().getText() === "ctx.settle");
    if (call === undefined) {
      throw new Error("the actual injected invocation is missing");
    }
    const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
    expect(queriedTargets(call, observed).kind).toBe("unresolved");
  });
}

test("supplied callable retains every swapped actual body", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    "/repo/producer.ts",
    `
    declare const choose:boolean;
    function create(ctx: {settle:()=>number}) { return () => ctx.settle(); }
    const first={settle:()=>1}; const second={settle:()=>2};
    create(choose ? first : second);
  `,
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const call = calls.find((candidate) => candidate.getExpression().getText() === "ctx.settle");
  if (call === undefined) {
    throw new Error("the actual injected invocation is missing");
  }
  const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
  const targets = queriedTargets(call, observed);
  expect(targets.kind === "resolved" ? targets.value.map((target) => target.getText()).sort() : []).toEqual(["()=>1", "()=>2"]);
});

for (const optional of [
  { name: "receiver", absent: "null", expression: "rebase?.settle", invoke: "", possible: true },
  { name: "callee", absent: "{}", expression: "rebase.settle", invoke: "?.", possible: true },
  { name: "unguarded callee", absent: "{}", expression: "rebase.settle", invoke: "", possible: false },
] as const) {
  test(`optional ${optional.name} indexes possible actual arguments without returned-data permission`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile(
      "/repo/producer.ts",
      `
    function prepare(choose:boolean) { if (choose) return ${optional.absent}; return {settle:(batch:number[])=>batch.length}; }
    const rebase=prepare(false); const pending=[1]; ${optional.expression}${optional.invoke}(pending);
  `,
    );
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const call = calls.find((candidate) => candidate.getExpression().getText() === optional.expression);
    if (call === undefined) {
      throw new Error("the actual optional invocation is missing");
    }
    const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
    const program = observed.programs[0];
    const callback = source.getDescendantsOfKind(SyntaxKind.ArrowFunction)[0];
    const batch = callback?.getParameters()[0]?.getNameNode();
    if (callback === undefined || batch === undefined || program === undefined) {
      throw new Error("the possible callback body was not authored");
    }
    const before = program.byCall;
    expect(program.callers.get(callback.compilerNode)).toBeUndefined();
    const supplied = readSuppliedParameter(batch, new Map(), program);
    const invocation = program.byCall.get(call.compilerNode);
    expect(invocation?.targets.kind).toBe("unresolved");
    expect(invocation?.target.kind).toBe("unresolved");
    expect(invocation?.alternatives.kind).toBe("unresolved");
    expect(invocation?.returns.kind).toBe("unresolved");
    expect(invocation?.invocationTargets?.kind).toBe(optional.possible ? "resolved" : undefined);
    expect(before.get(call.compilerNode)?.invocationTargets).toBeUndefined();
    expect(supplied.kind).toBe(optional.possible ? "resolved" : "unresolved");
    expect(supplied.kind === "resolved" ? supplied.value.map((actual) => actual.value.getText()) : []).toEqual(optional.possible ? ["pending"] : []);
    expect(readCallTargets(call, undefined, observed, true).kind).toBe(optional.possible ? "resolved" : "unresolved");
    expect(readCallTargets(call, undefined, observed).kind).toBe("unresolved");
  });
}

test("returned callable cannot erase a supplied formal member overwrite", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    "/repo/producer.ts",
    `
    function prepare(ctx:{settle:()=>number}) { ctx.settle=()=>2; return {settle:ctx.settle}; }
    const rebase=prepare({settle:()=>1}); rebase.settle();
  `,
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const call = calls.find((candidate) => candidate.getExpression().getText() === "rebase.settle");
  if (call === undefined) {
    throw new Error("the actual returned invocation is missing");
  }
  const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
  expect(queriedTargets(call, observed).kind).toBe("unresolved");
});

test("a sibling native this receiver cannot overwrite the selected callable", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    "/repo/producer.ts",
    `
    function create(ctx:{settle:()=>number; mutate:()=>void}) { ctx.mutate(); return () => ctx.settle(); }
    create({settle:()=>1,mutate:function(){this.settle=()=>2;}});
  `,
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const call = calls.find((candidate) => candidate.getExpression().getText() === "ctx.settle");
  if (call === undefined) {
    throw new Error("the actual selected invocation is missing");
  }
  const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
  expect(queriedTargets(call, observed).kind).toBe("unresolved");
});

test("fresh callable origin is independent of another captured own data value", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    "/repo/producer.ts",
    `
    declare function consume(value:object):void;
    function create(ctx:{settle:()=>number; payload:object}) { consume(ctx.payload); return () => ctx.settle(); }
    let payload:object={}; payload={}; const context={payload,settle:()=>1}; create(context);
  `,
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const call = calls.find((candidate) => candidate.getExpression().getText() === "ctx.settle");
  if (call === undefined) {
    throw new Error("the actual selected invocation is missing");
  }
  const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
  expect(queriedTargets(call, observed).kind).toBe("resolved");
});

for (const member of ["get payload(){this.settle=()=>2;return {};}", "...foreign"]) {
  test(`fresh callable retains unsafe containing property ${member}`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile(
      "/repo/producer.ts",
      `
      declare const foreign:object; declare function consume(value:object):void;
      function create(ctx:{settle:()=>number;payload:object}){consume(ctx.payload);return()=>ctx.settle();}
      const context={${member},settle:()=>1};create(context);
    `,
    );
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const call = calls.find((candidate) => candidate.getExpression().getText() === "ctx.settle");
    if (call === undefined) {
      throw new Error("the actual selected invocation is missing");
    }
    const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
    expect(queriedTargets(call, observed).kind).toBe("unresolved");
  });
}

for (const supply of ["{settle:()=>2}", "foreign"]) {
  test(`supplied member targets actual value rather than class annotation ${supply}`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile(
      "/repo/producer.ts",
      `
      class Contract {settle(){return 1;}}
      declare const foreign:Contract;
      function create(ctx:Contract){return()=>ctx.settle();}
      create(${supply});
    `,
    );
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const call = calls.find((candidate) => candidate.getExpression().getText() === "ctx.settle");
    if (call === undefined) {
      throw new Error("the actual selected invocation is missing");
    }
    const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
    const targets = queriedTargets(call, observed);
    expect(targets.kind).toBe(supply === "foreign" ? "unresolved" : "resolved");
    expect(targets.kind === "resolved" ? targets.value.map((target) => target.getText()) : []).toEqual(supply === "foreign" ? [] : ["()=>2"]);
  });
}

test("opaque sibling invocation cannot inherit a receiver-body proof", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    "/repo/producer.ts",
    `
    declare const mutate:()=>void;
    function create(ctx:{settle:()=>number;mutate:()=>void}){ctx.mutate();return()=>ctx.settle();}
    const context={mutate,settle:()=>1};create(context);
  `,
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const call = calls.find((candidate) => candidate.getExpression().getText() === "ctx.settle");
  if (call === undefined) {
    throw new Error("the actual selected invocation is missing");
  }
  const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
  expect(queriedTargets(call, observed).kind).toBe("unresolved");
});

test("ambient sibling declaration supplies no receiver effect body", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    "/repo/producer.ts",
    `
    declare function mutate():void;
    function create(ctx:{settle:()=>number;mutate:()=>void}){ctx.mutate();return()=>ctx.settle();}
    const context={mutate,settle:()=>1};create(context);
  `,
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const call = calls.find((candidate) => candidate.getExpression().getText() === "ctx.settle");
  if (call === undefined) {
    throw new Error("the selected invocation is missing");
  }
  const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
  expect(queriedTargets(call, observed).kind).toBe("unresolved");
});

test("supplied target refuses a forgotten capture before reading its callee", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile("/repo/producer.ts", "function chosen(){return 1;} chosen();");
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const call = calls[0];
  if (call === undefined) {
    throw new Error("the selected invocation is missing");
  }
  const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
  source.replaceWithText("export const changed=true;");
  expect(readCallTargets(call, undefined, observed)).toMatchObject({ kind: "unresolved", reason: "unsupported" });
});

const RECORD_HANDOFFS = [
  { name: "actual shorthand and destructured argument", supply: "{ctx}", body: "", resolved: true },
  { name: "key swap", supply: "{other:ctx}", body: "", resolved: false },
  { name: "whole wrapper escape", supply: "{ctx}", body: "escape(args);", resolved: false },
  { name: "selected wrapper path overwrite", supply: "{ctx}", body: "args.ctx={settle:()=>2};", resolved: false },
  { name: "destructured alias member overwrite", supply: "{ctx}", body: "ctx.settle=()=>2;", resolved: false },
  { name: "getter path", supply: "{get ctx(){return ctx;}}", body: "", resolved: false },
  { name: "foreign wrapper alternative", supply: "choose?{ctx}:foreign", body: "", resolved: false },
] as const;
for (const scenario of RECORD_HANDOFFS) {
  test(`contained callable record ${scenario.name}`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile(
      "/repo/producer.ts",
      `
      declare function escape(value:object):void; declare const choose:boolean;
      declare const foreign:{ctx:{settle:()=>number}};
      function consume(args:{ctx:{settle:()=>number}}){const{ctx}=args;${scenario.body}return ctx.settle();}
      function create(ctx:{settle:()=>number}){return consume(${scenario.supply});}
      const context={settle:()=>1};create(context);
    `,
    );
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const call = calls.find((candidate) => candidate.getExpression().getText() === "ctx.settle");
    if (call === undefined) {
      throw new Error("the selected invocation is missing");
    }
    const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
    expect(queriedTargets(call, observed).kind).toBe(scenario.resolved ? "resolved" : "unresolved");
  });
}

test("same authored body cannot hide another mutated instance's actual arguments", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    "/repo/producer.ts",
    `
    function factory(){return{settle:(batch:number[])=>batch.push(1)};}
    const first=factory(); const second=factory(); const unsafe=[2];
    first.settle(unsafe); first.settle=()=>0; second.settle([]);
  `,
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
  const body = source.getDescendantsOfKind(SyntaxKind.ArrowFunction).find((candidate) => candidate.getParameters().length === 1);
  const batch = body?.getParameters()[0]?.getNameNode();
  const program = observed.programs[0];
  if (batch === undefined || program === undefined) {
    throw new Error("the actual shared body is missing");
  }
  const supplied = readSuppliedParameter(batch, new Map(), program);
  expect(supplied.kind === "unresolved" || supplied.value.some((actual) => actual.value.getText() === "unsafe")).toBe(true);
});

for (const scenario of [
  { name: "all safe actual factory instances", extra: "", resolved: true },
  { name: "an escaped first factory instance", extra: "escape(first);", resolved: false },
]) {
  test(`shared callable owner retains ${scenario.name}`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile(
      "/repo/producer.ts",
      `
      declare function escape(value:object):void;
      function factory(){return{settle:(batch:number[])=>batch.push(1)};}
      const first=factory(); const second=factory(); const firstBatch=[1]; const secondBatch=[2];
      first.settle(firstBatch); ${scenario.extra} second.settle(secondBatch);
    `,
    );
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
    const body = source.getDescendantsOfKind(SyntaxKind.ArrowFunction)[0];
    const batch = body?.getParameters()[0]?.getNameNode();
    const program = observed.programs[0];
    if (batch === undefined || program === undefined) {
      throw new Error("the actual shared body is missing");
    }
    const supplied = readSuppliedParameter(batch, new Map(), program);
    expect(supplied.kind).toBe(scenario.resolved ? "resolved" : "unresolved");
    expect(supplied.kind === "resolved" ? supplied.value.map((actual) => actual.value.getText()) : []).toEqual(
      scenario.resolved ? ["firstBatch", "secondBatch"] : [],
    );
  });
}

for (const scenario of [
  { name: "same-spelled separate binding", extra: "function unrelated(){const ctx={settle:()=>3};ctx.settle=()=>4;}", resolved: true },
  { name: "real unsafe lexical alias", extra: "const alias=ctx;alias.settle=()=>2;", resolved: false },
]) {
  test(`destructured callable distinguishes ${scenario.name}`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile(
      "/repo/producer.ts",
      `
      function consume(args:{ctx:{settle:()=>number}}){const{ctx}=args;${scenario.extra}return ctx.settle();}
      function create(ctx:{settle:()=>number}){return consume({ctx});}
      const context={settle:()=>1};create(context);
    `,
    );
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const call = calls.find((candidate) => candidate.getExpression().getText() === "ctx.settle");
    if (call === undefined) {
      throw new Error("the selected invocation is missing");
    }
    const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
    expect(queriedTargets(call, observed).kind).toBe(scenario.resolved ? "resolved" : "unresolved");
  });
}

for (const reversed of [false, true]) {
  test(`transitive callable demands settle atomically in ${reversed ? "reverse" : "forward"} order`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile(
      "/repo/producer.ts",
      `
      function make(ctx:{forward:(batch:number[])=>void}){return{settle:(batch:number[])=>ctx.forward(batch)};}
      const context={forward:(items:number[])=>items.push(1)};
      const carrier=make(context);const pending=[1];carrier.settle(pending);
    `,
    );
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
    const program = observed.programs[0];
    const bodies = source.getDescendantsOfKind(SyntaxKind.ArrowFunction);
    const items = bodies
      .find((body) => body.getParameters()[0]?.getName() === "items")
      ?.getParameters()[0]
      ?.getNameNode();
    const batch = bodies
      .find((body) => body.getParameters()[0]?.getName() === "batch")
      ?.getParameters()[0]
      ?.getNameNode();
    if (program === undefined || items === undefined || batch === undefined) {
      throw new Error("actual callable demand owners missing");
    }
    const ordered = reversed ? [batch, items] : [items, batch];
    for (const parameter of [...ordered, ...ordered]) {
      const supplied = readSuppliedParameter(parameter, new Map(), program);
      expect(supplied.kind).toBe("resolved");
      const actual = supplied.kind === "resolved" ? supplied.value[0] : undefined;
      if (actual === undefined) {
        throw new Error("the actual supplied batch is missing");
      }
      expect(actual.value.getText()).toBe(parameter === items ? "batch" : "pending");
      const delivered = parameter === items ? readSuppliedParameter(actual.value, actual.bindings, program) : supplied;
      expect(delivered.kind === "resolved" ? delivered.value.map((value) => value.value.getText()) : []).toEqual(["pending"]);
    }
    const indexed = program.byCall;
    readSuppliedParameter(items, new Map(), program);
    expect(program.byCall).toBe(indexed);
  });
}

test("a missing physical factory-instance invocation poisons the settled safe sibling", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    "/repo/producer.ts",
    `
    function factory(){return{settle:(batch:number[])=>batch.push(1)};}
    const first=factory();const second=factory();first.settle([1]);second.settle([2]);
  `,
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression).filter((call) => call.getExpression().getText() !== "second.settle");
  const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
  const batch = source.getDescendantsOfKind(SyntaxKind.ArrowFunction)[0]?.getParameters()[0]?.getNameNode();
  const program = observed.programs[0];
  if (batch === undefined || program === undefined) {
    throw new Error("actual callable demand owner missing");
  }
  expect(readSuppliedParameter(batch, new Map(), program).kind).toBe("unresolved");
});

test("recursive containing handoff refuses without poisoning an independent settled owner", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    "/repo/producer.ts",
    `
    function recursive(ctx:{settle:(batch:number[])=>void}){recursive(ctx);ctx.settle([]);}
    const context={settle:(batch:number[])=>batch.push(1)};recursive(context);
    const independent={settle:(safe:number[])=>safe.push(2)};const pending=[2];independent.settle(pending);
  `,
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
  const bodies = source.getDescendantsOfKind(SyntaxKind.ArrowFunction);
  const batch = bodies
    .find((body) => body.getParameters()[0]?.getName() === "batch")
    ?.getParameters()[0]
    ?.getNameNode();
  const safe = bodies
    .find((body) => body.getParameters()[0]?.getName() === "safe")
    ?.getParameters()[0]
    ?.getNameNode();
  const program = observed.programs[0];
  if (batch === undefined || safe === undefined || program === undefined) {
    throw new Error("actual callable demand owners missing");
  }
  expect(readSuppliedParameter(batch, new Map(), program).kind).toBe("unresolved");
  const supplied = readSuppliedParameter(safe, new Map(), program);
  expect(supplied.kind === "resolved" ? supplied.value.map((value) => value.value.getText()) : []).toEqual(["pending"]);
  expect(readSuppliedParameter(batch, new Map(), program).kind).toBe("unresolved");
});

test("supplied owner demand refuses stale epochs before reading a forgotten formal", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile("/repo/producer.ts", "const context={settle:(batch:number[])=>batch.length};context.settle([]);");
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
  const batch = source.getDescendantsOfKind(SyntaxKind.ArrowFunction)[0]?.getParameters()[0]?.getNameNode();
  const program = observed.programs[0];
  if (batch === undefined || program === undefined) {
    throw new Error("actual callable demand owner missing");
  }
  source.replaceWithText("export const changed=true;");
  expect(readSuppliedParameter(batch, new Map(), program)).toMatchObject({ kind: "unresolved", reason: "unsupported" });
});

for (const spreadOwned of [false, true]) {
  test(`actual authored dependency handoffs ${spreadOwned ? "through owned spread" : "without copy"} retain the scoped callable`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile(
      "/repo/producer.ts",
      `
      type Context={db:object;settle:()=>number};type Deps={recallMemory:(ctx:Context)=>object};
      function recallMemory(ctx:Context){return ctx.db;}
      function resolveSpeakerMemory(ctx:Context,deps:Deps){return deps.recallMemory(ctx);}
      function createTurnEngine(ctx:Context,deps:Deps){
        const owned=${spreadOwned ? "{...deps,compactionInFlight:new Set()}" : "deps"};
        resolveSpeakerMemory(ctx,owned);return ctx.settle();
      }
      function createChatService(ctx:Context){return createTurnEngine(ctx,{recallMemory});}
      const context={db:{},settle:()=>1};createChatService(context);
    `,
    );
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const dependency = calls.find((call) => call.getExpression().getText() === "deps.recallMemory");
    const selected = calls.find((call) => call.getExpression().getText() === "ctx.settle");
    if (dependency === undefined || selected === undefined) {
      throw new Error("the actual dependency and selected callable controls are missing");
    }
    const observations = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
    const dependencyTargets = queriedTargets(dependency, observations);
    const selectedTargets = queriedTargets(selected, observations);
    expect({
      dependency:
        dependencyTargets.kind === "resolved"
          ? dependencyTargets.value.map((target) => target.getText())
          : { kind: dependencyTargets.kind, detail: dependencyTargets.detail, node: dependencyTargets.node.getText() },
      selected:
        selectedTargets.kind === "resolved"
          ? selectedTargets.value.map((target) => target.getText())
          : { kind: selectedTargets.kind, detail: selectedTargets.detail, node: selectedTargets.node.getText() },
    }).toEqual({ dependency: ["function recallMemory(ctx:Context){return ctx.db;}"], selected: ["()=>1"] });
  });
}

const DEPENDENCY_HANDOFF_CONTROLS = [
  {
    name: "actual authored callee mutation",
    implementation: "function recallMemory(ctx:Context){ctx.settle=()=>2;return ctx.db;}",
    supply: "{recallMemory}",
    extra: "",
    dependency: true,
    names: ["recallMemory"],
  },
  {
    name: "opaque supplied callee",
    implementation: 'declare const recallMemory:Deps["recallMemory"];',
    supply: "{recallMemory}",
    extra: "",
    dependency: false,
    names: [],
  },
  {
    name: "bodyless supplied callee",
    implementation: "declare function recallMemory(ctx:Context):object;",
    supply: "{recallMemory}",
    extra: "",
    dependency: false,
    names: [],
  },
  {
    name: "safe and unsafe actual alternatives",
    implementation: "function recallMemory(ctx:Context){return ctx.db;}function mutate(ctx:Context){ctx.settle=()=>2;return ctx.db;}",
    supply: "choose?{recallMemory}:{recallMemory:mutate}",
    extra: "",
    dependency: true,
    names: ["mutate", "recallMemory"],
  },
  {
    name: "owned selected overwrite",
    implementation: "function recallMemory(ctx:Context){return ctx.db;}",
    supply: "{recallMemory}",
    extra: "owned.recallMemory=()=>({});",
    dependency: false,
    names: [],
  },
  {
    name: "owned alias selected overwrite",
    implementation: "function recallMemory(ctx:Context){return ctx.db;}",
    supply: "{recallMemory}",
    extra: "const alias=owned;alias.recallMemory=()=>({});",
    dependency: false,
    names: [],
  },
  {
    name: "whole owned record escape",
    implementation: "function recallMemory(ctx:Context){return ctx.db;}",
    supply: "{recallMemory}",
    extra: "escape(owned);",
    dependency: false,
    names: [],
  },
  {
    name: "opaque receiver alternative",
    implementation: "function recallMemory(ctx:Context){return ctx.db;}",
    supply: "choose?{recallMemory}:foreign",
    extra: "",
    dependency: false,
    names: [],
  },
  {
    name: "selected getter source",
    implementation: "function recallMemory(ctx:Context){return ctx.db;}",
    supply: "{get recallMemory(){return recallMemory;}}",
    extra: "",
    dependency: false,
    names: [],
  },
  {
    name: "executed unrelated getter source",
    implementation: "function recallMemory(ctx:Context){return ctx.db;}",
    supply: "{recallMemory,get extra(){context.settle=()=>9;return 1;}}",
    extra: "",
    dependency: false,
    names: [],
  },
  {
    name: "opaque spread source",
    implementation: "function recallMemory(ctx:Context){return ctx.db;}",
    supply: "{...foreign,recallMemory}",
    extra: "",
    dependency: false,
    names: [],
  },
  {
    name: "proxy source",
    implementation: "function recallMemory(ctx:Context){return ctx.db;}",
    supply: "new Proxy({recallMemory},{get(target,key){return Reflect.get(target,key);}})",
    extra: "",
    dependency: false,
    names: [],
  },
  {
    name: "actual callable binding write",
    implementation: "function recallMemory(ctx:Context){return ctx.db;}recallMemory=()=>({});",
    supply: "{recallMemory}",
    extra: "",
    dependency: false,
    names: [],
  },
  { name: "unsupplied dependency", implementation: "function recallMemory(ctx:Context){return ctx.db;}", supply: "", extra: "", dependency: false, names: [] },
] as const;
for (const scenario of DEPENDENCY_HANDOFF_CONTROLS) {
  test(`authored dependency handoff refuses ${scenario.name}`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile(
      "/repo/producer.ts",
      `
      type Context={db:object;settle:()=>number};type Deps={recallMemory:(ctx:Context)=>object};
      declare const choose:boolean;declare const foreign:Deps;declare function escape(value:object):void;
      ${scenario.implementation}
      function resolveSpeakerMemory(ctx:Context,deps:Deps){return deps.recallMemory(ctx);}
      function createTurnEngine(ctx:Context,deps:Deps){const owned={...deps,compactionInFlight:new Set()};${scenario.extra}resolveSpeakerMemory(ctx,owned);return ctx.settle();}
      function createChatService(ctx:Context){return createTurnEngine(ctx,${scenario.supply});}
      const context={db:{},settle:()=>1};createChatService(context);
    `,
    );
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const dependency = calls.find((call) => call.getExpression().getText() === "deps.recallMemory");
    const selected = calls.find((call) => call.getExpression().getText() === "ctx.settle");
    if (dependency === undefined || selected === undefined) {
      throw new Error("the actual dependency and scoped callable are missing");
    }
    const observations = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
    const target = queriedTargets(dependency, observations);
    expect(target.kind).toBe(scenario.dependency ? "resolved" : "unresolved");
    expect(
      target.kind === "resolved"
        ? target.value.map((node) => node.asKind(SyntaxKind.FunctionDeclaration)?.getName() ?? node.getText()).sort((left, right) => left.localeCompare(right))
        : [],
    ).toEqual(scenario.names);
    expect(queriedTargets(selected, observations).kind).toBe("unresolved");
  });
}

test("an imported authored dependency enters the same captured graph before its containing handoff", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile("/repo/recall.ts", `import type {Context} from "./producer.js";export function recallMemory(ctx:Context){return ctx.db;}`);
  const source = project.createSourceFile(
    "/repo/producer.ts",
    `
    import {recallMemory} from "./recall.js";
    export type Context={db:object;settle:()=>number};type Deps={recallMemory:typeof recallMemory};
    function resolveSpeakerMemory(ctx:Context,deps:Deps){return deps.recallMemory(ctx);}
    function createTurnEngine(ctx:Context,deps:Deps){const owned={...deps,compactionInFlight:new Set()};resolveSpeakerMemory(ctx,owned);return ctx.settle();}
    function createChatService(ctx:Context){return createTurnEngine(ctx,{recallMemory});}
    const context={db:{},settle:()=>1};createChatService(context);
  `,
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const selected = calls.find((call) => call.getExpression().getText() === "ctx.settle");
  if (selected === undefined) {
    throw new Error("the containing handoff is missing");
  }
  const observations = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
  const targets = queriedTargets(selected, observations);
  expect(
    targets.kind === "resolved" ? targets.value.map((node) => node.getText()) : { kind: targets.kind, detail: targets.detail, node: targets.node.getText() },
  ).toEqual(["()=>1"]);
});

test("supplied target capture does not widen ordinary returned-data function projection", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile("/repo/producer.ts", "function actual(){return 1;}const record={actual};actual();");
  const observations = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants(), { suppliedCallableTargets: true });
  const record = source.getVariableDeclarationOrThrow("record").getInitializerOrThrow();
  const value = readReturnedValue(record, ["actual"], observations, { terminals: new Set(), bindings: new Map() });
  expect(observations.programs[0]?.suppliedCallableTargets).toBe(true);
  expect(value.kind === "unresolved" ? { kind: value.kind, reason: value.reason, node: value.node.getKindName() } : { kind: value.kind }).toEqual({
    kind: "unresolved",
    reason: "unsupported",
    node: "FunctionDeclaration",
  });
});

test("canonical supplied callable source registration rejects foreign and stale nodes without admitting them", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile("/repo/producer.ts", "function actual(){return 1;}actual();");
  const observations = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants(), { suppliedCallableTargets: true });
  const program = observations.programs[0];
  const actual = source.getFunctionOrThrow("actual").getNameNodeOrThrow();
  const value = program?.suppliedCallableValue;
  if (program === undefined || value === undefined) {
    throw new Error("the supplied canonical callable service is missing");
  }
  const count = program.sources.size;
  const foreignProject = new Project({ useInMemoryFileSystem: true });
  const foreign = foreignProject.createSourceFile("/repo/producer.ts", "function actual(){return 2;}actual();");
  expect(value(foreign.getFunctionOrThrow("actual").getNameNodeOrThrow()).kind).toBe("unresolved");
  expect(program.sources.has(foreign)).toBe(false);
  expect(program.sources.size).toBe(count);
  source.replaceWithText("export const changed=true;");
  expect(value(actual)).toMatchObject({ kind: "unresolved", reason: "unsupported" });
  expect(program.sources.size).toBe(count);
});

test("an independent own holder data read does not normalize an imported-style named callable's sibling value", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    "/repo/producer.ts",
    `
    type Context={db:object;settle:()=>number};type Deps={recallMemory:(ctx:Context)=>object;holder:object};
    declare function consume(value:object):void;
    function recallMemory(ctx:Context){return ctx.db;}
    function resolveSpeakerMemory(ctx:Context,deps:Deps){return deps.recallMemory(ctx);}
    function createTurnEngine(ctx:Context,deps:Deps){const owned={...deps,compactionInFlight:new Set()};consume(owned.holder);resolveSpeakerMemory(ctx,owned);return ctx.settle();}
    function createChatService(ctx:Context){return createTurnEngine(ctx,{recallMemory,holder});}
    let holder:object={};holder={};const context={db:{},settle:()=>1};createChatService(context);
  `,
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const dependency = calls.find((call) => call.getExpression().getText() === "deps.recallMemory");
  const selected = calls.find((call) => call.getExpression().getText() === "ctx.settle");
  if (dependency === undefined || selected === undefined) {
    throw new Error("the concrete dependency handoffs are missing");
  }
  const observations = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
  const actual = queriedTargets(dependency, observations);
  const scoped = queriedTargets(selected, observations);
  expect({ dependency: actual.kind, selected: scoped.kind }).toEqual({ dependency: "resolved", selected: "resolved" });
});

for (const omittedEscape of [false, true]) {
  test(`new imported helper calls respect ${omittedEscape ? "an actually omitted unsafe call" : "fixed versus settled captured membership"}`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const imported = project.createSourceFile(
      "/repo/recall.ts",
      `
      import type {Context} from "./producer.js";
      function helper(ctx:Context){return ctx.db;}
      export function recallMemory(ctx:Context){return helper(ctx);}
    `,
    );
    const source = project.createSourceFile(
      "/repo/producer.ts",
      `
      import {recallMemory} from "./recall.js";
      export type Context={db:object;settle:()=>number};type Deps={recallMemory:(ctx:Context)=>object};
      declare function escape(value:object):void;
      function resolveSpeakerMemory(ctx:Context,deps:Deps){return deps.recallMemory(ctx);}
      function createTurnEngine(ctx:Context,deps:Deps){resolveSpeakerMemory(ctx,deps);return ctx.settle();}
      function createChatService(ctx:Context){return createTurnEngine(ctx,{recallMemory});}
      const context={db:{},settle:()=>1};createChatService(context);${omittedEscape ? "escape(context);" : ""}
    `,
    );
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression).filter((call) => call.getExpression().getText() !== "escape");
    const selected = calls.find((call) => call.getExpression().getText() === "ctx.settle");
    const helper = imported.getDescendantsOfKind(SyntaxKind.CallExpression)[0];
    if (selected === undefined || helper === undefined) {
      throw new Error("the transitive imported helper control is missing");
    }
    const observations = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
    const program = observations.programs[0];
    const demand = program?.suppliedCallableUses;
    if (program === undefined || demand === undefined) {
      throw new Error("the canonical captured target demand is missing");
    }
    const fixed = new Set(program.byCall.keys());
    expect(fixed.has(helper.compilerNode)).toBe(false);
    expect(readCallTargets(selected, fixed, observations).kind).toBe("unresolved");
    const settled = demand(selected);
    const closed = readCallTargets(selected, new Set(program.byCall.keys()), observations);
    const live = readAuthoredCallableSources(selected.getExpression(), (call) => program.byCall.has(call.compilerNode), observations);
    expect({ settled: settled.kind, closed: closed.kind, live: live.kind }).toEqual(
      omittedEscape ? { settled: "unresolved", closed: "unresolved", live: "unresolved" } : { settled: "resolved", closed: "resolved", live: "resolved" },
    );
    expect(readCallTargets(selected, fixed, observations).kind).toBe("unresolved");
    expect(fixed.has(helper.compilerNode)).toBe(false);
    expect(program.byCall.has(helper.compilerNode)).toBe(true);
    const escaped = source.getDescendantsOfKind(SyntaxKind.CallExpression).find((call) => call.getExpression().getText() === "escape");
    expect(escaped !== undefined).toBe(omittedEscape);
    expect(escaped !== undefined && program.byCall.has(escaped.compilerNode)).toBe(false);
  });
}

for (const readonly of [false, true]) {
  for (const scenario of [
    { name: "safe shared imported context", extra: "", resolved: true },
    { name: "second-module imported overwrite", extra: "context.settle=()=>2;", resolved: false },
    { name: "second-module imported escape", extra: "escape(context);", resolved: false },
    { name: "second-module const-alias escape", extra: "const alias=context;escape(alias);", resolved: false },
  ] as const) {
    test(`${readonly ? "readonly" : "raw"} callable closure retains ${scenario.name}`, () => {
      const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
      const base = project.createSourceFile("/base.ts", "export const context={settle:()=>1};");
      const caller = project.createSourceFile(
        "/caller.ts",
        "import {context} from './base';function create(ctx:{settle:()=>number}){return ctx.settle();}create(context);",
      );
      const other = project.createSourceFile("/other.ts", `import {context} from './base';declare function escape(value:object):void;${scenario.extra}`);
      const sources = [base, caller, other];
      const calls = sources.flatMap((source) => source.getDescendantsOfKind(SyntaxKind.CallExpression));
      const selected = calls.find((call) => call.getExpression().getText() === "ctx.settle");
      if (selected === undefined) {
        throw new Error("the actual imported-context invocation is missing");
      }
      if (readonly) {
        beginReferencePass();
      }
      try {
        const observed = observeCallReturns(
          calls,
          sources.flatMap((source) => source.getDescendants()),
          { suppliedCallableTargets: true },
        );
        const targets = queriedTargets(selected, observed);
        expect(targets.kind).toBe(scenario.resolved ? "resolved" : "unresolved");
        expect(targets.kind === "resolved" ? targets.value.map((target) => target.getText()) : []).toEqual(scenario.resolved ? ["()=>1"] : []);
      } finally {
        if (readonly) {
          endReferencePass();
        }
      }
    });
  }
}

async function actualCompactionBinding(project: Project, repoRoot: string): Promise<{ owned: string; binding: string; operations: string }> {
  const actual = project.createSourceFile("/actual-engine.ts", await readFile(join(repoRoot, "packages/server/src/domain/chat/engine/engine.ts"), "utf8"));
  const owned = actual.getFunctionOrThrow("createTurnEngine").getBodyOrThrow().asKindOrThrow(SyntaxKind.Block).getStatements()[0];
  const body = actual.getFunctionOrThrow("runPreTurnCompaction").getBodyOrThrow().asKindOrThrow(SyntaxKind.Block);
  const binding = body.getStatements()[0];
  if (!(Node.isVariableStatement(owned) && Node.isVariableStatement(binding))) {
    throw new Error("the actual owned record and compaction binding statements are unavailable");
  }
  const operations = ["has", "add", "delete"].map((member) => {
    const call = body
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .find((candidate) => candidate.getExpression().getText() === `compactionInFlight.${member}`);
    if (call === undefined) {
      throw new Error(`the actual compaction ${member} operation is unavailable`);
    }
    return `${call.getText()};`;
  });
  const source = { owned: owned.getText(), binding: binding.getText(), operations: operations.join("\n") };
  actual.forget();
  return source;
}

for (const readonly of [false, true]) {
  for (const scenario of [
    { name: "one import binding", second: "", resolved: true },
    { name: "two import bindings", second: "function gather(){return chosen();}gather();", resolved: true },
    { name: "opaque imported escape", second: "escape(chosen);", resolved: false },
    { name: "const imported alias escape", second: "const alias=chosen;escape(alias);", resolved: false },
    { name: "mutable imported alias", second: "let alias=chosen;alias=()=>2;", resolved: false },
    { name: "imported alias property write", second: "const alias=chosen;alias.extra=2;", resolved: false },
    { name: "imported alias record storage", second: "const saved={copy:chosen};escape(saved);", resolved: false },
    { name: "returned imported value", second: "function gather(){return chosen;}gather();", resolved: false },
    { name: "re-exported import binding", second: "", barrel: true, resolved: true },
    { name: "re-exported const alias escape", second: "const alias=chosen;escape(alias);", barrel: true, resolved: false },
  ] as const) {
    test(`${readonly ? "readonly" : "raw"} named imported data closure retains ${scenario.name}`, () => {
      const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
      const implementation = project.createSourceFile("/repo/chosen.ts", "export function chosen(){return 1;}");
      const producer = project.createSourceFile(
        "/repo/producer.ts",
        `${"barrel" in scenario ? "import {renamed as chosen} from './barrel';" : "import {chosen} from './chosen';"}declare function escape(value:object):void;
        function create(ctx:{settle:()=>number;payload:object}){const {payload}=ctx;escape(payload);return ctx.settle();}
        const context={settle:chosen,payload:{}};create(context);`,
      );
      const sources = [implementation, producer];
      if ("barrel" in scenario) {
        sources.push(project.createSourceFile("/repo/barrel.ts", "export {chosen as renamed} from './chosen';"));
      }
      if (scenario.second.length > 0) {
        sources.push(
          project.createSourceFile(
            "/repo/other.ts",
            `${"barrel" in scenario ? "import {renamed as chosen} from './barrel';" : "import {chosen} from './chosen';"}declare function escape(value:object):void;${scenario.second}`,
          ),
        );
      }
      const calls = sources.flatMap((source) => source.getDescendantsOfKind(SyntaxKind.CallExpression));
      const selected = calls.find((call) => call.getExpression().getText() === "ctx.settle");
      if (selected === undefined) {
        throw new Error("the actual selected imported callback invocation is missing");
      }
      if (readonly) {
        beginReferencePass();
      }
      try {
        const observations = observeCallReturns(
          calls,
          sources.flatMap((source) => source.getDescendants()),
          { suppliedCallableTargets: true },
        );
        const targets = queriedTargets(selected, observations);
        const declaration = implementation.getFunctionOrThrow("chosen");
        expect(
          targets.kind,
          JSON.stringify({
            target: compactionTargetDescription(targets),
            refusedAtOriginalDeclarationName: targets.kind === "unresolved" && targets.node.compilerNode === declaration.getNameNodeOrThrow().compilerNode,
            refusedParentKind: targets.kind === "unresolved" ? targets.node.getParent()?.getKindName() : undefined,
          }),
        ).toBe(scenario.resolved ? "resolved" : "unresolved");
        expect(
          targets.kind === "resolved" && targets.value.length > 0 && targets.value.every((target) => target.compilerNode === declaration.compilerNode),
        ).toBe(scenario.resolved);
      } finally {
        if (readonly) {
          endReferencePass();
        }
      }
    });
  }
}

for (const references of ["sparse", "explicit"] as const) {
  for (const escaped of [false, true]) {
    test(`captured barrel source participation ${references} ${escaped ? "escaped" : "safe"}`, () => {
      const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
      const implementation = project.createSourceFile("/repo/chosen.ts", "export function chosen(){return 1;}");
      const barrel = project.createSourceFile("/repo/barrel.ts", "export {chosen as renamed} from './chosen';");
      const consumer = project.createSourceFile(
        "/repo/consumer.ts",
        `import {renamed as chosen} from './barrel';declare function escape(value:object):void;
        function create(ctx:{settle:()=>number;payload:object}){const {payload}=ctx;escape(payload);return ctx.settle();}
        const context={settle:chosen,payload:{}};create(context);`,
      );
      const sources = [implementation, barrel, consumer];
      if (escaped) {
        sources.push(
          project.createSourceFile(
            "/repo/other.ts",
            "import {renamed} from './barrel';declare function escape(value:object):void;const alias=renamed;escape(alias);",
          ),
        );
      }
      const calls = consumer.getDescendantsOfKind(SyntaxKind.CallExpression);
      const selected = calls.find((call) => call.getExpression().getText() === "ctx.settle");
      if (selected === undefined) {
        throw new Error("the selected barrel-supplied invocation is unavailable");
      }
      const declaration = implementation.getFunctionOrThrow("chosen");
      const exported = barrel.getExportDeclarations()[0]?.getNamedExports()[0]?.getNameNode();
      if (exported === undefined) {
        throw new Error("the actual native re-export name is unavailable");
      }
      const exportedStart = exported.getStart();
      const exportedEnd = exported.getEnd();
      const sourceIdentity = barrel.compilerNode;
      const nativeProgram = project.getProgram().compilerObject;
      const service = project.getLanguageService().compilerObject;
      const languageProgram = service.getProgram();
      const createPass = service.createReadonlyReferencePass.bind(service);
      let nativeReexportReferences = 0;
      const referenceObservation = vi.spyOn(service, "createReadonlyReferencePass").mockImplementation(() => {
        const pass = createPass();
        const find = pass.findReferences.bind(pass);
        vi.spyOn(pass, "findReferences").mockImplementation((...args) => {
          const result = find(...args);
          nativeReexportReferences += (result ?? [])
            .flatMap((group) => group.references)
            .filter(
              (reference) =>
                reference.fileName === "/repo/barrel.ts" &&
                reference.textSpan.start < exportedEnd &&
                reference.textSpan.start + reference.textSpan.length > exportedStart,
            ).length;
          return result;
        });
        return pass;
      });
      beginReferencePass();
      try {
        const observed = observeCallReturns(
          calls,
          (references === "sparse" ? [consumer] : sources).flatMap((source) => source.getDescendants()),
          { suppliedCallableTargets: true },
        );
        const program = observed.programs[0];
        if (program === undefined) {
          throw new Error("the actual captured native program is unavailable");
        }
        const sourceMap = program.sources;
        const barrelBefore = sourceMap.has(barrel);
        expect(barrelBefore).toBe(references === "explicit");
        const result = readAuthoredCallableSources(selected.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
        const evidence = {
          references,
          escaped,
          barrelBefore,
          barrelAfter: program.sources.has(barrel),
          sameSourceMap: program.sources === sourceMap,
          sameNativeSource: barrel.compilerNode === sourceIdentity && nativeProgram.getSourceFile("/repo/barrel.ts") === sourceIdentity,
          sameNativeProgram: project.getProgram().compilerObject === nativeProgram && program.program === nativeProgram,
          sameLanguageProgram: service.getProgram() === languageProgram,
          nativeReexportReferences,
          result:
            result.kind === "resolved"
              ? { kind: result.kind }
              : {
                  kind: result.kind,
                  detail: result.detail,
                  file: result.node.getSourceFile().getFilePath(),
                  start: result.node.getStart(),
                  end: result.node.getEnd(),
                },
        };
        console.log("captured-barrel-source", JSON.stringify(evidence));
        expect(evidence.sameSourceMap).toBe(true);
        expect(evidence.sameNativeSource).toBe(true);
        expect(evidence.sameNativeProgram).toBe(true);
        expect(evidence.sameLanguageProgram).toBe(true);
        expect(nativeReexportReferences).toBeGreaterThan(0);
        expect(result.kind, JSON.stringify(evidence)).toBe(escaped ? "unresolved" : "resolved");
        expect(
          result.kind === "resolved" && result.value.length > 0 && result.value.every((origin) => origin.value.compilerNode === declaration.compilerNode),
        ).toBe(!escaped);
      } finally {
        endReferencePass();
        referenceObservation.mockRestore();
      }
    });
  }
}

function sparseBarrelProject(): {
  project: Project;
  implementation: SourceFile;
  barrel: SourceFile;
  consumer: SourceFile;
  call: CallExpression;
  binding: import("ts-morph").Identifier;
} {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const implementation = project.createSourceFile("/repo/chosen.ts", "export function chosen(){return 1;}");
  const barrel = project.createSourceFile("/repo/barrel.ts", "export {chosen as renamed} from './chosen';");
  const consumer = project.createSourceFile("/repo/consumer.ts", "import {renamed} from './barrel';renamed();");
  const call = consumer.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
  const binding = implementation.getFunctionOrThrow("chosen").getNameNodeOrThrow();
  return { project, implementation, barrel, consumer, call, binding };
}

test("native reference source demand aborts a private trial before writing and retries after ordinary publication", () => {
  const { project, implementation, barrel, consumer, call, binding } = sparseBarrelProject();
  beginReferencePass();
  try {
    const observed = observeCallReturns([call], consumer.getDescendants(), { suppliedCallableTargets: true });
    const program = observed.programs[0];
    const reference = nativeReferenceNodes(binding).find((node) => node.getSourceFile() === barrel);
    if (program?.demandReferenceSource === undefined || program.withInheritedReadTrial === undefined || reference === undefined) {
      throw new Error("the native reference capture services are unavailable");
    }
    const native = project.getProgram().compilerObject;
    const sources = program.sources;
    const calls = program.byCall;
    const before = program.callableProofEpoch?.();
    if (before === undefined) {
      throw new Error("the captured input epoch is unavailable");
    }
    const demand = program.demandReferenceSource;
    const snapshots: { barrel: boolean; sameCalls: boolean; referenceRevision: number | undefined }[] = [];
    let attempts = 0;
    const result = program.withInheritedReadTrial(binding, program, () => {
      attempts++;
      try {
        return demand(reference, binding);
      } finally {
        snapshots.push({
          barrel: sources.has(barrel),
          sameCalls: program.byCall === calls,
          referenceRevision: program.callableProofEpoch?.().referenceRevision,
        });
      }
    });
    expect(result.kind).toBe("resolved");
    expect(attempts).toBe(2);
    expect(snapshots[0]).toEqual({ barrel: false, sameCalls: true, referenceRevision: before.referenceRevision });
    expect(program.sources === sources).toBe(true);
    expect(sources.get(barrel) === barrel.compilerNode).toBe(true);
    expect(program.callableProofEpoch?.().referenceRevision).toBe(before.referenceRevision + 1);
    expect(program.byCall.size).toBe(calls.size);
    expect(project.getProgram().compilerObject === native).toBe(true);
    expect(program.inheritedReadTrialActive?.()).toBe(false);
    const ordinary = readAuthoredCallableSources(call.getExpression(), (candidate) => program.byCall.has(candidate.compilerNode), observed);
    expect(ordinary.kind).toBe("resolved");
    expect(ordinary.kind === "resolved" && ordinary.value.every((source) => source.value === implementation.getFunctionOrThrow("chosen"))).toBe(true);
  } finally {
    endReferencePass();
  }
});

for (const invalidation of [
  "forgotten reference",
  "changed source",
  "foreign source",
  "uncaptured binding",
  "closed pass",
  "replaced pass",
  "cancellation",
] as const) {
  test(`native reference source demand refuses ${invalidation} before publication`, () => {
    const { project, barrel, consumer, call, binding } = sparseBarrelProject();
    const service = project.getLanguageService().compilerObject;
    const create = service.createReadonlyReferencePass.bind(service);
    let pass: ts.ReadonlyReferencePass | undefined;
    const passObservation = vi.spyOn(service, "createReadonlyReferencePass").mockImplementation(() => {
      pass = create();
      return pass;
    });
    beginReferencePass();
    try {
      const observed = observeCallReturns([call], consumer.getDescendants(), { suppliedCallableTargets: true });
      const program = observed.programs[0];
      let reference = nativeReferenceNodes(binding).find((node) => node.getSourceFile() === barrel);
      if (program?.demandReferenceSource === undefined || reference === undefined || pass === undefined) {
        throw new Error("the native reached reference and capture are unavailable");
      }
      const sources = program.sources;
      const calls = program.byCall;
      const before = program.callableProofEpoch?.().referenceRevision;
      switch (invalidation) {
        case "forgotten reference":
          reference.forget();
          break;
        case "changed source":
          barrel.replaceWithText("export {chosen as renamed} from './chosen';export const changed=1;");
          break;
        case "foreign source": {
          const other = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
          reference = other.createSourceFile("/repo/barrel.ts", "const foreign=1;").getVariableDeclarationOrThrow("foreign").getNameNode();
          break;
        }
        case "closed pass":
          endReferencePass();
          break;
        case "replaced pass":
          endReferencePass();
          beginReferencePass();
          break;
        case "uncaptured binding":
        case "cancellation":
          break;
      }
      const demand = (node: import("ts-morph").Node, origin: import("ts-morph").Node): ReturnType<typeof readCallReturnReference> =>
        readCallReturnReference(node, origin, program);
      const requested = reference;
      const anchor = invalidation === "uncaptured binding" ? requested : binding;
      let cancelled = false;
      let refusal = false;
      if (invalidation === "cancellation") {
        const cancellation = new ts.OperationCanceledException();
        const validation = vi.spyOn(pass, "validate").mockImplementationOnce(() => {
          throw cancellation;
        });
        try {
          try {
            demand(requested, binding);
            throw new Error("native cancellation was not propagated");
          } catch (error) {
            if (error !== cancellation) {
              throw error;
            }
            cancelled = true;
          }
        } finally {
          validation.mockRestore();
        }
      } else {
        refusal = demand(requested, anchor).kind === "unresolved";
      }
      expect({ cancelled, refusal }).toEqual({ cancelled: invalidation === "cancellation", refusal: invalidation !== "cancellation" });
      expect(program.sources === sources).toBe(true);
      expect(sources.has(barrel)).toBe(false);
      expect(program.byCall === calls).toBe(true);
      expect(program.callableProofEpoch?.().referenceRevision).toBe(before);
    } finally {
      endReferencePass();
      passObservation.mockRestore();
    }
  });
}

for (const invalidation of ["mutation", "forget"] as const) {
  test(`native reference source participation invalidates after admitted barrel ${invalidation}`, () => {
    const { barrel, consumer, call, binding } = sparseBarrelProject();
    beginReferencePass();
    try {
      const observed = observeCallReturns([call], consumer.getDescendants(), { suppliedCallableTargets: true });
      const program = observed.programs[0];
      const reference = nativeReferenceNodes(binding).find((node) => node.getSourceFile() === barrel);
      if (program?.demandReferenceSource === undefined || reference === undefined) {
        throw new Error("the native reference capture service is unavailable");
      }
      expect(program.demandReferenceSource(reference, binding).kind).toBe("resolved");
      const revision = program.callableProofEpoch?.().referenceRevision;
      const calls = program.byCall;
      expect(program.demandReferenceSource(reference, binding).kind).toBe("resolved");
      expect(program.callableProofEpoch?.().referenceRevision).toBe(revision);
      expect(program.byCall === calls).toBe(true);
      if (invalidation === "mutation") {
        barrel.replaceWithText("export {chosen as renamed} from './chosen';export const changed=1;");
      } else {
        barrel.forget();
      }
      const result = readAuthoredCallableSources(call.getExpression(), (candidate) => program.byCall.has(candidate.compilerNode), observed);
      expect(result.kind).toBe("unresolved");
      expect(result.kind === "unresolved" ? result.reason : undefined).toBe("unsupported");
    } finally {
      endReferencePass();
    }
  });
}

for (const readonly of [false, true]) {
  for (const scenario of [
    { name: "unused supplied sibling", extra: "", supplied: true, factory: false, resolved: true },
    { name: "escaped supplied sibling", extra: "escape(other);", supplied: true, factory: false, resolved: false },
    { name: "escaped supplied sibling const alias", extra: "const alias=other;escape(alias);", supplied: true, factory: false, resolved: false },
    { name: "escaped nonsupplied sibling", extra: "escape(other);", supplied: false, factory: false, resolved: false },
    { name: "recursive supplied carrier", extra: "create(ctx,other);", supplied: true, factory: false, resolved: false },
    { name: "two unused same-body factory instances", extra: "", supplied: true, factory: true, resolved: true },
    { name: "escaped same-body factory instance", extra: "escape(other);", supplied: true, factory: true, resolved: false },
    { name: "escaped same-body factory instance const alias", extra: "const alias=other;escape(alias);", supplied: true, factory: true, resolved: false },
    { name: "returned carrier alias", extra: "", supplied: true, factory: true, returnedAlias: true, resolved: false },
    { name: "factory-local other record escape", extra: "", supplied: true, factory: true, localEscape: true, resolved: false },
  ] as const) {
    test(`${readonly ? "readonly" : "raw"} selected descriptor closure retains ${scenario.name}`, () => {
      const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
      const source = project.createSourceFile(
        "/repo/producer.ts",
        `
        declare function escape(value:object):void;
        function chosen(){return 1;}
        function create(ctx:{settle:()=>number;payload:object}${scenario.supplied ? ",other:{settle:()=>number}" : ""}){
          const {payload}=ctx;escape(payload);${scenario.extra}return ctx.settle();
        }
        ${scenario.factory ? `function make(){${"localEscape" in scenario ? "const local={settle:chosen};escape(local);" : ""}${"returnedAlias" in scenario ? "const returned={settle:chosen,payload:{}};return returned;" : "return {settle:chosen,payload:{}};"}}const context=make();const other=make();` : "const context={settle:chosen,payload:{}};const other={settle:chosen};"}
        create(context${scenario.supplied ? ",other" : ""});
        `,
      );
      const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
      const selected = calls.find((call) => call.getExpression().getText() === "ctx.settle");
      if (selected === undefined) {
        throw new Error("the selected descriptor invocation is missing");
      }
      if (readonly) {
        beginReferencePass();
      }
      try {
        const observations = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
        const targets = queriedTargets(selected, observations);
        expect(targets.kind, compactionTargetDescription(targets)).toBe(scenario.resolved ? "resolved" : "unresolved");
        const chosen = source.getFunctionOrThrow("chosen");
        expect(targets.kind === "resolved" && targets.value.length > 0 && targets.value.every((target) => target.compilerNode === chosen.compilerNode)).toBe(
          scenario.resolved,
        );
      } finally {
        if (readonly) {
          endReferencePass();
        }
      }
    });
  }
}

for (const readonly of [false, true]) {
  for (const scenario of [
    { name: "overridden descriptor", expression: "{settle:()=>1,...{settle:()=>2}}", expected: ["()=>2"] },
    { name: "absent spread inherits earlier descriptor", expression: "{settle:()=>1,...(choose?{settle:()=>2}:{})}", expected: ["()=>1", "()=>2"] },
  ] as const) {
    test(`${readonly ? "readonly" : "raw"} selected descriptor provenance retains ${scenario.name}`, () => {
      const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
      const source = project.createSourceFile(
        "/repo/producer.ts",
        `declare const choose:boolean;function create(ctx:{settle:()=>number}){return ctx.settle();}
        const context=${scenario.expression};create(context);`,
      );
      const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
      const selected = calls.find((call) => call.getExpression().getText() === "ctx.settle");
      if (selected === undefined) {
        throw new Error("the selected provenance invocation is missing");
      }
      const expected = scenario.expected.map((text) => source.getDescendantsOfKind(SyntaxKind.ArrowFunction).find((node) => node.getText() === text));
      if (readonly) {
        beginReferencePass();
      }
      try {
        const observations = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
        const origins = readAuthoredCallableSources(selected.getExpression(), undefined, observations);
        expect(origins.kind).toBe("resolved");
        expect(origins.kind === "resolved" ? origins.value.length : 0).toBe(expected.length);
        expect(origins.kind === "resolved" && expected.every((node) => origins.value.some((origin) => origin.value.compilerNode === node?.compilerNode))).toBe(
          true,
        );
        expect(
          origins.kind === "resolved" &&
            origins.value.every(
              (origin) => origin.selectedDescriptors?.length === 1 && origin.selectedDescriptors[0]?.value.compilerNode === origin.value.compilerNode,
            ),
        ).toBe(true);
      } finally {
        if (readonly) {
          endReferencePass();
        }
      }
    });
  }
  test(`${readonly ? "readonly" : "raw"} selected descriptor provenance retains each factory's actual binding`, () => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
    const source = project.createSourceFile(
      "/repo/producer.ts",
      `declare const choose:boolean;function create(ctx:{settle:()=>number}){return ctx.settle();}
      function make(marker:number){return {settle:()=>marker};}
      const context=choose?make(1):make(2);create(context);`,
    );
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const selected = calls.find((call) => call.getExpression().getText() === "ctx.settle");
    const actuals = calls.filter((call) => call.getExpression().getText() === "make").map((call) => call.getArguments()[0]);
    const make = source.getFunctionOrThrow("make");
    const parameter = make.getParameters()[0];
    const descriptor = make.getDescendantsOfKind(SyntaxKind.PropertyAssignment)[0]?.getInitializer();
    if (selected === undefined || parameter === undefined || descriptor === undefined || actuals.length !== 2) {
      throw new Error("the two actual descriptor allocations are missing");
    }
    if (readonly) {
      beginReferencePass();
    }
    try {
      const observations = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
      const origins = readAuthoredCallableSources(selected.getExpression(), undefined, observations);
      expect(origins.kind).toBe("resolved");
      const allocations =
        origins.kind === "resolved"
          ? origins.value.flatMap((origin) => origin.selectedDescriptors ?? []).filter((hop) => hop.value.compilerNode === descriptor.compilerNode)
          : [];
      expect(allocations.length).toBe(2);
      expect(actuals.map((actual) => allocations.filter((hop) => hop.bindings.get(parameter)?.compilerNode === actual?.compilerNode).length)).toEqual([1, 1]);
    } finally {
      if (readonly) {
        endReferencePass();
      }
    }
  });
}

const COMPACTION_BINDING_CASES = [
  { name: "direct member baseline", binding: "const compactionInFlight=deps.compactionInFlight;", extra: "", value: "", resolved: true },
  { name: "actual disjoint shorthand", binding: "", extra: "", value: "", resolved: true },
  { name: "renamed disjoint data", binding: "const {compactionInFlight:running}=deps;", extra: "", value: "rename", resolved: true },
  { name: "selected write", binding: "", extra: "deps.recallMemory=()=>({});", value: "", resolved: false },
  { name: "selected alias write", binding: "", extra: "const alias=deps;alias.recallMemory=()=>({});", value: "", resolved: false },
  { name: "receiver escape", binding: "", extra: "escape(deps);", value: "", resolved: false },
  { name: "receiver alias escape", binding: "", extra: "const alias=deps;escape(alias);", value: "", resolved: false },
  { name: "selected callable escape", binding: "", extra: "const {recallMemory:copy}=deps;escape(copy);", value: "", resolved: false },
  { name: "hidden callable alias", binding: "", extra: "escape(compactionInFlight);", value: "deps.recallMemory", resolved: false },
  { name: "hidden receiver alias", binding: "", extra: "escape(compactionInFlight);", value: "deps", resolved: false },
  { name: "hidden named callable alias", binding: "", extra: "escape(compactionInFlight);", value: "recallMemory", resolved: false },
  {
    name: "direct hidden named callable alias",
    binding: "const compactionInFlight=deps.compactionInFlight;",
    extra: "escape(compactionInFlight);",
    value: "recallMemory",
    resolved: false,
  },
  { name: "reassigned hidden named callable alias", binding: "", extra: "escape(compactionInFlight);", value: "holder", resolved: false },
  {
    name: "direct reassigned hidden named callable alias",
    binding: "const compactionInFlight=deps.compactionInFlight;",
    extra: "escape(compactionInFlight);",
    value: "holder",
    resolved: false,
  },
  { name: "hidden selected containing receiver", binding: "", extra: "escape(compactionInFlight);", value: "context", resolved: false },
  {
    name: "direct hidden selected containing receiver",
    binding: "const compactionInFlight=deps.compactionInFlight;",
    extra: "escape(compactionInFlight);",
    value: "context",
    resolved: false,
  },
  { name: "defaulted data", binding: "const {compactionInFlight=new Set<ChatId>()}=deps;", extra: "", value: "", resolved: false },
  { name: "rest receiver", binding: "const {compactionInFlight,...rest}=deps;", extra: "escape(rest);", value: "", resolved: false },
  { name: "computed data", binding: 'const key="compactionInFlight";const {[key]:compactionInFlight}=deps;', extra: "", value: "", resolved: false },
  { name: "getter data", binding: "", extra: "", value: "getter", resolved: false },
  { name: "opaque receiver alternative", binding: "", extra: "", value: "opaque", resolved: false },
  { name: "unsafe first factory instance", binding: "", extra: "", value: "first", resolved: false },
  { name: "all safe factory instances", binding: "", extra: "", value: "both", resolved: true },
] as const;

type CompactionBindingCase = (typeof COMPACTION_BINDING_CASES)[number];

function compactionOwnedStatement(value: CompactionBindingCase["value"], ordinary: string): string {
  switch (value) {
    case "getter":
      return "const owned={...deps,get compactionInFlight(){deps.recallMemory=()=>({});return new Set<ChatId>();}};";
    case "opaque":
      return "const owned=choose?{...deps,compactionInFlight:new Set<ChatId>()}:foreign;";
    case "deps":
    case "deps.recallMemory":
    case "recallMemory":
    case "context":
    case "holder":
      return `const owned={...deps,compactionInFlight:${value}};`;
    case "":
    case "first":
    case "rename":
    case "both":
      return ordinary;
  }
}

function compactionFixtureSource(project: Project, actual: Awaited<ReturnType<typeof actualCompactionBinding>>, scenario: CompactionBindingCase): SourceFile {
  const binding = scenario.binding || actual.binding;
  const operations = ["deps", "deps.recallMemory", "recallMemory", "context", "holder"].some((value) => value === scenario.value)
    ? ""
    : actual.operations.replaceAll("compactionInFlight", scenario.value === "rename" ? "running" : "compactionInFlight");
  const owned = compactionOwnedStatement(scenario.value, actual.owned);
  const instances =
    scenario.value === "first" || scenario.value === "both"
      ? `const first={recallMemory};const second={recallMemory};createTurnEngine(context,first);${scenario.value === "first" ? "first.recallMemory=()=>({});" : ""}createTurnEngine(context,second);`
      : "createChatService(context);";
  const service =
    scenario.value === "first" || scenario.value === "both" ? "" : "function createChatService(ctx:Context){return createTurnEngine(ctx,{recallMemory});}";
  return project.createSourceFile(
    "/repo/producer.ts",
    `
        type ChatId=string;type Context={db:object;settle:()=>number};type Deps={recallMemory:(ctx:Context)=>object};
        type OwnedEngineDeps=Deps&{compactionInFlight:${["recallMemory", "context", "holder"].some((value) => value === scenario.value) ? "object" : "Set<ChatId>"}};
        declare function escape(value:object):void;declare const choose:boolean;declare const foreign:OwnedEngineDeps;
        function recallMemory(ctx:Context){return ctx.db;}
        ${scenario.value === "holder" ? "let holder:object={};holder=recallMemory;" : ""}
        function resolveSpeakerMemory(ctx:Context,deps:Deps){return deps.recallMemory(ctx);}
        function runPreTurnCompaction(ctx:Context,deps:OwnedEngineDeps,prep:{chatId:ChatId}){
          const chatId=prep.chatId;${binding}${scenario.extra}${operations}
        }
        function createTurnEngine(ctx:Context,deps:Deps){
          ${owned}runPreTurnCompaction(ctx,owned,{chatId:"room"});resolveSpeakerMemory(ctx,owned);return ctx.settle();
        }
        ${service}
        const context={db:{},settle:()=>1};${instances}
      `,
  );
}

function compactionTargetDescription(targets: ReturnType<typeof queriedTargets>): string {
  return JSON.stringify(
    targets.kind === "resolved" ? targets.kind : { kind: targets.kind, detail: targets.detail, node: targets.node.getText().slice(0, 240) },
  );
}

function expectCompactionAllocations(
  source: SourceFile,
  dependency: CallExpression,
  observations: CallReturnObservations,
  factoryArguments: readonly (import("ts-morph").Node | undefined)[],
): void {
  const program = observations.programs[0];
  const authored =
    factoryArguments.length > 0
      ? readAuthoredCallableSources(dependency.getExpression(), (call) => program?.byCall.has(call.compilerNode) === true, observations)
      : undefined;
  const parameter = source.getFunctionOrThrow("createTurnEngine").getParameters()[1];
  const actualAllocations =
    authored?.kind === "resolved"
      ? authored.value.map((value) => {
          const supplied = parameter === undefined ? undefined : value.bindings.get(parameter);
          return factoryArguments.findIndex((argument) => argument !== undefined && argument.compilerNode === supplied?.compilerNode);
        })
      : [];
  expect(actualAllocations.toSorted((left, right) => left - right)).toEqual(factoryArguments.map((_argument, index) => index));
}

function expectCompactionTargets(
  source: SourceFile,
  calls: readonly CallExpression[],
  inputs: {
    readonly dependency: CallExpression;
    readonly selected: CallExpression;
    readonly observations: CallReturnObservations;
    readonly resolved: boolean;
    readonly dependencyResolved: boolean;
  },
): { readonly dependency: string; readonly selected: string } {
  const { dependency, selected, observations, resolved, dependencyResolved } = inputs;
  const dependencyTargets = queriedTargets(dependency, observations);
  const selectedTargets = queriedTargets(selected, observations);
  expect(
    { dependency: dependencyTargets.kind, selected: selectedTargets.kind },
    JSON.stringify({ dependency: compactionTargetDescription(dependencyTargets), selected: compactionTargetDescription(selectedTargets) }),
  ).toEqual({ dependency: dependencyResolved ? "resolved" : "unresolved", selected: resolved ? "resolved" : "unresolved" });
  const factoryArguments = dependencyResolved
    ? calls.filter((call) => call.getExpression().getText() === "createTurnEngine").map((call) => call.getArguments()[1])
    : [];
  const actualDeclaration = source.getFunctionOrThrow("recallMemory");
  expect(dependencyTargets.kind === "resolved" ? dependencyTargets.value.map((target) => target.compilerNode === actualDeclaration.compilerNode) : []).toEqual(
    factoryArguments.map(() => true),
  );
  const context = source.getVariableDeclarationOrThrow("context").getInitializerOrThrow().asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
  const suppliedSettle = context
    .getPropertyOrThrow("settle")
    .asKindOrThrow(SyntaxKind.PropertyAssignment)
    .getInitializerOrThrow()
    .asKindOrThrow(SyntaxKind.ArrowFunction);
  expect(selectedTargets.kind === "resolved" ? selectedTargets.value.map((target) => target.compilerNode === suppliedSettle.compilerNode) : []).toEqual(
    resolved ? factoryArguments.map(() => true) : [],
  );
  expectCompactionAllocations(source, dependency, observations, factoryArguments);
  return { dependency: dependencyTargets.kind, selected: selectedTargets.kind };
}

for (const readonly of [false, true]) {
  for (const scenario of COMPACTION_BINDING_CASES) {
    test(`${readonly ? "readonly" : "raw"} source-derived compaction binding retains ${scenario.name}`, async ({ repoRoot }) => {
      const project = new Project({ useInMemoryFileSystem: true });
      const actual = await actualCompactionBinding(project, repoRoot);
      const source = compactionFixtureSource(project, actual, scenario);
      const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
      const dependency = calls.find((call) => call.getExpression().getText() === "deps.recallMemory");
      const selected = calls.find((call) => call.getExpression().getText() === "ctx.settle");
      if (dependency === undefined || selected === undefined) {
        throw new Error("the actual dependency and selected context invocations are missing");
      }
      if (readonly) {
        beginReferencePass();
      }
      try {
        const observations = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
        const dependencyResolved = scenario.resolved || scenario.value === "context";
        expect(expectCompactionTargets(source, calls, { dependency, selected, observations, resolved: scenario.resolved, dependencyResolved })).toEqual({
          dependency: dependencyResolved ? "resolved" : "unresolved",
          selected: scenario.resolved ? "resolved" : "unresolved",
        });
      } finally {
        if (readonly) {
          endReferencePass();
        }
      }
    });
  }
}

test("one callable proof shares repeated complete containing obligations without skipping its result", () => {
  const counts = [1, 8].map((reads) => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
    const source = project.createSourceFile(
      "/repeated.ts",
      `function selected(){return 1;}function invoke(deps:{selected:()=>number;data:object}){${"deps.data;".repeat(reads)}return deps.selected();}const deps={selected,data:{}};invoke(deps);`,
    );
    const call = source.getFunctionOrThrow("invoke").getDescendantsOfKind(SyntaxKind.CallExpression)[0];
    const first = source.getFunctionOrThrow("invoke").getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)[0]?.getExpression();
    if (call === undefined || first === undefined) {
      throw new Error("the repeated native containing-use control is missing");
    }
    beginReferencePass();
    try {
      const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants(), { suppliedCallableTargets: true });
      const visits = vi.spyOn(first, "getAncestors");
      try {
        const target = readAuthoredCallableSources(call.getExpression(), undefined, observed);
        expect(target.kind === "resolved" && target.value.length === 1 && target.value[0]?.value === source.getFunctionOrThrow("selected")).toBe(true);
        return visits.mock.calls.length;
      } finally {
        visits.mockRestore();
      }
    } finally {
      endReferencePass();
    }
  });
  expect(counts[0]).toBeGreaterThan(0);
  expect(counts[1]).toBe(counts[0]);
});

test("opaque outer admission reaches structured inner refinement without changing the callback", () => {
  const counts = [1, 8].map((reads) => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
    const source = project.createSourceFile(
      "/nested.ts",
      `function selected(){return 1;}type Context={selected:()=>number};function consume(ctx:Context){return ctx.selected();}function outer(deps:{invoke:(ctx:Context)=>number;data:object},ctx:Context){${"deps.data;".repeat(reads)}deps["invoke"](ctx);return ctx.selected();}outer({invoke:consume,data:{}},{selected});`,
    );
    const call = source
      .getFunctionOrThrow("outer")
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .find((value) => value.getExpression().getText() === "ctx.selected");
    const first = source.getFunctionOrThrow("outer").getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)[0]?.getExpression();
    if (call === undefined || first === undefined) {
      throw new Error("the opaque-to-native refinement fixture is missing");
    }
    beginReferencePass();
    try {
      const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants(), { suppliedCallableTargets: true });
      const program = observed.programs[0];
      if (program === undefined) {
        throw new Error("the native capture is missing");
      }
      let opaqueCalls = 0;
      let refinedVisits = 0;
      const original = first.getAncestors.bind(first);
      const previousLimit = Error.stackTraceLimit;
      Error.stackTraceLimit = 100;
      const visits = vi.spyOn(first, "getAncestors").mockImplementation(() => {
        if (new Error("refinement computation observer").stack?.includes("refinedObservation") === true) {
          refinedVisits++;
        }
        return original();
      });
      try {
        const target = readAuthoredCallableSources(
          call.getExpression(),
          (candidate) => {
            opaqueCalls++;
            return program.byCall.has(candidate.compilerNode);
          },
          observed,
        );
        expect(target.kind === "resolved" && target.value.length === 1 && target.value[0]?.value === source.getFunctionOrThrow("selected")).toBe(true);
        expect(opaqueCalls).toBeGreaterThan(0);
        expect(program.callableContext?.demandRevision).toBeGreaterThan(0);
        expect(refinedVisits).toBeGreaterThan(0);
        return refinedVisits;
      } finally {
        visits.mockRestore();
        Error.stackTraceLimit = previousLimit;
      }
    } finally {
      endReferencePass();
    }
  });
  expect(counts[1]).toBe(counts[0]);
});

function repeatedCallableControl(reads = 8): {
  readonly project: Project;
  readonly source: SourceFile;
  readonly call: CallExpression;
  readonly first: import("ts-morph").Node;
} {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const source = project.createSourceFile(
    "/repeated-control.ts",
    `function selected(){return 1;}function invoke(deps:{selected:()=>number;data:object}){${"deps.data;".repeat(reads)}return deps.selected();}const deps={selected,data:{}};invoke(deps);`,
  );
  const call = source.getFunctionOrThrow("invoke").getDescendantsOfKind(SyntaxKind.CallExpression)[0];
  const first = source.getFunctionOrThrow("invoke").getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)[0]?.getExpression();
  if (call === undefined || first === undefined) {
    throw new Error("the repeated callable control is missing");
  }
  return { project, source, call, first };
}

test("opaque admission retains descendant computation and every callback invocation", () => {
  const counts = [1, 8].map((reads) => {
    const { source, call, first } = repeatedCallableControl(reads);
    beginReferencePass();
    try {
      const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants(), { suppliedCallableTargets: true });
      let callbacks = 0;
      const visits = vi.spyOn(first, "getAncestors");
      try {
        const target = readAuthoredCallableSources(
          call.getExpression(),
          () => {
            callbacks++;
            return true;
          },
          observed,
        );
        expect(target.kind === "resolved" && target.value[0]?.value === source.getFunctionOrThrow("selected")).toBe(true);
        return { visits: visits.mock.calls.length, callbacks };
      } finally {
        visits.mockRestore();
      }
    } finally {
      endReferencePass();
    }
  });
  expect(counts[0]?.callbacks).toBeGreaterThan(0);
  expect(counts[1]?.callbacks).toBeGreaterThan(counts[0]?.callbacks ?? 0);
  expect(counts[1]?.visits).toBeGreaterThan(counts[0]?.visits ?? 0);
});

test("completed callable obligations release their owned maps before a second evaluation", () => {
  const { source, call, first } = repeatedCallableControl();
  const names = new Set(source.getDescendantsOfKind(SyntaxKind.Identifier));
  beginReferencePass();
  try {
    const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants(), { suppliedCallableTargets: true });
    const writes = vi.spyOn(Map.prototype, "set");
    const visits = vi.spyOn(first, "getAncestors");
    try {
      const counts = [0, 1].map(() => {
        writes.mockClear();
        visits.mockClear();
        const target = readAuthoredCallableSources(call.getExpression(), undefined, observed);
        expect(target.kind === "resolved" && target.value[0]?.value === source.getFunctionOrThrow("selected")).toBe(true);
        const owned = writes.mock.calls.flatMap(([key, value], index) => (names.has(key) && Array.isArray(value) ? [writes.mock.contexts[index]] : []));
        expect(owned.length).toBeGreaterThan(0);
        expect(owned.every((map) => map instanceof Map && map.size === 0)).toBe(true);
        return visits.mock.calls.length;
      });
      expect(counts[0]).toBeGreaterThan(0);
      expect(counts[1]).toBe(counts[0]);
    } finally {
      writes.mockRestore();
      visits.mockRestore();
    }
  } finally {
    endReferencePass();
  }
});

for (const change of ["cancellation", "source replacement", "compiler options", "forgotten source"] as const) {
  test(`a completed callable obligation checks ${change} and releases on throw`, () => {
    const { project, source, call } = repeatedCallableControl();
    const names = new Set(source.getDescendantsOfKind(SyntaxKind.Identifier));
    const service = project.getLanguageService().compilerObject;
    const create = service.createReadonlyReferencePass.bind(service);
    const writes = vi.spyOn(Map.prototype, "set");
    let armed = false;
    let cancelled = false;
    const invalidate = {
      cancellation: (): void => {
        throw new ts.OperationCanceledException();
      },
      "source replacement": (): void => {
        source.replaceWithText(source.getFullText() + "const changed=1;");
      },
      "compiler options": (): void => {
        project.compilerOptions.set({ strict: true });
      },
      "forgotten source": (): void => {
        source.forget();
      },
    }[change];
    const observation = vi.spyOn(service, "createReadonlyReferencePass").mockImplementation(() => {
      const pass = create();
      const find = pass.findReferences.bind(pass);
      vi.spyOn(pass, "findReferences").mockImplementation((file, position, options) => {
        const stack = new Error("native completion admission observer").stack ?? "";
        const closed = stack.indexOf("at callableClosedUses");
        const computing = stack.indexOf("at computeCallableClosedUses");
        if (armed && closed >= 0 && (computing < 0 || closed < computing)) {
          cancelled = true;
          armed = false;
          invalidate();
        }
        return find(file, position, options);
      });
      return pass;
    });
    beginReferencePass();
    try {
      const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants(), { suppliedCallableTargets: true });
      writes.mockClear();
      armed = true;
      expect(() => readAuthoredCallableSources(call.getExpression(), undefined, observed)).toThrow();
      expect(cancelled).toBe(true);
      const owned = writes.mock.calls.flatMap(([key, value], index) => (names.has(key) && Array.isArray(value) ? [writes.mock.contexts[index]] : []));
      expect(owned.length).toBeGreaterThan(0);
      expect(owned.every((map) => map instanceof Map && map.size === 0)).toBe(true);
    } finally {
      endReferencePass();
      observation.mockRestore();
      writes.mockRestore();
    }
  });
}

for (const revision of ["referenceRevision", "demandRevision", "directRevision", "settledDemandRevision", "dependencyOwner"] as const) {
  test(`completed callable sharing observes the capture's ${revision} without changing its result`, () => {
    const counts = [false, true].map((changing) => {
      const { source, call, first } = repeatedCallableControl();
      beginReferencePass();
      try {
        const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants(), { suppliedCallableTargets: true });
        const program = observed.programs[0];
        if (program?.callableProofEpoch === undefined) {
          throw new Error("the native callable proof epoch is missing");
        }
        const readEpoch = program.callableProofEpoch.bind(program);
        let advances = 0;
        const change = changing
          ? vi.spyOn(program, "callableProofEpoch").mockImplementation(() => {
              const epoch = readEpoch();
              return revision === "dependencyOwner" ? { ...epoch, dependencyOwner: {} } : { ...epoch, [revision]: epoch[revision] + advances++ };
            })
          : undefined;
        const visits = vi.spyOn(first, "getAncestors");
        try {
          const target = readAuthoredCallableSources(call.getExpression(), undefined, observed);
          expect(target.kind === "resolved" && target.value[0]?.value === source.getFunctionOrThrow("selected")).toBe(true);
          return visits.mock.calls.length;
        } finally {
          visits.mockRestore();
          change?.mockRestore();
        }
      } finally {
        endReferencePass();
      }
    });
    expect(counts[0]).toBeGreaterThan(0);
    expect(counts[1]).toBeGreaterThan(counts[0] ?? 0);
  });
}

for (const unsafe of [false, true]) {
  test(`one shared formal keeps ${unsafe ? "changed unsafe" : "equivalent safe"} allocation bindings distinct`, () => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
    const source = project.createSourceFile(
      "/bindings.ts",
      `function selected(){return 1;}function inspect(deps:{selected:()=>number;data:object}){deps.data;}function invoke(deps:{selected:()=>number;data:object}){inspect(deps);return deps.selected();}const first={selected,data:{}};const second={selected,${unsafe ? "get data(){return {}; }" : "data:{}"}};invoke(first);invoke(second);`,
    );
    const call = source
      .getFunctionOrThrow("invoke")
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .find((candidate) => candidate.getExpression().getText() === "deps.selected");
    if (call === undefined) {
      throw new Error("the shared allocation invocation is missing");
    }
    beginReferencePass();
    try {
      const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants(), { suppliedCallableTargets: true });
      const target = readAuthoredCallableSources(call.getExpression(), undefined, observed);
      expect(target.kind).toBe(unsafe ? "unresolved" : "resolved");
      expect(
        target.kind === "resolved" && target.value.length > 0 && target.value.every((origin) => origin.value === source.getFunctionOrThrow("selected")),
      ).toBe(!unsafe);
    } finally {
      endReferencePass();
    }
  });
}

test("different actual binding contents recompute a shared native formal even when both uses are safe", () => {
  const counts = [1, 2].map((calls) => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
    const source = project.createSourceFile(
      "/binding-contents.ts",
      `function selected(){return 1;}function inspect(deps:{selected:()=>number;data:object},tag:number){deps.data;}function invoke(deps:{selected:()=>number;data:object}){inspect(deps,1);${calls === 2 ? "inspect(deps,2);" : ""}return deps.selected();}const deps={selected,data:{}};invoke(deps);`,
    );
    const call = source
      .getFunctionOrThrow("invoke")
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .find((candidate) => candidate.getExpression().getText() === "deps.selected");
    const first = source.getFunctionOrThrow("inspect").getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)[0]?.getExpression();
    if (call === undefined || first === undefined) {
      throw new Error("the distinct native binding context is missing");
    }
    beginReferencePass();
    try {
      const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants(), { suppliedCallableTargets: true });
      const visits = vi.spyOn(first, "getAncestors");
      try {
        const target = readAuthoredCallableSources(call.getExpression(), undefined, observed);
        expect(target.kind === "resolved" && target.value[0]?.value === source.getFunctionOrThrow("selected")).toBe(true);
        return visits.mock.calls.length;
      } finally {
        visits.mockRestore();
      }
    } finally {
      endReferencePass();
    }
  });
  expect(counts[0]).toBeGreaterThan(0);
  expect(counts[1]).toBeGreaterThan(counts[0] ?? 0);
});

for (const effects of [
  { body: "deps.selected=()=>2;escape(deps);", reason: "write" },
  { body: "escape(deps);deps.selected=()=>2;", reason: "missing" },
] as const) {
  test(`callable completion sharing preserves the first ${effects.reason} refusal`, () => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
    const source = project.createSourceFile(
      "/refusal-order.ts",
      `declare function escape(value:object):void;function selected(){return 1;}function invoke(deps:{selected:()=>number;data:object}){deps.data;deps.data;${effects.body}return deps.selected();}const deps={selected,data:{}};invoke(deps);`,
    );
    const call = source
      .getFunctionOrThrow("invoke")
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .find((candidate) => candidate.getExpression().getText() === "deps.selected");
    if (call === undefined) {
      throw new Error("the ordered refusal invocation is missing");
    }
    beginReferencePass();
    try {
      const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants(), { suppliedCallableTargets: true });
      const target = readAuthoredCallableSources(call.getExpression(), undefined, observed);
      const original = readAuthoredCallableSources(call.getExpression(), () => true, observed);
      expect(target.kind).toBe("unresolved");
      expect(original.kind).toBe("unresolved");
      if (target.kind !== "unresolved" || original.kind !== "unresolved") {
        throw new Error(`expected matching refusals, got ${target.kind}/${original.kind}`);
      }
      expect(target.reason).toBe(effects.reason);
      expect([target.reason, target.detail]).toEqual([original.reason, original.detail]);
      expect(target.node.compilerNode === original.node.compilerNode).toBe(true);
      expect(target.trace.declarations.length).toBe(original.trace.declarations.length);
      expect(target.trace.declarations.every((node, index) => node === original.trace.declarations[index])).toBe(true);
    } finally {
      endReferencePass();
    }
  });
}

test("an optional containing callback permits the actual recall recorder conditional spread", async ({ repoRoot }) => {
  const project = new Project({ useInMemoryFileSystem: true });
  const base = "packages/server/src/domain/chat";
  const producer = project.createSourceFile(
    `/repo/${base}/memory/recall/recorder.ts`,
    await readFile(join(repoRoot, base, "memory/recall/recorder.ts"), "utf8"),
  );
  project.createSourceFile(`/repo/${base}/memory/types.ts`, await readFile(join(repoRoot, base, "memory/types.ts"), "utf8"));
  project.createSourceFile(`/repo/${base}/contract/memory.ts`, await readFile(join(repoRoot, base, "contract/memory.ts"), "utf8"));
  const composition = project.createSourceFile("/composition.ts", await readFile(join(repoRoot, "packages/server/src/entry/compose/chat.ts"), "utf8"));
  const spreads = composition
    .getDescendantsOfKind(SyntaxKind.SpreadAssignment)
    .filter((candidate) => candidate.getExpression().getText().startsWith("(input.recallRecorder"));
  expect(spreads.length).toBe(1);
  const spread = spreads[0]?.getText();
  if (spread === undefined) {
    throw new Error("the production recall recorder spread is missing");
  }
  project.removeSourceFile(composition);
  const source = project.createSourceFile(
    "/repo/consumer.ts",
    `import {createMemoryRecallRecorder} from "./${base}/memory/recall/recorder.ts";
    function settle(){return 1;}
    function consume(ctx:{settle:()=>number;recordRecall?:(record:object)=>void}){ctx.recordRecall?.({});return ctx.settle();}
    function compose(input:{recallRecorder?:ReturnType<typeof createMemoryRecallRecorder>}){const ctx={settle,${spread}};consume(ctx);}
    const recorder=createMemoryRecallRecorder({now:()=>0});compose({recallRecorder:recorder});`,
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const target = calls.find((call) => call.getExpression().getText() === "ctx.settle");
  if (target === undefined) {
    throw new Error("the selected actual callback is missing");
  }
  beginReferencePass();
  try {
    const observed = observeCallReturns(calls, [...source.getDescendants(), ...producer.getDescendants()], { suppliedCallableTargets: true });
    const fact = readAuthoredCallableSources(target.getExpression(), undefined, observed);
    expect(fact.kind === "resolved" ? "resolved" : `${fact.reason}: ${fact.detail}`).toBe("resolved");
    expect(fact.kind === "resolved" && fact.value.length === 1 && fact.value[0]?.value === source.getFunctionOrThrow("settle")).toBe(true);
  } finally {
    endReferencePass();
  }
});

const OPTIONAL_CONTAINING_CASES = [
  { name: "absent own callback", properties: "", use: "ctx.recordRecall?.({});", resolved: true },
  { name: "explicit undefined callback", properties: "recordRecall:undefined,", use: "ctx.recordRecall?.({});", resolved: true },
  { name: "explicit null callback", properties: "recordRecall:null,", use: "ctx.recordRecall?.({});", resolved: true },
  { name: "conditional actual callback", properties: "...(choose?{recordRecall:(value:object)=>{}}:{}),", use: "ctx.recordRecall?.({});", resolved: true },
  { name: "literal bracket callback", properties: "", use: 'ctx["recordRecall"]?.({});', resolved: true },
  { name: "alias callback", properties: "", use: "const alias=ctx;alias.recordRecall?.({});", resolved: true },
  { name: "final absent nested callback", properties: "nested:{},", use: "ctx.nested.recordRecall?.({});", resolved: true },
  { name: "earlier absent receiver", properties: "", use: "ctx.nested.recordRecall?.({});", resolved: false },
  { name: "opaque present callback", properties: "recordRecall:foreign,", use: "ctx.recordRecall?.({});", resolved: false },
  { name: "opaque present alternative beside absence", properties: "recordRecall:choose?foreign:undefined,", use: "ctx.recordRecall?.({});", resolved: false },
  { name: "present callback containing write", properties: "recordRecall:()=>{context.settle=()=>2;},", use: "ctx.recordRecall?.({});", resolved: false },
  { name: "noncallable present value", properties: "recordRecall:7,", use: "ctx.recordRecall?.({});", resolved: false },
  { name: "getter callback", properties: "get recordRecall(){return undefined;},", use: "ctx.recordRecall?.({});", resolved: false },
  { name: "containing write", properties: "", use: "ctx.recordRecall=()=>{};ctx.recordRecall?.({});", resolved: false },
  { name: "containing escape", properties: "", use: "escape(ctx);ctx.recordRecall?.({});", resolved: false },
  { name: "opaque spread", properties: "...foreignRecord,", use: "ctx.recordRecall?.({});", resolved: false },
  { name: "ordinary missing callback", properties: "", use: "ctx.recordRecall({});", resolved: false },
  { name: "optional then required callback", properties: "", use: "ctx.recordRecall?.({});ctx.recordRecall({});", resolved: false },
] as const;
for (const scenario of OPTIONAL_CONTAINING_CASES) {
  test(`optional containing invocation retains ${scenario.name}`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile(
      "/optional.ts",
      `declare const choose:boolean;declare const foreign:(value:object)=>void;declare const foreignRecord:{recordRecall?:(value:object)=>void};declare function escape(value:object):void;function settle(){return 1;}function consume(ctx:{settle:()=>number;recordRecall?:((value:object)=>void)|null;nested?:{recordRecall?:(value:object)=>void}|null}){${scenario.use}return ctx.settle();}const context={settle,${scenario.properties}};consume(context);`,
    );
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const selected = calls.find((call) => call.getExpression().getText() === "ctx.settle");
    if (selected === undefined) {
      throw new Error("the selected containing invocation is missing");
    }
    beginReferencePass();
    try {
      const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
      const fact = readAuthoredCallableSources(selected.getExpression(), undefined, observed);
      expect(fact.kind, fact.kind === "unresolved" ? `${fact.reason}: ${fact.detail}` : "resolved").toBe(scenario.resolved ? "resolved" : "unresolved");
      expect(fact.kind === "resolved" && fact.value.length === 1 && fact.value[0]?.value === source.getFunctionOrThrow("settle")).toBe(scenario.resolved);
    } finally {
      endReferencePass();
    }
  });
}

for (const actual of ["{}", "{nested:null}"]) {
  test(`an optional callee cannot erase an earlier missing receiver in ${actual}`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile(
      "/earlier-receiver.ts",
      `function consume(ctx:{nested?:{recordRecall?:(record:object)=>void}|null}){ctx.nested.recordRecall?.({});}consume(${actual});`,
    );
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const call = calls.find((candidate) => candidate.getExpression().getText() === "ctx.nested.recordRecall");
    if (call === undefined) {
      throw new Error("the optional callee is missing");
    }
    beginReferencePass();
    try {
      const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
      expect(readCallTargets(call, undefined, observed, true).kind).toBe("unresolved");
    } finally {
      endReferencePass();
    }
  });
}

test("optional invocation keeps a definite callable identity without granting escaped argument provenance", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    "/optional-identity.ts",
    "declare function escape(value:object):void;const callback=(value:object)=>value;const actual={};escape(callback);callback?.(actual);",
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const call = calls.find((candidate) => candidate.getExpression().getText() === "callback");
  const callback = source.getVariableDeclarationOrThrow("callback").getInitializerOrThrow().asKindOrThrow(SyntaxKind.ArrowFunction);
  const parameter = callback.getParameters()[0]?.getNameNode();
  if (call === undefined || parameter === undefined) {
    throw new Error("the optional callback identity is missing");
  }
  beginReferencePass();
  try {
    const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
    const program = observed.programs[0];
    if (program === undefined) {
      throw new Error("the captured program is missing");
    }
    const target = readCallTargets(call, undefined, observed);
    expect(target.kind === "resolved" && target.value.length === 1 && target.value[0] === callback).toBe(true);
    expect(readSuppliedParameter(parameter, new Map(), program).kind).toBe("unresolved");
  } finally {
    endReferencePass();
  }
});

test("native async resource registration retains the actual callable return and containing lifetime", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { target: ts.ScriptTarget.ESNext, lib: ["lib.esnext.d.ts"] } });
  const source = project.createSourceFile(
    "/resource.ts",
    "const resources=new AsyncDisposableStack();function create(){return {read:()=>1,async [Symbol.asyncDispose](){}};}const held=resources.use(create());held.read();",
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const registration = calls.find((call) => call.getExpression().getText() === "resources.use");
  const selected = calls.find((call) => call.getExpression().getText() === "held.read");
  const expected = source.getFunctionOrThrow("create").getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
  if (registration === undefined || selected === undefined) {
    throw new Error("the real native registration is missing");
  }
  const signature = project.getTypeChecker().getResolvedSignature(registration)?.getDeclaration();
  expect(signature !== undefined && project.getProgram().compilerObject.isSourceFileDefaultLibrary(signature.getSourceFile().compilerNode)).toBe(true);
  beginReferencePass();
  try {
    const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
    const fact = readAuthoredCallableSources(selected.getExpression(), undefined, observed);
    expect(fact.kind, fact.kind === "unresolved" ? `${fact.reason}: ${fact.detail}` : "resolved").toBe("resolved");
    expect(fact.kind === "resolved" && fact.value.length === 1 && fact.value[0]?.value === expected).toBe(true);
  } finally {
    endReferencePass();
  }
});

test("native async resource registration retains the production background-work callable", async ({ repoRoot }) => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { target: ts.ScriptTarget.ESNext, lib: ["lib.esnext.d.ts", "lib.dom.d.ts"] } });
  const base = "packages/server/src/infra/tasks";
  const producer = project.createSourceFile(`/repo/${base}/background.ts`, await readFile(join(repoRoot, base, "background.ts"), "utf8"));
  project.createSourceFile(`/repo/${base}/contract/background.ts`, await readFile(join(repoRoot, base, "contract/background.ts"), "utf8"));
  const source = project.createSourceFile(
    "/repo/background-use.ts",
    `import {createBackgroundWork} from "./${base}/background.ts";const construction=new AsyncDisposableStack();const backgroundResources=new AsyncDisposableStack();construction.defer(()=>backgroundResources.disposeAsync());const background=backgroundResources.use(createBackgroundWork());background.cancel();`,
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const selected = calls.find((call) => call.getExpression().getText() === "background.cancel");
  const expected = producer
    .getDescendantsOfKind(SyntaxKind.PropertyAssignment)
    .find((property) => property.getName() === "cancel")
    ?.getInitializer();
  if (selected === undefined || expected === undefined) {
    throw new Error("the actual background-work callable is missing");
  }
  beginReferencePass();
  try {
    const observed = observeCallReturns(calls, [...source.getDescendants(), ...producer.getDescendants()], { suppliedCallableTargets: true });
    const fact = readAuthoredCallableSources(selected.getExpression(), undefined, observed);
    expect(fact.kind, fact.kind === "unresolved" ? `${fact.reason}: ${fact.detail}` : "resolved").toBe("resolved");
    expect(fact.kind === "resolved" && fact.value.length === 1 && fact.value[0]?.value === expected).toBe(true);
  } finally {
    endReferencePass();
  }
});

for (const scenario of [
  {
    name: "conditional native signal without dispatch",
    conditional: true,
    dispatch: false,
    prototype: false,
    handoff: false,
    undefinedOwn: false,
    resolved: true,
  },
  {
    name: "definite native signal with supplied dispatch",
    conditional: false,
    dispatch: true,
    prototype: false,
    handoff: false,
    undefinedOwn: false,
    resolved: true,
  },
  {
    name: "finite dispatch preserved through a local signal alias",
    conditional: true,
    dispatch: true,
    prototype: false,
    handoff: false,
    undefinedOwn: false,
    resolved: true,
  },
  {
    name: "finite dispatch preserved through a signal argument",
    conditional: true,
    dispatch: true,
    prototype: false,
    handoff: true,
    undefinedOwn: false,
    resolved: true,
  },
  {
    name: "absent native signal with an inherited getter",
    conditional: true,
    dispatch: false,
    prototype: true,
    handoff: false,
    undefinedOwn: false,
    resolved: false,
  },
  {
    name: "own undefined shadows the inherited getter",
    conditional: false,
    dispatch: false,
    prototype: true,
    handoff: false,
    undefinedOwn: true,
    resolved: true,
  },
] as const) {
  let properties = "backgroundSignal:input.backgroundSignal";
  if (scenario.undefinedOwn) {
    properties = "backgroundSignal:undefined";
  } else if (scenario.conditional) {
    properties = "...(input.backgroundSignal===undefined?{}:{backgroundSignal:input.backgroundSignal})";
  }
  test(`original callable sibling boundary: ${scenario.name}`, async () => {
    const referenceFacts = await import("../../../../tooling/src/floor/code-facts/reference-fact.ts");
    const code = `
      function background(){const controller=new AbortController();return {signal:controller.signal};}
      function consume(ctx){return ctx.settle();}
      function data(args){return args.signal;}
      function engine(ctx){${scenario.handoff ? "data({signal:ctx.backgroundSignal});" : "const signal=ctx.backgroundSignal;"}return consume(ctx);}
      function compose(input){const ctx={settle:()=>1,${properties}};return engine(ctx);}
      ${
        scenario.dispatch
          ? `
      const modes={local:()=>true};
      function selectMode(deps){const {authConfig={mode:"local"}}=deps;void deps.timers;return authConfig.mode;}
      function dispatch(mode){return modes[mode]();}
      const authConfig={mode:"local"};const mode=selectMode({authConfig});dispatch(mode);
      `
          : ""
      }
      ${scenario.prototype ? "Object.defineProperty(Object.prototype,'backgroundSignal',{get(){this.settle=()=>2;return undefined;}});" : ""}
      const work=background();const answer=compose(${scenario.prototype ? "{}" : "{backgroundSignal:work.signal}"});
    `;
    expect(runInNewContext(`${code};answer;`, Object.fromEntries([["AbortController", AbortController]]))).toBe(
      scenario.prototype && !scenario.undefinedOwn ? 2 : 1,
    );
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { target: ts.ScriptTarget.ESNext, lib: ["lib.esnext.d.ts", "lib.dom.d.ts"] } });
    const source = project.createSourceFile("/original-callable-sibling.ts", code);
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const selected = calls.find((call) => call.getExpression().getText() === "ctx.settle");
    const expected = source.getFunctionOrThrow("compose").getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
    if (selected === undefined) {
      throw new Error("the selected injected callable is missing");
    }
    beginReferencePass();
    const inherited = vi.spyOn(referenceFacts, "inspectInheritedReadEffects");
    try {
      const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
      const program = observed.programs[0];
      if (program === undefined) {
        throw new Error("the actual captured native Program is missing");
      }
      inherited.mockClear();
      const fact = readAuthoredCallableSources(selected.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
      expect(
        inherited.mock.results.some(
          (result) => result.type === "return" && result.value.kind === "unresolved" && result.value.node.getText() === "modes[mode]",
        ),
      ).toBe(false);
      expect(
        fact.kind,
        fact.kind === "unresolved" ? `${fact.reason}: ${fact.detail} at ${fact.node.getText()}` : fact.value.map((value) => value.value.getText()).join(" | "),
      ).toBe(scenario.resolved ? "resolved" : "unresolved");
      expect(fact.kind === "resolved" && fact.value.length === 1 && fact.value[0]?.value === expected).toBe(scenario.resolved);
    } finally {
      inherited.mockRestore();
      endReferencePass();
    }
  });
}

test("factory-local completion retains the source-derived capability and optional signal handoff", async ({ repoRoot }) => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { target: ts.ScriptTarget.ESNext, lib: ["lib.esnext.d.ts", "lib.dom.d.ts"] } });
  const identity = project.createSourceFile("/identity-source.ts", await readFile(join(repoRoot, "packages/contracts/src/identity/index.ts"), "utf8"));
  const capability = project.createSourceFile("/capability-source.ts", await readFile(join(repoRoot, "packages/server/src/entry/auth/capability.ts"), "utf8"));
  const services = project.createSourceFile("/services-source.ts", await readFile(join(repoRoot, "packages/server/src/entry/compose/services.ts"), "utf8"));
  const owner = services.getFunctionOrThrow("createServices");
  const authConfig = owner.getDescendantsOfKind(SyntaxKind.BindingElement).find((element) => element.getName() === "authConfig");
  if (authConfig === undefined) {
    throw new Error("the actual defaulted services binding is missing");
  }
  const nativeCode = ts.transpileModule(
    `${identity.getVariableDeclarationOrThrow("MULTI_HUMAN_CAPABLE").getVariableStatementOrThrow().getText()}
     ${identity
       .getFunctionOrThrow("isMultiHumanCapable")
       .getText()
       .replace(/^export /, "")}
     ${capability
       .getFunctionOrThrow("createMultiHumanCapability")
       .getText()
       .replace(/^export /, "")}
     const env={AUTH_MODE:"local"};
     function createScopedTimers(input){return input;}
     async function createServices(deps){
       const timers=createScopedTimers(deps.timers);
       const {${authConfig.getText()}}=deps;
       ${owner.getVariableDeclarationOrThrow("authMode").getVariableStatementOrThrow().getText()}
       const settings={getEffectiveConfig:()=>({localMultiUser:true})};
       ${owner.getVariableDeclarationOrThrow("multiHumanCapable").getVariableStatementOrThrow().getText()}
       const controller=new AbortController();
       return {invoke:compose({backgroundSignal:controller.signal}),multiHumanCapable};
     }
     function compose(input){const ctx={settle:()=>1,...(input.backgroundSignal===undefined?{}:{backgroundSignal:input.backgroundSignal})};return ()=>engine(ctx);}
     function data(args){return args.signal;}
     function engine(ctx){data({signal:ctx.backgroundSignal});return ctx.settle();}
     async function boot(){const authConfig={mode:"local"};return await createServices({authConfig});}
     async function run(){const graph=await boot();graph.multiHumanCapable();return graph.invoke();}`,
    { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } },
  ).outputText;
  project.removeSourceFile(identity);
  project.removeSourceFile(capability);
  project.removeSourceFile(services);
  expect(await runInNewContext(`${nativeCode};run();`, Object.fromEntries([["AbortController", AbortController]]))).toBe(1);
  const source = project.createSourceFile("/factory-local-completion.ts", nativeCode);
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const target = calls.find((call) => call.getExpression().getText() === "ctx.settle");
  if (target === undefined) {
    throw new Error("the actual callable target is missing");
  }
  beginReferencePass();
  try {
    const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
    const program = observed.programs[0];
    if (program === undefined) {
      throw new Error("the captured factory context is missing");
    }
    const fact = readAuthoredCallableSources(target.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
    expect(fact.kind, fact.kind === "unresolved" ? `${fact.detail} at ${fact.node.getText()}` : "resolved").toBe("resolved");
    expect(fact.kind === "resolved" ? fact.value.map((leaf) => leaf.value.getText()) : []).toEqual(["() => 1"]);
  } finally {
    endReferencePass();
  }
});

test("a prior factory instance can change a later read at the same captured call site", () => {
  const code = `
    const shared={authConfig:{mode:"local"}};
    const modes={local:()=>true,oidc:()=>true};
    function dispatch(mode,config){return modes[mode](config.localMultiUser);}
    function capability(mode,readConfig){return ()=>dispatch(mode,readConfig());}
    function readConfig(){Object.defineProperty(Object.prototype,'timers',{configurable:true,get(){this.authConfig.mode='oidc';return undefined;}});return {localMultiUser:true};}
    function createServices(deps){const timers=deps.timers;const {authConfig={mode:"local"}}=deps;const authMode=authConfig.mode;return {authMode,capability:capability(authMode,readConfig)};}
    function boot(){return createServices(shared);}
    const first=boot();first.capability();const second=boot();
  `;
  expect(runInNewContext(`${code};[first.authMode,second.authMode];`)).toEqual(["local", "oidc"]);
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile("/repeated-factory-completion.ts", code);
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const owner = source.getFunctionOrThrow("createServices");
  const target = owner.getVariableDeclarationOrThrow("authMode").getInitializerOrThrow();
  beginReferencePass();
  try {
    const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
    const program = observed.programs[0];
    expect(program?.callers.get(owner.compilerNode)?.length).toBe(1);
    const fact = readReturnedValue(target, [], observed, new Set());
    expect(fact.kind).toBe("unresolved");
  } finally {
    endReferencePass();
  }
});

for (const handoff of [false, true]) {
  test(`conditional background data preserves ${handoff ? "argument handoff" : "local read"} and exact projection alternatives`, async ({ repoRoot }) => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { target: ts.ScriptTarget.ESNext, lib: ["lib.esnext.d.ts", "lib.dom.d.ts"] } });
    const base = "packages/server/src/infra/tasks";
    const producer = project.createSourceFile(`/repo/${base}/background.ts`, await readFile(join(repoRoot, base, "background.ts"), "utf8"));
    project.createSourceFile(`/repo/${base}/contract/background.ts`, await readFile(join(repoRoot, base, "contract/background.ts"), "utf8"));
    const composition = project.createSourceFile("/composition.ts", await readFile(join(repoRoot, "packages/server/src/entry/compose/chat.ts"), "utf8"));
    const spreads = composition
      .getDescendantsOfKind(SyntaxKind.SpreadAssignment)
      .filter((candidate) => candidate.getExpression().getText().startsWith("(input.backgroundSignal"));
    expect(spreads.length).toBe(1);
    const spread = spreads[0]?.getText();
    if (spread === undefined) {
      throw new Error("the production background signal spread is missing");
    }
    project.removeSourceFile(composition);
    const source = project.createSourceFile(
      "/repo/background-data.ts",
      `
    import {createBackgroundWork} from "./${base}/background.ts";
    interface Context{settle:()=>number;backgroundSignal?:AbortSignal}
    function consume(ctx:Context){return ctx.settle();}
    function generateSegments(ctx:Context,args:{signal?:AbortSignal}){return args.signal===undefined;}
    function engine(ctx:Context,deps:{generateSegments:typeof generateSegments}){${handoff ? "deps.generateSegments(ctx,{signal:ctx.backgroundSignal});" : "const signal=ctx.backgroundSignal;"}return consume(ctx);}
    function service(ctx:Context){return engine(ctx,{generateSegments});}
    function compose(input:{backgroundSignal?:AbortSignal}){const ctx={settle:()=>1,${spread}};return service(ctx);}
    const construction=new AsyncDisposableStack();const resources=new AsyncDisposableStack();construction.defer(()=>resources.disposeAsync());
    const background=resources.use(createBackgroundWork());compose({backgroundSignal:background.signal});
  `,
    );
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const target = calls.find((call) => call.getExpression().getText() === "ctx.settle");
    const signal = source.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression).find((member) => member.getText() === "ctx.backgroundSignal");
    const expected = source.getFunctionOrThrow("compose").getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
    const registration = calls.find((call) => call.getExpression().getText() === "resources.use");
    if (target === undefined || signal === undefined || registration === undefined) {
      throw new Error("the actual resource and data invocation is missing");
    }
    const native = project.getTypeChecker().getResolvedSignature(registration)?.getDeclaration();
    expect(native !== undefined && project.getProgram().compilerObject.isSourceFileDefaultLibrary(native.getSourceFile().compilerNode)).toBe(true);
    beginReferencePass();
    try {
      const references = [...source.getDescendants(), ...producer.getDescendants()];
      const observed = observeCallReturns(calls, references, { suppliedCallableTargets: true });
      const program = observed.programs[0];
      if (program === undefined) {
        throw new Error("the captured actual program is missing");
      }
      const fact = readAuthoredCallableSources(target.getExpression(), (candidate) => program.byCall.has(candidate.compilerNode), observed);
      const dataObserved = observeCallReturns(calls, references, { suppliedCallableTargets: true, nativeValueTransfers: true });
      const context = source.getFunctionOrThrow("compose").getFirstDescendantByKindOrThrow(SyntaxKind.ObjectLiteralExpression);
      const input = source.getFunctionOrThrow("compose").getParameters()[0];
      const compositionCall = calls.find((call) => call.getExpression().getText() === "compose");
      const argument = compositionCall?.getArguments()[0];
      if (input === undefined || argument === undefined) {
        throw new Error("the actual composition binding is missing");
      }
      const data = readReturnedValue(context, ["backgroundSignal"], dataObserved, {
        terminals: new Set(),
        bindings: new Map([[input, argument]]),
        nativeValueTransfers: true,
      });
      expect(data.kind, data.kind === "unresolved" ? data.detail : "resolved").toBe("resolved");
      expect(data.kind === "resolved" ? data.value.map((leaf) => ({ present: leaf.present, path: leaf.path, kind: leaf.value.getKindName() })) : []).toEqual([
        { present: true, path: ["signal"], kind: "NewExpression" },
        { present: false, path: ["backgroundSignal"], kind: "ObjectLiteralExpression" },
      ]);
      const controller = producer.getFirstDescendantByKindOrThrow(SyntaxKind.NewExpression);
      expect(data.kind === "resolved" && data.value[0]?.value === controller && data.value[1]?.value === context).toBe(true);
      expect(fact.kind, fact.kind === "unresolved" ? `${fact.reason}: ${fact.detail} at ${fact.node.getText()}` : "resolved").toBe("resolved");
      expect(fact.kind === "resolved" && fact.value.length === 1 && fact.value[0]?.value === expected).toBe(true);
    } finally {
      endReferencePass();
    }
  });
}

const OWN_DATA_RECEIVER_CASES = [
  { name: "plain own data argument", use: "consume(ctx.db);", property: "db,", target: "ctx.settle", resolved: true },
  { name: "nested own data receiver", use: "ctx.db.batch();", property: "db,", target: "ctx.settle", resolved: true },
  { name: "asserted own data receiver", use: "ctx.db!.batch();", property: "db,", target: "ctx.settle", resolved: true },
  { name: "parenthesized own data receiver", use: "(ctx.db).batch();", property: "db,", target: "ctx.settle", resolved: true },
  { name: "absent nested receiver", use: "ctx.db.batch();", property: "...(choose?{db}:{}),", target: "ctx.settle", resolved: false },
  { name: "getter nested receiver", use: "ctx.db.batch();", property: "get db(){this.settle=()=>2;return db;},", target: "ctx.settle", resolved: false },
  { name: "requested mutable-origin callee", use: "ctx.db.batch();", property: "db,", target: "ctx.db.batch", resolved: false },
] as const;
for (const scenario of OWN_DATA_RECEIVER_CASES) {
  test(`own sibling projection preserves ${scenario.name} through mutable lifecycle wiring`, async () => {
    const referenceFacts = await import("../../../../tooling/src/floor/code-facts/reference-fact.ts");
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile(
      "/lifecycle-data.ts",
      `
      interface Db{batch():void;}interface Context{db?:Db;settle:()=>number;optional?:object;}
      declare const choose:boolean;
      function consume(value:object|undefined){return value;}
      function commitHandoffSwap(ctx:Context){${scenario.use}consume({value:ctx.optional});return ctx.settle();}
      function acceptHostHandoff(ctx:Context){return commitHandoffSwap(ctx);}
      function createParticipants(ctx:Context){return acceptHostHandoff(ctx);}
      function createChatService(ctx:Context){return createParticipants(ctx);}
      function buildChatService(input:{db:Db;optional?:object}){
        const {db}=input;const chatCtx={${scenario.property}settle:()=>1,...(input.optional===undefined?{}:{optional:input.optional})};
        return createChatService(chatCtx);
      }
      function createServices(deps:{db:Db}){const {db}=deps;return buildChatService({db});}
      async function createDb():Promise<Db>{return {batch(){}};}
      function createLifecycle(){
        let db:Db|null=null;
        async function boot(){db=await createDb();return createServices({db});}
        function shutdown(){db=null;}
        return {boot,shutdown};
      }
      const lifecycle=createLifecycle();lifecycle.boot();
    `,
    );
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const target = calls.find((call) => call.getExpression().getText() === scenario.target);
    const mutable = source.getFunctionOrThrow("createLifecycle").getVariableDeclarationOrThrow("db");
    const expected = source
      .getFunctionOrThrow("buildChatService")
      .getDescendantsOfKind(SyntaxKind.ArrowFunction)
      .find((node) => node.getText() === "()=>1");
    if (target === undefined || expected === undefined) {
      throw new Error("the real selected fixture target is missing");
    }
    beginReferencePass();
    const inherited = vi.spyOn(referenceFacts, "inspectInheritedReadEffects");
    try {
      const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
      const program = observed.programs[0];
      if (program === undefined) {
        throw new Error("the captured composition program is missing");
      }
      inherited.mockClear();
      const fact = readAuthoredCallableSources(target.getExpression(), (candidate) => program.byCall.has(candidate.compilerNode), observed);
      expect(fact.kind, fact.kind === "unresolved" ? `${fact.detail} at ${fact.node.getText()}` : "resolved").toBe(
        scenario.resolved ? "resolved" : "unresolved",
      );
      expect(fact.kind === "resolved" && fact.value.length === 1 && fact.value[0]?.value === expected).toBe(scenario.resolved);
      expect(inherited.mock.calls.length > 0).toBe(scenario.resolved);
      expect(scenario.target !== "ctx.db.batch" || (fact.kind === "unresolved" && fact.reason === "write" && fact.node === mutable)).toBe(true);
    } finally {
      inherited.mockRestore();
      endReferencePass();
    }
  });
}

const CONDITIONAL_SIBLING_READ_CASES = [
  { name: "finite optional data", properties: "...(choose?{payload:{}}:{}),", use: "consume({value:ctx.payload});", effect: "", resolved: true },
  { name: "known undefined data", properties: "payload:undefined,", use: "consume({value:ctx.payload});", effect: "", resolved: true },
  { name: "absent data", properties: "", use: "consume({value:ctx.payload});", effect: "", resolved: true },
  { name: "earlier absent receiver", properties: "", use: "consume({value:ctx.payload.value});", effect: "", resolved: false },
  { name: "asserted absent receiver", properties: "", use: "consume({value:ctx.payload!.value});", effect: "", resolved: false },
  { name: "parenthesized absent receiver", properties: "", use: "consume({value:(ctx.payload).value});", effect: "", resolved: false },
  { name: "asserted type absent receiver", properties: "", use: "consume({value:(ctx.payload as object).value});", effect: "", resolved: false },
  { name: "parenthesized missing callee", properties: "", use: "(ctx.payload)();", effect: "", resolved: false },
  { name: "invoked optional data", properties: "...(choose?{payload:()=>1}:{}),", use: "ctx.payload();", effect: "", resolved: false },
  {
    name: "getter selected write",
    properties: "get payload(){this.settle=()=>2;return {};},",
    use: "consume({value:ctx.payload});",
    effect: "",
    resolved: false,
  },
  {
    name: "conditional getter",
    properties: "...(choose?{get payload(){context.settle=()=>2;return {};}}:{}),",
    use: "consume({value:ctx.payload});",
    effect: "",
    resolved: false,
  },
  {
    name: "prototype getter",
    properties: "__proto__:{get payload(){this.settle=()=>2;return {}; }},",
    use: "consume({value:ctx.payload});",
    effect: "",
    resolved: false,
  },
  {
    name: "global prototype getter",
    properties: "",
    use: "consume({value:ctx.payload});",
    effect: "Object.defineProperty(Object.prototype,'payload',{get(){this.settle=()=>2;return {};}});",
    resolved: false,
  },
  { name: "opaque spread", properties: "...foreign,", use: "consume({value:ctx.payload});", effect: "", resolved: false },
  { name: "containing escape", properties: "...(choose?{payload:{}}:{}),", use: "consume({value:ctx.payload});", effect: "leak(context);", resolved: false },
  {
    name: "containing write",
    properties: "...(choose?{payload:{}}:{}),",
    use: "consume({value:ctx.payload});",
    effect: "context.settle=()=>2;",
    resolved: false,
  },
] as const;
for (const scenario of CONDITIONAL_SIBLING_READ_CASES) {
  test(`conditional sibling data retains ${scenario.name}`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile(
      "/sibling-data.ts",
      `
      declare const choose:boolean;declare const foreign:object;declare function leak(value:object):void;
      function consume(args:{value:object|undefined}){return args.value;}
      function select(ctx:{settle:()=>number;payload?:object}){${scenario.use}return ctx.settle();}
      const context={settle:()=>1,${scenario.properties}};${scenario.effect}select(context);
    `,
    );
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const selected = calls.find((call) => call.getExpression().getText() === "ctx.settle");
    const expected = source.getVariableDeclarationOrThrow("context").getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
    if (selected === undefined) {
      throw new Error("the selected sibling call is missing");
    }
    beginReferencePass();
    try {
      const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
      const program = observed.programs[0];
      if (program === undefined) {
        throw new Error("the sibling native context is missing");
      }
      const fact = readAuthoredCallableSources(selected.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
      expect(fact.kind, fact.kind === "unresolved" ? `${fact.reason}: ${fact.detail}` : "resolved").toBe(scenario.resolved ? "resolved" : "unresolved");
      expect(fact.kind === "resolved" && fact.value.length === 1 && fact.value[0]?.value === expected).toBe(scenario.resolved);
    } finally {
      endReferencePass();
    }
  });
}

const RESOURCE_REGISTRATION_CASES = [
  {
    name: "constructor alias",
    setup: "const Stack=AsyncDisposableStack;const resources=new Stack();",
    disposal: "async [Symbol.asyncDispose](){}",
    effect: "",
    resolved: true,
  },
  {
    name: "receiver alias",
    setup: "const original=new AsyncDisposableStack();const resources=original;",
    disposal: "async [Symbol.asyncDispose](){}",
    effect: "",
    resolved: true,
  },
  {
    name: "upstream receiver alias escape",
    setup: "const original=new AsyncDisposableStack();const resources=original;",
    disposal: "async [Symbol.asyncDispose](){}",
    effect: "leak(original);",
    resolved: false,
  },
  {
    name: "receiver escape",
    setup: "const resources=new AsyncDisposableStack();",
    disposal: "async [Symbol.asyncDispose](){}",
    effect: "leak(resources);",
    resolved: false,
  },
  {
    name: "method overwrite",
    setup: "const resources=new AsyncDisposableStack();",
    disposal: "async [Symbol.asyncDispose](){}",
    effect: "resources.use=(value)=>value;",
    resolved: false,
  },
  {
    name: "prototype overwrite",
    setup: "const resources=new AsyncDisposableStack();",
    disposal: "async [Symbol.asyncDispose](){}",
    effect: "AsyncDisposableStack.prototype.use=(value)=>value;",
    resolved: false,
  },
  {
    name: "shadowed constructor with an escaping use",
    setup: "class AsyncDisposableStack{use(value:{read:()=>number}){leak(value);return value;}}const resources=new AsyncDisposableStack();",
    disposal: "async [Symbol.asyncDispose](){}",
    effect: "",
    resolved: false,
  },
  {
    name: "annotation-only native receiver",
    setup: "const resources={use(value:{read:()=>number}){leak(value);return value;}} as AsyncDisposableStack;",
    disposal: "async [Symbol.asyncDispose](){}",
    effect: "",
    resolved: false,
  },
  {
    name: "disposal getter",
    setup: "const resources=new AsyncDisposableStack();",
    disposal: "get [Symbol.asyncDispose](){leak(this);return async()=>{};}",
    effect: "",
    resolved: false,
  },
  {
    name: "disposal receiver write",
    setup: "const resources=new AsyncDisposableStack();",
    disposal: "async [Symbol.asyncDispose](){this.read=()=>2;}",
    effect: "",
    resolved: false,
  },
  { name: "closed synchronous fallback", setup: "const resources=new AsyncDisposableStack();", disposal: "[Symbol.dispose](){}", effect: "", resolved: true },
  { name: "closed synchronous stack", setup: "const resources=new DisposableStack();", disposal: "[Symbol.dispose](){}", effect: "", resolved: true },
  {
    name: "async disposer wins over unused sync getter",
    setup: "const resources=new AsyncDisposableStack();",
    disposal: "async [Symbol.asyncDispose](){},get [Symbol.dispose](){leak(this);return ()=>{};}",
    effect: "",
    resolved: true,
  },
  {
    name: "last disposal descriptor wins",
    setup: "const resources=new AsyncDisposableStack();",
    disposal: "get [Symbol.asyncDispose](){leak(this);return async()=>{};},async [Symbol.asyncDispose](){}",
    effect: "",
    resolved: true,
  },
  {
    name: "last unsafe disposal descriptor refuses",
    setup: "const resources=new AsyncDisposableStack();",
    disposal: "async [Symbol.asyncDispose](){},get [Symbol.asyncDispose](){leak(this);return async()=>{};}",
    effect: "",
    resolved: false,
  },
  {
    name: "nullish async method uses sync fallback",
    setup: "const resources=new AsyncDisposableStack();",
    disposal: "[Symbol.asyncDispose]:undefined,[Symbol.dispose](){}",
    effect: "",
    resolved: true,
  },
  {
    name: "shadowed disposal symbol",
    setup: "const Symbol={asyncDispose:'not-native'};const resources=new AsyncDisposableStack();",
    disposal: "async [Symbol.asyncDispose](){}",
    effect: "",
    resolved: false,
  },
  {
    name: "string disposal spelling is not a symbol",
    setup: "const resources=new AsyncDisposableStack();",
    disposal: "async asyncDispose(){}",
    effect: "",
    resolved: false,
  },
  {
    name: "registered callable write",
    setup: "const resources=new AsyncDisposableStack();",
    disposal: "async [Symbol.asyncDispose](){}",
    effect: "held.read=()=>2;",
    resolved: false,
  },
  {
    name: "disposal method write",
    setup: "const resources=new AsyncDisposableStack();",
    disposal: "async [Symbol.asyncDispose](){}",
    effect: "held[Symbol.asyncDispose]=async()=>{leak(held);};",
    resolved: false,
  },
  {
    name: "lexical disposal write",
    setup: "const resources=new AsyncDisposableStack();",
    disposal: "async [Symbol.asyncDispose](){held.read=()=>2;}",
    effect: "",
    resolved: false,
  },
  {
    name: "resource escape after registration",
    setup: "const resources=new AsyncDisposableStack();",
    disposal: "async [Symbol.asyncDispose](){}",
    effect: "leak(held);",
    resolved: false,
  },
] as const;
for (const scenario of RESOURCE_REGISTRATION_CASES) {
  test(`native resource registration retains ${scenario.name}`, () => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { target: ts.ScriptTarget.ESNext, lib: ["lib.esnext.d.ts"] } });
    const source = project.createSourceFile(
      "/resource-case.ts",
      `export {};declare function leak(value:object):void;${scenario.setup}function create(){return {read:()=>1,${scenario.disposal}};}const held=resources.use(create());${scenario.effect}held.read();`,
    );
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const selected = calls.find((call) => call.getExpression().getText() === "held.read");
    const expected = source.getFunctionOrThrow("create").getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
    if (selected === undefined) {
      throw new Error("the native resource consumer is missing");
    }
    beginReferencePass();
    try {
      const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
      const fact = readAuthoredCallableSources(selected.getExpression(), undefined, observed);
      expect(fact.kind, fact.kind === "unresolved" ? `${fact.reason}: ${fact.detail}` : "resolved").toBe(scenario.resolved ? "resolved" : "unresolved");
      expect(fact.kind === "resolved" && fact.value.length === 1 && fact.value[0]?.value === expected).toBe(scenario.resolved);
    } finally {
      endReferencePass();
    }
  });
}

test("native resource disposal retains the selected implicit consumer", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { target: ts.ScriptTarget.ESNext, lib: ["lib.esnext.d.ts"] } });
  const source = project.createSourceFile(
    "/resource-implicit.ts",
    `
    const read=(value:number)=>value;const resources=new AsyncDisposableStack();
    const held=resources.use({read,[Symbol.asyncDispose]:read});held.read(1);
  `,
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const selected = calls.find((call) => call.getExpression().getText() === "held.read");
  if (selected === undefined) {
    throw new Error("the implicit disposal consumer is missing");
  }
  beginReferencePass();
  try {
    const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
    expect(readAuthoredCallableSources(selected.getExpression(), undefined, observed).kind).toBe("unresolved");
  } finally {
    endReferencePass();
  }
});

test("native resource return retains same-body allocation bindings", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { target: ts.ScriptTarget.ESNext, lib: ["lib.esnext.d.ts"] } });
  const source = project.createSourceFile(
    "/resource-allocation.ts",
    `
    function make(seed:number){ return {read:() => seed,async [Symbol.asyncDispose](){}}; }
    const resources=new AsyncDisposableStack();
    const first=resources.use(make(1));const second=resources.use(make(2));first.read();second.read();
  `,
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const factory = source.getFunctionOrThrow("make");
  const expected = factory.getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
  const parameter = factory.getParameters()[0];
  if (parameter === undefined) {
    throw new Error("the allocation parameter is missing");
  }
  beginReferencePass();
  try {
    const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
    for (const name of ["first", "second"]) {
      const selected = calls.find((call) => call.getExpression().getText() === `${name}.read`);
      const registration = source.getVariableDeclarationOrThrow(name).getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression);
      const allocation = registration.getArguments()[0]?.asKindOrThrow(SyntaxKind.CallExpression);
      if (selected === undefined || allocation === undefined) {
        throw new Error("the native resource allocation is missing");
      }
      const fact = readAuthoredCallableSources(selected.getExpression(), undefined, observed);
      expect(fact.kind, fact.kind === "unresolved" ? `${fact.reason}: ${fact.detail}` : "resolved").toBe("resolved");
      expect(fact.kind === "resolved" && fact.value.length === 1 && fact.value[0]?.value === expected).toBe(true);
      expect(fact.kind === "resolved" && fact.value[0]?.bindings.get(parameter) === allocation.getArguments()[0]).toBe(true);
    }
  } finally {
    endReferencePass();
  }
});

test("native resource projection retains foreign and stale capture refusal", () => {
  const options = { useInMemoryFileSystem: true, compilerOptions: { target: ts.ScriptTarget.ESNext, lib: ["lib.esnext.d.ts"] } };
  const text =
    "const resources=new AsyncDisposableStack();function make(){return {read:()=>1,async [Symbol.asyncDispose](){}};}const held=resources.use(make());held.read();";
  const project = new Project(options);
  const source = project.createSourceFile("/resource-epoch.ts", text);
  const foreign = new Project(options).createSourceFile("/resource-epoch.ts", text);
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const selected = calls.find((call) => call.getExpression().getText() === "held.read");
  const other = foreign.getDescendantsOfKind(SyntaxKind.CallExpression).find((call) => call.getExpression().getText() === "held.read");
  if (selected === undefined || other === undefined) {
    throw new Error("the native resource epoch fixture is missing");
  }
  beginReferencePass();
  try {
    const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
    expect(readAuthoredCallableSources(selected.getExpression(), undefined, observed).kind).toBe("resolved");
    expect(readAuthoredCallableSources(other.getExpression(), undefined, observed).kind).toBe("unresolved");
    source.getFunctionOrThrow("make").setBodyText("return {read:()=>2,async [Symbol.asyncDispose](){}};");
    expect(readAuthoredCallableSources(selected.getExpression(), undefined, observed).kind).toBe("unresolved");
  } finally {
    endReferencePass();
  }
});

const DISPOSER_PARAMETER_CASES = [
  { name: "erased this parameter", parameters: "this: {read:()=>number}", method: true, resolved: true },
  { name: "closed default initializer", parameters: "this: {read:()=>number}, replacement=2", method: true, resolved: true },
  { name: "receiver default initializer", parameters: "this: {read:()=>number}, replacement=(this.read=()=>2)", method: true, resolved: false },
  { name: "nested binding default initializer", parameters: "this: {read:()=>number}, {replacement=(this.read=()=>2)}={}", method: true, resolved: false },
  {
    name: "computed binding receiver effect",
    parameters: "this: {read:()=>number}, {[(this.read=()=>2,'replacement')]: replacement}={replacement:0}",
    method: true,
    resolved: false,
  },
  { name: "function-valued default initializer", parameters: "this: {read:()=>number}, replacement=(this.read=()=>2)", method: false, resolved: false },
] as const;
for (const scenario of DISPOSER_PARAMETER_CASES) {
  test(`native disposal parameter effects retain ${scenario.name}`, () => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { target: ts.ScriptTarget.ESNext, lib: ["lib.esnext.d.ts"], strict: true } });
    const disposal = scenario.method
      ? `async [Symbol.asyncDispose](${scenario.parameters}){}`
      : `[Symbol.asyncDispose]:async function(${scenario.parameters}){}`;
    const source = project.createSourceFile(
      "/resource-parameters.ts",
      `export {};const resources=new AsyncDisposableStack();function create(){return {read:()=>1,${disposal}};}const held=resources.use(create());await resources.disposeAsync();held.read();`,
    );
    expect(source.getPreEmitDiagnostics().map((diagnostic) => diagnostic.getMessageText())).toEqual([]);
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const selected = calls.find((call) => call.getExpression().getText() === "held.read");
    const expected = source.getFunctionOrThrow("create").getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
    if (selected === undefined) {
      throw new Error("the post-disposal call is missing");
    }
    beginReferencePass();
    try {
      const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
      const fact = readAuthoredCallableSources(selected.getExpression(), undefined, observed);
      expect(fact.kind, fact.kind === "unresolved" ? `${fact.reason}: ${fact.detail}` : "resolved").toBe(scenario.resolved ? "resolved" : "unresolved");
      expect(fact.kind === "resolved" && fact.value.length === 1 && fact.value[0]?.value === expected).toBe(scenario.resolved);
    } finally {
      endReferencePass();
    }
  });
}

test("defaulted lifecycle options retain the actual finite capability key through a caught namespace consumer", async ({ repoRoot }) => {
  const { stripTypeScriptTypes } = await import("node:module");
  const referenceFacts = await import("../../../../tooling/src/floor/code-facts/reference-fact.ts");
  const parse = async (path: string): Promise<ts.SourceFile> =>
    ts.createSourceFile(path, await readFile(join(repoRoot, path), "utf8"), ts.ScriptTarget.Latest, true);
  const identity = await parse("packages/contracts/src/identity/index.ts");
  const capability = await parse("packages/server/src/entry/auth/capability.ts");
  const services = await parse("packages/server/src/entry/compose/services.ts");
  const declaration = (source: ts.SourceFile, name: string): ts.Node => {
    const values: ts.Node[] = [];
    const visit = (node: ts.Node): void => {
      if ((ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isBindingElement(node)) && node.name?.getText(source) === name) {
        values.push(node);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    if (values.length !== 1 || values[0] === undefined) {
      throw new Error(`the source-derived fixture requires one ${name}`);
    }
    return values[0];
  };
  const table = declaration(identity, "MULTI_HUMAN_CAPABLE").parent.parent.getText(identity);
  const mode = declaration(services, "authMode").parent.parent.getText(services);
  const config = declaration(services, "authConfig").getText(services);
  const capabilityBinding = declaration(services, "multiHumanCapable").parent.parent.getText(services);
  const egressCalls: ts.CallExpression[] = [];
  const findEgress = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.expression.getText(services) === "createScopedEgress") {
      egressCalls.push(node);
    }
    ts.forEachChild(node, findEgress);
  };
  findEgress(services);
  const egressInput = egressCalls.length === 1 ? egressCalls[0]?.arguments[0] : undefined;
  const fetchRead =
    egressInput !== undefined && ts.isObjectLiteralExpression(egressInput)
      ? egressInput.properties.find((property) => ts.isPropertyAssignment(property) && property.name.getText(services) === "fetch")
      : undefined;
  if (fetchRead === undefined || !ts.isPropertyAssignment(fetchRead)) {
    throw new Error("the actual scoped egress fetch sibling read is missing");
  }
  const siblingExpression = fetchRead.initializer.getText(services);

  const policyCode = stripTypeScriptTypes(
    `${table}
${declaration(identity, "isMultiHumanCapable").getText(identity)}
${declaration(capability, "createMultiHumanCapability").getText(capability)}`,
    { mode: "strip" },
  );
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2025,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      lib: ["lib.es2025.d.ts", "lib.dom.d.ts"],
      types: [],
      strict: true,
      noImplicitAny: false,
    },
  });
  const policy = project.createSourceFile("/repo/policy.ts", policyCode);
  const graph = project.createSourceFile(
    "/repo/graph.ts",
    `import {createMultiHumanCapability} from "./policy.js";
    const env={AUTH_MODE:"local"};
    function createBackgroundWork(){const controller=new AbortController();return {signal:controller.signal};}
    function createStats(){return {settleRetainedChatRebase:()=>1};}
    function use(ctx){return ctx.settleRetainedChatRebase();}
    function createChatContext(input){return {...input,settleRetainedChatRebase:()=>input.settleRetainedChatRebase()};}
    function createTurnEngine(input){return input;}
    function createChatService(input){const ctx=createChatContext(input);const engine=createTurnEngine({...(ctx.backgroundSignal===undefined?{}:{backgroundSignal:ctx.backgroundSignal})});use(ctx);return engine;}
    function buildChatService(input){const stats=createStats();const ctx={...{left:0},...{right:0},settleRetainedChatRebase:stats.settleRetainedChatRebase,...(input.backgroundSignal===undefined?{}:{backgroundSignal:input.backgroundSignal})};return createChatService(ctx);}
    export function createServices(deps){const scopedFetch=${siblingExpression};const {${config}}=deps;${mode}
      const settings={getEffectiveConfig:()=>({localMultiUser:true})};${capabilityBinding}
      const background=createBackgroundWork();const engine=buildChatService({backgroundSignal:background.signal});return {engine,multiHumanCapable};}
  `,
  );
  const lifecycle = project.createSourceFile(
    "/repo/lifecycle.ts",
    `import {createServices} from "./graph.js";
    export function createLifecycle(options:{readonly providerSeams?:{readonly sdkFetch?:typeof fetch}}={}){return {start(){const authConfig={mode:"local"};return createServices({authConfig,...(options.providerSeams===undefined?{}:{providerSeams:options.providerSeams})});}};}`,
  );
  const entry = project.createSourceFile(
    "/repo/entry.ts",
    `export async function run(){const {createLifecycle}=await import("./lifecycle.js").catch((error)=>{throw error;});const lifecycle=createLifecycle();const graph=lifecycle.start();graph.multiHumanCapable();return graph.engine;}void run();`,
  );
  const sources = [policy, graph, lifecycle, entry];
  const calls = sources.flatMap((source) => source.getDescendantsOfKind(SyntaxKind.CallExpression));
  const selected = calls.find((call) => call.getExpression().getText() === "ctx.settleRetainedChatRebase");
  const lifecycleCall = calls.find((call) => call.getExpression().getText() === "createLifecycle");
  const expected = graph.getFunctionOrThrow("createChatContext").getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
  if (selected === undefined || lifecycleCall === undefined) {
    throw new Error("the selected accounting and actual caught lifecycle calls are missing");
  }
  const snapshots: object[] = [];
  let keyReads = 0;
  const original = referenceFacts.inspectInheritedReadEffects;
  const inherited = vi.spyOn(referenceFacts, "inspectInheritedReadEffects").mockImplementation((node, context) =>
    original(node, {
      ...context,
      values: (value, path, bindings, premise) => {
        const result = context.values(value, path, bindings, premise);
        if (value.getSourceFile() === policy && (value.getText() === "mode" || value.getText() === "MULTI_HUMAN_CAPABLE")) {
          keyReads++;
          if (snapshots.length < 24) {
            snapshots.push({
              node: value.getText(),
              path,
              kind: result.kind,
              ...(result.kind === "unresolved"
                ? { detail: result.detail, at: result.node.getText() }
                : {
                    values: result.value.map((leaf) => ({
                      value: leaf.value.getText(),
                      present: leaf.present,
                      path: leaf.path,
                      bindings: [...leaf.bindings].map(([formal, actual]) => [formal.getText(), actual.getText()]),
                    })),
                  }),
            });
          }
        }
        return result;
      },
    }),
  );
  beginReferencePass();
  try {
    const observed = observeCallReturns(
      calls,
      sources.flatMap((source) => source.getDescendants()),
      { suppliedCallableTargets: true },
    );
    const program = observed.programs[0];
    if (program === undefined) {
      throw new Error("the actual native founding capture is missing");
    }
    const first = readAuthoredCallableSources(selected.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
    console.log(
      "FINITE_CAPABILITY_SIBLING_PREREQUISITE",
      JSON.stringify({
        first:
          first.kind === "unresolved"
            ? { kind: first.kind, detail: first.detail, node: first.node.getText() }
            : { kind: first.kind, values: first.value.map((leaf) => ({ value: leaf.value.getText(), present: leaf.present, path: leaf.path })) },
        keyReads,
        snapshots,
        lifecycleCaptured: program.byCall.has(lifecycleCall.compilerNode),
        lifecycleTargets: program.byCall.get(lifecycleCall.compilerNode)?.targets.kind,
        lifecycleCallers: program.callers.get(lifecycle.getFunctionOrThrow("createLifecycle").compilerNode)?.length ?? 0,
      }),
    );
    expect(program.program).toBe(project.getProgram().compilerObject);
    expect(sources.every((source) => program.program.getSourceFile(source.getFilePath()) === source.compilerNode)).toBe(true);
    expect(project.getPreEmitDiagnostics().map((diagnostic) => diagnostic.getMessageText())).toEqual([]);
    expect(program.byCall.has(lifecycleCall.compilerNode)).toBe(true);
    expect(first.kind, first.kind === "unresolved" ? `${first.detail} at ${first.node.getText()}` : "resolved").toBe("resolved");
    expect(first.kind === "resolved" ? first.value.map((leaf) => leaf.value) : []).toEqual([expected]);
    expect(program.inheritedReadTrialActive?.()).toBe(false);
  } finally {
    inherited.mockRestore();
    endReferencePass();
  }
});
