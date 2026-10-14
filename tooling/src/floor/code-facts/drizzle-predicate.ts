// Drizzle predicate source facts retain alternatives, helper argument provenance and cycle refusals.
import type { CallExpression } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readCallBindings, readCallTarget, readFunctionReturnPaths } from "./call-returns.ts";
import { callsDrizzleOperator } from "./drizzle-operators.ts";
import type { DrizzlePredicate } from "./drizzle-predicate-contract.ts";
import { readSqlAliasStability, readSqlOperandContainment } from "./drizzle-sql.ts";
import { drizzleExportOf } from "./drizzle-table-ref.ts";
import { enclosingFn } from "./function-context.ts";
import { resolveStableExpression, staticMemberAccess } from "./reference-fact.ts";
import { unwrapTarget } from "./reference-fact-alias.ts";
import { referencesOf } from "./value-carrier.ts";

type Bindings = ReadonlyMap<Node, Node>;

function collection(kind: "and" | "or" | "choice", node: Node, terms: readonly DrizzlePredicate[]): DrizzlePredicate {
  return { kind, node, terms, contained: terms.every((term) => term.contained) };
}

function opaque(node: Node, bindings: Bindings): DrizzlePredicate {
  return { kind: "unresolved", node, contained: readSqlOperandContainment(node, bindings) };
}

function nativeArrayMethod(call: CallExpression, name: string): boolean {
  const member = staticMemberAccess(call.getExpression());
  const declarations = member?.receiver.getType().getProperty(name)?.getDeclarations() ?? [];
  return (
    member?.name === name &&
    (member.receiver.getType().isArray() || member.receiver.getType().isReadonlyArray()) &&
    declarations.length > 0 &&
    declarations.every((declaration) =>
      declaration.getProject().getProgram().compilerObject.isSourceFileDefaultLibrary(declaration.getSourceFile().compilerNode),
    )
  );
}

function boundParameter(node: Node, bindings: Bindings): Node | undefined {
  const declarations = node.getSymbol()?.getDeclarations() ?? [];
  return declarations.length === 1 && declarations[0] !== undefined ? bindings.get(declarations[0]) : undefined;
}

function helper(call: CallExpression, bindings: Bindings, active: ReadonlySet<object>): DrizzlePredicate {
  const target = readCallTarget(call);
  if (target.kind === "unresolved") {
    const authored = target.trace.declarations.some((declaration) => !(Node.isImportSpecifier(declaration) || declaration.getSourceFile().isDeclarationFile()));
    return authored ? opaque(call, bindings) : { kind: "leaf", node: call, bindings, contained: readSqlOperandContainment(call, bindings) };
  }
  const fn = target.value;
  if (fn.getSourceFile().isDeclarationFile()) {
    return { kind: "leaf", node: call, bindings, contained: readSqlOperandContainment(call, bindings) };
  }
  const paths = readFunctionReturnPaths(fn);
  if (paths.kind === "unresolved") {
    return opaque(call, bindings);
  }
  const next = readCallBindings(call, fn, bindings);
  return collection(
    "choice",
    call,
    paths.value.map((value) => readPredicate(value, next, active)),
  );
}

function arrayUseArguments(use: Node, owner: Node): readonly Node[] | undefined {
  const parent = use.getParent();
  if (Node.isVariableDeclaration(parent) && parent.getNameNode() === use) {
    return [];
  }
  if (Node.isSpreadElement(parent)) {
    const call = parent.getParent();
    if (Node.isCallExpression(call) && (callsDrizzleOperator(call, "and") || callsDrizzleOperator(call, "or"))) {
      return [];
    }
  }
  const call = parent?.getParent();
  return parent !== undefined &&
    staticMemberAccess(parent)?.receiver === use &&
    Node.isCallExpression(call) &&
    nativeArrayMethod(call, "push") &&
    enclosingFn(use) === enclosingFn(owner)
    ? call.getArguments()
    : undefined;
}

function appendedPredicates(value: Node): readonly Node[] | undefined {
  const scope = enclosingFn(value) ?? value.getSourceFile();
  const pushed: Node[] = [];
  for (const use of referencesOf(value, scope)) {
    const argumentsOfUse = arrayUseArguments(use, value);
    if (argumentsOfUse === undefined) {
      return;
    }
    pushed.push(...argumentsOfUse);
  }
  return pushed;
}

