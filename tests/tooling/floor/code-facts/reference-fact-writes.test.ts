// Strong collection-use proof is separate from the source-local explicit-write queries.

import { runInNewContext } from "node:vm";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Node as MorphNode } from "ts-morph";
import { Node, Project, SyntaxKind, ts } from "ts-morph";
import { vi } from "vitest";
import { observeCallReturns } from "../../../../tooling/src/floor/code-facts/call-returns.ts";
import {
  beginReferencePass,
  endReferencePass,
  inspectInheritedReadEffects,
  inspectReferenceWrites,
} from "../../../../tooling/src/floor/code-facts/reference-fact.ts";
import type { InheritedReadEffectContext } from "../../../../tooling/src/floor/code-facts/reference-fact-contract.ts";
import { unprovenReferenceUse } from "../../../../tooling/src/floor/code-facts/reference-fact-writes.ts";
import { readAuthoredCallableSources } from "../../../../tooling/src/floor/code-facts/value-carrier.ts";
import { nativeCompilerSourceFiles } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";

function query(files: Readonly<Record<string, string>>, source = "source.ts"): MorphNode | undefined {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, text] of Object.entries(files)) {
    project.createSourceFile(`/repo/${path}`, text);
  }
  const accepted = new Set<MorphNode>();
  for (const file of project.getSourceFiles()) {
    const sink = file.getVariableDeclaration("sink")?.getInitializer();
    const data = Node.isObjectLiteralExpression(sink) ? sink.getProperty("data") : undefined;
    if (Node.isPropertyAssignment(data)) {
      accepted.add(data.getInitializerOrThrow());
    }
  }
  const name = project.getSourceFileOrThrow(`/repo/${source}`).getVariableDeclarationOrThrow("VALUES").getNameNode().asKindOrThrow(SyntaxKind.Identifier);
  return unprovenReferenceUse(name, accepted);
}

test("const identity aliases reach exact endpoints; a spread copy can change without mutating its source", () => {
  expect(query({ "source.ts": "const VALUES = []; const ALIAS = (VALUES as readonly unknown[]); const sink = { data: ALIAS };" })).toBeUndefined();
  expect(query({ "source.ts": "const VALUES = []; const COPY = [...VALUES]; COPY.push(1); const sink = { data: VALUES };" })).toBeUndefined();
  expect(query({ "source.ts": "const VALUES = []; const ALIAS = VALUES; ALIAS.push(1); const sink = { data: VALUES };" })?.getText()).toBe("ALIAS");
});

for (const [name, extra] of [
  ["opaque argument", "opaque(VALUES);"],
  ["callback", "VALUES.map(() => 1);"],
  ["ordinary array storage", "const storage = [VALUES];"],
  ["object storage", "const storage = { data: VALUES };"],
  ["return", "function escape() { return VALUES; }"],
  ["explicit write", "VALUES.length = 1;"],
  ["mutable alias", "let mutable = VALUES;"],
] as const) {
  test(`unaccounted ${name} refuses even beside an accepted endpoint`, () => {
    expect(query({ "source.ts": `const VALUES = []; ${extra} const sink = { data: VALUES };` })).toBeDefined();
  });
}

for (const imported of ["import { VALUES } from './source.ts';", "import { OTHER as VALUES } from './barrel.ts';"]) {
  test(`compiler references preserve imported identity and catch its consumer mutation: ${imported}`, () => {
    const files = {
      "source.ts": "export const VALUES = [];",
      "barrel.ts": "export { VALUES as OTHER } from './source.ts';",
      "use.ts": `${imported} const sink = { data: VALUES };`,
    };
    expect(query(files)?.getText()).toBeUndefined();
    expect(query({ ...files, "use.ts": `${imported} const ALIAS = VALUES; opaque(ALIAS); const sink = { data: VALUES };` })?.getText()).toBe("ALIAS");
  });
}

