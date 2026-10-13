// The STATEMENT half of the tenancy read readers: the predicates one drizzle read applies around a table anchor —
// its own builder chain up and down, a split builder's binding in the same function, and whether an unexecuted
// builder escapes the function's view.
import { staticMemberAccess } from "@orb/tooling/floor/code-facts/reference-fact";
import type { CallExpression, Identifier, Node } from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";
import { callsDrizzleOperator } from "./drizzle-operators.ts";
import type { DrizzleBuilderChain, ReadStatement } from "./drizzle-query-contract.ts";
import { enclosingFn } from "./function-context.ts";
import { unwrapTarget as unwrapExpression } from "./reference-fact-alias.ts";
import { MEMBER_ACCESS_KINDS } from "./reference-fact-contract.ts";

const WHERE_VERB = "where";
const INNER_JOIN_VERB = "innerJoin";
const DYNAMIC_VERB = "$dynamic";
const SEALED_VERBS: ReadonlySet<string> = new Set(["as", "all", "get", "run", "execute"]);

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
export function readFollowingBuilderChain(start: Node): DrizzleBuilderChain {
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
    const alias = access.isKind(SyntaxKind.VariableDeclaration) && access.getInitializer() === use;
    return use !== binding && (isMethodCall || alias) && symbol !== undefined && use.getSymbol()?.compilerSymbol === symbol;
  });
}

/** Does this unawaited builder value leave the statement's view: passed as a call argument, returned, or bound
 *  to a name some use reads other than as a method receiver or an `await`? */
function builderEscapes(top: Node, binding: Identifier | undefined): boolean {
  if (N.isCallExpression(top) && SEALED_VERBS.has(staticMemberAccess(top.getExpression())?.name ?? "")) {
    return false;
  }
  const parent = top.getParent();
  const fn = enclosingFn(top);
  const asyncReturn =
    fn !== undefined && (N.isFunctionDeclaration(fn) || N.isMethodDeclaration(fn) || N.isFunctionExpression(fn) || N.isArrowFunction(fn)) && fn.isAsync();
  const sqlCarrier =
    parent?.isKind(SyntaxKind.CallExpression) === true &&
    (staticMemberAccess(parent.getExpression())?.name === "as" || callsDrizzleOperator(parent, "inArray"));
  const handedOff =
    !top.isKind(SyntaxKind.AwaitExpression) &&
    ((!asyncReturn && (parent?.isKind(SyntaxKind.ReturnStatement) === true || parent?.isKind(SyntaxKind.ArrowFunction) === true)) ||
      (!sqlCarrier && parent?.isKind(SyntaxKind.CallExpression) === true && parent.getArguments().includes(top)));
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
        !use.getParent().isKind(SyntaxKind.AwaitExpression) &&
        !(asyncReturn && use.getParent().isKind(SyntaxKind.ReturnStatement)),
    );
}

interface StatementCalls {
  readonly calls: readonly CallExpression[];
  readonly escapes: boolean;
}

interface BuilderFilterState {
  readonly filtered: boolean;
  readonly dynamic: boolean;
}

/** Every call a read statement applies after its anchor, following a split builder's binding in the same function,
 *  and whether a `$dynamic()` builder escapes on this or any later followed step. */
function statementCalls(anchor: Node, seen: Set<Node>, before: BuilderFilterState): StatementCalls {
  if (seen.has(anchor)) {
    return { calls: [], escapes: false };
  }
  seen.add(anchor);
  const chain = readFollowingBuilderChain(anchor);
  const applied = [...priorCalls(anchor), ...(N.isCallExpression(anchor) ? [anchor] : []), ...chain.calls];
  const state = {
    filtered: before.filtered || applied.some((call) => staticMemberAccess(call.getExpression())?.name === WHERE_VERB),
    dynamic: before.dynamic || applied.some((call) => staticMemberAccess(call.getExpression())?.name === DYNAMIC_VERB),
  };
  const binding = builderBinding(chain.top);
  const followed = binding === undefined ? [] : builderUses(binding);
  const steps = followed.map((use) => statementCalls(use, seen, state));
  // The existing policy trusts an observed non-dynamic WHERE; a local dynamic modifier ends that trust.
  return {
    calls: [...chain.calls, ...steps.flatMap((step) => step.calls)],
    escapes: ((state.dynamic || !state.filtered) && builderEscapes(chain.top, binding)) || steps.some((step) => step.escapes),
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
  const after = statementCalls(anchor, new Set(), { filtered: false, dynamic: false });
  const calls = [...priorCalls(anchor), ...after.calls];
  const argumentsOf = (verb: string, position: number): readonly Node[] =>
    calls.flatMap((call) => {
      const argument = staticMemberAccess(call.getExpression())?.name === verb ? call.getArguments()[position] : undefined;
      return argument === undefined ? [] : [argument];
    });
  return { wheres: argumentsOf(WHERE_VERB, 0), innerOns: argumentsOf(INNER_JOIN_VERB, 1), escapes: after.escapes };
}
