import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import {
  beginReferencePass,
  endReferencePass,
  inspectInheritedReadEffects,
  readModuleAliasBinding,
  resolveModuleMemberOrigin,
} from "@orb/tooling/floor/code-facts/reference-fact";
import type { ArrowFunction, CallExpression, FunctionDeclaration, Node as MorphNode, ParameterDeclaration, SourceFile } from "ts-morph";
import { Project, SyntaxKind, ts } from "ts-morph";
import {
  observeCallReturns,
  readCallTargets,
  readObservedCallableConsumers,
  readSuppliedParameter,
} from "../../../../tooling/src/floor/code-facts/call-returns.ts";
import type {
  CallReturnObservations,
  CallReturnProgram,
  InheritedReadPremise,
  ReturnedValueContext,
} from "../../../../tooling/src/floor/code-facts/reference-fact-contract.ts";
import { readReturnedValue } from "../../../../tooling/src/floor/code-facts/value-carrier.ts";

const DYNAMIC_ORIGIN_CASES = ["direct", "local", "destructured", "computed", "transitive"] as const;
const DYNAMIC_FILES = {
  "/repo/leaf.ts": "export function pick() { return 1; }\n",
  "/repo/barrel.ts": 'export { pick } from "./leaf.ts";\n',
  "/repo/bridge.ts": 'export * from "./barrel.ts";\n',
};

const LOCAL_FILES = {
  "/repo/leaf.ts": "export const record = () => 1; export const publicName = () => 2;\n",
  "/repo/default.ts": 'export { record as default } from "./leaf.ts";\n',
  "/repo/use.ts": 'import { publicName } from "./barrel.ts";\nexport const value = publicName;\n',
};

test.for(["default", "destructured"] as const)("the particular %s local export binding determines canonical identity", (scenario) => {
  const source =
    scenario === "default"
      ? 'import drive from "./default.ts";\nexport { drive as publicName };\n'
      : 'const { record: drive } = await import("./leaf.ts");\nexport { drive as publicName };\n';
  const fact = pickOrigin({ ...LOCAL_FILES, "/repo/barrel.ts": source });
  expect(fact).toMatchObject({ kind: "resolved", value: { canonical: { kind: "project", exportedName: "record" } } });
  expect(fact.trace.declarations.map((declaration) => declaration.getSourceFile().getFilePath())).toContain("/repo/barrel.ts");
});

const LOCAL_REFUSALS = ["missing", "wrong-member", "cycle", "write"] as const;
test.for(LOCAL_REFUSALS)("local export provenance refuses %s instead of borrowing the same-named leaf member", (scenario) => {
  const sources = {
    missing: 'import { record as drive } from "./missing.ts";\nexport { drive as publicName };\n',
    "wrong-member": 'import { absent as drive } from "./leaf.ts";\nexport { drive as publicName };\n',
    cycle: 'import { publicName as drive } from "./barrel.ts";\nexport { drive as publicName };\n',
    write: 'import { record } from "./leaf.ts";\nlet drive = record;\nexport { drive as publicName };\n',
  } satisfies Record<(typeof LOCAL_REFUSALS)[number], string>;
  const reasons = { missing: "missing", "wrong-member": "missing", cycle: "cycle", write: "write" } as const;
  expect(pickOrigin({ ...LOCAL_FILES, "/repo/barrel.ts": sources[scenario] })).toMatchObject({ kind: "unresolved", reason: reasons[scenario] });
});

test.for(DYNAMIC_ORIGIN_CASES)("dynamic namespace origin preserves its module path: %s", (scenario) => {
  const sources = {
    direct: 'export const value = (await import("./barrel.ts")).pick;\n',
    local: 'const namespace = await import("./barrel.ts");\nconst alias = namespace;\nexport const value = alias.pick;\n',
    destructured: 'const { pick } = await import("./barrel.ts");\nexport const value = pick;\n',
    computed: 'export const value = (await import("./barrel.ts"))["pick"];\n',
    transitive: 'export const value = (await import("./bridge.ts")).pick;\n',
  } satisfies Record<(typeof DYNAMIC_ORIGIN_CASES)[number], string>;
  const fact = pickOrigin({
    ...DYNAMIC_FILES,
    "/repo/use.ts": sources[scenario],
  });
  expect(fact).toMatchObject({ kind: "resolved", value: { canonical: { kind: "project", exportedName: "pick" } } });
  expect(fact.trace.declarations.map((declaration) => declaration.getSourceFile().getFilePath())).toContain("/repo/barrel.ts");
});

test.for(["missing", "nonliteral"] as const)("dynamic namespace origin refuses the %s door", (scenario) => {
  const source =
    scenario === "missing"
      ? 'export const value = (await import("./missing.ts")).pick;\n'
      : 'const route = "./barrel.ts";\nexport const value = (await import(route)).pick;\n';
  const fact = pickOrigin({ ...DYNAMIC_FILES, "/repo/use.ts": source });
  expect(fact).toMatchObject({ kind: "unresolved", reason: scenario === "missing" ? "missing" : "dynamic" });
});

for (const scenario of [
  { name: "native abrupt handler without captured effect context", before: "", receiver: 'import("./barrel.ts")', handler: "(error)=>{throw error;}" },
  { name: "returning handler", before: "", receiver: 'import("./barrel.ts")', handler: "()=>({pick:()=>2})" },
  { name: "returning wrong module", before: "", receiver: 'import("./barrel.ts")', handler: '()=>import("./wrong.ts")' },
  { name: "fake namespace", before: "const pending={catch:()=>({pick:()=>2})};", receiver: "pending", handler: "(error)=>{throw error;}" },
  {
    name: "overwritten catch",
    before: "Promise.prototype.catch=function(){return Promise.resolve({pick:()=>2});};",
    receiver: 'import("./barrel.ts")',
    handler: "(error)=>{throw error;}",
  },
  {
    name: "overwritten then",
    before: "Promise.prototype.then=function(){return Promise.resolve({pick:()=>2});};",
    receiver: 'import("./barrel.ts")',
    handler: "(error)=>{throw error;}",
  },
  {
    name: "overwritten species",
    before: "Object.defineProperty(Promise,Symbol.species,{value:class extends Promise{}});",
    receiver: 'import("./barrel.ts")',
    handler: "(error)=>{throw error;}",
  },
] as const) {
  test(`namespace catch transfer refuses without captured runtime evidence: ${scenario.name}`, () => {
    const fact = pickOrigin({
      ...DYNAMIC_FILES,
      "/repo/wrong.ts": "export function pick(){return 2;}",
      "/repo/use.ts": `${scenario.before}const {pick}=await ${scenario.receiver}.catch(${scenario.handler});export const value=pick;`,
    });
    expect(fact).toMatchObject({ kind: "unresolved", reason: "dynamic", detail: "AwaitExpression has no stable module-member origin" });
  });
}

