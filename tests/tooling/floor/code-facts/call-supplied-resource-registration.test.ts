// @subject tooling/src/floor/code-facts/call-supplied.ts
// @subject tooling/src/floor/code-facts/call-returns.ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project, SyntaxKind, ts } from "ts-morph";
import { vi } from "vitest";
import { observeCallReturns } from "../../../../tooling/src/floor/code-facts/call-returns.ts";
import { beginReferencePass, endReferencePass } from "../../../../tooling/src/floor/code-facts/reference-fact.ts";
import { readAuthoredCallableSources, readReturnedValue } from "../../../../tooling/src/floor/code-facts/value-carrier.ts";

test("native async resource registration retains the actual callable return and containing lifetime", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { target: ts.ScriptTarget.ESNext, lib: ["lib.esnext.d.ts"] } });
  const source = project.createSourceFile(
    "/resource.ts",
    "const resources=new AsyncDisposableStack();function create(){return {read:()=>1,async [Symbol.asyncDispose](){}};}const held=resources.use(create());held.read();",
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const registration = calls.find((call) => call.getExpression().getText() === "resources.use");
  const selected = calls.find((call) => call.getExpression().getText() === "held.read");
  const expected = source.getFunctionOrThrow("create").getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
  if (registration === undefined || selected === undefined) {
    throw new Error("the real native registration is missing");
  }
  const signature = project.getTypeChecker().getResolvedSignature(registration)?.getDeclaration();
  expect(signature !== undefined && project.getProgram().compilerObject.isSourceFileDefaultLibrary(signature.getSourceFile().compilerNode)).toBe(true);
  beginReferencePass();
  try {
    const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
    const fact = readAuthoredCallableSources(selected.getExpression(), undefined, observed);
    expect(fact.kind, fact.kind === "unresolved" ? `${fact.reason}: ${fact.detail}` : "resolved").toBe("resolved");
    expect(fact.kind === "resolved" && fact.value.length === 1 && fact.value[0]?.value === expected).toBe(true);
  } finally {
    endReferencePass();
  }
});

test("native async resource registration retains the production background-work callable", async ({ repoRoot }) => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { target: ts.ScriptTarget.ESNext, lib: ["lib.esnext.d.ts", "lib.dom.d.ts"] } });
  const base = "packages/server/src/infra/tasks";
  const producer = project.createSourceFile(`/repo/${base}/background.ts`, await readFile(join(repoRoot, base, "background.ts"), "utf8"));
  project.createSourceFile(`/repo/${base}/contract/background.ts`, await readFile(join(repoRoot, base, "contract/background.ts"), "utf8"));
  const source = project.createSourceFile(
    "/repo/background-use.ts",
    `import {createBackgroundWork} from "./${base}/background.ts";const construction=new AsyncDisposableStack();const backgroundResources=new AsyncDisposableStack();construction.defer(()=>backgroundResources.disposeAsync());const background=backgroundResources.use(createBackgroundWork());background.cancel();`,
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const selected = calls.find((call) => call.getExpression().getText() === "background.cancel");
  const expected = producer
    .getDescendantsOfKind(SyntaxKind.PropertyAssignment)
    .find((property) => property.getName() === "cancel")
    ?.getInitializer();
  if (selected === undefined || expected === undefined) {
    throw new Error("the actual background-work callable is missing");
  }
  beginReferencePass();
  try {
    const observed = observeCallReturns(calls, [...source.getDescendants(), ...producer.getDescendants()], { suppliedCallableTargets: true });
    const fact = readAuthoredCallableSources(selected.getExpression(), undefined, observed);
    expect(fact.kind, fact.kind === "unresolved" ? `${fact.reason}: ${fact.detail}` : "resolved").toBe("resolved");
    expect(fact.kind === "resolved" && fact.value.length === 1 && fact.value[0]?.value === expected).toBe(true);
  } finally {
    endReferencePass();
  }
});

