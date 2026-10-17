// @subject tooling/src/floor/code-facts/value-carrier.ts
// @subject tooling/src/floor/code-facts/call-supplied.ts
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { observeCallReturns, readObservedCallableConsumers, readSuppliedParameter } from "@orb/tooling/floor/code-facts/call-returns";
import { beginReferencePass, endReferencePass, inspectInheritedReadEffects } from "@orb/tooling/floor/code-facts/reference-fact";
import type { CallReturnProgram, InheritedReadPremise } from "@orb/tooling/floor/code-facts/reference-fact-contract";
import { readAuthoredCallableSources, readReturnedValue } from "@orb/tooling/floor/code-facts/value-carrier";
import type { ArrowFunction, CallExpression, SourceFile } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";

const CASES = [
  { name: "inline arrow", body: "function run(make:()=>number){return make();} run(()=>1);", resolved: true },
  { name: "inline function expression", body: "function run(make:()=>number){return make();} run(function(){return 1;});", resolved: true },
  { name: "wrapped inline arrow", body: "function run(make:()=>number){return make();} run((()=>1));", resolved: true },
  {
    name: "finite actual alternatives",
    body: "declare const choose:boolean; function run(make:()=>number){return make();} run(choose?()=>1:()=>2);",
    resolved: true,
    alternatives: 2,
  },
  { name: "unavailable consumer", body: "declare function run(make:()=>number):number; run(()=>1);", resolved: false },
  {
    name: "opaque formal handoff",
    body: "declare function escape(make:()=>number):void; function run(make:()=>number){escape(make); return make();} run(()=>1);",
    resolved: false,
  },
  { name: "mutable formal", body: "function run(make:()=>number){make=()=>2; return make();} run(()=>1);", resolved: false },
  {
    name: "opaque actual alternative",
    body: "declare const choose:boolean; declare const foreign:()=>number; function run(make:()=>number){return make();} run(choose?()=>1:foreign);",
    resolved: false,
  },
] as const;

for (const scenario of CASES) {
  test(`callable argument lifetime: ${scenario.name}`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile("/repo/argument.ts", scenario.body);
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const owner = [...source.getDescendantsOfKind(SyntaxKind.ArrowFunction), ...source.getDescendantsOfKind(SyntaxKind.FunctionExpression)].find((fn) =>
      fn.getText().includes("1"),
    );
    const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
    const program = observed.programs[0];
    if (owner === undefined || program === undefined) {
      throw new Error("actual supplied callable or native program missing");
    }
    const consumers = readObservedCallableConsumers(owner, program);
    expect(consumers.kind).toBe(scenario.resolved ? "resolved" : "unresolved");
    const callers = consumers.kind === "resolved" ? consumers.value : [];
    expect(callers.map((consumer) => consumer.call.getText())).toEqual(scenario.resolved ? ["make()"] : []);
    expect(
      callers.every(
        (consumer) =>
          consumer.targets.kind === "resolved" &&
          consumer.targets.value.length === ("alternatives" in scenario ? scenario.alternatives : 1) &&
          consumer.targets.value.includes(owner),
      ),
    ).toBe(true);
  });
}

test("initial supplied capture retains proven finite record callees before owner demand", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    "/repo/finite.ts",
    'const actions={a:{read:()=>1},b:{read:()=>2}}; function run(key:"a"|"b"){const selected=actions[key]; return selected.read();}',
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const invocation = calls.find((call) => call.getExpression().getText() === "selected.read");
  if (invocation === undefined) {
    throw new Error("finite actual invocation missing");
  }
  const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
  const captured = observed.programs[0]?.byCall.get(invocation.compilerNode)?.targets;
  expect(captured?.kind === "resolved" ? captured.value.map((target) => target.getText()).toSorted() : []).toEqual(["()=>1", "()=>2"]);
});

interface ProjectedFixtureInput {
  readonly prefix?: string;
  readonly helper?: string;
  readonly guard?: string;
  readonly can?: string;
  readonly fields?: string;
  readonly late?: string;
  readonly after?: string;
  readonly factory?: string;
  readonly allocation?: string;
}

interface ProjectedFixture {
  readonly project: Project;
  readonly source: SourceFile;
  readonly calls: readonly CallExpression[];
  readonly selected: CallExpression;
  readonly expected: ArrowFunction;
}

