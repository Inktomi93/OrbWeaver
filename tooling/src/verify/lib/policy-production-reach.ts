// THE PRODUCTION-REACH WALK behind `policy-descriptor-read.ts#policyProductionDependencies`: from a `create`
// hook, every runtime expression child (erased types, declaration names and uncalled declarations
// excluded), following stable bindings, imported values and callable declarations to a fixpoint with no
// hop limit. Split out at the size cap (2026-09-18); the descriptor entry point stays there. One-way: this
// module imports nothing from `policy-descriptor-read.ts`.
import { resolveModuleMemberOrigin, resolveStableExpression } from "@orb/tooling/_shared/reference-fact";
import { resolveCallableDeclaration } from "@orb/tooling/_shared/reference-fact-call";
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";

export interface ProductionEdges {
  readonly declarations: readonly MorphNode[];
  readonly next: readonly MorphNode[];
}

/** Runtime expression children, excluding erased types, declaration names, and uncalled declarations.
 *  Inline callbacks belong to the possible source reach; this is not a branch-feasibility analysis. */
function isErasedOrUncalledDeclaration(node: MorphNode): boolean {
  return (
    Node.isTypeNode(node) ||
    Node.isTypeAliasDeclaration(node) ||
    Node.isInterfaceDeclaration(node) ||
    Node.isImportDeclaration(node) ||
    Node.isExportDeclaration(node) ||
    Node.isFunctionDeclaration(node) ||
    Node.isClassDeclaration(node)
  );
}

function callableProductionNodes(node: MorphNode): readonly MorphNode[] {
  if (Node.isFunctionDeclaration(node) || Node.isArrowFunction(node) || Node.isFunctionExpression(node) || Node.isMethodDeclaration(node)) {
    const body = node.getBody();
    return [...(body === undefined ? [] : [body]), ...node.getParameters().flatMap((parameter) => parameter.getInitializer() ?? [])];
  }
  return [];
}

function productionChildren(node: MorphNode): readonly MorphNode[] {
  if (isErasedOrUncalledDeclaration(node)) {
    return [];
  }
  if (Node.isArrowFunction(node) || Node.isFunctionExpression(node) || Node.isMethodDeclaration(node)) {
    return callableProductionNodes(node);
  }
  if (Node.isVariableDeclaration(node) || Node.isParameterDeclaration(node)) {
    const initializer = node.getInitializer();
    return initializer === undefined || Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer) ? [] : [initializer];
  }
  if (Node.isPropertyAssignment(node)) {
    const name = node.getNameNode();
    const initializer = node.getInitializer();
    const values = initializer === undefined ? [] : [initializer];
    return Node.isComputedPropertyName(name) ? [name.getExpression(), ...values] : values;
  }
  if (Node.isPropertyAccessExpression(node)) {
    return [node.getExpression()];
  }
  return node.getChildren();
}

/** Stable declarations behind a runtime reference. Dynamic values can still have stable binding
 *  identities; this does not certify their runtime value or semantic fitness. */
function stableValueEdges(node: MorphNode): ProductionEdges {
  const value = resolveStableExpression(node);
  if (value.kind === "unresolved" && (value.reason !== "dynamic" || Node.isBindingElement(value.node))) {
    return { declarations: [], next: [] };
  }
  const terminal = value.kind === "resolved" ? value.value : value.node;
  return { declarations: value.trace.declarations.filter(Node.isVariableDeclaration), next: terminal === node ? [] : [terminal] };
}

function importedValueEdges(node: MorphNode): ProductionEdges {
  const origin = resolveModuleMemberOrigin(node);
  if (origin.kind !== "resolved" || origin.value.canonical.kind !== "project" || !Node.isVariableDeclaration(origin.value.canonical.declaration)) {
    return { declarations: [], next: [] };
  }
  return stableValueEdges(origin.value.canonical.declaration.getNameNode());
}

function productionReferenceEdges(node: MorphNode): ProductionEdges {
  if (!(Node.isIdentifier(node) || Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node))) {
    return { declarations: [], next: [] };
  }
  const callable = resolveCallableDeclaration(node);
  if (callable.kind === "resolved") {
    return { declarations: [callable.value.declaration], next: callableProductionNodes(callable.value.declaration) };
  }
  if (callable.reason === "write" || callable.reason === "cycle" || callable.reason === "ambiguous") {
    return { declarations: [], next: [] };
  }
  const local = stableValueEdges(node);
  const imported = importedValueEdges(node);
  return { declarations: [...local.declarations, ...imported.declarations], next: [...local.next, ...imported.next] };
}

export function reachableDeclarations(root: MorphNode, edges: Map<object, ProductionEdges>): ReadonlySet<MorphNode> {
  const queue = [root];
  const visited = new Set<object>();
  const declarations = new Set<MorphNode>();
  for (const node of queue) {
    if (visited.has(node.compilerNode)) {
      continue;
    }
    visited.add(node.compilerNode);
    let read = edges.get(node.compilerNode);
    if (read === undefined) {
      const reference = productionReferenceEdges(node);
      read = { declarations: reference.declarations, next: [...productionChildren(node), ...reference.next] };
      edges.set(node.compilerNode, read);
    }
    for (const declaration of read.declarations) {
      declarations.add(declaration);
    }
    queue.push(...read.next);
  }
  return declarations;
}