for (const scenario of [
  {
    name: "conditional native signal without dispatch",
    conditional: true,
    dispatch: false,
    prototype: false,
    handoff: false,
    undefinedOwn: false,
    resolved: true,
  },
  {
    name: "definite native signal with supplied dispatch",
    conditional: false,
    dispatch: true,
    prototype: false,
    handoff: false,
    undefinedOwn: false,
    resolved: true,
  },
  {
    name: "finite dispatch preserved through a local signal alias",
    conditional: true,
    dispatch: true,
    prototype: false,
    handoff: false,
    undefinedOwn: false,
    resolved: true,
  },
  {
    name: "finite dispatch preserved through a signal argument",
    conditional: true,
    dispatch: true,
    prototype: false,
    handoff: true,
    undefinedOwn: false,
    resolved: true,
  },
  {
    name: "absent native signal with an inherited getter",
    conditional: true,
    dispatch: false,
    prototype: true,
    handoff: false,
    undefinedOwn: false,
    resolved: false,
  },
  {
    name: "own undefined shadows the inherited getter",
    conditional: false,
    dispatch: false,
    prototype: true,
    handoff: false,
    undefinedOwn: true,
    resolved: true,
  },
] as const) {
  let properties = "backgroundSignal:input.backgroundSignal";
  if (scenario.undefinedOwn) {
    properties = "backgroundSignal:undefined";
  } else if (scenario.conditional) {
    properties = "...(input.backgroundSignal===undefined?{}:{backgroundSignal:input.backgroundSignal})";
  }
  test(`original callable sibling boundary: ${scenario.name}`, async () => {
    const referenceFacts = await import("../../../../tooling/src/floor/code-facts/reference-fact.ts");
    const code = `
      function background(){const controller=new AbortController();return {signal:controller.signal};}
      function consume(ctx){return ctx.settle();}
      function data(args){return args.signal;}
      function engine(ctx){${scenario.handoff ? "data({signal:ctx.backgroundSignal});" : "const signal=ctx.backgroundSignal;"}return consume(ctx);}
      function compose(input){const ctx={settle:()=>1,${properties}};return engine(ctx);}
      ${
        scenario.dispatch
          ? `
      const modes={local:()=>true};
      function selectMode(deps){const {authConfig={mode:"local"}}=deps;void deps.timers;return authConfig.mode;}
      function dispatch(mode){return modes[mode]();}
      const authConfig={mode:"local"};const mode=selectMode({authConfig});dispatch(mode);
      `
          : ""
      }
      ${scenario.prototype ? "Object.defineProperty(Object.prototype,'backgroundSignal',{get(){this.settle=()=>2;return undefined;}});" : ""}
      const work=background();const answer=compose(${scenario.prototype ? "{}" : "{backgroundSignal:work.signal}"});
    `;
    expect(runInNewContext(`${code};answer;`, Object.fromEntries([["AbortController", AbortController]]))).toBe(
      scenario.prototype && !scenario.undefinedOwn ? 2 : 1,
    );
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { target: ts.ScriptTarget.ESNext, lib: ["lib.esnext.d.ts", "lib.dom.d.ts"] } });
    const source = project.createSourceFile("/original-callable-sibling.ts", code);
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const selected = calls.find((call) => call.getExpression().getText() === "ctx.settle");
    const expected = source.getFunctionOrThrow("compose").getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
    if (selected === undefined) {
      throw new Error("the selected injected callable is missing");
    }
    beginReferencePass();
    const inherited = vi.spyOn(referenceFacts, "inspectInheritedReadEffects");
    try {
      const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
      const program = observed.programs[0];
      if (program === undefined) {
        throw new Error("the actual captured native Program is missing");
      }
      inherited.mockClear();
      const fact = readAuthoredCallableSources(selected.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
      expect(
        inherited.mock.results.some(
          (result) => result.type === "return" && result.value.kind === "unresolved" && result.value.node.getText() === "modes[mode]",
        ),
      ).toBe(false);
      expect(
        fact.kind,
        fact.kind === "unresolved" ? `${fact.reason}: ${fact.detail} at ${fact.node.getText()}` : fact.value.map((value) => value.value.getText()).join(" | "),
      ).toBe(scenario.resolved ? "resolved" : "unresolved");
      expect(fact.kind === "resolved" && fact.value.length === 1 && fact.value[0]?.value === expected).toBe(scenario.resolved);
    } finally {
      inherited.mockRestore();
      endReferencePass();
    }
  });
}

test("factory-local completion retains the source-derived capability and optional signal handoff", async ({ repoRoot }) => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { target: ts.ScriptTarget.ESNext, lib: ["lib.esnext.d.ts", "lib.dom.d.ts"] } });
  const identity = project.createSourceFile("/identity-source.ts", await readFile(join(repoRoot, "packages/contracts/src/identity/index.ts"), "utf8"));
  const capability = project.createSourceFile("/capability-source.ts", await readFile(join(repoRoot, "packages/server/src/entry/auth/capability.ts"), "utf8"));
  const services = project.createSourceFile("/services-source.ts", await readFile(join(repoRoot, "packages/server/src/entry/compose/services.ts"), "utf8"));
  const owner = services.getFunctionOrThrow("createServices");
  const authConfig = owner.getDescendantsOfKind(SyntaxKind.BindingElement).find((element) => element.getName() === "authConfig");
  if (authConfig === undefined) {
    throw new Error("the actual defaulted services binding is missing");
  }
  const nativeCode = ts.transpileModule(
    `${identity.getVariableDeclarationOrThrow("MULTI_HUMAN_CAPABLE").getVariableStatementOrThrow().getText()}
     ${identity
       .getFunctionOrThrow("isMultiHumanCapable")
       .getText()
       .replace(/^export /, "")}
     ${capability
       .getFunctionOrThrow("createMultiHumanCapability")
       .getText()
       .replace(/^export /, "")}
     const env={AUTH_MODE:"local"};
     function createScopedTimers(input){return input;}
     async function createServices(deps){
       const timers=createScopedTimers(deps.timers);
       const {${authConfig.getText()}}=deps;
       ${owner.getVariableDeclarationOrThrow("authMode").getVariableStatementOrThrow().getText()}
       const settings={getEffectiveConfig:()=>({localMultiUser:true})};
       ${owner.getVariableDeclarationOrThrow("multiHumanCapable").getVariableStatementOrThrow().getText()}
       const controller=new AbortController();
       return {invoke:compose({backgroundSignal:controller.signal}),multiHumanCapable};
     }
     function compose(input){const ctx={settle:()=>1,...(input.backgroundSignal===undefined?{}:{backgroundSignal:input.backgroundSignal})};return ()=>engine(ctx);}
     function data(args){return args.signal;}
     function engine(ctx){data({signal:ctx.backgroundSignal});return ctx.settle();}
     async function boot(){const authConfig={mode:"local"};return await createServices({authConfig});}
     async function run(){const graph=await boot();graph.multiHumanCapable();return graph.invoke();}`,
    { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } },
  ).outputText;
  project.removeSourceFile(identity);
  project.removeSourceFile(capability);
  project.removeSourceFile(services);
  expect(await runInNewContext(`${nativeCode};run();`, Object.fromEntries([["AbortController", AbortController]]))).toBe(1);
  const source = project.createSourceFile("/factory-local-completion.ts", nativeCode);
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const target = calls.find((call) => call.getExpression().getText() === "ctx.settle");
  if (target === undefined) {
    throw new Error("the actual callable target is missing");
  }
  beginReferencePass();
  try {
    const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
    const program = observed.programs[0];
    if (program === undefined) {
      throw new Error("the captured factory context is missing");
    }
    const fact = readAuthoredCallableSources(target.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
    expect(fact.kind, fact.kind === "unresolved" ? `${fact.detail} at ${fact.node.getText()}` : "resolved").toBe("resolved");
    expect(fact.kind === "resolved" ? fact.value.map((leaf) => leaf.value.getText()) : []).toEqual(["() => 1"]);
  } finally {
    endReferencePass();
  }
});