for (const scenario of ["direct", "renamed", "wrong module", "foreign Program", "forgotten alias", "mutable", "reassigned"] as const) {
  test(`module alias closure requires exact native identity: ${scenario}`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile("/repo/leaf.ts", "export function pick(){return 1;}");
    project.createSourceFile("/repo/other.ts", "export function pick(){return 2;}");
    const use = project.createSourceFile(
      "/repo/use.ts",
      `${scenario === "mutable" ? "let" : "const"} {pick:alias}=await import("./${scenario === "wrong module" ? "other" : "leaf"}.ts");${scenario === "reassigned" ? "alias=()=>3;" : ""}alias();`,
    );
    const binding = use.getFirstDescendantByKindOrThrow(SyntaxKind.BindingElement);
    const name = binding.getNameNode();
    const reference = binding.getPropertyNameNodeOrThrow();
    let expected = source.getFunctionOrThrow("pick");
    if (scenario === "foreign Program") {
      const other = new Project({ useInMemoryFileSystem: true });
      expected = other.createSourceFile("/repo/leaf.ts", "export function pick(){return 1;}").getFunctionOrThrow("pick");
    }
    if (scenario === "forgotten alias") {
      use.replaceWithText("export const changed=1;");
    }
    const fact = readModuleAliasBinding(scenario === "direct" ? name : reference, expected);
    expect(fact?.kind).toBe(scenario === "direct" || scenario === "renamed" ? "resolved" : "unresolved");
    expect(fact?.kind === "resolved" ? fact.value.compilerNode : undefined).toBe(
      scenario === "direct" || scenario === "renamed" ? name.compilerNode : undefined,
    );
    expect(fact?.kind !== "resolved" || fact.trace.declarations.some((declaration) => declaration.compilerNode === expected.compilerNode)).toBe(true);
  });
}

for (const scenario of ["direct await", "incomplete wildcard", "static namespace"] as const) {
  test(`native dynamic module fulfillment rejects then assimilation without affecting ${scenario}`, () => {
    const fact = pickOrigin({
      "/repo/leaf.ts": "export function pick(){return 1;}export function then(resolve){resolve({pick:()=>2});}",
      "/repo/barrel.ts": 'export {pick} from "./leaf.ts";export * from "./opaque.ts";',
      "/repo/use.ts":
        scenario === "static namespace"
          ? 'import * as namespace from "./leaf.ts";export const value=namespace.pick;'
          : `export const value=(await import("./${scenario === "incomplete wildcard" ? "barrel" : "leaf"}.ts")).pick;`,
    });
    expect(fact.kind).toBe(scenario === "static namespace" ? "resolved" : "unresolved");
  });
}

const CAPTURED_NAMESPACE_CASES = [
  { name: "an actual native import and abrupt handler", handler: "error=>{throw error;}", expected: true },
  { name: "an unawaited Promise is not its namespace", awaited: false, expected: false },
  { name: "a const all-abrupt handler without carrier confusion", before: "const onReject=error=>{throw error;};", handler: "onReject", expected: true },
  { name: "both conditional handler branches throw", handler: "error=>{if(choose){throw error;}else{throw error;}}", expected: true },
  { name: "an immutable arrow export", arrow: true, expected: true },
  { name: "an unsupported factory-result export", factory: true, expected: false },
  { name: "an effect roster cannot borrow its unresolved export caller", circular: true, expected: false },
  { name: "the production-shaped conditional then throw", handler: "error=>{if(error instanceof Error){void error.message;}throw error;}", expected: true },
  { name: "a renamed fulfilled export", binding: "build", expected: true },
  { name: "a const fulfilled alias", after: "const alias=pick;", callee: "alias", expected: true },
  {
    name: "an escaped const fulfilled alias",
    after: "const alias=pick;declare function escape(value:object):void;escape(alias);",
    callee: "alias",
    expected: false,
  },
  { name: "a written fulfilled alias", after: "let alias=pick;alias=()=>2;", callee: "alias", expected: false },
  { name: "a reexported callable", module: "barrel", expected: true },
  { name: "a then-exported replacement namespace", leaf: "export function then(resolve){resolve({pick:()=>2});}", expected: false },
  { name: "an incomplete wildcard namespace roster", module: "barrel", barrel: 'export {pick} from "./leaf.ts";export * from "./opaque.ts";', expected: false },
  { name: "a returning rejection handler", handler: "()=>({pick:()=>2})", expected: false },
  { name: "an implicit rejection-handler return", handler: "error=>{if(choose)throw error;}", expected: false },
  { name: "a bare rejection-handler return", handler: "error=>{return;}", expected: false },
  { name: "an unknown never-typed handler", before: "declare function opaque(error:unknown):never;", handler: "opaque", expected: false },
  { name: "an async handler", handler: "async error=>{throw error;}", expected: false },
  { name: "a generator handler", handler: "function*(error){throw error;}", expected: false },
  { name: "unsupported handler control flow", handler: "error=>{try{throw error;}finally{}}", expected: false },
  { name: "overwritten catch", before: "Promise.prototype.catch=function(){return Promise.resolve({pick:()=>2});};", expected: false },
  { name: "overwritten then with unchanged catch", before: "Promise.prototype.then=function(){return Promise.resolve({pick:()=>2});};", expected: false },
  { name: "cross-source overwritten then", external: "Promise.prototype.then=function(){return Promise.resolve({pick:()=>2});};", expected: false },
  { name: "overwritten constructor", before: "Promise.prototype.constructor=function(){};", expected: false },
  {
    name: "overwritten species",
    before: "Object.defineProperty(Promise,Symbol.species,{value:function(executor){executor(()=>{},()=>{});return {pick:()=>2};}});",
    expected: false,
  },
  { name: "an opaque Promise-typed receiver", before: 'declare const pending:Promise<typeof import("./leaf.ts")>;', receiver: "pending", expected: false },
  { name: "an intervening then chain", receiver: 'import("./leaf.ts").then(value=>value)', expected: false },
  { name: "an escaping fulfilled alias", after: "declare function escape(value:object):void;escape(pick);", expected: false },
  { name: "a mutable fulfilled alias", mutable: true, expected: false },
  { name: "an omitted actual call", capture: false, expected: false },
  { name: "omitted reference coverage", references: false, expected: false },
] as const;

