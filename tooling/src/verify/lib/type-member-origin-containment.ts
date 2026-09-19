// The data-containment reachability engine: does a resolved type expression retain another resolved type
// through its value-bearing shape? Owns the generic-constructor identity helpers (genericTarget/
// genericArguments/genericDescriptor), the Containment lattice, and the ConstructorSummary/TransportContext/
// RecurrenceFrame shapes the recurrence and graph-walk siblings build on. No fixed-point iteration and no
// per-node recurrence bookkeeping — those live in type-member-origin-recurrence.ts and -graph.ts.
import type { ReferenceFact } from "@orb/tooling/_shared/reference-fact-contract";
import type { Node as MorphNode, Symbol as MorphSymbol, Type, TypeNode } from "ts-morph";
import { Node, TypeFlags } from "ts-morph";
import type { Containment, GenericDeclaration, TypeIdentityOrigin } from "../contract/type-member-origin.ts";
import { annotationReferenceOrigin, resolveTypePropertyOrigin, unprovenTypeIdentity } from "./type-member-origin-core.ts";

export function opaqueType(type: Type): boolean {
  return type.isAny() || type.isUnknown() || type.isTypeParameter();
}

/** Actual data types, never callable parameters/results, type arguments or constraints. A named property
 *  carries its type regardless of whether a type literal, interface or mapping declared it. Member-origin
 *  provenance alone cannot establish the containing object's identity after a projection. */
export function dataMemberAnnotation(node: MorphNode): readonly TypeNode[] {
  let annotation: TypeNode | undefined;
  if (Node.isPropertySignature(node) || Node.isPropertyDeclaration(node)) {
    annotation = node.getTypeNode();
  } else if (Node.isIndexSignatureDeclaration(node)) {
    annotation = node.getReturnTypeNode();
  }
  return annotation === undefined ? [] : [annotation];
}

export function annotationChildren(node: TypeNode): readonly TypeNode[] {
  if (Node.isIndexedAccessTypeNode(node)) {
    const key = node.getIndexTypeNode().getType();
    const keys = key.isUnion() ? key.getUnionTypes() : [key];
    // Only selected literal members supply authored candidate provenance. Traversing the holder would
    // falsely import a Row sibling into Holder["clean"]. Nonliteral outputs still use the checker graph.
    return keys.flatMap((selected) => {
      const value = selected.getLiteralValue();
      if (typeof value !== "string" && typeof value !== "number") {
        return [];
      }
      const member = resolveTypePropertyOrigin(node.getObjectTypeNode(), String(value));
      return member.kind === "resolved" ? member.value.flatMap(dataMemberAnnotation) : [];
    });
  }
  if (Node.isTypeReference(node)) {
    return node.getTypeArguments();
  }
  if (Node.isConditionalTypeNode(node)) {
    return [node.getTrueType(), node.getFalseType()];
  }
  if (Node.isMappedTypeNode(node)) {
    const output = node.getTypeNode();
    return output === undefined ? [] : [output];
  }
  if (Node.isArrayTypeNode(node)) {
    return [node.getElementTypeNode()];
  }
  if (
    Node.isTypeOperatorTypeNode(node) ||
    Node.isParenthesizedTypeNode(node) ||
    Node.isNamedTupleMember(node) ||
    Node.isOptionalTypeNode(node) ||
    Node.isRestTypeNode(node)
  ) {
    return [node.getTypeNode()];
  }
  if (Node.isUnionTypeNode(node) || Node.isIntersectionTypeNode(node)) {
    return node.getTypeNodes();
  }
  if (Node.isTypeLiteral(node)) {
    return node.getMembers().flatMap(dataMemberAnnotation);
  }
  return Node.isTupleTypeNode(node) ? node.getElements() : [];
}

function projectedInterfaceOrigin(declaration: MorphNode): readonly ReferenceFact<TypeIdentityOrigin>[] {
  const parent = declaration.getParent();
  if (parent === undefined || !Node.isInterfaceDeclaration(parent)) {
    return [];
  }
  const origin = annotationReferenceOrigin(parent.getNameNode());
  return origin.kind === "unresolved"
    ? []
    : [unprovenTypeIdentity(origin.value, "unsupported", "member provenance does not establish the containing value's type identity")];
}

/** Actual data types, never callable parameters/results, type arguments or constraints. A named property
 *  carries its type regardless of whether a type literal, interface or mapping declared it. Member-origin
 *  provenance alone cannot establish the containing object's identity after a projection. */
