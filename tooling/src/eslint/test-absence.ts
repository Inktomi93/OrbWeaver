import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";

// A case that only proves something is absent passes when its setup never reached the guard (Spine-Testing §3). It owes a
// positive control: an assertion of presence or of a value, or a helper whose name says it asserts (`expect*`, `assert*`).

const TEST_RUNNERS = new Set(["test", "it"]);
// Members of `test` that declare no case body of their own.
const TEST_HOOKS = new Set([
  "describe",
  "use",
  "beforeEach",
  "beforeAll",
  "afterEach",
  "afterAll",
  "extend",
  "step",
  "skip",
  "fixme",
  "slow",
  "setTimeout",
  "info",
]);
const ASSERTION_PREFIX = /^(?:expect|assert)[A-Z]/u;

// Playwright locator matchers: `.not.` on one of these asserts a state is absent. `.not.` on a plain value matcher
// (`not.toBe`, `not.toBeCloseTo`) compares values and counts as a positive observation.
const LOCATOR_MATCHERS = new Set([
  "toBeVisible",
  "toBeAttached",
  "toBeFocused",
  "toBeEnabled",
  "toBeChecked",
  "toBeEditable",
  "toBeInViewport",
  "toHaveAttribute",
  "toHaveClass",
  "toHaveCSS",
  "toHaveId",
  "toHaveText",
  "toContainText",
  "toHaveValue",
  "toHaveRole",
  "toHaveAccessibleName",
  "toHaveAccessibleDescription",
]);
// Matchers that assert emptiness; negated, they assert presence.
const EMPTY_MATCHERS = new Set(["toBeHidden", "toBeEmpty", "toBeNull", "toBeUndefined", "toBeFalsy"]);
const COUNT_MATCHERS = new Set(["toHaveCount", "toHaveLength"]);
const EQUAL_MATCHERS = new Set(["toEqual", "toStrictEqual"]);

const MESSAGE =
  "Every assertion in this case proves something absent, so it passes when the setup never reached the guard. Add a positive control: assert the presence or the value the same setup produces on the allowed path.";

const DISJUNCTION_MESSAGE =
  "An `||` inside a truth assertion hides which operand held, and passes when the one the case is about is false. Assert the value: `toContain` for a set of outcomes, a bound for a range, or one `expect` per operand.";
const NEGATED_SUBSET_MESSAGE =
  "A negated multi-item `arrayContaining` proves only that not every item is present; it does not prove every item is absent. Assert each absence or express the intended not-all condition explicitly.";
const TRUE_MATCHERS = new Set(["toBe", "toEqual", "toStrictEqual"]);

interface Assertion {
  readonly matcher: string;
  readonly negated: boolean;
  readonly argument: TSESTree.CallExpressionArgument | undefined;
  readonly subject: TSESTree.CallExpressionArgument | undefined;
}

function isExpectRoot(node: TSESTree.Node): node is TSESTree.CallExpression {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const { callee } = node;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name === "expect";
  }
  return (
    callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed && callee.object.type === AST_NODE_TYPES.Identifier && callee.object.name === "expect"
  );
}

// `expect(x).not.toBe(y)` → { matcher: "toBe", negated: true }; undefined when the call is not an expect assertion.
function assertionOf(call: TSESTree.CallExpression): Assertion | undefined {
  const { callee } = call;
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed || callee.property.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  let negated = false;
  let target: TSESTree.Node = callee.object;
  while (target.type === AST_NODE_TYPES.MemberExpression && !target.computed && target.property.type === AST_NODE_TYPES.Identifier) {
    negated ||= target.property.name === "not";
    target = target.object;
  }
  return isExpectRoot(target) ? { matcher: callee.property.name, negated, argument: call.arguments[0], subject: target.arguments[0] } : undefined;
}

function isEmptyValue(argument: TSESTree.CallExpressionArgument | undefined): boolean {
  if (argument?.type === AST_NODE_TYPES.ArrayExpression) {
    return argument.elements.length === 0;
  }
  return argument?.type === AST_NODE_TYPES.Literal && argument.value === 0;
}