test("erased types are harmless; initializer readability remains a separate query", () => {
  expect(query({ "source.ts": "const VALUES = []; type Shape = typeof VALUES; const sink = { data: VALUES };" })).toBeUndefined();
  expect(query({ "source.ts": "declare const VALUES: unknown; const sink = { data: VALUES };" })).toBeUndefined();
});

for (const scenario of ["closed", "escaped", "written"] as const) {
  test(`an explicit proven alias queues actual reference closure: ${scenario}`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile("/repo/leaf.ts", "export function pick(){return 1;}");
    const continuations = { closed: "", escaped: "escape(alias);", written: "alias=()=>2;" };
    const source = project.createSourceFile("/repo/use.ts", `const {pick:alias}=await import("./leaf.ts");${continuations[scenario]}alias();`);
    const declaration = project.getSourceFileOrThrow("/repo/leaf.ts").getFunctionOrThrow("pick").getNameNodeOrThrow();
    const binding = source.getFirstDescendantByKindOrThrow(SyntaxKind.BindingElement);
    const alias = binding.getNameNode().asKindOrThrow(SyntaxKind.Identifier);
    const property = binding.getPropertyNameNodeOrThrow();
    const refusal = unprovenReferenceUse(declaration, (use) => {
      if (use === property) {
        return alias;
      }
      const parent = use.getParent();
      return Node.isCallExpression(parent) && parent.getExpression() === use && use.getText() === "alias";
    });
    expect(refusal === undefined).toBe(scenario === "closed");
  });
}

function effectContext(project: Project, sources = project.getSourceFiles()): InheritedReadEffectContext {
  const observed = observeCallReturns(
    sources.flatMap((source) => source.getDescendantsOfKind(SyntaxKind.CallExpression)),
    sources.flatMap((source) => source.getDescendants()),
    { suppliedCallableTargets: true },
  );
  const program = observed.programs[0];
  if (program === undefined) {
    throw new Error("the effect fixture requires its actual native captured call context");
  }
  return { program };
}

for (const first of [true, false]) {
  test(`conditional inherited proof retains a ${first ? "first" : "late"} bad exposure and does not poison an ordinary query`, () => {
    const bad = "Object.defineProperty(Object.prototype,'payload',{get(){this.settle=()=>2;return undefined;}});";
    const code = `
      ${first ? bad : ""}
      const table={local:()=>true};
      function mode(deps){const {config={mode:'local'}}=deps;void deps.timers;return config.mode;}
      function dispatch(key){return table[key]();}
      const selectedMode=mode({config:{mode:'local'}});dispatch(selectedMode);
      ${first ? "" : bad}
      function consume(value){return value;}
      function select(ctx){consume({value:ctx.payload});return ctx.settle();}
      const context={settle:()=>1};const answer=select(context);
      const independent={settle:()=>3};independent.settle();
    `;
    expect(runInNewContext(`${code};answer;`)).toBe(2);
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile("/conditional-effect-order.ts", code);
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const selected = calls.find((call) => call.getExpression().getText() === "ctx.settle");
    const independent = calls.find((call) => call.getExpression().getText() === "independent.settle");
    if (selected === undefined || independent === undefined) {
      throw new Error("the actual containing-use targets are missing");
    }
    beginReferencePass();
    try {
      const context = effectContext(project);
      const observations = { programs: [context.program] };
      expect(readAuthoredCallableSources(selected.getExpression(), undefined, observations).kind).toBe("unresolved");
      const next = readAuthoredCallableSources(independent.getExpression(), undefined, observations);
      expect(next.kind === "resolved" ? next.value.map((leaf) => leaf.value.getText()) : next.detail).toEqual(["()=>3"]);
    } finally {
      endReferencePass();
    }
  });
}

