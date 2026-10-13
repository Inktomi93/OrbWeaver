// The STATEMENT half of the tenancy read readers: the predicates one drizzle read applies around a table anchor —
// its own builder chain up and down, a split builder's binding in the same function, and whether an unexecuted
// builder escapes the function's view. Synchronous returns continue at supplied native caller observations;
// async/awaited outputs are rows and never editable continuations.
import { staticMemberAccess } from "@orb/tooling/floor/code-facts/reference-fact";
import type { CallExpression, Identifier, Node } from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";
import { readCallReturnProgram } from "./call-returns.ts";
import { callsDrizzleOperator } from "./drizzle-operators.ts";
import type { DrizzleBuilderChain, ReadStatement } from "./drizzle-query-contract.ts";
import { enclosingFn } from "./function-context.ts";
import { unwrapTarget as unwrapExpression } from "./reference-fact-alias.ts";
import type { CallReturnObservations, CallReturnProgram, UnresolvedReferenceFact } from "./reference-fact-contract.ts";
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
    N.isParenthesizedExpression(parent) ||
    N.isNonNullExpression(parent) ||
    N.isAsExpression(parent) ||
    N.isSatisfiesExpression(parent) ||
    (N.isConditionalExpression(parent) && parent.getCondition() !== cur) ||
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
    const returned = returnedBuilder(readFollowingBuilderChain(use).top) !== undefined || access.isKind(SyntaxKind.ReturnStatement);
    const alias = access.isKind(SyntaxKind.VariableDeclaration) && access.getInitializer() === use;
    return use !== binding && (isMethodCall || alias || returned) && symbol !== undefined && use.getSymbol()?.compilerSymbol === symbol;
  });
}

function selfBuilderAssignment(use: Identifier): boolean {
  const parent = use.getParent();
  if (!N.isBinaryExpression(parent) || parent.getLeft() !== use || parent.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) {
    return false;
  }
  let receiver = unwrapExpression(parent.getRight());
  while (N.isCallExpression(receiver)) {
    const member = staticMemberAccess(receiver.getExpression());
    if (member === undefined) {
      return false;
    }
    receiver = unwrapExpression(member.receiver);
  }
  return N.isIdentifier(receiver) && receiver.getSymbol()?.compilerSymbol === use.getSymbol()?.compilerSymbol;
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
        !(N.isVariableDeclaration(use.getParent()) && use.getParent().getFirstChild() === use) &&
        !selfBuilderAssignment(use) &&
        !use.getParent().isKind(SyntaxKind.AwaitExpression) &&
        !(asyncReturn && use.getParent().isKind(SyntaxKind.ReturnStatement)),
    );
}

interface StatementCalls {
  readonly calls: readonly CallExpression[];
  readonly escapes: boolean;
  readonly refusals: readonly UnresolvedReferenceFact[];
}

interface BuilderFilterState {
  readonly filtered: boolean;
  readonly dynamic: boolean;
}

function refusal(node: Node, reason: UnresolvedReferenceFact["reason"], detail: string): UnresolvedReferenceFact {
  return { kind: "unresolved", reason, detail, node, trace: { declarations: [], origin: node } };
}

function asyncFunction(fn: Node): boolean {
  return (N.isFunctionDeclaration(fn) || N.isMethodDeclaration(fn) || N.isFunctionExpression(fn) || N.isArrowFunction(fn)) && fn.isAsync();
}

/** A synchronous return preserves the editable builder. Async returns assimilate it into rows. */
function returnedBuilder(top: Node): Node | undefined {
  const parent = top.getParent();
  const fn = enclosingFn(top);
  return fn !== undefined &&
    !asyncFunction(fn) &&
    !top.isKind(SyntaxKind.AwaitExpression) &&
    (parent?.isKind(SyntaxKind.ReturnStatement) === true || parent === fn)
    ? fn
    : undefined;
}

interface StatementTraversal {
  readonly seen: Set<Node>;
  readonly observations: CallReturnProgram | undefined;
  readonly returning: ReadonlySet<Node>;
}

