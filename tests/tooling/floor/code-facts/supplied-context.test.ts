// @subject tooling/src/floor/code-facts/call-supplied.ts
// @subject tooling/src/floor/code-facts/value-carrier.ts
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { CallExpression, ElementAccessExpression, FunctionDeclaration, ParameterDeclaration, SourceFile } from "ts-morph";
import { Project, SyntaxKind, ts } from "ts-morph";
import { observeCallReturns, readSuppliedParameter } from "../../../../tooling/src/floor/code-facts/call-returns.ts";
import { beginReferencePass, endReferencePass } from "../../../../tooling/src/floor/code-facts/reference-fact.ts";
import type { CallReturnObservations, CallReturnProgram } from "../../../../tooling/src/floor/code-facts/reference-fact-contract.ts";
import { readAuthoredCallableSources } from "../../../../tooling/src/floor/code-facts/value-carrier.ts";

interface SuppliedFixture {
  readonly project: Project;
  readonly producer: SourceFile;
  readonly source: SourceFile;
  readonly owner: FunctionDeclaration;
  readonly parameter: ParameterDeclaration;
  readonly call: CallExpression;
  readonly root: ElementAccessExpression;
  readonly observed: CallReturnObservations;
  readonly program: CallReturnProgram;
}

function fixture(
  input: { readonly after?: string; readonly call?: string; readonly secondFormal?: boolean; readonly references?: boolean } = {},
): SuppliedFixture {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2025,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      lib: ["lib.es2025.d.ts"],
      types: [],
      strict: true,
    },
  });
  const producer = project.createSourceFile(
    "/repo/producer.ts",
    input.secondFormal === true
      ? 'export function build(unused=0,options={mode:"safe"}){return options.mode;}'
      : 'export function build(options={mode:"safe"}){return options.mode;}',
  );
  const source = project.createSourceFile(
    "/repo/consumer.ts",
    `export async function run(){const {build}=await import("./producer.js").catch(error=>{throw error;});${input.after ?? ""}const result=${input.call ?? "build()"};const table={safe:{}};table[result];}void run();`,
  );
  const owner = producer.getFunctionOrThrow("build");
  const parameter = owner.getParameters()[input.secondFormal === true ? 1 : 0];
  const result = source.getDescendantsOfKind(SyntaxKind.VariableDeclaration).find((candidate) => candidate.getName() === "result");
  if (result === undefined) {
    throw new Error("the actual fixture result declaration is missing");
  }
  const call = result.getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression);
  const root = source.getFirstDescendantByKindOrThrow(SyntaxKind.ElementAccessExpression);
  if (parameter === undefined) {
    throw new Error("the actual supplied formal is missing");
  }
  const files = [producer, source];
  const calls = files.flatMap((file) => file.getDescendantsOfKind(SyntaxKind.CallExpression));
  const observed = observeCallReturns(calls, input.references === false ? undefined : files.flatMap((file) => file.getDescendants()), {
    suppliedCallableTargets: true,
  });
  const program = observed.programs[0];
  if (program === undefined) {
    throw new Error("the actual captured native owner is missing");
  }
  return { project, producer, source, owner, parameter, call, root, observed, program };
}

for (const scenario of [
  { name: "omitted default", expected: true },
  { name: "runtime undefined default", call: "build(void 0)", expected: true },
  { name: "all actual callers", after: 'build({mode:"other"});', expected: true },
  { name: "constant callable alias", after: "const alias=build;", call: "alias()", expected: true },
  { name: "call wrapper", call: "build.call(undefined)", expected: false },
  { name: "apply wrapper", call: "build.apply(undefined,[])", expected: false },
  { name: "optional consumer", call: "build?.()", expected: true },
  { name: "constructor consumer", after: "new build();", expected: false },
  { name: "member value alias", after: "const alias=build.extra;alias();", expected: false },
  { name: "no actual owner call", call: "(()=> 'safe')()", expected: false },
  { name: "missing references", references: false, expected: false },
  { name: "opaque alias escape", after: "declare function opaque(value:object):void;const alias=build;opaque(alias);", expected: false },
  { name: "array spread escape", after: "const escaped=[...build];", expected: false },
  { name: "alias reassignment", after: 'let alias=build;alias=()=>"other";alias();', expected: false },
  { name: "selected member mutation", after: "build.extra=1;", expected: false },
  { name: "spread before queried default", secondFormal: true, after: 'const args=[0,{mode:"other"}];', call: "build(...args)", expected: false },
  { name: "unclosed undefined argument", after: "declare const unknownValue:{mode:string}|undefined;", call: "build(unknownValue)", expected: false },
] as const) {
  test("observed supplied consumer authority: " + scenario.name, () => {
    beginReferencePass();
    try {
      const { program, parameter, owner, observed, call } = fixture(scenario);
      const first = readAuthoredCallableSources(call.getExpression(), undefined, observed);
      const supplied = readSuppliedParameter(parameter.getNameNode(), new Map(), program);
      expect(supplied.kind, supplied.kind === "unresolved" ? supplied.detail : scenario.name).toBe(scenario.expected ? "resolved" : "unresolved");
      const targets = program.byCall.get(call.compilerNode)?.invocationTargets ?? program.byCall.get(call.compilerNode)?.targets;
      expect(scenario.expected && first.kind === "resolved").toBe(scenario.expected);
      expect(scenario.expected && targets?.kind === "resolved" && targets.value.some((target) => target === owner)).toBe(scenario.expected);
      expect(scenario.expected && program.callers.get(owner.compilerNode)?.some((caller) => caller.call === call) === true).toBe(scenario.expected);
      const leaves = supplied.kind === "resolved" ? supplied.value : [];
      const expectedCallers = scenario.name === "all actual callers" ? 2 : 1;
      expect(leaves.length).toBe(scenario.expected ? expectedCallers : 0);
      expect(
        leaves.every(
          (leaf) =>
            leaf.supply?.kind === "observed" &&
            leaf.supply.parameter === parameter &&
            program.byCall.get(leaf.supply.observation.call.compilerNode) === leaf.supply.observation,
        ),
      ).toBe(true);
      expect(leaves.some((leaf) => leaf.supply?.observation.call === call)).toBe(scenario.expected);
    } finally {
      endReferencePass();
    }
  });
}

