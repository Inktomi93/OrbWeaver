// A symbol closure walked breadth-first by declaration hops; whatever lies past the last hop is reported, never walked.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { applyArgumentValues, wrappedValue } from "./expression-value.ts";
import type { TypeObservationCaptureOwner, TypeObservationQuestion, TypeObservationReader } from "./type-observations-contract.ts";
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

/** A replay's bounded-closure frontier and walked nodes, filled as the replay re-walks each closure. */
export interface ClosureFrontier {
  readonly reach: Required<Pick<TypeObservationCaptureOwner, "closureBound" | "closureWalked">>;
  /** The frontier declaration that contains an uncaptured `node`. */
  readonly at: (node: MorphNode) => MorphNode | undefined;
  /** The statement around `node` when a closure was walked and never reached it. */
  readonly past: (node: MorphNode) => MorphNode | undefined;
  /** Admits a question about `node`; one about an uncaptured node past the frontier throws {@link ClosureBoundError}. */
  readonly query: (node: MorphNode) => void;
  /** Rethrows a Type selector miss as {@link ClosureBoundError} when its base was walked without Type details. */
  readonly selectorMiss: (node: MorphNode, error: unknown) => never;
}

export function closureFrontier(captured: (node: MorphNode) => boolean, admit: (node: MorphNode) => void): ClosureFrontier {
  const frontier = new Set<MorphNode>();
  const walked = new Set<MorphNode>();
  const untyped = new Set<MorphNode>();
  const at = (node: MorphNode): MorphNode | undefined =>
    frontier.size === 0 || captured(node) ? undefined : [node, ...node.getAncestors()].find((ancestor) => frontier.has(ancestor));
  return {
    reach: {
      closureBound: (declaration): void => {
        frontier.add(declaration);
      },
      closureWalked: (node, typed): void => {
        walked.add(node);
        if (!typed) {
          untyped.add(node);
        }
      },
    },
    selectorMiss: (node, error): never => {
      throw untyped.has(node) ? new ClosureBoundError(node, node.getFirstAncestor(Node.isStatement) ?? node) : error;
    },
    at,
    past: (node) => (walked.size === 0 || walked.has(node) ? undefined : (at(node) ?? node.getFirstAncestor(Node.isStatement) ?? node)),
    query: (node): void => {
      admit(node);
      const declaration = at(node);
      if (declaration !== undefined) {
        throw new ClosureBoundError(node, declaration);
      }
    },
  };
}

function executableDeclaration(declaration: MorphNode): readonly MorphNode[] {
  if (Node.isVariableDeclaration(declaration)) {
    return declaration.getInitializer() === undefined ? [] : [declaration];
  }
  if (Node.isBindingElement(declaration)) {
    const owner = declaration.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
    return owner === undefined ? [] : [owner];
  }
  return Node.isFunctionDeclaration(declaration) && declaration.getBody() !== undefined ? [declaration] : [];
}

/** The declarations one hop from `node`: its symbol's and canonical symbol's initialized or bodied declarations. */
export function symbolBodies(node: MorphNode, readers: TypeObservationReader): readonly MorphNode[] {
  const symbol = readers.symbol(node);
  return symbol === null
    ? []
    : [symbol, readers.symbolData(symbol).canonical].flatMap((target) => readers.symbolData(target).declarations.flatMap(executableDeclaration));
}

/** A callee's call-initialized declarations in another file: a possible bound alias that no root walks, so it is past the bound. */
export function foreignCallInitializers(callee: MorphNode, readers: TypeObservationReader): readonly MorphNode[] {
  return symbolBodies(callee, readers).filter(
    (declaration) =>
      Node.isVariableDeclaration(declaration) && Node.isCallExpression(declaration.getInitializer()) && declaration.getSourceFile() !== callee.getSourceFile(),
  );
}

function multiStatementBody(declaration: MorphNode): boolean {
  const initializer = Node.isVariableDeclaration(declaration) ? declaration.getInitializer() : undefined;
  const fn = Node.isFunctionDeclaration(declaration) ? declaration : initializer;
  const body = Node.isFunctionDeclaration(fn) || Node.isArrowFunction(fn) || Node.isFunctionExpression(fn) ? fn.getBody() : undefined;
  return body !== undefined && Node.isBlock(body) && body.getStatements().length > 1;
}

const TYPE_WRAPPERS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.ParenthesizedExpression,
  SyntaxKind.AsExpression,
  SyntaxKind.SatisfiesExpression,
  SyntaxKind.NonNullExpression,
  SyntaxKind.AwaitExpression,
  SyntaxKind.TypeAssertionExpression,
]);

// The slot `value` fills in `parent`, for the value positions a reader asks a Type answer about.
function typedSlot(value: MorphNode, parent: MorphNode): boolean {
  if (Node.isCallExpression(parent)) {
    return parent.getArguments().includes(value);
  }
  if (Node.isPropertyAccessExpression(parent) || Node.isArrowFunction(parent)) {
    return Node.isPropertyAccessExpression(parent) ? parent.getExpression() === value : parent.getBody() === value;
  }
  if (Node.isVariableDeclaration(parent) || Node.isPropertyAssignment(parent)) {
    return parent.getInitializer() === value;
  }
  if (Node.isBinaryExpression(parent)) {
    return parent.getOperatorToken().getKind() === SyntaxKind.PlusToken;
  }
  return Node.isReturnStatement(parent) || Node.isConditionalExpression(parent) || Node.isElementAccessExpression(parent);
}

