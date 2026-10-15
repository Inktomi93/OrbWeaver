// Native predicate operand provenance, shared by predicate and raw-SQL containment facts.
import { Node } from "ts-morph";
import { innerReadAnchorsOf } from "./drizzle-query.ts";
import { transparentNativeSqlOperand } from "./drizzle-sql-native.ts";
import { drizzleExportOf } from "./drizzle-table-ref.ts";
import { declaredInDrizzle, readCalledMember } from "./drizzle-write-chain.ts";
import { resolveStableExpression } from "./reference-fact.ts";
import { unwrapTarget } from "./reference-fact-alias.ts";
import type { ReferenceFact } from "./reference-fact-contract.ts";
import { resolved, unresolved } from "./type-member-origin-core.ts";

function boundParameter(node: Node, bindings: ReadonlyMap<Node, Node>): Node | undefined {
  const declarations = node.getSymbol()?.getDeclarations() ?? [];
  return declarations.length === 1 && declarations[0] !== undefined ? bindings.get(declarations[0]) : undefined;
}

function nativeInitializer(node: Node): boolean {
  if (Node.isTaggedTemplateExpression(node)) {
    return drizzleExportOf(node.getTag()) === "sql";
  }
  if (!Node.isCallExpression(node) || innerReadAnchorsOf(node).length === 0) {
    return false;
  }
  const member = readCalledMember(node);
  return member.kind === "resolved" && member.value.declarations.length > 0 && declaredInDrizzle(member.value.declarations);
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
    if (supplied === undefined && source.reason === "dynamic" && source.node !== value && nativeInitializer(source.node)) {
      return resolved(source.node, source.node, source.trace.declarations);
    }
    return supplied === undefined ? resolved(value, value, source.trace.declarations) : readPredicateArgument(supplied, bindings, next);
  }
  return source.value === value ? source : readPredicateArgument(source.value, bindings, next);
}

/** Column identity can pass through native grammar-free SQL wrapping; containment remains a separate obligation. */
export function readPredicateColumn(node: Node, bindings: ReadonlyMap<Node, Node>, active = new Set<object>()): ReferenceFact<Node> {
  const source = readPredicateArgument(node, bindings);
  if (source.kind === "unresolved") {
    return source;
  }
  if (active.has(source.value.compilerNode)) {
    return unresolved("cycle", node, "column operand wrappers revisit their source");
  }
  const operand = transparentNativeSqlOperand(source.value);
  return operand === undefined ? source : readPredicateColumn(operand, bindings, new Set(active).add(source.value.compilerNode));
}