for (const dispatch of [false, true]) {
  test(`conditional native background data retains unrelated ${dispatch ? "computed dispatch" : "no dispatch"}`, () => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { target: ts.ScriptTarget.ESNext, lib: ["lib.esnext.d.ts", "lib.dom.d.ts"] } });
    const source = project.createSourceFile(
      "/background-dispatch.ts",
      `
      ${
        dispatch
          ? `
      type Mode="single-user"|"local"|"forward-header"|"oidc";
      const CAPABLE:Record<Mode,(multiple:boolean)=>boolean>={
        "single-user":()=>false,local:(multiple)=>multiple,"forward-header":()=>true,oidc:()=>true,
      };
      function capability(mode:Mode,multiple:boolean){return CAPABLE[mode](multiple);}
      capability("local",true);
      `
          : ""
      }
      interface Context{settle:()=>number;backgroundSignal?:AbortSignal}
      function consume(ctx:Context){return ctx.settle();}
      function segments(ctx:Context,options:{signal?:AbortSignal}){return options.signal===undefined;}
      function engine(ctx:Context){segments(ctx,{signal:ctx.backgroundSignal});return consume(ctx);}
      function compose(input:{backgroundSignal?:AbortSignal}){
        const context={settle:()=>1,...(input.backgroundSignal===undefined?{}:{backgroundSignal:input.backgroundSignal})};
        return engine(context);
      }
      function background(){const controller=new AbortController();return {signal:controller.signal,async [Symbol.asyncDispose](){controller.abort();}};}
      const resources=new AsyncDisposableStack();const work=resources.use(background());compose({backgroundSignal:work.signal});
    `,
    );
    const call = source.getDescendantsOfKind(SyntaxKind.CallExpression).find((candidate) => candidate.getExpression().getText() === "ctx.settle");
    const expected = source.getFunctionOrThrow("compose").getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
    if (call === undefined) {
      throw new Error("the conditional background consumer is missing");
    }
    beginReferencePass();
    try {
      const captured = effectContext(project);
      const result = readAuthoredCallableSources(call.getExpression(), (candidate) => captured.program.byCall.has(candidate.compilerNode), {
        programs: [captured.program],
      });
      expect(result.kind, result.kind === "unresolved" ? `${result.reason}: ${result.detail} at ${result.node.getText()}` : "resolved").toBe("resolved");
      expect(result.kind === "resolved" && result.value.length === 1 && result.value[0]?.value === expected).toBe(true);
    } finally {
      endReferencePass();
    }
  });
}

