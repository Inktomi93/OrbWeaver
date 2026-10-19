// A symbol closure walked breadth-first by declaration hops; whatever lies past the last hop is reported, never walked.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { ClosureBoundError } from "./type-observations-contract.ts";

/** A verdict that needed no answer past a closure bound, or the explicit unknown that replaces it (D328). */
export type BoundedRead<Value> = { readonly kind: "resolved"; readonly value: Value } | { readonly kind: "unresolved"; readonly reason: string };

/** Runs one judgment; a question past the bounded closure makes it unknown, never clean. Other errors propagate. */
export function withinClosureBound<Value>(read: () => Value): BoundedRead<Value> {
  try {
    return { kind: "resolved", value: read() };
  } catch (error) {
    if (!(error instanceof ClosureBoundError)) {
      throw error;
    }
    const declaration = error.declaration;
    const source = declaration.getSourceFile();
    return {
      kind: "unresolved",
      reason: `the verdict needs a native answer inside ${source.getBaseName()}:${String(declaration.getStartLineNumber())}, past the closure bound`,
    };
  }
}

function multiStatementBody(declaration: MorphNode): boolean {
  const initializer = Node.isVariableDeclaration(declaration) ? declaration.getInitializer() : undefined;
  const fn = Node.isFunctionDeclaration(declaration) ? declaration : initializer;
  const body = Node.isFunctionDeclaration(fn) || Node.isArrowFunction(fn) || Node.isFunctionExpression(fn) ? fn.getBody() : undefined;
  return body !== undefined && Node.isBlock(body) && body.getStatements().length > 1;
}

/**
 * The declarations a hop from `node` may walk when the question asks for argument-only bodies: a reader reads a
 * whole multi-statement body only for a function handed over as a call argument, and otherwise only a
 * single-expression or single-statement body.
 */
export function argumentBodyHops(node: MorphNode, declarations: readonly MorphNode[]): readonly MorphNode[] {
  const parent = node.getParent();
  const argument = parent !== undefined && Node.isCallExpression(parent) && parent.getArguments().includes(node);
  return argument ? declarations : declarations.filter((declaration) => !multiStatementBody(declaration));
}

/** Every identifier a source writes, so a closure that reaches the source can answer its write guards. */
export function sourceWriteIdentifiers(source: SourceFile): readonly MorphNode[] {
  const writes: MorphNode[] = source.getDescendantsOfKind(SyntaxKind.BinaryExpression).map((node) => node.getLeft());
  writes.push(...source.getDescendantsOfKind(SyntaxKind.ForOfStatement).map((node) => node.getInitializer()));
  writes.push(...source.getDescendantsOfKind(SyntaxKind.ForInStatement).map((node) => node.getInitializer()));
  return writes.flatMap((write) => [write, ...write.getDescendants()].filter(Node.isIdentifier));
}

function walkSubtree(root: MorphNode, seen: Set<MorphNode>, observe: (node: MorphNode) => readonly MorphNode[]): readonly MorphNode[] {
  const reached: MorphNode[] = [];
  for (const node of [root, ...root.getDescendants()]) {
    if (!(seen.has(node) || Node.isOmittedExpression(node))) {
      seen.add(node);
      reached.push(...observe(node));
    }
  }
  return reached;
}

/**
 * Walks every root's subtree, then the declarations `observe` returns, up to `hops` declaration hops.
 *
 * @remarks Each hop level finishes before the next starts, so a declaration is walked at its shortest distance
 * and `bounded` receives exactly the unwalked declarations one hop past the bound.
 */
export function walkBoundedClosure(
  roots: readonly MorphNode[],
  hops: number,
  observe: (node: MorphNode) => readonly MorphNode[],
  bounded: (declaration: MorphNode) => void,
): void {
  const seen = new Set<MorphNode>();
  const sources = new Set<SourceFile>();
  let level: MorphNode[] = [...roots];
  for (let depth = 0; level.length > 0; depth += 1) {
    const next: MorphNode[] = [];
    // A source's write targets join the level that first reaches the source, so write guards read them.
    for (const root of level) {
      const source = root.getSourceFile();
      if (!sources.has(source)) {
        sources.add(source);
        level.push(...sourceWriteIdentifiers(source));
      }
      next.push(...walkSubtree(root, seen, observe));
    }
    if (depth === hops) {
      for (const declaration of next.filter((value) => !seen.has(value))) {
        bounded(declaration);
      }
      return;
    }
    level = next;
  }
}