export function valueTypeEdges(
  type: Type,
  annotation: TypeNode,
): {
  readonly types: readonly { readonly type: Type; readonly definitions: readonly TypeNode[] }[];
  readonly projections: readonly ReferenceFact<TypeIdentityOrigin>[];
  readonly annotations: readonly TypeNode[];
} {
  // Primitive prototype members are not contained data. Object properties include callable values, but
  // the traversal never follows their signatures; a function can still have its own named data property.
  const properties = type.isObject() ? type.getProperties() : [];
  const declarations = properties.flatMap((property) => property.getDeclarations());
  // A narrowed conditional output uses a substitution wrapper. Unlike a type parameter's constraint,
  // its apparent type is the resolved output. Opaque type parameters never reach this function.
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript TypeFlags is a compiler-owned bitfield; only a substitution output is normalized, never a generic constraint.
  const substituted = (type.getFlags() & TypeFlags.Substitution) !== 0 ? [type.getApparentType()] : [];
  const indices = [type.getNumberIndexType(), type.getStringIndexType()].flatMap((element) => (element === undefined ? [] : [element]));
  const aggregateDefinitions = (type.getAliasSymbol()?.getDeclarations() ?? []).flatMap((declaration) => {
    const body = Node.isTypeAliasDeclaration(declaration) ? declaration.getTypeNode() : undefined;
    return body === undefined ? [] : [body];
  });
  return {
    types: [
      ...[...type.getUnionTypes(), ...type.getIntersectionTypes(), ...type.getTupleElements(), ...indices, ...substituted].map((element) => ({
        type: element,
        definitions: aggregateDefinitions,
      })),
      ...properties.map((property) => ({
        type: property.getTypeAtLocation(annotation),
        definitions: property.getDeclarations().flatMap(dataMemberAnnotation),
      })),
    ],
    projections: declarations.flatMap(projectedInterfaceOrigin),
    annotations: declarations.flatMap(dataMemberAnnotation),
  };
}

interface GenericDescriptor {
  readonly target: object;
  readonly declaration?: GenericDeclaration;
  readonly arguments: readonly Type[];
}

function declaredGeneric(symbol: MorphSymbol | undefined): GenericDeclaration | undefined {
  return symbol
    ?.getDeclarations()
    .find(
      (candidate): candidate is GenericDeclaration =>
        (Node.isTypeAliasDeclaration(candidate) || Node.isInterfaceDeclaration(candidate)) && candidate.getTypeParameters().length > 0,
    );
}

/** One compiler/declaration identity space for a constructor and its supplied arguments. A zero-parameter
 *  alias follows its authored TypeReference rather than relying on checker alias retention. */
export function genericDescriptor(type: Type): GenericDescriptor | undefined {
  const alias = type.getAliasSymbol();
  const declaration = declaredGeneric(alias ?? type.getSymbol());
  if (declaration !== undefined) {
    const aliasArguments = type.getAliasTypeArguments();
    return { target: declaration.compilerNode, declaration, arguments: aliasArguments.length > 0 ? aliasArguments : type.getTypeArguments() };
  }
  const aliasDeclaration = alias?.getDeclarations().find(Node.isTypeAliasDeclaration);
  const body = aliasDeclaration?.getTypeNode();
  if (body !== undefined && Node.isTypeReference(body)) {
    const name = body.getTypeName();
    const symbol = (Node.isQualifiedName(name) ? name.getRight() : name).getSymbol();
    const targetDeclaration = declaredGeneric(symbol?.getAliasedSymbol() ?? symbol);
    if (targetDeclaration !== undefined) {
      return {
        target: targetDeclaration.compilerNode,
        declaration: targetDeclaration,
        arguments: body.getTypeArguments().map((argument) => argument.getType()),
      };
    }
  }
  const target = type.getTargetType()?.compilerType;
  return target === undefined ? undefined : { target, arguments: type.getTypeArguments() };
}

/** Generic constructor identity comes from the compiler declaration, never a type or utility name. */
export function genericTarget(type: Type): object | undefined {
  return genericDescriptor(type)?.target;
}

/** Peeling a supplied argument is finite nesting, not recursive construction: `Box<Box<Row>>` to `Box<Row>`.
 *  Arguments are used only to classify recurrence; they never become data-containment evidence. */
