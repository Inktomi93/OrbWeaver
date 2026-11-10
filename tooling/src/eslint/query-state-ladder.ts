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
const DATA_FIELD = "data";
const STATUS_FIELD = "status";

/** The list methods whose callback tests each result, so the call keeps the callback's polarity. */
const LIST_TESTS: ReadonlySet<string> = new Set(["some", "every"]);

/** Whether the expression is true while the read is unsettled, or false while it is. */
type Polarity = "unsettledWhenTrue" | "unsettledWhenFalse";

/** A node that tests the read, with its polarity before any operator above it. */
interface Start {
  readonly node: TSESTree.Node;
  readonly polarity: Polarity;
}

const flip = (polarity: Polarity): Polarity => (polarity === "unsettledWhenTrue" ? "unsettledWhenFalse" : "unsettledWhenTrue");

const constituents = (type: ts.Type): readonly ts.Type[] => (type.isUnion() ? type.types : [type]);

/** A call typed as a React element (a `type`, `props` and `key`), so a render helper's arm draws like JSX. */
function callDraws({ checker, esTreeNodeToTSNodeMap }: TypeServices, call: TSESTree.CallExpression): boolean {
  const at = esTreeNodeToTSNodeMap.get(call);
  return constituents(checker.getTypeAtLocation(at)).some((part) =>
    ["type", "props", "key"].every((name) => checker.getPropertyOfType(part, name) !== undefined),
  );
}

/** An element on screen: JSX, a call that returns one, or a ternary or `&&` that yields one. `null` draws nothing. */
function draws(services: TypeServices, node: TSESTree.Node | null | undefined): boolean {
  const value = node === null || node === undefined ? undefined : unwrapTsValue(node);
  switch (value?.type) {
    case AST_NODE_TYPES.JSXElement:
    case AST_NODE_TYPES.JSXFragment:
      return true;
    case AST_NODE_TYPES.CallExpression:
      return callDraws(services, value);
    case AST_NODE_TYPES.ConditionalExpression:
      return draws(services, value.consequent) || draws(services, value.alternate);
    case AST_NODE_TYPES.LogicalExpression:
      return draws(services, value.right);
    default:
      return false;
  }
}

/** A statement arm that returns an element from the component itself, or assigns one for a later return. */
function armDraws(services: TypeServices, node: TSESTree.Statement | null): boolean {
  switch (node?.type) {
    case AST_NODE_TYPES.ReturnStatement:
      return draws(services, node.argument);
    case AST_NODE_TYPES.ExpressionStatement:
      return node.expression.type === AST_NODE_TYPES.AssignmentExpression && node.expression.operator === "=" && draws(services, node.expression.right);
    case AST_NODE_TYPES.BlockStatement:
      return node.body.some((statement) => armDraws(services, statement));
    default:
      return false;
  }
}

const isNullish = (node: TSESTree.Node): boolean =>
  (node.type === AST_NODE_TYPES.Literal && node.value === null) || (node.type === AST_NODE_TYPES.Identifier && node.name === "undefined");

const EQUALITY: ReadonlySet<string> = new Set(["===", "=="]);
const INEQUALITY: ReadonlySet<string> = new Set(["!==", "!="]);
const LOOSE: ReadonlySet<string> = new Set(["==", "!="]);

/**
 * The polarity of a comparison holding the read, or `undefined` when it compares with anything but nullish or a status
 * literal. A deep read (`data?.x`) is `undefined` while unsettled, so only `undefined` or a loose nullish compare judges it.
 */
