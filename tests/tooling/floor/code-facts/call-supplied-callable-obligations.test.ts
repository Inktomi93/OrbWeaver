// @subject tooling/src/floor/code-facts/call-supplied.ts
// @subject tooling/src/floor/code-facts/call-returns.ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { CallExpression, SourceFile } from "ts-morph";
import { Project, SyntaxKind, ts } from "ts-morph";
import { vi } from "vitest";
import { observeCallReturns, readCallTargets, readSuppliedParameter } from "../../../../tooling/src/floor/code-facts/call-returns.ts";
import { beginReferencePass, endReferencePass } from "../../../../tooling/src/floor/code-facts/reference-fact.ts";
import type { CallReturnObservations } from "../../../../tooling/src/floor/code-facts/reference-fact-contract.ts";
import { readAuthoredCallableSources } from "../../../../tooling/src/floor/code-facts/value-carrier.ts";
import { actualCompactionBinding, compactionTargetDescription, queriedTargets } from "./_call-supplied-callable-support.ts";

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
        source.replaceWithText(`${source.getFullText()}const changed=1;`);
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