interface CapturedNamespaceCase {
  awaited?: boolean;
  handler?: string;
  binding?: string;
  after?: string;
  callee?: string;
  module?: string;
  before?: string;
  external?: string;
  receiver?: string;
  mutable?: boolean;
  capture?: boolean;
  references?: boolean;
  leaf?: string;
  barrel?: string;
  arrow?: boolean;
  factory?: boolean;
  circular?: boolean;
}

interface CapturedNamespaceFixture {
  readonly project: Project;
  readonly leaf: SourceFile;
  readonly source: SourceFile;
  readonly call: CallExpression;
  readonly caught: CallExpression;
  readonly owner: FunctionDeclaration | ArrowFunction;
  readonly parameter: ParameterDeclaration;
  readonly declaration: MorphNode | undefined;
}

function namespaceAliasWitness(alias: ReturnType<NonNullable<CallReturnProgram["nativeNamespaceAlias"]>>): string {
  if (alias === undefined) {
    return "no alias";
  }
  return "kind" in alias ? `${alias.detail} at ${alias.node.getText()}` : alias.getText();
}

function capturedNamespaceImplementation(input: CapturedNamespaceCase): string {
  if (input.arrow === true) {
    return 'export const pick=(options={mode:"local"})=>options.mode;';
  }
  if (input.factory === true) {
    return 'function make(){return (options={mode:"local"})=>options.mode;}export const pick=make();';
  }
  if (input.circular === true) {
    return 'export function pick(options={mode:"local"}){const registry={local:{}};return registry[options.mode];}';
  }
  return 'export function pick(options={mode:"local"}){return options.mode;}';
}

function capturedNamespaceFixture(input: CapturedNamespaceCase = {}): CapturedNamespaceFixture {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, types: [] },
  });
  const implementation = capturedNamespaceImplementation(input);
  const leaf = project.createSourceFile("/repo/leaf.ts", `${implementation}${input.leaf ?? ""}`);
  project.createSourceFile("/repo/barrel.ts", input.barrel ?? 'export {pick} from "./leaf.ts";');
  if (input.external !== undefined) {
    project.createSourceFile("/repo/effects.ts", input.external);
  }
  const binding = input.binding ?? "pick";
  const source = project.createSourceFile(
    "/repo/use.ts",
    `declare const choose:boolean;${input.before ?? ""}${input.mutable === true ? "let" : "const"} {pick:${binding}}=${input.awaited === false ? "" : "await "}${input.receiver ?? `import("./${input.module ?? "leaf"}.ts")`}.catch(${input.handler ?? "error=>{throw error;}"});${input.after ?? ""}const value=${input.callee ?? binding}();`,
  );
  const call = source.getVariableDeclarationOrThrow("value").getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression);
  const caught = source.getDescendantsOfKind(SyntaxKind.CallExpression).find((candidate) => candidate.getExpression().getText().endsWith(".catch"));
  const owner = leaf.getFunction("pick") ?? leaf.getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
  const parameter = owner.getParameters()[0];
  if (caught === undefined || parameter === undefined) {
    throw new Error("the actual native catch or supplied formal is missing");
  }
  const declaration = project.getTypeChecker().getResolvedSignature(caught)?.getDeclaration();
  return { project, leaf, source, call, caught, owner, parameter, declaration };
}

function capturedNamespaceObservations(project: Project, input: CapturedNamespaceCase = {}, call?: CallExpression): CallReturnObservations {
  const files = project.getSourceFiles();
  const roots = files
    .flatMap((file) => file.getDescendantsOfKind(SyntaxKind.CallExpression))
    .filter((candidate) => input.capture !== false || candidate !== call);
  return observeCallReturns(roots, input.references === false ? undefined : files.flatMap((file) => file.getDescendants()), { suppliedCallableTargets: true });
}

function namespaceTrialContinuation(
  program: CallReturnProgram,
  bindings: ReadonlyMap<MorphNode, MorphNode>,
  premise: InheritedReadPremise,
): ReturnedValueContext {
  return {
    program,
    bindings,
    active: new Set(),
    terminals: new Set(),
    nativeIterations: new Map(),
    nativeValueTransfers: false,
    explicitAbsentReturns: false,
    callableValues: true,
    inheritedReadPremise: premise,
  };
}

for (const scenario of CAPTURED_NAMESPACE_CASES) {
  test(`captured native catch namespace: ${scenario.name}`, () => {
    const input: CapturedNamespaceCase = scenario;
    const { project, source, call, owner, parameter, declaration } = capturedNamespaceFixture(input);
    beginReferencePass();
    try {
      const observed = capturedNamespaceObservations(project, input, call);
      const program = observed.programs[0];
      if (program === undefined) {
        throw new Error("the actual capture owner is missing");
      }
      expect(program.byCall.has(call.compilerNode)).toBe(input.capture !== false);
      expect(declaration !== undefined && program.program.isSourceFileDefaultLibrary(declaration.getSourceFile().compilerNode)).toBe(true);
      expect(
        resolveModuleMemberOrigin(
          source.getVariableDeclarationOrThrow("value").getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression).getExpression(),
        ).kind,
      ).toBe("unresolved");
      const settled = program.suppliedCallableUses?.(call);
      const targets = readCallTargets(call, undefined, observed);
      expect((input.factory !== true && input.circular !== true) || targets.kind === "unresolved").toBe(true);
      expect(input.circular !== true || program.callers.get(owner.compilerNode) === undefined).toBe(true);
      const consumers = readObservedCallableConsumers(owner, program);
      const supplied = readSuppliedParameter(parameter.getNameNode(), new Map(), program);
      expect(
        !scenario.expected || settled?.kind === "resolved",
        settled?.kind === "unresolved" ? `${settled.detail} at ${settled.node.getText()}` : scenario.name,
      ).toBe(true);
      expect(consumers.kind, consumers.kind === "unresolved" ? `${consumers.detail} at ${consumers.node.getText()}` : scenario.name).toBe(
        scenario.expected ? "resolved" : "unresolved",
      );
      expect(supplied.kind).toBe(scenario.expected ? "resolved" : "unresolved");
      expect(!scenario.expected || (targets.kind === "resolved" && targets.value.length === 1 && targets.value[0]?.compilerNode === owner.compilerNode)).toBe(
        true,
      );
      expect(consumers.kind === "resolved" ? consumers.value.map((consumer) => consumer.call.compilerNode) : []).toEqual(
        scenario.expected ? [call.compilerNode] : [],
      );
    } finally {
      endReferencePass();
    }
  });
}

