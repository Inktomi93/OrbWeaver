// Every ignorer rule is pinned twice: the sink shape it must ignore and the near-miss it must not. An over-eager
// ignorer deletes real survivors unseen. The fixtures are babel node shapes, because Stryker instruments with babel.

import { expect, test } from "@orb/testkit/tooling";
import type { AridNode, AridPath } from "@orb/tooling/mutation-arid";
import { shouldIgnoreArid } from "@orb/tooling/mutation-arid";
import { describe } from "vitest";

function id(name: string): AridNode {
  return { type: "Identifier", name };
}

function str(value: string): AridNode {
  return { type: "StringLiteral", value };
}

function member(object: AridNode, property: AridNode): AridNode {
  return { type: "MemberExpression", object, property, computed: false };
}

/** Builds the CallExpression around `args` and returns the path OF `node` (what Stryker enters). */
function argPath(callee: AridNode, args: AridNode[], node: AridNode): AridPath {
  const call: AridNode = { type: "CallExpression", callee, arguments: args };
  return { node, parentPath: { node: call } };
}

/** The one-argument shorthand — the argument IS the node under test. */
function arg1(callee: AridNode, node: AridNode): AridPath {
  return argPath(callee, [node], node);
}

describe("arid ignorer — the sink shapes it MUST ignore", () => {
  test("a trace-recorder call argument (recordOverrideSource(trace, 'room override'))", () => {
    const value = str("room override");
    expect(shouldIgnoreArid(argPath(id("recordOverrideSource"), [id("trace"), value], value))).toContain("trace-recorder");
  });

  test("an append onto a trace collection (trace.staticSections.unshift('chat-injection:before_prompt'))", () => {
    const value = str("chat-injection:before_prompt");
    const callee = member(member(id("trace"), id("staticSections")), id("unshift"));
    expect(shouldIgnoreArid(arg1(callee, value))).toContain("trace collection");
  });

  test("an append through a nested trace chain (env.trace.dynamicSections.push('…'))", () => {
    const value = str("chat-injection:in_prompt");
    const callee = member(member(member(id("env"), id("trace")), id("dynamicSections")), id("push"));
    expect(shouldIgnoreArid(arg1(callee, value))).toContain("trace collection");
  });

  test("an assignment into the trace (trace.overrideSources = '…')", () => {
    const value = str("room override");
    const assignment: AridNode = { type: "AssignmentExpression", left: member(id("trace"), id("overrideSources")), right: value };
    expect(shouldIgnoreArid({ node: value, parentPath: { node: assignment } })).toContain("assigned into the trace");
  });

  test("a value in a trace-carrying payload object (appendInjections({ trace, label: '…' }))", () => {
    const value = str("chat-injection:in_static");
    const property: AridNode = { type: "ObjectProperty", key: id("label"), value, computed: false };
    const traceProperty: AridNode = { type: "ObjectProperty", key: id("trace"), value: id("trace"), computed: false };
    const object: AridNode = { type: "ObjectExpression", properties: [traceProperty, property] };
    expect(shouldIgnoreArid({ node: value, parentPath: { node: property, parentPath: { node: object } } })).toContain("trace-carrying payload");
  });

  test("a logger-call argument (log.warn('…')), receiver-matched and case-insensitive", () => {
    expect(shouldIgnoreArid(arg1(member(id("log"), id("warn")), str("boom")))).toContain("logger-call");
    expect(shouldIgnoreArid(arg1(member(id("Logger"), id("debug")), str("boom")))).toContain("logger-call");
  });
});

