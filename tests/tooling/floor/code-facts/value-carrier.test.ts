import { runInNewContext } from "node:vm";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { observeCallReturns, readSuppliedParameter } from "@orb/tooling/floor/code-facts/call-returns";
import { beginReferencePass, endReferencePass } from "@orb/tooling/floor/code-facts/reference-fact";
import { readAuthoredValueSources, readReturnedValue } from "@orb/tooling/floor/code-facts/value-carrier";
import { Project, SyntaxKind } from "ts-morph";
import { vi } from "vitest";

test("supplied value provenance preserves distinct captured callers and refuses to invent a bound origin", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    "/supplied-origin.ts",
    'function collect(value="default"){return value;}const shared="same";collect(shared);collect(shared);collect();',
  );
  const parameter = source.getFunctionOrThrow("collect").getParameters()[0];
  if (parameter === undefined) {
    throw new Error("the actual supplied formal is missing");
  }
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  beginReferencePass();
  try {
    const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
    const program = observed.programs[0];
    if (program === undefined) {
      throw new Error("the captured native Program is missing");
    }
    const supplied = readSuppliedParameter(parameter.getNameNode(), new Map(), program);
    expect(supplied.kind).toBe("resolved");
    if (supplied.kind !== "resolved") {
      return;
    }
    expect(supplied.value.length).toBe(3);
    for (const [index, value] of supplied.value.entries()) {
      const call = calls[index];
      if (call === undefined) {
        throw new Error("the supplied alternative has no actual caller");
      }
      expect(value.supply?.observation).toBe(program.byCall.get(call.compilerNode));
      expect(value.supply?.parameter).toBe(parameter);
      expect(value.supply?.argument).toBe(call.getArguments()[0]);
      expect(value.supply?.value).toBe(value.value);
      expect(value.value).toBe(call.getArguments()[0] ?? parameter.getInitializer());
      expect(value.bindings.get(parameter)).toBe(value.value);
    }
    const first = supplied.value[0];
    if (first === undefined) {
      throw new Error("the first actual supplied alternative is missing");
    }
    const bound = readSuppliedParameter(parameter.getNameNode(), first.bindings, program);
    expect(bound.kind === "resolved" ? bound.value.map((value) => value.supply) : "refused").toEqual([undefined]);
  } finally {
    endReferencePass();
  }
});

for (const argument of ["", "undefined"]) {
  test(`supplied default contexts retain a finite default invocation through the same formal: ${argument}`, () => {
    const code = `function wrap(value=wrap("local")){return value;}const answer=wrap(${argument});`;
    expect(runInNewContext(`${code};answer;`)).toBe("local");
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile("/supplied-default-context.ts", code);
    const selected = source.getFunctionOrThrow("wrap").getFirstDescendantByKindOrThrow(SyntaxKind.ReturnStatement).getExpressionOrThrow();
    beginReferencePass();
    try {
      const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants());
      const fact = readReturnedValue(selected, [], observed, new Set());
      expect(fact.kind === "resolved" ? fact.value.map((value) => value.value.getText()) : `${fact.reason}: ${fact.detail}`).toEqual(['"local"', '"local"']);
    } finally {
      endReferencePass();
    }
  });
}

for (const scenario of [
  { name: "the same default context remains recursive", code: "function wrap(value=wrap()){return value;}const answer=wrap();" },
  {
    name: "a mutable supplied default cannot keep its earlier value",
    code: 'let selected="local";selected="outside";function wrap(value=wrap(selected)){return value;}const answer=wrap();',
  },
  {
    name: "unknown callers do not acquire a supplied context",
    code: 'declare function escape(value:object):void;function wrap(value=wrap("local")){return value;}escape(wrap);const answer=wrap();',
  },
] as const) {
  test(`supplied default context safety: ${scenario.name}`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile("/supplied-default-safety.ts", scenario.code);
    const selected = source.getFunctionOrThrow("wrap").getFirstDescendantByKindOrThrow(SyntaxKind.ReturnStatement).getExpressionOrThrow();
    beginReferencePass();
    try {
      const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants());
      const fact = readReturnedValue(selected, [], observed, new Set());
      expect(fact.kind).toBe("unresolved");
    } finally {
      endReferencePass();
    }
  });
}

