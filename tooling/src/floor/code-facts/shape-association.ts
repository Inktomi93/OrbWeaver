// A direct authored boundary associates declarations; structural resemblance never nominates an owner.
import type { InterfaceDeclaration, Node as MorphNode, TypeAliasDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { inventoryDeclarationKey } from "./semantic-inventory-reader.ts";
import type { ShapeAssociationRead, ShapeAssociationSite, ShapeAssociationUnknown } from "./shape-association-contract.ts";
import { SHAPE_ASSOCIATION_UNKNOWN } from "./shape-association-contract.ts";
import { readDeclaredParameters, readShapeConstituent } from "./shape-constituents.ts";
import { isHandWrittenShape } from "./shape-declaration.ts";
import { observedSymbolDeclarations, observedUltimateSymbol } from "./symbol-identity.ts";
import type { ObservedReference, ShapeConstituent, TypeObservationQuestion, TypeObservationReader } from "./type-observations-contract.ts";
import { nodeTypeSelector } from "./type-projection-contract.ts";

type ShapeDeclaration = InterfaceDeclaration | TypeAliasDeclaration;

/** Finite syntax only: explicit initializer/assignment, direct argument, or explicitly annotated own return. */
export function shapeAssociationSites(node: MorphNode): readonly ShapeAssociationSite[] {
  if (Node.isVariableDeclaration(node)) {
    const value = node.getInitializer();
    const target = node.getTypeNode();
    return value === undefined || target === undefined ? [] : [{ boundary: node, value, target }];
  }
  if (Node.isBinaryExpression(node) && node.getOperatorToken().isKind(SyntaxKind.EqualsToken)) {
    return [{ boundary: node, value: node.getRight(), target: node.getLeft(), assignment: true }];
  }
  if (Node.isCallExpression(node)) {
    return node.getArguments().flatMap((value, argument) => (Node.isExpression(value) ? [{ boundary: node, value, target: node, argument }] : []));
  }
  if (Node.isReturnStatement(node)) {
    const value = node.getExpression();
    const owner = node.getFirstAncestor(Node.isFunctionLikeDeclaration);
    const target = owner?.getReturnTypeNode();
    return value === undefined || target === undefined ? [] : [{ boundary: node, value, target }];
  }
  if (Node.isArrowFunction(node)) {
    const value = node.getBody();
    const target = node.getReturnTypeNode();
    return !Node.isExpression(value) || target === undefined ? [] : [{ boundary: node, value, target }];
  }
  return [];
}

/** Existing raw questions capture only nominated slots in the importing world's native program. */
export function shapeAssociationQuestions(sites: readonly ShapeAssociationSite[]): readonly TypeObservationQuestion[] {
  const typed = [...new Set(sites.flatMap((site) => [site.value, ...(site.argument === undefined ? [site.target] : [])]))];
  // `shape-constituents` walks every nominated call's parameters, so each call is also a `call-parameters` row.
  const calls = [...new Set([...sites.filter((site) => site.argument !== undefined).map((site) => site.target), ...typed.filter(Node.isCallExpression)])];
  const annotations = sites.flatMap((site) => {
    const annotation = site.argument === undefined ? annotationName(site.target) : undefined;
    return annotation === undefined ? [] : [annotation];
  });
  return [
    { kind: "node-types", nodes: [...new Set([...typed, ...annotations])] },
    { kind: "call-parameters", nodes: calls },
    { kind: "shape-constituents", nodes: [...new Set([...typed, ...calls])] },
  ];
}

function annotationName(node: MorphNode): MorphNode | undefined {
  if (!Node.isTypeReference(node)) {
    return;
  }
  const name = node.getTypeName();
  return Node.isQualifiedName(name) ? name.getRight() : name;
}

/** A named object shape: an interface or an alias whose body is a type literal. */
function ownShape(node: MorphNode): ShapeDeclaration | undefined {
  if (Node.isInterfaceDeclaration(node)) {
    return node;
  }
  if (Node.isTypeAliasDeclaration(node)) {
    return node.getTypeNode()?.getKind() === SyntaxKind.TypeLiteral ? node : undefined;
  }
  const parent = Node.isTypeLiteral(node) ? node.getParent() : undefined;
  return parent !== undefined && Node.isTypeAliasDeclaration(parent) ? parent : undefined;
}

// A library declaration comes from an installed package or a TypeScript lib file, never from a workspace source.
function isLibrary(node: MorphNode): boolean {
  return node.getSourceFile().isInNodeModules();
}

// A callable's parameters and return can carry a shape the walk does not read.
function isCallable(node: MorphNode): boolean {
  return Node.isFunctionLikeDeclaration(node) || Node.isFunctionTypeNode(node) || Node.isCallSignatureDeclaration(node) || Node.isMethodSignature(node);
}

// Callables, enums, modules and value literals are not object-shape declarations on either side of a boundary.
function isNotShape(node: MorphNode): boolean {
  return (
    isCallable(node) ||
    Node.isEnumDeclaration(node) ||
    Node.isEnumMember(node) ||
    Node.isModuleDeclaration(node) ||
    Node.isSourceFile(node) ||
    Node.isObjectLiteralExpression(node)
  );
}

function isNamedLibraryDeclaration(node: MorphNode): boolean {
  return Node.isInterfaceDeclaration(node) || Node.isClassDeclaration(node) || Node.isVariableDeclaration(node) || isNotShape(node);
}

function isAnonymousOrClass(node: MorphNode): boolean {
  return Node.isTypeLiteral(node) || Node.isClassDeclaration(node) || Node.isClassExpression(node);
}

/**
 * What one walked type says about shape ownership. `carried` holds a handwritten declaration inside a union,
 * intersection or type argument; `opaque` is a type whose walk cannot decide; `erased` has no identity at all.
 */
type ShapeIdentity =
  | { readonly kind: "none" }
  | { readonly kind: "named"; readonly declarations: readonly ShapeDeclaration[] }
  | { readonly kind: "carried"; readonly union: boolean }
  | { readonly kind: "opaque" }
  | { readonly kind: "erased" };

const NONE: ShapeIdentity = { kind: "none" };
const OPAQUE: ShapeIdentity = { kind: "opaque" };
const ERASED: ShapeIdentity = { kind: "erased" };

interface IdentityRead {
  readonly readers: TypeObservationReader;
  readonly isHand: (node: ShapeDeclaration) => boolean;
  readonly isProduction: (node: MorphNode) => boolean;
  readonly side: "value" | "boundary";
}

function declarationsOf(symbol: ObservedReference<"symbol"> | null, readers: TypeObservationReader): readonly MorphNode[] {
  return observedSymbolDeclarations(observedUltimateSymbol(symbol, readers), readers);
}

function named(declarations: readonly ShapeDeclaration[]): ShapeIdentity {
  return { kind: "named", declarations: [...new Map(declarations.map((declaration) => [inventoryDeclarationKey(declaration), declaration])).values()] };
}

function handsOf(identity: ShapeIdentity, read: IdentityRead): readonly ShapeDeclaration[] {
  return identity.kind === "named" ? identity.declarations.filter((node) => read.isHand(node) && isHandWrittenShape(node)) : [];
}

// A boundary part is decided when it is nothing, or a named shape no production declaration owns.
function unowned(identity: ShapeIdentity, read: IdentityRead): boolean {
  return identity.kind === "none" || (identity.kind === "named" && !identity.declarations.some(read.isProduction));
}

/** Fold contained parts: a value carries a hand if any part does; a boundary is decided only if every part is. */
function contained(parts: readonly ShapeIdentity[], read: IdentityRead, union: boolean): ShapeIdentity {
  if (read.side === "boundary") {
    return parts.every((part) => unowned(part, read)) ? NONE : OPAQUE;
  }
  if (parts.some((part) => part.kind === "carried" || handsOf(part, read).length > 0)) {
    return { kind: "carried", union };
  }
  return parts.every((part) => part.kind === "none" || part.kind === "named") ? NONE : OPAQUE;
}

function argumentsOf(constituent: ShapeConstituent, read: IdentityRead): ShapeIdentity {
  return contained(
    constituent.typeArguments.map((argument) => {
      const identity = constituentIdentity(argument, read);
      // A library generic is owned only through a production argument; an erased argument names none.
      return read.side === "boundary" && identity.kind === "erased" ? NONE : identity;
    }),
    read,
    false,
  );
}

function aliasIdentity(constituent: ShapeConstituent, declarations: readonly MorphNode[], read: IdentityRead): ShapeIdentity {
  const production = declarations.filter((node) => Node.isTypeAliasDeclaration(node) && read.isProduction(node));
  if (production.length > 0) {
    // A production alias owns its boundary; a value of it is production's unless an argument carries a hand.
    return read.side === "boundary" ? named(production.filter(Node.isTypeAliasDeclaration)) : argumentsOf(constituent, read);
  }
  const shapes = declarations.flatMap((node) => (isLibrary(node) ? [] : (ownShape(node) ?? [])));
  if (shapes.length > 0 && shapes.length === declarations.length) {
    const own = named(shapes);
    return handsOf(own, read).length > 0 || read.side === "boundary" ? own : argumentsOf(constituent, read);
  }
  // A library alias computes its structure (`Pick`, `z.infer`); a value carries its arguments' hands, while a
  // boundary may be a production shape the alias erased.
  return declarations.length > 0 && declarations.every(isLibrary) && read.side === "value" ? argumentsOf(constituent, read) : OPAQUE;
}

function symbolIdentity(constituent: ShapeConstituent, declarations: readonly MorphNode[], read: IdentityRead): ShapeIdentity {
  if (declarations.length === 0) {
    return OPAQUE;
  }
  if (declarations.every(isLibrary)) {
    // A named closed library type cannot hold a shape and a generic one is judged by its arguments. An anonymous
    // library structure (a mapped or inferred output) is no handwritten value, but production may own it as a boundary.
    if (declarations.every(isNamedLibraryDeclaration)) {
      return argumentsOf(constituent, read);
    }
    return read.side === "value" ? NONE : OPAQUE;
  }
  const shapes = declarations.flatMap((node) => ownShape(node) ?? []);
  if (shapes.length > 0) {
    const own = named(shapes);
    return handsOf(own, read).length > 0 || read.side === "boundary" ? own : contained([own, argumentsOf(constituent, read)], read, false);
  }
  return declarationIdentity(declarations, read);
}

// Declarations that are no named object shape: callables, enums, modules, literals and classes.
function declarationIdentity(declarations: readonly MorphNode[], read: IdentityRead): ShapeIdentity {
  if (declarations.some(isCallable)) {
    // A function value may return or accept a hand; a function boundary production declares may own one.
    return read.side === "value" || declarations.some(read.isProduction) ? OPAQUE : NONE;
  }
  if (declarations.every(isNotShape)) {
    return NONE;
  }
  if (declarations.every(isAnonymousOrClass)) {
    return read.side === "value" || !declarations.some(read.isProduction) ? NONE : OPAQUE;
  }
  return OPAQUE;
}

function constituentIdentity(constituent: ShapeConstituent | undefined, read: IdentityRead): ShapeIdentity {
  if (constituent === undefined) {
    return ERASED;
  }
  const { type } = constituent;
  if (type.any || type.unknown || type.typeParameter) {
    return ERASED;
  }
  if (type.never || constituent.primitive) {
    return NONE;
  }
  if (constituent.truncated) {
    return OPAQUE;
  }
  const alias = type.aliasSymbol === null ? [] : declarationsOf(type.aliasSymbol, read.readers);
  if (alias.some((node) => Node.isTypeAliasDeclaration(node) && read.isProduction(node))) {
    // A production alias owns its whole structure, even when that structure is a union or an intersection.
    return aliasIdentity(constituent, alias, read);
  }
  if (constituent.unions.length > 0) {
    return contained(
      constituent.unions.map((part) => constituentIdentity(part, read)),
      read,
      true,
    );
  }
  if (constituent.intersections.length > 0) {
    return contained(
      constituent.intersections.map((part) => constituentIdentity(part, read)),
      read,
      false,
    );
  }
  if (type.aliasSymbol !== null) {
    return aliasIdentity(constituent, alias, read);
  }
  if (type.symbol !== null) {
    return symbolIdentity(constituent, declarationsOf(type.symbol, read.readers), read);
  }
  if (constituent.typeArguments.length > 0) {
    return argumentsOf(constituent, read);
  }
  // A bare symbol-less type (`object`, `void`, `bigint`) may hold any value but no declaration owns it.
  return read.side === "value" ? OPAQUE : NONE;
}

function boundaryIdentity(site: ShapeAssociationSite, read: IdentityRead): ShapeIdentity | ShapeAssociationUnknown {
  const { readers } = read;
  if (site.assignment === true) {
    const targets = declarationsOf(readers.symbol(site.target), readers);
    if (
      !targets.some(
        (node) =>
          (Node.isVariableDeclaration(node) || Node.isParameterDeclaration(node) || Node.isPropertyDeclaration(node) || Node.isPropertySignature(node)) &&
          node.getTypeNode() !== undefined,
      )
    ) {
      return SHAPE_ASSOCIATION_UNKNOWN.unannotatedAssignment;
    }
  }
  const target = site.argument === undefined ? nodeTypeSelector(site.target) : readers.callParameters(site.target)?.[site.argument];
  if (target === undefined) {
    return SHAPE_ASSOCIATION_UNKNOWN.unresolvedParameter;
  }
  if (site.argument !== undefined) {
    // The resolved parameter of a generic callee is the argument's own type; production may constrain it to an owner.
    const declared = readDeclaredParameters(site.target, readers);
    if (declared !== undefined && read.isProduction(declared.declaration) && declared.generic[site.argument] === true) {
      return SHAPE_ASSOCIATION_UNKNOWN.genericParameter;
    }
  }
  const resolved = constituentIdentity(readShapeConstituent(target, readers), read);
  const annotation = site.argument === undefined ? annotationName(site.target) : undefined;
  // A computed production alias can erase its name from the resolved type; its annotation still names the owner.
  const declared = annotation === undefined ? [] : declarationsOf(readers.symbol(annotation), readers).filter((node) => read.isProduction(node));
  const owners = declared.flatMap((node) => (Node.isInterfaceDeclaration(node) || Node.isTypeAliasDeclaration(node) ? [node] : []));
  return owners.length > 0 ? named([...owners, ...(resolved.kind === "named" ? resolved.declarations : [])]) : resolved;
}

/** Missing registered observations throw; unsupported identities remain explicit unknowns, not acquittals. */
export function readShapeAssociation(
  site: ShapeAssociationSite,
  readers: TypeObservationReader,
  isHand: (node: ShapeDeclaration) => boolean,
  isProduction: (node: MorphNode) => boolean,
): ShapeAssociationRead {
  const value = constituentIdentity(readShapeConstituent(nodeTypeSelector(site.value), readers), { readers, isHand, isProduction, side: "value" });
  const hands = handsOf(value, { readers, isHand, isProduction, side: "value" });
  if (value.kind === "none" || (value.kind === "named" && hands.length === 0)) {
    return UNASSOCIATED;
  }
  if (value.kind === "carried" && value.union) {
    return unknown(SHAPE_ASSOCIATION_UNKNOWN.unionHand);
  }
  const read: IdentityRead = { readers, isHand, isProduction, side: "boundary" };
  const boundary = boundaryIdentity(site, read);
  const decided = typeof boundary === "object" && unowned(boundary, read);
  if (value.kind !== "named") {
    // A value whose shape is unseen can only matter at a boundary that a production declaration could own.
    return decided ? UNASSOCIATED : unknown(value.kind === "erased" ? SHAPE_ASSOCIATION_UNKNOWN.erasedValue : SHAPE_ASSOCIATION_UNKNOWN.opaqueValue);
  }
  return decided ? UNASSOCIATED : judgeHand(site, hands, boundary, isProduction);
}

const UNASSOCIATED: ShapeAssociationRead = { kind: "unassociated" };

function unknown(reason: ShapeAssociationUnknown): ShapeAssociationRead {
  return { kind: "unknown", reason };
}

function judgeHand(
  site: ShapeAssociationSite,
  hands: readonly ShapeDeclaration[],
  boundary: ShapeIdentity | ShapeAssociationUnknown,
  isProduction: (node: MorphNode) => boolean,
): ShapeAssociationRead {
  if (hands.length > 1) {
    return unknown(SHAPE_ASSOCIATION_UNKNOWN.manyHands);
  }
  if (typeof boundary === "string") {
    return unknown(boundary);
  }
  if (boundary.kind !== "named") {
    return unknown(SHAPE_ASSOCIATION_UNKNOWN.unsupportedBoundary);
  }
  const production = boundary.declarations.filter(isProduction);
  if (production.length > 1) {
    return unknown(SHAPE_ASSOCIATION_UNKNOWN.manyOwners);
  }
  const [hand] = hands;
  const [owner] = production;
  return hand === undefined || owner === undefined ? UNASSOCIATED : { kind: "associated", value: { hand, production: owner, boundary: site.boundary } };
}