const AUTHORED_DISPATCH_EFFECTS = [
  {
    name: "a true selector value cycle",
    before: "function recursive(){return recursive();}",
    entries: "safe:()=>1",
    body: "",
    calls: "dispatch(recursive());",
    resolved: true,
  },
  {
    name: "selector coercion with a prototype exposure",
    before: "const coercing={toString(){Object.defineProperty(Object.prototype,'payload',{get(){this.settle=()=>2;}});return 'safe';}};",
    entries: "safe:()=>1",
    body: "",
    calls: "dispatch(coercing as never);",
    resolved: false,
  },
  {
    name: "a producer callback exposure before normal return",
    before: "function produce(before:()=>void){before();return 'safe';}",
    entries: "safe:()=>1",
    body: "",
    calls: "dispatch(produce(()=>Object.defineProperty(Object.prototype,'payload',{get(){this.settle=()=>2;}})));",
    resolved: false,
  },
  { name: "actual literal selector", before: "", entries: "safe:()=>1", body: "", calls: "dispatch('safe');", resolved: true },
  {
    name: "distinct supplied selectors",
    before: "",
    entries: "safe:()=>1,other:()=>2",
    body: "",
    calls: "dispatch('safe');dispatch('other');",
    resolved: true,
  },
  { name: "unbound annotated selector", before: "declare const key:'safe';", entries: "safe:()=>1", body: "", calls: "dispatch(key);", resolved: true },
  { name: "asserted inherited selector", before: "", entries: "safe:()=>1", body: "", calls: "dispatch('__proto__' as 'safe');", resolved: true },
  { name: "missing own callee", before: "", entries: "safe:()=>1", body: "", calls: "dispatch('missing');", resolved: true },
  { name: "inherited constructor", before: "", entries: "safe:()=>1", body: "", calls: "dispatch('constructor');", resolved: true },
  { name: "getter selected callee", before: "", entries: "get safe(){return ()=>1;}", body: "", calls: "dispatch('safe');", resolved: true },
  {
    name: "opaque selected callee",
    before: "declare function foreign():number;",
    entries: "safe:foreign",
    body: "",
    calls: "dispatch('safe');",
    resolved: true,
  },
  { name: "native selected callee", before: "", entries: "safe:Object.defineProperty", body: "", calls: "dispatch('safe');", resolved: false },
  { name: "written actual selector", before: "", entries: "safe:()=>1", body: "key='constructor';", calls: "dispatch('safe');", resolved: true },
  { name: "written table alias", before: "", entries: "safe:()=>1", body: "const alias=table;alias.safe=()=>2;", calls: "dispatch('safe');", resolved: true },
  {
    name: "opaque receiver escape",
    before: "declare function escape(value:object):void;",
    entries: "safe:()=>1",
    body: "escape(table);",
    calls: "dispatch('safe');",
    resolved: true,
  },
  {
    name: "callee body prototype effect",
    before: "",
    entries: "safe:()=>{Object.defineProperty(Object.prototype,'payload',{get(){this.settle=()=>2;}});return 1;}",
    body: "",
    calls: "dispatch('safe');",
    resolved: false,
  },
  {
    name: "callee parameter initializer effect",
    before: "",
    entries: "safe:(ignored=Reflect.defineProperty(Object.prototype,'payload',{get(){this.settle=()=>2;}}))=>1",
    body: "",
    calls: "dispatch('safe');",
    resolved: false,
  },
  {
    name: "callee aliased native effect",
    before: "const define=Reflect.defineProperty;const prototype=Object.getPrototypeOf({});",
    entries: "safe:()=>{define(prototype,'payload',{get(){this.settle=()=>2;}});return 1;}",
    body: "",
    calls: "dispatch('safe');",
    resolved: false,
  },
  {
    name: "shadowed native spelling with an authored body",
    before: "const Object={defineProperty:()=>1};",
    entries: "safe:()=>Object.defineProperty()",
    body: "",
    calls: "dispatch('safe');",
    resolved: true,
  },
  {
    name: "shadowed native spelling retaining real prototype effects",
    before: "const Object={defineProperty:()=>globalThis.Object.defineProperty(globalThis.Object.prototype,'payload',{get(){this.settle=()=>2;}})};",
    entries: "safe:()=>Object.defineProperty()",
    body: "",
    calls: "dispatch('safe');",
    resolved: false,
  },
] as const;

for (const configured of [true, false]) {
  test(`inherited authored dispatch follows factory-bound ${configured ? "actual" : "annotation-only"} configuration`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile(
      "/configured-dispatch.ts",
      `
      type Mode="local"|"single-user";
      const table={local:(multiple:boolean)=>multiple,"single-user":()=>false};
      function capability(mode:Mode,multiple:boolean){return table[mode](multiple);}
      function createCapability(mode:Mode,readConfig:()=>{localMultiUser:boolean}){
        return ()=>capability(mode,readConfig().localMultiUser);
      }
      function services(config:{authMode:Mode}){
        const enabled=createCapability(config.authMode,()=>({localMultiUser:true}));return enabled();
      }
      ${configured ? 'const config={authMode:"local" as const};' : "declare const config:{authMode:Mode};"}
      services(config);
      function consume(payload:object|undefined){return payload;}
      function selected(ctx:{settle:()=>number;payload?:object}){consume(ctx.payload);return ctx.settle();}
      const context={settle:()=>1};selected(context);
    `,
    );
    const call = source.getDescendantsOfKind(SyntaxKind.CallExpression).find((candidate) => candidate.getExpression().getText() === "ctx.settle");
    if (call === undefined) {
      throw new Error("the configured dispatch consumer is missing");
    }
    beginReferencePass();
    try {
      const captured = effectContext(project);
      const result = readAuthoredCallableSources(call.getExpression(), (candidate) => captured.program.byCall.has(candidate.compilerNode), {
        programs: [captured.program],
      });
      expect(result.kind, result.kind === "unresolved" ? `${result.reason}: ${result.detail} at ${result.node.getText()}` : "resolved").toBe("resolved");
    } finally {
      endReferencePass();
    }
  });
}