for (const mode of ["sparse", "unproven-binding", "changed-source"] as const) {
  test(`supplied default context retains ${mode} refusal`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile("/supplied-admission.ts", 'function wrap(value=wrap("local")){return value;}const answer=wrap();');
    const owner = source.getFunctionOrThrow("wrap");
    const parameter = owner.getParameters()[0];
    const initializer = parameter?.getInitializer();
    if (parameter === undefined || initializer === undefined) {
      throw new Error("the actual defaulted formal is missing");
    }
    const selected = owner.getFirstDescendantByKindOrThrow(SyntaxKind.ReturnStatement).getExpressionOrThrow();
    beginReferencePass();
    try {
      const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), mode === "sparse" ? undefined : source.getDescendants());
      const fact = readReturnedValue(selected, [], observed, {
        bindings: mode === "unproven-binding" ? new Map([[parameter, initializer]]) : new Map(),
        terminals: (call) => {
          if (mode === "changed-source" && call === initializer) {
            source.insertStatements(0, "const changedSourceEpoch=1;");
          }
          return false;
        },
      });
      expect(fact.kind).toBe("unresolved");
    } finally {
      endReferencePass();
    }
  });
}

for (const scenario of [
  { name: "same return node with different actual arguments", body: "return value;", path: [], runtime: "output" },
  { name: "same object allocation node with decreasing property path", body: "return {value};", path: ["value", "value"], runtime: "output.value.value" },
] as const) {
  test(`finite active value contexts: ${scenario.name}`, () => {
    const code = `function wrap(value){${scenario.body}}const output=wrap(wrap("local"));`;
    expect(runInNewContext(`${code};${scenario.runtime};`)).toBe("local");
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile("/finite-context.ts", code);
    beginReferencePass();
    try {
      const observations = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants());
      const fact = readReturnedValue(source.getVariableDeclarationOrThrow("output").getNameNode(), scenario.path, observations, new Set());
      expect(fact.kind === "resolved" ? fact.value.map((value) => value.value.getText()) : `${fact.reason}: ${fact.detail}`).toEqual(['"local"']);
    } finally {
      endReferencePass();
    }
  });
}

for (const code of [
  'function repeat(value){return repeat(value);}const output=repeat("local");',
  "function identity(value){return value;}const circular=circular.value;const output=identity(circular);",
]) {
  test(`active value contexts preserve true recursion: ${code}`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile("/recursive-context.ts", code);
    beginReferencePass();
    try {
      const observations = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants());
      const fact = readReturnedValue(source.getVariableDeclarationOrThrow("output").getNameNode(), [], observations, new Set());
      expect(fact.kind === "unresolved" ? fact.reason : "unproven recursion resolved").toBe("cycle");
    } finally {
      endReferencePass();
    }
  });
}

for (const invalidation of ["none", "source"] as const) {
  test(`active value context invokes opaque terminals and retains ${invalidation} admission`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile("/active-admission.ts", 'function wrap(value){return value;}const output=wrap(wrap("local"));');
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const inner = calls.find((call) => call.getText() === 'wrap("local")');
    if (inner === undefined) {
      throw new Error("the actual inner invocation is absent");
    }
    beginReferencePass();
    try {
      const observations = observeCallReturns(calls, source.getDescendants());
      const seen: string[] = [];
      const fact = readReturnedValue(source.getVariableDeclarationOrThrow("output").getNameNode(), [], observations, {
        bindings: new Map(),
        terminals: (call) => {
          seen.push(call.getText());
          if (call === inner && invalidation === "source") {
            source.insertStatements(0, "const changedEpoch=1;");
          }
          return false;
        },
      });
      expect(seen).toEqual(['wrap(wrap("local"))', 'wrap("local")']);
      expect(fact.kind === "resolved" ? fact.value.map((value) => value.value.getText()) : "refused").toEqual(
        invalidation === "none" ? ['"local"'] : "refused",
      );
    } finally {
      endReferencePass();
    }
  });
}