test("a prior factory instance can change a later read at the same captured call site", () => {
  const code = `
    const shared={authConfig:{mode:"local"}};
    const modes={local:()=>true,oidc:()=>true};
    function dispatch(mode,config){return modes[mode](config.localMultiUser);}
    function capability(mode,readConfig){return ()=>dispatch(mode,readConfig());}
    function readConfig(){Object.defineProperty(Object.prototype,'timers',{configurable:true,get(){this.authConfig.mode='oidc';return undefined;}});return {localMultiUser:true};}
    function createServices(deps){const timers=deps.timers;const {authConfig={mode:"local"}}=deps;const authMode=authConfig.mode;return {authMode,capability:capability(authMode,readConfig)};}
    function boot(){return createServices(shared);}
    const first=boot();first.capability();const second=boot();
  `;
  expect(runInNewContext(`${code};[first.authMode,second.authMode];`)).toEqual(["local", "oidc"]);
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile("/repeated-factory-completion.ts", code);
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const owner = source.getFunctionOrThrow("createServices");
  const target = owner.getVariableDeclarationOrThrow("authMode").getInitializerOrThrow();
  beginReferencePass();
  try {
    const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
    const program = observed.programs[0];
    expect(program?.callers.get(owner.compilerNode)?.length).toBe(1);
    const fact = readReturnedValue(target, [], observed, new Set());
    expect(fact.kind).toBe("unresolved");
  } finally {
    endReferencePass();
  }
});

for (const handoff of [false, true]) {
  test(`conditional background data preserves ${handoff ? "argument handoff" : "local read"} and exact projection alternatives`, async ({ repoRoot }) => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { target: ts.ScriptTarget.ESNext, lib: ["lib.esnext.d.ts", "lib.dom.d.ts"] } });
    const base = "packages/server/src/infra/tasks";
    const producer = project.createSourceFile(`/repo/${base}/background.ts`, await readFile(join(repoRoot, base, "background.ts"), "utf8"));
    project.createSourceFile(`/repo/${base}/contract/background.ts`, await readFile(join(repoRoot, base, "contract/background.ts"), "utf8"));
    const composition = project.createSourceFile("/composition.ts", await readFile(join(repoRoot, "packages/server/src/entry/compose/chat.ts"), "utf8"));
    const spreads = composition
      .getDescendantsOfKind(SyntaxKind.SpreadAssignment)
      .filter((candidate) => candidate.getExpression().getText().startsWith("(input.backgroundSignal"));
    expect(spreads.length).toBe(1);
    const spread = spreads[0]?.getText();
    if (spread === undefined) {
      throw new Error("the production background signal spread is missing");
    }
    project.removeSourceFile(composition);
    const source = project.createSourceFile(
      "/repo/background-data.ts",
      `
    import {createBackgroundWork} from "./${base}/background.ts";
    interface Context{settle:()=>number;backgroundSignal?:AbortSignal}
    function consume(ctx:Context){return ctx.settle();}
    function generateSegments(ctx:Context,args:{signal?:AbortSignal}){return args.signal===undefined;}
    function engine(ctx:Context,deps:{generateSegments:typeof generateSegments}){${handoff ? "deps.generateSegments(ctx,{signal:ctx.backgroundSignal});" : "const signal=ctx.backgroundSignal;"}return consume(ctx);}
    function service(ctx:Context){return engine(ctx,{generateSegments});}
    function compose(input:{backgroundSignal?:AbortSignal}){const ctx={settle:()=>1,${spread}};return service(ctx);}
    const construction=new AsyncDisposableStack();const resources=new AsyncDisposableStack();construction.defer(()=>resources.disposeAsync());
    const background=resources.use(createBackgroundWork());compose({backgroundSignal:background.signal});
  `,
    );
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const target = calls.find((call) => call.getExpression().getText() === "ctx.settle");
    const signal = source.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression).find((member) => member.getText() === "ctx.backgroundSignal");
    const expected = source.getFunctionOrThrow("compose").getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
    const registration = calls.find((call) => call.getExpression().getText() === "resources.use");
    if (target === undefined || signal === undefined || registration === undefined) {
      throw new Error("the actual resource and data invocation is missing");
    }
    const native = project.getTypeChecker().getResolvedSignature(registration)?.getDeclaration();
    expect(native !== undefined && project.getProgram().compilerObject.isSourceFileDefaultLibrary(native.getSourceFile().compilerNode)).toBe(true);
    beginReferencePass();
    try {
      const references = [...source.getDescendants(), ...producer.getDescendants()];
      const observed = observeCallReturns(calls, references, { suppliedCallableTargets: true });
      const program = observed.programs[0];
      if (program === undefined) {
        throw new Error("the captured actual program is missing");
      }
      const fact = readAuthoredCallableSources(target.getExpression(), (candidate) => program.byCall.has(candidate.compilerNode), observed);
      const dataObserved = observeCallReturns(calls, references, { suppliedCallableTargets: true, nativeValueTransfers: true });
      const context = source.getFunctionOrThrow("compose").getFirstDescendantByKindOrThrow(SyntaxKind.ObjectLiteralExpression);
      const input = source.getFunctionOrThrow("compose").getParameters()[0];
      const compositionCall = calls.find((call) => call.getExpression().getText() === "compose");
      const argument = compositionCall?.getArguments()[0];
      if (input === undefined || argument === undefined) {
        throw new Error("the actual composition binding is missing");
      }
      const data = readReturnedValue(context, ["backgroundSignal"], dataObserved, {
        terminals: new Set(),
        bindings: new Map([[input, argument]]),
        nativeValueTransfers: true,
      });
      expect(data.kind, data.kind === "unresolved" ? data.detail : "resolved").toBe("resolved");
      expect(data.kind === "resolved" ? data.value.map((leaf) => ({ present: leaf.present, path: leaf.path, kind: leaf.value.getKindName() })) : []).toEqual([
        { present: true, path: ["signal"], kind: "NewExpression" },
        { present: false, path: ["backgroundSignal"], kind: "ObjectLiteralExpression" },
      ]);
      const controller = producer.getFirstDescendantByKindOrThrow(SyntaxKind.NewExpression);
      expect(data.kind === "resolved" && data.value[0]?.value === controller && data.value[1]?.value === context).toBe(true);
      expect(fact.kind, fact.kind === "unresolved" ? `${fact.reason}: ${fact.detail} at ${fact.node.getText()}` : "resolved").toBe("resolved");
      expect(fact.kind === "resolved" && fact.value.length === 1 && fact.value[0]?.value === expected).toBe(true);
    } finally {
      endReferencePass();
    }
  });
}

