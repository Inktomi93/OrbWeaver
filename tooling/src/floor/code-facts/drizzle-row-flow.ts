// Result-binding lineage is data; consumers choose the depth their authorization rule accepts.
import type { Identifier } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";

function initializerReferences(declaration: Node): readonly Identifier[] {
  const initializer = Node.isVariableDeclaration(declaration) ? declaration.getInitializer() : undefined;
  if (initializer === undefined) {
    return [];
  }
  return Node.isIdentifier(initializer) ? [initializer] : initializer.getDescendantsOfKind(SyntaxKind.Identifier);
}

/** The shortest initializer/reference path to a result declaration; cycles cannot manufacture provenance. */
export function resultBindingDepth(identifier: Identifier, result: Node): number | undefined {
  const queue = [{ identifier, depth: 0 }];
  const seen = new Set<object>();
  let foundDepth: number | undefined;
  for (const item of queue) {
    const symbol = item.identifier.getSymbol()?.compilerSymbol;
    if (symbol === undefined || seen.has(symbol)) {
      continue;
    }
    seen.add(symbol);
    const definitions = item.identifier.getDefinitionNodes();
    if (definitions.includes(result)) {
      foundDepth = item.depth;
      break;
    }
    queue.push(...definitions.flatMap(initializerReferences).map((input) => ({ identifier: input, depth: item.depth + 1 })));
  }
  return foundDepth;
}

/** Lineage depths of the actual lexical references carried by an expression. */
export function resultReferenceDepths(expression: Node, result: Node): readonly number[] {
  const identifiers = Node.isIdentifier(expression) ? [expression] : expression.getDescendantsOfKind(SyntaxKind.Identifier);
  return identifiers.flatMap((identifier) => {
    const depth = resultBindingDepth(identifier, result);
    return depth === undefined ? [] : [depth];
  });
}

/** Authored return occurrences of one rejection block; its consumer judges enclosing-function membership. */
export function readReturnOccurrences(block: Node): readonly import("ts-morph").ReturnStatement[] {
  return block.getDescendantsOfKind(SyntaxKind.ReturnStatement);
}