function provesAbsence({ matcher, negated, argument }: Assertion): boolean {
  if (negated) {
    return LOCATOR_MATCHERS.has(matcher);
  }
  if (EMPTY_MATCHERS.has(matcher)) {
    return true;
  }
  if (matcher === "toBe" && argument?.type === AST_NODE_TYPES.Literal && argument.value === null) {
    return true;
  }
  if (COUNT_MATCHERS.has(matcher)) {
    return isEmptyValue(argument);
  }
  return EQUAL_MATCHERS.has(matcher) && argument?.type === AST_NODE_TYPES.ArrayExpression && isEmptyValue(argument);
}

function holdsDisjunction(node: TSESTree.Node | undefined): boolean {
  if (node?.type !== AST_NODE_TYPES.LogicalExpression || node.operator === "??") {
    return false;
  }
  return node.operator === "||" || holdsDisjunction(node.left) || holdsDisjunction(node.right);
}

// `expect(a || b).toBe(true)`, and the same `||` as an operand of `&&`.
function isTruthOfDisjunction({ matcher, negated, argument, subject }: Assertion): boolean {
  const assertsTrue = matcher === "toBeTruthy" || (TRUE_MATCHERS.has(matcher) && argument?.type === AST_NODE_TYPES.Literal && argument.value === true);
  return assertsTrue && !negated && holdsDisjunction(subject);
}

function hasMultipleFixedItems(items: TSESTree.ArrayExpression): boolean {
  const fixed = items.elements.filter((item) => item !== null && item.type !== AST_NODE_TYPES.SpreadElement);
  if (fixed.length < 2) {
    return false;
  }
  const first = fixed[0];
  return !(
    first?.type === AST_NODE_TYPES.Literal &&
    (first.value === null || typeof first.value !== "object") &&
    fixed.every((item) => item.type === AST_NODE_TYPES.Literal && item.value === first.value)
  );
}

function isNegatedMultiItemSubset({ matcher, negated, argument }: Assertion): boolean {
  if (!(negated && EQUAL_MATCHERS.has(matcher)) || argument?.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const { callee } = argument;
  const items = argument.arguments[0];
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === "expect" &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === "arrayContaining" &&
    items?.type === AST_NODE_TYPES.ArrayExpression &&
    hasMultipleFixedItems(items)
  );
}

function assertionMessage(assertion: Assertion | undefined): string | undefined {
  if (assertion === undefined) {
    return undefined;
  }
  if (isTruthOfDisjunction(assertion)) {
    return DISJUNCTION_MESSAGE;
  }
  return isNegatedMultiItemSubset(assertion) ? NEGATED_SUBSET_MESSAGE : undefined;
}

function testRoot(callee: TSESTree.Node): { readonly name: string; readonly member: string | undefined } | undefined {
  let node = callee;
  let member: string | undefined;
  while (node.type === AST_NODE_TYPES.MemberExpression || node.type === AST_NODE_TYPES.CallExpression) {
    if (node.type === AST_NODE_TYPES.CallExpression) {
      node = node.callee;
    } else {
      member ??= !node.computed && node.property.type === AST_NODE_TYPES.Identifier ? node.property.name : undefined;
      node = node.object;
    }
  }
  return node.type === AST_NODE_TYPES.Identifier ? { name: node.name, member } : undefined;
}

function caseBody(call: TSESTree.CallExpression): TSESTree.BlockStatement | undefined {
  const root = testRoot(call.callee);
  if (root === undefined || !TEST_RUNNERS.has(root.name) || (root.member !== undefined && TEST_HOOKS.has(root.member))) {
    return undefined;
  }
  const body = call.arguments.at(-1);
  return (body?.type === AST_NODE_TYPES.ArrowFunctionExpression || body?.type === AST_NODE_TYPES.FunctionExpression) &&
    body.body.type === AST_NODE_TYPES.BlockStatement
    ? body.body
    : undefined;
}