test("active value context preserves native forgotten-formal failure instead of returning a stale leaf", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile("/forgotten-active-context.ts", 'function wrap(value){return value;}const output=wrap(wrap("local"));');
  const parameter = source.getFunctionOrThrow("wrap").getParameters()[0];
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const inner = calls.find((call) => call.getText() === 'wrap("local")');
  if (parameter === undefined || inner === undefined) {
    throw new Error("the actual formal or inner invocation is absent");
  }
  beginReferencePass();
  try {
    const observations = observeCallReturns(calls, source.getDescendants());
    expect(() =>
      readReturnedValue(source.getVariableDeclarationOrThrow("output").getNameNode(), [], observations, {
        bindings: new Map(),
        terminals: (call) => {
          if (call === inner) {
            parameter.forget();
          }
          return false;
        },
      }),
    ).toThrow(/removed or forgotten/u);
  } finally {
    endReferencePass();
  }
});

test("defaulted object bindings preserve supplied own values without evaluating the fallback", () => {
  const code = `
    function unavailable(){throw new Error("the unused default was evaluated");}
    function createServices(deps){const {authConfig={mode:unavailable()}}=deps;return authConfig.mode;}
    const first=createServices({authConfig:{mode:"local"}});
    const second=createServices({authConfig:{mode:"oidc"}});
  `;
  expect(runInNewContext(`${code};[first,second];`)).toEqual(["local", "oidc"]);
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile("/defaulted-binding.ts", code);
  beginReferencePass();
  try {
    const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants());
    const values = ["first", "second"].map((name) => {
      const fact = readReturnedValue(source.getVariableDeclarationOrThrow(name).getNameNode(), [], observed, { terminals: new Set(), bindings: new Map() });
      return fact.kind === "resolved" ? fact.value.map((value) => value.value.getText()) : fact.detail;
    });
    expect(values).toEqual([['"local"'], ['"oidc"']]);
  } finally {
    endReferencePass();
  }
});

for (const receiver of [false, true]) {
  test(`defaulted object binding refuses an escaped ${receiver ? "receiver" : "selected value"}`, () => {
    const code = receiver
      ? 'function overwrite(value){value.authConfig.mode="outside";}const input={authConfig:{mode:"local"}};overwrite(input);const {authConfig={mode:"fallback"}}=input;const output=authConfig.mode;'
      : 'function overwrite(value){value.mode="outside";}const input={authConfig:{mode:"local"}};const {authConfig={mode:"fallback"}}=input;overwrite(authConfig);const output=authConfig.mode;';
    expect(runInNewContext(`${code};output;`)).toBe("outside");
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile("/escaped-default.ts", code);
    beginReferencePass();
    try {
      const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants());
      const fact = readReturnedValue(source.getVariableDeclarationOrThrow("output").getNameNode(), [], observed, new Set());
      expect(fact.kind, fact.kind === "unresolved" ? fact.detail : "unsafe original field survived").toBe("unresolved");
    } finally {
      endReferencePass();
    }
  });
}

test("defaulted object binding refuses mutation through its supplied formal receiver", () => {
  const code =
    'function overwrite(value){value.authConfig.mode="outside";}function select(deps){overwrite(deps);const {authConfig={mode:"fallback"}}=deps;return authConfig.mode;}const output=select({authConfig:{mode:"local"}});';
  expect(runInNewContext(`${code};output;`)).toBe("outside");
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile("/formal-default.ts", code);
  beginReferencePass();
  try {
    const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants());
    const fact = readReturnedValue(source.getVariableDeclarationOrThrow("output").getNameNode(), [], observed, new Set());
    expect(fact.kind, fact.kind === "unresolved" ? fact.detail : "unsafe supplied formal survived").toBe("unresolved");
  } finally {
    endReferencePass();
  }
});

