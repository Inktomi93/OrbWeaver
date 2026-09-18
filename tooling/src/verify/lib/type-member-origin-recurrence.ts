// The least-fixed-point solver over declared generic constructors: for each generic interface/type-alias
// declaration reachable from an annotation, which type-parameter positions carry DEFINITE vs POSSIBLE data,
// and which concrete output types does an unsupported (dependent conditional/mapped) position produce.
// `constructorSummaries` is the one export the graph walk (type-member-origin-graph.ts) drives.
import type { Type, TypeNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { ConstructorSummary, Containment, GenericDeclaration, TransportContext } from "./type-member-origin-containment.ts";
import {
  annotationChildren,
  dataMemberAnnotation,
  genericArguments,
  genericDescriptor,
  genericTarget,
  strongestContainment,
  typeExpressionContains,
} from "./type-member-origin-containment.ts";

/** A recurrence state records parameter transport and immediate data outputs relative to the first
 *  instantiation's arguments. The boolean lattice is finite even when concrete types keep growing. */
export function recurrenceSignature(type: Type, edges: readonly Type[], roots: readonly Type[], context: TransportContext): string {
  const relation = (candidate: Type): readonly Containment[] => roots.map((root) => typeExpressionContains(candidate, root, context));
  const data = roots.map((root) => {
    const relations = edges.map((edge) => typeExpressionContains(edge, root, context));
    return strongestContainment(relations);
  });
  return JSON.stringify({ arguments: genericArguments(type).map(relation), data });
}

function genericDeclaration(type: Type): GenericDeclaration | undefined {
  return genericDescriptor(type)?.declaration;
}

function declarationDataAnnotations(declaration: GenericDeclaration): readonly TypeNode[] {
  if (Node.isInterfaceDeclaration(declaration)) {
    return declaration.getMembers().flatMap(dataMemberAnnotation);
  }
  const body = declaration.getTypeNode();
  if (body === undefined) {
    return [];
  }
  return Node.isTypeLiteral(body) ? body.getMembers().flatMap(dataMemberAnnotation) : [body];
}

interface ParameterFlow {
  readonly definite: ReadonlySet<number>;
  readonly possible: ReadonlySet<number>;
  readonly outputs: readonly Type[];
  readonly unsupported: boolean;
}

function emptyFlow(): ParameterFlow {
  return { definite: new Set(), possible: new Set(), outputs: [], unsupported: false };
}

function mergeFlow(flows: readonly ParameterFlow[]): ParameterFlow {
  const outputs = new Map<object, Type>();
  for (const type of flows.flatMap((flow) => flow.outputs)) {
    outputs.set(type.compilerType, type);
  }
  return {
    definite: new Set(flows.flatMap((flow) => [...flow.definite])),
    possible: new Set(flows.flatMap((flow) => [...flow.possible, ...flow.definite])),
    outputs: [...outputs.values()],
    unsupported: flows.some((flow) => flow.unsupported),
  };
}

function parameterIndex(node: TypeNode, indices: ReadonlyMap<object, number>): number | undefined {
  if (!Node.isTypeReference(node)) {
    return;
  }
  const name = node.getTypeName();
  const symbol = (Node.isQualifiedName(name) ? name.getRight() : name).getSymbol();
  return (symbol?.getDeclarations() ?? []).flatMap((declaration) => {
    const index = indices.get(declaration.compilerNode);
    return index === undefined ? [] : [index];
  })[0];
}

function opaqueType(type: Type): boolean {
  return type.isAny() || type.isUnknown() || type.isTypeParameter();
}

function conditionalFlow(
  node: import("ts-morph").ConditionalTypeNode,
  indices: ReadonlyMap<object, number>,
  summaries: ReadonlyMap<object, ConstructorSummary>,
): ParameterFlow {
  const outputs = [node.getTrueType(), node.getFalseType()].map((output) => expressionFlow(output, indices, summaries));
  const possible = mergeFlow(outputs);
  const outputTypes = new Map<object, Type>(possible.outputs.map((type) => [type.compilerType, type]));
  for (const output of [node.getTrueType(), node.getFalseType()]) {
    const type = output.getType();
    if (!(opaqueType(type) || type.isNever())) {
      outputTypes.set(type.compilerType, type);
    }
  }
  return { definite: new Set(), possible: new Set([...possible.definite, ...possible.possible]), outputs: [...outputTypes.values()], unsupported: true };
}

function referenceFlow(
  node: import("ts-morph").TypeReferenceNode,
  indices: ReadonlyMap<object, number>,
  summaries: ReadonlyMap<object, ConstructorSummary>,
): ParameterFlow {
  const summary = summaries.get(genericTarget(node.getType()) ?? node.compilerNode);
  if (summary === undefined) {
    return node.getType().isObject() ? possibleParameterFlow(node, indices) : emptyFlow();
  }
  const arguments_ = node.getTypeArguments();
  const flowsFor = (positions: ReadonlySet<number>): readonly ParameterFlow[] =>
    [...positions].flatMap((index) => (arguments_[index] === undefined ? [] : [expressionFlow(arguments_[index], indices, summaries)]));
  const definite = mergeFlow(flowsFor(summary.definite));
  const possible = mergeFlow(flowsFor(summary.possible));
  return {
    definite: new Set(definite.definite),
    possible: new Set([...definite.possible, ...possible.definite, ...possible.possible]),
    outputs: [...summary.outputs.values(), ...definite.outputs, ...possible.outputs],
    unsupported: summary.unsupported || definite.unsupported || possible.unsupported,
  };
}

function possibleParameterFlow(node: TypeNode, indices: ReadonlyMap<object, number>): ParameterFlow {
  if (Node.isFunctionTypeNode(node) || Node.isConstructorTypeNode(node)) {
    return emptyFlow();
  }
  const references = [node, ...node.getDescendants()].flatMap((candidate) => (Node.isTypeReference(candidate) ? [candidate] : []));
  return {
    definite: new Set(),
    possible: new Set(references.flatMap((reference) => parameterIndex(reference, indices) ?? [])),
    outputs: [],
    unsupported: true,
  };
}

function expressionFlow(node: TypeNode, indices: ReadonlyMap<object, number>, summaries: ReadonlyMap<object, ConstructorSummary>): ParameterFlow {
  if (Node.isFunctionTypeNode(node) || Node.isConstructorTypeNode(node)) {
    return emptyFlow();
  }
  if (Node.isTypeOperatorTypeNode(node) && node.getOperator() === SyntaxKind.KeyOfKeyword) {
    return emptyFlow();
  }
  if (Node.isConditionalTypeNode(node)) {
    return conditionalFlow(node, indices, summaries);
  }
  if (Node.isMappedTypeNode(node)) {
    const output = node.getTypeNode();
    if (output === undefined) {
      return possibleParameterFlow(node, indices);
    }
    const flow = possibleParameterFlow(output, indices);
    return { ...flow, outputs: [...flow.outputs, output.getType()], unsupported: true };
  }
  const ownParameter = parameterIndex(node, indices);
  if (ownParameter !== undefined) {
    return { definite: new Set([ownParameter]), possible: new Set([ownParameter]), outputs: [], unsupported: false };
  }
  if (Node.isTypeReference(node)) {
    return referenceFlow(node, indices, summaries);
  }
  if (Node.isIndexedAccessTypeNode(node) && annotationChildren(node).length === 0) {
    return possibleParameterFlow(node.getObjectTypeNode(), indices);
  }
  const children = annotationChildren(node);
  return children.length === 0 ? emptyFlow() : mergeFlow(children.map((child) => expressionFlow(child, indices, summaries)));
}

function referencedConstructors(declaration: GenericDeclaration): readonly Type[] {
  return declarationDataAnnotations(declaration).flatMap((annotation) =>
    [annotation, ...annotation.getDescendants()].flatMap((node) => {
      if (!Node.isTypeReference(node)) {
        return [];
      }
      const type = node.getType();
      return genericTarget(type) === undefined || genericDeclaration(type) === undefined ? [] : [type];
    }),
  );
}

function referencedTypes(node: TypeNode): readonly Type[] {
  return [node, ...node.getDescendants()].flatMap((candidate) => (Node.isTypeReference(candidate) ? [candidate.getType()] : []));
}

function collectConstructorSummaries(root: TypeNode): Map<object, ConstructorSummary> {
  const summaries = new Map<object, ConstructorSummary>();
  const declarations = new Set<object>();
  const pending = [...referencedTypes(root)];
  for (let type = pending.pop(); type !== undefined; type = pending.pop()) {
    const target = genericTarget(type);
    const declaration = genericDeclaration(type);
    if (declaration === undefined || declarations.has(declaration.compilerNode)) {
      continue;
    }
    declarations.add(declaration.compilerNode);
    if (target !== undefined && declaration.getTypeParameters().length > 0) {
      summaries.set(target, {
        declaration,
        definite: new Set(),
        possible: new Set(),
        outputs: new Map(),
        successors: new Set(),
        recursive: false,
        unsupported: false,
      });
    }
    pending.push(...referencedConstructors(declaration));
  }
  return summaries;
}

function constructorReaches(start: object, target: object, summaries: ReadonlyMap<object, ConstructorSummary>, seen: Set<object>): boolean {
  if (seen.has(start)) {
    return false;
  }
  seen.add(start);
  const summary = summaries.get(start);
  return summary !== undefined && [...summary.successors].some((successor) => successor === target || constructorReaches(successor, target, summaries, seen));
}

function classifyRecursiveConstructors(summaries: ReadonlyMap<object, ConstructorSummary>): void {
  for (const summary of summaries.values()) {
    for (const referenced of referencedConstructors(summary.declaration)) {
      const successor = genericTarget(referenced);
      if (successor !== undefined && summaries.has(successor)) {
        summary.successors.add(successor);
      }
    }
  }
  for (const [target, summary] of summaries) {
    summary.recursive = [...summary.successors].some((successor) => successor === target || constructorReaches(successor, target, summaries, new Set()));
  }
}

function addIndices(target: Set<number>, source: ReadonlySet<number>): boolean {
  let changed = false;
  for (const index of source) {
    if (!target.has(index)) {
      target.add(index);
      changed = true;
    }
  }
  return changed;
}

function updateConstructorSummary(summary: ConstructorSummary, summaries: ReadonlyMap<object, ConstructorSummary>): boolean {
  const parameters = summary.declaration.getTypeParameters();
  const indices = new Map<object, number>(parameters.map((parameter, index) => [parameter.compilerNode, index]));
  const flow = mergeFlow(declarationDataAnnotations(summary.declaration).map((annotation) => expressionFlow(annotation, indices, summaries)));
  const flowChanged = addIndices(summary.definite, flow.definite) || addIndices(summary.possible, flow.possible);
  let outputsChanged = false;
  for (const type of flow.outputs) {
    if (!summary.outputs.has(type.compilerType)) {
      summary.outputs.set(type.compilerType, type);
      outputsChanged = true;
    }
  }
  const unsupportedChanged = flow.unsupported && !summary.unsupported;
  summary.unsupported ||= flow.unsupported;
  return flowChanged || outputsChanged || unsupportedChanged;
}

/** Least fixed point over declaration parameters. Definite flow uses only structural data operators;
 *  dependent mappings/conditionals contribute candidate-specific possible flow but never a positive. */
export function constructorSummaries(root: TypeNode): ReadonlyMap<object, ConstructorSummary> {
  const summaries = collectConstructorSummaries(root);
  classifyRecursiveConstructors(summaries);
  let changed = true;
  while (changed) {
    changed = false;
    for (const summary of summaries.values()) {
      changed = updateConstructorSummary(summary, summaries) || changed;
    }
  }
  return summaries;
}
