// Policy: audit-client-tests (Spine-Testing.md §5) — the structural test anti-patterns grep cannot see, in
// five arms over every `tests/**/*.test.ts(x)`: an assertion-less test callback (directly or through a
// resolved assertion helper), an async test with no await, a bare `expect(x);` with no matcher, an empty
// `describe()` with no nested test, and an empty lifecycle hook. Despite the name the scan is the WHOLE
// central mirror (server/contracts/kit/client/tooling) — "client" is the born-compliant-era trigger it
// waited on, long since met. ACTIVE since 2026-07-17.
//
// FAMILY `test-no-stubs` (#2027). The test-call SHAPE is read through `lib/test-call-shape.ts`
// (`isTestCallShape`, `callChainRoot`), the one home of the modifier vocabulary — shared with `test-no-stubs`,
// whose recognizer used to be a literal text set and now asks the same reader, so the two policies judge one
// subject from one declaration. Before #2027 this module was a SINGLETON because no `lib/` reader computed
// the shape; the other spellers of the core literals (`bus-payload-allowlist`, `knob-wire-coverage`,
// `ui-primitive-structure`) still only name a test incidentally inside their own proof fixtures.
//
// THE `test-no-stubs` OVERLAP — deliberately NOT merged (§8.3 asks whether a stronger detector already
// exists; neither of these dominates the other, so merging would lose a catch):
//   · `test-no-stubs` (FINAL, `authority: "hard"`, `population: "@tests"`) enforces this policy's
//     NO-ASSERTION arm with a stronger per-file cross-file-leak reconciliation, over EVERY test-shaped call
//     this policy also recognizes; the modifier asymmetry recorded here before #2027 (its literal
//     `{test, it, test.skip, it.skip}` set) is closed.
//   · It does NOT resolve assertion HELPERS. `test("x", () => { expectOk(1); })` PASSES here (the helper's
//     body is followed up to four hops) and FLAGS there, and its population also admits the `.test-d.ts` /
//     `.spec.ts` suites this one fences out. That helper hop is the catch a merge would lose, so this arm is
//     NOT redundant with `test-no-stubs` and must not be retired as if it were.
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
// composes exactly. The conversion's first draft declared `entire-population` on the belief that a helper
// could be followed into another file, which the reader of the day could not do; the shared reader CAN,
// and `selected-files` survives only because the policy now FENCES on the call's own file (below). The
// two are one decision: widen the fence and this declaration is wrong (§5b.1).
//
// NO BOUNDED-SUBTREE WALK. The legacy shape called `forEachDescendant` and `getDescendantsOfKind` on the
// delivered nodes — private descendant walks the final query boundary forbids even scoped to one node. The
// final shape subscribes to the kinds it needs on the ONE shared walk, indexes each PER FILE, and
// `evaluate` reconciles by node-RANGE containment against only that node's own file's index. Per-file
// indexing is load-bearing for the same reason it is in `test-no-stubs`: two SourceFiles' local offsets
// numerically overlap, so a shared list would let file B's `expect` satisfy file A's stub.
//
// DECLARED LIMIT: helper resolution is SAME-FILE ONLY — and since #2163 it is a FENCE, not a reader
// weakness. THE HISTORY MATTERS, and it is not one story for every import spelling: the legacy gate and
// the first converted shape both asked the callee for its symbol's declarations. For a NAMED import
// (`import { expectOk }`) those are the `ImportSpecifier`, a declaration with no body, so that helper was
// not followed. For a NAMESPACE-qualified call (`import * as h` … `h.expectOk(1)`) the member symbol's
// declaration IS the other file's `FunctionDeclaration` — the legacy gate FOLLOWED it (#2036, measured),
// which refuted the conversion's claim that no cross-file body was reachable. So the fence is a §4.6
// NARROWING against legacy for the namespace spelling, not a restatement of what legacy did. (The first
// draft's out-of-population REFUSAL arm was deleted on that same unverified reachability claim.)
//
// #2097's owner ruling moved binding/origin resolution to shared readers; the migration lane for #2163
// (`ddf1adf53`) replaced the chain with `resolveCallableDeclaration`, which follows a named import, an
// import rename, a re-export rename and a namespace member to the declaring file, and that LANE kept the
// same-file limit as an explicit fence. No ruling decides the fence itself: #2036's arm 1 (drop the fence
// and restore following) versus arm 2 (keep it as a declared narrowing) is UNADJUDICATED, and this module
// carries arm 2's shape until it is. The fence lives in exactly one place — `resolveCalleeBody`'s
// source-file test — for the reason that lane gave: a cross-file body would make this verdict depend on a
// file a `selected-files` request need not contain, so `--changed` and the whole run would disagree.
// AND THE FENCE OWES A ROW THAT DIES WITHOUT IT (§4.1) — which `mustFlag[7]` is NOT, measured rather
// than assumed. Cutting the source-file test with only `mustFlag[7]` present reads CLEAN, because that
// fixture's test file carries no matcher expect for the followed body's OFFSET RANGE to capture: an
// unenforced FIXTURE, not an unenforced fence. `mustFlag[8]` is the constructed falsifier — a support
// helper whose body spans offsets 42-243 beside a test file whose own `expect(1).toBe(1)` spans 173-190,
// so an unfenced cross-file body satisfies a stub that asserts nothing. Cut receipts: fence removed →
// `mustFlag[7]` green, `mustFlag[8]` RED; restored → both green. `mustFlag[9]` is the same falsifier through
// the namespace spelling (#2036) and reds under the same cut. Measured on the real corpus at
// conversion: zero tests assert only through an imported helper, so the limit still costs nothing today
// (the §4.6 differential is 0/0).
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
import { resolveCallableDeclaration } from "../../_shared/reference-fact-call.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import { readMemberAccess } from "../lib/symbol-reference.ts";
import { callChainRoot, isTestCallShape } from "../lib/test-call-shape.ts";

