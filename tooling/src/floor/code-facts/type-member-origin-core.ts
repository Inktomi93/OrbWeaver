// Native declaration/identity primitives for type-member readers; graph/containment judgments stay consumers.
import type { ReferenceFact, ReferenceUnresolvedReason, UnresolvedReferenceFact } from "@orb/tooling/floor/code-facts/reference-fact-contract";
import type { Node as MorphNode, Symbol as MorphSymbol, Type } from "ts-morph";
import { Node, VariableDeclarationKind } from "ts-morph";
import type { TypeIdentityOrigin } from "./type-member-origin-contract.ts";
import type { TypeObservationReader } from "./type-observations-contract.ts";
import { nodeTypeSelector } from "./type-projection-contract.ts";

function unwrapReceiverExpression(raw: MorphNode): MorphNode {
  let node = raw;
  while (Node.isParenthesizedExpression(node) || Node.isAsExpression(node) || Node.isSatisfiesExpression(node) || Node.isNonNullExpression(node)) {
    node = node.getExpression();
  }
  return node;
}

export const MAX_RECEIVER_HOPS = 4;

/** Follow only raw lexical const initializers, retaining call terminals after unwrapping. */
export function uncastReceiver(
  node: MorphNode,
  declarations: (identifier: MorphNode) => readonly MorphNode[] = (identifier) => identifier.getSymbol()?.getDeclarations() ?? [],
  observe?: (value: MorphNode) => void,
): MorphNode {
  let current = unwrapReceiverExpression(node);
  observe?.(current);
  for (let hop = 0; hop < MAX_RECEIVER_HOPS && Node.isIdentifier(current); hop += 1) {
    let initializer: MorphNode | null = null;
    for (const declaration of declarations(current)) {
      const value = Node.isVariableDeclaration(declaration) ? declaration.getInitializer() : undefined;
      const isConst = Node.isVariableDeclaration(declaration) && declaration.getVariableStatement()?.getDeclarationKind() === VariableDeclarationKind.Const;
      if (initializer === null && isConst && value !== undefined) {
        initializer = value;
      }
    }
    if (initializer === null) {
      break;
    }
    current = unwrapReceiverExpression(initializer);
    observe?.(current);
  }
  return current;
}

export function resolved<T>(value: T, origin: MorphNode, declarations: readonly MorphNode[]): ReferenceFact<T> {
  return { kind: "resolved", value, trace: { declarations: [...declarations], origin } };
}

export function unresolved(reason: ReferenceUnresolvedReason, node: MorphNode, detail: string): UnresolvedReferenceFact {
  return { kind: "unresolved", reason, detail, node, trace: { declarations: [], origin: node } };
}

export function symbolDeclarations(symbol: MorphSymbol, node: MorphNode, subject: string): ReferenceFact<readonly MorphNode[]> {
  const declarations = symbol.getDeclarations();
  return declarations.length === 0 ? unresolved("missing", node, `${subject} has no declaration`) : resolved(declarations, node, declarations);
}

/** The checker’s terminal instantiated property type and its actual declaration origins. */
export interface NativeTypePropertyValue {
  readonly type: Type;
  readonly declarations: readonly MorphNode[];
}

/** Preserve the declaration-only door over the one native property-path traversal. */
export function resolveTypePropertyOrigin(expression: MorphNode, name: string | readonly string[]): ReferenceFact<readonly MorphNode[]> {
  const fact = resolveTypePropertyValue(expression, name);
  return fact.kind === "resolved" ? { ...fact, value: fact.value.declarations } : fact;
}

/** Captured native property declarations retain the direct reader's nonnullable and no-evidence rules. */
export function observedTypePropertyOrigin(receiver: MorphNode, name: string, readers: TypeObservationReader): ReferenceFact<readonly MorphNode[]> {
  const selector = { ...nodeTypeSelector(receiver), steps: [{ kind: "nonnullable" as const }] };
  const symbol = readers.propertySymbol(selector, name);
  if (symbol === null) {
    return unresolved("missing", receiver, `the checker resolved no property symbol named ${name} on ${receiver.getText()}`);
  }
  const declarations = readers.symbolData(symbol).declarations;
  return declarations.length === 0 ? unresolved("missing", receiver, `property ${name} has no declaration`) : resolved(declarations, receiver, declarations);
}

/** Resolve `<expression>.<name>` WHEN THERE IS NO MEMBER-ACCESS NODE TO HAND OVER — the BINDING-PATTERN twin
 *  of `resolveTypeMemberOrigin`. A destructure (`const { issues } = failure`) asks the same question
 *  the dotted read asks, but its subject is a `BindingElement`: there is no `PropertyAccessExpression` for
 *  the member reader to normalise, only the initializer expression and a name. Supplied paths follow native
 *  instantiated property types and retain every terminal declaration. Without this door a policy
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
export function resolveTypePropertyValue(expression: MorphNode, name: string | readonly string[]): ReferenceFact<NativeTypePropertyValue> {
  const path = typeof name === "string" ? [name] : name;
  if (path.length === 0) {
    return unresolved("unsupported", expression, "a property path must name at least one member");
  }
  // A source-file namespace has a module symbol rather than an expression type.
  const initialType = Node.isSourceFile(expression) ? expression.getSymbol()?.getTypeAtLocation(expression) : expression.getType();
  if (initialType === undefined) {
    return unresolved("missing", expression, "the checker resolved no module symbol for the property path");
  }
  let type: Type = initialType;
  let declarations: readonly MorphNode[] = [];
  for (const member of path) {
    const symbol = type.getNonNullableType().getProperty(member);
    if (symbol === undefined) {
      return unresolved("missing", expression, `the checker resolved no property symbol named ${member} on ${expression.getText()}`);
    }
    const origin = symbolDeclarations(symbol, expression, `property ${member}`);
    if (origin.kind === "unresolved") {
      return origin;
    }
    declarations = origin.value;
    type = symbol.getTypeAtLocation(expression);
  }
  return resolved({ type, declarations }, expression, declarations);
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
