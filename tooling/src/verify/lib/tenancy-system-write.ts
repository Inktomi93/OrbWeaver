// Bounded write-data provenance: authored values, direct parameters/projections, or explicit uncertainty.
// Calls and destructured callback data stay unknown; this is not a callable or injected-clock prover.
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import { resolveStableExpression, staticMemberAccess } from "../../floor/code-facts/reference-fact.ts";
import { readStaticAuthoredScalar } from "../../floor/code-facts/static-authored-value.ts";
import type { SystemWriteValue } from "../contract/tenancy.ts";
import { unwrapExpression } from "./ast-read.ts";

const TIMESTAMP_FIELDS = new Set(["createdAt", "updatedAt"]);
const SYSTEM_WRITE_RANK = { constant: 0, unknown: 1, caller: 2 } satisfies Record<SystemWriteValue, number>;

export const CALLER_SYSTEM_WRITE_MESSAGE =
  "caller-driven system write — a null-owner predicate selects shared rows but grants no caller authority over their keys or content";

/** Compose observations without letting an unknown sibling hide a directly supplied caller value. */
export function combineSystemWriteValues(values: readonly SystemWriteValue[]): SystemWriteValue {
  return values.reduce<SystemWriteValue>((result, value) => (SYSTEM_WRITE_RANK[value] > SYSTEM_WRITE_RANK[result] ? value : result), "constant");
}

function systemPropertyValue(property: MorphNode, timestamp: boolean, active: ReadonlySet<object>, payload = false): SystemWriteValue {
  if (Node.isSpreadAssignment(property)) {
    return systemWriteValue(property.getExpression(), timestamp, active);
  }
  if (!(Node.isPropertyAssignment(property) || Node.isShorthandPropertyAssignment(property))) {
    return "unknown";
  }
  const initializer = Node.isPropertyAssignment(property) ? property.getInitializer() : property.getNameNode();
  const name = property.getNameNode();
  if (Node.isComputedPropertyName(name)) {
    return "unknown";
  }
  const field = Node.isStringLiteral(name) ? name.getLiteralText() : property.getName();
  if (field === "__proto__") {
    return "unknown";
  }
  return initializer === undefined ? "unknown" : systemWriteValue(initializer, timestamp || (payload && TIMESTAMP_FIELDS.has(field)), active);
}

/** Timestamp uncertainty applies only to the database payload's metadata fields, never nested content keys. */
export function systemWritePayload(node: MorphNode): SystemWriteValue {
  const value = unwrapExpression(node);
  if (Node.isArrayLiteralExpression(value)) {
    return combineSystemWriteValues(
      value.getElements().map((element) => (Node.isSpreadElement(element) ? systemWriteValue(element.getExpression()) : systemWritePayload(element))),
    );
  }
  return Node.isObjectLiteralExpression(value)
    ? combineSystemWriteValues(value.getProperties().map((property) => systemPropertyValue(property, false, new Set(), true)))
    : systemWriteValue(node);
}

/** Read only local data syntax and shared immutable-binding facts; never expand a call or its consumers. */
export function systemWriteValue(node: MorphNode, timestamp = false, active: ReadonlySet<object> = new Set()): SystemWriteValue {
  if (active.has(node.compilerNode)) {
    return "unknown";
  }
  const next = new Set(active).add(node.compilerNode);
  const stable = resolveStableExpression(node);
  if (stable.kind === "unresolved" && Node.isParameterDeclaration(stable.node)) {
    return timestamp ? "unknown" : "caller";
  }
  const value = stable.kind === "resolved" ? stable.value : stable.node;
  // A constant-looking composite alias can escape and be mutated. Do not infer runtime immutability
  // from its authored initializer or start an escape proof; only inline composites enter this claim.
  if ((Node.isObjectLiteralExpression(value) || Node.isArrayLiteralExpression(value)) && value !== unwrapExpression(node)) {
    return "unknown";
  }
  if (Node.isObjectLiteralExpression(value)) {
    return combineSystemWriteValues(value.getProperties().map((property) => systemPropertyValue(property, timestamp, next)));
  }
  if (Node.isArrayLiteralExpression(value)) {
    return combineSystemWriteValues(
      value.getElements().map((element) => systemWriteValue(Node.isSpreadElement(element) ? element.getExpression() : element, timestamp, next)),
    );
  }
  const member = staticMemberAccess(value);
  if (member !== undefined) {
    // A projection of a direct parameter is still supplied data, but an authored object's unresolved
    // member is not a constant: getters, mutation and imported member evaluation are outside this claim.
    return systemWriteValue(member.receiver, timestamp, next) === "caller" ? "caller" : "unknown";
  }
  return readStaticAuthoredScalar(node).kind === "resolved" ? "constant" : "unknown";
}