for (const capture of ["full", "omitted initializer"] as const) {
  test(`captured namespace call demand preserves its actual consumer: ${capture}`, () => {
    const { project, source, call, caught, owner, parameter, declaration } = capturedNamespaceFixture();
    beginReferencePass();
    try {
      const files = project.getSourceFiles();
      const roots = capture === "full" ? files.flatMap((file) => file.getDescendantsOfKind(SyntaxKind.CallExpression)) : [call];
      const observed = observeCallReturns(
        roots,
        files.flatMap((file) => file.getDescendants()),
        { suppliedCallableTargets: true },
      );
      const program = observed.programs[0];
      if (program === undefined) {
        throw new Error("the actual native capture owner is missing");
      }
      expect(program.program.getRootFileNames()).toEqual(expect.arrayContaining(files.map((file) => file.getFilePath())));
      expect(program.program.getSourceFile(source.getFilePath())).toBe(source.compilerNode);
      expect(program.sources.has(source)).toBe(true);
      expect(program.byCall.has(call.compilerNode)).toBe(true);
      expect(program.byCall.has(caught.compilerNode)).toBe(capture === "full");
      expect(declaration !== undefined && program.program.isSourceFileDefaultLibrary(declaration.getSourceFile().compilerNode)).toBe(true);
      const demand = program.demandValueCall;
      if (demand === undefined) {
        throw new Error("the actual call-capture demand owner is missing");
      }
      let requests = 0;
      const actualDemand: NonNullable<CallReturnProgram["demandValueCall"]> = (requested) => {
        expect(requested.compilerNode).toBe(caught.compilerNode);
        requests++;
        return demand(requested);
      };
      Object.defineProperty(program, "demandValueCall", { configurable: true, value: actualDemand });
      const element = source.getFirstDescendantByKindOrThrow(SyntaxKind.BindingElement);
      const reference = element.getPropertyNameNodeOrThrow();
      const binding = element.getNameNode().asKindOrThrow(SyntaxKind.Identifier);
      const alias = program.nativeNamespaceAlias?.(reference, binding, owner, { program });
      expect(alias !== undefined && !("kind" in alias), namespaceAliasWitness(alias)).toBe(true);
      const settled = program.suppliedCallableUses?.(call);
      expect(settled?.kind, settled?.kind === "unresolved" ? settled.detail : capture).toBe("resolved");
      expect(program.byCall.has(caught.compilerNode)).toBe(true);
      const consumers = readObservedCallableConsumers(owner, program);
      expect(consumers.kind === "resolved" ? consumers.value.map((consumer) => consumer.call.compilerNode) : consumers.detail).toEqual([call.compilerNode]);
      const supplied = readSuppliedParameter(parameter.getNameNode(), new Map(), program);
      expect(supplied.kind === "resolved" ? supplied.value.map((value) => value.value.compilerNode) : supplied.detail).toEqual([
        parameter.getInitializerOrThrow().compilerNode,
      ]);
      expect(call.getArguments()).toHaveLength(0);
      const targets = readCallTargets(call, undefined, observed);
      expect(targets.kind === "resolved" ? targets.value.map((target) => target.compilerNode) : targets.detail).toEqual([owner.compilerNode]);
      const published = program.nativeNamespaceAlias?.(reference, binding, owner, { program });
      expect(published !== undefined && !("kind" in published), namespaceAliasWitness(published)).toBe(true);
      expect(requests).toBe(capture === "full" ? 0 : 1);
    } finally {
      endReferencePass();
    }
  });
}

for (const scenario of [
  "missing consumer",
  "missing references",
  "missing demander",
  "rejected demand",
  "unpublished receipt",
  "returning handler",
  "overwritten then",
] as const) {
  test(`captured namespace call demand retains refusal: ${scenario}`, () => {
    const { project, source, call, caught, owner, parameter } = capturedNamespaceFixture({
      before: `const seed=(()=>0)();${scenario === "overwritten then" ? "Promise.prototype.then=function(){return Promise.resolve({pick:()=>2});};" : ""}`,
      ...(scenario === "returning handler" ? { handler: "()=>({pick:()=>2})" } : {}),
    });
    const element = source.getFirstDescendantByKindOrThrow(SyntaxKind.BindingElement);
    const reference = element.getPropertyNameNodeOrThrow();
    const binding = element.getNameNode().asKindOrThrow(SyntaxKind.Identifier);
    beginReferencePass();
    try {
      const files = project.getSourceFiles();
      const seed = source.getVariableDeclarationOrThrow("seed").getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression);
      const observed = observeCallReturns(
        [scenario === "missing consumer" ? seed : call],
        scenario === "missing references" ? undefined : files.flatMap((file) => file.getDescendants()),
        { suppliedCallableTargets: true },
      );
      const program = observed.programs[0];
      if (program === undefined) {
        throw new Error("the actual native capture owner is missing");
      }
      expect(program.byCall.has(caught.compilerNode)).toBe(false);
      if (scenario === "missing demander") {
        Object.defineProperty(program, "demandValueCall", { configurable: true, value: undefined });
      } else if (scenario === "rejected demand" || scenario === "unpublished receipt") {
        const rejected: NonNullable<CallReturnProgram["demandValueCall"]> = (requested) =>
          scenario === "rejected demand"
            ? {
                kind: "unresolved",
                reason: "missing",
                detail: "the controlled owner rejects capture",
                node: requested,
                trace: { declarations: [], origin: requested },
              }
            : { kind: "resolved", value: true, trace: { declarations: [], origin: requested } };
        Object.defineProperty(program, "demandValueCall", { configurable: true, value: rejected });
      }
      const alias = program.nativeNamespaceAlias?.(reference, binding, owner, { program });
      expect(scenario === "missing consumer" || (alias !== undefined && "kind" in alias)).toBe(true);
      expect(readObservedCallableConsumers(owner, program).kind).toBe("unresolved");
      expect(readSuppliedParameter(parameter.getNameNode(), new Map(), program).kind).toBe("unresolved");
      expect(scenario !== "missing consumer" || !program.byCall.has(call.compilerNode)).toBe(true);
      const remainsUncaptured = ["missing references", "missing demander", "rejected demand", "unpublished receipt"].includes(scenario);
      expect(remainsUncaptured && program.byCall.has(caught.compilerNode)).toBe(false);
    } finally {
      endReferencePass();
    }
  });
}

