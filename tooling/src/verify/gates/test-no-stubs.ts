// Gate: test-no-stubs — anti-gaming for test-presence (Spine-Testing.md §5): every test/it block must
// carry ≥1 real assertion (expect/expectTypeOf), or a stub satisfies presence rules without testing
// anything. HARD authority: there is no legitimate reason to waive a stub test, and an ordinary marker
// escape would defeat exactly the gaming this gate exists to prevent.
//
// STATE MOVED INTO `create`. The legacy shape called `call.getDescendantsOfKind(CallExpression)` on the
// delivered test-call node to find its nested assertions — a private descendant walk the final query
// boundary forbids even when scoped to one node. The final shape subscribes to CallExpression once (the
// SAME shared walk every gate rides) and sorts every call into one of two per-file lists (a test
// declaration, or an assertion call); `evaluate` then reconciles each test against ONLY its own file's
// assertion list by node-RANGE containment. Per-file indexing (not one shared list) is load-bearing: a
// pass over a narrowed OR whole-tree subset visits many files, and two different SourceFiles' local
// offsets can numerically overlap — an assertion in file B must never satisfy a stub test in file A
// (the CROSS-FILE LEAK CONTROL mustFlag row below proves the guard, with a planted-break receipt: a
// shared-list `evaluate` reads that row as 0 findings).
//
// THE ROW'S `files` PATHS ARE POPULATION COORDINATES, NOT LOCATIONS (gate-runtime-standardization.md
// §4.8). `mode: "source"` fixtures are created in memory under a synthetic root and never written to
// disk; this gate's `@tests` population admits them only because their paths sit under `tests/`. Move
// the ASSERTION file out of `tests/` and the policy stops seeing it — the stub still flags, the row
// still reads `count: 1`, and the cross-file claim becomes vacuous while staying green. That is why the
// paths are load-bearing and not decoration.
//
// FAMILY: a declared SINGLETON under its own id. No sibling asks whether a test block carries an
// assertion, and there is no shared `lib/` computation behind reconciling calls by node range.
// POPULATION PORT: BYTE-IDENTICAL. Legacy `scanRoot: (p) => p.includes("tests/")` is exactly `@tests`.
// Re-derived 2026-09-12 by applying the legacy predicate and this declaration to the SAME 7,537-path
// compiler-source candidate set: 2,928 admitted on both sides, symmetric difference ZERO in both directions.
// (The `POPULATION COORDINATES` paragraph above is about a proof row's `files` map, NOT about this port —
// a §5b.5 census keying on the word alone reads it as one, which is why this is its own labelled field.)
// LEGACY SHA: (61aa46279^) — the conversion's parent.
import type { CallExpression, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const TEST_CALL_NAMES = new Set(["test", "it", "test.skip", "it.skip"]);

function calleeName(call: CallExpression): string {
  return call.getExpression().getText();
}

function isAssertionCall(call: CallExpression): boolean {
  // Collapse whitespace: a formatter-broken chain (`expect\n  .poll(...)`) must still read as `expect.poll`.
  const name = calleeName(call).replaceAll(/\s+/gu, "");
  return name === "expect" || name === "expectTypeOf" || name.startsWith("expect.");
}

function isTestDeclaration(call: CallExpression): boolean {
  const name = calleeName(call);
  if (!TEST_CALL_NAMES.has(name)) {
    return false;
  }
  // Playwright's in-body `test.skip(condition, reason)` is a runner-status guard, not a nested test
  // declaration. A skipped test declaration still has a callback argument and remains subject to this gate.
  return !name.endsWith(".skip") || call.getArguments().some((arg) => arg.isKind(SyntaxKind.ArrowFunction) || arg.isKind(SyntaxKind.FunctionExpression));
}

const STUB_MESSAGE =
  "stub test contains no assertions (expect/expectTypeOf) — tests must assert behavior, not just satisfy presence rules (Spine-Testing.md §5).";

export const gate = defineGate({
  id: "test-no-stubs",
  family: "test-no-stubs",
  authority: "hard",
  severity: "error",
  population: "@tests",
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: STUB_MESSAGE,
  fix: "add at least one expect()/expectTypeOf() assertion to the test body (or delete the stub).",
  create: (ctx) => {
    const testCalls: CallExpression[] = [];
    const assertionsByFile = new Map<string, CallExpression[]>();
    const assertionsFor = (sourceFile: SourceFile): CallExpression[] => {
      const path = ctx.relativePath(sourceFile);
      let list = assertionsByFile.get(path);
      if (list === undefined) {
        list = [];
        assertionsByFile.set(path, list);
      }
      return list;
    };
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile) => {
            if (!Node.isCallExpression(node)) {
              return;
            }
            if (isTestDeclaration(node)) {
              testCalls.push(node);
              return;
            }
            if (isAssertionCall(node)) {
              assertionsFor(sourceFile).push(node);
            }
          },
        },
      ],
      evaluate: () => {
        for (const testCall of testCalls) {
          const assertions = assertionsByFile.get(ctx.relativePath(testCall.getSourceFile())) ?? [];
          const start = testCall.getStart();
          const end = testCall.getEnd();
          const hasAssertion = assertions.some((assertion) => assertion.getStart() >= start && assertion.getEnd() <= end);
          if (!hasAssertion) {
            const callee = testCall.getExpression();
            ctx.report.node(callee, { token: callee.getText(), offset: 0 });
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "source",
      files: { "tests/tooling/x.test.ts": 'test("does nothing", () => {\n  const x = 1;\n});\n' },
      expect: { count: 1, token: "test" },
      why: "a test with no expect/expectTypeOf — a stub that games the presence rules (§5)",
    },
    {
      mode: "source",
      files: {
        "tests/tooling/a.test.ts": 'test("empty", () => {\n  const x = 1;\n  const y = 2;\n  const z = 3;\n  const w = 4;\n  const v = 5;\n});\n',
        "tests/tooling/b.test.ts": "expect(1).toBe(1);\n",
      },
      // `token`/`line` pin WHICH node flags, as the `why` claims: file a's `test` callee at its line 1.
      // The assertion file contributes no test declaration, so one finding is the whole expected set.
      expect: { count: 1, line: 1, token: "test" },
      // DISCRIMINATING BY DESIGN (#1935, planted-break receipt in the report): file b's assertion node-range
      // is chosen so its NUMERIC offsets fall inside file a's test-call range once the two files' local
      // offsets are read off a SHARED list rather than a PER-FILE one — the prior fixture (a bare `const x = 1`
      // body against a wrapped assertion) never overlapped under either reconciliation shape, so it proved
      // nothing about the per-file guard the header above claims. This fixture reads `count: 1` (a's stub
      // still flags) only when reconciliation stays per-file; a shared-list mutation of `evaluate` reads
      // `count: 0` (b's assertion offset-overlaps and wrongly satisfies a's stub).
      why: "CROSS-FILE LEAK CONTROL: file b's assertion must not satisfy file a's stub test — reconciliation is per-file range containment over a per-file assertion index, never one shared list across the whole pass",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "tests/tooling/y.test.ts": 'test("asserts", () => {\n  expect(1).toBe(1);\n});\n' },
      why: "a test with a real expect() assertion — asserts behavior, passes",
    },
    {
      mode: "source",
      files: {
        "tests/e2e/conditional.spec.ts":
          'test("conditionally available", () => {\n  test.skip(!backendAvailable, "backend unavailable");\n  expect(result).toBe("ok");\n});\n',
      },
      why: "an in-body runner-status guard (`test.skip(condition, reason)`, no callback argument) is not itself a nested test declaration",
    },
    {
      mode: "source",
      files: { "tests/tooling/z.test.ts": 'test("chained assertion", () => {\n  expect\n    .poll(() => 1)\n    .toBe(1);\n});\n' },
      why: "declared limit preserved from the legacy check: a formatter-broken `expect\\n  .poll(...)` chain still reads as an assertion once whitespace collapses",
    },
  ],
});
