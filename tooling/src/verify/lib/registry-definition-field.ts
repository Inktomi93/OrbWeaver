// Named-field reads over one already-resolved registry definition literal.
//
// A registry definition's COMPLETE authored value legitimately refuses — every live one carries an
// imported icon, component, or hook — so a policy that needs `id`, `trigger.placement`, `placeholder.title`
// or `body.planned` reads exactly that field, through the one shared authored-value reader. These helpers
// inspect a node the shared fact already delivered; they own no walk, no parser, and no binding resolver.
import type { Node as MorphNode, ObjectLiteralExpression } from "ts-morph";
import { Node } from "ts-morph";
import type { ReferenceFact } from "../contract/reference-fact.ts";
import { readStaticAuthoredScalar, resolveAuthoredComposite } from "./static-authored-value.ts";

/** The authored initializer of one named property, or undefined when the literal declares none. */
export function definitionField(object: ObjectLiteralExpression, name: string): MorphNode | undefined {
  const property = object.getProperty(name);
  return property !== undefined && Node.isPropertyAssignment(property) ? property.getInitializer() : undefined;
}

/** One named field read as an authored string. Undefined means the field is absent, which is a different
 *  fact from a field the reader refused — every caller must keep those two apart. */
export function definitionStringField(object: ObjectLiteralExpression, name: string): ReferenceFact<string> | undefined {
  const node = definitionField(object, name);
  if (node === undefined) {
    return;
  }
  const scalar = readStaticAuthoredScalar(node);
  if (scalar.kind === "unresolved") {
    return scalar;
  }
  return typeof scalar.value === "string"
    ? { kind: "resolved", value: scalar.value, trace: scalar.trace }
    : { kind: "unresolved", reason: "unsupported", detail: `${name} is not an authored string`, node, trace: scalar.trace };
}

/** One named field read as an authored object literal, through as/satisfies wrappers and stable aliases. */
export function definitionObjectField(object: ObjectLiteralExpression, name: string): ReferenceFact<ObjectLiteralExpression> | undefined {
  const node = definitionField(object, name);
  if (node === undefined) {
    return;
  }
  const composite = resolveAuthoredComposite(node);
  if (composite.kind === "unresolved") {
    return composite;
  }
  return Node.isObjectLiteralExpression(composite.value)
    ? { kind: "resolved", value: composite.value, trace: composite.trace }
    : { kind: "unresolved", reason: "unsupported", detail: `${name} is not an authored object literal`, node: composite.value, trace: composite.trace };
}
