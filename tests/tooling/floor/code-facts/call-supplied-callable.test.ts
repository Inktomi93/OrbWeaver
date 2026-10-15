// @subject tooling/src/floor/code-facts/call-supplied.ts
// @subject tooling/src/floor/code-facts/call-returns.ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { CallExpression, SourceFile } from "ts-morph";
import { Node, Project, SyntaxKind } from "ts-morph";
import { observeCallReturns, readCallTargets, readSuppliedParameter } from "../../../../tooling/src/floor/code-facts/call-returns.ts";
import { beginReferencePass, endReferencePass } from "../../../../tooling/src/floor/code-facts/reference-fact.ts";
import type { CallReturnObservations } from "../../../../tooling/src/floor/code-facts/reference-fact-contract.ts";
import { readAuthoredCallableSources, readReturnedValue } from "../../../../tooling/src/floor/code-facts/value-carrier.ts";

function queriedTargets(call: CallExpression, observations: CallReturnObservations): ReturnType<typeof readCallTargets> {
  const program = observations.programs[0];
  return readCallTargets(call, program === undefined ? undefined : new Set(program.byCall.keys()), observations);
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

test("optional returned callback indexes possible actual arguments without returned-data permission", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    "/repo/producer.ts",
    `
    function prepare(choose:boolean) { if (choose) return null; return {settle:(batch:number[])=>batch.length}; }
    const rebase=prepare(false); const pending=[1]; rebase?.settle(pending);
  `,
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const call = calls.find((candidate) => candidate.getExpression().getText() === "rebase?.settle");
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
  expect(invocation?.invocationTargets?.kind).toBe("resolved");
  expect(before.get(call.compilerNode)?.invocationTargets).toBeUndefined();
  expect(supplied.kind === "resolved" ? supplied.value.map((actual) => actual.value.getText()) : []).toEqual(["pending"]);
});

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
