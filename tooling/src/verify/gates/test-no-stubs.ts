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
// RECOGNIZER (#2027): a test declaration is the shared `lib/test-call-shape.ts#isTestCallShape` — the bare
// `test`/`it` root or a chain whose member read directly off the root is a Vitest modifier (`only`,
// `concurrent`, `each`, `for`, `runIf`, `skipIf`, …), walked THROUGH call-returning factories
// (`test.each(table)(name, fn)`) and tagged-template tables (``test.each`a | b`(name, fn)``). That covers every
// modifier chain spelled off the bare `test`/`it` NAME; the reader's by-name limits (element-access,
// parenthesized, qualified or aliased roots) are declared and run in its mirror test. It used to be the literal
// text set `{test, it, test.skip, it.skip}`, which left every other modifier form unjudged here. (Through the
// same reader `audit-client-tests` now REPORTS a tagged-table stub, anchored on the tag's member (`each`); the
// call-returning stub it used to report as the token `test.each([1])` — refused by the waiver sink, WITHHOLDING
// that whole policy, measured 2026-09-13 — is judged there as of #2454, which walks the same anchor through the
// inner call and carries the row in both directions.)
// Every MODIFIER form must carry a callback to count, while the bare root keeps its legacy unconditional
// verdict (`test("x")` with no body is still a stub — pinned by its own row): that one clause separates a
// declaration from Playwright's in-body `test.skip(condition, reason)` guard AND from the inner
// `test.each(table)` factory call, which has the same shape and would otherwise read as a second,
// assertion-less test.
//
// FAMILY `test-no-stubs`, shared with `audit-client-tests` through `lib/test-call-shape.ts#isTestCallShape`:
// both policies judge the SAME subject — which calls declare a test — and read it from one vocabulary. They
// are not merged (§8.3): `audit-client-tests` follows assertion helpers and fences its population to
// `*.test.ts(x)`, this policy does neither, and each catches what the other cannot (its header measures both).
// POPULATION PORT: BYTE-IDENTICAL. Legacy `scanRoot: (p) => p.includes("tests/")` is exactly `@tests`.
// Re-derived 2026-09-12 by applying the legacy predicate and this declaration to the SAME 7,537-path
// compiler-source candidate set: 2,928 admitted on both sides, symmetric difference ZERO in both directions.
// (The `POPULATION COORDINATES` paragraph above is about a proof row's `files` map, NOT about this port —
// a §5b.5 census keying on the word alone reads it as one, which is why this is its own labelled field.)
// LEGACY SHA: (61aa46279^) — the conversion's parent.
import type { CallExpression, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { callChainRoot, isTestCallShape } from "../lib/test-call-shape.ts";

/** A dotted callee spelling (`test`, `test.only`, `it.concurrent`) — the token the report keeps verbatim. */
const DOTTED_CALLEE = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/u;

/** The assertion roots. `expect.poll(…)`, `expect.soft(…)` and `expect(x).toBe(…)` all bottom out in
 *  `expect`, so the ROOT is the whole vocabulary and no member spelling needs listing. */
const ASSERTION_ROOTS: ReadonlySet<string> = new Set(["expect", "expectTypeOf"]);

/** THE ACQUITTING SIDE, READ THROUGH THE SAME CHAIN WALK AS THE ACCUSING ONE (#2353). It used to compare the
 *  callee's TEXT (`name === "expect" || name.startsWith("expect.")`) with whitespace collapsed to survive a
 *  formatter-broken `expect\n  .poll(…)`. Text is not a spelling-independent reader in either direction: once
 *  the declaration side started seeing `test["only"]`, a body whose only assertion was spelled
 *  `expect["poll"](fn)["toBe"](1)` would have been judged assertion-LESS and the stub finding would have been a
 *  false accusation. `callChainRoot` answers the same question structurally, which also makes the whitespace
 *  collapse unnecessary rather than merely unused: a line break is not part of the chain. */
function isAssertionCall(call: CallExpression): boolean {
  const root = callChainRoot(call);
  return root !== undefined && ASSERTION_ROOTS.has(root.getText());
}

function hasCallback(call: CallExpression): boolean {
  return call.getArguments().some((arg) => arg.isKind(SyntaxKind.ArrowFunction) || arg.isKind(SyntaxKind.FunctionExpression));
}

/** A test DECLARATION: the shared test-call shape (#2027 — every modifier chain off the `test`/`it` name,
 *  not a literal text set).
 *  The bare root keeps the legacy verdict unconditionally (`test("x")` with no body still reads as a stub).
 *  Every MODIFIER form must also carry a callback, which is what separates a declaration from the two
 *  callback-less calls with the same shape: Playwright's in-body runner-status guard
 *  `test.skip(condition, reason)`, and the INNER factory call `test.each(table)` whose returned function is
 *  the declaration — without the callback test that inner call would read as a second, assertion-less test. */
function isTestDeclaration(call: CallExpression): boolean {
  if (!isTestCallShape(call)) {
    return false;
  }
  return Node.isIdentifier(call.getExpression()) || hasCallback(call);
}

/** The reported token: the callee spelling when it is a plain dotted chain (`test`, `test.only`), else the
 *  chain's root identifier — a call-returning callee such as `test.each([1, 2])` is not a token, and its
 *  root is the exact authored slice at offset 0. */
function reportedToken(call: CallExpression): string {
  const text = call.getExpression().getText();
  return DOTTED_CALLEE.test(text) ? text : (callChainRoot(call)?.getText() ?? text);
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
            ctx.report.node(testCall.getExpression(), { token: reportedToken(testCall), offset: 0 });
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
    {
      mode: "source",
      files: { "tests/tooling/each.test.ts": 'test.each([1, 2])("stub %i", () => {\n  const x = 1;\n});\n' },
      expect: { count: 1, line: 1, token: "test" },
      why: "THE CALL-RETURNING MODIFIER (#2027): `test.each(table)(name, fn)` declares a test through the function the INNER call returns, so the callee is a call, not a dotted name. The literal `{test, it, test.skip, it.skip}` set never judged it; the shared shape walks through the inner call. `count: 1` is also the inner-call control — the callback-less `test.each([1, 2])` has the same shape and must not read as a second stub — and the token is the chain's root, the exact authored slice at the callee's offset",
    },
    {
      mode: "source",
      files: { "tests/tooling/only.test.ts": 'test.only("stub", () => {\n  const x = 1;\n});\n' },
      expect: { count: 1, token: "test.only" },
      why: "A DOTTED MODIFIER outside the old literal set (#2027): `test.only` is a real test declaration and a stub under it games presence exactly like a bare `test`. A plain dotted callee keeps its whole spelling as the token, as `test.skip` always did",
    },
    {
      mode: "source",
      files: { "tests/tooling/bracket.test.ts": 'test["only"]("stub", () => {\n  const x = 1;\n});\n' },
      expect: { count: 1, line: 1, token: "test" },
      why: 'THE BRACKET SPELLING OF A MODIFIER (#2353): `test["only"]` is an ElementAccessExpression, so a chain walk keyed on `PropertyAccessExpression` alone stopped seeing it and a stub spelled this way was judged by NEITHER test policy — five of this policy\'s own mustFlag fixtures went silent under the mechanical respelling. The member is read through `lib/symbol-reference.ts#readMemberAccess`; the token is the chain ROOT because `test["only"]` is not a plain dotted callee',
    },
    {
      mode: "source",
      files: { "tests/tooling/chained.test.ts": 'test.concurrent.each([1])("stub", () => {\n  const x = 1;\n});\n' },
      expect: { count: 1, token: "test" },
      why: "A TWO-MODIFIER CHAIN through a factory (#2027): the walk passes through `.each(...)` to the root, and a recognizer keyed on the callee's dotted text never reaches this form at all. That admission reads the member DIRECTLY off the root (`concurrent`) rather than the outermost one is pinned by the `test.describe.only` mustPass row, not here — both keyings admit this chain",
    },
    {
      mode: "source",
      files: { "tests/tooling/table.test.ts": 'test.each`a | b`("stub", () => {\n  const x = 1;\n});\n' },
      expect: { count: 1, line: 1, token: "test" },
      why: "THE TAGGED-TEMPLATE TABLE (#2027, verifier LR-1): Vitest's ``test.each`a | b`(name, fn)`` declares through a TaggedTemplateExpression, not a call, so a walk that passed only through calls returned no shape and a stub in this documented form was judged by NEITHER test policy. The token is the chain root, the exact authored slice at the callee's offset",
    },
    {
      mode: "source",
      files: { "tests/tooling/bare.test.ts": 'test("a declaration with no body at all");\n' },
      expect: { count: 1, line: 1, token: "test" },
      why: "THE BARE-ROOT CLAUSE (verifier LR-3): the bare `test(name)` keeps the legacy unconditional verdict — no body means no assertion, so it is a stub — while every MODIFIER form must carry a callback. Require a callback of the bare root too and this row goes green-to-red: the call stops being a declaration and the stub disappears",
    },
    {
      mode: "source",
      files: { "tests/tooling/skip-if.test.ts": 'it.skipIf(false)("stub", () => {\n  const x = 1;\n});\n' },
      expect: { count: 1, token: "it" },
      why: "THE CONDITIONAL FACTORY on the `it` root (#2027): `skipIf(condition)` returns the declaring function, the same call-returning shape as `each`, spelled off the second root the shape admits",
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
      why: "the legacy check's declared limit SURVIVES and its MECHANISM changed (#2353): a formatter-broken `expect\\n  .poll(...)` chain still reads as an assertion, now because the recognizer walks the callee CHAIN to its root identifier rather than collapsing whitespace in the callee's TEXT. A line break was never part of the chain, so the collapse is unnecessary rather than merely unused — and the text comparison it belonged to is exactly what would have mis-judged the bracket row below",
    },
    {
      mode: "source",
      files: { "tests/tooling/bracket-assert.test.ts": 'test("asserts through a bracket-spelled poll", () => {\n  expect["poll"](() => 1)["toBe"](1);\n});\n' },
      why: 'THE ACQUITTING SIDE MOVING WITH THE ACCUSING ONE (#2353). The text recognizer accepted `expect` and anything starting `expect.`, so `expect["poll"](…)["toBe"](1)` matched NEITHER arm: once the declaration side started seeing bracket-spelled modifiers, this real assertion would have read as no assertion at all and the stub finding would have been a false accusation. Revert `isAssertionCall` to the text comparison and this row alone reds',
    },
    {
      mode: "source",
      files: { "tests/tooling/each-asserts.test.ts": 'test.each([1, 2])("asserts %i", (n) => {\n  expect(n).toBeGreaterThan(0);\n});\n' },
      why: "THE CALLBACK CLAUSE on modifier forms (#2027): the inner `test.each([1, 2])` call has the test shape but no callback, so it is the FACTORY, not a declaration — and its range sits OUTSIDE the outer call's callback, so if it counted it would be a stub the outer assertion cannot satisfy. Drop the callback requirement for modifier forms and this asserting suite reds",
    },
    {
      mode: "source",
      files: { "tests/tooling/todo.test.ts": 'test.todo("write the retry case");\ntest("asserts", () => {\n  expect(1).toBe(1);\n});\n' },
      why: "`test.todo(name)` is a placeholder with no body to assert in, not a stub test — the same callback clause, reached through a dotted modifier rather than a factory",
    },
    {
      mode: "source",
      files: {
        "tests/e2e/step.spec.ts":
          'test("clicks through", async () => {\n  await test.step("open the menu", async () => {\n    await open();\n  });\n  expect(1).toBe(1);\n});\n',
      },
      why: "THE MODIFIER FENCE (#2027): `test.step(name, fn)` carries a callback and a `test` root but `step` is not a test modifier, so it is not a nested declaration — its body asserting nothing is legitimate. Admit any member off the root and this row reds on the step",
    },
    {
      mode: "source",
      files: {
        "tests/e2e/suite.spec.ts": 'test.describe.only("a focused suite", () => {\n  test.beforeEach(() => {\n    seed();\n  });\n});\n',
      },
      why: "ADMISSION READS THE MEMBER DIRECTLY OFF THE ROOT (verifier LR-4): Playwright's `test.describe.only(name, fn)` ends in the modifier `only`, but the member read off the root is `describe`, so it is a SUITE, not a test — and a suite whose body only registers a hook asserts nothing legitimately. Key admission on the outermost member instead and `only` admits this call as a declaration with a callback and no `expect` in its range, so this row reds",
    },
  ],
});
