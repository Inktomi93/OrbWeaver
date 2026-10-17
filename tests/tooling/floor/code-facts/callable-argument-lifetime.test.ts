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

for (const nested of [false, true]) {
  test(`${nested ? "a nested optional sibling preserves real private revocation" : "a projected argument settles its real helper only after private revocation"}`, () => {
    const { source, calls, selected, expected } = projectedFixture(true, true, {
      helper: `function assertHost(can, principal, role, chatId){permits(can,principal,"host",role);}function handoff(guard,ctx){${nested ? 'ctx.rpg?.handoffRekeyActors("chat",[]);' : ""}guard(ctx.can,{},"host","chat");}`,
      guard: "handoff(assertHost,ctx);",
      ...(nested ? { fields: "can,rpg:{handoffRekeyActors:()=>{}}" } : {}),
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
}

function nestedMemberFixture(input: ProjectedFixtureInput = {}): ProjectedFixture {
  return projectedFixture(true, false, {
    helper:
      "async function completeHandoffResumption(ctx,resume){if(resume.actorRekeys.length>0){await ctx.rpg?.handoffRekeyActors(resume.chatId,resume.actorRekeys);}}",
    guard: 'completeHandoffResumption(ctx,{chatId:"chat",actorRekeys:["actor"]});',
    fields: "can,rpg:{handoffRekeyActors:(chatId,cardCopies)=>{}}",
    ...input,
  });
}

test("a selected callback retains its nested optional sibling method continuation", () => {
  const { project, source, calls, selected, expected } = nestedMemberFixture();
  const method = calls.find((call) => call.getExpression().getText() === "ctx.rpg?.handoffRekeyActors");
  const owner = source.getDescendantsOfKind(SyntaxKind.ArrowFunction).find((arrow) => arrow.getParameters()[0]?.getName() === "chatId");
  const formal = owner?.getParameters()[0];
  if (method === undefined || owner === undefined || formal === undefined) {
    throw new Error("the actual nested method, owner or formal is missing");
  }
  beginReferencePass();
  try {
    const references = source.getDescendants();
    const observed = observeCallReturns(calls, references, { suppliedCallableTargets: true });
    const program = observed.programs[0];
    if (program === undefined) {
      throw new Error("the actual nested continuation capture is missing");
    }
    expect(program.program).toBe(project.getProgram().compilerObject);
    expect(program.program.getSourceFile(source.getFilePath())).toBe(source.compilerNode);
    expect(references).toContain(method.getExpression());
    expect(program.byCall.has(method.compilerNode)).toBe(true);
    expect(owner.getProject().getProgram().compilerObject).toBe(program.program);
    expect(formal.getParent().compilerNode).toBe(owner.compilerNode);
    const result = readAuthoredCallableSources(selected.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
    expect(result.kind, result.kind === "unresolved" ? `${result.detail} at ${result.node.getText()}` : "resolved").toBe("resolved");
    expect(result.kind === "resolved" ? result.value.map((leaf) => leaf.value) : []).toEqual([expected]);
    const selectedSettlement = program.suppliedCallableUses?.(selected);
    expect(selectedSettlement?.kind, selectedSettlement?.kind === "unresolved" ? selectedSettlement.detail : "resolved").toBe("resolved");
    const settled = program.suppliedCallableUses?.(method);
    expect(settled?.kind, settled?.kind === "unresolved" ? settled.detail : "resolved").toBe("resolved");
    const targets = program.byCall.get(method.compilerNode)?.targets;
    expect(targets?.kind === "resolved" ? targets.value : []).toEqual([owner]);
    expect(program.callers.get(owner.compilerNode)?.map((caller) => caller.call)).toEqual([method]);
    const supplied = readSuppliedParameter(formal.getNameNode(), new Map(), program);
    expect(supplied.kind, supplied.kind === "unresolved" ? `${supplied.detail} at ${supplied.node.getText()}` : "resolved").toBe("resolved");
    expect(supplied.kind === "resolved" ? supplied.value.map((value) => value.value) : []).toEqual([method.getArguments()[0]]);
  } finally {
    endReferencePass();
  }
});

for (const fields of [
  "can,rpg:null",
  "can,rpg:void 0",
  "can,rpg:choose?{handoffRekeyActors:()=>{}}:null",
  "can,rpg:choose?{handoffRekeyActors:()=>{}}:void 0",
] as const) {
  test(`a nested optional sibling retains actual runtime alternatives: ${fields}`, () => {
    const { source, calls, selected, expected } = nestedMemberFixture({ prefix: "declare const choose:boolean;", fields });
    const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
    const program = observed.programs[0];
    if (program === undefined) {
      throw new Error("the actual optional-alternative capture is missing");
    }
    const result = readAuthoredCallableSources(selected.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
    expect(result.kind === "resolved" ? result.value.map((leaf) => leaf.value) : result.detail).toEqual([expected]);
  });
}

for (const input of [
  { prefix: "const rpg={handoffRekeyActors:()=>{}};", fields: "can,rpg" },
  { prefix: "const rpg={handoffRekeyActors:()=>{}};const alias=rpg;", fields: "can,rpg:alias" },
  { prefix: "declare const choose:boolean;const rpg=choose?{handoffRekeyActors:()=>{}}:null;", fields: "can,rpg" },
] as const) {
  test(`a nested optional sibling closes its actual object allocation: ${input.prefix}`, () => {
    const { source, calls, selected, expected } = nestedMemberFixture(input);
    const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
    const program = observed.programs[0];
    if (program === undefined) {
      throw new Error("the actual allocated sibling capture is missing");
    }
    const result = readAuthoredCallableSources(selected.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
    expect(result.kind === "resolved" ? result.value.map((leaf) => leaf.value) : result.detail).toEqual([expected]);
  });
}

const NESTED_MEMBER_REFUSALS = [
  { name: "receiver getter", fields: "can,get rpg(){return {handoffRekeyActors:()=>{}};}" },
  { name: "method getter", fields: "can,rpg:{get handoffRekeyActors(){return ()=>{};}}" },
  { name: "nested prototype replacement", fields: "can,rpg:{__proto__:{},handoffRekeyActors:()=>{}}" },
  { name: "receiver replacement", guard: 'ctx.rpg={handoffRekeyActors:()=>{}};completeHandoffResumption(ctx,{chatId:"chat",actorRekeys:["actor"]});' },
  { name: "method replacement", after: "context.rpg.handoffRekeyActors=()=>{};" },
  { name: "selected replacement", after: "context.settleRetainedChatRebase=()=>2;" },
  { name: "method mutates selected callback", fields: "can,rpg:{handoffRekeyActors:()=>{context.settleRetainedChatRebase=()=>2;}}" },
  {
    name: "method escapes selected receiver",
    prefix: "declare function escape(value:object):void;",
    fields: "can,rpg:{handoffRekeyActors:()=>{escape(context);}}",
  },
  { name: "opaque method", prefix: "declare const foreign:()=>void;", fields: "can,rpg:{handoffRekeyActors:foreign}" },
  { name: "unknown receiver", prefix: "declare const foreign:object;", fields: "can,rpg:foreign" },
  { name: "escaping method", prefix: "declare function escape(value:object):void;", after: "escape(context.rpg?.handoffRekeyActors);" },
  { name: "escaping nested receiver", prefix: "declare function escape(value:object):void;", after: "escape(context.rpg);" },
  {
    name: "escaping separately allocated nested receiver",
    prefix: "declare function escape(value:object):void;const rpg={handoffRekeyActors:()=>{}};",
    fields: "can,rpg",
    after: "escape(rpg);",
  },
  {
    name: "escaping external method binding",
    prefix: "declare function escape(value:object):void;const method=()=>{};",
    fields: "can,rpg:{handoffRekeyActors:method}",
    after: "escape(method);",
  },
  {
    name: "nested carrier hidden in an escaping record",
    prefix: "declare function escape(value:object):void;const bundle={rpg:{handoffRekeyActors:()=>{}}};",
    fields: "can,rpg:bundle.rpg",
    after: "escape(bundle);",
  },
  {
    name: "an optional call rather than an optional receiver",
    helper: "async function completeHandoffResumption(ctx,resume){await ctx.rpg.handoffRekeyActors?.(resume.chatId,resume.actorRekeys);}",
  },
  {
    name: "a returned selected receiver written through a later member",
    fields: "can,rpg:{handoffRekeyActors:()=>context}",
    helper: "function completeHandoffResumption(ctx,resume){ctx.rpg?.handoffRekeyActors(resume.chatId,resume.actorRekeys).settleRetainedChatRebase=()=>2;}",
  },
] as const;

for (const scenario of NESTED_MEMBER_REFUSALS) {
  test(`a nested optional sibling refuses ${scenario.name}`, () => {
    const { source, calls, selected } = nestedMemberFixture(scenario);
    beginReferencePass();
    try {
      const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
      const program = observed.programs[0];
      if (program === undefined) {
        throw new Error("the actual nested-refusal capture is missing");
      }
      const result = readAuthoredCallableSources(selected.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
      expect(result.kind, scenario.name).toBe("unresolved");
    } finally {
      endReferencePass();
    }
  });
}

for (const invalidation of ["references", "foreign", "stale"] as const) {
  test(`a nested optional sibling refuses ${invalidation} native inputs before writes`, () => {
    const { project, source, calls, selected } = nestedMemberFixture();
    const observed = observeCallReturns(calls, invalidation === "references" ? undefined : source.getDescendants(), { suppliedCallableTargets: true });
    const program = observed.programs[0];
    if (program === undefined) {
      throw new Error("the actual nested native world is missing");
    }
    const before = program.byCall;
    const input = invalidation === "foreign" ? nestedMemberFixture().selected : selected;
    if (invalidation === "stale") {
      project.compilerOptions.set({ strict: true });
    }
    const result = readAuthoredCallableSources(input.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
    expect(result.kind).toBe("unresolved");
    expect(program.byCall).toBe(before);
    expect(program.inheritedReadTrialActive?.()).toBe(false);
  });
}

for (const captured of [false, true]) {
  test(`a nested optional sibling requires its actual captured invocation: ${captured}`, () => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
    const source = project.createSourceFile(
      "/repo/nested-coverage.ts",
      `function createStats(){return {rebase:()=>1};}const stats=createStats();
      const context={...{left:0},...{right:0},rebase:stats.rebase,rpg:{method:()=>{}}};
      function later(){context.rpg?.method();}const selected=context.rebase();`,
    );
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const method = calls.find((call) => call.getExpression().getText() === "context.rpg?.method");
    const selected = source.getVariableDeclarationOrThrow("selected").getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression);
    if (method === undefined) {
      throw new Error("the actual nested invocation is missing");
    }
    const observed = observeCallReturns(
      calls.filter((call) => captured || call !== method),
      source.getDescendants(),
      { suppliedCallableTargets: true },
    );
    const program = observed.programs[0];
    if (program === undefined) {
      throw new Error("the actual nested-call capture is missing");
    }
    expect(program.sources.has(source)).toBe(true);
    expect(program.byCall.has(method.compilerNode)).toBe(captured);
    const result = readAuthoredCallableSources(selected.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
    expect(result.kind).toBe(captured ? "resolved" : "unresolved");
    expect(program.byCall.has(method.compilerNode)).toBe(captured);
  });
}

test("a nested optional sibling retains its composed input field and null fallback", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const source = project.createSourceFile(
    "/repo/composed-nested.ts",
    `function createStats(){return {settleRetainedChatRebase:()=>1};}
    async function completeHandoffResumption(ctx,resume){if(resume.actorRekeys.length>0){await ctx.rpg?.handoffRekeyActors(resume.chatId,resume.actorRekeys);}}
    function use(ctx){completeHandoffResumption(ctx,{chatId:"chat",actorRekeys:["actor"]});ctx.settleRetainedChatRebase();}
    function buildChatService(input){const stats=createStats();const context={...{left:0},...{right:0},settleRetainedChatRebase:stats.settleRetainedChatRebase,rpg:input.rpg??null};use(context);}
    function composeServices(){const rpgOpsDelegate={handoffRekeyActors:(chatId,cardCopies)=>{}};buildChatService({rpg:rpgOpsDelegate});}
    composeServices();`,
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const selected = calls.find((call) => call.getExpression().getText() === "ctx.settleRetainedChatRebase");
  const method = calls.find((call) => call.getExpression().getText() === "ctx.rpg?.handoffRekeyActors");
  const expected = source.getFunctionOrThrow("createStats").getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
  if (selected === undefined || method === undefined) {
    throw new Error("the actual composed invocation is missing");
  }
  beginReferencePass();
  try {
    const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
    const program = observed.programs[0];
    if (program === undefined) {
      throw new Error("the actual composed native capture is missing");
    }
    expect(program.program).toBe(project.getProgram().compilerObject);
    expect(program.byCall.has(method.compilerNode)).toBe(true);
    const result = readAuthoredCallableSources(selected.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
    expect(result.kind, result.kind === "unresolved" ? `${result.detail} at ${result.node.getText()}` : "resolved").toBe("resolved");
    expect(result.kind === "resolved" ? result.value.map((leaf) => leaf.value) : []).toEqual([expected]);
    const input = source.getFunctionOrThrow("buildChatService").getParameters()[0];
    const context = source.getDescendantsOfKind(SyntaxKind.VariableDeclaration).find((declaration) => declaration.getName() === "context");
    if (input === undefined || context === undefined) {
      throw new Error("the actual composed input formal or receiver is missing");
    }
    const supplied = readSuppliedParameter(input.getNameNode(), new Map(), program);
    expect(supplied.kind, supplied.kind === "unresolved" ? supplied.detail : "resolved").toBe("resolved");
    expect(supplied.kind === "resolved" ? supplied.value.length : 0).toBe(1);
    const binding = supplied.kind === "resolved" ? supplied.value[0]?.bindings : undefined;
    if (binding === undefined) {
      throw new Error("the actual composed input bindings are missing");
    }
    const projected = readReturnedValue(context.getInitializerOrThrow(), ["rpg"], observed, { terminals: new Set(), bindings: binding });
    const actual = source.getDescendantsOfKind(SyntaxKind.VariableDeclaration).find((declaration) => declaration.getName() === "rpgOpsDelegate");
    expect(projected.kind === "resolved" ? projected.value.map((value) => value.value) : projected.detail).toEqual([actual?.getInitializerOrThrow()]);
  } finally {
    endReferencePass();
  }
});

const NULLISH_VALUES = [
  { name: "present object", setup: "const lhs={run:()=>1};", chosen: "lhs" },
  { name: "unused opaque fallback", setup: "declare function opaque():object;const lhs={run:()=>1};", right: "opaque()", chosen: "lhs" },
  { name: "actual null", setup: "const lhs=null;", chosen: "rhs" },
  { name: "actual undefined", setup: "const lhs=undefined;", chosen: "rhs" },
  { name: "pure void", setup: "const lhs=void 0;", chosen: "rhs" },
  { name: "false is not nullish", setup: "const lhs=false;", chosen: "lhs" },
  { name: "zero is not nullish", setup: "const lhs=0;", chosen: "lhs" },
  { name: "empty string is not nullish", setup: 'const lhs="";', chosen: "lhs" },
  { name: "closed own absence", setup: "const input={};const lhs=input.rpg;", chosen: "rhs" },
  { name: "unknown runtime input", setup: "declare const lhs:{run:()=>number}|null;" },
  { name: "getter is not absence", setup: "const input={get rpg(){return null;}};const lhs=input.rpg;" },
  { name: "inherited absence is not undefined", setup: "const input={__proto__:{rpg:null}};const lhs=input.rpg;" },
  { name: "effectful void", setup: "function effect(){return 0;}const lhs=void effect();" },
  { name: "unawaited async object", setup: "async function make(){return {run:()=>1};}const lhs=make();" },
  { name: "unawaited async null", setup: "async function make(){return null;}const lhs=make();" },
  { name: "unawaited async fallback", setup: "async function make(){return {run:()=>1};}const lhs=null;", right: "make()" },
  { name: "generator object", setup: "function* make(){return null;}const lhs=make();" },
  { name: "generator fallback", setup: "function* make(){return {run:()=>1};}const lhs=null;", right: "make()" },
  { name: "unsupported awaited operand", setup: "async function make(){return null;}const lhs=await make();" },
  { name: "awaited thenable is not its authored object", setup: "function make(){return {then(resolve){resolve(null);},run:()=>1};}const lhs=await make();" },
  { name: "unawaited thenable remains its object", setup: "const lhs={then(resolve){resolve(null);},run:()=>1};", chosen: "lhs" },
] as const;

for (const scenario of NULLISH_VALUES) {
  test(`nullish value projection keeps its actual runtime branch: ${scenario.name}`, () => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
    const source = project.createSourceFile(
      "/repo/nullish.ts",
      `${scenario.setup}const rhs={run:()=>2};function retain(value){return value;}const chosen=retain(lhs??(${"right" in scenario ? scenario.right : "rhs"}));`,
    );
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
    expect(observed.programs[0]?.program).toBe(project.getProgram().compilerObject);
    const chosen = source.getVariableDeclarationOrThrow("chosen").getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression).getArguments()[0];
    if (chosen === undefined) {
      throw new Error("the actual nullish consumer argument is missing");
    }
    const result = readReturnedValue(chosen, [], observed, new Set());
    expect(result.kind, scenario.name).toBe("chosen" in scenario ? "resolved" : "unresolved");
    const expected = "chosen" in scenario ? [source.getVariableDeclarationOrThrow(scenario.chosen).getInitializerOrThrow()] : [];
    expect(result.kind === "resolved" ? result.value.map((value) => value.value) : []).toEqual(expected);
  });
}

test("nullish operand refusal precedes reuse of the same captured async return", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const source = project.createSourceFile(
    "/repo/nullish-reuse.ts",
    "async function make(){return {run:()=>1};}const pending=make();const alias=pending;const chosen=alias??{run:()=>2};",
  );
  const call = source.getVariableDeclarationOrThrow("pending").getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression);
  const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants(), { suppliedCallableTargets: true });
  const program = observed.programs[0];
  if (program === undefined) {
    throw new Error("the actual reused-call capture is missing");
  }
  expect(program.program).toBe(project.getProgram().compilerObject);
  const captured = program.byCall.get(call.compilerNode);
  expect(captured?.targets.kind === "resolved" ? captured.targets.value : []).toEqual([source.getFunctionOrThrow("make")]);
  const returned = readReturnedValue(call, [], observed, new Set());
  expect(returned.kind === "resolved" ? returned.value.map((value) => value.value) : []).toEqual([
    source.getFunctionOrThrow("make").getFirstDescendantByKindOrThrow(SyntaxKind.ObjectLiteralExpression),
  ]);
  expect(program.byCall.get(call.compilerNode)).toBe(captured);
  const operand = readReturnedValue(source.getVariableDeclarationOrThrow("chosen").getInitializerOrThrow(), [], observed, new Set());
  expect(operand).toMatchObject({ kind: "unresolved", reason: "unsupported", node: call });
  expect(program.byCall.get(call.compilerNode)).toBe(captured);
});

test("nullish value projection retains each actual conditional alternative", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const source = project.createSourceFile(
    "/repo/nullish-conditional.ts",
    "declare const choose:boolean;const left={run:()=>1};const right={run:()=>2};function retain(value){return value;}const chosen=retain((choose?left:null)??right);",
  );
  const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants(), { suppliedCallableTargets: true });
  const selected = source.getVariableDeclarationOrThrow("chosen").getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression).getArguments()[0];
  if (selected === undefined) {
    throw new Error("the actual conditional consumer argument is missing");
  }
  const result = readReturnedValue(selected, [], observed, new Set());
  expect(result.kind === "resolved" ? result.value.map((value) => value.value) : result.detail).toEqual([
    source.getVariableDeclarationOrThrow("left").getInitializerOrThrow(),
    source.getVariableDeclarationOrThrow("right").getInitializerOrThrow(),
  ]);
});