/**
 * The walked nodes a question with `closureTypedPositions` asks Type details for: every call, and a value in a call
 * argument, a return, an arrow body, a conditional, an initializer, a member or element receiver, an element key,
 * or a `+` operand, through any parentheses, `as`, `satisfies`, `!` or `await` around it.
 */
export function readerTypedPosition(node: MorphNode): boolean {
  if (Node.isCallExpression(node)) {
    return true;
  }
  if (!Node.isExpression(node)) {
    return false;
  }
  let value: MorphNode = node;
  let parent = value.getParent();
  while (parent !== undefined && TYPE_WRAPPERS.has(parent.getKind())) {
    value = parent;
    parent = value.getParent();
  }
  return parent !== undefined && typedSlot(value, parent);
}

// A handler position, read through the same unwrap and `apply` spread the rejection reader uses: a call
// argument, an element an `apply`-style call spreads, or the bare-identifier initializer of an alias
// (`const h = onErr`) that a call argument may name in turn.
function handlerPosition(node: MorphNode): boolean {
  const value = wrappedValue(node);
  const parent = value.getParent();
  if (parent === undefined) {
    return false;
  }
  if (Node.isCallExpression(parent)) {
    return parent.getArguments().includes(value);
  }
  if (Node.isArrayLiteralExpression(parent)) {
    const call = parent.getParent();
    return (
      call !== undefined && Node.isCallExpression(call) && call.getArguments().includes(parent) && applyArgumentValues(call, parent)?.includes(value) === true
    );
  }
  return Node.isIdentifier(node) && Node.isVariableDeclaration(parent) && parent.getInitializer() === value;
}

// A handler-bodies-only question walks a whole multi-statement body only from a handler position, and
// otherwise only a single-expression or single-statement body; every other body goes to `beyond`, never silent.
function handlerBodyHops(node: MorphNode, declarations: readonly MorphNode[], beyond: (declaration: MorphNode) => void): readonly MorphNode[] {
  if (handlerPosition(node)) {
    return declarations;
  }
  const walked = declarations.filter((declaration) => !multiStatementBody(declaration));
  for (const declaration of declarations.filter((candidate) => !walked.includes(candidate))) {
    beyond(declaration);
  }
  return walked;
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
 * Walks every root's subtree, then the declarations `observe` returns, up to the question's `closureHops`.
 *
 * @remarks Each hop level finishes before the next starts, so a declaration is walked at its shortest distance.
 * `closureBound` receives exactly the unwalked declarations one hop past the bound, plus every body a
 * handler-bodies-only question declined to walk that no other path walked; `closureWalked` every walked node,
 * with whether `observe` was told to ask its Type details.
 */
export function walkBoundedClosure(
  question: Pick<TypeObservationQuestion, "nodes" | "closureHops" | "closureHandlerBodiesOnly" | "closureTypedPositions">,
  observe: (node: MorphNode, typed: boolean) => readonly MorphNode[],
  reach: Pick<TypeObservationCaptureOwner, "closureBound" | "closureWalked"> | undefined,
): void {
  const hops = question.closureHops;
  if (hops === undefined) {
    throw new Error("native symbol closure is unbounded");
  }
  const seen = new Set<MorphNode>();
  const untyped = new Set<MorphNode>();
  const sources = new Set<SourceFile>();
  const declined = new Set<MorphNode>();
  const decline = (declaration: MorphNode): void => {
    declined.add(declaration);
  };
  const hop = (node: MorphNode): readonly MorphNode[] => {
    const typed = question.closureTypedPositions !== true || readerTypedPosition(node);
    if (!typed) {
      untyped.add(node);
    }
    const bodies = observe(node, typed);
    return question.closureHandlerBodiesOnly === true ? handlerBodyHops(node, bodies, decline) : bodies;
  };
  let level: MorphNode[] = [...question.nodes];
  for (let depth = 0; level.length > 0 && depth <= hops; depth += 1) {
    const next: MorphNode[] = [];
    // A source's write targets join the level that first reaches the source, so write guards read them.
    for (const root of level) {
      const source = root.getSourceFile();
      if (!sources.has(source)) {
        sources.add(source);
        level.push(...sourceWriteIdentifiers(source));
      }
      next.push(...walkSubtree(root, seen, hop));
    }
    level = next;
    if (depth === hops) {
      for (const declaration of next) {
        declined.add(declaration);
      }
    }
  }
  for (const declaration of [...declined].filter((value) => !seen.has(value))) {
    reach?.closureBound?.(declaration);
  }
  for (const node of seen) {
    reach?.closureWalked?.(node, !untyped.has(node));
  }
}