function projectedFixture(recordFactory: boolean, forwarded: boolean, input: ProjectedFixtureInput = {}): ProjectedFixture {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const source = project.createSourceFile(
    "/repo/projected.ts",
    `
    ${input.prefix ?? ""}
    function permits(can, principal, action, role){can(principal,action,{role});return true;}
    ${input.helper ?? 'function assertHost(can, principal, role, chatId){permits(can,principal,"host",role);}'}
    ${input.factory ?? (recordFactory ? "function createStats(){return {settleRetainedChatRebase:()=>1};}" : "function createRebase(){return ()=>1;}")}
    function requireHost(ctx){${input.guard ?? (forwarded ? 'assertHost(ctx.can,{},"host","chat");' : 'ctx.can({},"host",{role:"host"});')}}
    function use(ctx){requireHost(ctx);return ctx.settleRetainedChatRebase();}
    ${input.allocation ?? (recordFactory ? "const stats=createStats();" : "")}${input.can ?? "const can=()=>{};"}
    const context={...{left:0},...{right:0},settleRetainedChatRebase:${recordFactory ? "stats.settleRetainedChatRebase" : "createRebase()"},${input.fields ?? "can"},${input.late ?? ""}};
    ${input.after ?? ""}use(context);
  `,
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const selected = calls.find((call) => call.getExpression().getText() === "ctx.settleRetainedChatRebase");
  if (selected === undefined) {
    throw new Error("the selected sibling invocation is missing");
  }
  const expected = source.getFunctionOrThrow(recordFactory ? "createStats" : "createRebase").getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
  return { project, source, calls, selected, expected };
}

for (const recordFactory of [false, true]) {
  for (const forwarded of [false, true]) {
    test(`a projected sibling callable retains its authored authorization handoff: record=${recordFactory}, forwarded=${forwarded}`, () => {
      const { project, source, calls, selected, expected } = projectedFixture(recordFactory, forwarded);
      beginReferencePass();
      try {
        const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
        const program = observed.programs[0];
        if (program === undefined) {
          throw new Error("the actual native capture owner is missing");
        }
        expect(program.program).toBe(project.getProgram().compilerObject);
        expect(program.program.getSourceFile(source.getFilePath())).toBe(source.compilerNode);
        expect(program.byCall.has(selected.compilerNode)).toBe(true);
        const helper = source.getFunctionOrThrow("assertHost");
        const helperCalls = calls.filter((call) => call.getExpression().getText() === "assertHost");
        const actual = helperCalls[0];
        const formal = helper.getParameters()[0];
        if (formal === undefined) {
          throw new Error("the actual authorization formal is missing");
        }
        expect(helperCalls).toHaveLength(forwarded ? 1 : 0);
        const target = actual === undefined ? undefined : program.byCall.get(actual.compilerNode)?.targets;
        expect(target?.kind === "resolved" ? target.value : []).toEqual(forwarded ? [helper] : []);
        expect(program.callers.get(helper.compilerNode)?.map((caller) => caller.call) ?? []).toEqual(helperCalls);
        const supplied = actual === undefined ? undefined : readSuppliedParameter(formal.getNameNode(), new Map(), program);
        expect(supplied?.kind === "resolved" ? supplied.value.map((value) => value.value) : []).toEqual(actual === undefined ? [] : [actual.getArguments()[0]]);
        const result = readAuthoredCallableSources(selected.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
        expect(result.kind, result.kind === "unresolved" ? `${result.detail} at ${result.node.getText()}` : "resolved").toBe("resolved");
        expect(result.kind === "resolved" ? result.value.map((leaf) => leaf.value) : []).toEqual([expected]);
      } finally {
        endReferencePass();
      }
    });
  }
}

const PROJECTED_REFUSALS = [
  { name: "bodyless forwarder", helper: "declare function assertHost(can, principal, role, chatId):void;" },
  { name: "opaque callback escape", helper: "declare function escape(value:object):void;function assertHost(can, principal, role, chatId){escape(can);}" },
  { name: "reassigned callback formal", helper: 'function assertHost(can, principal, role, chatId){can=()=>{};permits(can,principal,"host",role);}' },
  { name: "callback getter", fields: "get can(){return ()=>{};}" },
  { name: "receiver write", guard: 'ctx.can=()=>{};assertHost(ctx.can,{},"host","chat");' },
  { name: "selected member write", guard: 'ctx.settleRetainedChatRebase=()=>2;assertHost(ctx.can,{},"host","chat");' },
  { name: "invoked callback mutates its captured receiver", can: "const can=()=>{context.settleRetainedChatRebase=()=>2;};" },
  { name: "unknown actual callback", prefix: "declare const can:()=>void;", can: "" },
  { name: "opaque callable alternative", prefix: "declare const choose:boolean;declare const foreign:()=>void;", can: "const can=choose?()=>{}:foreign;" },
  { name: "late opaque slot overwrite", prefix: "declare const foreign:object;", late: "...foreign" },
  { name: "selected slot getter", late: "get settleRetainedChatRebase(){return ()=>1;}" },
  { name: "prototype replacement", late: "__proto__:{can:()=>{}}" },
  { name: "mutable factory record", after: "stats.settleRetainedChatRebase=()=>2;" },
  { name: "escaping receiver", prefix: "declare function escape(value:object):void;", after: "escape(context);" },
  {
    name: "unknown callable alias escape",
    prefix: "declare const can:()=>void;declare function escape(value:object):void;",
    can: "",
    guard: "const alias=ctx.can;escape(alias);",
  },
] as const;

for (const scenario of PROJECTED_REFUSALS) {
  test(`projected callable handoff refuses ${scenario.name}`, () => {
    const { source, calls, selected } = projectedFixture(true, true, scenario);
    beginReferencePass();
    try {
      const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
      const program = observed.programs[0];
      if (program === undefined) {
        throw new Error("the actual native capture owner is missing");
      }
      const result = readAuthoredCallableSources(selected.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
      expect(result.kind, scenario.name).toBe("unresolved");
    } finally {
      endReferencePass();
    }
  });
}

for (const value of ['"data"', '{value:"data"}', '["data"]']) {
  test(`a known noncallable sibling remains a data read: ${value}`, () => {
    const { source, calls, selected, expected } = projectedFixture(true, true, { can: `const can=${value};`, guard: "const value=ctx.can;" });
    const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
    const program = observed.programs[0];
    if (program === undefined) {
      throw new Error("the actual data-read capture is missing");
    }
    const result = readAuthoredCallableSources(selected.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
    expect(result.kind === "resolved" ? result.value.map((leaf) => leaf.value) : result.detail).toEqual([expected]);
  });
}

test("a projected callable keeps its actual factory allocation bindings", () => {
  const { source, calls, selected, expected } = projectedFixture(true, true, {
    factory: "function createStats(id){return {settleRetainedChatRebase:()=>id};}",
    allocation: 'const stats=createStats("left");const other=createStats("right");',
  });
  const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
  const program = observed.programs[0];
  const formal = source.getFunctionOrThrow("createStats").getParameters()[0];
  const first = source.getVariableDeclarationOrThrow("stats").getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression);
  if (program === undefined || formal === undefined) {
    throw new Error("the actual captured allocation is missing");
  }
  const result = readAuthoredCallableSources(selected.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
  expect(result.kind === "resolved" ? result.value.map((leaf) => leaf.value) : result.detail).toEqual([expected]);
  expect(result.kind === "resolved" ? result.value.map((value) => value.bindings.get(formal)) : []).toEqual([first.getArguments()[0]]);
});

for (const invalidation of ["references", "foreign", "stale"] as const) {
  test(`projected callable handoff refuses ${invalidation} capture inputs before writes`, () => {
    const { project, source, calls, selected } = projectedFixture(true, true);
    const observed = observeCallReturns(calls, invalidation === "references" ? undefined : source.getDescendants(), { suppliedCallableTargets: true });
    const program = observed.programs[0];
    if (program === undefined) {
      throw new Error("the actual native capture owner is missing");
    }
    const before = program.byCall;
    const input = invalidation === "foreign" ? projectedFixture(true, true).selected : selected;
    if (invalidation === "stale") {
      project.compilerOptions.set({ strict: true });
    }
    const result = readAuthoredCallableSources(input.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
    expect(result.kind).toBe("unresolved");
    expect(program.byCall).toBe(before);
    expect(program.inheritedReadTrialActive?.()).toBe(false);
  });
}

for (const captureHelper of [false, true]) {
  test(`a projected member argument requires its actual captured helper: ${captureHelper}`, () => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
    const source = project.createSourceFile(
      "/repo/coverage.ts",
      `
      function assertHost(can){can();}function createStats(){return {rebase:()=>1};}
      const stats=createStats();const context={...{left:0},...{right:0},rebase:stats.rebase,can:()=>{}};
      function later(){assertHost(context.can);}const selected=context.rebase();
    `,
    );
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const helper = calls.find((call) => call.getExpression().getText() === "assertHost");
    const selected = source.getVariableDeclarationOrThrow("selected").getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression);
    if (helper === undefined) {
      throw new Error("the actual helper call is missing");
    }
    const observed = observeCallReturns(
      calls.filter((call) => captureHelper || call !== helper),
      source.getDescendants(),
      { suppliedCallableTargets: true },
    );
    const program = observed.programs[0];
    if (program === undefined) {
      throw new Error("the actual native capture owner is missing");
    }
    expect(program.sources.has(source)).toBe(true);
    expect(program.byCall.has(helper.compilerNode)).toBe(captureHelper);
    const result = readAuthoredCallableSources(selected.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
    expect(result.kind).toBe(captureHelper ? "resolved" : "unresolved");
    expect(program.byCall.has(helper.compilerNode)).toBe(captureHelper);
  });
}

test("a projected argument settles its real helper only after private revocation", () => {
  const { source, calls, selected, expected } = projectedFixture(true, true, {
    helper:
      'function assertHost(can, principal, role, chatId){permits(can,principal,"host",role);}function handoff(guard,ctx){guard(ctx.can,{},"host","chat");}',
    guard: "handoff(assertHost,ctx);",
  });
  source.addStatements('const key="safe";const registry={safe:{}};registry[key];');
  const helper = calls.find((call) => call.getExpression().getText() === "guard");
  if (helper === undefined) {
    throw new Error("the actual dynamically supplied helper is missing");
  }
  beginReferencePass();
  try {
    const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants(), { suppliedCallableTargets: true });
    const program = observed.programs[0];
    const trial = program?.withInheritedReadTrial;
    if (program === undefined || trial === undefined) {
      throw new Error("the real inherited-effect trial owner is missing");
    }
    expect(program.byCall.get(helper.compilerNode)?.targets.kind).toBe("unresolved");
    const premises: InheritedReadPremise[] = [];
    const unchanged: boolean[] = [];
    const revoked: boolean[] = [];
    const observeTrial: NonNullable<CallReturnProgram["withInheritedReadTrial"]> = (node, captured, prove) =>
      trial(node, captured, () => {
        try {
          return prove();
        } finally {
          const premise = premises.at(-1);
          if (premise !== undefined && program.byCall.get(helper.compilerNode)?.targets.kind !== "resolved") {
            revoked.push(premise.require(selected, program).kind === "unresolved");
          }
        }
      });
    Object.defineProperty(program, "withInheritedReadTrial", { configurable: true, value: observeTrial });
    const effects = inspectInheritedReadEffects(selected, {
      program,
      values: (node, path, bindings, premise) => {
        if (premise !== undefined) {
          premises.push(premise);
          const before = program.byCall;
          try {
            const result = readAuthoredCallableSources(selected.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
            if (result.kind === "unresolved") {
              return result;
            }
          } finally {
            if (program.byCall.get(helper.compilerNode)?.targets.kind !== "resolved") {
              unchanged.push(program.byCall === before && program.inheritedReadTrialActive?.() === true);
            }
          }
        }
        return readReturnedValue(node, path, observed, { terminals: new Set(), bindings });
      },
    });
    expect(effects.kind, effects.kind === "unresolved" ? effects.detail : "resolved").toBe("resolved");
    expect(unchanged.length > 0 && unchanged.every(Boolean)).toBe(true);
    expect(revoked.length > 0 && revoked.every(Boolean)).toBe(true);
    expect(premises[0]?.require(selected, program)).toMatchObject({ kind: "unresolved", detail: "the inherited-effect premise has expired" });
    expect(program.inheritedReadTrialActive?.()).toBe(false);
    const target = program.byCall.get(helper.compilerNode)?.targets;
    expect(target?.kind === "resolved" ? target.value : []).toEqual([source.getFunctionOrThrow("assertHost")]);
    const result = readAuthoredCallableSources(selected.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
    expect(result.kind === "resolved" ? result.value.map((leaf) => leaf.value) : result.detail).toEqual([expected]);
  } finally {
    endReferencePass();
  }
});