const OWN_DATA_RECEIVER_CASES = [
  { name: "plain own data argument", use: "consume(ctx.db);", property: "db,", target: "ctx.settle", resolved: true },
  { name: "nested own data receiver", use: "ctx.db.batch();", property: "db,", target: "ctx.settle", resolved: true },
  { name: "asserted own data receiver", use: "ctx.db!.batch();", property: "db,", target: "ctx.settle", resolved: true },
  { name: "parenthesized own data receiver", use: "(ctx.db).batch();", property: "db,", target: "ctx.settle", resolved: true },
  { name: "absent nested receiver", use: "ctx.db.batch();", property: "...(choose?{db}:{}),", target: "ctx.settle", resolved: false },
  { name: "getter nested receiver", use: "ctx.db.batch();", property: "get db(){this.settle=()=>2;return db;},", target: "ctx.settle", resolved: false },
  { name: "requested mutable-origin callee", use: "ctx.db.batch();", property: "db,", target: "ctx.db.batch", resolved: false },
] as const;

for (const scenario of OWN_DATA_RECEIVER_CASES) {
  test(`own sibling projection preserves ${scenario.name} through mutable lifecycle wiring`, async () => {
    const referenceFacts = await import("../../../../tooling/src/floor/code-facts/reference-fact.ts");
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile(
      "/lifecycle-data.ts",
      `
      interface Db{batch():void;}interface Context{db?:Db;settle:()=>number;optional?:object;}
      declare const choose:boolean;
      function consume(value:object|undefined){return value;}
      function commitHandoffSwap(ctx:Context){${scenario.use}consume({value:ctx.optional});return ctx.settle();}
      function acceptHostHandoff(ctx:Context){return commitHandoffSwap(ctx);}
      function createParticipants(ctx:Context){return acceptHostHandoff(ctx);}
      function createChatService(ctx:Context){return createParticipants(ctx);}
      function buildChatService(input:{db:Db;optional?:object}){
        const {db}=input;const chatCtx={${scenario.property}settle:()=>1,...(input.optional===undefined?{}:{optional:input.optional})};
        return createChatService(chatCtx);
      }
      function createServices(deps:{db:Db}){const {db}=deps;return buildChatService({db});}
      async function createDb():Promise<Db>{return {batch(){}};}
      function createLifecycle(){
        let db:Db|null=null;
        async function boot(){db=await createDb();return createServices({db});}
        function shutdown(){db=null;}
        return {boot,shutdown};
      }
      const lifecycle=createLifecycle();lifecycle.boot();
    `,
    );
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const target = calls.find((call) => call.getExpression().getText() === scenario.target);
    const mutable = source.getFunctionOrThrow("createLifecycle").getVariableDeclarationOrThrow("db");
    const expected = source
      .getFunctionOrThrow("buildChatService")
      .getDescendantsOfKind(SyntaxKind.ArrowFunction)
      .find((node) => node.getText() === "()=>1");
    if (target === undefined || expected === undefined) {
      throw new Error("the real selected fixture target is missing");
    }
    beginReferencePass();
    const inherited = vi.spyOn(referenceFacts, "inspectInheritedReadEffects");
    try {
      const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
      const program = observed.programs[0];
      if (program === undefined) {
        throw new Error("the captured composition program is missing");
      }
      inherited.mockClear();
      const fact = readAuthoredCallableSources(target.getExpression(), (candidate) => program.byCall.has(candidate.compilerNode), observed);
      expect(fact.kind, fact.kind === "unresolved" ? `${fact.detail} at ${fact.node.getText()}` : "resolved").toBe(
        scenario.resolved ? "resolved" : "unresolved",
      );
      expect(fact.kind === "resolved" && fact.value.length === 1 && fact.value[0]?.value === expected).toBe(scenario.resolved);
      expect(inherited.mock.calls.length > 0).toBe(scenario.resolved);
      expect(scenario.target !== "ctx.db.batch" || (fact.kind === "unresolved" && fact.reason === "write" && fact.node === mutable)).toBe(true);
    } finally {
      inherited.mockRestore();
      endReferencePass();
    }
  });
}

