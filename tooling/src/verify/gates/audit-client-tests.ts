// Policy: audit-client-tests (Spine-Testing.md §5) — the structural test anti-patterns grep cannot see, in
// five arms over every `tests/**/*.test.ts(x)`: an assertion-less test callback (directly or through a
// resolved assertion helper), an async test with no await, a bare `expect(x);` with no matcher, an empty
// `describe()` with no nested test, and an empty lifecycle hook. Despite the name the scan is the WHOLE
// central mirror (server/contracts/kit/client/tooling) — "client" is the born-compliant-era trigger it
// waited on, long since met. ACTIVE since 2026-07-17.
//
// FAMILY: SINGLETON under its own id, and the §8.3 sweep is the reason rather than an absence of looking.
// The core literals (`"describe"`, `"beforeEach"`, the test-call shape) reach `bus-payload-allowlist`,
// `knob-wire-coverage` and `ui-primitive-structure`, all of which spell a test name incidentally inside
// their own proof fixtures, and `test-no-stubs`, which is the real neighbour. No `lib/` reader computes a
// test-call shape today, so there is nothing to share and nothing to merge into.
//
// THE `test-no-stubs` OVERLAP, MEASURED IN BOTH DIRECTIONS — deliberately NOT merged (§8.3 asks whether a
// stronger detector already exists; neither of these dominates the other, so merging would lose a catch):
//   · `test-no-stubs` (FINAL, `authority: "hard"`, `population: "@tests"`) enforces this policy's
//     NO-ASSERTION arm with a stronger per-file cross-file-leak reconciliation.
//   · It does NOT resolve assertion HELPERS. `test("x", () => { expectOk(1); })` PASSES here (the helper's
//     body is followed up to four hops) and would FLAG there.
//   · Its recognizer is the literal set `{test, it, test.skip, it.skip}` (`gates/test-no-stubs.ts:26`),
//     while this policy accepts every vitest modifier — `only` / `skip` / `todo` / `concurrent` /
//     `sequential` / `each` / `for` / `fails` / `runIf` / `skipIf`. A `test.each(…)(…)` stub is invisible
//     there and caught here.
// So the right-once answer is to widen `test-no-stubs`' recognizer and retire this arm with a successor
// proof — that module is outside this lane's fence, the fork is reported to the orchestrator, and the
// measurement is recorded here so the next reader sees a DECISION rather than an accident.
//
// POPULATION PORT: legacy `isTestFile` — `filePath.includes("/tests/") && /\.test\.tsx?$/` over
// `ctx.project.getSourceFiles()` — becomes `{ in: ["@tests"], named: ["*.test.ts", "*.test.tsx"] }`.
// Byte-identical, and re-derived rather than assumed: zero tracked `*.test.ts(x)` files live under any
// `/tests/` directory other than the repo-root one (`git ls-files | grep -E '/tests/.*\.test\.tsx?$'`
// returns 0 outside `tests/`), and `.ct.tsx` cannot match `*.test.tsx`, which is the legacy `TEST_FILE_RE`
// exclusion preserved by construction rather than by a second predicate.
//
// AND THE POPULATION IS NOT WIDENED TO ALL OF `tests/**`, WHICH WOULD HAVE BEEN THE NATURAL "drop the
// filename regex" MOVE. Measured before choosing: 70 non-`.test.ts` files under `tests/` carry a top-level
// `test`/`it`/`describe`/hook call — 33 `.test-d.ts` type suites and 30 `.spec.ts` e2e suites. A
// `.test-d.ts` asserts with `expectTypeOf`, which the matcher-chain reader does not count and whose
// declaration has no body to follow, so widening would have flagged NO-ASSERTION on essentially every type
// suite in the repo. The filename IS the population here, not a shortcut for one.
//
// `execution: "selected-files"`, and that is a CONSEQUENCE of the declared limit below rather than a
// default. Every one of the five verdicts is decided entirely inside ONE file — the test call, its
// callback, its assertions, its awaits, its nested tests and its resolvable helpers — so a narrowed request
// composes exactly. This lane's first draft declared `entire-population` on the belief that a helper could
// be followed into another file; that belief is false (see below), so the declaration would have been an
// over-declared contract teaching the next lane to over-declare (§5b.1).
//
// NO BOUNDED-SUBTREE WALK. The legacy shape called `forEachDescendant` and `getDescendantsOfKind` on the
// delivered nodes — private descendant walks the final query boundary forbids even scoped to one node. The
// final shape subscribes to the kinds it needs on the ONE shared walk, indexes each PER FILE, and
// `evaluate` reconciles by node-RANGE containment against only that node's own file's index. Per-file
// indexing is load-bearing for the same reason it is in `test-no-stubs`: two SourceFiles' local offsets
// numerically overlap, so a shared list would let file B's `expect` satisfy file A's stub.
//
// DECLARED LIMIT, CARRIED FROM LEGACY AND MEASURED RATHER THAN ASSUMED: helper resolution is SAME-FILE
// ONLY. `resolveCalleeBody` asks the callee identifier for its symbol's declarations, and for an IMPORTED
// helper those are the `ImportSpecifier` — a declaration with no body — so no cross-file helper has ever
// been followed, by this implementation or the legacy one (neither calls `getAliasedSymbol`). This lane's
// first draft shipped an out-of-population REFUSAL arm on the assumption that cross-file resolution worked
// and only the INDEX was missing; running the probe (§4.5b: run it, do not read the header) showed the
// branch is unreachable — the import never yields a body, so the recursion never leaves the test's own
// file. The arm is DELETED rather than documented, and `assertsWithin` now takes ONE file index by
// construction, which makes the limit a property of the code's shape instead of a paragraph. mustFlag[7]
// pins it: a test whose only assertion is in an IMPORTED helper is reported. Measured on the real corpus
// at conversion: zero such tests exist, so the limit costs nothing today (the §4.6 differential is 0/0).
//
// POSITIONS — the legacy tokens were SYNTHETIC LABELS (`no-assertion`, `async-no-await`, `bare-expect`,
// `no-nested-test`, `beforeEach-empty-body`) passed at `offset: 0`. Under the final contract `report.node`
// VALIDATES the token against the node text at its declared offset and would have THROWN on every one of
// them, and `locateFinding` could not have bound a waiver to any of them either: the policy carried
// `authority: "ordinary"` with no working door at all (§3). Every arm is RE-ANCHORED on authored text, and
// the five positions are pairwise distinct so two arms firing on ONE test call remain separately waivable:
//   no-assertion     → the test callee            position `test` / `it`
//   async-no-await   → the callback's `async`     position `async`
//   bare-expect      → the statement              position `expect`
//   empty-describe   → the describe callee        position `describe`
//   empty-hook       → the hook callee            position `beforeEach` / `afterEach` / …
// Each arm also carries its OWN message, so a `messageIncludes` row can discriminate which rule fired —
// the static five-rule message the legacy descriptor carried could not.
//
// MARKER CENSUS: the legacy descriptor carried no private escape grammar, and the tree carries zero
// `@orb-gate-ignore audit-client-tests` markers (re-derived at conversion). legacy 0 = current 0; the door
// is now the central `@orb-waive audit-client-tests(<position>)`.
//
// §4.6 DIFFERENTIAL: the pre-conversion descriptor at `86ce80b6c` replayed through the legacy dispatcher
// against the final policy, both over the real `tests/**` corpus AND fixture-level over every legacy
// example. The result is in the landing commit message.
import type { ArrowFunction, CallExpression, FunctionExpression, Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";

const MAX_HELPER_DEPTH = 4;
const ASSERTION_HELPER_RE = /^(?:expect|assert)[A-Z0-9]/u;
const EXPECT = "expect";
const ASYNC = "async";

// Excludes `extend` (test.extend defines a fixture) so a local `it` (async-iterator pattern) isn't mistaken for a test.
const TEST_MODIFIERS: ReadonlySet<string> = new Set(["only", "skip", "todo", "concurrent", "sequential", "each", "for", "fails", "runIf", "skipIf"]);
const LIFECYCLE_HOOKS: ReadonlySet<string> = new Set(["beforeEach", "afterEach", "beforeAll", "afterAll"]);

const MESSAGE =
  "a test file carries a structural anti-pattern — a test callback with no `expect(...).<matcher>()`, an async test with no await, a bare `expect(x);`, an empty describe() with no nested test, or an empty lifecycle hook (Spine-Testing.md §5).";
const NO_ASSERTION =
  'this test callback contains no `expect(...).<matcher>()` — directly or through a resolved `expect*`/`assert*` helper. A "does not throw" body is not a test (Spine-Testing.md §5).';
const ASYNC_NO_AWAIT =
  "this test callback is `async` and contains no `await` — drop the `async` keyword or await the work it was added for, because an unawaited promise finishes after the test does (Spine-Testing.md §5).";
const BARE_EXPECT = "a bare `expect(x);` statement with no matcher chain asserts NOTHING — complete it with a matcher (Spine-Testing.md §5).";
const EMPTY_DESCRIBE = "this `describe()` block contains no nested `test()`/`it()` — delete it or give it the tests it was opened for (Spine-Testing.md §5).";
const EMPTY_HOOK = "this lifecycle hook has an empty body and runs for every test in its scope for no effect — delete it (Spine-Testing.md §5).";

const FIX =
  "add a matcher-chained expect (or await), delete the empty describe/hook, and complete any bare `expect(x)` with a matcher (Spine-Testing.md §5). A deliberate occurrence waives with `@orb-waive audit-client-tests(<position>): <reason + end condition>`, where the position is the reported AUTHORED token: the test callee (`test`/`it`) for the no-assertion arm, the literal keyword `async` for the async-no-await arm, `expect` for a bare expect, `describe` for an empty suite, and the hook's own name for an empty hook.";

interface CallShape {
  readonly root: string;
  readonly prop: string | undefined;
}

function walkCallRoot(expr: MorphNode, prop: string | undefined): CallShape | undefined {
  if (Node.isIdentifier(expr)) {
    return { root: expr.getText(), prop };
  }
  if (Node.isPropertyAccessExpression(expr)) {
    return walkCallRoot(expr.getExpression(), expr.getName());
  }
  return Node.isCallExpression(expr) ? walkCallRoot(expr.getExpression(), prop) : undefined;
}

function testCallShape(call: CallExpression): CallShape | undefined {
  return walkCallRoot(call.getExpression(), undefined);
}

function isTestCall(call: CallExpression): boolean {
  const shape = testCallShape(call);
  if (shape === undefined || (shape.root !== "test" && shape.root !== "it")) {
    return false;
  }
  return shape.prop === undefined || TEST_MODIFIERS.has(shape.prop);
}

function isDescribeCall(call: CallExpression): boolean {
  return testCallShape(call)?.root === "describe";
}

/** The plain callee NAME of a call — `beforeEach` for `beforeEach(…)`, `poll` for `expect.poll(…)`. */
function calleeName(call: CallExpression): string | undefined {
  const expr = call.getExpression();
  if (Node.isIdentifier(expr)) {
    return expr.getText();
  }
  return Node.isPropertyAccessExpression(expr) ? expr.getName() : undefined;
}

function calleeNameNode(call: CallExpression): MorphNode {
  const expr = call.getExpression();
  return Node.isPropertyAccessExpression(expr) ? expr.getNameNode() : expr;
}

function callbackFromCall(call: CallExpression): ArrowFunction | FunctionExpression | undefined {
  return call.getArguments().find((a): a is ArrowFunction | FunctionExpression => Node.isArrowFunction(a) || Node.isFunctionExpression(a));
}

/** Does this expression chain bottom out in the bare `expect` identifier or an `expect(...)` call? */
function walksToExpectCall(cursor: MorphNode | undefined): boolean {
  if (cursor === undefined) {
    return false;
  }
  if (Node.isCallExpression(cursor)) {
    const inner = cursor.getExpression();
    return (Node.isIdentifier(inner) && inner.getText() === EXPECT) || walksToExpectCall(inner);
  }
  if (Node.isPropertyAccessExpression(cursor)) {
    const lhs = cursor.getExpression();
    return (Node.isIdentifier(lhs) && lhs.getText() === EXPECT) || walksToExpectCall(lhs);
  }
  return false;
}

/** A MATCHER-chained expect: a call whose callee is a property access reaching `expect`. */
function isMatcherChainedExpect(call: CallExpression): boolean {
  const expr = call.getExpression();
  return Node.isPropertyAccessExpression(expr) && walksToExpectCall(expr.getExpression());
}

/** A BARE `expect(x);` expression statement — the incomplete assertion. */
function isBareExpectStatement(statement: MorphNode): boolean {
  if (!Node.isExpressionStatement(statement)) {
    return false;
  }
  const inner = statement.getExpression();
  if (!Node.isCallExpression(inner)) {
    return false;
  }
  const callee = inner.getExpression();
  return Node.isIdentifier(callee) && callee.getText() === EXPECT;
}

function bodyOfFunctionLike(node: MorphNode | undefined): MorphNode | undefined {
  if (node === undefined) {
    return;
  }
  return Node.isArrowFunction(node) || Node.isFunctionExpression(node) ? node.getBody() : undefined;
}

function bodyFromDeclaration(decl: MorphNode): MorphNode | undefined {
  if (Node.isFunctionDeclaration(decl) || Node.isFunctionExpression(decl) || Node.isArrowFunction(decl)) {
    return decl.getBody();
  }
  return Node.isVariableDeclaration(decl) ? bodyOfFunctionLike(decl.getInitializer()) : undefined;
}

/** The body of the function an `expect*`/`assert*` helper call resolves to, or undefined. */
function resolveCalleeBody(call: CallExpression): MorphNode | undefined {
  const symbol = calleeNameNode(call).getSymbol();
  if (symbol === undefined) {
    return;
  }
  return symbol
    .getDeclarations()
    .map((declaration) => bodyFromDeclaration(declaration))
    .find((body) => body !== undefined);
}

/** One file's indexed evidence. Every list holds nodes the SHARED walk delivered for THAT file. */
interface FileIndex {
  readonly matcherExpects: CallExpression[];
  readonly helperCalls: CallExpression[];
  readonly awaits: MorphNode[];
  readonly testCalls: CallExpression[];
  readonly bareExpects: MorphNode[];
}

function emptyIndex(): FileIndex {
  return { matcherExpects: [], helperCalls: [], awaits: [], testCalls: [], bareExpects: [] };
}

interface PassState {
  readonly byFile: Map<object, FileIndex>;
  readonly testCalls: CallExpression[];
  readonly describeCalls: CallExpression[];
  readonly hookCalls: CallExpression[];
}

function indexOf(state: PassState, sourceFile: SourceFile): FileIndex {
  const key = sourceFile.compilerNode;
  const existing = state.byFile.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const fresh = emptyIndex();
  state.byFile.set(key, fresh);
  return fresh;
}

function within(node: MorphNode, start: number, end: number): boolean {
  return node.getStart() >= start && node.getEnd() <= end;
}

/** Does `node` contain a matcher-chained expect, directly or through a resolved assertion helper up to
 *  `MAX_HELPER_DEPTH` hops? ONE file index, not a lookup per hop, and that is the DECLARED LIMIT made
 *  structural: `resolveCalleeBody` only ever yields a body declared in the same file (an IMPORTED helper's
 *  symbol declares an `ImportSpecifier`, which has none), so the recursion cannot leave this file. */
function assertsWithin(index: FileIndex, node: MorphNode, seen: Set<MorphNode>, depth: number): boolean {
  if (depth > MAX_HELPER_DEPTH || seen.has(node)) {
    return false;
  }
  seen.add(node);
  const start = node.getStart();
  const end = node.getEnd();
  if (index.matcherExpects.some((call) => within(call, start, end))) {
    return true;
  }
  return index.helperCalls.some((call) => {
    if (!within(call, start, end)) {
      return false;
    }
    const body = resolveCalleeBody(call);
    return body !== undefined && body.getSourceFile() === node.getSourceFile() && assertsWithin(index, body, seen, depth + 1);
  });
}

function auditTestCall(ctx: GatePolicyContext, state: PassState, call: CallExpression): void {
  const callback = callbackFromCall(call);
  if (callback === undefined) {
    return;
  }
  const index = state.byFile.get(call.getSourceFile().compilerNode) ?? emptyIndex();
  if (!assertsWithin(index, callback, new Set<MorphNode>(), 0)) {
    const callee = calleeNameNode(call);
    ctx.report.node(callee, { token: callee.getText(), offset: 0, message: NO_ASSERTION, fix: FIX });
  }
  if (!callback.isAsync()) {
    return;
  }
  const start = callback.getStart();
  const end = callback.getEnd();
  if (!index.awaits.some((node) => within(node, start, end))) {
    ctx.report.node(callback, { token: ASYNC, offset: 0, message: ASYNC_NO_AWAIT, fix: FIX });
  }
}

function auditDescribeCall(ctx: GatePolicyContext, state: PassState, call: CallExpression): void {
  const callback = callbackFromCall(call);
  if (callback === undefined) {
    return;
  }
  const index = state.byFile.get(call.getSourceFile().compilerNode) ?? emptyIndex();
  const start = callback.getStart();
  const end = callback.getEnd();
  if (!index.testCalls.some((nested) => within(nested, start, end))) {
    const callee = calleeNameNode(call);
    ctx.report.node(callee, { token: callee.getText(), offset: 0, message: EMPTY_DESCRIBE, fix: FIX });
  }
}

function auditHookCall(ctx: GatePolicyContext, call: CallExpression): void {
  const body = callbackFromCall(call)?.getBody();
  if (body === undefined || !Node.isBlock(body) || body.getStatements().length > 0) {
    return;
  }
  const callee = calleeNameNode(call);
  ctx.report.node(callee, { token: callee.getText(), offset: 0, message: EMPTY_HOOK, fix: FIX });
}

export const gate = defineGate({
  id: "audit-client-tests",
  family: "audit-client-tests",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@tests"], named: ["*.test.ts", "*.test.tsx"] },
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const state: PassState = {
      byFile: new Map<object, FileIndex>(),
      testCalls: [],
      describeCalls: [],
      hookCalls: [],
    };
    return {
      // Every admitted file gets an index even when it holds none of the indexed kinds, so a file with a
      // test call and no assertion call at all still reconciles against an empty list rather than a
      // missing one.
      visitFile: (sourceFile): void => {
        indexOf(state, sourceFile);
      },
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile): void => {
            if (!Node.isCallExpression(node)) {
              return;
            }
            const index = indexOf(state, sourceFile);
            if (isMatcherChainedExpect(node)) {
              index.matcherExpects.push(node);
            }
            const name = calleeName(node);
            if (name !== undefined && ASSERTION_HELPER_RE.test(name)) {
              index.helperCalls.push(node);
            }
            if (isDescribeCall(node)) {
              state.describeCalls.push(node);
              return;
            }
            if (name !== undefined && LIFECYCLE_HOOKS.has(name)) {
              state.hookCalls.push(node);
              return;
            }
            if (isTestCall(node)) {
              index.testCalls.push(node);
              state.testCalls.push(node);
            }
          },
        },
        {
          kinds: [SyntaxKind.AwaitExpression],
          visit: (node, sourceFile): void => {
            indexOf(state, sourceFile).awaits.push(node);
          },
        },
        {
          // A `for await (…)` loop awaits per-iteration through the ForOfStatement's own flag, never an
          // AwaitExpression node — the live-verified false positive this arm fixes.
          kinds: [SyntaxKind.ForOfStatement],
          visit: (node, sourceFile): void => {
            if (Node.isForOfStatement(node) && node.isAwaited()) {
              indexOf(state, sourceFile).awaits.push(node);
            }
          },
        },
        {
          kinds: [SyntaxKind.ExpressionStatement],
          visit: (node, sourceFile): void => {
            if (isBareExpectStatement(node)) {
              indexOf(state, sourceFile).bareExpects.push(node);
            }
          },
        },
      ],
      evaluate: (): void => {
        for (const call of state.describeCalls) {
          auditDescribeCall(ctx, state, call);
        }
        for (const call of state.hookCalls) {
          auditHookCall(ctx, call);
        }
        for (const call of state.testCalls) {
          auditTestCall(ctx, state, call);
        }
        for (const index of state.byFile.values()) {
          for (const statement of index.bareExpects) {
            ctx.report.node(statement, { token: EXPECT, offset: 0, message: BARE_EXPECT, fix: FIX });
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: { "tests/tooling/x.test.ts": 'test("does nothing", () => {\n  const x = 1;\n  void x;\n});\n' },
      expect: { count: 1, token: "test", messageIncludes: "no `expect(...).<matcher>()`" },
      why: 'RULE 1 — a test callback with no expect(...).<matcher>(). Pure "doesn\'t throw" is not a test (§5). The position is the test CALLEE, authored text at its own offset; the legacy synthetic label `no-assertion` was not, and would have thrown under `report.node`',
    },
    {
      mode: "types",
      files: { "tests/tooling/async.test.ts": 'test("async no await", async () => {\n  expect(1).toBe(1);\n});\n' },
      expect: { count: 1, token: ASYNC, messageIncludes: "is `async` and contains no `await`" },
      why: "RULE 2 — an async callback with no AwaitExpression. The fixture ASSERTS, so rule 1 is silent and the count of 1 pins that this arm alone fired; the position is the callback's own `async` keyword, which is what keeps it separately waivable from rule 1 firing on the same test call",
    },
    {
      mode: "types",
      files: { "tests/tooling/bare.test.ts": 'test("bare", () => {\n  expect(1);\n});\n' },
      expect: { count: 2, messageIncludes: "asserts NOTHING" },
      why: "RULE 3 — a bare expect(x) statement with no matcher chain. It produces TWO findings and that is correct and was true of the legacy gate too: the bare statement is not a matcher-chained expect, so the enclosing test also has no assertion. The `messageIncludes` is what pins that this arm is one of them",
    },
    {
      mode: "types",
      files: { "tests/tooling/empty-describe.test.ts": 'describe("a suite", () => {\n  const x = 1;\n  void x;\n});\n' },
      expect: { count: 1, token: "describe", messageIncludes: "no nested `test()`/`it()`" },
      why: "RULE 4 — a describe() block with no nested test()/it() descendant. The nested-test index is per FILE and selected by node range, so a `test()` in a sibling file cannot satisfy this suite",
    },
    {
      mode: "types",
      files: { "tests/tooling/empty-hook.test.ts": "beforeEach(() => {});\n" },
      expect: { count: 1, token: "beforeEach", messageIncludes: "empty body" },
      why: "RULE 5 — an empty lifecycle hook body. The position is the hook's OWN name, so `beforeEach` and `afterEach` in one file are separately waivable",
    },
    {
      mode: "types",
      files: { "tests/server/domain/x.int.test.ts": 'test("int no assert", async () => {\n  await Promise.resolve();\n});\n' },
      expect: { count: 1, token: "test", messageIncludes: "no `expect(...).<matcher>()`" },
      why: "POPULATION: `.int.test.ts` still ends in the `*.test.ts` suffix, so the integration mirror is audited exactly as the unit mirror is. The fixture awaits, so rule 2 is silent and the single finding is rule 1",
    },
    {
      mode: "types",
      files: {
        "tests/tooling/cross-file-a.test.ts":
          'test("empty", () => {\n  const x = 1;\n  const y = 2;\n  const z = 3;\n  const w = 4;\n  void [x, y, z, w];\n});\n',
        "tests/tooling/cross-file-b.test.ts": "expect(1).toBe(1);\n",
      },
      expect: { count: 1, line: 1, token: "test" },
      why: "CROSS-FILE LEAK CONTROL, and it is an INVENTED row with a planted-break receipt in the report: file b's matcher-chained expect must not satisfy file a's stub. Its node range is chosen so its NUMERIC offsets fall INSIDE file a's test-call range, which is the only shape that discriminates — reconcile off one shared list instead of the per-file index and this row reads `count: 0`. File b contributes no test declaration, so one finding is the whole expected set",
    },
    {
      mode: "types",
      files: {
        "tests/support/imported-helper.ts": "export function expectOk(x: number): void {\n  expect(x).toBeGreaterThan(0);\n}\n",
        "tests/tooling/imported-helper.test.ts":
          'import { expectOk } from "../support/imported-helper.ts";\ntest("asserts through an IMPORTED helper", () => {\n  expectOk(1);\n});\n',
      },
      expect: { count: 1, line: 2, token: "test", messageIncludes: "no `expect(...).<matcher>()`" },
      why: "THE DECLARED LIMIT, PINNED — helper resolution is SAME-FILE only, so a test whose only assertion lives in an IMPORTED helper is reported. It is an INVENTED row with a planted-break receipt, and it exists because the limit was MEASURED rather than assumed: an imported identifier's symbol declares an `ImportSpecifier`, which has no body, so `resolveCalleeBody` returns undefined here and returned undefined in the legacy gate too (neither calls `getAliasedSymbol`). The lane's first draft shipped an out-of-population REFUSAL on the opposite belief and the probe showed that branch unreachable. Add the alias hop and this row goes green — which is exactly the successor proof a future widening owes",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: { "tests/tooling/ok.test.ts": 'test("asserts", () => {\n  expect(1).toBe(1);\n});\n' },
      why: "RULE 1's happy path — a test with a matcher-chained expect",
    },
    {
      mode: "types",
      files: {
        "tests/tooling/helper.test.ts":
          'function expectOk(x: number): void {\n  expect(x).toBeGreaterThan(0);\n}\ntest("asserts via a helper", () => {\n  expectOk(1);\n});\n',
      },
      why: "RULE 1's helper hop — the assertion lives inside a resolved `expect*` helper and is followed transitively. This is the arm `test-no-stubs` does not have, and the measured reason the two policies are not merged (see the header)",
    },
    {
      mode: "types",
      files: { "tests/tooling/poll.test.ts": 'test("polls", async () => {\n  await expect.poll(() => 1).toBe(1);\n});\n' },
      why: "RULE 1 — `expect.poll(...)` is a matcher chain through the bare `expect` identifier target, and the row doubles as rule 2's await control",
    },
    {
      mode: "types",
      files: { "tests/tooling/sync.test.ts": 'test("sync", () => {\n  expect(1).toBe(1);\n});\n' },
      why: "RULE 2 — a sync callback (no `async` keyword) is not required to await. Delete the `isAsync()` fence and this row reds",
    },
    {
      mode: "types",
      files: { "tests/tooling/awaited.test.ts": 'test("async with await", async () => {\n  await Promise.resolve();\n  expect(1).toBe(1);\n});\n' },
      why: "RULE 2 — an async callback that awaits passes",
    },
    {
      mode: "types",
      files: {
        "tests/tooling/for-await.test.ts":
          'test("drains an async iterable", async () => {\n' +
          "  const out: number[] = [];\n" +
          "  for await (const x of gen()) {\n" +
          "    out.push(x);\n" +
          "  }\n" +
          "  expect(out).toEqual([1]);\n" +
          "});\n",
      },
      why: "RULE 2's live-verified false positive: `for await (…)` awaits per-iteration through the ForOfStatement's own flag and emits NO AwaitExpression node. Drop the ForOfStatement visitor and this row alone reds",
    },
    {
      mode: "types",
      files: {
        "tests/tooling/anchor.test.ts": 'test("anchor", () => {\n  expect(1).toBe(1);\n});\n',
        "tests/support/helper.ts": 'test("a non-test file under tests/", () => {\n  const x = 1;\n  void x;\n});\n',
      },
      why: "THE POPULATION FENCE, half one: a NON-`*.test.ts` file under `tests/` is not audited, even when it carries a stub test call. Drop `named:` and this row reds — and that is not hypothetical, it is the widening this conversion deliberately refused: 33 `.test-d.ts` type suites assert with `expectTypeOf`, which is not a matcher chain, so the unfenced population would have accused essentially every type suite in the repo. The in-population anchor file is required because a fixture admitting ZERO paths raises a population TOOL ERROR instead of proving a fence",
    },
    {
      mode: "types",
      files: {
        "tests/tooling/ct-anchor.test.ts": 'test("anchor", () => {\n  expect(1).toBe(1);\n});\n',
        "tests/ui/button.ct.tsx": 'test("mounts", () => {\n  const x = 1;\n  void x;\n});\n',
      },
      why: "THE POPULATION FENCE, half two: `.ct.tsx` (the Playwright CT lane, audited by its own policies) cannot match `*.test.tsx`, so the legacy `TEST_FILE_RE` exclusion survives by construction rather than as a second predicate. Widen `named` to `*.tsx` and this row reds",
    },
    {
      mode: "types",
      files: {
        "tests/tooling/waived.test.ts":
          '// @orb-waive audit-client-tests(test): the proof\'s stand-in reason; ends when this fixture stops flagging.\ntest("does nothing", () => {\n  const x = 1;\n  void x;\n});\n',
      },
      why: "POSITIONAL IDENTITY: the no-assertion arm reports the test CALLEE, so an author waives `test` — authored code that survives `locateFinding`'s comment blanking, which the legacy synthetic `no-assertion` label never was (that ordinary authority had no working door at all). The fixture produces exactly ONE finding for the one marker to consume",
    },
  ],
});
