// THE SOURCE-LOCAL IMMUTABLE ALIAS CLOSURE — which bindings in one file denote the same value through
// const aliases, destructuring, array/object assignment and `Object.assign` targets — as an undirected
// edge graph over compiler symbols (`aliasEdges`), plus the three primitives it and the write scan both
// read (`lexicalReferenceSymbol`, `rootIdentifier`, `unwrapTarget`). Split out of `reference-fact-writes.ts`
// at the size cap (2026-09-18): the graph is a VALUE, the write/mutation/invocation closures in that module
// are its consumers, and the direction is one-way — this module imports nothing from it.
import { descendantsOfKind } from "@orb/tooling/_shared/ts-workspace";
import type { Identifier, Node as MorphNode, Symbol as MorphSymbol, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";

/** Shorthand references denote their value binding, not the synthesized object-property symbol. */
export function lexicalReferenceSymbol(identifier: Identifier): MorphSymbol | undefined {
  const parent = identifier.getParent();
  return Node.isShorthandPropertyAssignment(parent) && parent.getNameNode() === identifier ? parent.getValueSymbol() : identifier.getSymbol();
}

export function rootIdentifier(raw: MorphNode): Identifier | undefined {
  let node = raw;
  for (;;) {
    if (
      Node.isParenthesizedExpression(node) ||
      Node.isAsExpression(node) ||
      Node.isSatisfiesExpression(node) ||
      Node.isNonNullExpression(node) ||
      Node.isPropertyAccessExpression(node) ||
      Node.isElementAccessExpression(node)
    ) {
      node = node.getExpression();
      continue;
    }
    return Node.isIdentifier(node) ? node : undefined;
  }
}

export function unwrapTarget(raw: MorphNode): MorphNode {
  let node = raw;
  while (Node.isParenthesizedExpression(node) || Node.isAsExpression(node) || Node.isSatisfiesExpression(node) || Node.isNonNullExpression(node)) {
    node = node.getExpression();
  }
  return node;
}

function connect(edges: Map<object, Set<object>>, left: object, right: object): void {
  (edges.get(left) ?? edges.set(left, new Set()).get(left))?.add(right);
  (edges.get(right) ?? edges.set(right, new Set()).get(right))?.add(left);
}

function connectBindingName(name: MorphNode, origin: object, edges: Map<object, Set<object>>): void {
  if (Node.isIdentifier(name)) {
    const symbol = name.getSymbol();
    if (symbol !== undefined) {
      connect(edges, symbol.compilerSymbol, origin);
    }
    return;
  }
  if (!(Node.isObjectBindingPattern(name) || Node.isArrayBindingPattern(name))) {
    return;
  }
  for (const binding of name.getElements()) {
    if (Node.isBindingElement(binding)) {
      connectBindingName(binding.getNameNode(), origin, edges);
    }
  }
}

function staticPropertyName(node: MorphNode): string | undefined {
  let name: string | undefined;
  if (Node.isIdentifier(node)) {
    name = node.getText();
  } else if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
    name = node.getLiteralText();
  } else if (Node.isNumericLiteral(node)) {
    name = String(node.getLiteralValue());
  } else if (Node.isComputedPropertyName(node)) {
    const expression = unwrapTarget(node.getExpression());
    if (Node.isStringLiteral(expression) || Node.isNoSubstitutionTemplateLiteral(expression)) {
      name = expression.getLiteralText();
    } else if (Node.isNumericLiteral(expression)) {
      name = String(expression.getLiteralValue());
    }
  }
  return name;
}

function exactObjectValue(object: import("ts-morph").ObjectLiteralExpression, name: string): MorphNode | undefined {
  if (object.getProperties().some(Node.isSpreadAssignment)) {
    return;
  }
  const matches: MorphNode[] = [];
  for (const property of object.getProperties()) {
    if (Node.isShorthandPropertyAssignment(property) && property.getName() === name) {
      matches.push(property.getNameNode());
    } else if (Node.isPropertyAssignment(property) && staticPropertyName(property.getNameNode()) === name) {
      matches.push(property.getInitializerOrThrow());
    }
  }
  return matches.length === 1 ? matches[0] : undefined;
}

