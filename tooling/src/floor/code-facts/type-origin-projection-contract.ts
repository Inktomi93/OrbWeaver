// Origin closure coverage is checked from captured relationships and authored syntax, never a checker.
import type { Node as MorphNode, TypeNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { ReferenceFact } from "./reference-fact-contract.ts";
import type { TypeIdentityOrigin } from "./type-member-origin-contract.ts";
export interface NativeAnnotationOrigins {
  readonly annotation: TypeNode;
  readonly direct: ReferenceFact<TypeIdentityOrigin> | null;
  readonly scalar: readonly ReferenceFact<TypeIdentityOrigin>[];
}
export interface NativeValueTypeOrigins {
  readonly node: MorphNode;
  readonly identities: ReferenceFact<readonly TypeIdentityOrigin[]>;
  readonly member: ReferenceFact<readonly MorphNode[]>;
}
export interface NativeBindingPropertyOrigins {
  readonly binding: MorphNode;
  readonly receiver: MorphNode | null;
  readonly key: ReferenceFact<string>;
  readonly declarations: ReferenceFact<readonly MorphNode[]> | null;
}
export interface NativeTypeOriginProjection {
  readonly root: MorphNode;
  readonly stable: ReferenceFact<MorphNode>;
  readonly binding: ReferenceFact<MorphNode>;
  readonly bindingProperty: NativeBindingPropertyOrigins | null;
  readonly values: readonly NativeValueTypeOrigins[];
  readonly annotations: readonly NativeAnnotationOrigins[];
  readonly callable: ReferenceFact<MorphNode> | null;
}

function declarationAnnotation(node: MorphNode): TypeNode | undefined {
  return Node.isPropertySignature(node) || Node.isPropertyDeclaration(node) || Node.isParameterDeclaration(node) || Node.isVariableDeclaration(node)
    ? node.getTypeNode()
    : undefined;
}

type OriginBasis = Omit<NativeTypeOriginProjection, "annotations">;
/** Captured declaration relationships determine the exact annotation roster without compiler queries. */
export function typeOriginAnnotationClosure(basis: OriginBasis): readonly TypeNode[] {
  const declarations = [
    ...basis.values.map((value) => value.node),
    ...(basis.binding.kind === "resolved" ? [basis.binding.value] : []),
    ...(basis.bindingProperty?.declarations?.kind === "resolved" ? basis.bindingProperty.declarations.value : []),
    ...basis.values.flatMap((value) => (value.member.kind === "resolved" ? value.member.value : [])),
  ];
  const annotations = new Set<TypeNode>(declarations.flatMap((declaration) => declarationAnnotation(declaration) ?? []));
  if (basis.callable?.kind === "resolved") {
    const declaration = basis.callable.value;
    if (
      Node.isFunctionDeclaration(declaration) ||
      Node.isArrowFunction(declaration) ||
      Node.isFunctionExpression(declaration) ||
      Node.isMethodDeclaration(declaration)
    ) {
      const annotation = declaration.getReturnTypeNode();
      if (annotation !== undefined) {
        annotations.add(annotation);
      }
    }
  }
  return [...annotations];
}

/** Completeness uses captured relationships and authored syntax only; no checker fallback can repair a missing row. */
export function assertTypeOriginCoverage(projection: NativeTypeOriginProjection): void {
  const source = projection.stable.kind === "resolved" ? projection.stable.value : projection.stable.node;
  const roots = [...new Set([projection.root, source])];
  if (
    projection.values.length !== roots.length ||
    projection.values.some((value, index) => value.node.compilerNode !== roots[index]?.compilerNode) ||
    Node.isCallExpression(source) === (projection.callable === null)
  ) {
    throw new Error("native type origin root/callable coverage is incomplete or foreign");
  }
  const binding = projection.binding;
  const property = projection.bindingProperty;
  if (binding.kind === "resolved" && Node.isBindingElement(binding.value)) {
    const receiver = binding.value.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getInitializer() ?? null;
    if (
      property === null ||
      property.binding.compilerNode !== binding.value.compilerNode ||
      property.receiver?.compilerNode !== receiver?.compilerNode ||
      (receiver !== null && property.key.kind === "resolved") !== (property.declarations !== null)
    ) {
      throw new Error("native binding property origin coverage is incomplete or foreign");
    }
  } else if (property !== null) {
    throw new Error("native binding property origin has foreign coverage");
  }
  const expected = typeOriginAnnotationClosure(projection);
  if (
    projection.annotations.length !== expected.length ||
    projection.annotations.some(
      (value, index) => value.annotation.compilerNode !== expected[index]?.compilerNode || Node.isTypeReference(value.annotation) === (value.direct === null),
    )
  ) {
    throw new Error("native annotation origin coverage is incomplete or foreign");
  }
}
