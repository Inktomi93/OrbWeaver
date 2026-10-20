// The finite boundary syntax a shape association reads, and the observation questions it nominates up front.
import type { CallExpression, Node as MorphNode, NewExpression, TypeNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { ShapeAssociationSite } from "./shape-association-contract.ts";
import type { TypeObservationQuestion } from "./type-observations-contract.ts";

/** Finite syntax only: annotated initializer (variable, class property, parameter default), assignment, direct argument, or annotated own return. */
export function shapeAssociationSites(node: MorphNode): readonly ShapeAssociationSite[] {
  if (Node.isVariableDeclaration(node) || Node.isPropertyDeclaration(node) || Node.isParameterDeclaration(node)) {
    return annotatedSite(node, node.getInitializer(), node.getTypeNode());
  }
  if (Node.isBinaryExpression(node) && node.getOperatorToken().isKind(SyntaxKind.EqualsToken)) {
    return [{ boundary: node, value: node.getRight(), target: node.getLeft(), assignment: true }];
  }
  if (Node.isCallExpression(node) || Node.isNewExpression(node)) {
    return argumentSites(node);
  }
  if (Node.isReturnStatement(node)) {
    return annotatedSite(node, node.getExpression(), node.getFirstAncestor(Node.isFunctionLikeDeclaration)?.getReturnTypeNode());
  }
  return Node.isArrowFunction(node) ? annotatedSite(node, node.getBody(), node.getReturnTypeNode()) : [];
}

function annotatedSite(boundary: MorphNode, value: MorphNode | undefined, target: MorphNode | undefined): readonly ShapeAssociationSite[] {
  return Node.isExpression(value) && target !== undefined ? [{ boundary, value, target }] : [];
}

// A constructor's parameters are not observed by the call-parameter walk, so a `new` argument is a counted UNKNOWN.
function argumentSites(node: CallExpression | NewExpression): readonly ShapeAssociationSite[] {
  const constructed = Node.isNewExpression(node) ? { constructed: true } : {};
  return node
    .getArguments()
    .flatMap((value, argument) => (Node.isExpression(value) ? [{ boundary: node, value, target: node, argument, ...constructed }] : []));
}

function referenceNodes(name: MorphNode, args: readonly TypeNode[]): readonly MorphNode[] {
  return [
    name,
    ...args.flatMap((argument) => {
      const inner = annotationName(argument);
      return Node.isTypeReference(argument) && inner !== undefined ? referenceNodes(inner, argument.getTypeArguments()) : [];
    }),
  ];
}

/** The base references of an interface and of a reference alias, with their type arguments; registered up front because the read walks lineage by symbol. */
export function baseReferences(node: MorphNode): readonly MorphNode[] {
  if (Node.isInterfaceDeclaration(node)) {
    return node.getExtends().flatMap((base) => referenceNodes(base.getExpression(), base.getTypeArguments()));
  }
  const body = Node.isTypeAliasDeclaration(node) ? node.getTypeNode() : undefined;
  const name = body === undefined ? undefined : annotationName(body);
  return body !== undefined && Node.isTypeReference(body) && name !== undefined ? referenceNodes(name, body.getTypeArguments()) : [];
}

/** Existing raw questions capture only nominated slots in the importing world's native program. */
export function shapeAssociationQuestions(sites: readonly ShapeAssociationSite[], heritage: readonly MorphNode[] = []): readonly TypeObservationQuestion[] {
  const typed = [...new Set(sites.flatMap((site) => [site.value, ...(site.argument === undefined ? [site.target] : [])]))];
  // `shape-constituents` walks every nominated call's parameters, so each call is also a `call-parameters` row.
  const calls = [
    ...new Set([
      ...sites.filter((site) => site.argument !== undefined && site.constructed !== true).map((site) => site.target),
      ...typed.filter(Node.isCallExpression),
    ]),
  ];
  const annotations = sites.flatMap((site) => {
    const annotation = site.argument === undefined ? annotationName(site.target) : undefined;
    return annotation === undefined ? [] : [annotation];
  });
  return [
    { kind: "node-types", nodes: [...new Set([...typed, ...annotations, ...heritage])] },
    { kind: "call-parameters", nodes: calls },
    { kind: "shape-constituents", nodes: [...new Set([...typed, ...calls])] },
  ];
}

/** The referenced name of a type-reference annotation, its right side when qualified. */
export function annotationName(node: MorphNode): MorphNode | undefined {
  if (!Node.isTypeReference(node)) {
    return;
  }
  const name = node.getTypeName();
  return Node.isQualifiedName(name) ? name.getRight() : name;
}