test("defaulted object binding closes a destructured receiver origin before accepting its field", () => {
  const code = 'function overwrite(x){x.mode="outside"}const {input}={input:{mode:"local"}};overwrite(input);const {mode="fallback"}=input;const output=mode;';
  expect(runInNewContext(`${code};output;`)).toBe("outside");
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile("/destructured-origin.ts", code);
  beginReferencePass();
  try {
    const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants());
    const fact = readReturnedValue(source.getVariableDeclarationOrThrow("output").getNameNode(), [], observed, new Set());
    expect(fact.kind, fact.kind === "unresolved" ? fact.detail : "mutated destructured origin returned a stale field").toBe("unresolved");
  } finally {
    endReferencePass();
  }
});

test("defaulted object binding retains safe destructured provenance through actual allocations", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    "/safe-destructured-origin.ts",
    'function select(deps){const {input}=deps;const {mode="fallback"}=input;return mode;}const first=select({input:{mode:"local"}});const second=select({input:{mode:"oidc"}});',
  );
  const binding = source.getFirstDescendantByKindOrThrow(SyntaxKind.BindingElement);
  beginReferencePass();
  try {
    const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants());
    for (const [name, expected] of [
      ["first", '"local"'],
      ["second", '"oidc"'],
    ] as const) {
      const fact = readReturnedValue(source.getVariableDeclarationOrThrow(name).getNameNode(), [], observed, new Set());
      expect(fact.kind === "resolved" ? fact.value.map((value) => value.value.getText()) : fact.detail).toEqual([expected]);
      expect(fact.trace.declarations.some((declaration) => declaration.compilerNode === binding.compilerNode)).toBe(true);
    }
  } finally {
    endReferencePass();
  }
});

for (const scenario of [
  { name: "own undefined selects its default", input: "{mode:undefined}", expected: ['"fallback"'] },
  { name: "absent ordinary data selects its default", input: "{}", expected: ['"fallback"'] },
  { name: "null is not undefined", input: "{mode:null}", expected: ["null"] },
  { name: "false is not undefined", input: "{mode:false}", expected: ["false"] },
  { name: "zero is not undefined", input: "{mode:0}", expected: ["0"] },
  { name: "conditional undefined retains both actual alternatives", input: 'condition?{mode:"local"}:{mode:undefined}', expected: ['"local"', '"fallback"'] },
  { name: "an accessor is not an own data field", input: '{get mode(){return "outside";}}', expected: undefined },
  { name: "a custom prototype is not ordinary absence", input: '{__proto__:{mode:"outside"}}', expected: undefined },
  { name: "an unknown value is not assumed defined", input: "{mode:opaque}", expected: undefined },
  { name: "effectful void is not ignored", input: "{mode:void mutate()}", expected: undefined },
] as const) {
  test(`defaulted object binding: ${scenario.name}`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile(
      "/default-alternatives.ts",
      `declare const condition:boolean;declare const opaque:string|undefined;declare function mutate():void;function select(deps){const {mode="fallback"}=deps;return mode;}const output=select(${scenario.input});`,
    );
    beginReferencePass();
    try {
      const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants());
      const fact = readReturnedValue(source.getVariableDeclarationOrThrow("output").getNameNode(), [], observed, new Set());
      expect(fact.kind, fact.kind === "unresolved" ? fact.detail : scenario.name).toBe(scenario.expected === undefined ? "unresolved" : "resolved");
      expect(fact.kind === "resolved" ? fact.value.map((value) => value.value.getText()) : undefined).toEqual(scenario.expected);
    } finally {
      endReferencePass();
    }
  });
}

test("defaulted object binding retains native prototype effects only for an absent property", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    "/default-prototype.ts",
    'Object.defineProperty(Object.prototype,"mode",{get(){return "outside";}});const {mode:own="fallback"}={mode:undefined};const {mode:missing="fallback"}={};const first=own;const second=missing;',
  );
  beginReferencePass();
  try {
    const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants());
    const own = readReturnedValue(source.getVariableDeclarationOrThrow("first").getNameNode(), [], observed, new Set());
    const missing = readReturnedValue(source.getVariableDeclarationOrThrow("second").getNameNode(), [], observed, new Set());
    expect(own.kind === "resolved" ? own.value.map((value) => value.value.getText()) : own.detail).toEqual(['"fallback"']);
    expect(missing.kind).toBe("unresolved");
  } finally {
    endReferencePass();
  }
});

