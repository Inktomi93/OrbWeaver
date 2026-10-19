// Drizzle predicate source facts retain alternatives, helper argument provenance and cycle refusals.
import type { CallExpression } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readCallBindings, readCallReturnProgram, readCallTargets, readFunctionReturnPaths, readSuppliedParameter } from "./call-returns.ts";
import { runtimeUndefinedValue } from "./call-supplied.ts";
import { callsDrizzleOperator } from "./drizzle-operators.ts";
import type { DrizzlePredicate } from "./drizzle-predicate-contract.ts";
import { readSqlAliasStability, readSqlOperandContainment } from "./drizzle-sql.ts";
import type { SqlReadContext } from "./drizzle-sql-contract.ts";
import { driverParameter } from "./drizzle-sql-origin.ts";
import { sqlBindingStable } from "./drizzle-sql-stability.ts";
import { drizzleExportOf } from "./drizzle-table-ref.ts";
import { DRIZZLE_SQL_EXPORT } from "./drizzle-vocabulary.ts";
import { enclosingFn } from "./function-context.ts";
import { resolveStableExpression, staticMemberAccess } from "./reference-fact.ts";
import { unwrapTarget } from "./reference-fact-alias.ts";
import type { CallReturnObservations } from "./reference-fact-contract.ts";
import { isReferenceWriteTarget } from "./reference-fact-writes.ts";
import { referencesOf } from "./value-carrier.ts";

function collection(kind: "and" | "or" | "choice", node: Node, terms: readonly DrizzlePredicate[]): DrizzlePredicate {
  const contained = terms.every((term) => term.contained);
  if (terms.every((term) => term.presence === "absent")) {
    return { kind: "empty", node, contained, presence: "absent" };
  }
  const guaranteed = kind === "choice" ? terms.every((term) => term.presence === "present") : terms.some((term) => term.presence === "present");
  return { kind, node, terms, contained, presence: guaranteed ? "present" : "optional" };
}

function opaque(node: Node, context: SqlReadContext): DrizzlePredicate {
  return {
    kind: "unresolved",
    node,
    contained: readSqlOperandContainment(node, context.bindings, context.program === undefined ? undefined : { programs: [context.program] }),
    presence: "optional",
  };
}

function nativeArrayMember(receiver: Node, name: string): boolean {
  const type = receiver.getType();
  const declarations = type.getProperty(name)?.getDeclarations() ?? [];
  return (
    (type.isArray() || type.isReadonlyArray() || type.isTuple()) &&
    declarations.length > 0 &&
    declarations.every((declaration) =>
      declaration.getProject().getProgram().compilerObject.isSourceFileDefaultLibrary(declaration.getSourceFile().compilerNode),
    )
  );
}

function nativeArrayMethod(call: CallExpression, name: string): boolean {
  const member = staticMemberAccess(call.getExpression());
  return member?.name === name && nativeArrayMember(member.receiver, name);
}

function boundParameter(node: Node, context: SqlReadContext): Node | undefined {
  const declarations = node.getSymbol()?.getDeclarations() ?? [];
  return declarations.length === 1 && declarations[0] !== undefined ? context.bindings.get(declarations[0]) : undefined;
}

