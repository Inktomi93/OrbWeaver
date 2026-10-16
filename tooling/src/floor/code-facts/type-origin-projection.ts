// Finite queried values close over canonical declaration/annotation origins, not a serialized type graph.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readStaticString, resolveLexicalValueDeclaration, resolveStableExpression } from "./reference-fact.ts";
import { resolveCallableDeclaration } from "./reference-fact-call.ts";
import type { ReferenceFact } from "./reference-fact-contract.ts";
import { resolveTypeIdentityChain, resolveTypeMemberOrigin } from "./type-member-origin.ts";
import { annotationReferenceOrigin, resolveTypePropertyOrigin } from "./type-member-origin-core.ts";
import { resolveScalarTypeOrigins } from "./type-member-origin-graph.ts";
import type { NativeBindingPropertyOrigins, NativeTypeOriginProjection, NativeValueTypeOrigins } from "./type-origin-projection-contract.ts";
import { assertTypeOriginCoverage, typeOriginAnnotationClosure } from "./type-origin-projection-contract.ts";

function bindingProperty(binding: ReferenceFact<MorphNode>): NativeBindingPropertyOrigins | null {
  if (binding.kind !== "resolved" || !Node.isBindingElement(binding.value)) {
    return null;
  }
  const key = binding.value.getPropertyNameNode() ?? binding.value.getNameNode();
  const name: ReferenceFact<string> = Node.isIdentifier(key)
    ? { kind: "resolved", value: key.getText(), trace: { declarations: [], origin: key } }
    : readStaticString(Node.isComputedPropertyName(key) ? key.getExpression() : key);
  const receiver = binding.value.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getInitializer() ?? null;
  return {
    binding: binding.value,
    receiver,
    key: name,
    declarations: receiver === null || name.kind !== "resolved" ? null : resolveTypePropertyOrigin(receiver, name.value),
  };
}

/** Capture canonical relationships on the requested value and its stable source; all policy homes stay outside. */
export function captureTypeOriginProjection(node: MorphNode): NativeTypeOriginProjection {
  const stable = resolveStableExpression(node);
  const source = stable.kind === "resolved" ? stable.value : stable.node;
  const binding = resolveLexicalValueDeclaration(node);
  const property = bindingProperty(binding);
  const roots = [...new Set([node, source])];
  const values = roots.map((subject): NativeValueTypeOrigins => {
    const member = resolveTypeMemberOrigin(subject);
    return {
      node: subject,
      identities: resolveTypeIdentityChain(subject),
      member: member.kind === "resolved" ? { kind: member.kind, value: member.value.declarations, trace: member.trace } : member,
    };
  });
  const target = Node.isCallExpression(source) ? resolveCallableDeclaration(source) : null;
  const callable: ReferenceFact<MorphNode> | null =
    target?.kind === "resolved" ? { kind: target.kind, value: target.value.declaration, trace: target.trace } : target;
  const basis: Omit<NativeTypeOriginProjection, "annotations"> = { root: node, stable, binding, bindingProperty: property, values, callable };
  const projection = {
    ...basis,
    annotations: typeOriginAnnotationClosure(basis).map((annotation) => ({
      annotation,
      direct: Node.isTypeReference(annotation) ? annotationReferenceOrigin(annotation.getTypeName()) : null,
      scalar: resolveScalarTypeOrigins(annotation),
    })),
  };
  assertTypeOriginCoverage(projection);
  return projection;
}