test("defaulted object binding keeps typed supplied allocations and default cycles separate", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    "/typed-default.ts",
    `interface AuthConfig{mode:string}interface Deps{authConfig?:AuthConfig}function createServices(deps:Deps){const {authConfig={mode:createServices(deps)}}=deps;return authConfig.mode;}const first=createServices({authConfig:{mode:"local"}});const second=createServices({});`,
  );
  beginReferencePass();
  try {
    const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants());
    const first = readReturnedValue(source.getVariableDeclarationOrThrow("first").getNameNode(), [], observed, new Set());
    const second = readReturnedValue(source.getVariableDeclarationOrThrow("second").getNameNode(), [], observed, new Set());
    expect(first.kind === "resolved" ? first.value.map((value) => value.value.getText()) : first.detail).toEqual(['"local"']);
    expect(second.kind).toBe("unresolved");
  } finally {
    endReferencePass();
  }
});

for (const scenario of [
  {
    name: "own undefined sibling argument",
    setup: "",
    input: '{authConfig:{mode:"local"},timers:undefined}',
    body: "return execution;",
    runtime: "local",
    resolved: true,
  },
  {
    name: "own primitive sibling argument",
    setup: "",
    input: '{authConfig:{mode:"local"},timers:0}',
    body: "return execution;",
    runtime: "local",
    resolved: true,
  },
  { name: "ordinary absent sibling argument", setup: "", input: '{authConfig:{mode:"local"}}', body: "return execution;", runtime: "local", resolved: true },
  {
    name: "own sibling getter mutates selected object",
    setup: "",
    input: '{authConfig:{mode:"local"},get timers(){this.authConfig.mode="outside";return undefined;}}',
    body: "return execution;",
    runtime: "outside",
    resolved: false,
  },
  {
    name: "sibling shares selected object allocation",
    setup: 'const shared={mode:"local"};',
    input: "{authConfig:shared,timers:shared}",
    body: 'execution.mode="outside";return execution;',
    runtime: "outside",
    resolved: false,
  },
  {
    name: "absent sibling inherited getter mutates selected object",
    setup: 'Object.defineProperty(Object.prototype,"timers",{get(){this.authConfig.mode="outside";return undefined;}});',
    input: '{authConfig:{mode:"local"}}',
    body: "return execution;",
    runtime: "outside",
    resolved: false,
  },
  {
    name: "conditional spreads preserve the absent sibling",
    setup: "const flag=true;",
    input: '{authConfig:{mode:"local"},...(flag?{stProfileDir:"path"}:{}),...(flag?{providerSeams:0}:{})}',
    body: "return execution;",
    runtime: "local",
    resolved: true,
  },
  {
    name: "conditional spread retains present and absent sibling alternatives",
    setup: "const flag=true;",
    input: '{authConfig:{mode:"local"},...(flag?{timers:undefined}:{})}',
    body: "return execution;",
    runtime: "local",
    resolved: true,
  },
  {
    name: "conditional spread getter may mutate selected allocation",
    setup: 'const flag=true;const shared={mode:"local"};',
    input: '{authConfig:shared,...(flag?{get timers(){shared.mode="outside";return undefined;}}:{})}',
    body: "return execution;",
    runtime: "outside",
    resolved: false,
  },
  {
    name: "conditional spread may carry selected allocation",
    setup: 'const flag=true;const shared={mode:"local"};',
    input: "{authConfig:shared,...(flag?{timers:shared}:{})}",
    body: 'execution.mode="outside";return execution;',
    runtime: "outside",
    resolved: false,
  },
] as const) {
  test(`defaulted binding sibling read: ${scenario.name}`, () => {
    const code = `${scenario.setup}function createScopedTimers(execution){${scenario.body}}function createServices(deps){createScopedTimers(deps.timers);const {authConfig={mode:"fallback"}}=deps;return authConfig.mode;}const output=createServices(${scenario.input});`;
    expect(runInNewContext(`${code};output;`)).toBe(scenario.runtime);
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile("/sibling-default.ts", code);
    beginReferencePass();
    try {
      const observations = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants());
      const result = readReturnedValue(source.getVariableDeclarationOrThrow("output").getNameNode(), [], observations, new Set());
      expect(result.kind, result.kind === "unresolved" ? result.detail : scenario.name).toBe(scenario.resolved ? "resolved" : "unresolved");
      expect(result.kind === "resolved" ? result.value.map((value) => value.value.getText()) : undefined).toEqual(scenario.resolved ? ['"local"'] : undefined);
    } finally {
      endReferencePass();
    }
  });
}

