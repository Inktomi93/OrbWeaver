// What a partial ordinary root set closes over (D328): the calls and const-held values its roots carry, nothing else.
import type { CallExpression, Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { resolveStableExpression } from "./reference-fact.ts";
import { lexicalReferenceSymbol } from "./reference-fact-alias.ts";

// A member name or a property key spells no value binding, so the closure never resolves it.
function valueIdentifier(identifier: MorphNode): boolean {
  const parent = identifier.getParent();
  return !(
    (parent !== undefined && Node.isPropertyAccessExpression(parent) && parent.getNameNode() === identifier) ||
    (parent !== undefined && Node.isPropertyAssignment(parent) && parent.getNameNode() === identifier)
  );
}

/** D328: a root set may be partial. It closes over what its roots carry: every call written inside a root (its callee
 *  chain and arguments) and every call or value a const binding there holds, transitively. A call outside that set is
 *  not captured, so a question about it reads as outside the cohort, never as an answer. */
export function rootValueCalls(requested: readonly CallExpression[]): readonly CallExpression[] {
  const calls = new Set<CallExpression>(requested);
  const seen = new Set<object>();
  const pending: MorphNode[] = [...requested];
  const bySymbol = new Map<object, readonly MorphNode[]>();
  for (const node of pending) {
    if (seen.has(node.compilerNode)) {
      continue;
    }
    seen.add(node.compilerNode);
    for (const call of node.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      calls.add(call);
    }
    for (const held of heldValues(node, bySymbol)) {
      if (Node.isCallExpression(held)) {
        calls.add(held);
      }
      pending.push(held);
    }
  }
  return [...calls];
}

// The value each const binding read inside `node` holds; a call initializer is the stable reader's dynamic terminal.
// One binding holds one value, so each symbol resolves once per closure.
function heldValues(node: MorphNode, bySymbol: Map<object, readonly MorphNode[]>): readonly MorphNode[] {
  return node
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .filter(valueIdentifier)
    .flatMap((identifier) => {
      const symbol = lexicalReferenceSymbol(identifier)?.compilerSymbol;
      if (symbol === undefined) {
        return [];
      }
      const known = bySymbol.get(symbol);
      if (known !== undefined) {
        return known;
      }
      const value = resolveStableExpression(identifier);
      let held: readonly MorphNode[] = [];
      if (value.kind === "resolved") {
        held = [value.value];
      } else if (value.reason === "dynamic") {
        // A destructured binding holds part of its declaration's initializer, so the closure walks that initializer.
        const initializer = Node.isBindingElement(value.node)
          ? value.node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getInitializer()
          : value.node;
        held = initializer === undefined ? [] : [initializer];
      }
      bySymbol.set(symbol, held);
      return held;
    });
}
