// A rendered read shows loading and failure through QueryBoundary, never a hand-drawn state ladder
// (client-architecture-lockdown.md §1, "a suspending read"). A read is judged by its type, so a hook that wraps
// one is a read too; the ladder is a branch on its state or presence whose unsettled arm draws an element.
import type { RuleVisitor } from "@eslint/core";
import type { TSESLint, TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";
import ts from "typescript";
import type { TypeServices } from "./checker.ts";
import { requireTypeServices } from "./checker.ts";
import { staticMemberName, unwrapTsValue } from "./static-values.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";

/**
 * Each result field a ladder tests, by what its truthy value means: `unsettled` while the read is pending or failed,
 * `settled` once data is in hand. `status` is judged by the literal it is compared with.
 */
const FIELD_POLARITY: Readonly<Record<string, "unsettled" | "settled" | "status">> = {
  isPending: "unsettled",
  isLoading: "unsettled",
  isLoadingError: "unsettled",
  isError: "unsettled",
  error: "unsettled",
  isSuccess: "settled",
  data: "settled",
  status: "status",
};

const SETTLED_STATUS = "success";
const PENDING_STATUS = "pending";

/** Whether the expression is true while the read is unsettled, or false while it is. */
type Polarity = "unsettledWhenTrue" | "unsettledWhenFalse";

const flip = (polarity: Polarity): Polarity => (polarity === "unsettledWhenTrue" ? "unsettledWhenFalse" : "unsettledWhenTrue");

/** An element on screen: JSX, or a ternary or `&&` that yields one. `null` draws nothing, so it is never a state. */
function draws(node: TSESTree.Node | null | undefined): boolean {
  const value = node === null || node === undefined ? undefined : unwrapTsValue(node);
  switch (value?.type) {
    case AST_NODE_TYPES.JSXElement:
    case AST_NODE_TYPES.JSXFragment:
      return true;
    case AST_NODE_TYPES.ConditionalExpression:
      return draws(value.consequent) || draws(value.alternate);
    case AST_NODE_TYPES.LogicalExpression:
      return draws(value.right);
    default:
      return false;
  }
}

/** An `if` arm that returns an element from the component itself, not from a nested callback. */
function returnsElement(node: TSESTree.Statement | null): boolean {
  if (node?.type === AST_NODE_TYPES.ReturnStatement) {
    return draws(node.argument);
  }
  return node?.type === AST_NODE_TYPES.BlockStatement && node.body.some((statement) => returnsElement(statement));
}

const isNullish = (node: TSESTree.Node): boolean =>
  (node.type === AST_NODE_TYPES.Literal && node.value === null) || (node.type === AST_NODE_TYPES.Identifier && node.name === "undefined");

const EQUALITY: ReadonlySet<string> = new Set(["===", "=="]);
const INEQUALITY: ReadonlySet<string> = new Set(["!==", "!="]);

/** The polarity of a comparison holding the read, or `undefined` when it compares with anything but nullish or a status literal. */
function comparisonPolarity(read: TSESTree.Node, comparison: TSESTree.BinaryExpression, field: string, truthy: Polarity): Polarity | undefined {
  const other = comparison.left === read ? comparison.right : comparison.left;
  const equal = EQUALITY.has(comparison.operator);
  if (!(equal || INEQUALITY.has(comparison.operator))) {
    return undefined;
  }
  if (field === "status") {
    if (other.type !== AST_NODE_TYPES.Literal || typeof other.value !== "string") {
      return undefined;
    }
    const whenEqual: Polarity = other.value === SETTLED_STATUS ? "unsettledWhenFalse" : "unsettledWhenTrue";
    return equal ? whenEqual : flip(whenEqual);
  }
  if (!isNullish(other)) {
    return undefined;
  }
  return equal ? flip(truthy) : truthy;
}

/** The read's own polarity before any operator above it. */
function basePolarity(read: TSESTree.Node, field: string): { readonly node: TSESTree.Node; readonly polarity: Polarity } | undefined {
  const kind = FIELD_POLARITY[field];
  if (kind === undefined) {
    return undefined;
  }
  const truthy: Polarity = kind === "settled" ? "unsettledWhenFalse" : "unsettledWhenTrue";
  const parent = read.parent;
  if (parent?.type === AST_NODE_TYPES.BinaryExpression) {
    const polarity = comparisonPolarity(read, parent, field, truthy);
    return polarity === undefined ? undefined : { node: parent, polarity };
  }
  return kind === "status" ? undefined : { node: read, polarity: truthy };
}

/** The arm a branch takes while the read is unsettled draws an element. */
function drawsUnsettled(branch: TSESTree.Node, test: TSESTree.Node, polarity: Polarity): boolean {
  const whenTrue = polarity === "unsettledWhenTrue";
  if (branch.type === AST_NODE_TYPES.ConditionalExpression && branch.test === test) {
    return draws(whenTrue ? branch.consequent : branch.alternate);
  }
  if (branch.type === AST_NODE_TYPES.IfStatement && branch.test === test) {
    return returnsElement(whenTrue ? branch.consequent : branch.alternate);
  }
  return branch.type === AST_NODE_TYPES.LogicalExpression && branch.operator === "&&" && branch.left === test && whenTrue && draws(branch.right);
}

/**
 * The branch a state read decides, when its unsettled arm draws an element. Climbs `!` (flips), `||` while true means
 * unsettled and `&&` while false means unsettled, since those keep the meaning of the whole test; any other use stops.
 */
function ladderBranch(read: TSESTree.Node, field: string): TSESTree.Node | undefined {
  const base = basePolarity(read, field);
  let node = base?.node;
  let polarity = base?.polarity;
  for (let parent = node?.parent; node !== undefined && parent !== undefined && polarity !== undefined; node = parent, parent = parent.parent) {
    if (drawsUnsettled(parent, node, polarity)) {
      return parent;
    }
    polarity = climbed(parent, polarity);
  }
  return undefined;
}

/** The test's polarity one operator up, or `undefined` once the operator no longer keeps its meaning. */
function climbed(parent: TSESTree.Node, polarity: Polarity): Polarity | undefined {
  if (parent.type === AST_NODE_TYPES.UnaryExpression && parent.operator === "!") {
    return flip(polarity);
  }
  if (parent.type === AST_NODE_TYPES.LogicalExpression) {
    const keeps = (parent.operator === "||" && polarity === "unsettledWhenTrue") || (parent.operator === "&&" && polarity === "unsettledWhenFalse");
    return keeps ? polarity : undefined;
  }
  return parent.type === AST_NODE_TYPES.ChainExpression || parent.type === AST_NODE_TYPES.TSNonNullExpression ? polarity : undefined;
}

/**
 * `enabled: false` written on the options: a manual check that fetches only when a person presses for it. Its state
 * is the outcome of that press, like a mutation's, and a suspending read cannot wait for a press.
 */
function isManual(call: TSESTree.CallExpression): boolean {
  const options = call.arguments[0];
  return (
    options?.type === AST_NODE_TYPES.ObjectExpression &&
    options.properties.some(
      (property) =>
        property.type === AST_NODE_TYPES.Property &&
        staticMemberKey(property) === "enabled" &&
        property.value.type === AST_NODE_TYPES.Literal &&
        property.value.value === false,
    )
  );
}

const staticMemberKey = (property: TSESTree.Property): string | undefined =>
  !property.computed && property.key.type === AST_NODE_TYPES.Identifier ? property.key.name : undefined;

const constituents = (type: ts.Type): readonly ts.Type[] => (type.isUnion() ? type.types : [type]);

/**
 * A query result that can still be pending: it refetches, and its `status` admits `"pending"`. A suspending
 * result's status never does (it renders only once data is in hand), and a mutation's result has no `refetch`.
 */
function isNonSuspendingResult(checker: ts.TypeChecker, type: ts.Type, at: ts.Node): boolean {
  const status = checker.getPropertyOfType(type, "status");
  if (status === undefined || checker.getPropertyOfType(type, "refetch") === undefined) {
    return false;
  }
  return constituents(checker.getTypeOfSymbolAtLocation(status, at)).some((part) => part.isStringLiteral() && part.value === PENDING_STATUS);
}

/** A call that returns a non-suspending result, or a list of them (`useQueries`), whatever hook spells it. */
function isReadCall({ checker, esTreeNodeToTSNodeMap }: TypeServices, node: TSESTree.Expression | null): boolean {
  const call = node === null ? undefined : unwrapTsValue(node);
  if (call?.type !== AST_NODE_TYPES.CallExpression || isManual(call)) {
    return false;
  }
  const at = esTreeNodeToTSNodeMap.get(call);
  const type = checker.getTypeAtLocation(at);
  const element = checker.isArrayLikeType(type) ? checker.getIndexTypeOfType(type, ts.IndexKind.Number) : undefined;
  return isNonSuspendingResult(checker, element ?? type, at);
}

const unwrapDefault = (node: TSESTree.Node): TSESTree.Node => (node.type === AST_NODE_TYPES.AssignmentPattern ? node.left : node);

/** The binding name each pattern element holds, with the result field it destructures (`undefined` for a whole result). */
function boundNames(pattern: TSESTree.Node, field?: string): readonly (readonly [string, string | undefined])[] {
  if (pattern.type === AST_NODE_TYPES.Identifier) {
    return [[pattern.name, field]];
  }
  if (pattern.type === AST_NODE_TYPES.ArrayPattern) {
    return pattern.elements.flatMap((element) => (element === null ? [] : boundNames(element)));
  }
  if (pattern.type !== AST_NODE_TYPES.ObjectPattern || field !== undefined) {
    return [];
  }
  return pattern.properties.flatMap((property) => {
    const key = property.type === AST_NODE_TYPES.Property ? staticMemberKey(property) : undefined;
    return key === undefined || property.type !== AST_NODE_TYPES.Property ? [] : boundNames(unwrapDefault(property.value), key);
  });
}

type FieldRead = readonly [TSESTree.Node, string];

/** Each field read of a bound result: `q.isPending` on a whole result, or the destructured `isError` itself. */
function fieldReads(variable: TSESLint.Scope.Variable, field: string | undefined): readonly FieldRead[] {
  return variable.references.flatMap(({ identifier, init }): FieldRead[] => {
    if (init === true) {
      return [];
    }
    if (field !== undefined) {
      return [[identifier, field]];
    }
    const member = identifier.parent;
    const name = member.type === AST_NODE_TYPES.MemberExpression && member.object === identifier ? staticMemberName(member) : undefined;
    return typeof name === "string" ? [[member, name]] : [];
  });
}

/** A field read plus the reads of one plain copy of it (`const facets = q.data`), which tests the same state. */
function withCopies(context: OrbRuleContext, [read, field]: FieldRead): readonly FieldRead[] {
  const copy = read.parent;
  if (copy?.type !== AST_NODE_TYPES.VariableDeclarator || copy.init !== read || copy.id.type !== AST_NODE_TYPES.Identifier) {
    return [[read, field]];
  }
  return context.sourceCode.getDeclaredVariables(copy).flatMap((variable) => fieldReads(variable, field));
}

function ladderBranches(context: OrbRuleContext, declarator: TSESTree.VariableDeclarator): readonly TSESTree.Node[] {
  const names = new Map(boundNames(declarator.id));
  return context.sourceCode.getDeclaredVariables(declarator).flatMap((variable) =>
    (names.has(variable.name) ? fieldReads(variable, names.get(variable.name)) : [])
      .flatMap((read) => withCopies(context, read))
      .flatMap(([read, field]) => {
        const branch = ladderBranch(read, field);
        return branch === undefined ? [] : [branch];
      }),
  );
}

const HOOK_NAME = /^use[A-Z]/u;

/** The name a function is called by: its own, or the binding it is assigned to. */
type Fn = TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;

const isFn = (node: TSESTree.Node): node is Fn =>
  node.type === AST_NODE_TYPES.FunctionDeclaration || node.type === AST_NODE_TYPES.FunctionExpression || node.type === AST_NODE_TYPES.ArrowFunctionExpression;

/** The name a function is called by: its own, or the binding it is assigned to. */
function functionName(fn: Fn): string | undefined {
  if (fn.id !== null) {
    return fn.id.name;
  }
  const parent = fn.parent;
  return parent.type === AST_NODE_TYPES.VariableDeclarator && parent.id.type === AST_NODE_TYPES.Identifier ? parent.id.name : undefined;
}

/**
 * The read is declared in a hook body. A hook returns values into a slot its caller renders, so nothing of its own sits
 * above that output for a QueryBoundary to wrap; the component that renders the slot owns the boundary.
 */
function inHook(context: OrbRuleContext, node: TSESTree.Node): boolean {
  const fn = context.sourceCode.getAncestors(node).findLast(isFn);
  return fn !== undefined && HOOK_NAME.test(functionName(fn) ?? "");
}

const LADDER_MESSAGE =
  "A hand-drawn state ladder on a non-suspending read: read with useSuspenseQuery inside a QueryBoundary, which owns the loading and failure states (client-architecture-lockdown.md §1, a suspending read).";

/**
 * A branch on a non-suspending read's state (`isPending`, `error`, `status`) or presence (`data === undefined`) whose
 * arm for the unsettled read draws an element: an early return, a ternary or an `&&`. A read is any call typed as a
 * non-suspending query result, so a `use*` wrapper around `useQuery` counts. An arm of `null`, a value, a flag or a
 * label is not a ladder, and neither is a manual check (`enabled: false`).
 * Only component bodies are judged: a read in a `use*` hook body is skipped, because the component that renders the
 * hook's output owns the boundary. So a `use*` hook that draws its own loading JSX is not judged either.
 * One plain copy (`const facets = q.data`) is followed; a state derived first (`const busy = q.isPending || saving`) is not.
 */
export const queryStateLadderRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const services = requireTypeServices(context);
    const reported = new Set<TSESTree.Node>();
    return {
      "VariableDeclarator:exit"(node: TSESTree.VariableDeclarator): void {
        if (inHook(context, node) || !isReadCall(services, node.init)) {
          return;
        }
        for (const branch of ladderBranches(context, node)) {
          if (!reported.has(branch)) {
            reported.add(branch);
            context.report({ node: branch.type === AST_NODE_TYPES.IfStatement ? branch.test : branch, message: LADDER_MESSAGE });
          }
        }
      },
    };
  },
};