test("captured namespace call demand revokes its private proof before ordinary publication", () => {
  const { project, source, call, caught, owner } = capturedNamespaceFixture({ after: 'const key="safe";const record={safe:{}};record[key];' });
  const element = source.getFirstDescendantByKindOrThrow(SyntaxKind.BindingElement);
  const reference = element.getPropertyNameNodeOrThrow();
  const binding = element.getNameNode().asKindOrThrow(SyntaxKind.Identifier);
  beginReferencePass();
  try {
    const observed = observeCallReturns(
      [call],
      project.getSourceFiles().flatMap((file) => file.getDescendants()),
      { suppliedCallableTargets: true },
    );
    const program = observed.programs[0];
    const trial = program?.withInheritedReadTrial;
    if (program === undefined || trial === undefined) {
      throw new Error("the actual inherited-trial owner is missing");
    }
    expect(program.byCall.has(caught.compilerNode)).toBe(false);
    const contexts: ReturnedValueContext[] = [];
    const unchangedDuringDemand: boolean[] = [];
    const revokedBeforePublication: boolean[] = [];
    const publishedRetry: boolean[] = [];
    const observedTrial: NonNullable<CallReturnProgram["withInheritedReadTrial"]> = (node, captured, prove) =>
      trial(node, captured, () => {
        try {
          return prove();
        } finally {
          const context = contexts.at(-1);
          if (context !== undefined && !program.byCall.has(caught.compilerNode)) {
            revokedBeforePublication.push(context.inheritedReadPremise?.require(reference, program).kind === "unresolved");
          }
        }
      });
    Object.defineProperty(program, "withInheritedReadTrial", { configurable: true, value: observedTrial });
    const effects = inspectInheritedReadEffects(binding, {
      program,
      values: (node, path, bindings, premise) => {
        if (premise !== undefined) {
          const context = namespaceTrialContinuation(program, bindings, premise);
          contexts.push(context);
          const present = program.byCall.has(caught.compilerNode);
          const before = program.callableProofEpoch?.();
          try {
            const alias = program.nativeNamespaceAlias?.(reference, binding, owner, { program, context });
            publishedRetry.push(present && alias !== undefined && !("kind" in alias));
          } finally {
            if (!present) {
              const after = program.callableProofEpoch?.();
              unchangedDuringDemand.push(
                !program.byCall.has(caught.compilerNode) &&
                  before?.callCount === after?.callCount &&
                  before?.referenceRevision === after?.referenceRevision &&
                  before?.sourceCount === after?.sourceCount &&
                  program.inheritedReadTrialActive?.() === true,
              );
            }
          }
        }
        return readReturnedValue(node, path, observed, { terminals: new Set(), bindings });
      },
    });
    expect(effects.kind, effects.kind === "unresolved" ? effects.detail : "resolved").toBe("resolved");
    expect(unchangedDuringDemand).toEqual([true]);
    expect(revokedBeforePublication).toEqual([true]);
    expect(publishedRetry.length > 0 && publishedRetry.every(Boolean)).toBe(true);
    expect(program.byCall.has(caught.compilerNode)).toBe(true);
    expect(contexts[0]?.inheritedReadPremise).not.toBe(contexts.at(-1)?.inheritedReadPremise);
    expect(contexts[0]?.inheritedReadPremise?.require(reference, program)).toMatchObject({
      kind: "unresolved",
      detail: "the inherited-effect premise has expired",
    });
    expect(program.inheritedReadTrialActive?.()).toBe(false);
    expect(program.suppliedCallableUses?.(call).kind).toBe("resolved");
    const consumers = readObservedCallableConsumers(owner, program);
    expect(consumers.kind === "resolved" ? consumers.value.map((consumer) => consumer.call.compilerNode) : consumers.detail).toEqual([call.compilerNode]);
  } finally {
    endReferencePass();
  }
});

for (const invalidation of ["expired premise", "foreign live premise", "changed source"] as const) {
  test(`captured namespace call demand cannot publish with ${invalidation}`, () => {
    const { project, source, call, caught, owner } = capturedNamespaceFixture({ after: 'const key="safe";const record={safe:{}};record[key];' });
    const element = source.getFirstDescendantByKindOrThrow(SyntaxKind.BindingElement);
    const reference = element.getPropertyNameNodeOrThrow();
    const binding = element.getNameNode().asKindOrThrow(SyntaxKind.Identifier);
    const nativeCaught = caught.compilerNode;
    beginReferencePass();
    try {
      const references = project.getSourceFiles().flatMap((file) => file.getDescendants());
      const observed = observeCallReturns([call], references, { suppliedCallableTargets: true });
      const program = observed.programs[0];
      const other = invalidation === "foreign live premise" ? observeCallReturns([call], references, { suppliedCallableTargets: true }) : observed;
      const trialOwner = other.programs[0];
      if (program === undefined || trialOwner === undefined) {
        throw new Error("the actual native capture owners are missing");
      }
      let context: ReturnedValueContext | undefined;
      const foreignRefusals: boolean[] = [];
      const effects = inspectInheritedReadEffects(binding, {
        program: trialOwner,
        values: (node, path, bindings, premise) => {
          if (premise !== undefined) {
            context = namespaceTrialContinuation(program, bindings, premise);
            if (invalidation === "foreign live premise") {
              const alias = program.nativeNamespaceAlias?.(reference, binding, owner, { program, context });
              foreignRefusals.push(alias !== undefined && "kind" in alias && !program.byCall.has(nativeCaught));
            }
          }
          return readReturnedValue(node, path, other, { terminals: new Set(), bindings });
        },
      });
      expect(effects.kind).toBe("resolved");
      expect(context).toBeDefined();
      expect(program.byCall.has(nativeCaught)).toBe(false);
      const before = program.callableProofEpoch?.();
      if (invalidation === "changed source") {
        source.replaceWithText("export const changed=1;");
      }
      const alias = program.nativeNamespaceAlias?.(reference, binding, owner, { program, context });
      expect(alias !== undefined && "kind" in alias).toBe(true);
      expect(program.byCall.has(nativeCaught)).toBe(false);
      expect(program.callableProofEpoch?.().callCount).toBe(before?.callCount);
      expect(invalidation !== "foreign live premise" || (foreignRefusals.length > 0 && foreignRefusals.every(Boolean))).toBe(true);
    } finally {
      endReferencePass();
    }
  });
}