for (const scenario of AUTHORED_DISPATCH_EFFECTS) {
  test(`inherited authored dispatch preserves ${scenario.name}`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile(
      "/authored-dispatch.ts",
      `
      export {};
      ${scenario.before}
      const table={${scenario.entries}};
      function dispatch(key:string){${scenario.body}return table[key]();}
      ${scenario.calls}
      function consume(payload:object|undefined){return payload;}
      function selected(ctx:{settle:()=>number;payload?:object}){consume(ctx.payload);return ctx.settle();}
      const context={settle:()=>1};selected(context);
    `,
    );
    const call = source.getDescendantsOfKind(SyntaxKind.CallExpression).find((candidate) => candidate.getExpression().getText() === "ctx.settle");
    if (call === undefined) {
      throw new Error("the selected authored dispatch consumer is missing");
    }
    beginReferencePass();
    try {
      const captured = effectContext(project);
      const result = readAuthoredCallableSources(call.getExpression(), (candidate) => captured.program.byCall.has(candidate.compilerNode), {
        programs: [captured.program],
      });
      expect(result.kind, result.kind === "unresolved" ? `${result.reason}: ${result.detail} at ${result.node.getText()}` : "resolved").toBe(
        scenario.resolved ? "resolved" : "unresolved",
      );
      const expected = source.getVariableDeclarationOrThrow("context").getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
      expect(result.kind === "resolved" && result.value.length === 1 && result.value[0]?.value === expected).toBe(scenario.resolved);
    } finally {
      endReferencePass();
    }
  });
}

for (const secondKey of ["safe", "constructor"]) {
  test(`inherited authored dispatch retains distinct actual receiver allocations: ${secondKey}`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile(
      "/allocated-dispatch.ts",
      `
      function dispatch(table:{safe:()=>number},key:string){return table[key]();}
      dispatch({safe:()=>1},'safe');dispatch({safe:()=>2},${JSON.stringify(secondKey)});
      function consume(payload:object|undefined){return payload;}
      function selected(ctx:{settle:()=>number;payload?:object}){consume(ctx.payload);return ctx.settle();}
      const context={settle:()=>1};selected(context);
    `,
    );
    const call = source.getDescendantsOfKind(SyntaxKind.CallExpression).find((candidate) => candidate.getExpression().getText() === "ctx.settle");
    if (call === undefined) {
      throw new Error("the selected allocation consumer is missing");
    }
    beginReferencePass();
    try {
      const captured = effectContext(project);
      const result = readAuthoredCallableSources(call.getExpression(), (candidate) => captured.program.byCall.has(candidate.compilerNode), {
        programs: [captured.program],
      });
      expect(result.kind, result.kind === "unresolved" ? `${result.reason}: ${result.detail} at ${result.node.getText()}` : "resolved").toBe("resolved");
    } finally {
      endReferencePass();
    }
  });
}