const CONDITIONAL_SIBLING_READ_CASES = [
  { name: "finite optional data", properties: "...(choose?{payload:{}}:{}),", use: "consume({value:ctx.payload});", effect: "", resolved: true },
  { name: "known undefined data", properties: "payload:undefined,", use: "consume({value:ctx.payload});", effect: "", resolved: true },
  { name: "absent data", properties: "", use: "consume({value:ctx.payload});", effect: "", resolved: true },
  { name: "earlier absent receiver", properties: "", use: "consume({value:ctx.payload.value});", effect: "", resolved: false },
  { name: "asserted absent receiver", properties: "", use: "consume({value:ctx.payload!.value});", effect: "", resolved: false },
  { name: "parenthesized absent receiver", properties: "", use: "consume({value:(ctx.payload).value});", effect: "", resolved: false },
  { name: "asserted type absent receiver", properties: "", use: "consume({value:(ctx.payload as object).value});", effect: "", resolved: false },
  { name: "parenthesized missing callee", properties: "", use: "(ctx.payload)();", effect: "", resolved: false },
  { name: "invoked optional data", properties: "...(choose?{payload:()=>1}:{}),", use: "ctx.payload();", effect: "", resolved: false },
  {
    name: "getter selected write",
    properties: "get payload(){this.settle=()=>2;return {};},",
    use: "consume({value:ctx.payload});",
    effect: "",
    resolved: false,
  },
  {
    name: "conditional getter",
    properties: "...(choose?{get payload(){context.settle=()=>2;return {};}}:{}),",
    use: "consume({value:ctx.payload});",
    effect: "",
    resolved: false,
  },
  {
    name: "prototype getter",
    properties: "__proto__:{get payload(){this.settle=()=>2;return {}; }},",
    use: "consume({value:ctx.payload});",
    effect: "",
    resolved: false,
  },
  {
    name: "global prototype getter",
    properties: "",
    use: "consume({value:ctx.payload});",
    effect: "Object.defineProperty(Object.prototype,'payload',{get(){this.settle=()=>2;return {};}});",
    resolved: false,
  },
  { name: "opaque spread", properties: "...foreign,", use: "consume({value:ctx.payload});", effect: "", resolved: false },
  { name: "containing escape", properties: "...(choose?{payload:{}}:{}),", use: "consume({value:ctx.payload});", effect: "leak(context);", resolved: false },
  {
    name: "containing write",
    properties: "...(choose?{payload:{}}:{}),",
    use: "consume({value:ctx.payload});",
    effect: "context.settle=()=>2;",
    resolved: false,
  },
] as const;

for (const scenario of CONDITIONAL_SIBLING_READ_CASES) {
  test(`conditional sibling data retains ${scenario.name}`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile(
      "/sibling-data.ts",
      `
      declare const choose:boolean;declare const foreign:object;declare function leak(value:object):void;
      function consume(args:{value:object|undefined}){return args.value;}
      function select(ctx:{settle:()=>number;payload?:object}){${scenario.use}return ctx.settle();}
      const context={settle:()=>1,${scenario.properties}};${scenario.effect}select(context);
    `,
    );
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const selected = calls.find((call) => call.getExpression().getText() === "ctx.settle");
    const expected = source.getVariableDeclarationOrThrow("context").getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
    if (selected === undefined) {
      throw new Error("the selected sibling call is missing");
    }
    beginReferencePass();
    try {
      const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
      const program = observed.programs[0];
      if (program === undefined) {
        throw new Error("the sibling native context is missing");
      }
      const fact = readAuthoredCallableSources(selected.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
      expect(fact.kind, fact.kind === "unresolved" ? `${fact.reason}: ${fact.detail}` : "resolved").toBe(scenario.resolved ? "resolved" : "unresolved");
      expect(fact.kind === "resolved" && fact.value.length === 1 && fact.value[0]?.value === expected).toBe(scenario.resolved);
    } finally {
      endReferencePass();
    }
  });
}

