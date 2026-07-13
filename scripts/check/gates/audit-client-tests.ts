// Gate: audit-client-tests — DORMANT (activates when client tests exist). AST audit of every
// tests/**/*.test.ts(x) for structural anti-patterns grep can't see: an assertion-less test callback
// (directly or via a resolved assertion helper), a missing-await async test, a bare `expect(x);`, an
// empty describe() with no nested test, an empty lifecycle hook. Excludes `*.ct.tsx` (own CT lane).
import type { ArrowFunction, FunctionExpression, Node as TsMorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import type { CheckContext, Violation } from "../harness.ts";

const MAX_HELPER_DEPTH = 4;
const ASSERTION_HELPER_RE = /^(?:expect|assert)[A-Z0-9]/u;
const TEST_FILE_RE = /\.test\.tsx?$/u;

// Excludes `extend` (test.extend defines a fixture) so a local `it` (async-iterator pattern) isn't mistaken for a test.
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
      return true;
    }
    return walksToExpectCall(lhs);
  }
  return false;
}

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

// A `for await (...)` loop awaits per-iteration via the ForOfStatement flag, not an AwaitExpression node.
function hasDescendantAwait(node: TsMorphNode): boolean {
  if (node.getDescendantsOfKind(SyntaxKind.AwaitExpression).length > 0) {
    return true;
  }
  return node.getDescendantsOfKind(SyntaxKind.ForOfStatement).some((f) => f.isAwaited());
}

function hasNestedTestOrIt(node: TsMorphNode): boolean {
  return node.getDescendantsOfKind(SyntaxKind.CallExpression).some((c) => isTestCall(c));
}

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

function scanAuditClientTests({ root, project }: CheckContext): Violation[] {
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
}

export const gate: GateDescriptor = {
  name: "audit-client-tests",
  docRow: "Core-Enforcement-Deferred-Dropped.md (audit-client-tests) / Spine-Testing.md §5",
  status: "dormant",
  scopeSafety: "whole-project",
  message:
    "a test file carries a structural anti-pattern — a test callback with no `expect(...).<matcher>()`, an async test with no await, a bare `expect(x);`, an empty describe() with no nested test, or an empty lifecycle hook (Spine-Testing.md §5).",
  fix: "add a matcher-chained expect (or await), delete the empty describe/hook, and complete any bare `expect(x)` with a matcher (Spine-Testing.md §5).",
  run: (ctx) => {
    for (const v of scanAuditClientTests({ root: ctx.root, project: ctx.project })) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: 'test("does nothing", () => {\n  const x = 1;\n  void x;\n});\n',
      at: "tests/tooling/x.test.ts",
      expect: { messageIncludes: "doesn't throw" },
      why: 'a test callback with no expect(...).<matcher>() — pure "doesn\'t throw" is not a test (§5)',
    },
    {
      files: 'test("async no await", async () => {\n  expect(1).toBe(1);\n});\n',
      at: "tests/tooling/async.test.ts",
      expect: { messageIncludes: "no AwaitExpression" },
      why: "rule 2: an async callback with no AwaitExpression — drop async or add an await",
    },
    {
      files: 'test("bare", () => {\n  expect(1);\n});\n',
      at: "tests/tooling/bare.test.ts",
      expect: { messageIncludes: "bare `expect(x);`" },
      why: "rule 3: a bare expect(x) statement with no matcher chain — assertion incomplete",
    },
    {
      files: 'describe("a suite", () => {\n  const x = 1;\n  void x;\n});\n',
      at: "tests/tooling/empty-describe.test.ts",
      expect: { messageIncludes: "no nested test()/it()" },
      why: "rule 4: a describe() block with no nested test()/it() descendant",
    },
    {
      files: "beforeEach(() => {});\n",
      at: "tests/tooling/empty-hook.test.ts",
      expect: { messageIncludes: "empty body" },
      why: "rule 5: an empty lifecycle hook body — delete the hook",
    },
    {
      files: 'test("int no assert", async () => {\n  await Promise.resolve();\n});\n',
      at: "tests/server/domain/x.int.test.ts",
      expect: { messageIncludes: "no descendant expect" },
      why: "suffix scope: .int.test.ts is still a .test.ts suffix match — it is audited",
    },
  ],
  mustPass: [
    {
      files: 'test("asserts", () => {\n  expect(1).toBe(1);\n});\n',
      at: "tests/tooling/ok.test.ts",
      why: "a test with a matcher-chained expect — the audited shape holds, passes",
    },
    {
      files:
        // biome-ignore lint/security/noSecrets: a fixture SOURCE string (a helper function + a test call), not a secret.
        "function expectOk(x: number): void {\n  expect(x).toBeGreaterThan(0);\n}\n" +
        'test("asserts via a helper", () => {\n  expectOk(1);\n});\n',
      at: "tests/tooling/helper.test.ts",
      why: "rule 1: the assertion lives inside a resolved assertion helper — transitively resolved, passes",
    },
    {
      files: 'test("polls", async () => {\n  await expect.poll(() => 1).toBe(1);\n});\n',
      at: "tests/tooling/poll.test.ts",
      why: "rule 1: expect.poll(...) is a matcher chain via the bare `expect` identifier target",
    },
    {
      files: 'test("sync", () => {\n  expect(1).toBe(1);\n});\n',
      at: "tests/tooling/sync.test.ts",
      why: "rule 2: a sync callback (no async keyword) is not required to await",
    },
    {
      files:
        'test("async with await", async () => {\n  await Promise.resolve();\n  expect(1).toBe(1);\n});\n',
      at: "tests/tooling/awaited.test.ts",
      why: "rule 2: an async callback that awaits passes",
    },
    {
      files:
        'test("drains an async iterable", async () => {\n' +
        "  const out: number[] = [];\n" +
        "  for await (const x of gen()) {\n" +
        "    out.push(x);\n" +
        "  }\n" +
        "  expect(out).toEqual([1]);\n" +
        "});\n",
      at: "tests/tooling/for-await.test.ts",
      why: "rule 2: `for await (...)` awaits per-iteration (no AwaitExpression node) — the live-verified false positive this gate fixes",
    },
    {
      files: "export const helper = () => 1;\n",
      at: "tests/support/helper.ts",
      why: "suffix scope: a non-test file under tests/ is ignored",
    },
    {
      files: 'test("mounts", () => {\n  const x = 1;\n  void x;\n});\n',
      at: "tests/ui/button.ct.tsx",
      why: "suffix scope: .ct.tsx (Playwright CT lane) is audited elsewhere, not here",
    },
  ],
};