const MAX_HELPER_DEPTH = 4;
const ASSERTION_HELPER_RE = /^(?:expect|assert)[A-Z0-9]/u;
const EXPECT = "expect";
const ASYNC = "async";

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

function isDescribeCall(call: CallExpression): boolean {
  return callChainRoot(call)?.getText() === "describe";
}

/** The plain callee NAME of a call — `beforeEach` for `beforeEach(…)`, `poll` for `expect.poll(…)` and for
 *  `expect["poll"](…)`, because the member is read through the shared spelling-independent reader. */
function calleeName(call: CallExpression): string | undefined {
  const expr = call.getExpression();
  return Node.isIdentifier(expr) ? expr.getText() : readMemberAccess(expr)?.name;
}

/** The authored name the report anchors on: the MEMBER the chain is actually called through (`each` for
 *  every `test.each…` form), or the callee itself when there is no member.
 *
 *  IT WALKS THE CHAIN because every non-trivial callee here is a compound node whose TEXT the waiver sink
 *  refuses, and a refused token withholds the WHOLE policy rather than losing one finding:
 *   · a TAGGED TABLE (a Vitest `each` table template) anchored on the whole template puts the table's
 *     newlines in the token (verifier RV-1, already fixed);
 *   · a CALL-RETURNING FACTORY (`test.each([1])(name, fn)`) anchored on the whole callee reports the token
 *     `test.each([1])`, which the sink refuses the same way — measured 2026-09-13 and recorded in
 *     `test-no-stubs.ts` (the FAMILY sibling that shares this shape reader): *"for a call-returning stub it
 *     reports the token `test.each([1])`, which the waiver sink refuses, so that policy WITHHOLDS"*. A
 *     withheld owner is not a verdict, so the factory form was UNJUDGED here even though `isTestCallShape`
 *     recognised it (#2454). Walking through the inner call lands on the same `each` the tagged form uses. */
function calleeNameNode(call: CallExpression): MorphNode {
  return anchorOfCallee(call.getExpression());
}

function anchorOfCallee(expr: MorphNode): MorphNode {
  if (Node.isTaggedTemplateExpression(expr)) {
    return anchorOfCallee(expr.getTag());
  }
  if (Node.isCallExpression(expr)) {
    return anchorOfCallee(expr.getExpression());
  }
  return Node.isPropertyAccessExpression(expr) ? expr.getNameNode() : expr;
}

function callbackFromCall(call: CallExpression): ArrowFunction | FunctionExpression | undefined {
  return call.getArguments().find((a): a is ArrowFunction | FunctionExpression => Node.isArrowFunction(a) || Node.isFunctionExpression(a));
}

/** Does this expression chain bottom out in the bare `expect` identifier or an `expect(...)` call? Member
 *  hops are read through `lib/symbol-reference.ts#readMemberAccess`, so `expect(x)["toBe"]` reaches `expect`
 *  exactly as `expect(x).toBe` does — THE ACQUITTING SIDE MOVING WITH THE ACCUSING ONE (#2353): a
 *  bracket-spelled matcher chain that stopped reaching `expect` here would turn a real assertion into a
 *  no-assertion finding. */
function walksToExpectCall(cursor: MorphNode | undefined): boolean {
  if (cursor === undefined) {
    return false;
  }
  if (Node.isCallExpression(cursor)) {
    const inner = cursor.getExpression();
    return (Node.isIdentifier(inner) && inner.getText() === EXPECT) || walksToExpectCall(inner);
  }
  const read = readMemberAccess(cursor);
  if (read === undefined) {
    return false;
  }
  return (Node.isIdentifier(read.receiver) && read.receiver.getText() === EXPECT) || walksToExpectCall(read.receiver);
}