function returnedSteps(fn: Node | undefined, state: BuilderFilterState, traversal: StatementTraversal): readonly StatementCalls[] {
  if (fn === undefined || traversal.observations === undefined) {
    return [];
  }
  if (traversal.returning.has(fn)) {
    return [{ calls: [], escapes: true, refusals: [refusal(fn, "cycle", "an editable builder return revisits its callable body")] }];
  }
  if (!traversal.observations.referencesObserved) {
    return [
      { calls: [], escapes: true, refusals: [refusal(fn, "missing", "native callable-reference coverage was not supplied for the returned editable builder")] },
    ];
  }
  const escaped = traversal.observations.escapingReferences.get(fn.compilerNode) ?? [];
  const incomplete: readonly StatementCalls[] = escaped.length === 0 ? [] : [{ calls: [], escapes: true, refusals: escaped }];
  const callers = traversal.observations.callers.get(fn.compilerNode) ?? [];
  if (callers.length === 0 && incomplete.length === 0) {
    return [{ calls: [], escapes: true, refusals: [refusal(fn, "missing", "the returned editable builder has no admitted native caller continuation")] }];
  }
  return [
    ...incomplete,
    ...callers.map((caller) =>
      caller.returns.kind === "unresolved"
        ? { calls: [], escapes: true, refusals: [caller.returns] }
        : statementCalls(caller.call, state, { seen: new Set(), observations: traversal.observations, returning: new Set([...traversal.returning, fn]) }),
    ),
  ];
}

/** Returned builders continue at observed native callers; separate WHEREs remain alternatives. */
function statementCalls(anchor: Node, before: BuilderFilterState, traversal: StatementTraversal): StatementCalls {
  if (traversal.seen.has(anchor)) {
    return { calls: [], escapes: false, refusals: [] };
  }
  traversal.seen.add(anchor);
  const chain = readFollowingBuilderChain(anchor);
  const applied = [...priorCalls(anchor), ...(N.isCallExpression(anchor) ? [anchor] : []), ...chain.calls];
  const state = {
    filtered: before.filtered || applied.some((call) => staticMemberAccess(call.getExpression())?.name === WHERE_VERB),
    dynamic: before.dynamic || applied.some((call) => staticMemberAccess(call.getExpression())?.name === DYNAMIC_VERB),
  };
  if (applied.some((call) => SEALED_VERBS.has(staticMemberAccess(call.getExpression())?.name ?? ""))) {
    return { calls: chain.calls, escapes: false, refusals: [] };
  }
  const binding = builderBinding(chain.top);
  const local = (binding === undefined ? [] : builderUses(binding)).map((use) => statementCalls(use, state, traversal));
  const returns = returnedSteps(returnedBuilder(chain.top), state, traversal);
  const steps = [...local, ...returns];
  return {
    calls: [...chain.calls, ...steps.flatMap((step) => step.calls)],
    escapes: (returns.length === 0 && (state.dynamic || !state.filtered) && builderEscapes(chain.top, binding)) || steps.some((step) => step.escapes),
    refusals: steps.flatMap((step) => step.refusals),
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
export function readStatementOf(anchor: Node, observations?: CallReturnObservations): ReadStatement {
  const program = observations === undefined ? undefined : readCallReturnProgram(anchor, observations);
  if (program?.kind === "unresolved") {
    return { wheres: [], innerOns: [], escapes: true, refusals: [program] };
  }
  const after = statementCalls(anchor, { filtered: false, dynamic: false }, { seen: new Set(), observations: program?.value, returning: new Set() });
  const calls = [...priorCalls(anchor), ...after.calls];
  const argumentsOf = (verb: string, position: number): readonly Node[] =>
    calls.flatMap((call) => {
      const argument = staticMemberAccess(call.getExpression())?.name === verb ? call.getArguments()[position] : undefined;
      return argument === undefined ? [] : [argument];
    });
  return { wheres: argumentsOf(WHERE_VERB, 0), innerOns: argumentsOf(INNER_JOIN_VERB, 1), escapes: after.escapes, refusals: after.refusals };
}
