// Self-test for the ARID ignorer (tooling/src/mutation-arid/) — the Stryker ignore-plugin that
// drops string-literal mutants whose only destination is an observability sink.
//
// A SUPPRESSOR IS BITE-PROVED IN BOTH DIRECTIONS OR IT IS A LIABILITY. A mutant-ignorer that is too eager
// silently deletes real survivors from the ratchet's denominator, and nothing downstream can tell the
// difference between "we killed it" and "we stopped asking". So every rule below is pinned twice: the sink
// shape it MUST ignore, and the near-miss shape it MUST NOT (`other.push("…")` beside
// `trace.sections.push("…")`; `plain("…")` beside `recordX("…")`; a bare local beside a trace assignment).
//
// THE FIXTURES ARE BABEL NODE SHAPES, not ts-morph's. Stryker instruments with babel, so the predicate
// reads babel's spelling — `MemberExpression`/`ObjectProperty`, not TS's `PropertyAccessExpression`/
// `PropertyAssignment`. @babel/parser is not resolvable from this workspace (it is a transitive of the
// instrumenter, not a declared dep), so the paths are constructed rather than parsed. The shapes here are
// NOT guesswork: they were transcribed from a live end-to-end bite proof (2026-08-21, lane stryker-v10) —
// a scratch probe module carrying exactly these constructs was run through `stryker run` with the plugin
// wired, and the report returned Ignored (with each rule's own reason string) for the five sink shapes and
// Survived for the three near-misses, in the same order asserted below. If this file ever disagrees with a
// real run, the REAL RUN is right and these fixtures have drifted from babel.

import { describe } from "vitest";
import { shouldIgnoreArid } from "../../../../tooling/src/mutation-arid/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

/** Mirrors the (unexported, by no-inline-types) `AridNode` in the plugin — the babel subset it reads. */
interface Node {
  type: string;
  name?: string;
  callee?: Node;
  arguments?: Node[];
  object?: Node;
  property?: Node;
  computed?: boolean;
  left?: Node;
  right?: Node;
  key?: Node;
  value?: Node | string | number | boolean;
  properties?: Node[];
  test?: Node | null;
  consequent?: Node[];
  body?: Node[];
  declarations?: Node[];
  id?: Node;
  typeAnnotation?: Node;
}
interface Path {
  node: Node;
  parentPath?: Path | null;
}

function id(name: string): Node {
  return { type: "Identifier", name };
}

function str(value: string): Node {
  return { type: "StringLiteral", value };
}

function member(object: Node, property: Node): Node {
  return { type: "MemberExpression", object, property, computed: false };
}

/** Builds the CallExpression around `args` and returns the path OF `node` (what Stryker enters). */
function argPath(callee: Node, args: Node[], node: Node): Path {
  const call: Node = { type: "CallExpression", callee, arguments: args };
  return { node, parentPath: { node: call } };
}

/** The one-argument shorthand — the argument IS the node under test. */
function arg1(callee: Node, node: Node): Path {
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
    const assignment: Node = { type: "AssignmentExpression", left: member(id("trace"), id("overrideSources")), right: value };
    expect(shouldIgnoreArid({ node: value, parentPath: { node: assignment } })).toContain("assigned into the trace");
  });

  test("a value in a trace-carrying payload object (appendInjections({ trace, label: '…' }))", () => {
    const value = str("chat-injection:in_static");
    const property: Node = { type: "ObjectProperty", key: id("label"), value, computed: false };
    const traceProperty: Node = { type: "ObjectProperty", key: id("trace"), value: id("trace"), computed: false };
    const object: Node = { type: "ObjectExpression", properties: [traceProperty, property] };
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
    const assignment: Node = { type: "AssignmentExpression", left: member(id("acc"), id("label")), right: value };
    expect(shouldIgnoreArid({ node: value, parentPath: { node: assignment } })).toBeUndefined();
  });

  test("an object property in an object WITHOUT a trace property stays mutable", () => {
    const value = str("load-bearing");
    const property: Node = { type: "ObjectProperty", key: id("label"), value, computed: false };
    const object: Node = { type: "ObjectExpression", properties: [property] };
    expect(shouldIgnoreArid({ node: value, parentPath: { node: property, parentPath: { node: object } } })).toBeUndefined();
  });

  test("THE DOCUMENTED GAP: a trace label parked in a local first is NOT reachable syntactically", () => {
    // `overrideLabel()`'s `source = "room override"` — arid in fact, invisible to a one-node predicate.
    // Pinned so the limitation is a recorded decision, not a silent hole someone 'fixes' with a heuristic.
    const value = str("room override");
    // (`id`/`init` are omitted — the predicate never reads them, and `Node` here is the read SUBSET.)
    const declarator: Node = { type: "VariableDeclarator" };
    expect(shouldIgnoreArid({ node: value, parentPath: { node: declarator } })).toBeUndefined();
  });

  test("a computed member never matches by property name (trace[key].push, a['trace'] = …)", () => {
    const value = str("x");
    const callee: Node = {
      type: "MemberExpression",
      object: { type: "MemberExpression", object: id("a"), property: id("trace"), computed: true },
      property: id("push"),
      computed: false,
    };
    expect(shouldIgnoreArid(arg1(callee, value))).toBeUndefined();
  });

  test("a non-string node is never ignored, even in a sink position", () => {
    const num: Node = { type: "NumericLiteral", value: 1 };
    expect(shouldIgnoreArid(argPath(id("recordOverrideSource"), [id("trace"), num], num))).toBeUndefined();
  });

  test("a string with no parent path is never ignored", () => {
    expect(shouldIgnoreArid({ node: str("orphan") })).toBeUndefined();
  });
});

// --- family (2): compile-time-unreachable `never`-typed arms -------------------------------------
//
// Measured motivation (pnpm mutation:probe, 2026-08-26, domain/admin/guard.ts): 6 of its 8 planted
// survivors sat in the two `default:` exhaustiveness arms — 25% of that file's denominator, and not one
// of them is killable, because tsc has already proved the arm cannot execute. The exhaustive-dispatch
// discipline puts one in every dispatch site, so this is dead weight under EVERY score, not one file's.

/** `const _exhaustive: never = x;` — the house marker for an arm tsc proved unreachable. */
function neverDecl(): Node {
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
function plainDecl(): Node {
  return { type: "VariableDeclaration", declarations: [{ type: "VariableDeclarator", id: id("x") }] };
}

function switchCase(caseTest: Node | null, statements: Node[]): Node {
  return { type: "SwitchCase", test: caseTest, consequent: statements };
}

function block(body: Node[]): Node {
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
  // from the denominator — which would inflate the score and make the ratchet lie in the dangerous way.
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