for (const scenario of [
  { name: "absent receiver short-circuits the nested member", setup: "", input: '{authConfig:{mode:"local"}}', before: "", runtime: "local", resolved: true },
  {
    name: "own undefined receiver short-circuits the nested member",
    setup: "",
    input: '{authConfig:{mode:"local"},networkExecution:undefined}',
    before: "",
    runtime: "local",
    resolved: true,
  },
  {
    name: "own null receiver short-circuits the nested member",
    setup: "",
    input: '{authConfig:{mode:"local"},networkExecution:null}',
    before: "",
    runtime: "local",
    resolved: true,
  },
  {
    name: "conditional own absence keeps every nullish alternative",
    setup: "const flag=true;",
    input: '{authConfig:{mode:"local"},...(flag?{networkExecution:undefined}:{})}',
    before: "",
    runtime: "local",
    resolved: true,
  },
  {
    name: "an absent receiver short-circuits the optional element member",
    setup: "",
    input: '{authConfig:{mode:"local"}}',
    before: "",
    read: 'createEgress({fetch:deps.networkExecution?.["fetch"]});',
    runtime: "local",
    resolved: true,
  },
  {
    name: "a present conditional branch cannot borrow absent receiver permission",
    setup: "const flag=true;",
    input: '{authConfig:{mode:"local"},...(flag?{}:{networkExecution:{fetch:0}})}',
    before: "",
    runtime: "local",
    resolved: false,
  },
  {
    name: "own receiver getter cannot gain short-circuit permission",
    setup: "",
    input: '{authConfig:{mode:"local"},get networkExecution(){this.authConfig.mode="outside";return undefined;}}',
    before: "",
    runtime: "outside",
    resolved: false,
  },
  {
    name: "absent receiver retains the inherited getter obligation",
    setup: 'Object.defineProperty(Object.prototype,"networkExecution",{get(){this.authConfig.mode="outside";return undefined;}});',
    input: '{authConfig:{mode:"local"}}',
    before: "",
    runtime: "outside",
    resolved: false,
  },
  {
    name: "present receiver cannot hide the terminal getter",
    setup: 'const selected={mode:"local"};',
    input: '{authConfig:selected,networkExecution:{get fetch(){selected.mode="outside";return undefined;}}}',
    before: "",
    runtime: "outside",
    resolved: false,
  },
  {
    name: "receiver mutation remains a refused use",
    setup: "",
    input: '{authConfig:{mode:"local"}}',
    before: 'deps.authConfig.mode="outside";',
    runtime: "outside",
    resolved: false,
  },
  {
    name: "receiver escape remains a refused use",
    setup: 'function escape(value){value.authConfig.mode="outside";}',
    input: '{authConfig:{mode:"local"}}',
    before: "escape(deps);",
    runtime: "outside",
    resolved: false,
  },
  {
    name: "an optional continuation does not grant invocation permission",
    setup: "",
    input: '{authConfig:{mode:"local"}}',
    before: "",
    read: "deps.networkExecution?.fetch();",
    runtime: "local",
    resolved: false,
  },
  {
    name: "an optional continuation does not grant a later member path",
    setup: "",
    input: '{authConfig:{mode:"local"}}',
    before: "",
    read: "void deps.networkExecution?.fetch.owner;",
    runtime: "local",
    resolved: false,
  },
  {
    name: "an optional continuation does not grant receiver writes",
    setup: "",
    input: '{authConfig:{mode:"local"}}',
    before: "deps.networkExecution=undefined;",
    runtime: "local",
    resolved: false,
  },
  {
    name: "ordinary access does not borrow optional short-circuit permission",
    setup: "",
    input: '{authConfig:{mode:"local"}}',
    before: "",
    read: "void deps.networkExecution.fetch;",
    runtime: "TypeError",
    resolved: false,
  },
  {
    name: "a present record does not borrow the nullish alternative",
    setup: "",
    input: '{authConfig:{mode:"local"},networkExecution:{fetch:0}}',
    before: "",
    runtime: "local",
    resolved: false,
  },
] as const) {
  test(`defaulted binding optional sibling continuation: ${scenario.name}`, () => {
    const read = "read" in scenario ? scenario.read : "createEgress({fetch:deps.networkExecution?.fetch});";
    const code = `${scenario.setup}function createEgress(value){return value;}function createServices(deps){${scenario.before}${read}const {authConfig={mode:"fallback"}}=deps;return authConfig.mode;}const output=createServices(${scenario.input});`;
    expect(runInNewContext(`try{${code};output;}catch(error){error.name;}`)).toBe(scenario.runtime);
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile("/optional-sibling-default.ts", code);
    beginReferencePass();
    try {
      const observations = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants());
      const result = readReturnedValue(source.getVariableDeclarationOrThrow("output").getNameNode(), [], observations, new Set());
      expect(result.kind, result.kind === "unresolved" ? `${result.detail} at ${result.node.getText()}` : scenario.name).toBe(
        scenario.resolved ? "resolved" : "unresolved",
      );
      expect(result.kind === "resolved" ? result.value.map((value) => value.value.getText()) : undefined).toEqual(scenario.resolved ? ['"local"'] : undefined);
    } finally {
      endReferencePass();
    }
  });
}