const INHERITED_EFFECTS = [
  "Object.defineProperty(Object.prototype,'payload',{get(){this.settle=()=>2;}});",
  "const prototype=Object.getPrototypeOf({});Object.defineProperties(prototype,{payload:{get(){this.settle=()=>2;}}});",
  "const prototype=Reflect.getPrototypeOf({});const define=Reflect.defineProperty;define(prototype,'payload',{get(){this.settle=()=>2;}});",
  "const constructor=({}).constructor;Object.defineProperty(constructor.prototype,'payload',{get(){this.settle=()=>2;}});",
  "const {constructor}=({});Object.defineProperty(constructor.prototype,'payload',{get(){this.settle=()=>2;}});",
  "const {__proto__:prototype}=({});leak(prototype);",
  "const prototype=Object.prototype;leak(prototype);",
  "const ObjectAlias=Object;leak(ObjectAlias);",
  "const ObjectAlias=globalThis['Object'];leak(ObjectAlias);",
  { effect: "declare const key:string;const prototype=({})[key];leak(prototype);", exposure: false },
  "Object.setPrototypeOf(Object.prototype,{get payload(){this.settle=()=>2;}});",
  "declare const key:string;declare const foreign:object;foreign[key]={get payload(){this.settle=()=>2;}};",
  { effect: "declare const key:string;declare const foreign:object;foreign[key]('payload',()=>2);", exposure: false },
  "Object.defineProperty(foreign,'payload',{get(){this.settle=()=>2;}});",
] as const;
for (const entry of INHERITED_EFFECTS) {
  const effect = typeof entry === "string" ? entry : entry.effect;
  const exposure = typeof entry === "string" || entry.exposure;
  test(`loaded native Project refuses inherited exposure in an uncaptured source: ${effect}`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile("/selected.ts", "const context={settle:()=>1};context.payload;context.settle();");
    project.createSourceFile("/effect.ts", `declare function leak(value:object):void;${effect}`);
    const context = source.getVariableDeclarationOrThrow("context").getInitializerOrThrow();
    beginReferencePass();
    try {
      const captured = effectContext(project, [source]);
      expect(captured.program.sources.has(project.getSourceFileOrThrow("/effect.ts"))).toBe(false);
      const fact = inspectInheritedReadEffects(context, captured);
      expect(fact.kind).toBe(exposure ? "unresolved" : "resolved");
      expect(!exposure || (fact.kind === "unresolved" && fact.node.getSourceFile().getFilePath() === "/effect.ts")).toBe(true);
    } finally {
      endReferencePass();
    }
  });
}

test("complete loaded-source effect collection is pass-owned; new sources and mutations invalidate its negative fact", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile("/selected.ts", "const context={settle:()=>1};context.payload;context.settle();");
  const context = source.getVariableDeclarationOrThrow("context").getInitializerOrThrow();
  const effect = project.createSourceFile("/effects.ts", "const value={a:1};value.a=2;Object.keys({a:1});");
  const identifier = effect
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .find((node) => node.getText() === "value" && Node.isPropertyAccessExpression(node.getParent()));
  if (identifier === undefined) {
    throw new Error("the real write target is missing");
  }
  const collect = vi.spyOn(identifier, "getSymbol");
  const admission = vi.spyOn(project, "getProgram");
  for (let index = 0; index < 16; index++) {
    project.createSourceFile(`/data-${index}.ts`, `export const data${index}={value:${index}};`);
  }
  beginReferencePass();
  try {
    const captured = effectContext(project);
    expect(inspectInheritedReadEffects(context, captured).kind).toBe("resolved");
    const first = collect.mock.calls.length;
    const admitted = admission.mock.calls.length;
    expect(first).toBeGreaterThan(0);
    for (let index = 0; index < 8; index++) {
      expect(inspectInheritedReadEffects(context, captured).kind).toBe("resolved");
    }
    expect(collect.mock.calls.length).toBe(first);
    expect(admission.mock.calls.length).toBeGreaterThan(admitted);
    project.createSourceFile("/new-effect.ts", "Object.defineProperty(Object.prototype,'payload',{get(){return 2;}});");
    expect(inspectInheritedReadEffects(context, captured).kind).toBe("unresolved");
    expect(inspectInheritedReadEffects(context, effectContext(project)).kind).toBe("unresolved");
  } finally {
    endReferencePass();
    collect.mockRestore();
    admission.mockRestore();
  }
});