for (const invalidation of ["expired premise", "changed source", "foreign continuation"] as const) {
  test(`captured native namespace alias retains the real private lifetime: ${invalidation}`, () => {
    const { project, source, owner } = capturedNamespaceFixture({ after: 'const key="safe";const record={safe:{}};record[key];' });
    const element = source.getFirstDescendantByKindOrThrow(SyntaxKind.BindingElement);
    const reference = element.getPropertyNameNodeOrThrow();
    const binding = element.getNameNode().asKindOrThrow(SyntaxKind.Identifier);
    beginReferencePass();
    try {
      const observed = capturedNamespaceObservations(project);
      const program = observed.programs[0];
      if (program === undefined || program.nativeNamespaceAlias === undefined) {
        throw new Error("the captured namespace alias capability is missing");
      }
      let continuation: ReturnedValueContext | undefined;
      const during: boolean[] = [];
      const witnesses: string[] = [];
      const effects = inspectInheritedReadEffects(binding, {
        program,
        values: (node, path, bindings, premise) => {
          if (premise !== undefined) {
            const context: ReturnedValueContext = {
              program,
              bindings,
              active: new Set(),
              terminals: new Set(),
              nativeIterations: new Map(),
              nativeValueTransfers: false,
              explicitAbsentReturns: false,
              callableValues: true,
              inheritedReadPremise: premise,
            };
            continuation = context;
            const alias = program.nativeNamespaceAlias?.(reference, binding, owner, { program, context });
            during.push(alias !== undefined && !("kind" in alias) && alias.compilerNode === binding.compilerNode);
            witnesses.push(namespaceAliasWitness(alias));
          }
          return readReturnedValue(node, path, observed, { terminals: new Set(), bindings });
        },
      });
      expect(effects.kind, effects.kind === "unresolved" ? effects.detail : invalidation).toBe("resolved");
      expect(during.length > 0 && during.every(Boolean), witnesses.join(" | ")).toBe(true);
      if (continuation === undefined) {
        throw new Error("the actual inherited-effect owner supplied no private premise");
      }
      if (invalidation === "changed source") {
        source.replaceWithText("export const changed=1;");
      }
      let context = continuation;
      if (invalidation === "foreign continuation") {
        const other = capturedNamespaceObservations(project).programs[0];
        if (other === undefined) {
          throw new Error("the actual foreign capture owner is missing");
        }
        context = { ...continuation, program: other };
      }
      const replay = program.nativeNamespaceAlias(reference, binding, owner, { program, context });
      expect(replay !== undefined && "kind" in replay).toBe(true);
      const reasons = { "expired premise": "expired", "changed source": "forgotten", "foreign continuation": "another capture owner" };
      expect(replay !== undefined && "kind" in replay ? replay.detail : "resolved").toContain(reasons[invalidation]);
      expect(program.inheritedReadTrialActive?.()).toBe(false);
    } finally {
      endReferencePass();
    }
  });
}

test("captured native namespace alias cannot borrow an active trial without its real continuation", () => {
  const { project, source, owner } = capturedNamespaceFixture();
  const element = source.getFirstDescendantByKindOrThrow(SyntaxKind.BindingElement);
  const reference = element.getPropertyNameNodeOrThrow();
  const binding = element.getNameNode().asKindOrThrow(SyntaxKind.Identifier);
  beginReferencePass();
  try {
    const files = project.getSourceFiles();
    const observed = observeCallReturns(
      files.flatMap((file) => file.getDescendantsOfKind(SyntaxKind.CallExpression)),
      files.flatMap((file) => file.getDescendants()),
      { suppliedCallableTargets: true },
    );
    const program = observed.programs[0];
    if (program?.withInheritedReadTrial === undefined) {
      throw new Error("the actual private trial owner is missing");
    }
    let refused = false;
    const result = program.withInheritedReadTrial(reference, program, () => {
      const alias = program.nativeNamespaceAlias?.(reference, binding, owner, { program });
      refused = alias !== undefined && "kind" in alias;
      return { kind: "resolved", value: true, trace: { declarations: [], origin: reference } };
    });
    expect(result.kind).toBe("resolved");
    expect(refused).toBe(true);
  } finally {
    endReferencePass();
  }
});

for (const capability of ["nativeNamespaceValue", "nativeNamespaceAlias"] as const) {
  test(`captured namespace private trials retain capability identity: ${capability}`, () => {
    const { project, source } = capturedNamespaceFixture({ after: 'const key="safe";const record={safe:{}};record[key];' });
    beginReferencePass();
    try {
      const observed = capturedNamespaceObservations(project);
      const program = observed.programs[0];
      if (program === undefined) {
        throw new Error("the native capture is missing");
      }
      const original = Object.getOwnPropertyDescriptor(program, capability);
      let replaced = false;
      try {
        const result = inspectInheritedReadEffects(source, {
          program,
          values: (node, path, bindings) => {
            if (!replaced) {
              replaced = true;
              Object.defineProperty(program, capability, { configurable: true, value: () => undefined });
            }
            return readReturnedValue(node, path, observed, { terminals: new Set(), bindings });
          },
        });
        expect(replaced).toBe(true);
        expect(result.kind === "unresolved" ? result.detail : "resolved").toBe("capture inputs changed during an inherited-effect trial");
      } finally {
        if (original !== undefined) {
          Object.defineProperty(program, capability, original);
        }
      }
    } finally {
      endReferencePass();
    }
  });
}

for (const invalidation of ["missing epoch", "changed epoch", "wrong module"] as const) {
  test(`captured namespace candidate refuses incomplete or changed inputs: ${invalidation}`, () => {
    const { project, source, owner } = capturedNamespaceFixture();
    const other = project.createSourceFile("/repo/other.ts", "export function pick(){return 2;}");
    const element = source.getFirstDescendantByKindOrThrow(SyntaxKind.BindingElement);
    const reference = element.getPropertyNameNodeOrThrow();
    const binding = element.getNameNode().asKindOrThrow(SyntaxKind.Identifier);
    beginReferencePass();
    try {
      const observed = capturedNamespaceObservations(project);
      const program = observed.programs[0];
      const epoch = program?.callableProofEpoch;
      if (program?.nativeNamespaceAlias === undefined || epoch === undefined) {
        throw new Error("the actual capture operations are missing");
      }
      let reads = 0;
      const original = Object.getOwnPropertyDescriptor(program, "callableProofEpoch");
      try {
        if (invalidation !== "wrong module") {
          Object.defineProperty(program, "callableProofEpoch", {
            configurable: true,
            value: invalidation === "missing epoch" ? undefined : () => ({ ...epoch(), referenceRevision: reads++ }),
          });
        }
        const alias = program.nativeNamespaceAlias(reference, binding, invalidation === "wrong module" ? other.getFunctionOrThrow("pick") : owner, { program });
        expect(alias !== undefined && "kind" in alias).toBe(true);
      } finally {
        if (original !== undefined) {
          Object.defineProperty(program, "callableProofEpoch", original);
        }
      }
    } finally {
      endReferencePass();
    }
  });
}

