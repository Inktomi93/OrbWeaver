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

test("a call-returning factory is walked THROUGH: both the outer declaration and the inner factory carry the shape", () => {
  expect(
    verdicts("test.each([1])('a', () => {});\nit.for([1])('b', () => {});\ntest.runIf(true)('c', () => {});\ntest.concurrent.each([1])('d', () => {});"),
  ).toEqual([
    ["test.each([1])('a', () => {})", true],
    ["test.each([1])", true],
    ["it.for([1])('b', () => {})", true],
    ["it.for([1])", true],
    ["test.runIf(true)('c', () => {})", true],
    ["test.runIf(true)", true],
    ["test.concurrent.each([1])('d', () => {})", true],
    ["test.concurrent.each([1])", true],
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
    ["fixtures['test']('d', () => {})", false],
  ]);
});

test("callChainRoot returns the identifier the callee chain bottoms out in, or undefined off a non-identifier root", () => {
  const roots = callsOf("test.concurrent.each([1])('a', () => {});\ndescribe.skip('b', () => {});\n(factory())('c');").map(
    (call) => callChainRoot(call)?.getText() ?? null,
  );

  expect(roots).toEqual(["test", "test", "describe", null, "factory"]);
});