export function suppliedArgumentContains(outer: Type, inner: Type): boolean {
  const seen = new Set<object>();
  const pending = [...outer.getAliasTypeArguments(), ...outer.getTypeArguments()];
  for (let candidate = pending.pop(); candidate !== undefined; candidate = pending.pop()) {
    if (candidate.compilerType === inner.compilerType) {
      return true;
    }
    if (!seen.has(candidate.compilerType)) {
      seen.add(candidate.compilerType);
      pending.push(...candidate.getAliasTypeArguments(), ...candidate.getTypeArguments());
    }
  }
  return false;
}

export function genericArguments(type: Type): readonly Type[] {
  return genericDescriptor(type)?.arguments ?? [];
}

function containedTypeEdges(candidate: Type, context: TransportContext): readonly Type[] {
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript TypeFlags is a compiler-owned bitfield; only a substitution output is normalized.
  const substituted = (candidate.getFlags() & TypeFlags.Substitution) !== 0 ? [candidate.getApparentType()] : [];
  const aggregate = [...candidate.getUnionTypes(), ...candidate.getIntersectionTypes(), ...candidate.getTupleElements()];
  const properties = candidate.isObject() && aggregate.length === 0 && !candidate.isArray() ? candidate.getProperties() : [];
  const indices = [candidate.getNumberIndexType(), candidate.getStringIndexType()].flatMap((index) => (index === undefined ? [] : [index]));
  return [...aggregate, ...indices, ...substituted, ...properties.map((property) => property.getTypeAtLocation(context.location))];
}

function summaryContainment(candidate: Type, expected: Type, summary: ConstructorSummary, context: TransportContext): Containment {
  const arguments_ = genericArguments(candidate);
  const relationAt = (index: number): Containment => {
    const argument = arguments_[index];
    return argument === undefined ? "no" : typeExpressionContains(argument, expected, context);
  };
  const definite = [...summary.definite].map(relationAt);
  if (definite.includes("yes")) {
    return "yes";
  }
  const possible = [...summary.possible].map(relationAt);
  return definite.includes("possible") || possible.some((relation) => relation !== "no") || summary.outputs.has(expected.compilerType) ? "possible" : "no";
}

function summarizedContainment(candidate: Type, expected: Type, context: TransportContext): Containment | undefined {
  const target = genericTarget(candidate);
  const summary = target === undefined ? undefined : context.summaries.get(target);
  return summary === undefined ? undefined : summaryContainment(candidate, expected, summary, context);
}

export function strongestContainment(relations: readonly Containment[]): Containment {
  if (relations.includes("yes")) {
    return "yes";
  }
  return relations.includes("possible") ? "possible" : "no";
}

/** Does a resolved type expression retain another resolved type through its value-bearing shape?
 *  A recurrence target's properties are already represented by the recurrence state, so expanding them
 *  here would recreate the infinite graph. Its arguments are not evidence either: erased arguments and
 *  callable positions remain outside DATA CONTAINMENT. */
export function typeExpressionContains(type: Type, expected: Type, context: TransportContext): Containment {
  const cached = context.relations.get(type.compilerType)?.get(expected.compilerType);
  if (cached !== undefined) {
    return cached;
  }
  const seen = new Set<object>();
  const pending = [type];
  let contains: Containment = "no";
  for (let candidate = pending.pop(); candidate !== undefined; candidate = pending.pop()) {
    if (candidate.compilerType === expected.compilerType) {
      contains = "yes";
      break;
    }
    if (seen.has(candidate.compilerType)) {
      continue;
    }
    seen.add(candidate.compilerType);
    const relation = summarizedContainment(candidate, expected, context);
    if (relation !== undefined) {
      if (relation === "yes") {
        contains = "yes";
        break;
      }
      if (relation === "possible") {
        contains = "possible";
      }
      continue;
    }
    pending.push(...containedTypeEdges(candidate, context));
  }
  const relations = context.relations.get(type.compilerType) ?? new Map<object, Containment>();
  relations.set(expected.compilerType, contains);
  context.relations.set(type.compilerType, relations);
  return contains;
}

export interface TransportContext {
  readonly location: TypeNode;
  readonly relations: Map<object, Map<object, Containment>>;
  readonly summaries: ReadonlyMap<object, ConstructorSummary>;
}

export interface ConstructorSummary {
  readonly declaration: GenericDeclaration;
  readonly definite: Set<number>;
  readonly possible: Set<number>;
  readonly outputs: Map<object, Type>;
  readonly successors: Set<object>;
  recursive: boolean;
  unsupported: boolean;
}