test("effect facts do not survive source replacement, forgotten input, or reference-pass release", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const selected = project.createSourceFile("/selected.ts", "const context={settle:()=>1};context.settle();");
  const context = selected.getVariableDeclarationOrThrow("context").getInitializerOrThrow();
  const effects = project.createSourceFile("/effects.ts", "Object.keys({});");
  const name = effects.getFirstDescendantByKindOrThrow(SyntaxKind.Identifier);
  const collect = vi.spyOn(name, "getSymbol");
  const captured = effectContext(project);
  beginReferencePass();
  try {
    expect(inspectInheritedReadEffects(context, captured).kind).toBe("resolved");
  } finally {
    endReferencePass();
  }
  const first = collect.mock.calls.length;
  beginReferencePass();
  try {
    expect(inspectInheritedReadEffects(context, captured).kind).toBe("resolved");
    expect(collect.mock.calls.length).toBeGreaterThan(first);
    effects.replaceWithText("Object.defineProperty(Object.prototype,'payload',{get(){return 2;}});");
    expect(inspectInheritedReadEffects(context, effectContext(project)).kind).toBe("unresolved");
    const changed = effectContext(project);
    context.forget();
    expect(inspectInheritedReadEffects(context, changed).kind).toBe("unresolved");
  } finally {
    endReferencePass();
    collect.mockRestore();
  }
});

for (const key of ["value", "__proto__"]) {
  test(`inherited effect closure retains the actual supplied dynamic key ${key}`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile(
      "/contextual-key.ts",
      `
      declare function escape(value:object):void;
      function relay(object:{value:object},key:string){const value=object[key];escape(value);}
      relay({value:{}},${JSON.stringify(key)});
      function consume(value:object|undefined){return value;}
      function selected(ctx:{settle:()=>number;payload?:object}){consume(ctx.payload);return ctx.settle();}
      const context={settle:()=>1};selected(context);
    `,
    );
    const call = source.getDescendantsOfKind(SyntaxKind.CallExpression).find((candidate) => candidate.getExpression().getText() === "ctx.settle");
    if (call === undefined) {
      throw new Error("the selected callable is missing");
    }
    beginReferencePass();
    try {
      const captured = effectContext(project);
      const fact = readAuthoredCallableSources(call.getExpression(), (candidate) => captured.program.byCall.has(candidate.compilerNode), {
        programs: [captured.program],
      });
      expect(fact.kind, fact.kind === "unresolved" ? `${fact.detail} at ${fact.node.getText()}` : "resolved").toBe("resolved");
    } finally {
      endReferencePass();
    }
  });
}

const CONTEXTUAL_EFFECT_CASES = [
  { name: "two distinct safe allocations", body: "", before: "", calls: "relay({value:{}},'value');relay({value:{}},'value');", resolved: true },
  { name: "second allocation exposes the prototype", body: "", before: "", calls: "relay({value:{}},'value');relay({},'__proto__');", resolved: true },
  { name: "written key formal", body: "key='__proto__';", before: "", calls: "relay({value:{}},'value');", resolved: true },
  { name: "written receiver formal", body: "object.value=foreign();", before: "", calls: "relay({value:{}},'value');", resolved: true },
  {
    name: "receiver descriptor replacement",
    body: "Object.defineProperty(object,'value',{get(){return foreign();}});",
    before: "",
    calls: "relay({value:{}},'value');",
    resolved: false,
  },
  {
    name: "actual receiver alias write",
    body: "",
    before: "const actual={value:{}};actual.value=foreign();",
    calls: "relay(actual,'value');",
    resolved: true,
  },
  { name: "receiver opaque escape", body: "escape(object);", before: "", calls: "relay({value:{}},'value');", resolved: true },
  { name: "immutable primitive key observation", body: "escape(key);", before: "", calls: "relay({value:{}},'value');", resolved: true },
] as const;
for (const scenario of CONTEXTUAL_EFFECT_CASES) {
  test(`inherited dynamic-key projection preserves ${scenario.name}`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile(
      "/contextual-effects.ts",
      `
      declare function escape(value:object|string):void;declare function foreign():object;
      function relay(object:{value:object},key:string){${scenario.body}const value=object[key];escape(value);}
      ${scenario.before}${scenario.calls}
      function consume(value:object|undefined){return value;}
      function selected(ctx:{settle:()=>number;payload?:object}){consume(ctx.payload);return ctx.settle();}
      const context={settle:()=>1};selected(context);
    `,
    );
    const call = source.getDescendantsOfKind(SyntaxKind.CallExpression).find((candidate) => candidate.getExpression().getText() === "ctx.settle");
    if (call === undefined) {
      throw new Error("the selected callable is missing");
    }
    beginReferencePass();
    try {
      const captured = effectContext(project);
      const fact = readAuthoredCallableSources(call.getExpression(), (candidate) => captured.program.byCall.has(candidate.compilerNode), {
        programs: [captured.program],
      });
      expect(fact.kind, fact.kind === "unresolved" ? `${fact.detail} at ${fact.node.getText()}` : "resolved").toBe(
        scenario.resolved ? "resolved" : "unresolved",
      );
    } finally {
      endReferencePass();
    }
  });
}

