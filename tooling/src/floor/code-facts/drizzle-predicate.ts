// Drizzle predicate source facts retain alternatives, helper argument provenance and cycle refusals.
import type { CallExpression } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readCallTarget, readFunctionReturnPaths } from "./call-returns.ts";
import { callsDrizzleOperator } from "./drizzle-operators.ts";
import type { DrizzlePredicate } from "./drizzle-predicate-contract.ts";
import { drizzleExportOf } from "./drizzle-table-ref.ts";
import { enclosingFn } from "./function-context.ts";
import { resolveStableExpression, staticMemberAccess } from "./reference-fact.ts";
import { unwrapTarget } from "./reference-fact-alias.ts";
import type { ReferenceFact } from "./reference-fact-contract.ts";
import { resolved, unresolved } from "./type-member-origin-core.ts";

type Bindings = ReadonlyMap<Node, Node>;

function boundParameter(node: Node, bindings: Bindings): Node | undefined {
  const declarations = node.getSymbol()?.getDeclarations() ?? [];
  return declarations.length === 1 && declarations[0] !== undefined ? bindings.get(declarations[0]) : undefined;
}

function helper(call: CallExpression, bindings: Bindings, active: ReadonlySet<object>): DrizzlePredicate {
  const target = readCallTarget(call);
  if (target.kind === "unresolved") {
    const authored = target.trace.declarations.some((declaration) => !(Node.isImportSpecifier(declaration) || declaration.getSourceFile().isDeclarationFile()));
    return authored ? { kind: "unresolved", node: call } : { kind: "leaf", node: call, bindings };
  }
  const fn = target.value;
  if (fn.getSourceFile().isDeclarationFile()) {
    return { kind: "leaf", node: call, bindings };
  }
  const paths = readFunctionReturnPaths(fn);
  if (paths.kind === "unresolved") {
    return { kind: "unresolved", node: call };
  }
  const next = new Map(bindings);
  if (Node.isFunctionDeclaration(fn) || Node.isArrowFunction(fn) || Node.isFunctionExpression(fn) || Node.isMethodDeclaration(fn)) {
    for (const [index, parameter] of fn.getParameters().entries()) {
      const argument = call.getArguments()[index] ?? parameter.getInitializer();
      if (argument !== undefined) {
        next.set(parameter, argument);
      }
    }
  }
  return { kind: "choice", node: call, terms: paths.value.map((value) => readPredicate(value, next, active)) };
}

function spread(node: Node, bindings: Bindings, active: ReadonlySet<object>): DrizzlePredicate {
  const value = unwrapTarget(node);
  if (active.has(value.compilerNode)) {
    return { kind: "unresolved", node: value };
  }
  const next = new Set(active).add(value.compilerNode);
  if (Node.isArrayLiteralExpression(value)) {
    return { kind: "and", node: value, terms: value.getElements().map((element) => readPredicate(element, bindings, next)) };
  }
  if (Node.isConditionalExpression(value)) {
    return { kind: "choice", node: value, terms: [spread(value.getWhenTrue(), bindings, next), spread(value.getWhenFalse(), bindings, next)] };
  }
  if (Node.isCallExpression(value) && staticMemberAccess(value.getExpression())?.name === "map") {
    const callback = value.getArguments()[0];
    const paths = callback === undefined ? undefined : readFunctionReturnPaths(callback);
    return paths?.kind === "resolved"
      ? { kind: "and", node: value, terms: paths.value.map((term) => readPredicate(term, bindings, next)) }
      : { kind: "unresolved", node: value };
  }
  const bindingFact = resolveStableExpression(value);
  if (bindingFact.kind === "unresolved" || bindingFact.value === value) {
    return { kind: "unresolved", node: value };
  }
  const symbol = value.getSymbol()?.compilerSymbol;
  const scope = enclosingFn(value) ?? value.getSourceFile();
  const pushed =
    symbol === undefined
      ? []
      : scope.getDescendantsOfKind(SyntaxKind.CallExpression).flatMap((call) => {
          const member = staticMemberAccess(call.getExpression());
          return member?.name === "push" && member.receiver.getSymbol()?.compilerSymbol === symbol ? call.getArguments() : [];
        });
  return { kind: "and", node: value, terms: [spread(bindingFact.value, bindings, next), ...pushed.map((term) => readPredicate(term, bindings, next))] };
}

