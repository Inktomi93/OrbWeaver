// @subject tooling/src/floor/code-facts/call-supplied.ts
// @subject tooling/src/floor/code-facts/call-returns.ts
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { CallExpression, SourceFile } from "ts-morph";
import { Project, SyntaxKind, ts } from "ts-morph";
import { vi } from "vitest";
import { observeCallReturns, readCallTargets } from "../../../../tooling/src/floor/code-facts/call-returns.ts";
import { readCallReturnReference } from "../../../../tooling/src/floor/code-facts/call-supplied.ts";
import { beginReferencePass, endReferencePass } from "../../../../tooling/src/floor/code-facts/reference-fact.ts";
import { readAuthoredCallableSources, readReturnedValue } from "../../../../tooling/src/floor/code-facts/value-carrier.ts";
import { nativeReferenceNodes } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";
import { compactionTargetDescription, queriedTargets } from "./_call-supplied-callable-support.ts";

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

test("native reference source demand publishes its real source without changing the native Program", () => {
  const { project, implementation, barrel, consumer, call, binding } = sparseBarrelProject();
  beginReferencePass();
  try {
    const observed = observeCallReturns([call], consumer.getDescendants(), { suppliedCallableTargets: true });
    const program = observed.programs[0];
    const reference = nativeReferenceNodes(binding).find((node) => node.getSourceFile() === barrel);
    if (program?.demandReferenceSource === undefined || reference === undefined) {
      throw new Error("the actual native reference capture services are missing");
    }
    const native = project.getProgram().compilerObject;
    const sources = program.sources;
    const calls = program.byCall;
    const before = program.callableProofEpoch?.();
    expect(sources.has(barrel)).toBe(false);
    const result = program.demandReferenceSource(reference, binding);
    expect(result.kind).toBe("resolved");
    expect(program.sources === sources).toBe(true);
    expect(sources.get(barrel) === barrel.compilerNode).toBe(true);
    expect(program.callableProofEpoch?.().referenceRevision).toBe((before?.referenceRevision ?? 0) + 1);
    expect(program.byCall.size).toBe(calls.size);
    expect(project.getProgram().compilerObject === native).toBe(true);
    const first = readAuthoredCallableSources(call.getExpression(), (candidate) => program.byCall.has(candidate.compilerNode), observed);
    expect(first.kind === "resolved" && first.value.every((source) => source.value === implementation.getFunctionOrThrow("chosen"))).toBe(true);
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
