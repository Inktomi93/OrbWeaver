// Authored well-known-symbol member values, proven from actual stable object sources rather than contextual types.
// Supplied services decide which world answers origin, source and write questions; the member grammar stays here.
import type { Node as MorphNode, ObjectLiteralElementLike } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { referenceResolutionServices } from "./reference-fact.ts";
import type { ReferenceFact, SymbolMemberValueServices } from "./reference-fact-contract.ts";
import { isReferenceWriteTarget } from "./reference-fact-writes.ts";
import { resolved, unresolved } from "./type-member-origin-core.ts";

// A `unique symbol` annotation is the only declaration form TypeScript gives a well-known symbol key.
function uniqueSymbolDeclaration(declaration: MorphNode): boolean {
  const annotation = Node.isPropertySignature(declaration) || Node.isPropertyDeclaration(declaration) ? declaration.getTypeNode() : undefined;
  return (
    Node.isTypeOperatorTypeNode(annotation) &&
    annotation.getOperator() === SyntaxKind.UniqueKeyword &&
    annotation.getTypeNode().getKind() === SyntaxKind.SymbolKeyword
  );
}

function nativeSymbolKey(node: MorphNode, services: SymbolMemberValueServices): ReferenceFact<MorphNode> {
  const origin = services.globalOrigin(node);
  if (origin.kind === "unresolved") {
    return origin;
  }
  const declaration = origin.trace.origin;
  return origin.value.globalName === "Symbol" && origin.value.memberPath.length === 1 && uniqueSymbolDeclaration(declaration)
    ? { kind: "resolved", value: declaration, trace: origin.trace }
    : unresolved("unsupported", node, "the key is not an ambient well-known unique symbol");
}

function symbolPropertyValue(property: ObjectLiteralElementLike, key: MorphNode, services: SymbolMemberValueServices): ReferenceFact<MorphNode | null> {
  if (Node.isSpreadAssignment(property)) {
    return unresolved("unsupported", property, "an object spread can replace the symbol member");
  }
  const name = property.getNameNode();
  if (!Node.isComputedPropertyName(name)) {
    return resolved(null, property, []);
  }
  const member = nativeSymbolKey(name.getExpression(), services);
  if (member.kind === "unresolved") {
    return services.staticString(name.getExpression()).kind === "resolved" ? resolved(null, property, []) : member;
  }
  if (member.value.compilerNode !== key.compilerNode) {
    return resolved(null, property, []);
  }
  if (!(Node.isPropertyAssignment(property) || Node.isMethodDeclaration(property))) {
    return unresolved("unsupported", property, "a symbol accessor has no direct authored member value");
  }
  return resolved(Node.isPropertyAssignment(property) ? property.getInitializerOrThrow() : property, property, [property]);
}

function stableObject(node: MorphNode, services: SymbolMemberValueServices): ReferenceFact<MorphNode> {
  const source = services.stable(node);
  if (source.kind === "unresolved") {
    return source;
  }
  const values = [
    referenceResolutionServices.unwrapExpression(node),
    ...source.trace.declarations.flatMap((declaration) => (Node.isVariableDeclaration(declaration) ? [declaration.getNameNode()] : [])),
  ];
  for (const value of values) {
    if (Node.isIdentifier(value)) {
      const writes = services.writes(value);
      if (writes.kind === "unresolved") {
        return writes;
      }
    }
  }
  return Node.isObjectLiteralExpression(source.value) ? source : unresolved("unsupported", node, "the receiver has no actual stable object-literal source");
}

/** Read an actual object property's value or method declaration under a native unique-symbol key.
 *  Spread/dynamic keys and member effects refuse; a same-typed formal or contextual method is not a value source. */
export function readSymbolMemberValue(node: MorphNode, services: SymbolMemberValueServices): ReferenceFact<MorphNode> {
  const access = referenceResolutionServices.unwrapExpression(node);
  if (!Node.isElementAccessExpression(access)) {
    return unresolved("unsupported", node, "the value is not an element member read");
  }
  if (isReferenceWriteTarget(access)) {
    return unresolved("write", access, "a member write target is not a member value read");
  }
  const argument = access.getArgumentExpression();
  if (argument === undefined) {
    return unresolved("missing", access, "the member read has no key");
  }
  const key = nativeSymbolKey(argument, services);
  if (key.kind === "unresolved") {
    return key;
  }
  const object = stableObject(access.getExpression(), services);
  if (object.kind === "unresolved") {
    return object;
  }
  if (!Node.isObjectLiteralExpression(object.value)) {
    return unresolved("unsupported", access, "the receiver is not an object literal");
  }
  let value: MorphNode | undefined;
  for (const property of object.value.getProperties()) {
    const member = symbolPropertyValue(property, key.value, services);
    if (member.kind === "unresolved") {
      return member;
    }
    if (member.value !== null) {
      value = member.value;
    }
  }
  return value === undefined
    ? unresolved("missing", access, "the actual object declares no matching symbol member")
    : resolved(value, access, [...object.trace.declarations, ...key.trace.declarations, value]);
}