const RESOURCE_REGISTRATION_CASES = [
  {
    name: "constructor alias",
    setup: "const Stack=AsyncDisposableStack;const resources=new Stack();",
    disposal: "async [Symbol.asyncDispose](){}",
    effect: "",
    resolved: true,
  },
  {
    name: "receiver alias",
    setup: "const original=new AsyncDisposableStack();const resources=original;",
    disposal: "async [Symbol.asyncDispose](){}",
    effect: "",
    resolved: true,
  },
  {
    name: "upstream receiver alias escape",
    setup: "const original=new AsyncDisposableStack();const resources=original;",
    disposal: "async [Symbol.asyncDispose](){}",
    effect: "leak(original);",
    resolved: false,
  },
  {
    name: "receiver escape",
    setup: "const resources=new AsyncDisposableStack();",
    disposal: "async [Symbol.asyncDispose](){}",
    effect: "leak(resources);",
    resolved: false,
  },
  {
    name: "method overwrite",
    setup: "const resources=new AsyncDisposableStack();",
    disposal: "async [Symbol.asyncDispose](){}",
    effect: "resources.use=(value)=>value;",
    resolved: false,
  },
  {
    name: "prototype overwrite",
    setup: "const resources=new AsyncDisposableStack();",
    disposal: "async [Symbol.asyncDispose](){}",
    effect: "AsyncDisposableStack.prototype.use=(value)=>value;",
    resolved: false,
  },
  {
    name: "shadowed constructor with an escaping use",
    setup: "class AsyncDisposableStack{use(value:{read:()=>number}){leak(value);return value;}}const resources=new AsyncDisposableStack();",
    disposal: "async [Symbol.asyncDispose](){}",
    effect: "",
    resolved: false,
  },
  {
    name: "annotation-only native receiver",
    setup: "const resources={use(value:{read:()=>number}){leak(value);return value;}} as AsyncDisposableStack;",
    disposal: "async [Symbol.asyncDispose](){}",
    effect: "",
    resolved: false,
  },
  {
    name: "disposal getter",
    setup: "const resources=new AsyncDisposableStack();",
    disposal: "get [Symbol.asyncDispose](){leak(this);return async()=>{};}",
    effect: "",
    resolved: false,
  },
  {
    name: "disposal receiver write",
    setup: "const resources=new AsyncDisposableStack();",
    disposal: "async [Symbol.asyncDispose](){this.read=()=>2;}",
    effect: "",
    resolved: false,
  },
  { name: "closed synchronous fallback", setup: "const resources=new AsyncDisposableStack();", disposal: "[Symbol.dispose](){}", effect: "", resolved: true },
  { name: "closed synchronous stack", setup: "const resources=new DisposableStack();", disposal: "[Symbol.dispose](){}", effect: "", resolved: true },
  {
    name: "async disposer wins over unused sync getter",
    setup: "const resources=new AsyncDisposableStack();",
    disposal: "async [Symbol.asyncDispose](){},get [Symbol.dispose](){leak(this);return ()=>{};}",
    effect: "",
    resolved: true,
  },
  {
    name: "last disposal descriptor wins",
    setup: "const resources=new AsyncDisposableStack();",
    disposal: "get [Symbol.asyncDispose](){leak(this);return async()=>{};},async [Symbol.asyncDispose](){}",
    effect: "",
    resolved: true,
  },
  {
    name: "last unsafe disposal descriptor refuses",
    setup: "const resources=new AsyncDisposableStack();",
    disposal: "async [Symbol.asyncDispose](){},get [Symbol.asyncDispose](){leak(this);return async()=>{};}",
    effect: "",
    resolved: false,
  },
  {
    name: "nullish async method uses sync fallback",
    setup: "const resources=new AsyncDisposableStack();",
    disposal: "[Symbol.asyncDispose]:undefined,[Symbol.dispose](){}",
    effect: "",
    resolved: true,
  },
  {
    name: "shadowed disposal symbol",
    setup: "const Symbol={asyncDispose:'not-native'};const resources=new AsyncDisposableStack();",
    disposal: "async [Symbol.asyncDispose](){}",
    effect: "",
    resolved: false,
  },
  {
    name: "string disposal spelling is not a symbol",
    setup: "const resources=new AsyncDisposableStack();",
    disposal: "async asyncDispose(){}",
    effect: "",
    resolved: false,
  },
  {
    name: "registered callable write",
    setup: "const resources=new AsyncDisposableStack();",
    disposal: "async [Symbol.asyncDispose](){}",
    effect: "held.read=()=>2;",
    resolved: false,
  },
  {
    name: "disposal method write",
    setup: "const resources=new AsyncDisposableStack();",
    disposal: "async [Symbol.asyncDispose](){}",
    effect: "held[Symbol.asyncDispose]=async()=>{leak(held);};",
    resolved: false,
  },
  {
    name: "lexical disposal write",
    setup: "const resources=new AsyncDisposableStack();",
    disposal: "async [Symbol.asyncDispose](){held.read=()=>2;}",
    effect: "",
    resolved: false,
  },
  {
    name: "resource escape after registration",
    setup: "const resources=new AsyncDisposableStack();",
    disposal: "async [Symbol.asyncDispose](){}",
    effect: "leak(held);",
    resolved: false,
  },
] as const;

for (const scenario of RESOURCE_REGISTRATION_CASES) {
  test(`native resource registration retains ${scenario.name}`, () => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { target: ts.ScriptTarget.ESNext, lib: ["lib.esnext.d.ts"] } });
    const source = project.createSourceFile(
      "/resource-case.ts",
      `export {};declare function leak(value:object):void;${scenario.setup}function create(){return {read:()=>1,${scenario.disposal}};}const held=resources.use(create());${scenario.effect}held.read();`,
    );
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const selected = calls.find((call) => call.getExpression().getText() === "held.read");
    const expected = source.getFunctionOrThrow("create").getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
    if (selected === undefined) {
      throw new Error("the native resource consumer is missing");
    }
    beginReferencePass();
    try {
      const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
      const fact = readAuthoredCallableSources(selected.getExpression(), undefined, observed);
      expect(fact.kind, fact.kind === "unresolved" ? `${fact.reason}: ${fact.detail}` : "resolved").toBe(scenario.resolved ? "resolved" : "unresolved");
      expect(fact.kind === "resolved" && fact.value.length === 1 && fact.value[0]?.value === expected).toBe(scenario.resolved);
    } finally {
      endReferencePass();
    }
  });
}

test("native resource disposal retains the selected implicit consumer", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { target: ts.ScriptTarget.ESNext, lib: ["lib.esnext.d.ts"] } });
  const source = project.createSourceFile(
    "/resource-implicit.ts",
    `
    const read=(value:number)=>value;const resources=new AsyncDisposableStack();
    const held=resources.use({read,[Symbol.asyncDispose]:read});held.read(1);
  `,
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const selected = calls.find((call) => call.getExpression().getText() === "held.read");
  if (selected === undefined) {
    throw new Error("the implicit disposal consumer is missing");
  }
  beginReferencePass();
  try {
    const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
    expect(readAuthoredCallableSources(selected.getExpression(), undefined, observed).kind).toBe("unresolved");
  } finally {
    endReferencePass();
  }
});