describe("arid ignorer — the near-misses it MUST NOT ignore", () => {
  test("a push onto a NON-trace collection stays mutable", () => {
    const callee = member(id("other"), id("push"));
    expect(shouldIgnoreArid(arg1(callee, str("load-bearing-append")))).toBeUndefined();
  });

  test("an ordinary call argument stays mutable", () => {
    expect(shouldIgnoreArid(arg1(id("plain"), str("load-bearing-call")))).toBeUndefined();
  });

  test("a level-named method on a NON-logger receiver stays mutable (result.error('…'))", () => {
    expect(shouldIgnoreArid(arg1(member(id("result"), id("error")), str("load-bearing")))).toBeUndefined();
  });

  test("an assignment to a NON-trace member stays mutable", () => {
    const value = str("load-bearing");
    const assignment: AridNode = { type: "AssignmentExpression", left: member(id("acc"), id("label")), right: value };
    expect(shouldIgnoreArid({ node: value, parentPath: { node: assignment } })).toBeUndefined();
  });

  test("an object property in an object WITHOUT a trace property stays mutable", () => {
    const value = str("load-bearing");
    const property: AridNode = { type: "ObjectProperty", key: id("label"), value, computed: false };
    const object: AridNode = { type: "ObjectExpression", properties: [property] };
    expect(shouldIgnoreArid({ node: value, parentPath: { node: property, parentPath: { node: object } } })).toBeUndefined();
  });

  test("THE DOCUMENTED GAP: a trace label parked in a local first is NOT reachable syntactically", () => {
    // `overrideLabel()`'s `source = "room override"` — arid in fact, invisible to a one-node predicate.
    // Pinned so the limitation is a recorded decision, not a silent hole someone 'fixes' with a heuristic.
    const value = str("room override");
    // (`id`/`init` are omitted — the predicate never reads them, and `AridNode` here is the read SUBSET.)
    const declarator: AridNode = { type: "VariableDeclarator" };
    expect(shouldIgnoreArid({ node: value, parentPath: { node: declarator } })).toBeUndefined();
  });

  test("a computed member never matches by property name (trace[key].push, a['trace'] = …)", () => {
    const value = str("x");
    const callee: AridNode = {
      type: "MemberExpression",
      object: { type: "MemberExpression", object: id("a"), property: id("trace"), computed: true },
      property: id("push"),
      computed: false,
    };
    expect(shouldIgnoreArid(arg1(callee, value))).toBeUndefined();
  });

  test("a non-string node is never ignored, even in a sink position", () => {
    const num: AridNode = { type: "NumericLiteral", value: 1 };
    expect(shouldIgnoreArid(argPath(id("recordOverrideSource"), [id("trace"), num], num))).toBeUndefined();
  });

  test("a string with no parent path is never ignored", () => {
    expect(shouldIgnoreArid({ node: str("orphan") })).toBeUndefined();
  });
});

// --- family (2): compile-time-unreachable `never`-typed arms -------------------------------------
//

/** `const _exhaustive: never = x;` — the house marker for an arm tsc proved unreachable. */
function neverDecl(): AridNode {
  return {
    type: "VariableDeclaration",
    declarations: [
      {
        type: "VariableDeclarator",
        id: { type: "Identifier", name: "_exhaustive", typeAnnotation: { type: "TSTypeAnnotation", typeAnnotation: { type: "TSNeverKeyword" } } },
      },
    ],
  };
}

/** A plain `const x = 1;` — a reachable arm's declaration, which must NOT be ignored. */
function plainDecl(): AridNode {
  return { type: "VariableDeclaration", declarations: [{ type: "VariableDeclarator", id: id("x") }] };
}

function switchCase(caseTest: AridNode | null, statements: AridNode[]): AridNode {
  return { type: "SwitchCase", test: caseTest, consequent: statements };
}

function block(body: AridNode[]): AridNode {
  return { type: "BlockStatement", body };
}

describe("arid family (2) — unreachable arms", () => {
  test("a `default:` arm declaring a never-typed const is ignored WHOLE", () => {
    // Matching the SwitchCase (not a leaf) is deliberate: Stryker ignores the entire subtree under a
    // match, and every mutant inside an unreachable arm is equally unkillable.
    const arm = switchCase(null, [block([neverDecl()])]);
    expect(shouldIgnoreArid({ node: arm, parentPath: { node: { type: "SwitchStatement" } } })).toMatch(/compile-time unreachable/u);
  });

  test("the un-blocked `default:` form is ignored too", () => {
    expect(shouldIgnoreArid({ node: switchCase(null, [neverDecl()]), parentPath: { node: { type: "SwitchStatement" } } })).toMatch(/compile-time unreachable/u);
  });

  test("a bare block declaring a never-typed const is ignored (the non-switch fallthrough form)", () => {
    expect(shouldIgnoreArid({ node: block([neverDecl()]), parentPath: { node: { type: "IfStatement" } } })).toMatch(/compile-time unreachable/u);
  });

  // THE OTHER DIRECTION. These are the ways this rule could over-reach and silently delete real mutants
  // from the denominator, which would hide a real survivor.
  test("a REACHABLE `case x:` arm is never ignored, even if it declares a never-typed const", () => {
    expect(shouldIgnoreArid({ node: switchCase(id("someCase"), [block([neverDecl()])]), parentPath: { node: { type: "SwitchStatement" } } })).toBeUndefined();
  });

  test("a `default:` arm with no never-declaration is never ignored — it is ordinary reachable code", () => {
    expect(shouldIgnoreArid({ node: switchCase(null, [block([plainDecl()])]), parentPath: { node: { type: "SwitchStatement" } } })).toBeUndefined();
  });

  test("an ordinary block is never ignored", () => {
    expect(shouldIgnoreArid({ node: block([plainDecl()]), parentPath: { node: { type: "IfStatement" } } })).toBeUndefined();
  });
});