function helper(call: CallExpression, context: SqlReadContext, active: ReadonlySet<object>): DrizzlePredicate {
  const target = context.program?.byCall.get(call.compilerNode)?.targets ?? readCallTargets(call);
  if (target.kind === "unresolved") {
    const authored = target.trace.declarations.some((declaration) => !(Node.isImportSpecifier(declaration) || declaration.getSourceFile().isDeclarationFile()));
    return authored
      ? opaque(call, context)
      : {
          kind: "leaf",
          node: call,
          bindings: context.bindings,
          contained: readSqlOperandContainment(call, context.bindings, context.program === undefined ? undefined : { programs: [context.program] }),
          presence: "present",
        };
  }
  if (target.value.some((fn) => fn.getSourceFile().isDeclarationFile())) {
    return {
      kind: "leaf",
      node: call,
      bindings: context.bindings,
      contained: readSqlOperandContainment(call, context.bindings, context.program === undefined ? undefined : { programs: [context.program] }),
      presence: "present",
    };
  }
  return collection(
    "choice",
    call,
    target.value.map((fn) => {
      const paths = readFunctionReturnPaths(fn);
      return paths.kind === "unresolved"
        ? opaque(call, context)
        : collection(
            "choice",
            call,
            paths.value.map((value) => readPredicate(value, { ...context, bindings: readCallBindings(call, fn, context.bindings) }, active)),
          );
    }),
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
  const member = parent === undefined ? undefined : staticMemberAccess(parent);
  if (member?.receiver === use && member.name === "length" && !isReferenceWriteTarget(use)) {
    return nativeArrayMember(use, "length") ? [] : undefined;
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

function spread(node: Node, context: SqlReadContext, active: ReadonlySet<object>, kind: "and" | "or"): DrizzlePredicate {
  const value = unwrapTarget(node);
  if (active.has(value.compilerNode)) {
    return opaque(value, context);
  }
  const next = new Set(active).add(value.compilerNode);
  if (Node.isArrayLiteralExpression(value)) {
    return collection(
      kind,
      value,
      value
        .getElements()
        .map((element) => (Node.isSpreadElement(element) ? spread(element.getExpression(), context, next, kind) : readPredicate(element, context, next))),
    );
  }
  if (Node.isConditionalExpression(value)) {
    return collection("choice", value, [spread(value.getWhenTrue(), context, next, kind), spread(value.getWhenFalse(), context, next, kind)]);
  }
  if (Node.isCallExpression(value) && nativeArrayMethod(value, "map")) {
    const callback = value.getArguments()[0];
    const paths = callback === undefined ? undefined : readFunctionReturnPaths(callback);
    return paths?.kind === "resolved"
      ? collection("choice", value, [
          { kind: "empty", node: value, contained: true, presence: "absent" },
          collection(
            kind,
            value,
            paths.value.map((term) => readPredicate(term, context, next)),
          ),
        ])
      : opaque(value, context);
  }
  const bindingFact = resolveStableExpression(value);
  if (bindingFact.kind === "unresolved" || bindingFact.value === value) {
    return opaque(value, context);
  }
  const pushed = appendedPredicates(value);
  if (pushed === undefined) {
    return opaque(value, context);
  }
  return collection(kind, value, [
    spread(bindingFact.value, context, next, kind),
    ...pushed.map((term) =>
      collection("choice", term, [{ kind: "empty", node: term, contained: true, presence: "absent" }, readPredicate(term, context, next)]),
    ),
  ]);
}

function identifierPredicate(value: import("ts-morph").Identifier, context: SqlReadContext, active: ReadonlySet<object>): DrizzlePredicate {
  if (runtimeUndefinedValue(value)) {
    return { kind: "empty", node: value, contained: true, presence: "absent" };
  }
  const declaration = value.getSymbol()?.getValueDeclaration();
  if (
    Node.isParameterDeclaration(declaration) &&
    context.program !== undefined &&
    !driverParameter(value.getType()) &&
    !sqlBindingStable(value, new Set(), context.program)
  ) {
    return opaque(value, context);
  }
  if (Node.isParameterDeclaration(declaration)) {
    const supplied = readSuppliedParameter(value, context.bindings, context.program);
    if (supplied.kind === "resolved") {
      return collection(
        "choice",
        value,
        supplied.value.map((source) =>
          source.present
            ? readPredicate(source.value, { ...context, bindings: source.bindings }, active)
            : { kind: "empty", node: value, contained: true, presence: "absent" },
        ),
      );
    }
    if (declaration.getInitializer() !== undefined) {
      return opaque(value, context);
    }
  }
  const bound = boundParameter(value, context);
  if (bound !== undefined) {
    return readPredicate(bound, context, active);
  }
  if (!readSqlAliasStability(value, new Set(), context.program)) {
    return opaque(value, context);
  }
  const bindingFact = resolveStableExpression(value);
  if (bindingFact.kind === "resolved" && bindingFact.value !== value) {
    return readPredicate(bindingFact.value, context, active);
  }
  if (
    bindingFact.kind === "unresolved" &&
    bindingFact.reason === "dynamic" &&
    bindingFact.node !== value &&
    !Node.isVariableDeclaration(bindingFact.node) &&
    !Node.isParameterDeclaration(bindingFact.node)
  ) {
    return readPredicate(bindingFact.node, context, active);
  }
  return opaque(value, context);
}

function callPredicate(value: CallExpression, context: SqlReadContext, active: ReadonlySet<object>): DrizzlePredicate {
  for (const kind of ["and", "or"] as const) {
    if (callsDrizzleOperator(value, kind)) {
      return collection(
        kind,
        value,
        value
          .getArguments()
          .map((argument) =>
            Node.isSpreadElement(argument) ? spread(argument.getExpression(), context, active, kind) : readPredicate(argument, context, active),
          ),
      );
    }
  }
  if (drizzleExportOf(value.getExpression()) === undefined && !["eq", "inArray", "ne", "isNotNull"].some((name) => callsDrizzleOperator(value, name))) {
    return helper(value, context, active);
  }
  return {
    kind: "leaf",
    node: value,
    bindings: context.bindings,
    contained: readSqlOperandContainment(value, context.bindings, context.program === undefined ? undefined : { programs: [context.program] }),
    presence: "present",
  };
}

function readPredicate(node: Node, context: SqlReadContext, active: ReadonlySet<object>): DrizzlePredicate {
  const value = unwrapTarget(node);
  if (active.has(value.compilerNode)) {
    return opaque(value, context);
  }
  const next = new Set(active).add(value.compilerNode);
  if (Node.isSpreadElement(value)) {
    return opaque(value, context);
  }
  if (Node.isIdentifier(value)) {
    return identifierPredicate(value, context, next);
  }
  if (Node.isConditionalExpression(value)) {
    return collection("choice", value, [readPredicate(value.getWhenTrue(), context, next), readPredicate(value.getWhenFalse(), context, next)]);
  }
  if (Node.isBinaryExpression(value) && [SyntaxKind.QuestionQuestionToken, SyntaxKind.BarBarToken].includes(value.getOperatorToken().getKind())) {
    return collection("choice", value, [readPredicate(value.getLeft(), context, next), readPredicate(value.getRight(), context, next)]);
  }
  if (Node.isTaggedTemplateExpression(value) && drizzleExportOf(value.getTag()) === DRIZZLE_SQL_EXPORT) {
    return opaque(value, context);
  }
  if (Node.isCallExpression(value)) {
    return callPredicate(value, context, next);
  }
  return {
    kind: "leaf",
    node: value,
    bindings: context.bindings,
    contained: readSqlOperandContainment(value, context.bindings, context.program === undefined ? undefined : { programs: [context.program] }),
    presence: "present",
  };
}

/** Read one predicate without collapsing universal scope and existential selection into the same judgment. */
export function readDrizzlePredicate(node: Node, observations?: CallReturnObservations, bindings: ReadonlyMap<Node, Node> = new Map()): DrizzlePredicate {
  if (observations?.drizzleSql !== undefined) {
    if (bindings.size > 0) {
      throw new Error("captured native predicate bindings cannot be replaced");
    }
    return observations.drizzleSql.predicate(node);
  }
  const captured = observations === undefined ? undefined : readCallReturnProgram(node, observations);
  return captured?.kind === "unresolved"
    ? { kind: "unresolved", node, contained: false, presence: "optional" }
    : readPredicate(node, { bindings, program: captured?.value }, new Set());
}