test("native resource return retains same-body allocation bindings", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { target: ts.ScriptTarget.ESNext, lib: ["lib.esnext.d.ts"] } });
  const source = project.createSourceFile(
    "/resource-allocation.ts",
    `
    function make(seed:number){ return {read:() => seed,async [Symbol.asyncDispose](){}}; }
    const resources=new AsyncDisposableStack();
    const first=resources.use(make(1));const second=resources.use(make(2));first.read();second.read();
  `,
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const factory = source.getFunctionOrThrow("make");
  const expected = factory.getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
  const parameter = factory.getParameters()[0];
  if (parameter === undefined) {
    throw new Error("the allocation parameter is missing");
  }
  beginReferencePass();
  try {
    const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
    for (const name of ["first", "second"]) {
      const selected = calls.find((call) => call.getExpression().getText() === `${name}.read`);
      const registration = source.getVariableDeclarationOrThrow(name).getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression);
      const allocation = registration.getArguments()[0]?.asKindOrThrow(SyntaxKind.CallExpression);
      if (selected === undefined || allocation === undefined) {
        throw new Error("the native resource allocation is missing");
      }
      const fact = readAuthoredCallableSources(selected.getExpression(), undefined, observed);
      expect(fact.kind, fact.kind === "unresolved" ? `${fact.reason}: ${fact.detail}` : "resolved").toBe("resolved");
      expect(fact.kind === "resolved" && fact.value.length === 1 && fact.value[0]?.value === expected).toBe(true);
      expect(fact.kind === "resolved" && fact.value[0]?.bindings.get(parameter) === allocation.getArguments()[0]).toBe(true);
    }
  } finally {
    endReferencePass();
  }
});

test("native resource projection retains foreign and stale capture refusal", () => {
  const options = { useInMemoryFileSystem: true, compilerOptions: { target: ts.ScriptTarget.ESNext, lib: ["lib.esnext.d.ts"] } };
  const text =
    "const resources=new AsyncDisposableStack();function make(){return {read:()=>1,async [Symbol.asyncDispose](){}};}const held=resources.use(make());held.read();";
  const project = new Project(options);
  const source = project.createSourceFile("/resource-epoch.ts", text);
  const foreign = new Project(options).createSourceFile("/resource-epoch.ts", text);
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const selected = calls.find((call) => call.getExpression().getText() === "held.read");
  const other = foreign.getDescendantsOfKind(SyntaxKind.CallExpression).find((call) => call.getExpression().getText() === "held.read");
  if (selected === undefined || other === undefined) {
    throw new Error("the native resource epoch fixture is missing");
  }
  beginReferencePass();
  try {
    const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
    expect(readAuthoredCallableSources(selected.getExpression(), undefined, observed).kind).toBe("resolved");
    expect(readAuthoredCallableSources(other.getExpression(), undefined, observed).kind).toBe("unresolved");
    source.getFunctionOrThrow("make").setBodyText("return {read:()=>2,async [Symbol.asyncDispose](){}};");
    expect(readAuthoredCallableSources(selected.getExpression(), undefined, observed).kind).toBe("unresolved");
  } finally {
    endReferencePass();
  }
});

const DISPOSER_PARAMETER_CASES = [
  { name: "erased this parameter", parameters: "this: {read:()=>number}", method: true, resolved: true },
  { name: "closed default initializer", parameters: "this: {read:()=>number}, replacement=2", method: true, resolved: true },
  { name: "receiver default initializer", parameters: "this: {read:()=>number}, replacement=(this.read=()=>2)", method: true, resolved: false },
  { name: "nested binding default initializer", parameters: "this: {read:()=>number}, {replacement=(this.read=()=>2)}={}", method: true, resolved: false },
  {
    name: "computed binding receiver effect",
    parameters: "this: {read:()=>number}, {[(this.read=()=>2,'replacement')]: replacement}={replacement:0}",
    method: true,
    resolved: false,
  },
  { name: "function-valued default initializer", parameters: "this: {read:()=>number}, replacement=(this.read=()=>2)", method: false, resolved: false },
] as const;

for (const scenario of DISPOSER_PARAMETER_CASES) {
  test(`native disposal parameter effects retain ${scenario.name}`, () => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { target: ts.ScriptTarget.ESNext, lib: ["lib.esnext.d.ts"], strict: true } });
    const disposal = scenario.method
      ? `async [Symbol.asyncDispose](${scenario.parameters}){}`
      : `[Symbol.asyncDispose]:async function(${scenario.parameters}){}`;
    const source = project.createSourceFile(
      "/resource-parameters.ts",
      `export {};const resources=new AsyncDisposableStack();function create(){return {read:()=>1,${disposal}};}const held=resources.use(create());await resources.disposeAsync();held.read();`,
    );
    expect(source.getPreEmitDiagnostics().map((diagnostic) => diagnostic.getMessageText())).toEqual([]);
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const selected = calls.find((call) => call.getExpression().getText() === "held.read");
    const expected = source.getFunctionOrThrow("create").getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
    if (selected === undefined) {
      throw new Error("the post-disposal call is missing");
    }
    beginReferencePass();
    try {
      const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
      const fact = readAuthoredCallableSources(selected.getExpression(), undefined, observed);
      expect(fact.kind, fact.kind === "unresolved" ? `${fact.reason}: ${fact.detail}` : "resolved").toBe(scenario.resolved ? "resolved" : "unresolved");
      expect(fact.kind === "resolved" && fact.value.length === 1 && fact.value[0]?.value === expected).toBe(scenario.resolved);
    } finally {
      endReferencePass();
    }
  });
}

