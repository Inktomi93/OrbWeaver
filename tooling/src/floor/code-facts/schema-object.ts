// One immutable authored-member extraction for structural and semantic Drizzle schema views.
import { Node } from "ts-morph";
import { resolveModuleMemberOrigin } from "./reference-fact.ts";
import type { ReferenceFact } from "./reference-fact-contract.ts";
import type { SchemaObjectEntry, SchemaObjectMembers } from "./schema-object-contract.ts";
import { readStaticAuthoredScalar, resolveAuthoredComposite } from "./static-authored-value.ts";
import { resolved, unresolved } from "./type-member-origin-core.ts";

function memberName(node: Node): ReferenceFact<string | number> {
  if (Node.isIdentifier(node) || Node.isPrivateIdentifier(node)) {
    return resolved(node.getText(), node, []);
  }
  const key = Node.isComputedPropertyName(node) ? node.getExpression() : node;
  const value = readStaticAuthoredScalar(key);
  if (value.kind === "unresolved") {
    return Node.isComputedPropertyName(node) ? { ...value, detail: `computed schema member: ${value.detail}` } : value;
  }
  return typeof value.value === "string" || typeof value.value === "number"
    ? resolved(value.value, value.trace.origin, value.trace.declarations)
    : unresolved("unsupported", node, "an authored member name is not a string or number");
}

function literalStringName(node: Node): boolean {
  let expression = Node.isComputedPropertyName(node) ? node.getExpression() : node;
  while (Node.isAsExpression(expression) || Node.isSatisfiesExpression(expression) || Node.isParenthesizedExpression(expression)) {
    expression = expression.getExpression();
  }
  return Node.isStringLiteral(expression) || Node.isNoSubstitutionTemplateLiteral(expression);
}

function propertyEntry(member: Node): ReferenceFact<SchemaObjectEntry> {
  if (!(Node.isPropertyAssignment(member) || Node.isShorthandPropertyAssignment(member))) {
    return unresolved("unsupported", member, `the authored object contains unsupported ${member.getKindName()}`);
  }
  const nameNode = member.getNameNode();
  const name = memberName(nameNode);
  if (name.kind === "unresolved") {
    return name;
  }
  const value = Node.isPropertyAssignment(member) ? member.getInitializer() : member.getNameNode();
  return value === undefined
    ? unresolved("missing", member, "an authored property has no initializer")
    : resolved({ name: String(name.value), nameNode, literalString: literalStringName(nameNode), key: name, node: member, value }, member, []);
}

function objectRoot(node: Node, active = new Set<object>()): ReferenceFact<Node> {
  if (active.has(node.compilerNode)) {
    return unresolved("cycle", node, "the authored object's module aliases form a cycle");
  }
  const root = resolveAuthoredComposite(node);
  if (root.kind === "resolved" || root.reason !== "dynamic") {
    return root;
  }
  const origin = resolveModuleMemberOrigin(node);
  const declaration =
    origin.kind === "resolved" && origin.value.memberPath.length === 0 && origin.value.canonical.kind === "project"
      ? origin.value.canonical.declaration
      : undefined;
  if (!Node.isVariableDeclaration(declaration)) {
    return root;
  }
  const bound = objectRoot(declaration.getNameNode(), new Set(active).add(node.compilerNode));
  return bound.kind === "unresolved" ? bound : resolved(bound.value, bound.trace.origin, [...origin.trace.declarations, ...bound.trace.declarations]);
}

function membersOf(node: Node, active: ReadonlySet<object>, spread: boolean): ReferenceFact<SchemaObjectMembers> {
  const root = objectRoot(node);
  if (root.kind === "unresolved") {
    return root;
  }
  const object = root.value;
  if (!Node.isObjectLiteralExpression(object)) {
    return unresolved("unsupported", object, `${object.getKindName()} is not an authored object`);
  }
  if (active.has(object.compilerNode)) {
    return unresolved("cycle", object, "the authored object has a spread cycle");
  }
  const next = new Set(active).add(object.compilerNode);
  const entries: SchemaObjectEntry[] = [];
  const emptySources: SchemaObjectMembers["emptySources"][number][] = [];
  for (const member of object.getProperties()) {
    if (Node.isSpreadAssignment(member)) {
      const child = membersOf(member.getExpression(), next, true);
      if (child.kind === "unresolved") {
        return child;
      }
      entries.push(...child.value.entries);
      emptySources.push(...child.value.emptySources);
    } else {
      const entry = propertyEntry(member);
      if (entry.kind === "unresolved") {
        return entry;
      }
      entries.push(entry.value);
    }
  }
  if (entries.length === 0) {
    emptySources.push({ node, bound: root.trace.declarations.length > 0, spread });
  }
  return resolved({ object, entries, emptySources }, object, root.trace.declarations);
}

/** Read all member kinds and immutable bindings, preserving a refusal instead of dropping a member. */
export function readSchemaObjectMembers(node: Node): ReferenceFact<SchemaObjectMembers> {
  return membersOf(node, new Set(), false);
}