/** A MATCHER-chained expect: a call whose callee is a member read (however spelled) reaching `expect`. */
function isMatcherChainedExpect(call: CallExpression): boolean {
  const read = readMemberAccess(call.getExpression());
  return read !== undefined && walksToExpectCall(read.receiver);
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

/** The body of the function an `expect*`/`assert*` helper call resolves to, or undefined.
 *
 *  THE DECLARED LIMIT LIVES HERE, AND IT IS NOW A FENCE RATHER THAN A READER WEAKNESS. The shared
 *  callable reader DOES follow an imported helper to its declaring file; this policy deliberately does
 *  not, because following one would make the verdict depend on a file the `selected-files` request need
 *  not contain — a scope-shaped false negative under `--changed`. So the resolution is shared and the
 *  SAME-FILE restriction is this policy's own, stated once, in one place, and killed by `mustFlag[7]`. */
function resolveCalleeBody(call: CallExpression): MorphNode | undefined {
  const callable = resolveCallableDeclaration(call);
  return callable.kind === "resolved" && callable.value.sourceFile === call.getSourceFile() ? callable.value.body : undefined;
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
 *  `MAX_HELPER_DEPTH` hops? ONE file index, not a lookup per hop, and the recursion cannot leave this
 *  file because `resolveCalleeBody` fences on the call's own source file — the single home of the
 *  declared same-file limit, so cutting it changes the verdict rather than nothing (mustFlag[7]). */
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
    return body !== undefined && assertsWithin(index, body, seen, depth + 1);
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
  family: "test-no-stubs",
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
            if (isTestCallShape(node)) {
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
      why: "THE DECLARED LIMIT, PINNED — helper resolution is SAME-FILE only, so a test whose only assertion lives in an IMPORTED helper is reported. It is an INVENTED row with a planted-break receipt, and since #2163 it is a REAL narrowing pin rather than a record of a reader's weakness: the shared `resolveCallableDeclaration` follows the import to `../support/imported-helper.ts` and returns that body, and the ONE thing that keeps this row at one finding is `resolveCalleeBody`'s source-file fence. Cut the fence and this row reads `count: 0` — which is the successor proof a future widening owes, and which the pre-migration symbol chain could not have produced at all",
    },
    {
      mode: "types",
      files: {
        "tests/support/wide-helper.ts":
          "export function expectOk(x: number): void {\n" +
          "  // Padding. This body's OFFSET RANGE has to CONTAIN the matcher expect in the test file below,\n" +
          "  // or the collision this row exists to prove is not reachable and the row is decoration.\n" +
          "  void x;\n" +
          "}\n",
        "tests/tooling/wide-helper.test.ts":
          'import { expectOk } from "../support/wide-helper.ts";\n' +
          'test("asserts only through the imported helper", () => {\n' +
          "  expectOk(1);\n" +
          "});\n" +
          'test("asserts in its own right", () => {\n' +
          "  expect(1).toBe(1);\n" +
          "});\n",
      },
      expect: { count: 1, line: 2, token: "test", messageIncludes: "no `expect(...).<matcher>()`" },
      why: "THE SAME-FILE FENCE'S FALSIFIER (§4.1), and it is the row mustFlag[7] canNOT be. Since the shared `resolveCallableDeclaration` landed, `resolveCalleeBody` really does receive the IMPORTED helper's body, and the containment reconciliation is by NUMERIC OFFSET against the TEST file's index — so a body in another file whose range happens to contain the test file's own matcher expect would satisfy a stub that asserts nothing. The offsets here are MEASURED, not hoped for: the helper body spans 42-243 and this file's `expect(1).toBe(1)` spans 173-190. With the fence the first test flags (this row); cut `resolveCalleeBody`'s `sourceFile === call.getSourceFile()` test and the count is 0. mustFlag[7]'s test file carries no matcher expect at all, so the same cut reads CLEAN there — an unenforced FIXTURE, not an unenforced fence",
    },
    {
      mode: "types",
      files: {
        "tests/support/wide-helper.ts":
          "export function expectOk(x: number): void {\n" +
          "  // Padding. This body's OFFSET RANGE has to CONTAIN the matcher expect in the test file below,\n" +
          "  // or the collision this row exists to prove is not reachable and the row is decoration.\n" +
          "  void x;\n" +
          "}\n",
        "tests/tooling/namespace-helper.test.ts":
          'import * as h from "../support/wide-helper.ts";\n' +
          'test("asserts only through the imported helper", () => {\n' +
          "  h.expectOk(1);\n" +
          "});\n" +
          'test("asserts in its own right", () => {\n' +
          "  expect(1).toBe(1);\n" +
          "});\n",
      },
      expect: { count: 1, line: 2, token: "test", messageIncludes: "no `expect(...).<matcher>()`" },
      why: "THE NAMESPACE-IMPORT SPELLING OF THE SAME-FILE FENCE (#2036). The conversion's first guard was justified by the claim that a helper could never leave the calling file; `import * as h` REFUTED it — the shared `resolveCallableDeclaration` follows `h.expectOk` to the other file's declaration — and no row used the spelling, so the divergence was unpinned in both directions. The fence is a narrowing kept by the #2163 migration lane (`ddf1adf53`) for the `selected-files` reason in the header — no ruling decides it, and #2036's arm 1 vs arm 2 stays UNADJUDICATED — and this row states it for the namespace door exactly as mustFlag[8] does for the named one: the helper body spans offsets 42-243 and this file's `expect(1).toBe(1)` spans 169-186, so cutting `resolveCalleeBody`'s source-file test lets the followed body satisfy the stub and the count drops to 0",
    },
    {
      mode: "types",
      files: {
        "tests/tooling/table.test.ts": 'test.each`\n  a | b\n  1 | 2\n`("stub", () => {\n  const x = 1;\n  void x;\n});\n',
      },
      expect: { count: 1, line: 1, token: "each", messageIncludes: "no `expect(...).<matcher>()`" },
      why: "A MULTI-LINE TAGGED TABLE (verifier RV-1): since the shared shape reads tagged tables, a stub in Vitest's idiomatic multi-line table form reaches this arm. Anchored on the whole callee, its token would span the template's newlines, the waiver sink would refuse it as a tool error and WITHHOLD the whole policy — so this row would read zero findings. Anchoring on the tag's member name keeps it one reported, waivable finding",
    },
    {
      mode: "types",
      files: {
        "tests/tooling/bracket-table.test.ts": 'test["each"]`\n  a | b\n  1 | 2\n`("stub", () => {\n  const x = 1;\n  void x;\n});\n',
      },
      expect: { count: 1, line: 1, token: 'test["each"]', messageIncludes: "no `expect(...).<matcher>()`" },
      why: "THE BRACKET SPELLING OF THE SAME TABLE (#2353). The shared `lib/test-call-shape.ts` walk keyed its member hop on `PropertyAccessExpression`, so respelling this fixture's tag as `test[\"each\"]` made the policy stop flagging its own stub — the exact silent green the spelling-twin census exists to catch. The anchor is still single-line by construction: `calleeNameNode` unwraps the tagged template to its TAG, which is the element access and not the multi-line template, so RV-1's newline-in-token refusal stays out of reach in this spelling too",
    },
    {
      mode: "types",
      files: {
        "tests/tooling/factory-table.test.ts": 'test.each([1])("stub", () => {\n  const x = 1;\n  void x;\n});\n',
      },
      expect: { count: 1, line: 1, token: "each", messageIncludes: "no `expect(...).<matcher>()`" },
      why: "THE CALL-RETURNING FACTORY FORM, and the row that turns a WITHHELD owner into a verdict (#2454). `isTestCallShape` has recognised `test.each(table)(name, fn)` since #2027, but this policy anchored the report on the whole callee — the token `test.each([1])`, which the waiver sink refuses, withholding the WHOLE policy rather than losing one finding (measured 2026-09-13, recorded in `test-no-stubs.ts`'s header). `calleeNameNode` now walks through the inner call to the same `each` the tagged-table rows anchor on. The inner `test.each([1])` call carries no callback, so it is not a second finding — the count is 1, and a naive walk that dropped the callback requirement would read 2 here",
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
      files: { "tests/tooling/factory-ok.test.ts": 'test.each([1])("asserts per row", (n) => {\n  expect(n).toBe(1);\n});\n' },
      why: "THE ACQUITTING DIRECTION of the call-returning factory row in mustFlag (#2454): the same `test.each(table)(name, fn)` shape, asserting. Without it the anchor walk would be proven only where it accuses, and a version that reported the factory's INNER assertion-less call as a second finding would still read green on the flag side",
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
      files: { "tests/tooling/bracket-matcher.test.ts": 'test("asserts through a bracket-spelled matcher", () => {\n  expect(1)["toBe"](1);\n});\n' },
      why: 'THE ACQUITTING SIDE MOVING WITH THE ACCUSING ONE (#2353): `isMatcherChainedExpect` required a PropertyAccessExpression callee, so `expect(1)["toBe"](1)` was not a matcher chain and this asserting test read as RULE 1\'s no-assertion finding. Restore the node-kind test in `isMatcherChainedExpect`/`walksToExpectCall` and this row alone reds — a widening that only moved the accusing side would have converted the blind spot into a false positive',
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
