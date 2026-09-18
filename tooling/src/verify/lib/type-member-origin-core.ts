// Shared primitives every type-member-origin leaf builds on: the resolved/unresolved ReferenceFact
// constructors, the symbol-to-declarations lookup, the property/reference origin readers that need only
// those primitives, and the path normalizer declaredByPackage/declaredByFile build on. No graph walk, no
// generic/recurrence machinery — those live in the containment/recurrence/graph siblings.
import type { ReferenceFact, ReferenceUnresolvedReason } from "@orb/tooling/_shared/reference-fact-contract";
import type { Node as MorphNode, Symbol as MorphSymbol } from "ts-morph";
import { Node } from "ts-morph";
import type { TypeIdentityOrigin } from "../contract/type-member-origin.ts";

export function resolved<T>(value: T, origin: MorphNode, declarations: readonly MorphNode[]): ReferenceFact<T> {
  return { kind: "resolved", value, trace: { declarations: [...declarations], origin } };
}

export function unresolved(reason: ReferenceUnresolvedReason, node: MorphNode, detail: string): ReferenceFact<never> {
  return { kind: "unresolved", reason, detail, node, trace: { declarations: [], origin: node } };
}

export function symbolDeclarations(symbol: MorphSymbol, node: MorphNode, subject: string): ReferenceFact<readonly MorphNode[]> {
  const declarations = symbol.getDeclarations();
  return declarations.length === 0 ? unresolved("missing", node, `${subject} has no declaration`) : resolved(declarations, node, declarations);
}

/** Resolve `<expression>.<name>` WHEN THERE IS NO MEMBER-ACCESS NODE TO HAND OVER — the BINDING-PATTERN twin
 *  of `resolveTypeMemberOrigin`. A destructure (`const { issues } = failure`) asks the same question
 *  the dotted read asks, but its subject is a `BindingElement`: there is no `PropertyAccessExpression` for
 *  the member reader to normalise, only the initializer expression and a name. Without this door a policy
 *  finishes the chain itself (`type.getProperty(name)?.getDeclarations()`) — the #2097 class, and the exact
 *  reason the audit routes those sites to a shared reader: a `lib/` reader that hands back a `Symbol`
 *  invites the gate to answer the declaration question, so the reader answers it.
 *
 *  NON-NULLABLE for the same reason the member reader is: a union carrying `undefined` exposes NO property
 *  symbols at all, and the read only happens where the receiver is present. Unresolved exactly when the
 *  checker resolves no such property, or resolves one with no declaration — both of which are "cannot be
 *  established", never "not this identity".
 *
 *  WHAT FOLDED ONTO IT, AND WHAT DID NOT (the move must END a duplicate, never create one). Folded in the
 *  same commit: `project-home-origin.ts#uncastMemberDeclaredByPackage` and
 *  `bus-fact-read.ts#busChannelPublisher` — both spelled the identical chain and both already treated "no
 *  symbol" and "no declaration" as one no-evidence answer, so each collapses an unresolved fact to `[]` and
 *  is behaviour-identical. NOT folded: `resolveTypeMemberOrigin`, which looks like the same
 *  three lines and is a DIFFERENT predicate — it anchors its refusal on the `nameNode` rather than on the
 *  receiver expression (the coordinate a policy reports), and it needs the property SYMBOL itself for the
 *  `TypeMemberOrigin` it returns, which this reader deliberately does not hand back. Folding it would move
 *  every one of that reader's refusal positions. */
export function resolveTypePropertyOrigin(expression: MorphNode, name: string): ReferenceFact<readonly MorphNode[]> {
  const symbol = expression.getType().getNonNullableType().getProperty(name);
  if (symbol === undefined) {
    return unresolved("missing", expression, `the checker resolved no property symbol named ${name} on ${expression.getText()}`);
  }
  return symbolDeclarations(symbol, expression, `property ${name}`);
}

/** One authored reference's declaration identity. This is provenance only: the value query below must
 *  establish that this reference's resolved type is actually carried by the received value. */
export function annotationReferenceOrigin(node: MorphNode): ReferenceFact<TypeIdentityOrigin> {
  const symbol = node.getSymbol();
  const target = symbol?.getAliasedSymbol() ?? symbol;
  if (target === undefined) {
    return unresolved("missing", node, `the checker resolved no type reference for ${node.getText()}`);
  }
  const declarations = symbolDeclarations(target, node, `type reference ${target.getName()}`);
  return declarations.kind === "unresolved"
    ? declarations
    : resolved(
        { name: target.getName(), node, aliased: declarations.value.some(Node.isTypeAliasDeclaration), declarations: declarations.value },
        node,
        declarations.value,
      );
}

export function unprovenTypeIdentity(origin: TypeIdentityOrigin, reason: ReferenceUnresolvedReason, detail: string): ReferenceFact<TypeIdentityOrigin> {
  return { kind: "unresolved", reason, detail, node: origin.node, trace: { origin: origin.node, declarations: origin.declarations } };
}

export function normalizedPath(node: MorphNode): string {
  return node.getSourceFile().getFilePath().replaceAll("\\", "/");
}