test("defaulted lifecycle options retain the actual finite capability key through a caught namespace consumer", async ({ repoRoot }) => {
  const { stripTypeScriptTypes } = await import("node:module");
  const parse = async (path: string): Promise<ts.SourceFile> =>
    ts.createSourceFile(path, await readFile(join(repoRoot, path), "utf8"), ts.ScriptTarget.Latest, true);
  const identity = await parse("packages/contracts/src/identity/index.ts");
  const capability = await parse("packages/server/src/entry/auth/capability.ts");
  const services = await parse("packages/server/src/entry/compose/services.ts");
  const declaration = (source: ts.SourceFile, name: string): ts.Node => {
    const values: ts.Node[] = [];
    const visit = (node: ts.Node): void => {
      if ((ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isBindingElement(node)) && node.name?.getText(source) === name) {
        values.push(node);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    if (values.length !== 1 || values[0] === undefined) {
      throw new Error(`the source-derived fixture requires one ${name}`);
    }
    return values[0];
  };
  const table = declaration(identity, "MULTI_HUMAN_CAPABLE").parent.parent.getText(identity);
  const mode = declaration(services, "authMode").parent.parent.getText(services);
  const config = declaration(services, "authConfig").getText(services);
  const capabilityBinding = declaration(services, "multiHumanCapable").parent.parent.getText(services);
  const egressCalls: ts.CallExpression[] = [];
  const findEgress = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.expression.getText(services) === "createScopedEgress") {
      egressCalls.push(node);
    }
    ts.forEachChild(node, findEgress);
  };
  findEgress(services);
  const egressInput = egressCalls.length === 1 ? egressCalls[0]?.arguments[0] : undefined;
  const fetchRead =
    egressInput !== undefined && ts.isObjectLiteralExpression(egressInput)
      ? egressInput.properties.find((property) => ts.isPropertyAssignment(property) && property.name.getText(services) === "fetch")
      : undefined;
  if (fetchRead === undefined || !ts.isPropertyAssignment(fetchRead)) {
    throw new Error("the actual scoped egress fetch sibling read is missing");
  }
  const siblingExpression = fetchRead.initializer.getText(services);

  const policyCode = stripTypeScriptTypes(
    `${table}
${declaration(identity, "isMultiHumanCapable").getText(identity)}
${declaration(capability, "createMultiHumanCapability").getText(capability)}`,
    { mode: "strip" },
  );
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
  const policy = project.createSourceFile("/repo/policy.ts", policyCode);
  const graph = project.createSourceFile(
    "/repo/graph.ts",
    `import {createMultiHumanCapability} from "./policy.js";
    const env={AUTH_MODE:"local"};
    function createBackgroundWork(){const controller=new AbortController();return {signal:controller.signal};}
    function createStats(){return {settleRetainedChatRebase:()=>1};}
    function use(ctx){return ctx.settleRetainedChatRebase();}
    function createChatContext(input){return {...input,settleRetainedChatRebase:()=>input.settleRetainedChatRebase()};}
    function createTurnEngine(input){return input;}
    function createChatService(input){const ctx=createChatContext(input);const engine=createTurnEngine({...(ctx.backgroundSignal===undefined?{}:{backgroundSignal:ctx.backgroundSignal})});use(ctx);return engine;}
    function buildChatService(input){const stats=createStats();const ctx={...{left:0},...{right:0},settleRetainedChatRebase:stats.settleRetainedChatRebase,...(input.backgroundSignal===undefined?{}:{backgroundSignal:input.backgroundSignal})};return createChatService(ctx);}
    export function createServices(deps){const scopedFetch=${siblingExpression};const {${config}}=deps;${mode}
      const settings={getEffectiveConfig:()=>({localMultiUser:true})};${capabilityBinding}
      const background=createBackgroundWork();const engine=buildChatService({backgroundSignal:background.signal});return {engine,multiHumanCapable};}
  `,
  );
  const lifecycle = project.createSourceFile(
    "/repo/lifecycle.ts",
    `import {createServices} from "./graph.js";
    export function createLifecycle(options:{readonly providerSeams?:{readonly sdkFetch?:typeof fetch}}={}){return {start(){const authConfig={mode:"local"};return createServices({authConfig,...(options.providerSeams===undefined?{}:{providerSeams:options.providerSeams})});}};}`,
  );
  const entry = project.createSourceFile(
    "/repo/entry.ts",
    `export async function run(){const {createLifecycle}=await import("./lifecycle.js").catch((error)=>{throw error;});const lifecycle=createLifecycle();const graph=lifecycle.start();graph.multiHumanCapable();return graph.engine;}void run();`,
  );
  const sources = [policy, graph, lifecycle, entry];
  const calls = sources.flatMap((source) => source.getDescendantsOfKind(SyntaxKind.CallExpression));
  const selected = calls.find((call) => call.getExpression().getText() === "ctx.settleRetainedChatRebase");
  const lifecycleCall = calls.find((call) => call.getExpression().getText() === "createLifecycle");
  const expected = graph.getFunctionOrThrow("createChatContext").getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
  if (selected === undefined || lifecycleCall === undefined) {
    throw new Error("the selected accounting and actual caught lifecycle calls are missing");
  }
  beginReferencePass();
  try {
    const observed = observeCallReturns(
      calls,
      sources.flatMap((source) => source.getDescendants()),
      { suppliedCallableTargets: true },
    );
    const program = observed.programs[0];
    if (program === undefined) {
      throw new Error("the actual native founding capture is missing");
    }
    const first = readAuthoredCallableSources(selected.getExpression(), (call) => program.byCall.has(call.compilerNode), observed);
    expect(program.program).toBe(project.getProgram().compilerObject);
    expect(sources.every((source) => program.program.getSourceFile(source.getFilePath()) === source.compilerNode)).toBe(true);
    expect(project.getPreEmitDiagnostics().map((diagnostic) => diagnostic.getMessageText())).toEqual([]);
    expect(program.byCall.has(lifecycleCall.compilerNode)).toBe(true);
    expect(first.kind, first.kind === "unresolved" ? `${first.detail} at ${first.node.getText()}` : "resolved").toBe("resolved");
    expect(first.kind === "resolved" ? first.value.map((leaf) => leaf.value) : []).toEqual([expected]);
  } finally {
    endReferencePass();
  }
});
