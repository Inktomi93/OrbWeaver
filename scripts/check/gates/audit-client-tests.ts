// Gate: audit-client-tests — DORMANT (see docs/architecture/core/Core-Enforcement-Deferred-Dropped.md
// "audit-client-tests": activates when "client tests exist"). Ported from neo-tavern's
// scripts/check/audit-client-tests.ts onto orb's `Check` interface + the central `tests/` tree — a
// ts-morph AST audit of every `*.test.ts`/`*.test.tsx` under `tests/` (the mirror; covers `.int.test.ts`
// too — it's a `.test.ts` suffix match) for structural anti-patterns grep can't see: whether a
// CallExpression is chained, whether a test callback contains a descendant AwaitExpression, etc.
//
// DORMANT BY DECISION (Alex 2026-07-04, scratch/dev-tooling-support-kit-plan.md) — NOT listed in
// `ALL_CHECKS` (scripts/check/report.ts), so it never runs as part of `pnpm check:structure` today.
// ACTIVATE by adding, verbatim:
//   import { auditClientTests } from "./gates/audit-client-tests.ts";
// and an `auditClientTests,` entry to the `ALL_CHECKS` array in scripts/check/report.ts.
//
// NOT covered here (same as neo): Playwright Component Tests (`*.ct.tsx`) — they run their own lane
// (`pnpm test:ct`) with Playwright idioms (`component.getByRole`, `await expect(loc)…`) rather than the
// vitest/Testing-Library matcher shape this pass understands. A CT-idiom structural audit is a future add.
//
// Five patterns, each a `test-no-stubs`-class anti-gaming check (that gate proves a test has AN
// assertion; this one proves the SURROUNDING shape isn't gaming presence/no-stubs some other way):
//
//   1. test()/it() callback has no descendant `expect(...).<matcher>()` chain (directly OR via an
//      assertion helper like `expectNotFound(...)`/`assertOwned(...)` — resolved transitively, capped
//      depth 4) — a pure `await x()` proves only "doesn't throw."
//   2. an async test()/it() callback has no descendant AwaitExpression (missing-await or
//      unnecessary-async).
//   3. a bare `expect(x);` ExpressionStatement with no matcher chain.
//   4. a describe() block with no nested test()/it() descendant.
//   5. a beforeEach/afterEach/beforeAll/afterAll with an empty arrow body.
//
// Self-tested: tests/tooling/audit-client-tests.int.test.ts drives all five rules over an in-memory
// ts-morph project (synthetic fixtures, never the real tree) proving fire AND no-false-positive.
import type { ArrowFunction, FunctionExpression, Node as TsMorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { Check, Violation } from "../harness.ts";

const MAX_HELPER_DEPTH = 4;
const ASSERTION_HELPER_RE = /^(?:expect|assert)[A-Z0-9]/u;
const TEST_FILE_RE = /\.test\.tsx?$/u;

// Vitest test modifiers that chain off `test`/`it` and still denote a test call. Deliberately
// EXCLUDES `extend` (`test.extend({…})` defines a fixture, not a test) so a LOCAL variable named `it`
// (the async-iterator pattern `const it = x[Symbol.asyncIterator](); it.next();`) is never mistaken
// for a test.
const TEST_MODIFIERS = new Set([
  "only",
  "skip",
  "todo",
  "concurrent",
  "sequential",
  "each",
  "for",
  "fails",
  "runIf",
  "skipIf",
]);

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

function getCalleeName(call: TsMorphNode): string | undefined {
  const expr = call.asKind(SyntaxKind.CallExpression)?.getExpression();
  if (expr === undefined) {
    return;
  }
  if (Node.isIdentifier(expr)) {
    return expr.getText();
  }
  return Node.isPropertyAccessExpression(expr) ? expr.getName() : undefined;
}

type CallShape = { readonly root: string; readonly prop: string | undefined };

// Walk a call's callee expression down to its leftmost identifier, tracking the last
// property-access name seen along the way. `it("n", fn)` → {root:"it", prop:undefined};
// `it.each(t)("n", fn)` → {root:"it", prop:"each"} (unwraps the chained `.each(...)` call too).
function walkCallRoot(expr: TsMorphNode, prop: string | undefined): CallShape | undefined {
  if (Node.isIdentifier(expr)) {
    return { root: expr.getText(), prop };
  }
  if (Node.isPropertyAccessExpression(expr)) {
    return walkCallRoot(expr.getExpression(), expr.getName());
  }
  return Node.isCallExpression(expr) ? walkCallRoot(expr.getExpression(), prop) : undefined;
}

function testCallShape(call: TsMorphNode): CallShape | undefined {
  const ce = call.asKind(SyntaxKind.CallExpression);
  return ce === undefined ? undefined : walkCallRoot(ce.getExpression(), undefined);
}

function isTestCall(call: TsMorphNode): boolean {
  const shape = testCallShape(call);
  if (shape === undefined || (shape.root !== "test" && shape.root !== "it")) {
    return false;
  }
  // Bare `test(...)`/`it(...)` OR a recognized modifier chain — never `it.return()`/`it.next()`.
  return shape.prop === undefined || TEST_MODIFIERS.has(shape.prop);
}

function isDescribeCall(call: TsMorphNode): boolean {
  return testCallShape(call)?.root === "describe";
}

function isLifecycleHookCall(call: TsMorphNode): boolean {
  const name = getCalleeName(call);
  return (
    name === "beforeEach" || name === "afterEach" || name === "beforeAll" || name === "afterAll"
  );
}

function callbackFromCall(call: TsMorphNode): ArrowFunction | FunctionExpression | undefined {
  const args = call.asKind(SyntaxKind.CallExpression)?.getArguments() ?? [];
  return args.find(
    (a): a is ArrowFunction | FunctionExpression =>
      Node.isArrowFunction(a) || Node.isFunctionExpression(a),
  );
}

// Does `cursor` walk (through call/property-access unwraps) down to the `expect` identifier —
// either a bare `expect` reference or an `expect(...)` call? Recursion depth is bounded by the AST's
// own depth (a real expression chain), never user input.
function walksToExpectCall(cursor: TsMorphNode | undefined): boolean {
  if (cursor === undefined) {
    return false;
  }
  if (Node.isCallExpression(cursor)) {
    const inner = cursor.getExpression();
    if (Node.isIdentifier(inner) && inner.getText() === "expect") {
      return true;
    }
    return walksToExpectCall(inner);
  }
  if (Node.isPropertyAccessExpression(cursor)) {
    const lhs = cursor.getExpression();
    if (Node.isIdentifier(lhs) && lhs.getText() === "expect") {
      return true; // expect.element(...).toBeVisible() / expect.poll(...)
    }
    return walksToExpectCall(lhs);
  }
  return false;
}

// A "matcher-chained expect": a CallExpression whose leftmost target resolves to `expect` (bare or
// called), followed by at least one more property-access + call (the matcher itself).
function hasMatcherChainedExpect(node: TsMorphNode): boolean {
  let found = false;
  node.forEachDescendant((d, traversal) => {
    if (found) {
      traversal.stop();
      return;
    }
    if (!Node.isCallExpression(d)) {
      return;
    }
    const expr = d.getExpression();
    if (Node.isPropertyAccessExpression(expr) && walksToExpectCall(expr.getExpression())) {
      found = true;
      traversal.stop();
    }
  });
  return found;
}

function calleeNameNode(expr: TsMorphNode): TsMorphNode | undefined {
  if (Node.isIdentifier(expr)) {
    return expr;
  }
  return Node.isPropertyAccessExpression(expr) ? expr.getNameNode() : undefined;
}

function bodyOfFunctionLike(node: TsMorphNode | undefined): TsMorphNode | undefined {
  if (node === undefined) {
    return;
  }
  return Node.isArrowFunction(node) || Node.isFunctionExpression(node) ? node.getBody() : undefined;
}

// A single declaration's function BODY — a direct function-like declaration, or the initializer of
// `const x = (...) => {}` / `const x = function(){}`.
function bodyFromDeclaration(decl: TsMorphNode): TsMorphNode | undefined {
  if (
    Node.isFunctionDeclaration(decl) ||
    Node.isFunctionExpression(decl) ||
    Node.isArrowFunction(decl)
  ) {
    return decl.getBody();
  }
  return Node.isVariableDeclaration(decl) ? bodyOfFunctionLike(decl.getInitializer()) : undefined;
}

// Resolve a CallExpression's callee to the BODY of the function/arrow it names. Undefined if the
// callee isn't a resolvable identifier/property-access, or its symbol has no function-like declaration.
function resolveCalleeBody(call: TsMorphNode): TsMorphNode | undefined {
  const expr = call.asKind(SyntaxKind.CallExpression)?.getExpression();
  const nameNode = expr === undefined ? undefined : calleeNameNode(expr);
  const symbol = nameNode?.getSymbol();
  if (symbol === undefined) {
    return;
  }
  const bodies = symbol
    .getDeclarations()
    .map((d) => bodyFromDeclaration(d))
    .filter((b): b is TsMorphNode => b !== undefined);
  return bodies[0];
}

// True if `node` asserts directly (a matcher-chained expect) OR calls an assertion helper
// (`expectX(...)`/`assertX(...)`) whose resolved body transitively asserts. Bounded by a visited set
// + a depth cap so mutually-recursive helpers can't loop.
function assertsViaExpectOrHelper(
  node: TsMorphNode,
  seen: Set<TsMorphNode> = new Set(),
  depth = 0,
): boolean {
  if (depth > MAX_HELPER_DEPTH || seen.has(node)) {
    return false;
  }
  seen.add(node);
  if (hasMatcherChainedExpect(node)) {
    return true;
  }
  let found = false;
  node.forEachDescendant((d, traversal) => {
    if (found) {
      traversal.stop();
      return;
    }
    if (!Node.isCallExpression(d)) {
      return;
    }
    const name = getCalleeName(d);
    if (name === undefined || !ASSERTION_HELPER_RE.test(name)) {
      return;
    }
    const body = resolveCalleeBody(d);
    if (body !== undefined && assertsViaExpectOrHelper(body, seen, depth + 1)) {
      found = true;
      traversal.stop();
    }
  });
  return found;
}

// An `AwaitExpression` node, OR a `for await (...)` loop — the latter awaits on every iteration via
// a ForOfStatement `awaitKeyword` flag, never an AwaitExpression node (live-verified: neo's original
// port missed this, false-positiving on `for await (const x of asyncIter()) {...}` bodies).
function hasDescendantAwait(node: TsMorphNode): boolean {
  if (node.getDescendantsOfKind(SyntaxKind.AwaitExpression).length > 0) {
    return true;
  }
  return node.getDescendantsOfKind(SyntaxKind.ForOfStatement).some((f) => f.isAwaited());
}

function hasNestedTestOrIt(node: TsMorphNode): boolean {
  return node.getDescendantsOfKind(SyntaxKind.CallExpression).some((c) => isTestCall(c));
}

// "Bare expect" — an ExpressionStatement whose expression is a bare `expect(x)` call with no
// member-access matcher wrapper.
function findBareExpectStatements(node: TsMorphNode): TsMorphNode[] {
  const hits: TsMorphNode[] = [];
  node.forEachDescendant((d) => {
    if (!Node.isExpressionStatement(d)) {
      return;
    }
    const inner = d.getExpression();
    if (!Node.isCallExpression(inner)) {
      return;
    }
    const callee = inner.getExpression();
    if (Node.isIdentifier(callee) && callee.getText() === "expect") {
      hits.push(d);
    }
  });
  return hits;
}

function auditDescribe(call: TsMorphNode, rel: string, out: Violation[]): void {
  const cb = callbackFromCall(call);
  if (cb !== undefined && !hasNestedTestOrIt(cb)) {
    out.push({
      file: rel,
      line: call.getStartLineNumber(),
      message: "describe() block has no nested test()/it() descendant (Spine-Testing.md §5)",
    });
  }
}

function auditLifecycleHook(call: TsMorphNode, rel: string, out: Violation[]): void {
  const body = callbackFromCall(call)?.getBody();
  if (body === undefined || !Node.isBlock(body) || body.getStatements().length > 0) {
    return;
  }
  out.push({
    file: rel,
    line: call.getStartLineNumber(),
    message: `${getCalleeName(call)}() hook has empty body — delete the hook (Spine-Testing.md §5)`,
  });
}

function auditTestCallback(call: TsMorphNode, rel: string, out: Violation[]): void {
  const cb = callbackFromCall(call);
  if (cb === undefined) {
    return;
  }
  const title = call.asKind(SyntaxKind.CallExpression)?.getArguments()[0]?.getText() ?? "<unknown>";
  if (!assertsViaExpectOrHelper(cb)) {
    out.push({
      file: rel,
      line: call.getStartLineNumber(),
      message: `test ${title}: no descendant expect(...).<matcher>() call — pure "doesn't throw" is not a test (Spine-Testing.md §5)`,
    });
  }
  if (cb.isAsync() && !hasDescendantAwait(cb)) {
    out.push({
      file: rel,
      line: call.getStartLineNumber(),
      message: `test ${title}: async callback has no AwaitExpression — drop async OR add an await (Spine-Testing.md §5)`,
    });
  }
}

function auditCall(call: TsMorphNode, rel: string, out: Violation[]): void {
  if (isDescribeCall(call)) {
    auditDescribe(call, rel, out);
  } else if (isLifecycleHookCall(call)) {
    auditLifecycleHook(call, rel, out);
  } else if (isTestCall(call)) {
    auditTestCallback(call, rel, out);
  }
}

function isTestFile(filePath: string): boolean {
  return filePath.includes("/tests/") && TEST_FILE_RE.test(filePath);
}

export const auditClientTests: Check = {
  name: "audit-client-tests",
  run: ({ root, project }): Violation[] => {
    const violations: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      const filePath = sf.getFilePath();
      if (!isTestFile(filePath)) {
        continue;
      }
      const rel = relPath(root, filePath);
      for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
        auditCall(call, rel, violations);
      }
      for (const stmt of findBareExpectStatements(sf)) {
        violations.push({
          file: rel,
          line: stmt.getStartLineNumber(),
          message:
            "bare `expect(x);` with no matcher chain — assertion incomplete (Spine-Testing.md §5)",
        });
      }
    }
    return violations;
  },
};
