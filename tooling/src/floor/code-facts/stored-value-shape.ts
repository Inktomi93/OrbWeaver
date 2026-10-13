// One native binding/helper/object value-shape extraction; no stored-column permission judgments.
import { Node } from "ts-morph";
import { readCallReturns } from "./call-returns.ts";
import { resolveLexicalValueDeclaration } from "./reference-fact.ts";
import { unwrapTarget } from "./reference-fact-alias.ts";
import type { StoredValueMember, StoredValueShape } from "./stored-value-shape-contract.ts";

function memberShape(member: Node, active: ReadonlySet<object>): StoredValueMember {
  if (Node.isSpreadAssignment(member)) {
    return { kind: "spread", value: shape(member.getExpression(), active) };
  }
  if (Node.isPropertyAssignment(member)) {
    return Node.isComputedPropertyName(member.getNameNode()) ? { kind: "computed" } : { kind: "named", name: member.getName() };
  }
  return Node.isShorthandPropertyAssignment(member) ? { kind: "named", name: member.getName() } : { kind: "other" };
}

function entered(node: Node, active: ReadonlySet<object>): StoredValueShape {
  const type = node.getType();
  if (Node.isTaggedTemplateExpression(node)) {
    return { kind: "sql", node, type };
  }
  if (node.getKindName() === "NullKeyword" || node.getText() === "undefined") {
    return { kind: "empty", node, type };
  }
  if (Node.isObjectLiteralExpression(node)) {
    return { kind: "object", node, type, members: node.getProperties().map((member) => memberShape(member, active)) };
  }
  if (Node.isConditionalExpression(node)) {
    return { kind: "choice", node, type, values: [shape(node.getWhenTrue(), active), shape(node.getWhenFalse(), active)] };
  }
  if (Node.isIdentifier(node)) {
    const binding = resolveLexicalValueDeclaration(node);
    const value = binding.kind === "resolved" && Node.isVariableDeclaration(binding.value) ? binding.value.getInitializer() : undefined;
    if (value !== undefined) {
      return { kind: "binding", node, type, values: [shape(value, active)] };
    }
  }
  if (Node.isCallExpression(node)) {
    const returned = readCallReturns(node);
    if (returned.kind === "resolved") {
      return { kind: "call", node, type, values: returned.value.map((value) => shape(value, active)) };
    }
  }
  return { kind: "typed", node, type };
}

function shape(raw: Node, active: ReadonlySet<object>): StoredValueShape {
  const node = unwrapTarget(raw);
  return active.has(node.compilerNode) ? { kind: "unresolved", node, type: node.getType() } : entered(node, new Set(active).add(node.compilerNode));
}

/** Resolve a supplied expression in its existing native world; cycles remain unprovable, not empty. */
export function readStoredValueShape(node: Node): StoredValueShape {
  return shape(node, new Set());
}