describe("arid ignorer — error prose", () => {
  function template(text: readonly string[], expressions: readonly AridNode[]): AridNode {
    return { type: "TemplateLiteral", quasis: text.map((raw) => ({ value: { raw } })), expressions };
  }

  function newArg(className: string, args: AridNode[], node: AridNode): AridPath {
    return { node, parentPath: { node: { type: "NewExpression", callee: id(className), arguments: args } } };
  }

  function messageOption(className: string, key: string, node: AridNode): AridPath {
    const property: AridNode = { type: "ObjectProperty", key: id(key), value: node, computed: false };
    const object: AridNode = { type: "ObjectExpression", properties: [property] };
    const construction: AridNode = { type: "NewExpression", callee: id(className), arguments: [object] };
    return { node, parentPath: { node: property, parentPath: { node: object, parentPath: { node: construction } } } };
  }

  test("prose is dropped as a sole argument, after a code, in a template, and as a message option", () => {
    const sole = str("requires the room host");
    expect(shouldIgnoreArid(newArg("DomainForbiddenError", [sole], sole))).toContain("error prose");
    const afterCode = str("read past end of archive");
    expect(shouldIgnoreArid(newArg("ZipRejectedError", [str("malformed"), afterCode], afterCode))).toContain("error prose");
    const interpolated = template(["requires ", " privilege"], [id("action")]);
    expect(shouldIgnoreArid(newArg("DomainForbiddenError", [interpolated], interpolated))).toContain("error prose");
    const coerced = template(["bad value: ", ""], [{ type: "CallExpression", callee: id("String"), arguments: [member(id("args"), id("value"))] }]);
    expect(shouldIgnoreArid(newArg("Error", [coerced], coerced))).toContain("error prose");
    expect(shouldIgnoreArid(messageOption("TRPCError", "message", str("not allowed here")))).toContain("error prose");
  });

  test("a code, key or mode stays scored, in any position", () => {
    const code = str("too-large");
    expect(shouldIgnoreArid(newArg("ZipRejectedError", [code, str("over the limit")], code))).toBeUndefined();
    const entity = str("user");
    expect(shouldIgnoreArid(newArg("DomainNotFoundError", [str("workload admission"), entity], entity))).toBeUndefined();
    expect(shouldIgnoreArid(messageOption("TRPCError", "code", str("FORBIDDEN")))).toBeUndefined();
  });

  test("a template holding logic stays scored, because the match would swallow its operators", () => {
    const logic = template(["got ", " here"], [{ type: "LogicalExpression", left: id("a"), right: id("b") }]);
    expect(shouldIgnoreArid(newArg("Error", [logic], logic))).toBeUndefined();
    const call = template(["got ", " here"], [{ type: "CallExpression", callee: id("describe"), arguments: [id("a")] }]);
    expect(shouldIgnoreArid(newArg("Error", [call], call))).toBeUndefined();
  });

  test("prose outside an error class stays scored", () => {
    const prose = str("two words");
    expect(shouldIgnoreArid(newArg("Map", [prose], prose))).toBeUndefined();
    expect(shouldIgnoreArid(arg1(id("plain"), prose))).toBeUndefined();
    expect(shouldIgnoreArid(messageOption("Notice", "message", prose))).toBeUndefined();
  });
});