function origin(barrel: string): ReturnType<typeof resolveModuleMemberOrigin> {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile("/repo/leaf.ts", "export const record = () => 1; export const publicName = () => 2;");
  project.createSourceFile("/repo/barrel.ts", barrel);
  const source = project.createSourceFile("/repo/use.ts", 'import { publicName } from "./barrel"; export const value = publicName;');
  return resolveModuleMemberOrigin(source.getVariableDeclarationOrThrow("value").getInitializerOrThrow());
}

test("a namespace-qualified type reference resolves through the same module-origin reader as a value member", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile("/repo/chat.ts", "export type ChatContentPart = { readonly type: string };\n");
  const source = project.createSourceFile("/repo/use.ts", 'import type * as chat from "./chat.ts";\nexport type Content = chat.ChatContentPart;\n');
  const qualified = source.getFirstDescendantByKindOrThrow(SyntaxKind.QualifiedName);

  expect(resolveModuleMemberOrigin(qualified)).toMatchObject({
    kind: "resolved",
    value: {
      moduleSpecifier: "./chat.ts",
      exportedName: "ChatContentPart",
      memberPath: [],
      canonical: { kind: "project", exportedName: "ChatContentPart" },
    },
  });
});

test("an unrelated same-named leaf export cannot validate a local import/export alias", () => {
  const explicit = origin('export { record as publicName } from "./leaf";');
  const local = origin('import { record as internal } from "./leaf"; export { internal as publicName };');

  expect(explicit).toMatchObject({ kind: "resolved", value: { canonical: { kind: "project", exportedName: "record" } } });
  expect(local).toMatchObject({ kind: "resolved", value: { canonical: { kind: "project", exportedName: "record" } } });
});

test("local value exports retain their public name while wrapped imported aliases retain the particular binding", () => {
  const authored = origin("const implementation = () => 1; export { implementation as publicName };");
  const aliased = origin('import { record } from "./leaf"; const alias = ((record as typeof record)!); export { alias as publicName };');

  expect(authored).toMatchObject({ kind: "resolved", value: { canonical: { kind: "project", exportedName: "publicName" } } });
  if (authored.kind === "unresolved") {
    throw new Error(authored.detail);
  }
  expect(authored.value.canonical.declaration.getSourceFile().getBaseName()).toBe("barrel.ts");
  expect(authored.value.canonical.declaration.getText()).toBe("implementation = () => 1");
  expect(aliased).toMatchObject({ kind: "resolved", value: { canonical: { kind: "project", exportedName: "record" } } });
});

test.each(["namespace.record", 'namespace["record"]'])("an exported member alias %s retains its particular binding", (expression) => {
  const aliased = origin(`import * as namespace from "./leaf"; const alias = (${expression}); export { alias as publicName };`);

  expect(aliased).toMatchObject({ kind: "resolved", value: { canonical: { kind: "project", exportedName: "record" } } });
});

/** Resolve `pick` (or `choose`) as imported by `/repo/use.ts` from an arbitrary file map. */
function pickOrigin(files: Readonly<Record<string, string>>): ReturnType<typeof resolveModuleMemberOrigin> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(path, source);
  }
  const source = project.getSourceFileOrThrow("/repo/use.ts");
  return resolveModuleMemberOrigin(source.getVariableDeclarationOrThrow("value").getInitializerOrThrow());
}

const SAME_FILE_OVERLOADS =
  "export function pick(value: string): string;\nexport function pick(value: number): number;\nexport function pick(value: unknown): unknown { return value; }\n";
const USE_PICK = 'import { pick } from "./api.ts";\nexport const value = pick;\n';
/** A package door with types, so a BARE specifier really resolves to the planted `.d.ts`. The virtual
 *  conformance project cannot reach a real installed `node_modules` overload set (the schema-fact family's #1584 conversion record),
 *  so the shape is planted; the `project` canonical below IS the control that the plant resolved — an
 *  unresolvable door answers `external-door` and would prove nothing about declaration counting. */
const VENDOR_PACKAGE = '{"name":"vendor","version":"1.0.0","types":"index.d.ts"}';

test("a same-file function-overload set resolves to ONE home at its implementation, carrying the declaration count", () => {
  const fact = pickOrigin({ "/repo/api.ts": SAME_FILE_OVERLOADS, "/repo/use.ts": USE_PICK });

  expect(fact).toMatchObject({ kind: "resolved", value: { canonical: { kind: "project", exportedName: "pick" } } });
  if (fact.kind === "unresolved") {
    throw new Error(fact.detail);
  }
  const canonical = fact.value.canonical;
  expect(canonical.kind === "project" && canonical.sourceFile.getBaseName()).toBe("api.ts");
  // The IMPLEMENTATION is the home, not the first signature: a consumer reading the declaration wants the
  // one that carries the body.
  expect(canonical.declaration.getKindName()).toBe("FunctionDeclaration");
  expect(canonical.declaration.getText()).toContain("return value");
});

test("an ambient declare-function overload set behind a package door resolves to its declaring .d.ts", () => {
  const fact = pickOrigin({
    "/node_modules/vendor/package.json": VENDOR_PACKAGE,
    "/node_modules/vendor/index.d.ts": "export declare function pick(value: string): string;\nexport declare function pick(value: number): number;\n",
    "/repo/use.ts": 'import { pick } from "vendor";\nexport const value = pick;\n',
  });

  expect(fact).toMatchObject({ kind: "resolved", value: { moduleSpecifier: "vendor", canonical: { kind: "project" } } });
  if (fact.kind === "unresolved") {
    throw new Error(fact.detail);
  }
  const canonical = fact.value.canonical;
  expect(canonical.kind === "project" && canonical.sourceFile.getFilePath()).toBe("/node_modules/vendor/index.d.ts");
});

test("a LOCAL export specifier over a same-file overload set resolves the same way", () => {
  const fact = pickOrigin({
    "/repo/api.ts":
      "function pick(value: string): string;\nfunction pick(value: number): number;\nfunction pick(value: unknown): unknown { return value; }\nexport { pick as choose };\n",
    "/repo/use.ts": 'import { choose } from "./api.ts";\nexport const value = choose;\n',
  });

  expect(fact).toMatchObject({ kind: "resolved", value: { canonical: { kind: "project", exportedName: "choose" } } });
  if (fact.kind === "unresolved") {
    throw new Error(fact.detail);
  }
  // The HOME is the implementation, not a signature — the same claim the same-file row makes, through the
  // local-export-specifier path, which is the one the augmentation counterfactual below also travels.
  expect(fact.value.canonical.declaration.getText()).toContain("return value");
});

