// @subject tooling/src/floor/code-facts/value-carrier.ts
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { observeCallReturns, readCallBindings } from "@orb/tooling/floor/code-facts/call-returns";
import { beginReferencePass, endReferencePass, inspectInheritedReadEffects } from "@orb/tooling/floor/code-facts/reference-fact";
import type { CallReturnProgram, InheritedReadPremise } from "@orb/tooling/floor/code-facts/reference-fact-contract";
import { readAuthoredCallableSources, readReturnedValue } from "@orb/tooling/floor/code-facts/value-carrier";
import type { ArrowFunction, CallExpression, SourceFile } from "ts-morph";
import { Project, SyntaxKind, ts } from "ts-morph";

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

interface NativeDeferredFixture extends ProjectedFixture {
  readonly factory: SourceFile;
  readonly contract: SourceFile;
  readonly actualCall: CallExpression;
  readonly owner: ArrowFunction;
  readonly all: CallExpression;
}

function nativeDeferredFixture(immediate: boolean, annotated: boolean, input: ProjectedFixtureInput = {}): NativeDeferredFixture {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2025,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      lib: ["lib.es2025.d.ts"],
      types: [],
      strict: true,
      noImplicitAny: false,
    },
  });
  const contract = project.createSourceFile(
    "/repo/contracts.ts",
    `export type ReadChatUserMacros=(chatId:string)=>Promise<readonly string[]>;
        export type ResolveChatUserMacroDefs=(chatId:string)=>Promise<{preset:readonly string[];game:readonly string[]}>;
        export interface ChatRpgOps{handoffRekeyActors:(chatId:string,cardCopies:readonly string[])=>Promise<void>;resolveUserMacros:ReadChatUserMacros;}
        export interface ChatContext{settleRetainedChatRebase:()=>number;rpg:ChatRpgOps|null;}`,
  );
  const factory = project.createSourceFile(
    "/repo/macro-readers.ts",
    `import type {ReadChatUserMacros,ResolveChatUserMacroDefs} from "./contracts.js";
        export function createResolveChatUserMacroDefs(preset:ReadChatUserMacros,game:ReadChatUserMacros):ResolveChatUserMacroDefs{
          return async(chatId):ReturnType<ResolveChatUserMacroDefs>=>{
            const [presetDefs,gameDefs]=await Promise.all([preset(chatId),game(chatId)]);
            return {preset:presetDefs,game:gameDefs};
          };
        }`,
  );
  const source = project.createSourceFile(
    "/repo/deferred.ts",
    `import {createResolveChatUserMacroDefs} from "./macro-readers.js";
        import type {ChatContext,ChatRpgOps,ResolveChatUserMacroDefs,ReadChatUserMacros} from "./contracts.js";
        ${input.prefix ?? ""}
        function createStats(){return {settleRetainedChatRebase:()=>1};}
        ${input.helper ?? ""}
        async function completeHandoffResumption(ctx:ChatContext,resume:{chatId:string;actorRekeys:readonly string[]}){await ctx.rpg?.handoffRekeyActors(resume.chatId,resume.actorRekeys);}
        function use(ctx:ChatContext){completeHandoffResumption(ctx,{chatId:"chat",actorRekeys:["actor"]});ctx.settleRetainedChatRebase();}
        ${input.factory ?? "function buildChatService(input:{rpg:ChatRpgOps}){const stats=createStats();const context={...{left:0},...{right:0},settleRetainedChatRebase:stats.settleRetainedChatRebase,rpg:input.rpg??null};use(context);}"}
        function buildImagery(input:{resolveUserMacroDefs:ResolveChatUserMacroDefs}){return {load:(chatId:string)=>input.resolveUserMacroDefs(chatId)};}
        function composeServices(){
          const actualOps={handoffRekeyActors:async(chatId:string,cardCopies:readonly string[])=>{},resolveUserMacros:async(chatId:string)=>[] as readonly string[]};
          const rpgOps=()=>actualOps;
          ${input.allocation ?? "const"} rpgOpsDelegate${annotated ? ':NonNullable<ChatContext["rpg"]>' : ""}={handoffRekeyActors:(chatId,cardCopies)=>rpgOps().handoffRekeyActors(chatId,cardCopies),${input.fields ?? "resolveUserMacros:(chatId)=>rpgOps().resolveUserMacros(chatId)"}};
          const imagery=buildImagery({resolveUserMacroDefs:(chatId)=>resolveChatUserMacroDefs(chatId)});
          buildChatService({rpg:rpgOpsDelegate});
          const resolveChatUserMacroDefs=createResolveChatUserMacroDefs(async(chatId)=>[],(chatId)=>rpgOpsDelegate.resolveUserMacros(chatId));
          ${input.after ?? ""}
          ${immediate ? 'void imagery.load("chat");' : ""}
          return imagery;
        }
        const services=composeServices();`,
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const selected = calls.find((call) => call.getExpression().getText() === "ctx.settleRetainedChatRebase");
  const actualCall = calls.find((call) => call.getExpression().getText() === "rpgOpsDelegate.resolveUserMacros");
  const delegate = source.getDescendantsOfKind(SyntaxKind.VariableDeclaration).find((declaration) => declaration.getName() === "rpgOpsDelegate");
  const all = factory.getDescendantsOfKind(SyntaxKind.CallExpression).find((call) => call.getExpression().getText() === "Promise.all");
  if (selected === undefined || actualCall === undefined || delegate === undefined || all === undefined) {
    throw new Error("the native deferred invocation fixture is incomplete");
  }
  const owner = delegate
    .getInitializerOrThrow()
    .asKindOrThrow(SyntaxKind.ObjectLiteralExpression)
    .getPropertyOrThrow("resolveUserMacros")
    .getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
  const expected = source.getFunctionOrThrow("createStats").getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
  return { project, source, calls, selected, actualCall, owner, expected, all, contract, factory };
}