function comparisonPolarity(read: TSESTree.Node, comparison: TSESTree.BinaryExpression, field: string, deep: boolean): Polarity | undefined {
  const truthy = truthyPolarity(field);
  const other = comparison.left === read ? comparison.right : comparison.left;
  const equal = EQUALITY.has(comparison.operator);
  if (!(equal || INEQUALITY.has(comparison.operator))) {
    return undefined;
  }
  if (field === STATUS_FIELD) {
    if (other.type !== AST_NODE_TYPES.Literal || typeof other.value !== "string") {
      return undefined;
    }
    const whenEqual: Polarity = other.value === SETTLED_STATUS ? "unsettledWhenFalse" : "unsettledWhenTrue";
    return equal ? whenEqual : flip(whenEqual);
  }
  if (!isNullish(other) || (deep && other.type === AST_NODE_TYPES.Literal && !LOOSE.has(comparison.operator))) {
    return undefined;
  }
  return equal ? flip(truthy) : truthy;
}

/** The end of an optional chain that starts on the data (`q.data?.items.length`), or the read itself when there is none. */
function presenceChain(read: TSESTree.Node): TSESTree.Node {
  const first = read.parent;
  if (first?.type !== AST_NODE_TYPES.MemberExpression || first.object !== read || !first.optional) {
    return read;
  }
  let node: TSESTree.Node = first;
  for (let parent: TSESTree.Node | undefined = node.parent; parent !== undefined; node = parent, parent = parent.parent) {
    const continues =
      (parent.type === AST_NODE_TYPES.MemberExpression && parent.object === node) || (parent.type === AST_NODE_TYPES.CallExpression && parent.callee === node);
    if (!continues) {
      break;
    }
  }
  return node.parent?.type === AST_NODE_TYPES.ChainExpression ? node.parent : read;
}

/** The read's own polarity before any operator above it. */
function basePolarity(read: TSESTree.Node, field: string): Start | undefined {
  const kind = FIELD_POLARITY[field];
  if (kind === undefined) {
    return undefined;
  }
  const node = field === DATA_FIELD ? presenceChain(read) : read;
  const parent = node.parent;
  if (parent?.type === AST_NODE_TYPES.BinaryExpression) {
    const polarity = comparisonPolarity(node, parent, field, node !== read);
    return polarity === undefined ? undefined : { node: parent, polarity };
  }
  return kind === "status" ? undefined : { node, polarity: truthyPolarity(field) };
}

const truthyPolarity = (field: string): Polarity => (FIELD_POLARITY[field] === "settled" ? "unsettledWhenFalse" : "unsettledWhenTrue");