function connectIdentifierValue(name: Identifier, value: MorphNode, edges: Map<object, Set<object>>): void {
  const target = name.getSymbol();
  const originId = rootIdentifier(value);
  const origin = originId === undefined ? undefined : lexicalReferenceSymbol(originId);
  if (target !== undefined && origin !== undefined) {
    connect(edges, target.compilerSymbol, origin.compilerSymbol);
  }
}

function connectArrayBindingValue(
  name: import("ts-morph").ArrayBindingPattern,
  value: import("ts-morph").ArrayLiteralExpression,
  edges: Map<object, Set<object>>,
): void {
  const values = value.getElements();
  for (const [index, binding] of name.getElements().entries()) {
    const element = values[index];
    if (
      !Node.isBindingElement(binding) ||
      binding.getDotDotDotToken() !== undefined ||
      binding.getInitializer() !== undefined ||
      element === undefined ||
      Node.isOmittedExpression(element) ||
      Node.isSpreadElement(element)
    ) {
      continue;
    }
    connectBindingValue(binding.getNameNode(), element, edges);
  }
}

function connectObjectBindingValue(
  name: import("ts-morph").ObjectBindingPattern,
  value: import("ts-morph").ObjectLiteralExpression,
  edges: Map<object, Set<object>>,
): void {
  for (const binding of name.getElements()) {
    if (binding.getDotDotDotToken() !== undefined || binding.getInitializer() !== undefined) {
      continue;
    }
    const propertyName = staticPropertyName(binding.getPropertyNameNode() ?? binding.getNameNode());
    const propertyValue = propertyName === undefined ? undefined : exactObjectValue(value, propertyName);
    if (propertyValue !== undefined) {
      connectBindingValue(binding.getNameNode(), propertyValue, edges);
    }
  }
}

function connectBindingValue(name: MorphNode, rawValue: MorphNode, edges: Map<object, Set<object>>): void {
  const value = unwrapTarget(rawValue);
  if (Node.isIdentifier(name)) {
    connectIdentifierValue(name, value, edges);
  } else if (Node.isArrayBindingPattern(name) && Node.isArrayLiteralExpression(value)) {
    connectArrayBindingValue(name, value, edges);
  } else if (Node.isObjectBindingPattern(name) && Node.isObjectLiteralExpression(value)) {
    connectObjectBindingValue(name, value, edges);
  }
}

function connectArrayTarget(target: import("ts-morph").ArrayLiteralExpression, origin: object, edges: Map<object, Set<object>>): void {
  for (const element of target.getElements()) {
    if (!Node.isOmittedExpression(element)) {
      connectAssignmentTarget(Node.isSpreadElement(element) ? element.getExpression() : element, origin, edges);
    }
  }
}

function connectObjectTarget(target: import("ts-morph").ObjectLiteralExpression, origin: object, edges: Map<object, Set<object>>): void {
  for (const property of target.getProperties()) {
    if (Node.isShorthandPropertyAssignment(property)) {
      const symbol = property.getValueSymbol();
      if (symbol !== undefined) {
        connect(edges, symbol.compilerSymbol, origin);
      }
    } else if (Node.isPropertyAssignment(property)) {
      connectAssignmentTarget(property.getInitializerOrThrow(), origin, edges);
    } else if (Node.isSpreadAssignment(property)) {
      connectAssignmentTarget(property.getExpression(), origin, edges);
    }
  }
}

function connectAssignmentTarget(raw: MorphNode, origin: object, edges: Map<object, Set<object>>): void {
  const target = unwrapTarget(raw);
  if (Node.isIdentifier(target)) {
    connectBindingName(target, origin, edges);
  } else if (Node.isArrayLiteralExpression(target)) {
    connectArrayTarget(target, origin, edges);
  } else if (Node.isObjectLiteralExpression(target)) {
    connectObjectTarget(target, origin, edges);
  }
}

function connectIdentifierAssignment(target: Identifier, value: MorphNode, edges: Map<object, Set<object>>): void {
  const targetSymbol = lexicalReferenceSymbol(target);
  const originId = rootIdentifier(value);
  const origin = originId === undefined ? undefined : lexicalReferenceSymbol(originId);
  if (targetSymbol !== undefined && origin !== undefined) {
    connect(edges, targetSymbol.compilerSymbol, origin.compilerSymbol);
  }
}