function calledName(call: TSESTree.CallExpression): string | undefined {
  const { callee } = call;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }
  return callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed && callee.property.type === AST_NODE_TYPES.Identifier
    ? callee.property.name
    : undefined;
}

// A function the case declares and never references does not run: an assertion in it proves nothing. A function passed
// to a call is taken to run (a poll, a step, an evaluate, an event handler).
function isUnrunClosure(context: OrbRuleContext, fn: TSESTree.Node): boolean {
  const owner = fn.type === AST_NODE_TYPES.FunctionDeclaration || fn.parent?.type !== AST_NODE_TYPES.VariableDeclarator ? fn : fn.parent;
  const named = owner.type === AST_NODE_TYPES.FunctionDeclaration || owner.type === AST_NODE_TYPES.VariableDeclarator;
  const variable = named ? context.sourceCode.getDeclaredVariables(owner)[0] : undefined;
  return variable?.references.every((reference) => reference.init === true) === true;
}

function runsInCase(context: OrbRuleContext, call: TSESTree.CallExpression, body: TSESTree.BlockStatement): boolean {
  const ancestors = context.sourceCode.getAncestors(call);
  return !ancestors
    .slice(ancestors.indexOf(body) + 1)
    .some(
      (node) =>
        (node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          node.type === AST_NODE_TYPES.FunctionExpression ||
          node.type === AST_NODE_TYPES.FunctionDeclaration) &&
        isUnrunClosure(context, node),
    );
}

// What one call inside a case proves: an absence, an observation (an assertion of presence or of a value, or a helper
// that asserts), or nothing. A call in a closure the case never runs proves nothing.
function evidenceOf(context: OrbRuleContext, call: TSESTree.CallExpression, body: TSESTree.BlockStatement): "absence" | "observation" | undefined {
  const assertion = assertionOf(call);
  const asserts = assertion !== undefined || ASSERTION_PREFIX.test(calledName(call) ?? "");
  if (!(asserts && runsInCase(context, call, body))) {
    return undefined;
  }
  if (assertion === undefined) {
    return "observation";
  }
  return provesAbsence(assertion) ? "absence" : "observation";
}

function absenceOption(options: readonly unknown[]): boolean {
  const [option] = options;
  return !(typeof option === "object" && option !== null && "absence" in option && option.absence === false);
}

/** Check ambiguous compound assertions and absence-only cases. `absence: false` disables the case-level absence check. */
export const ctNegativeOnlyCaseRule: OrbRule = {
  meta: { type: "problem", schema: [{ type: "object", properties: { absence: { type: "boolean" } }, additionalProperties: false }] },
  create(context: OrbRuleContext): RuleVisitor {
    const judgesAbsence = absenceOption(context.options);
    const cases: { readonly body: TSESTree.BlockStatement; absences: number; observations: number }[] = [];
    return {
      "CallExpression[callee]"(call: TSESTree.CallExpression): void {
        const message = assertionMessage(assertionOf(call));
        if (message !== undefined) {
          context.report({ node: call, message });
        }
        if (!judgesAbsence) {
          return;
        }
        const body = caseBody(call);
        if (body !== undefined) {
          cases.push({ body, absences: 0, observations: 0 });
          return;
        }
        const current = cases.at(-1);
        if (current === undefined) {
          return;
        }
        const evidence = evidenceOf(context, call, current.body);
        if (evidence === "absence") {
          current.absences += 1;
        } else if (evidence === "observation") {
          current.observations += 1;
        }
      },
      "CallExpression:exit"(call: TSESTree.CallExpression): void {
        const current = cases.at(-1);
        if (current !== undefined && caseBody(call) === current.body) {
          cases.pop();
          if (current.absences > 0 && current.observations === 0) {
            context.report({ node: call, message: MESSAGE });
          }
        }
      },
    };
  },
};