function nativeAdapterFixture(fields: string, input: ProjectedFixtureInput = {}): NativeDeferredFixture {
  return nativeDeferredFixture(false, true, {
    ...input,
    helper:
      input.helper ??
      "function createChatContext(input:ChatContext):ChatContext{return {...input,settleRetainedChatRebase:()=>input.settleRetainedChatRebase()};} function createChatService(input:ChatContext){const ctx=createChatContext(input);use(ctx);}",
    factory:
      input.factory ??
      `function buildChatService(input:{rpg:ChatRpgOps}){const stats=createStats();const context={${fields}settleRetainedChatRebase:stats.settleRetainedChatRebase,rpg:input.rpg??null};createChatService(context);}`,
  });
}

for (const nestedSpreads of [false, true]) {
  test(`a native context adapter retains its actual selected wrapper: nestedSpreads=${nestedSpreads}`, () => {
    const { project, source, factory, contract, calls, selected, actualCall, owner, expected } = nativeAdapterFixture(
      nestedSpreads ? "...{left:0},...{right:0}," : "left:0,right:0,",
    );
    beginReferencePass();
    try {
      const observed = observeCallReturns(
        calls,
        [source, factory, contract].flatMap((file) => file.getDescendants()),
        { suppliedCallableTargets: true },
      );
      const program = observed.programs[0];
      if (program === undefined) {
        throw new Error("the native context-adapter capture is missing");
      }
      const first = readAuthoredCallableSources(selected.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
      const adapter = source.getFunctionOrThrow("createChatContext");
      const service = source.getFunctionOrThrow("createChatService");
      const build = source.getFunctionOrThrow("buildChatService");
      const wrapper = adapter.getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
      const spread = adapter.getFirstDescendantByKindOrThrow(SyntaxKind.SpreadAssignment).getExpression();
      const adapterCall = calls.find((call) => call.getExpression().getText() === "createChatContext");
      const serviceCall = calls.find((call) => call.getExpression().getText() === "createChatService");
      const buildCall = calls.find((call) => call.getExpression().getText() === "buildChatService");
      const formal = adapter.getParameters()[0];
      const assembly = build.getVariableDeclarationOrThrow("context").getInitializerOrThrow();
      if (adapterCall === undefined || serviceCall === undefined || buildCall === undefined || formal === undefined) {
        throw new Error("the actual context-adapter call or formal is missing");
      }
      const bindings = readCallBindings(adapterCall, adapter, readCallBindings(serviceCall, service, readCallBindings(buildCall, build, new Map())));
      const sources = readReturnedValue(spread, [], observed, { terminals: new Set(), bindings });
      const delegate = program.byCall.get(actualCall.compilerNode);
      const witness = delegate?.invocationTargets ?? delegate?.targets;
      const firstCaller = program.callers.get(owner.compilerNode)?.some((caller) => caller.call === actualCall) === true;
      const settlement = program.suppliedCallableUses?.(actualCall);
      const settled = program.byCall.get(actualCall.compilerNode);
      const settledWitness = settled?.invocationTargets ?? settled?.targets;
      expect(program.program).toBe(project.getProgram().compilerObject);
      expect(program.program.getSourceFile(source.getFilePath())).toBe(source.compilerNode);
      expect(program.byCall.get(adapterCall.compilerNode)?.targets).toMatchObject({ kind: "resolved", value: [adapter] });
      expect(program.callers.get(adapter.compilerNode)?.map((caller) => caller.call)).toEqual([adapterCall]);
      expect(bindings.get(formal)).toBe(adapterCall.getArguments()[0]);
      expect(project.getPreEmitDiagnostics().map((diagnostic) => diagnostic.getMessageText())).toEqual([]);
      expect(wrapper).not.toBe(expected);
      expect(first.kind, first.kind === "unresolved" ? `${first.detail} at ${first.node.getText()}` : "resolved").toBe("resolved");
      expect(first.kind === "resolved" ? first.value.map((leaf) => leaf.value) : []).toEqual([wrapper]);
      expect(delegate?.call).toBe(actualCall);
      expect(program.byCall.has(actualCall.compilerNode)).toBe(true);
      expect(settlement?.kind, settlement?.kind === "unresolved" ? settlement.detail : "resolved").toBe("resolved");
      expect(settledWitness?.kind === "resolved" ? settledWitness.value : []).toEqual([owner]);
      expect(firstCaller).toBe(witness?.kind === "resolved" && witness.value.includes(owner));
      expect(program.callers.get(owner.compilerNode)?.some((caller) => caller.call === actualCall) === true).toBe(
        settledWitness?.kind === "resolved" && settledWitness.value.includes(owner),
      );
      expect(sources.kind === "resolved" ? sources.value.map((leaf) => leaf.value) : []).toEqual([assembly]);
    } finally {
      endReferencePass();
    }
  });
}

const COPY_OPERAND_CONTROLS = [
  { name: "closed source alias", fields: "...part,", prefix: "const part={left:0};", resolved: true },
  { name: "finite conditional source", fields: "...(choose?{left:0}:{right:0}),", prefix: "declare const choose:boolean;", resolved: true },
  { name: "getter", fields: "...{get left(){return 0;}},", resolved: false },
  { name: "opaque source", fields: "...part,", prefix: "declare const part:object;", resolved: false },
  {
    name: "unknown alternative",
    fields: "...(choose?{left:0}:foreign),",
    prefix: "declare const choose:boolean;declare const foreign:object;",
    resolved: false,
  },
  {
    name: "written source alias",
    fields: "...part,",
    prefix: "const part={left:0};",
    after: 'Object.defineProperty(part,"left",{get:()=>0});',
    resolved: false,
  },
  {
    name: "escaping source alias",
    fields: "...part,",
    prefix: "declare function escape(value:object):void;const part={left:0};",
    after: "escape(part);",
    resolved: false,
  },
  { name: "mutable source binding", fields: "...part,", prefix: "let part={left:0};", after: "part={left:1};", resolved: false },
  { name: "prototype mutation", fields: "...part,", prefix: "const part={left:0};", after: "Object.setPrototypeOf(part,{});", resolved: false },
  { name: "recursive source", fields: "...part(),", prefix: "function part():{left:number}{return {...part()};}", resolved: false },
  {
    name: "mutating second alias",
    fields: "...part,",
    prefix: "const part={left:0};const alias=part;",
    after: 'Object.defineProperty(alias,"left",{get:()=>0});',
    resolved: false,
  },
  {
    name: "mutating copied carrier",
    fields: "...part,",
    prefix: "const part={left:0};const carrier={part};const copied={...carrier};",
    after: 'Object.defineProperty(copied.part,"left",{get:()=>0});',
    resolved: false,
  },
] as const;

for (const scenario of COPY_OPERAND_CONTROLS) {
  test(`a native context copy operand closes ${scenario.name}`, () => {
    const { project, source, factory, contract, calls, selected, actualCall } = nativeAdapterFixture(scenario.fields, {
      prefix: "prefix" in scenario ? scenario.prefix : "",
      after: "after" in scenario ? scenario.after : "",
    });
    beginReferencePass();
    try {
      const observed = observeCallReturns(
        calls,
        [source, factory, contract].flatMap((file) => file.getDescendants()),
        { suppliedCallableTargets: true },
      );
      const program = observed.programs[0];
      if (program === undefined) {
        throw new Error("the native copy operand capture is missing");
      }
      const result = readAuthoredCallableSources(selected.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
      expect(program.program).toBe(project.getProgram().compilerObject);
      expect(program.byCall.has(actualCall.compilerNode)).toBe(true);
      expect(project.getPreEmitDiagnostics().map((diagnostic) => diagnostic.getMessageText())).toEqual([]);
      expect(result.kind, result.kind === "unresolved" ? result.detail : "resolved").toBe(scenario.resolved ? "resolved" : "unresolved");
      expect(program.inheritedReadTrialActive?.()).toBe(false);
    } finally {
      endReferencePass();
    }
  });
}

const COPY_RETURN_REFUSALS = [
  { name: "selected slot override", prefix: "declare const foreign:()=>number;", field: "settleRetainedChatRebase:foreign," },
  {
    name: "foreign selected alternative",
    prefix: "declare const choose:boolean;declare const foreign:()=>number;",
    field: "settleRetainedChatRebase:choose?()=>input.settleRetainedChatRebase():foreign,",
  },
  { name: "cyclic factory alternative", prefix: "declare const choose:boolean;", cycle: true },
  { name: "unclosed second allocation", prefix: "declare const alternate:ChatContext;", additionalCall: "createChatService(alternate);" },
] as const;

for (const scenario of COPY_RETURN_REFUSALS) {
  test(`a native context copy return refuses ${scenario.name}`, () => {
    const value = `{...input,${"field" in scenario ? scenario.field : "settleRetainedChatRebase:()=>input.settleRetainedChatRebase()"}}`;
    const { source, factory, contract, selected } = nativeAdapterFixture("...{left:0},...{right:0},", {
      prefix: scenario.prefix,
      helper: `function createChatContext(input:ChatContext):ChatContext{return ${"cycle" in scenario ? `choose?${value}:createChatContext(input)` : value};} function createChatService(input:ChatContext){const ctx=createChatContext(input);use(ctx);}`,
    });
    if ("additionalCall" in scenario) {
      source.addStatements(scenario.additionalCall);
    }
    beginReferencePass();
    try {
      const observed = observeCallReturns(
        source.getDescendantsOfKind(SyntaxKind.CallExpression),
        [source, factory, contract].flatMap((file) => file.getDescendants()),
        { suppliedCallableTargets: true },
      );
      const program = observed.programs[0];
      if (program === undefined) {
        throw new Error("the actual copy return capture is missing");
      }
      const result = readAuthoredCallableSources(selected.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
      expect(result.kind).toBe("unresolved");
      const service = source.getFunctionOrThrow("createChatService");
      expect(program.callers.get(service.compilerNode)?.length).toBe("additionalCall" in scenario ? 2 : 1);
      expect(
        source
          .getProject()
          .getPreEmitDiagnostics()
          .map((diagnostic) => diagnostic.getMessageText()),
      ).toEqual([]);
      expect(program.inheritedReadTrialActive?.()).toBe(false);
    } finally {
      endReferencePass();
    }
  });
}

test("a native context adapter keeps complete finite selected alternatives", () => {
  const { project, source, factory, contract, calls, selected } = nativeAdapterFixture("...{left:0},...{right:0},", {
    prefix: "declare const choose:boolean;",
    helper:
      "function createChatContext(input:ChatContext):ChatContext{return {...input,settleRetainedChatRebase:choose?()=>input.settleRetainedChatRebase():()=>2};} function createChatService(input:ChatContext){const ctx=createChatContext(input);use(ctx);}",
  });
  beginReferencePass();
  try {
    const observed = observeCallReturns(
      calls,
      [source, factory, contract].flatMap((file) => file.getDescendants()),
      { suppliedCallableTargets: true },
    );
    const program = observed.programs[0];
    if (program === undefined) {
      throw new Error("the finite selected alternatives capture is missing");
    }
    const result = readAuthoredCallableSources(selected.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
    const alternatives = source.getFunctionOrThrow("createChatContext").getDescendantsOfKind(SyntaxKind.ArrowFunction);
    expect(program.program).toBe(project.getProgram().compilerObject);
    expect(alternatives).toHaveLength(2);
    expect(result.kind, result.kind === "unresolved" ? result.detail : "resolved").toBe("resolved");
    expect(result.kind === "resolved" ? result.value.map((leaf) => leaf.value) : []).toEqual(alternatives);
    expect(result.kind === "resolved" && result.value.every((leaf) => leaf.present && leaf.path.length === 0)).toBe(true);
    expect(project.getPreEmitDiagnostics().map((diagnostic) => diagnostic.getMessageText())).toEqual([]);
  } finally {
    endReferencePass();
  }
});

const NESTED_PRESENCE_CONTROLS = [
  { name: "nested-only rpg", fields: "...{rpg:input.rpg??null},", key: "rpg", expected: ["delegate"], resolved: true },
  { name: "later own rpg overwrite", fields: "...{rpg:null},...{rpg:input.rpg??null},", key: "rpg", expected: ["delegate"], resolved: true },
  { name: "later null shadow", fields: "...{rpg:input.rpg??null},...{rpg:null},", key: "rpg", expected: ["null"], resolved: true },
  {
    name: "conditional present and absent",
    fields: "rpg:input.rpg??null,...(choose?{marker:1}:{}),",
    prefix: "declare const choose:boolean;",
    key: "marker",
    expected: ["1", "ABSENT"],
    resolved: true,
  },
  {
    name: "later own marker overwrite",
    fields: "rpg:input.rpg??null,...(choose?{marker:1}:{}),...{marker:2},",
    prefix: "declare const choose:boolean;",
    key: "marker",
    expected: ["2"],
    resolved: true,
  },
  { name: "nested getter", fields: "rpg:input.rpg??null,...{get marker(){return 1;}},", key: "marker", expected: [], resolved: false },
  {
    name: "unknown conditional key source",
    fields: "rpg:input.rpg??null,...(choose?{marker:1}:foreign),",
    prefix: "declare const choose:boolean;declare const foreign:object;",
    key: "marker",
    expected: [],
    resolved: false,
  },
  { name: "actual allocation alternatives", fields: "", key: "marker", expected: ["2", "3"], allocations: true, resolved: true },
] as const;

for (const scenario of NESTED_PRESENCE_CONTROLS) {
  test(`a native context adapter preserves nested presence: ${scenario.name}`, () => {
    const assembly = `${scenario.fields}settleRetainedChatRebase:stats.settleRetainedChatRebase`;
    const { project, source, factory, contract, calls, selected, owner } = nativeAdapterFixture("", {
      prefix: "prefix" in scenario ? scenario.prefix : "",
      factory:
        "allocations" in scenario
          ? "function buildChatService(input:{rpg:ChatRpgOps}){const stats=createStats();const first={...{left:0},rpg:input.rpg??null,marker:2,settleRetainedChatRebase:stats.settleRetainedChatRebase};const second={...{right:0},rpg:input.rpg??null,marker:3,settleRetainedChatRebase:stats.settleRetainedChatRebase};createChatService(first);createChatService(second);}"
          : `function buildChatService(input:{rpg:ChatRpgOps}){const stats=createStats();const context={${assembly}};createChatService(context);}`,
    });
    beginReferencePass();
    try {
      const observed = observeCallReturns(
        calls,
        [source, factory, contract].flatMap((file) => file.getDescendants()),
        { suppliedCallableTargets: true },
      );
      const program = observed.programs[0];
      if (program === undefined) {
        throw new Error("the nested presence capture is missing");
      }
      const result = readAuthoredCallableSources(selected.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
      expect(result.kind, result.kind === "unresolved" ? `${result.detail} at ${result.node.getText()}` : "resolved").toBe(
        scenario.resolved ? "resolved" : "unresolved",
      );
      expect(project.getPreEmitDiagnostics().map((diagnostic) => diagnostic.getMessageText())).toEqual([]);
      const adapter = source.getFunctionOrThrow("createChatContext");
      const service = source.getFunctionOrThrow("createChatService");
      const build = source.getFunctionOrThrow("buildChatService");
      const wrapper = adapter.getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
      const adapterCall = calls.find((call) => call.getExpression().getText() === "createChatContext");
      const buildCall = calls.find((call) => call.getExpression().getText() === "buildChatService");
      const formal = service.getParameters()[0];
      const adapterFormal = adapter.getParameters()[0];
      const consumers = program.callers.get(service.compilerNode);
      if (adapterCall === undefined || buildCall === undefined || formal === undefined || adapterFormal === undefined || consumers === undefined) {
        throw new Error("the actual nested-presence caller/formal is missing");
      }
      const projected = scenario.resolved
        ? consumers.map((consumer) => {
            const bindings = readCallBindings(adapterCall, adapter, readCallBindings(consumer.call, service, readCallBindings(buildCall, build, new Map())));
            const argument = consumer.call.getArguments()[0];
            if (argument === undefined) {
              throw new Error("the actual service argument is missing");
            }
            const allocation = build.getVariableDeclarationOrThrow(argument.getText());
            const operand = adapter.getFirstDescendantByKindOrThrow(SyntaxKind.SpreadAssignment).getExpression();
            const record = readReturnedValue(operand, [], observed, { terminals: new Set(), bindings });
            const value = readReturnedValue(adapterCall, [scenario.key], observed, { terminals: new Set(), bindings });
            const values =
              value.kind === "resolved"
                ? value.value.map((leaf) => {
                    if (!leaf.present) {
                      return "ABSENT";
                    }
                    return leaf.value === owner.getParent().getParent() ? "delegate" : leaf.value.getText();
                  })
                : [];
            return {
              bindingMatches:
                argument.getSymbol()?.getValueDeclaration() === allocation &&
                bindings.get(formal) === argument &&
                bindings.get(adapterFormal) === adapterCall.getArguments()[0],
              records: record.kind === "resolved" ? record.value.map((leaf) => leaf.value) : [],
              allocation: allocation.getInitializerOrThrow(),
              kind: value.kind,
              values,
            };
          })
        : [];
      expect(projected.every((entry) => entry.bindingMatches)).toBe(true);
      expect(projected.map((entry) => entry.records)).toEqual(projected.map((entry) => [entry.allocation]));
      expect(projected.map((entry) => entry.kind)).toEqual(projected.map(() => "resolved"));
      expect(projected.flatMap((entry) => entry.values)).toEqual(scenario.expected);
      expect(result.kind === "resolved" ? result.value.map((leaf) => leaf.value) : []).toEqual(scenario.resolved ? [wrapper] : []);
      expect(result.kind === "resolved" && result.value.every((leaf) => leaf.present && leaf.path.length === 0)).toBe(scenario.resolved);
      const count = "allocations" in scenario ? 2 : 1;
      expect(consumers).toHaveLength(count);
      expect(new Set(consumers.map((consumer) => consumer.call.compilerNode)).size).toBe(count);
      expect(new Set(consumers.map((consumer) => consumer.call.getArguments()[0]?.compilerNode)).size).toBe(count);
      expect(program.inheritedReadTrialActive?.()).toBe(false);
    } finally {
      endReferencePass();
    }
  });
}

for (const cyclic of [false, true]) {
  test(`native ordinary spread absence preserves its fallback cycle chain: cyclic=${cyclic}`, () => {
    const { project, source, factory, contract, calls, selected } = nativeDeferredFixture(false, true, {
      prefix: cyclic ? "function tail():object{return {...tail()};}" : "const tail={unrelated(){return 0;}};",
      factory: `function buildChatService(input:{rpg:ChatRpgOps}){const context={...${cyclic ? "tail()" : "tail"},settleRetainedChatRebase:()=>1,rpg:input.rpg??null};use(context);}`,
    });
    beginReferencePass();
    try {
      const observed = observeCallReturns(
        calls,
        [source, factory, contract].flatMap((file) => file.getDescendants()),
        { suppliedCallableTargets: true },
      );
      const program = observed.programs[0];
      if (program === undefined) {
        throw new Error("the actual ordinary spread fallback capture is missing");
      }
      const result = readAuthoredCallableSources(selected.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
      const operand = source.getFunctionOrThrow("buildChatService").getFirstDescendantByKindOrThrow(SyntaxKind.SpreadAssignment).getExpression();
      const absent = readReturnedValue(operand, ["rpg"], observed, { terminals: new Set(), bindings: new Map() });
      const expected = source.getFunctionOrThrow("buildChatService").getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
      expect(program.program).toBe(project.getProgram().compilerObject);
      expect(project.getPreEmitDiagnostics().map((diagnostic) => diagnostic.getMessageText())).toEqual([]);
      expect(result.kind).toBe("resolved");
      expect(result.kind === "resolved" ? result.value.map((leaf) => leaf.value) : []).toEqual([expected]);
      expect(absent.kind, absent.kind === "unresolved" ? absent.detail : "resolved").toBe(cyclic ? "unresolved" : "resolved");
      expect(absent.kind === "resolved" ? absent.value.map((leaf) => ({ present: leaf.present, path: leaf.path })) : []).toEqual(
        cyclic ? [] : [{ present: false, path: ["rpg"] }],
      );
      expect(program.inheritedReadTrialActive?.()).toBe(false);
    } finally {
      endReferencePass();
    }
  });
}

for (const immediate of [false, true]) {
  for (const annotated of [false, true]) {
    test(`a deferred native delegate invocation retains its actual witness: immediate=${immediate}, annotated=${annotated}`, () => {
      const { project, source, calls, selected, actualCall, owner, expected, all, contract, factory } = nativeDeferredFixture(immediate, annotated);
      beginReferencePass();
      try {
        const observed = observeCallReturns(
          calls,
          [source, factory, contract].flatMap((file) => file.getDescendants()),
          { suppliedCallableTargets: true },
        );
        const program = observed.programs[0];
        if (program === undefined) {
          throw new Error("the native deferred capture is missing");
        }
        const first = readAuthoredCallableSources(selected.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
        const before = program.byCall.get(actualCall.compilerNode);
        const beforeWitness = before?.invocationTargets ?? before?.targets;
        const beforeEpoch = program.callableProofEpoch?.();
        const beforeCallers = program.callers.get(owner.compilerNode)?.map((caller) => caller.call) ?? [];
        const settlement = program.suppliedCallableUses?.(actualCall);
        const after = program.byCall.get(actualCall.compilerNode);
        const afterWitness = after?.invocationTargets ?? after?.targets;
        const afterEpoch = program.callableProofEpoch?.();
        const second = readAuthoredCallableSources(selected.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
        const signature = project.getTypeChecker().getResolvedSignature(all)?.getDeclaration();
        const formal = owner.getParameters()[0];
        expect(program.program).toBe(project.getProgram().compilerObject);
        expect(program.program.getSourceFile(source.getFilePath())).toBe(source.compilerNode);
        expect(program.program.getSourceFile(owner.getSourceFile().getFilePath())).toBe(owner.getSourceFile().compilerNode);
        expect(signature !== undefined && program.program.isSourceFileDefaultLibrary(signature.getSourceFile().compilerNode)).toBe(true);
        expect(project.getPreEmitDiagnostics().map((diagnostic) => diagnostic.getMessageText())).toEqual([]);
        expect(first.kind, first.kind === "unresolved" ? `${first.detail} at ${first.node.getText()}` : "resolved").toBe("resolved");
        expect(first.kind === "resolved" ? first.value.map((leaf) => leaf.value) : []).toEqual([expected]);
        expect(before?.call).toBe(actualCall);
        expect(beforeWitness?.kind === "resolved" ? beforeWitness.value : []).toEqual([owner]);
        expect(beforeCallers).toEqual([actualCall]);
        expect(beforeEpoch?.refining).toBe(false);
        expect(settlement?.kind).toBe("resolved");
        expect(afterWitness?.kind === "resolved" ? afterWitness.value : []).toEqual([owner]);
        expect(afterEpoch?.refining).toBe(false);
        expect(program.inheritedReadTrialActive?.()).toBe(false);
        expect(
          actualCall
            .getExpression()
            .getSymbol()
            ?.getDeclarations()
            .map((declaration) => declaration.getKind()),
        ).toEqual([annotated ? SyntaxKind.PropertySignature : SyntaxKind.PropertyAssignment]);
        if (formal === undefined) {
          throw new Error("the actual native delegate formal is missing");
        }
        expect(readCallBindings(actualCall, owner, new Map()).get(formal)).toBe(actualCall.getArguments()[0]);
        expect(second.kind, second.kind === "unresolved" ? `${second.detail} at ${second.node.getText()}` : "resolved").toBe("resolved");
      } finally {
        endReferencePass();
      }
    });
  }
}

const ANNOTATED_ORIGIN_REFUSALS = [
  { name: "mutable receiver binding", allocation: "let" },
  { name: "receiver replacement", allocation: "let", after: "rpgOpsDelegate={handoffRekeyActors:async()=>{},resolveUserMacros:async()=>[]};" },
  { name: "selected slot replacement", after: 'rpgOpsDelegate.resolveUserMacros=async()=>["changed"];' },
  { name: "mutating receiver alias", after: 'const alias=rpgOpsDelegate;alias.resolveUserMacros=async()=>["changed"];' },
  {
    name: "mutating copied containing carrier",
    after: 'const holder={delegate:rpgOpsDelegate};const copied={...holder};copied.delegate.resolveUserMacros=async()=>["changed"];',
  },
  { name: "opaque receiver handoff", prefix: "declare function escape(value:ChatRpgOps):void;", after: "escape(rpgOpsDelegate);" },
  {
    name: "opaque selected member handoff",
    prefix: "declare function escape(value:ReadChatUserMacros):void;",
    after: "escape(rpgOpsDelegate.resolveUserMacros);",
  },
  {
    name: "getter effect",
    fields: "get resolveUserMacros(){rpgOpsDelegate.handoffRekeyActors=async()=>{};return (chatId:string)=>rpgOps().resolveUserMacros(chatId);}",
  },
  { name: "prototype mutation", after: "Object.setPrototypeOf(rpgOpsDelegate,{});" },
  {
    name: "unknown callable alternative",
    prefix: "declare const choose:boolean;declare const foreign:ReadChatUserMacros;",
    fields: "resolveUserMacros:choose?((chatId:string)=>rpgOps().resolveUserMacros(chatId)):foreign",
  },
] as const;

for (const scenario of ANNOTATED_ORIGIN_REFUSALS) {
  test(`an annotated actual callable origin refuses ${scenario.name}`, () => {
    const { project, source, factory, contract, calls, selected, actualCall } = nativeDeferredFixture(false, true, scenario);
    beginReferencePass();
    try {
      const observed = observeCallReturns(
        calls,
        [source, factory, contract].flatMap((file) => file.getDescendants()),
        { suppliedCallableTargets: true },
      );
      const program = observed.programs[0];
      if (program === undefined) {
        throw new Error("the actual annotated refusal capture is missing");
      }
      expect(program.program).toBe(project.getProgram().compilerObject);
      expect(program.byCall.has(actualCall.compilerNode)).toBe(true);
      const result = readAuthoredCallableSources(selected.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
      expect(result.kind, scenario.name).toBe("unresolved");
      expect(program.inheritedReadTrialActive?.()).toBe(false);
    } finally {
      endReferencePass();
    }
  });
}

for (const invalidation of ["call", "references", "foreign", "stale", "demander"] as const) {
  test(`an annotated actual callable origin refuses ${invalidation} capture authority`, () => {
    const { project, source, factory, contract, calls, selected, actualCall } = nativeDeferredFixture(false, true, {
      after: 'const other={resolveUserMacros:async(chatId:string)=>["other"]};other.resolveUserMacros("chat");',
    });
    const omitted = new Set([
      "composeServices",
      "createResolveChatUserMacroDefs",
      "buildImagery",
      "input.resolveUserMacroDefs",
      "resolveChatUserMacroDefs",
      "imagery.load",
    ]);
    beginReferencePass();
    try {
      const observed = observeCallReturns(
        calls.filter((call) => invalidation !== "call" || (call !== actualCall && !omitted.has(call.getExpression().getText()))),
        invalidation === "references" ? undefined : [source, factory, contract].flatMap((file) => file.getDescendants()),
        { suppliedCallableTargets: true },
      );
      const program = observed.programs[0];
      const other = calls.find((call) => call.getExpression().getText() === "other.resolveUserMacros");
      if (program === undefined || other === undefined) {
        throw new Error("the actual annotated authority control is missing");
      }
      const nativeCall = actualCall.compilerNode;
      const before = program.byCall;
      expect(program.program).toBe(project.getProgram().compilerObject);
      expect(program.byCall.has(nativeCall)).toBe(invalidation !== "call");
      expect(program.byCall.get(other.compilerNode)?.targets.kind).toBe("resolved");
      const input = invalidation === "foreign" ? nativeDeferredFixture(false, true).selected : selected;
      if (invalidation === "stale") {
        project.compilerOptions.set({ strictNullChecks: false });
      }
      if (invalidation === "demander") {
        Object.defineProperty(program, "suppliedCallableUses", { configurable: true, value: undefined });
      }
      const result = readAuthoredCallableSources(input.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
      expect(result.kind).toBe("unresolved");
      expect(program.byCall.has(nativeCall)).toBe(invalidation !== "call");
      expect(program.byCall).toBe(before);
      expect(program.inheritedReadTrialActive?.()).toBe(false);
    } finally {
      endReferencePass();
    }
  });
}

test("an annotated actual callable origin respects denied native admission before settlement", () => {
  const { source, factory, contract, calls, selected, actualCall } = nativeDeferredFixture(false, true);
  beginReferencePass();
  try {
    const observed = observeCallReturns(
      calls,
      [source, factory, contract].flatMap((file) => file.getDescendants()),
      { suppliedCallableTargets: true },
    );
    const program = observed.programs[0];
    if (program === undefined) {
      throw new Error("the actual denied-admission capture is missing");
    }
    const nativeCall = actualCall.compilerNode;
    const before = program.byCall;
    const revision = program.callableProofEpoch?.().demandRevision;
    expect(program.byCall.has(nativeCall)).toBe(true);
    expect(program.byCall.get(nativeCall)?.targets.kind).toBe("unresolved");
    const result = readAuthoredCallableSources(
      selected.getExpression(),
      (call) => call.compilerNode !== nativeCall && program.byCall.has(call.compilerNode),
      observed,
    );
    expect(result.kind).toBe("unresolved");
    expect(program.byCall).toBe(before);
    expect(program.callableProofEpoch?.().demandRevision).toBe(revision);
    expect(program.byCall.get(nativeCall)?.targets.kind).toBe("unresolved");
  } finally {
    endReferencePass();
  }
});

test("an annotated actual callable origin settles only after real private revocation", () => {
  const { source, factory, contract, selected, actualCall, owner, expected } = nativeDeferredFixture(false, true);
  source.addStatements('const key="safe";const registry={safe:{}};registry[key];');
  beginReferencePass();
  try {
    const observed = observeCallReturns(
      source.getDescendantsOfKind(SyntaxKind.CallExpression),
      [source, factory, contract].flatMap((file) => file.getDescendants()),
      { suppliedCallableTargets: true },
    );
    const program = observed.programs[0];
    const trial = program?.withInheritedReadTrial;
    if (program === undefined || trial === undefined) {
      throw new Error("the actual annotated private trial owner is missing");
    }
    const nativeCall = actualCall.compilerNode;
    expect(program.byCall.get(nativeCall)?.targets.kind).toBe("unresolved");
    const premises: InheritedReadPremise[] = [];
    const unchanged: boolean[] = [];
    const revoked: boolean[] = [];
    const observeTrial: NonNullable<CallReturnProgram["withInheritedReadTrial"]> = (node, captured, prove) =>
      trial(node, captured, () => {
        try {
          return prove();
        } finally {
          const premise = premises.at(-1);
          if (premise !== undefined && program.byCall.get(nativeCall)?.targets.kind !== "resolved") {
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
            if (program.byCall.get(nativeCall)?.targets.kind !== "resolved") {
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
    const targets = program.byCall.get(nativeCall)?.targets;
    expect(targets?.kind === "resolved" ? targets.value : []).toEqual([owner]);
    const result = readAuthoredCallableSources(selected.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
    expect(result.kind === "resolved" ? result.value.map((leaf) => leaf.value) : result.detail).toEqual([expected]);
  } finally {
    endReferencePass();
  }
});