function connectArrayAssignmentValue(
  target: import("ts-morph").ArrayLiteralExpression,
  value: import("ts-morph").ArrayLiteralExpression,
  edges: Map<object, Set<object>>,
): void {
  const values = value.getElements();
  for (const [index, element] of target.getElements().entries()) {
    const origin = values[index];
    if (
      Node.isOmittedExpression(element) ||
      Node.isSpreadElement(element) ||
      origin === undefined ||
      Node.isOmittedExpression(origin) ||
      Node.isSpreadElement(origin)
    ) {
      continue;
    }
    connectAssignmentValue(element, origin, edges);
  }
}

function assignmentProperty(property: MorphNode): { readonly name: string; readonly target: MorphNode } | undefined {
  let assignment: { readonly name: string; readonly target: MorphNode } | undefined;
  if (Node.isShorthandPropertyAssignment(property)) {
    assignment = { name: property.getName(), target: property.getNameNode() };
  } else if (Node.isPropertyAssignment(property)) {
    const name = staticPropertyName(property.getNameNode());
    const target = property.getInitializer();
    assignment = name === undefined || target === undefined ? undefined : { name, target };
  }
  return assignment;
}

function connectObjectAssignmentValue(
  target: import("ts-morph").ObjectLiteralExpression,
  value: import("ts-morph").ObjectLiteralExpression,
  edges: Map<object, Set<object>>,
): void {
  for (const property of target.getProperties()) {
    const assignment = assignmentProperty(property);
    const origin = assignment === undefined ? undefined : exactObjectValue(value, assignment.name);
    if (assignment !== undefined && origin !== undefined) {
      connectAssignmentValue(assignment.target, origin, edges);
    }
  }
}

function connectAssignmentValue(rawTarget: MorphNode, rawValue: MorphNode, edges: Map<object, Set<object>>): void {
  const target = unwrapTarget(rawTarget);
  const value = unwrapTarget(rawValue);
  if (Node.isIdentifier(target)) {
    connectIdentifierAssignment(target, value, edges);
  } else if (Node.isArrayLiteralExpression(target) && Node.isArrayLiteralExpression(value)) {
    connectArrayAssignmentValue(target, value, edges);
  } else if (Node.isObjectLiteralExpression(target) && Node.isObjectLiteralExpression(value)) {
    connectObjectAssignmentValue(target, value, edges);
  }
}

function connectDeclarationAlias(declaration: import("ts-morph").VariableDeclaration, edges: Map<object, Set<object>>): void {
  const name = declaration.getNameNode();
  const initializer = declaration.getInitializer();
  if (initializer !== undefined && (Node.isArrayBindingPattern(name) || Node.isObjectBindingPattern(name))) {
    const value = unwrapTarget(initializer);
    if (Node.isArrayLiteralExpression(value) || Node.isObjectLiteralExpression(value)) {
      connectBindingValue(name, value, edges);
      return;
    }
  }
  const origin = initializer === undefined ? undefined : rootIdentifier(initializer)?.getSymbol()?.compilerSymbol;
  if (origin === undefined) {
    return;
  }
  connectBindingName(name, origin, edges);
}

export function aliasEdges(sourceFile: SourceFile): Map<object, Set<object>> {
  const edges = new Map<object, Set<object>>();
  for (const declaration of descendantsOfKind(sourceFile, SyntaxKind.VariableDeclaration)) {
    connectDeclarationAlias(declaration, edges);
  }
  for (const assignment of descendantsOfKind(sourceFile, SyntaxKind.BinaryExpression)) {
    if (assignment.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) {
      continue;
    }
    const left = unwrapTarget(assignment.getLeft());
    const right = unwrapTarget(assignment.getRight());
    if (
      (Node.isArrayLiteralExpression(left) && Node.isArrayLiteralExpression(right)) ||
      (Node.isObjectLiteralExpression(left) && Node.isObjectLiteralExpression(right))
    ) {
      connectAssignmentValue(left, right, edges);
      continue;
    }
    const origin = rootIdentifier(right)?.getSymbol()?.compilerSymbol;
    if (origin !== undefined) {
      connectAssignmentTarget(assignment.getLeft(), origin, edges);
    }
  }
  return edges;
}