/** The arm a branch takes while the read is unsettled draws an element. */
function drawsUnsettled(services: TypeServices, branch: TSESTree.Node, test: TSESTree.Node, polarity: Polarity): boolean {
  const whenTrue = polarity === "unsettledWhenTrue";
  if (branch.type === AST_NODE_TYPES.ConditionalExpression && branch.test === test) {
    return draws(services, whenTrue ? branch.consequent : branch.alternate);
  }
  if (branch.type === AST_NODE_TYPES.IfStatement && branch.test === test) {
    return armDraws(services, whenTrue ? branch.consequent : branch.alternate);
  }
  return branch.type === AST_NODE_TYPES.LogicalExpression && branch.operator === "&&" && branch.left === test && whenTrue && draws(services, branch.right);
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
 * The branch a state test decides, when its unsettled arm draws an element. Climbs `!` (flips), `||` while true means
 * unsettled and `&&` while false means unsettled, since those keep the meaning of the whole test; any other use stops.
 */
function ladderBranch(services: TypeServices, start: Start): TSESTree.Node | undefined {
  let node: TSESTree.Node = start.node;
  let polarity: Polarity | undefined = start.polarity;
  for (let parent = node.parent; parent !== undefined && polarity !== undefined; node = parent, parent = parent.parent) {
    if (drawsUnsettled(services, parent, node, polarity)) {
      return parent;
    }
    polarity = climbed(parent, polarity);
  }
  return undefined;
}

/** The polarity a test keeps at `stop`, an ancestor it climbs to through operators that keep its meaning. */
function polarityAt(start: Start, stop: TSESTree.Node): Polarity | undefined {
  let node: TSESTree.Node = start.node;
  let polarity: Polarity | undefined = start.polarity;
  for (let parent = node.parent; node !== stop && parent !== undefined && polarity !== undefined; node = parent, parent = parent.parent) {
    polarity = climbed(parent, polarity);
  }
  return node === stop ? polarity : undefined;
}

const isStatusCase = (test: TSESTree.Expression | null): test is TSESTree.StringLiteral =>
  test?.type === AST_NODE_TYPES.Literal && typeof test.value === "string";

/**
 * `switch (q.status)`: a case for a status other than `"success"`, or the `default` beside a `"success"` case, is an
 * unsettled arm; it is a ladder when the body it runs (after any empty fall-through cases) draws an element.
 */
function switchLadders(services: TypeServices, read: TSESTree.Node, field: string): readonly TSESTree.Node[] {
  const statement = read.parent?.type === AST_NODE_TYPES.ChainExpression ? read.parent.parent : read.parent;
  if (field !== STATUS_FIELD || statement?.type !== AST_NODE_TYPES.SwitchStatement) {
    return [];
  }
  const { cases } = statement;
  const settledCase = cases.some(({ test }) => isStatusCase(test) && test.value === SETTLED_STATUS);
  return cases.filter((each, index) => {
    const unsettled = each.test === null ? settledCase : isStatusCase(each.test) && each.test.value !== SETTLED_STATUS;
    const body = cases.slice(index).find(({ consequent }) => consequent.length > 0)?.consequent ?? [];
    return unsettled && body.some((part) => armDraws(services, part));
  });
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

const isIndex = (member: TSESTree.MemberExpression): boolean =>
  member.computed && member.property.type === AST_NODE_TYPES.Literal && typeof member.property.value === "number";

type Fn = TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;

const isFn = (node: TSESTree.Node): node is Fn =>
  node.type === AST_NODE_TYPES.FunctionDeclaration || node.type === AST_NODE_TYPES.FunctionExpression || node.type === AST_NODE_TYPES.ArrowFunctionExpression;

/**
 * The state tests a binding feeds. A whole result is read by field (`q.isPending`), by index into a `useQueries` list
 * (`qs[0].error`), by a list test (`qs.some((r) => r.isPending)`), or through a copy or destructure of it
 * (`const { isPending } = q`). A field binding is tested itself, or through one plain copy (`const rows = q.data`).
 */
function bindingTests(context: OrbRuleContext, binding: TSESTree.Node, params?: readonly TSESTree.Parameter[]): readonly Test[] {
  const names = new Map((params ?? [binding]).flatMap((pattern) => boundNames(pattern)));
  const owner = params === undefined ? binding.parent : binding;
  if (owner === undefined) {
    return [];
  }
  return context.sourceCode
    .getDeclaredVariables(owner)
    .flatMap((variable) => (names.has(variable.name) ? variableTests(context, variable, names.get(variable.name)) : []));
}

/** A field read: the node holding the field's value and the field it is. */
interface FieldRead {
  readonly read: TSESTree.Node;
  readonly field: string;
}

/** A field read, or a list test already reduced to its polarity. */
type Test = FieldRead | { readonly start: Start };

function variableTests(context: OrbRuleContext, variable: TSESLint.Scope.Variable, field: string | undefined): readonly Test[] {
  return variable.references.flatMap(({ identifier, init }): readonly Test[] => {
    if (init === true) {
      return [];
    }
    return field === undefined ? wholeTests(context, identifier) : fieldTests(context, identifier, field);
  });
}

/** A field read, plus the reads of one plain copy of it, which tests the same state. */
function fieldTests(context: OrbRuleContext, read: TSESTree.Node, field: string): readonly Test[] {
  const copy = read.parent;
  if (copy?.type !== AST_NODE_TYPES.VariableDeclarator || copy.init !== read || copy.id.type !== AST_NODE_TYPES.Identifier) {
    return [{ read, field }];
  }
  return context.sourceCode
    .getDeclaredVariables(copy)
    .flatMap((variable) => variable.references.flatMap(({ identifier, init }) => (init === true ? [] : [{ read: identifier, field }])));
}

/** The tests a whole result (or one `useQueries` element) feeds, by how the expression holding it is used. */
function wholeTests(context: OrbRuleContext, whole: TSESTree.Node): readonly Test[] {
  const parent = whole.parent;
  if (parent?.type === AST_NODE_TYPES.VariableDeclarator && parent.init === whole) {
    return bindingTests(context, parent.id);
  }
  if (parent?.type !== AST_NODE_TYPES.MemberExpression || parent.object !== whole) {
    return [];
  }
  if (isIndex(parent)) {
    return wholeTests(context, parent);
  }
  const name = staticMemberName(parent);
  if (typeof name !== "string") {
    return [];
  }
  const call = parent.parent;
  if (LIST_TESTS.has(name) && call.type === AST_NODE_TYPES.CallExpression && call.callee === parent) {
    return listTests(context, call);
  }
  return fieldTests(context, parent, name);
}

const startOf = (test: Test): Start | undefined => ("start" in test ? test.start : basePolarity(test.read, test.field));

/** `qs.some(test)` or `qs.every(test)` is unsettled exactly as its callback's test is, for a test on each result. */
function listTests(context: OrbRuleContext, call: TSESTree.CallExpression): readonly Test[] {
  const callback = call.arguments[0];
  if (callback === undefined || !isFn(callback) || callback.body.type === AST_NODE_TYPES.BlockStatement) {
    return [];
  }
  const { body } = callback;
  return bindingTests(context, callback, callback.params).flatMap((test) => {
    const start = startOf(test);
    const polarity = start === undefined ? undefined : polarityAt(start, body);
    return polarity === undefined ? [] : [{ start: { node: call, polarity } }];
  });
}

const HOOK_NAME = /^use[A-Z]/u;

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
 * A branch on a non-suspending read's state (`isPending`, `error`, `status`) or presence (`data === undefined`,
 * `data?.items`) whose arm for the unsettled read draws an element: an early return, an assigned element, a ternary,
 * an `&&` or a `switch` case; a call typed as an element draws like JSX. A read is any call typed as a non-suspending
 * query result, so a `use*` wrapper around `useQuery` counts, and a `useQueries` list is read by destructure, index,
 * `some` or `every`. An arm of `null`, a value, a flag or a label is not a ladder, and neither is a manual check
 * (`enabled: false`).
 *
 * `isFetching` and `fetchStatus` are not judged: they are true on a refetch over settled data and false once a read
 * fails, so a branch on them marks a fetch in flight (a refresh hint), not an unsettled read.
 *
 * Only component bodies are judged: a read in a `use*` hook body is skipped, because the component that renders the
 * hook's output owns the boundary. So a `use*` hook that draws its own loading JSX is not judged either.
 * A copy or destructure of a result, or one plain copy of a field (`const facets = q.data`), is followed; a state
 * derived first (`const busy = q.isPending || saving`) is not.
 */
export const queryStateLadderRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const services = requireTypeServices(context);
    const reported = new Set<TSESTree.Node>();
    const report = (branch: TSESTree.Node): void => {
      if (!reported.has(branch)) {
        reported.add(branch);
        context.report({ node: branch.type === AST_NODE_TYPES.IfStatement ? branch.test : branch, message: LADDER_MESSAGE });
      }
    };
    return {
      "VariableDeclarator:exit"(node: TSESTree.VariableDeclarator): void {
        if (inHook(context, node) || !isReadCall(services, node.init)) {
          return;
        }
        for (const test of bindingTests(context, node.id)) {
          const start = startOf(test);
          const branch = start === undefined ? undefined : ladderBranch(services, start);
          if (branch !== undefined) {
            report(branch);
          }
          if ("read" in test) {
            switchLadders(services, test.read, test.field).forEach(report);
          }
        }
      },
    };
  },
};
