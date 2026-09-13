// The ONE reader of a Vitest/Playwright test-call SHAPE (#2027): which call expressions declare a test, and
// through which modifier chain. Two policies ask it — `test-no-stubs` (a test that asserts nothing) and
// `audit-client-tests` (the structural anti-patterns) — and until this module each spelled its own answer:
// `test-no-stubs` compared the callee's TEXT against the literal set `{test, it, test.skip, it.skip}`, so
// every other modifier form, including the call-returning `test.each(table)(name, fn)`, was never judged
// there, while `audit-client-tests` walked the chain against the modifier vocabulary below. One vocabulary,
// one walk, so neither consumer can drift from the other again.
//
// SHAPE, NOT IDENTITY, and that is the whole contract: a test runner is an ambient/global or a fixture-bound
// `test` whose origin varies per suite (`vitest` globals, a Playwright `test.extend` fixture), so the root is
// read by NAME. The member directly after the root decides admission: a modifier (`test.only`,
// `test.concurrent.each(…)`) declares a test, while any other member (`test.describe`, `test.step`,
// `test.extend`, `it.next`) is not one. Intermediate calls in the chain are walked THROUGH, which is what
// makes the call-returning `each` / `for` / `runIf` / `skipIf` factories visible at all.
import type { CallExpression, Identifier, Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";

/** The member names that keep a `test`/`it` chain a test declaration. `extend` is deliberately absent: it
 *  defines a fixture, so a local `it` (the async-iterator idiom) or a fixture builder is never mistaken for
 *  a test. */
const TEST_MODIFIERS: ReadonlySet<string> = new Set(["only", "skip", "todo", "concurrent", "sequential", "each", "for", "fails", "runIf", "skipIf"]);
const TEST_ROOTS: ReadonlySet<string> = new Set(["test", "it"]);

interface ChainShape {
  readonly root: Identifier;
  /** The member read directly off the root, or undefined when the root itself is called. */
  readonly member: string | undefined;
}

function walkChain(expression: MorphNode, member: string | undefined): ChainShape | undefined {
  if (Node.isIdentifier(expression)) {
    return { root: expression, member };
  }
  if (Node.isPropertyAccessExpression(expression)) {
    return walkChain(expression.getExpression(), expression.getName());
  }
  return Node.isCallExpression(expression) ? walkChain(expression.getExpression(), member) : undefined;
}

function chainOf(call: CallExpression): ChainShape | undefined {
  return walkChain(call.getExpression(), undefined);
}

/** The identifier a call's callee chain bottoms out in (`test` for `test.concurrent.each(t)(…)`), or
 *  undefined when the chain roots in anything else (an element access, a parenthesized expression). */
export function callChainRoot(call: CallExpression): Identifier | undefined {
  return chainOf(call)?.root;
}

/** Is this call a `test`/`it` declaration SHAPE — the bare root, or a chain whose first member is a test
 *  modifier? A call-returning factory's INNER call (`test.each(table)`) has the same shape as its outer
 *  call; a consumer that needs the declaration rather than the factory also asks for a callback argument. */
export function isTestCallShape(call: CallExpression): boolean {
  const chain = chainOf(call);
  if (chain === undefined || !TEST_ROOTS.has(chain.root.getText())) {
    return false;
  }
  return chain.member === undefined || TEST_MODIFIERS.has(chain.member);
}
