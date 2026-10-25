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
// Matchers that assert emptiness; negated, they assert presence.
const EMPTY_MATCHERS = new Set(["toBeHidden", "toBeEmpty", "toBeNull", "toBeUndefined"]);
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
  if (negated) {
    return LOCATOR_MATCHERS.has(matcher);
  }
  if (EMPTY_MATCHERS.has(matcher)) {
    return true;
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

// A function the case declares and never references does not run: an assertion in it proves nothing. A function passed
// to a call is taken to run (a poll, a step, an evaluate, an event handler).
function isUnrunClosure(context: OrbRuleContext, fn: TSESTree.Node): boolean {
  const owner = fn.type === "FunctionDeclaration" || fn.parent?.type !== "VariableDeclarator" ? fn : fn.parent;
  const named = owner.type === "FunctionDeclaration" || owner.type === "VariableDeclarator";
  const variable = named ? context.sourceCode.getDeclaredVariables(owner)[0] : undefined;
  return variable?.references.every((reference) => reference.init === true) === true;
}

function runsInCase(context: OrbRuleContext, call: TSESTree.CallExpression, body: TSESTree.BlockStatement): boolean {
  const ancestors = context.sourceCode.getAncestors(call);
  return !ancestors
    .slice(ancestors.indexOf(body) + 1)
    .some(
      (node) =>
        (node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression" || node.type === "FunctionDeclaration") && isUnrunClosure(context, node),
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
