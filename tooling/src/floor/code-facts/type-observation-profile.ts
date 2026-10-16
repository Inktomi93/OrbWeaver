// The fixed authored-slot profile closes raw questions, never schema ownership or parity verdicts.

import type { Expression, Node as MorphNode, PropertyDeclaration, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { observeRawQuestions } from "./type-observation-questions.ts";
import type { TypeObservationCaptureOwner, TypeObservationDemand, TypeObservationReader } from "./type-observations-contract.ts";
import { ZOD_OUTPUT_PROPERTY } from "./type-observations-contract.ts";
import type { NativeTypeSelector } from "./type-projection-contract.ts";
import { nodeTypeSelector, typeArgumentSelector } from "./type-projection-contract.ts";
import { memberTypeAtPath } from "./type-slot-path.ts";
import { aggregateCallPath, contextualExpressions, ownReturnExpressions, unwrapTypeExpression } from "./type-slot-syntax.ts";

/** The same deterministic profile runs against capture and delivered evidence, so truncated questions refuse. */
export function observeAuthoredTypeSlots(
  demand: TypeObservationDemand,
  readers: TypeObservationReader,
  profile?: TypeObservationCaptureOwner["profile"],
  references?: TypeObservationCaptureOwner["references"],
): void {
  if (demand.questions !== undefined) {
    observeRawQuestions(demand, readers, profile, references);
    return;
  }
  const seen = new Set<MorphNode>();
  const pairs = new Map<MorphNode, Set<MorphNode>>();
  const pending: MorphNode[] = [...demand.nodes];
  const sources = new Set(demand.sources);
  const ownerSources = new Set<MorphNode>();
  const info = (selector: NativeTypeSelector): ReturnType<TypeObservationReader["type"]> | undefined => {
    const value = readers.select(selector);
    return value === null ? undefined : readers.type(value);
  };
  const output = (selector: NativeTypeSelector, at: MorphNode): NativeTypeSelector => ({
    ...selector,
    steps: [...selector.steps, { kind: "property", name: ZOD_OUTPUT_PROPERTY, at }],
  });
  const basic = (selector: NativeTypeSelector): void => {
    readers.select(selector);
    readers.select(typeArgumentSelector(selector));
    if (selector.base.kind !== "schema-column") {
      readers.select(output(selector, selector.base.node));
    }
  };
  const pair = (target: NativeTypeSelector, expression: Expression, carrier: MorphNode): void => {
    const expected = typeArgumentSelector(target);
    const actual = output(nodeTypeSelector(unwrapTypeExpression(expression)), unwrapTypeExpression(expression));
    if (readers.select(expected) !== null && readers.select(actual) !== null) {
      readers.relation(actual, expected);
      readers.display(actual, carrier);
      readers.display(expected, carrier);
    }
  };
  const parameterRelation = (unwrapped: Expression, target: NativeTypeSelector): void => {
    if (Node.isIdentifier(unwrapped)) {
      const symbol = readers.symbol(unwrapped);
      const declarations = symbol === null ? [] : readers.symbolData(symbol).declarations;
      for (const parameter of declarations.filter(Node.isParameterDeclaration)) {
        const parameterOutput = typeArgumentSelector(nodeTypeSelector(parameter));
        const contextualOutput = typeArgumentSelector(target);
        basic(nodeTypeSelector(parameter));
        if (readers.select(parameterOutput) !== null && readers.select(contextualOutput) !== null) {
          readers.relation(parameterOutput, contextualOutput);
        }
      }
    }
  };
  const contextual = (expression: Expression, carrier: MorphNode): void => {
    let carriers = pairs.get(expression);
    if (carriers === undefined) {
      carriers = new Set();
      pairs.set(expression, carriers);
    }
    if (carriers.has(carrier)) {
      return;
    }
    carriers.add(carrier);
    const unwrapped = unwrapTypeExpression(expression);
    if (Node.isPropertyAccessExpression(unwrapped)) {
      readers.symbol(unwrapped.getNameNode());
      readers.computedNames(nodeTypeSelector(unwrapped.getExpression()));
    }
    const target = nodeTypeSelector(expression, "contextual");
    if (readers.select(output(nodeTypeSelector(unwrapped), unwrapped)) === null) {
      return;
    }
    if (readers.select(target) === null) {
      return;
    }
    basic(target);
    pair(target, expression, carrier);
    parameterRelation(unwrapped, target);
  };
  const graph = (selector: NativeTypeSelector, at: MorphNode): void => {
    const visited = new Set<object>();
    const visit = (current: NativeTypeSelector): void => {
      const data = info(current);
      if (data === undefined) {
        return;
      }
      basic(current);
      // Children are canonical references for this native identity/location, so cycles cannot invent paths.
      const unions = readers.unions(current);
      const properties = readers.properties(current, at);
      if (visited.has(data.key)) {
        return;
      }
      visited.add(data.key);
      for (const part of unions) {
        visit(part);
      }
      for (const property of properties) {
        visit(property.selector);
      }
    };
    visit(selector);
  };
  const signature = (call: import("ts-morph").CallExpression): void => {
    const needed = call
      .getArguments()
      .some(
        (argument) =>
          Node.isExpression(argument) &&
          readers.select(output(nodeTypeSelector(unwrapTypeExpression(argument)), unwrapTypeExpression(argument))) !== null &&
          readers.select(nodeTypeSelector(argument, "contextual")) !== null,
      );
    if (!needed) {
      return;
    }
    const slots = readers.signature(call);
    if (slots === null) {
      return;
    }
    for (const parameter of slots.parameters) {
      basic(parameter);
    }
  };
  const member = (node: MorphNode, expression: Expression): void => {
    contextual(expression, expression);
    const path = aggregateCallPath(node, expression);
    if (
      path === undefined ||
      path.call.getTypeArguments().length > 0 ||
      readers.select(output(nodeTypeSelector(unwrapTypeExpression(expression)), unwrapTypeExpression(expression))) === null ||
      readers.select(nodeTypeSelector(expression, "contextual")) === null
    ) {
      return;
    }
    const slots = readers.signature(path.call);
    if (slots === null || !Node.isFunctionLikeDeclaration(slots.declaration)) {
      return;
    }
    const index = path.call.getArguments().indexOf(path.argument);
    const parameter = slots.declaration.getParameters()[index];
    const selected = slots.parameters[index];
    if (parameter === undefined || selected === undefined) {
      return;
    }
    basic(selected);
    const nested = memberTypeAtPath(selected, path, { owner: slots.declaration, location: parameter, readers });
    if (nested !== undefined) {
      readers.depends(nested, slots.declaration, parameter);
    }
  };
  const followDeclaration = (declaration: MorphNode): void => {
    if ((Node.isVariableDeclaration(declaration) || Node.isPropertyDeclaration(declaration)) && declaration.getInitializer() !== undefined) {
      pending.push(declaration);
      const source = declaration.getSourceFile();
      if (!ownerSources.has(source)) {
        ownerSources.add(source);
        pending.push(...source.getDescendantsOfKind(SyntaxKind.TypeReference));
      }
    }
    if (Node.isFunctionDeclaration(declaration) && (sources.has(declaration.getSourceFile()) || declaration.getBody() !== undefined)) {
      pending.push(declaration);
    }
  };
  const follow = (node: MorphNode): void => {
    const symbol = readers.symbol(node);
    if (symbol === null) {
      return;
    }
    const canonical = readers.symbolData(symbol).canonical;
    for (const declaration of readers.symbolData(canonical).declarations) {
      followDeclaration(declaration);
    }
  };
  const exportSlots = (source: MorphNode): void => {
    if (!Node.isSourceFile(source)) {
      throw new Error("native type observation export demand is not a source file");
    }
    for (const symbol of readers.exports(source)) {
      for (const declaration of readers.symbolData(symbol).declarations) {
        if (Node.isExportSpecifier(declaration)) {
          readers.localTarget(declaration);
        }
      }
    }
    readers.defaultExport(source);
  };
  for (const source of demand.sources) {
    exportSlots(source);
  }
  const relevant = (node: MorphNode): boolean =>
    sources.has(node) ||
    demand.nodes.includes(node) ||
    Node.isExpression(node) ||
    Node.isTypeNode(node) ||
    Node.isQualifiedName(node) ||
    Node.isParameterDeclaration(node) ||
    Node.isVariableDeclaration(node) ||
    Node.isPropertyDeclaration(node) ||
    Node.isFunctionLikeDeclaration(node) ||
    Node.isClassDeclaration(node) ||
    Node.isTypeParameterDeclaration(node) ||
    Node.isPropertyAssignment(node) ||
    Node.isShorthandPropertyAssignment(node) ||
    Node.isExportSpecifier(node) ||
    Node.isSpreadAssignment(node) ||
    Node.isSpreadElement(node);
  const functionSlots = (node: MorphNode): void => {
    if (Node.isFunctionDeclaration(node) || Node.isFunctionExpression(node) || Node.isArrowFunction(node)) {
      basic(nodeTypeSelector(node, "return"));
      const returnType = node.getReturnTypeNode();
      if (returnType !== undefined) {
        basic(nodeTypeSelector(returnType));
      }
      for (const expression of ownReturnExpressions(node)) {
        contextual(expression, expression);
      }
    }
  };
  const valueSlots = (node: MorphNode): void => {
    readers.symbol(node);
    basic(nodeTypeSelector(node));
    if (Node.isIdentifier(node) || Node.isPropertyAccessExpression(node)) {
      follow(node);
    }
    if (Node.isPropertyDeclaration(node)) {
      const owner = node.getFirstAncestor(Node.isClassDeclaration);
      if (owner !== undefined) {
        readers.symbol(owner);
      }
    }
    if (Node.isVariableDeclaration(node)) {
      for (const returned of readers.callReturns(node)) {
        basic(returned);
      }
    }
    functionSlots(node);
    if (Node.isExpression(node)) {
      contextual(node, node);
    }
  };
  const annotationSlots = (node: VariableDeclaration | PropertyDeclaration): void => {
    const initial = node.getInitializer();
    const target = node.getTypeNode();
    if (initial !== undefined) {
      contextual(initial, node.getNameNode());
    }
    if (initial !== undefined && target !== undefined) {
      basic(nodeTypeSelector(target));
      pair(nodeTypeSelector(target), initial, node.getNameNode());
    }
  };
  const castSlots = (node: MorphNode): void => {
    if (Node.isAsExpression(node) || Node.isSatisfiesExpression(node) || Node.isTypeAssertion(node)) {
      const target = node.getTypeNode();
      if (target !== undefined) {
        basic(nodeTypeSelector(target));
        pair(nodeTypeSelector(target), node.getExpression(), node);
      }
    }
  };
  const pairSlots = (node: MorphNode): void => {
    if (Node.isVariableDeclaration(node) || Node.isPropertyDeclaration(node)) {
      annotationSlots(node);
    }
    castSlots(node);
    if (Node.isPropertyAssignment(node)) {
      const initial = node.getInitializer();
      if (initial !== undefined) {
        contextual(initial, node.getNameNode());
      }
    }
    if (Node.isShorthandPropertyAssignment(node)) {
      contextual(node.getNameNode(), node.getNameNode());
    }
  };
  const memberSlots = (node: MorphNode): void => {
    for (const expression of contextualExpressions(node)) {
      member(node, expression);
    }
    if (Node.isCallExpression(node)) {
      signature(node);
    }
    if (Node.isSpreadAssignment(node) || Node.isSpreadElement(node)) {
      graph(nodeTypeSelector(node.getExpression()), node.getExpression());
    }
  };
  for (const root of pending) {
    for (const node of [root, ...root.getDescendants()]) {
      if (seen.has(node)) {
        continue;
      }
      seen.add(node);
      if (!relevant(node)) {
        continue;
      }
      valueSlots(node);
      pairSlots(node);
      memberSlots(node);
    }
  }
}