test("prototype census does not enlist unrelated sparse captured callers", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    "/capture-effects.ts",
    `
    declare function escape(value:object):void;
    function relay(object:{value:object},key:string){const value=object[key];escape(value);}
    relay({value:{}},'value');
    function consume(value:object|undefined){return value;}
    function selected(ctx:{settle:()=>number;payload?:object}){consume(ctx.payload);return ctx.settle();}
    const context={settle:()=>1};selected(context);
  `,
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const root = calls.find((call) => call.getExpression().getText() === "selected");
  const target = calls.find((call) => call.getExpression().getText() === "ctx.settle");
  if (root === undefined || target === undefined) {
    throw new Error("the captured root and target are missing");
  }
  beginReferencePass();
  try {
    const partial = observeCallReturns([root], source.getDescendants(), { suppliedCallableTargets: true });
    const before = partial.programs[0];
    if (before === undefined) {
      throw new Error("the partial captured native Program is missing");
    }
    expect(readAuthoredCallableSources(target.getExpression(), (call) => before.byCall.has(call.compilerNode), partial).kind).toBe("resolved");
    const complete = effectContext(project);
    expect(complete.program.program === before.program).toBe(true);
    const after = readAuthoredCallableSources(target.getExpression(), (call) => complete.program.byCall.has(call.compilerNode), {
      programs: [complete.program],
    });
    expect(after.kind, after.kind === "unresolved" ? after.detail : "resolved").toBe("resolved");
    const sparseAgain = observeCallReturns([root], source.getDescendants(), { suppliedCallableTargets: true });
    const next = sparseAgain.programs[0];
    if (next === undefined) {
      throw new Error("the next sparse capture is missing");
    }
    expect(next.program === before.program).toBe(true);
    expect(readAuthoredCallableSources(target.getExpression(), (call) => next.byCall.has(call.compilerNode), sparseAgain).kind).toBe("resolved");
  } finally {
    endReferencePass();
  }
});

test("source effect collection preserves standalone native checker wrappers without a Project owner", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const original = project.createSourceFile("/standalone-effects.ts", "const value={field:1};value.field=2;");
  const program = project.getProgram().compilerObject;
  const wrapped = nativeCompilerSourceFiles(program);
  try {
    const source = wrapped.find((file) => file.getFilePath() === "/standalone-effects.ts");
    if (source === undefined) {
      throw new Error("the standalone native source is missing");
    }
    const name = source.getVariableDeclarationOrThrow("value").getNameNode().asKindOrThrow(SyntaxKind.Identifier);
    expect(() => source.getProject()).toThrow("not permitted in this context");
    const fact = inspectReferenceWrites(name);
    expect(fact.kind === "unresolved" && fact.reason === "write").toBe(true);
    expect(project.getProgram().compilerObject === program && !original.wasForgotten()).toBe(true);
  } finally {
    for (const source of wrapped) {
      source.forget();
    }
  }
});
