import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project, SyntaxKind } from "ts-morph";
import {
  observeCallReturns,
  readCallTargets,
  readObservedCallableConsumers,
  readSuppliedParameter,
} from "../../../../tooling/src/floor/code-facts/call-returns.ts";
import { beginReferencePass, endReferencePass } from "../../../../tooling/src/floor/code-facts/reference-fact.ts";
import { queriedTargets } from "./_call-supplied-callable-support.ts";

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