for (const scenario of [
  { name: "nested absent optional receiver", options: "", expected: true },
  { name: "actual undefined optional receiver", options: "{providerSeams:undefined}", expected: true },
  { name: "actual null optional receiver", options: "{providerSeams:null}", expected: true },
  { name: "present non-nullish receiver", options: "{providerSeams:{}}", expected: true },
  { name: "option getter", options: "{get providerSeams(){return undefined;}}", expected: true },
  { name: "unknown option alternative", options: "unknownOptions", before: "declare const unknownOptions:object;", expected: true },
  { name: "inherited option getter", options: "{__proto__:{get providerSeams(){return undefined;}}}", expected: true },
  { name: "capability mutation", options: "", effect: "modes.local=()=>{Object.prototype.changed=1;return true;};", expected: false },
  { name: "capability escape", options: "", effect: "declare function opaque(value:object):void;opaque(modes);", expected: true },
  { name: "unknown mode", options: "", mode: "unknownMode", effect: "declare const unknownMode:string;", expected: true },
  { name: "recursive default", options: "", fallback: "createLifecycle()", expected: true },
  { name: "unsafe alternate actual consumer", options: "", after: "createLifecycle({get providerSeams(){return undefined;}});", expected: true },
] as const) {
  test(`selected callable does not enlist unrelated default capability ${scenario.name}`, () => {
    const input: {
      readonly options: string;
      readonly before?: string;
      readonly effect?: string;
      readonly mode?: string;
      readonly fallback?: string;
      readonly after?: string;
    } = scenario;
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
    const graph = project.createSourceFile(
      "/repo/graph.ts",
      `const modes={local:(many)=>many};${input.effect ?? ""}
      function capability(mode,read){return ()=>modes[mode](read().many);}
      function use(ctx){return ctx.settle();}
      function context(input){return {...input,settle:()=>input.settle()};}
      function service(input){const ctx=context(input);const output={...(ctx.signal===undefined?{}:{signal:ctx.signal})};use(ctx);return output;}
      function assemble(input){const stats={settle:()=>1};return service({settle:stats.settle,...(input.signal===undefined?{}:{signal:input.signal})});}
      export function services(deps){const fetch=deps.networkExecution?.fetch??deps.providerSeams?.sdkFetch;const {authConfig={mode:"local"}}=deps;const mode=authConfig.mode??${input.mode ?? '"local"'};const can=capability(mode,()=>({many:true}));const controller=new AbortController();return {engine:assemble({signal:controller.signal}),can};}`,
    );
    const lifecycle = project.createSourceFile(
      "/repo/lifecycle.ts",
      `import {services} from "./graph.js";${input.mode === undefined ? "" : "declare const unknownMode:string;"}export function createLifecycle(options:{providerSeams?:{sdkFetch?:typeof fetch}|null}=${input.fallback ?? "{}"}){return services({authConfig:{mode:${input.mode ?? '"local"'}},...(options.providerSeams===undefined?{}:{providerSeams:options.providerSeams})});}`,
    );
    const entry = project.createSourceFile(
      "/repo/entry.ts",
      `export async function run(){const {createLifecycle}=await import("./lifecycle.js").catch(error=>{throw error;});${input.before ?? ""}${input.after ?? ""}const instance=createLifecycle(${input.options});instance.can();return instance.engine;}void run();`,
    );
    const files = [graph, lifecycle, entry];
    const calls = files.flatMap((file) => file.getDescendantsOfKind(SyntaxKind.CallExpression));
    const selected = calls.find((call) => call.getExpression().getText() === "ctx.settle");
    if (selected === undefined) {
      throw new Error("the actual selected callback query is missing");
    }
    beginReferencePass();
    try {
      const observed = observeCallReturns(
        calls,
        files.flatMap((file) => file.getDescendants()),
        { suppliedCallableTargets: true },
      );
      const program = observed.programs[0];
      if (program === undefined) {
        throw new Error("the native capture is missing");
      }
      const first = readAuthoredCallableSources(selected.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
      expect(first.kind, first.kind === "unresolved" ? first.detail : scenario.name).toBe(scenario.expected ? "resolved" : "unresolved");
      expect(scenario.expected && first.kind === "resolved" ? first.value.map((source) => source.value) : []).toEqual(
        scenario.expected ? [graph.getFunctionOrThrow("context").getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction)] : [],
      );
    } finally {
      endReferencePass();
    }
  });
}