test("defaulted binding sibling closure keeps same-body safe and unsafe allocations independent", () => {
  const code =
    'function createScopedTimers(execution){return execution;}function createServices(deps){createScopedTimers(deps.timers);const {authConfig={mode:"fallback"}}=deps;return authConfig.mode;}const first=createServices({authConfig:{mode:"local"},timers:undefined});const second=createServices({authConfig:{mode:"local"},get timers(){this.authConfig.mode="outside";return undefined;}});';
  expect(runInNewContext(`${code};[first,second];`)).toEqual(["local", "outside"]);
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile("/sibling-allocations.ts", code);
  beginReferencePass();
  try {
    const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants());
    const first = readReturnedValue(source.getVariableDeclarationOrThrow("first").getNameNode(), [], observed, new Set());
    const second = readReturnedValue(source.getVariableDeclarationOrThrow("second").getNameNode(), [], observed, new Set());
    expect(first.kind === "resolved" ? first.value.map((value) => value.value.getText()) : first.detail).toEqual(['"local"']);
    expect(second.kind).toBe("unresolved");
  } finally {
    endReferencePass();
  }
});

for (const invocation of ["Object.freeze(actual)", "globalThis.Object['freeze'](actual)", "freeze(actual)"]) {
  test(`native freeze preserves its actual argument identity: ${invocation}`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile("/freeze-value.ts", `export {};const freeze=Object.freeze;const actual={mode:"local"};const result=${invocation};`);
    const call = source.getVariableDeclarationOrThrow("result").getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression);
    const actual = source.getVariableDeclarationOrThrow("actual").getInitializerOrThrow();
    beginReferencePass();
    try {
      const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants());
      const fact = readReturnedValue(call, [], observed, { terminals: new Set(), bindings: new Map() });
      expect(fact.kind, fact.kind === "unresolved" ? fact.detail : "resolved").toBe("resolved");
      expect(fact.kind === "resolved" && fact.value.length === 1 && fact.value[0]?.value === actual).toBe(true);
      const field = readReturnedValue(call, ["mode"], observed, { terminals: new Set(), bindings: new Map() });
      expect(field.kind === "resolved" && field.value.map((value) => value.value.getText())).toEqual(['"local"']);
    } finally {
      endReferencePass();
    }
  });
}

