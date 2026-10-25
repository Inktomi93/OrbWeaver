import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
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
// Matchers that assert emptiness whatever their polarity.
const EMPTY_MATCHERS = new Set(["toBeHidden", "toBeEmpty"]);
const COUNT_MATCHERS = new Set(["toHaveCount", "toHaveLength"]);
const EQUAL_MATCHERS = new Set(["toEqual", "toStrictEqual"]);

const MESSAGE =
  "Every assertion in this case proves something absent, so it passes when the setup never reached the guard. Add a positive control: assert the presence or the value the same setup produces on the allowed path.";

interface Assertion {
  readonly matcher: string;
  readonly negated: boolean;
  readonly argument: TSESTree.CallExpressionArgument | undefined;
}

function isExpectRoot(node: TSESTree.Node): boolean {
  if (node.type !== "CallExpression") {
    return false;
  }
  const { callee } = node;
  if (callee.type === "Identifier") {
    return callee.name === "expect";
  }
  return callee.type === "MemberExpression" && !callee.computed && callee.object.type === "Identifier" && callee.object.name === "expect";
}

// `expect(x).not.toBe(y)` → { matcher: "toBe", negated: true }; undefined when the call is not an expect assertion.
function assertionOf(call: TSESTree.CallExpression): Assertion | undefined {
  const { callee } = call;
  if (callee.type !== "MemberExpression" || callee.computed || callee.property.type !== "Identifier") {
    return undefined;
  }
  let negated = false;
  let target: TSESTree.Node = callee.object;
  while (target.type === "MemberExpression" && !target.computed && target.property.type === "Identifier") {
    negated ||= target.property.name === "not";
    target = target.object;
  }
  return isExpectRoot(target) ? { matcher: callee.property.name, negated, argument: call.arguments[0] } : undefined;
}

function isEmptyValue(argument: TSESTree.CallExpressionArgument | undefined): boolean {
  if (argument?.type === "ArrayExpression") {
    return argument.elements.length === 0;
  }
  return argument?.type === "Literal" && argument.value === 0;
}

function provesAbsence({ matcher, negated, argument }: Assertion): boolean {
  if (EMPTY_MATCHERS.has(matcher)) {
    return true;
  }
  if (negated) {
    return LOCATOR_MATCHERS.has(matcher);
  }
  if (COUNT_MATCHERS.has(matcher)) {
    return isEmptyValue(argument);
  }
  return EQUAL_MATCHERS.has(matcher) && argument?.type === "ArrayExpression" && isEmptyValue(argument);
}

function testRoot(callee: TSESTree.Node): { readonly name: string; readonly member: string | undefined } | undefined {
  let node = callee;
  let member: string | undefined;
  while (node.type === "MemberExpression" || node.type === "CallExpression") {
    if (node.type === "CallExpression") {
      node = node.callee;
    } else {
      member ??= !node.computed && node.property.type === "Identifier" ? node.property.name : undefined;
      node = node.object;
    }
  }
  return node.type === "Identifier" ? { name: node.name, member } : undefined;
}

function caseBody(call: TSESTree.CallExpression): TSESTree.BlockStatement | undefined {
  const root = testRoot(call.callee);
  if (root === undefined || !TEST_RUNNERS.has(root.name) || (root.member !== undefined && TEST_HOOKS.has(root.member))) {
    return undefined;
  }
  const body = call.arguments.at(-1);
  return (body?.type === "ArrowFunctionExpression" || body?.type === "FunctionExpression") && body.body.type === "BlockStatement" ? body.body : undefined;
}

function calledName(call: TSESTree.CallExpression): string | undefined {
  const { callee } = call;
  if (callee.type === "Identifier") {
    return callee.name;
  }
  return callee.type === "MemberExpression" && !callee.computed && callee.property.type === "Identifier" ? callee.property.name : undefined;
}

export const ctNegativeOnlyCaseRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const cases: { readonly body: TSESTree.BlockStatement; absences: number; observations: number }[] = [];
    return {
      "CallExpression[callee]"(call: TSESTree.CallExpression): void {
        const body = caseBody(call);
        if (body !== undefined) {
          cases.push({ body, absences: 0, observations: 0 });
          return;
        }
        const current = cases.at(-1);
        if (current === undefined) {
          return;
        }
        const assertion = assertionOf(call);
        if (assertion !== undefined) {
          if (provesAbsence(assertion)) {
            current.absences += 1;
          } else {
            current.observations += 1;
          }
        } else if (ASSERTION_PREFIX.test(calledName(call) ?? "")) {
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