function spread(node: Node, bindings: Bindings, active: ReadonlySet<object>, kind: "and" | "or"): DrizzlePredicate {
  const value = unwrapTarget(node);
  if (active.has(value.compilerNode)) {
    return opaque(value, bindings);
  }
  const next = new Set(active).add(value.compilerNode);
  if (Node.isArrayLiteralExpression(value)) {
    return collection(
      kind,
      value,
      value.getElements().map((element) => readPredicate(element, bindings, next)),
    );
  }
  if (Node.isConditionalExpression(value)) {
    return collection("choice", value, [spread(value.getWhenTrue(), bindings, next, kind), spread(value.getWhenFalse(), bindings, next, kind)]);
  }
  if (Node.isCallExpression(value) && nativeArrayMethod(value, "map")) {
    const callback = value.getArguments()[0];
    const paths = callback === undefined ? undefined : readFunctionReturnPaths(callback);
    return paths?.kind === "resolved"
      ? collection("choice", value, [
          { kind: "empty", node: value, contained: true },
          collection(
            kind,
            value,
            paths.value.map((term) => readPredicate(term, bindings, next)),
          ),
        ])
      : opaque(value, bindings);
  }
  const bindingFact = resolveStableExpression(value);
  if (bindingFact.kind === "unresolved" || bindingFact.value === value) {
    return opaque(value, bindings);
  }
  const pushed = appendedPredicates(value);
  if (pushed === undefined) {
    return opaque(value, bindings);
  }
  return collection(kind, value, [
    spread(bindingFact.value, bindings, next, kind),
    ...pushed.map((term) => collection("choice", term, [{ kind: "empty", node: term, contained: true }, readPredicate(term, bindings, next)])),
  ]);
}

function identifierPredicate(value: import("ts-morph").Identifier, bindings: Bindings, active: ReadonlySet<object>): DrizzlePredicate {
  if (value.getText() === "undefined") {
    return { kind: "empty", node: value, contained: true };
  }
  const bound = boundParameter(value, bindings);
  if (bound !== undefined) {
    return readPredicate(bound, bindings, active);
  }
  if (!readSqlAliasStability(value)) {
    return opaque(value, bindings);
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
  return opaque(value, bindings);
}

function callPredicate(value: CallExpression, bindings: Bindings, active: ReadonlySet<object>): DrizzlePredicate {
  for (const kind of ["and", "or"] as const) {
    if (callsDrizzleOperator(value, kind)) {
      return collection(
        kind,
        value,
        value
          .getArguments()
          .map((argument) =>
            Node.isSpreadElement(argument) ? spread(argument.getExpression(), bindings, active, kind) : readPredicate(argument, bindings, active),
          ),
      );
    }
  }
  if (drizzleExportOf(value.getExpression()) === undefined && !["eq", "inArray", "ne", "isNotNull"].some((name) => callsDrizzleOperator(value, name))) {
    return helper(value, bindings, active);
  }
  return { kind: "leaf", node: value, bindings, contained: readSqlOperandContainment(value, bindings) };
}

function readPredicate(node: Node, bindings: Bindings, active: ReadonlySet<object>): DrizzlePredicate {
  const value = unwrapTarget(node);
  if (active.has(value.compilerNode)) {
    return opaque(value, bindings);
  }
  const next = new Set(active).add(value.compilerNode);
  if (Node.isSpreadElement(value)) {
    return opaque(value, bindings);
  }
  if (Node.isIdentifier(value)) {
    return identifierPredicate(value, bindings, next);
  }
  if (Node.isConditionalExpression(value)) {
    return collection("choice", value, [readPredicate(value.getWhenTrue(), bindings, next), readPredicate(value.getWhenFalse(), bindings, next)]);
  }
  if (Node.isBinaryExpression(value) && [SyntaxKind.QuestionQuestionToken, SyntaxKind.BarBarToken].includes(value.getOperatorToken().getKind())) {
    return collection("choice", value, [readPredicate(value.getLeft(), bindings, next), readPredicate(value.getRight(), bindings, next)]);
  }
  if (Node.isTaggedTemplateExpression(value) && drizzleExportOf(value.getTag()) === "sql") {
    return opaque(value, bindings);
  }
  if (Node.isCallExpression(value)) {
    return callPredicate(value, bindings, next);
  }
  return { kind: "leaf", node: value, bindings, contained: readSqlOperandContainment(value, bindings) };
}

/** Read one predicate without collapsing universal scope and existential selection into the same judgment. */
export function readDrizzlePredicate(node: Node): DrizzlePredicate {
  return readPredicate(node, new Map(), new Set());
}
