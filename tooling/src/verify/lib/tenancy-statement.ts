// The STATEMENT half of the tenancy read readers: the predicates one drizzle read applies around a table anchor —
// its own builder chain up and down, a split builder's binding in the same function, and whether a `$dynamic()`
// builder escapes the function's view.
import { staticMemberAccess } from "@orb/tooling/floor/code-facts/reference-fact";
import type { CallExpression, Identifier, Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { ReadStatement } from "../contract/tenancy.ts";
import { unwrapExpression } from "./ast-read.ts";
import { MEMBER_ACCESS_KINDS } from "./symbol-reference.ts";
import { enclosingFn } from "./tenancy-read.ts";

const WHERE_VERB = "where";
const INNER_JOIN_VERB = "innerJoin";
const DYNAMIC_VERB = "$dynamic";
const MAX_BUILDER_HOPS = 3;

/** One step up a read's OWN builder chain: through a member access whose object is the current node, a call
 *  whose callee is, or an `await`. A select passed as an ARGUMENT (an `inArray(col, db.select()…)` subselect)
 *  is its own statement and never inherits the outer statement's predicates. */
function builderParent(cur: Node): Node | undefined {
  const parent = cur.getParent();
  if (parent === undefined) {
    return;
  }
  const continuesChain =
    parent.isKind(SyntaxKind.AwaitExpression) ||
    (parent.isKind(SyntaxKind.CallExpression) && parent.getExpression() === cur) ||
    (MEMBER_ACCESS_KINDS.some((kind) => parent.isKind(kind)) && parent.getFirstChild() === cur);
  return continuesChain ? parent : undefined;
}

/** The outermost node of a read's own builder chain, and the calls applied along the way. */
function builderChain(start: Node): { readonly top: Node; readonly calls: readonly CallExpression[] } {
  const calls: CallExpression[] = [];
  let cur: Node = start;
  for (let parent = builderParent(cur); parent !== undefined; parent = builderParent(cur)) {
    if (parent.isKind(SyntaxKind.CallExpression)) {
      calls.push(parent);
    }
    cur = parent;
  }
  return { top: cur, calls };
}

/** The binding an UNAWAITED builder chain is stored in (`const q = db.select().from(T)` or `q = q.where(…)`);
 *  an awaited chain is a result set, not a builder, and is never followed. */
function builderBinding(top: Node): Identifier | undefined {
  const parent = top.isKind(SyntaxKind.AwaitExpression) ? undefined : top.getParent();
  let target: Node | undefined;
  if (parent?.isKind(SyntaxKind.VariableDeclaration) === true && parent.getInitializer() === top) {
    target = parent.getNameNode();
  } else if (
    parent?.isKind(SyntaxKind.BinaryExpression) === true &&
    parent.getOperatorToken().getKind() === SyntaxKind.EqualsToken &&
    parent.getRight() === top
  ) {
    target = parent.getLeft();
  }
  return target?.isKind(SyntaxKind.Identifier) === true ? target : undefined;
}

/** The uses of a builder binding in its own function that continue the chain: a METHOD CALL on it (`q.where(…)`,
 *  `q.innerJoin(…)`). A column read off it (`sq.id`, a subquery's field) is a value, never a builder step. */
function builderUses(binding: Identifier): readonly Identifier[] {
  const symbol = binding.getSymbol()?.compilerSymbol;
  const scope = enclosingFn(binding) ?? binding.getSourceFile();
  return scope.getDescendantsOfKind(SyntaxKind.Identifier).filter((use) => {
    const access = use.getParent();
    const call = access.getParent();
    const isMethodCall =
      MEMBER_ACCESS_KINDS.some((kind) => access.isKind(kind)) &&
      access.getFirstChild() === use &&
      call?.isKind(SyntaxKind.CallExpression) === true &&
      call.getExpression() === access;
    return use !== binding && isMethodCall && symbol !== undefined && use.getSymbol()?.compilerSymbol === symbol;
  });
}

/** Does this unawaited builder value leave the statement's view: passed as a call argument, returned, or bound
 *  to a name some use reads other than as a method receiver or an `await`? */
function builderEscapes(top: Node, binding: Identifier | undefined): boolean {
  const parent = top.getParent();
  const handedOff =
    !top.isKind(SyntaxKind.AwaitExpression) &&
    (parent?.isKind(SyntaxKind.ReturnStatement) === true ||
      parent?.isKind(SyntaxKind.ArrowFunction) === true ||
      (parent?.isKind(SyntaxKind.CallExpression) === true && parent.getArguments().includes(top)));
  if (handedOff || binding === undefined) {
    return handedOff;
  }
  const symbol = binding.getSymbol()?.compilerSymbol;
  const methodUses = new Set<Node>(builderUses(binding));
  const scope = enclosingFn(binding) ?? binding.getSourceFile();
  return scope
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .some(
      (use) =>
        use !== binding &&
        symbol !== undefined &&
        use.getSymbol()?.compilerSymbol === symbol &&
        !methodUses.has(use) &&
        !use.getParent().isKind(SyntaxKind.AwaitExpression),
    );
}

interface StatementCalls {
  readonly calls: readonly CallExpression[];
  readonly dynamicEscapes: boolean;
}

/** Every call a read statement applies after its anchor, following a split builder's binding in the same function,
 *  and whether a `$dynamic()` builder escapes on this or any later followed step. */
function statementCalls(anchor: Node, hops: number, seen: Set<Node>, dynamicBefore: boolean): StatementCalls {
  const chain = builderChain(anchor);
  const binding = builderBinding(chain.top);
  const dynamic = dynamicBefore || chain.calls.some((call) => staticMemberAccess(call.getExpression())?.name === DYNAMIC_VERB);
  const followed = binding === undefined || hops >= MAX_BUILDER_HOPS ? [] : builderUses(binding).filter((use) => !seen.has(use));
  for (const use of followed) {
    seen.add(use);
  }
  const steps = followed.map((use) => statementCalls(use, hops + 1, seen, dynamic));
  return {
    calls: [...chain.calls, ...steps.flatMap((step) => step.calls)],
    dynamicEscapes: (dynamic && builderEscapes(chain.top, binding)) || steps.some((step) => step.dynamicEscapes),
  };
}

/** The builder calls applied BEFORE an anchor in its own chain (`db.select().from(a).innerJoin(b, on)` below the
 *  join of `c`): their inner-join ONs filter every row too, so a pin there binds the anchor's rows. */
function priorCalls(anchor: Node): readonly CallExpression[] {
  const calls: CallExpression[] = [];
  let cur = anchor.isKind(SyntaxKind.CallExpression) ? staticMemberAccess(anchor.getExpression())?.receiver : undefined;
  while (cur !== undefined) {
    const value = unwrapExpression(cur);
    if (!value.isKind(SyntaxKind.CallExpression)) {
      return calls;
    }
    calls.push(value);
    cur = staticMemberAccess(value.getExpression())?.receiver;
  }
  return calls;
}

/** The predicates a read statement carries: every `.where` the chain (or its split builder) applies, and every
 *  inner join's ON. Several `.where` calls are several candidates for the effective filter, never a conjunction. */
export function readStatementOf(anchor: Node): ReadStatement {
  const after = statementCalls(anchor, 0, new Set(), false);
  const calls = [...priorCalls(anchor), ...after.calls];
  const dynamicEscapes = after.dynamicEscapes;
  const argumentsOf = (verb: string, position: number): readonly Node[] =>
    calls.flatMap((call) => {
      const argument = staticMemberAccess(call.getExpression())?.name === verb ? call.getArguments()[position] : undefined;
      return argument === undefined ? [] : [argument];
    });
  return { wheres: argumentsOf(WHERE_VERB, 0), innerOns: argumentsOf(INNER_JOIN_VERB, 1), escapes: dynamicEscapes };
}
