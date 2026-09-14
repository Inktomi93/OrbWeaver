// Mirror of `tooling/src/verify/lib/test-call-shape.ts` (#2027): the one test-call SHAPE reader both
// `test-no-stubs` and `audit-client-tests` consume. Pinned on the reader itself so a consumer's proof rows
// are not the only thing standing between a modifier vocabulary edit and a silent recognizer change.
import type { CallExpression } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import { callChainRoot, isTestCallShape } from "../../../../tooling/src/verify/lib/test-call-shape.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function callsOf(source: string): CallExpression[] {
  const project = new Project({ useInMemoryFileSystem: true });
  return project.createSourceFile("/shape/x.test.ts", source).getDescendantsOfKind(SyntaxKind.CallExpression);
}

/** Each call's full text paired with the reader's verdict, in source order (outer calls precede inner ones). */
function verdicts(source: string): [string, boolean][] {
  return callsOf(source).map((call) => [call.getText().split("\n")[0] ?? "", isTestCallShape(call)]);
}

test("the bare roots and every modifier chain read as a test-call shape", () => {
  expect(
    verdicts(
      [
        "test('a', () => {});",
        "it('b', () => {});",
        "test.only('c', () => {});",
        "it.concurrent('d', () => {});",
        "test.sequential('e', () => {});",
        "test.fails('f', () => {});",
        "test.skip('g', () => {});",
        "test.todo('h');",
      ].join("\n"),
    ),
  ).toEqual([
    ["test('a', () => {})", true],
    ["it('b', () => {})", true],
    ["test.only('c', () => {})", true],
    ["it.concurrent('d', () => {})", true],
    ["test.sequential('e', () => {})", true],
    ["test.fails('f', () => {})", true],
    ["test.skip('g', () => {})", true],
    ["test.todo('h')", true],
  ]);
});

test("a call-returning factory and a tagged-template table are walked THROUGH to the root", () => {
  expect(
    verdicts(
      "test.each([1])('a', () => {});\nit.for([1])('b', () => {});\ntest.runIf(true)('c', () => {});\ntest.concurrent.each([1])('d', () => {});\ntest.each`a | b`('e', () => {});",
    ),
  ).toEqual([
    ["test.each([1])('a', () => {})", true],
    ["test.each([1])", true],
    ["it.for([1])('b', () => {})", true],
    ["it.for([1])", true],
    ["test.runIf(true)('c', () => {})", true],
    ["test.runIf(true)", true],
    ["test.concurrent.each([1])('d', () => {})", true],
    ["test.concurrent.each([1])", true],
    // The tagged template is not a CallExpression, so the table form yields exactly one call: the declaration.
    ["test.each`a | b`('e', () => {})", true],
  ]);
});

test("EVERY MEMBER HOP IS SPELLING-INDEPENDENT: the bracket twin of a modifier chain is the same shape", () => {
  expect(
    verdicts(
      [
        'test["only"]("a", () => {});',
        'it?.["skipIf"](false)("b", () => {});',
        'test["concurrent"]["each"]([1])("c", () => {});',
        'test["each"]`a | b`("d", () => {});',
        'const MODIFIER = "only";',
        'test[MODIFIER]("e", () => {});',
      ].join("\n"),
    ),
  ).toEqual([
    ['test["only"]("a", () => {})', true],
    ['it?.["skipIf"](false)("b", () => {})', true],
    ['it?.["skipIf"](false)', true],
    ['test["concurrent"]["each"]([1])("c", () => {})', true],
    ['test["concurrent"]["each"]([1])', true],
    // The tagged template is not a CallExpression, so the table form yields exactly one call.
    ['test["each"]`a | b`("d", () => {})', true],
    // A same-file `const` standing for the member name is the third spelling `readMemberAccess` resolves.
    ['test[MODIFIER]("e", () => {})', true],
  ]);
});

test("the bracket spelling does NOT widen admission: a non-modifier member and a non-`test` root stay refused", () => {
  expect(
    verdicts(
      [
        'test["describe"]("a", () => {});',
        'test["describe"]["only"]("b", () => {});',
        'test["extend"]({});',
        'vitest["test"]("c", () => {});',
        'test[dynamicKey]("d", () => {});',
      ].join("\n"),
    ),
  ).toEqual([
    // `describe` is read off the root in EITHER spelling, and it is not a modifier.
    ['test["describe"]("a", () => {})', false],
    ['test["describe"]["only"]("b", () => {})', false],
    ['test["extend"]({})', false],
    // The ROOT limit is untouched: `vitest` is the root here, not `test`.
    ['vitest["test"]("c", () => {})', false],
    // A GENUINELY computed key names no one member — the reader's declared limit, preserved.
    ['test[dynamicKey]("d", () => {})', false],
  ]);
});

test("a non-modifier member, another root, or a non-identifier root is NOT a test-call shape", () => {
  expect(
    verdicts(
      [
        "test.describe('a', () => {});",
        "test.step('b', async () => {});",
        "test.extend({});",
        "it.next();",
        "describe('c', () => {});",
        "expect(1).toBe(1);",
        "fixtures['test']('d', () => {});",
        "test.describe.only('e', () => {});",
        "(test.only)('f', () => {});",
        "vitest.test('g', () => {});",
      ].join("\n"),
    ),
  ).toEqual([
    ["test.describe('a', () => {})", false],
    ["test.step('b', async () => {})", false],
    ["test.extend({})", false],
    ["it.next()", false],
    ["describe('c', () => {})", false],
    ["expect(1).toBe(1)", false],
    ["expect(1)", false],
    // DECLARED LIMITS, run here rather than stated: a non-identifier root is not a shape. Since #2353 the
    // member walk reads element access, so this chain now bottoms out in `fixtures` — which is exactly what
    // keeps the by-NAME root limit refusing it, rather than the walk giving up mid-chain.
    ["fixtures['test']('d', () => {})", false],
    // Admission reads the member DIRECTLY off the root: `describe`, not the trailing `only`.
    ["test.describe.only('e', () => {})", false],
    ["(test.only)('f', () => {})", false],
    ["vitest.test('g', () => {})", false],
  ]);
});

test("DECLARED LIMITS of a by-NAME root: an aliased import is not a shape, and a same-named local `test` is one", () => {
  expect(
    verdicts(
      'import { test as t } from "vitest";\nt("aliased", () => {});\nfunction test(name: string, body: () => void): void {\n  body();\n}\ntest("local", () => {});',
    ),
  ).toEqual([
    ['t("aliased", () => {})', false],
    ["body()", false],
    ['test("local", () => {})', true],
  ]);
});

test("callChainRoot returns the identifier the callee chain bottoms out in, or undefined off a non-identifier root", () => {
  const roots = callsOf("test.concurrent.each([1])('a', () => {});\ndescribe.skip('b', () => {});\n(factory())('c');").map(
    (call) => callChainRoot(call)?.getText() ?? null,
  );

  expect(roots).toEqual(["test", "test", "describe", null, "factory"]);
});
