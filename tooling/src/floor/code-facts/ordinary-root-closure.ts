// What a partial ordinary root set closes over (D328): the calls and const-held values its roots and the callee bodies
// they reach carry, to a bounded fixpoint, nothing else.
import type { CallExpression, Identifier, Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readCallClosure } from "./call-returns.ts";
import { resolveStableExpression } from "./reference-fact.ts";
import { lexicalReferenceSymbol } from "./reference-fact-alias.ts";

/** D328 bound: rounds of callee-body expansion; a value held past the last round is outside the cohort. */
export const CARRIED_CLOSURE_ROUNDS = 4;

interface Carried {
  readonly calls: Set<CallExpression>;
  readonly seen: Set<object>;
  readonly bySymbol: Map<object, readonly MorphNode[]>;
}

// A member name or a property key spells no value binding, so the closure never resolves it.
function valueIdentifier(identifier: MorphNode): boolean {
  const parent = identifier.getParent();
  return !(
    (parent !== undefined && Node.isPropertyAccessExpression(parent) && parent.getNameNode() === identifier) ||
    (parent !== undefined && Node.isPropertyAssignment(parent) && parent.getNameNode() === identifier)
  );
}

// The value one const binding holds; a call initializer is the stable reader's dynamic terminal, and a destructured
// binding holds part of its declaration's initializer. One binding holds one value, so each symbol resolves once.
function held(identifier: Identifier, carried: Carried): readonly MorphNode[] {
  const symbol = lexicalReferenceSymbol(identifier)?.compilerSymbol;
  if (symbol === undefined) {
    return [];
  }
  const known = carried.bySymbol.get(symbol);
  if (known !== undefined) {
    return known;
  }
  const value = resolveStableExpression(identifier);
  let values: readonly MorphNode[] = [];
  if (value.kind === "resolved") {
    values = [value.value];
  } else if (value.reason === "dynamic") {
    const initializer = Node.isBindingElement(value.node) ? value.node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getInitializer() : value.node;
    values = initializer === undefined ? [] : [initializer];
  }
  carried.bySymbol.set(symbol, values);
  return values;
}

// Every call written inside `seeds` and every value their const bindings hold, transitively.
function expand(seeds: readonly MorphNode[], carried: Carried): void {
  const pending = [...seeds];
  for (const node of pending) {
    if (carried.seen.has(node.compilerNode)) {
      continue;
    }
    carried.seen.add(node.compilerNode);
    if (Node.isCallExpression(node)) {
      carried.calls.add(node);
    }
    for (const call of node.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      carried.calls.add(call);
    }
    for (const identifier of node.getDescendantsOfKind(SyntaxKind.Identifier).filter(valueIdentifier)) {
      pending.push(...held(identifier, carried));
    }
  }
}

/** D328: a partial root set closes over what its roots carry: the calls written inside each root (callee chain and
 *  arguments), the calls and values the const bindings read there hold, and the same for every callee body the call
 *  closure reaches, for {@link CARRIED_CLOSURE_ROUNDS} rounds. A call outside the result is not captured. */
export function carriedRoots(requested: readonly CallExpression[]): readonly CallExpression[] {
  const carried: Carried = { calls: new Set(requested), seen: new Set(), bySymbol: new Map() };
  expand(requested, carried);
  for (let round = 0; round < CARRIED_CLOSURE_ROUNDS; round += 1) {
    const size = carried.calls.size;
    const bodyIdentifiers: Identifier[] = [];
    readCallClosure([...carried.calls], (node) => {
      if (Node.isIdentifier(node) && valueIdentifier(node)) {
        bodyIdentifiers.push(node);
      }
    });
    expand(
      bodyIdentifiers.flatMap((identifier) => held(identifier, carried)),
      carried,
    );
    if (carried.calls.size === size) {
      break;
    }
  }
  return [...carried.calls];
}