// Named and namespace re-exports retain their actual imported door, including when the local name changes.
test("a name-preserving barrel over an imported binding resolves to the leaf's own declaration", () => {
  const fact = pickOrigin({
    "/repo/leaf.ts": "export const pick = (): number => 1;\n",
    "/repo/barrel.ts": 'import { pick } from "./leaf.ts";\nexport { pick };\n',
    "/repo/use.ts": 'import { pick } from "./barrel.ts";\nexport const value = pick;\n',
  });

  expect(fact).toMatchObject({ kind: "resolved", value: { moduleSpecifier: "./barrel.ts", canonical: { kind: "project", exportedName: "pick" } } });
  if (fact.kind === "unresolved") {
    throw new Error(fact.detail);
  }
  const canonical = fact.value.canonical;
  // The authored door stays `./barrel.ts` (re-export traversal never rewrites it); the CANONICAL home is the leaf.
  expect(canonical.kind === "project" && canonical.sourceFile.getBaseName()).toBe("leaf.ts");
});

test("a name-preserving NAMESPACE re-export behind a package door resolves to the namespace's module", () => {
  const fact = pickOrigin({
    "/node_modules/vendor/package.json": VENDOR_PACKAGE,
    "/node_modules/vendor/index.d.ts": 'import * as pick from "./external";\nexport { pick };\n',
    "/node_modules/vendor/external.d.ts": "export declare function record(value: string): string;\n",
    "/repo/use.ts": 'import { pick } from "vendor";\nexport const value = pick;\n',
  });

  expect(fact).toMatchObject({ kind: "resolved", value: { moduleSpecifier: "vendor", canonical: { kind: "project", exportedName: "pick" } } });
  if (fact.kind === "unresolved") {
    throw new Error(fact.detail);
  }
  const canonical = fact.value.canonical;
  // A namespace object has no single leaf declaration: its home is the MODULE it names.
  expect(canonical.kind === "project" && canonical.sourceFile.getFilePath()).toBe("/node_modules/vendor/external.d.ts");
});

test.each([
  [
    // The leaf's unrelated `pick` cannot stand in for the particular imported `record` binding.
    "a barrel whose import hop renames the leaf's export",
    {
      "/repo/leaf.ts": "export const record = (): number => 1;\nexport const pick = (): string => 'other';\n",
      "/repo/barrel.ts": 'import { record as pick } from "./leaf.ts";\nexport { pick };\n',
      "/repo/use.ts": 'import { pick } from "./barrel.ts";\nexport const value = pick;\n',
    },
    "record",
    "/repo/leaf.ts",
  ],
  [
    // A namespace alias retains the module it imported, not a guessed same-named leaf member.
    "a namespace re-export renamed at the export hop",
    {
      "/node_modules/vendor/package.json": VENDOR_PACKAGE,
      "/node_modules/vendor/index.d.ts": 'import * as internal from "./external";\nexport { internal as pick };\n',
      "/node_modules/vendor/external.d.ts": "export declare function record(value: string): string;\n",
      "/repo/use.ts": 'import { pick } from "vendor";\nexport const value = pick;\n',
    },
    "pick",
    "/node_modules/vendor/external.d.ts",
  ],
])("%s retains its particular canonical home", (_label, files, name, home) => {
  const fact = pickOrigin(files);
  expect(fact).toMatchObject({ kind: "resolved", value: { canonical: { kind: "project", exportedName: name } } });
  if (fact.kind === "unresolved" || fact.value.canonical.kind !== "project") {
    throw new Error("expected a resolved project binding");
  }
  expect(fact.value.canonical.sourceFile.getFilePath()).toBe(home);
});

test.each([
  [
    "two files of one package fanned in by export *",
    {
      "/node_modules/vendor/package.json": VENDOR_PACKAGE,
      "/node_modules/vendor/index.d.ts": 'export * from "./a";\nexport * from "./b";\n',
      "/node_modules/vendor/a.d.ts": "export declare function pick(value: string): string;\n",
      "/node_modules/vendor/b.d.ts": "export declare function pick(value: number): number;\n",
      "/repo/use.ts": 'import { pick } from "vendor";\nexport const value = pick;\n',
    },
  ],
  [
    // THE SAME-FILE GUARD'S OWN ROW. Every other counterfactual here is answered EARLIER — the `export *`
    // fan-in by `resolveStarExport`'s candidate count, the merges by the kind check — so without this shape
    // the guard is an arm no row turns red (measured: dropping it left the spec 11/11 green). A module
    // AUGMENTATION adds a second `pick` declaration from another file, and a LOCAL export specifier is the
    // one path whose `getAliasedSymbol()` sees both: same kind, one implementation, TWO homes. An overload
    // set split across files has no unique home, so it refuses.
    "an augmentation adding an overload from another file, read through a local export specifier",
    {
      "/node_modules/vendor/package.json": VENDOR_PACKAGE,
      "/node_modules/vendor/index.d.ts": "export declare function pick(value: string): string;\n",
      "/repo/augment.d.ts": 'declare module "vendor" {\n  export function pick(value: number): number;\n}\nexport {};\n',
      "/repo/barrel.ts": 'import { pick } from "vendor";\nexport { pick };\n',
      "/repo/use.ts": 'import { pick } from "./barrel.ts";\nexport const value = pick;\n',
    },
  ],
  [
    "an interface merged with a value of the same name",
    { "/repo/api.ts": "export interface pick { tag: string }\nexport const pick = (): number => 1;\n", "/repo/use.ts": USE_PICK },
  ],
  [
    "a function merged with a namespace of the same name",
    { "/repo/api.ts": "export function pick(): number { return 1; }\nexport namespace pick { export const version = 1; }\n", "/repo/use.ts": USE_PICK },
  ],
  [
    "two implementations of the same name in one file",
    {
      "/repo/api.ts": "export function pick(value: string): string { return value; }\nexport function pick(value: number): number { return value; }\n",
      "/repo/use.ts": USE_PICK,
    },
  ],
])("%s stays ambiguous — several declarations with no ONE home", (_label, files) => {
  expect(pickOrigin(files)).toMatchObject({ kind: "unresolved", reason: "ambiguous" });
});
