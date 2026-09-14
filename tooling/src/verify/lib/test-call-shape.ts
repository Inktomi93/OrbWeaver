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
// `test.extend`, `it.next`) is not one — including when a modifier follows that member, so Playwright's
// `test.describe.only(…)` is a suite, not a test. Intermediate calls AND tagged templates in the chain are
// walked THROUGH, which is what makes the call-returning `each` / `for` / `runIf` / `skipIf` factories and
// Vitest's table form ``test.each`a | b`(name, fn)`` visible at all.
//
// SPELLING-INDEPENDENT IN THE MEMBER POSITION (#2353): the chain walks members through
// `lib/symbol-reference.ts#readMemberAccess`, so `test["each"]`, `it?.["skipIf"]` and `test[MODIFIER]` with a
// same-file `const MODIFIER = "only"` are the SAME shape as their dotted twins. Keying the walk on
// `PropertyAccessExpression` alone made both consumers blind to every bracket-spelled modifier — six of this
// module's own `mustFlag` fixtures stopped being flagged under the bracket respelling.
//
// DECLARED LIMITS, each a run row in `tests/tooling/verify/lib/test-call-shape.test.ts`: the ROOT is a NAME,
// so a chain rooted in anything but a bare identifier is not a shape — a receiver-keyed element access
// (`fixtures['test']`, whose root reads as `fixtures`), a parenthesized callee (`(test.only)(…)`) or a
// namespace/qualified root (`vitest.test(…)`) — and an aliased import (`import { test as t }`) is unjudged,
// while a same-named local `test` is read as one. The root limit is UNCHANGED by the member widening: only
// the MEMBER position gained spellings, and a computed key that names no one member still reads as no shape.
import type { CallExpression, Identifier, Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import { readMemberAccess } from "./symbol-reference.ts";

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
  const read = readMemberAccess(expression);
  if (read !== undefined) {
    return walkChain(read.receiver, read.name);
  }
  if (Node.isTaggedTemplateExpression(expression)) {
    return walkChain(expression.getTag(), member);
  }
  return Node.isCallExpression(expression) ? walkChain(expression.getExpression(), member) : undefined;
}

function chainOf(call: CallExpression): ChainShape | undefined {
  return walkChain(call.getExpression(), undefined);
}

/** The identifier a call's callee chain bottoms out in (`test` for `test.concurrent.each(t)(…)`, and
 *  equally for `test["concurrent"]["each"](t)(…)`), or undefined when the chain bottoms out in something
 *  that is not a name at all (a parenthesized expression, a call's return value, a computed member key).
 *  A member-position element access is walked THROUGH to its receiver, so `fixtures['test'](…)` roots in
 *  `fixtures` — which is what keeps the by-NAME root limit refusing it. */
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