function identifierPredicate(value: import("ts-morph").Identifier, bindings: Bindings, active: ReadonlySet<object>): DrizzlePredicate {
  if (value.getText() === "undefined") {
    return { kind: "empty", node: value };
  }
  const bound = boundParameter(value, bindings);
  if (bound !== undefined) {
    return readPredicate(bound, bindings, active);
  }
  const bindingFact = resolveStableExpression(value);
  if (bindingFact.kind === "resolved" && bindingFact.value !== value) {
    return readPredicate(bindingFact.value, bindings, active);
  }
  if (
    bindingFact.kind === "unresolved" &&
    bindingFact.reason === "dynamic" &&
    bindingFact.node !== value &&
    !Node.isVariableDeclaration(bindingFact.node) &&
    !Node.isParameterDeclaration(bindingFact.node)
  ) {
    return readPredicate(bindingFact.node, bindings, active);
  }
  return { kind: "unresolved", node: value };
}

function callPredicate(value: CallExpression, bindings: Bindings, active: ReadonlySet<object>): DrizzlePredicate {
  for (const kind of ["and", "or"] as const) {
    if (callsDrizzleOperator(value, kind)) {
      return { kind, node: value, terms: value.getArguments().map((argument) => readPredicate(argument, bindings, active)) };
    }
  }
  if (drizzleExportOf(value.getExpression()) === undefined && !["eq", "inArray", "ne", "isNotNull"].some((name) => callsDrizzleOperator(value, name))) {
    return helper(value, bindings, active);
  }
  return { kind: "leaf", node: value, bindings };
}

function readPredicate(node: Node, bindings: Bindings, active: ReadonlySet<object>): DrizzlePredicate {
  const value = unwrapTarget(node);
  if (active.has(value.compilerNode)) {
    return { kind: "unresolved", node: value };
  }
  const next = new Set(active).add(value.compilerNode);
  if (Node.isSpreadElement(value)) {
    return spread(value.getExpression(), bindings, next);
  }
  if (Node.isIdentifier(value)) {
    return identifierPredicate(value, bindings, next);
  }
  if (Node.isConditionalExpression(value)) {
    return { kind: "choice", node: value, terms: [readPredicate(value.getWhenTrue(), bindings, next), readPredicate(value.getWhenFalse(), bindings, next)] };
  }
  if (Node.isBinaryExpression(value) && [SyntaxKind.QuestionQuestionToken, SyntaxKind.BarBarToken].includes(value.getOperatorToken().getKind())) {
    return { kind: "choice", node: value, terms: [readPredicate(value.getLeft(), bindings, next), readPredicate(value.getRight(), bindings, next)] };
  }
  if (Node.isTaggedTemplateExpression(value) && drizzleExportOf(value.getTag()) === "sql") {
    return { kind: "unresolved", node: value };
  }
  if (Node.isCallExpression(value)) {
    return callPredicate(value, bindings, next);
  }
  return { kind: "leaf", node: value, bindings };
}

/** Read one predicate without collapsing universal scope and existential selection into the same judgment. */
export function readDrizzlePredicate(node: Node): DrizzlePredicate {
  return readPredicate(node, new Map(), new Set());
}

/** An operand's actual supplied value, through helper parameters and immutable local aliases. */
export function readPredicateArgument(node: Node, bindings: ReadonlyMap<Node, Node>, active = new Set<object>()): ReferenceFact<Node> {
  const value = unwrapTarget(node);
  if (active.has(value.compilerNode)) {
    return unresolved("cycle", value, "predicate argument bindings form a cycle");
  }
  const next = new Set(active).add(value.compilerNode);
  const bound = boundParameter(value, bindings);
  if (bound !== undefined) {
    return readPredicateArgument(bound, bindings, next);
  }
  if (!Node.isIdentifier(value)) {
    return resolved(value, value, []);
  }
  const source = resolveStableExpression(value);
  if (source.kind === "unresolved") {
    const supplied = bindings.get(source.node);
    return supplied === undefined ? resolved(value, value, source.trace.declarations) : readPredicateArgument(supplied, bindings, next);
  }
  return source.value === value ? source : readPredicateArgument(source.value, bindings, next);
}