for (const control of [
  {
    name: "shadowed native spelling uses the actual authored return",
    source: 'export {};const Object={freeze:(input:object)=>({mode:"outside"})};const actual={mode:"local"};const result=Object.freeze(actual);',
    expected: '"outside"',
  },
  {
    name: "overwritten native methods do not retain intrinsic identity",
    source: 'export {};Object.freeze=(input)=>({mode:"outside"}) as typeof input;const actual={mode:"local"};const result=Object.freeze(actual);',
    expected: undefined,
  },
  {
    name: "an opaque native freeze alias does not acquire an effect exemption",
    source:
      'export {};declare function escape(value:object):void;const freeze=Object.freeze;escape(freeze);const actual={mode:"local"};const result=freeze(actual);',
    expected: undefined,
  },
  {
    name: "freezing an accessor does not make it an own data value",
    source: 'export {};const actual={get mode(){return "local";}};const result=Object.freeze(actual);',
    expected: undefined,
  },
] as const) {
  test(`native freeze boundary: ${control.name}`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile("/freeze-boundary.ts", control.source);
    beginReferencePass();
    try {
      const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants());
      const result = readReturnedValue(source.getVariableDeclarationOrThrow("result").getNameNode(), ["mode"], observed, {
        terminals: new Set(),
        bindings: new Map(),
      });
      expect(result.kind).toBe(control.expected === undefined ? "unresolved" : "resolved");
      expect(result.kind === "resolved" ? result.value.map((value) => value.value.getText()) : undefined).toEqual(
        control.expected === undefined ? undefined : [control.expected],
      );
    } finally {
      endReferencePass();
    }
  });
}

test("uncaptured freeze stays unowned without hydrating a native Program", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile("/freeze-unowned.ts", "const result=Object.freeze({mode:'local'});");
  const call = source.getVariableDeclarationOrThrow("result").getInitializerOrThrow();
  const program = vi.spyOn(project, "getProgram");
  const checker = vi.spyOn(project, "getTypeChecker");
  try {
    const result = readAuthoredValueSources(call, ["mode"]);
    expect(result.kind).toBe("unresolved");
    expect(program).not.toHaveBeenCalled();
    expect(checker).not.toHaveBeenCalled();
  } finally {
    program.mockRestore();
    checker.mockRestore();
  }
});

test("a loaded imported source can replace the native freeze operation", () => {
  const nativeFreeze = Object.freeze;
  let runtimeValue: { mode: string };
  try {
    Reflect.set(Object, "freeze", () => ({ mode: "outside" }));
    runtimeValue = Object.freeze({ mode: "local" });
  } finally {
    Reflect.set(Object, "freeze", nativeFreeze);
  }
  expect(runtimeValue.mode).toBe("outside");
  const project = new Project({ useInMemoryFileSystem: true });
  const override = project.createSourceFile("/freeze-overwrite.ts", 'Object.freeze=((value)=>({mode:"outside"})) as typeof Object.freeze;export {};');
  const source = project.createSourceFile("/freeze-imported.ts", 'import "./freeze-overwrite";const actual={mode:"local"};const result=Object.freeze(actual);');
  beginReferencePass();
  try {
    const sources = [override, source];
    const observed = observeCallReturns(
      sources.flatMap((file) => file.getDescendantsOfKind(SyntaxKind.CallExpression)),
      sources.flatMap((file) => file.getDescendants()),
    );
    const fact = readReturnedValue(source.getVariableDeclarationOrThrow("result").getNameNode(), ["mode"], observed, {
      terminals: new Set(),
      bindings: new Map(),
    });
    expect(fact.kind, fact.kind === "unresolved" ? fact.detail : "replaced native operation accepted").toBe("unresolved");
  } finally {
    endReferencePass();
  }
});
