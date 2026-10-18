// A direct authored boundary associates declarations; structural resemblance never nominates an owner.
import type { InterfaceDeclaration, Node as MorphNode, TypeAliasDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { inventoryDeclarationKey } from "./semantic-inventory-reader.ts";
import type { ShapeAssociationRead, ShapeAssociationSite, ShapeAssociationUnknown } from "./shape-association-contract.ts";
import { SHAPE_ASSOCIATION_UNKNOWN } from "./shape-association-contract.ts";
import { isHandWrittenShape } from "./shape-declaration.ts";
import { observedSymbolDeclarations, observedUltimateSymbol } from "./symbol-identity.ts";
import type { ObservedTypeData, TypeObservationQuestion, TypeObservationReader } from "./type-observations-contract.ts";
import type { NativeTypeSelector } from "./type-projection-contract.ts";
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
  return [
    {
      kind: "node-types",
      nodes: [
        ...new Set(
          sites.flatMap((site) => {
            const annotation = site.argument === undefined ? annotationName(site.target) : undefined;
            return [site.value, ...(site.argument === undefined ? [site.target] : []), ...(annotation === undefined ? [] : [annotation])];
          }),
        ),
      ],
    },
    { kind: "call-parameters", nodes: [...new Set(sites.filter((site) => site.argument !== undefined).map((site) => site.target))] },
  ];
}

function annotationName(node: MorphNode): MorphNode | undefined {
  if (!Node.isTypeReference(node)) {
    return;
  }
  const name = node.getTypeName();
  return Node.isQualifiedName(name) ? name.getRight() : name;
}

function shapeDeclaration(node: MorphNode): ShapeDeclaration | undefined {
  if (Node.isInterfaceDeclaration(node) || Node.isTypeAliasDeclaration(node)) {
    return node;
  }
  const parent = Node.isTypeLiteral(node) ? node.getParent() : undefined;
  return parent !== undefined && Node.isTypeAliasDeclaration(parent) ? parent : undefined;
}

function erased(type: ObservedTypeData): boolean {
  return type.any || type.unknown || type.typeParameter;
}

function namedDeclarations(types: readonly ObservedTypeData[], readers: TypeObservationReader): readonly ShapeDeclaration[] {
  return [
    ...new Map(
      types.flatMap((type) =>
        [type.aliasSymbol, type.symbol].flatMap((symbol) =>
          observedSymbolDeclarations(observedUltimateSymbol(symbol, readers), readers).flatMap((node) => {
            const declaration = shapeDeclaration(node);
            return declaration === undefined ? [] : [[inventoryDeclarationKey(declaration), declaration] as const];
          }),
        ),
      ),
    ).values(),
  ];
}

/** A whole named boundary type; erased and union boundaries have no single owner. */
function boundaryDeclarations(selector: NativeTypeSelector, readers: TypeObservationReader): readonly ShapeDeclaration[] | undefined {
  const reference = readers.select(selector);
  if (reference === null) {
    return;
  }
  const type = readers.type(reference);
  return erased(type) || type.unionCount > 0 ? undefined : namedDeclarations([type], readers);
}

// A value union carries every constituent's declarations; one erased constituent erases the value.
function valueDeclarations(
  selector: NativeTypeSelector,
  readers: TypeObservationReader,
): { readonly declarations: readonly ShapeDeclaration[]; readonly union: boolean } | undefined {
  const reference = readers.select(selector);
  if (reference === null) {
    return;
  }
  const type = readers.type(reference);
  if (erased(type)) {
    return;
  }
  if (type.unionCount === 0) {
    return { declarations: namedDeclarations([type], readers), union: false };
  }
  const parts = readers.unions(selector).map((part) => {
    const selected = readers.select(part);
    return selected === null ? undefined : readers.type(selected);
  });
  return parts.every((part): part is ObservedTypeData => part !== undefined && !erased(part))
    ? { declarations: namedDeclarations(parts, readers), union: true }
    : undefined;
}

function boundaryOwners(site: ShapeAssociationSite, readers: TypeObservationReader): readonly ShapeDeclaration[] | ShapeAssociationUnknown {
  if (site.assignment === true) {
    const targets = observedSymbolDeclarations(observedUltimateSymbol(readers.symbol(site.target), readers), readers);
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
  const annotation = site.argument === undefined ? annotationName(site.target) : undefined;
  const owners =
    annotation === undefined
      ? boundaryDeclarations(target, readers)
      : observedSymbolDeclarations(observedUltimateSymbol(readers.symbol(annotation), readers), readers).flatMap((node) => shapeDeclaration(node) ?? []);
  return owners === undefined || owners.length === 0 ? SHAPE_ASSOCIATION_UNKNOWN.unsupportedBoundary : owners;
}

/** Missing registered observations throw; unsupported identities remain explicit unknowns, not acquittals. */
export function readShapeAssociation(
  site: ShapeAssociationSite,
  readers: TypeObservationReader,
  isHand: (node: ShapeDeclaration) => boolean,
  isProduction: (node: ShapeDeclaration) => boolean,
): ShapeAssociationRead {
  const unassociated: ShapeAssociationRead = { kind: "unassociated" };
  const unknown = (reason: ShapeAssociationUnknown): ShapeAssociationRead => ({ kind: "unknown", reason });
  const value = valueDeclarations(nodeTypeSelector(site.value), readers);
  const hands = value?.declarations.filter((node) => isHand(node) && isHandWrittenShape(node));
  if (hands !== undefined && hands.length === 0) {
    return unassociated;
  }
  if (value?.union === true) {
    return unknown(SHAPE_ASSOCIATION_UNKNOWN.unionHand);
  }
  if (hands !== undefined && hands.length > 1) {
    return unknown(SHAPE_ASSOCIATION_UNKNOWN.manyHands);
  }
  const owners = boundaryOwners(site, readers);
  if (hands === undefined) {
    // An erased value can only matter at a boundary that a production declaration could own.
    return typeof owners !== "string" && !owners.some(isProduction) ? unassociated : unknown(SHAPE_ASSOCIATION_UNKNOWN.erasedValue);
  }
  if (typeof owners === "string") {
    return unknown(owners);
  }
  const production = owners.filter(isProduction);
  if (production.length > 1) {
    return unknown(SHAPE_ASSOCIATION_UNKNOWN.manyOwners);
  }
  const [hand] = hands;
  const [owner] = production;
  return hand === undefined || owner === undefined ? unassociated : { kind: "associated", value: { hand, production: owner, boundary: site.boundary } };
}
