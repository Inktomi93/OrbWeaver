// Strong collection-use proof is separate from the source-local explicit-write queries.

import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { observeCallReturns } from "@orb/tooling/floor/code-facts/call-returns";
import { beginReferencePass, endReferencePass, inspectInheritedReadEffects, inspectReferenceWrites } from "@orb/tooling/floor/code-facts/reference-fact";
import type { InheritedReadEffectContext } from "@orb/tooling/floor/code-facts/reference-fact-contract";
import { unprovenReferenceUse } from "@orb/tooling/floor/code-facts/reference-fact-writes";
import { readAuthoredCallableSources, readReturnedValue } from "@orb/tooling/floor/code-facts/value-carrier";
import { nativeCompilerSourceFiles } from "@orb/tooling/floor/compiler/ts-workspace";
import type { Node as MorphNode } from "ts-morph";
import { Node, Project, SyntaxKind } from "ts-morph";
import { vi } from "vitest";

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
  return { program, values: (node, path, bindings) => readReturnedValue(node, path, observed, { terminals: new Set(), bindings }) };
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
  "declare const key:string;const prototype=({})[key];leak(prototype);",
  "Object.setPrototypeOf(Object.prototype,{get payload(){this.settle=()=>2;}});",
  "declare const key:string;declare const foreign:object;foreign[key]={get payload(){this.settle=()=>2;}};",
  "declare const key:string;declare const foreign:object;foreign[key]('payload',()=>2);",
  "Object.defineProperty(foreign,'payload',{get(){this.settle=()=>2;}});",
] as const;
for (const effect of INHERITED_EFFECTS) {
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
      expect(fact.kind).toBe("unresolved");
      expect(fact.kind === "unresolved" && fact.node.getSourceFile().getFilePath() === "/effect.ts").toBe(true);
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
      expect(fact.kind, fact.kind === "unresolved" ? `${fact.detail} at ${fact.node.getText()}` : "resolved").toBe(key === "value" ? "resolved" : "unresolved");
    } finally {
      endReferencePass();
    }
  });
}

const CONTEXTUAL_EFFECT_CASES = [
  { name: "two distinct safe allocations", body: "", before: "", calls: "relay({value:{}},'value');relay({value:{}},'value');", resolved: true },
  { name: "second allocation exposes the prototype", body: "", before: "", calls: "relay({value:{}},'value');relay({},'__proto__');", resolved: false },
  { name: "written key formal", body: "key='__proto__';", before: "", calls: "relay({value:{}},'value');", resolved: false },
  { name: "written receiver formal", body: "object.value=foreign();", before: "", calls: "relay({value:{}},'value');", resolved: false },
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
    resolved: false,
  },
  { name: "receiver opaque escape", body: "escape(object);", before: "", calls: "relay({value:{}},'value');", resolved: false },
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

test("neutral effect facts do not cache a sparse captured caller refusal as a native Program verdict", () => {
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
    expect(readAuthoredCallableSources(target.getExpression(), (call) => before.byCall.has(call.compilerNode), partial).kind).toBe("unresolved");
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
    expect(readAuthoredCallableSources(target.getExpression(), (call) => next.byCall.has(call.compilerNode), sparseAgain).kind).toBe("unresolved");
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
