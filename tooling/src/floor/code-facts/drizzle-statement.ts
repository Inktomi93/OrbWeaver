// Predicates and physical consumers belong to one native Drizzle statement.
// Returned builders remain editable; only proved native execution settles rows.
import { staticMemberAccess } from "@orb/tooling/floor/code-facts/reference-fact";
import type { CallExpression, Identifier, Node } from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";
import { readCallReturnProgram, readFunctionReturnPaths } from "./call-returns.ts";
import { callsDrizzleOperator } from "./drizzle-operators.ts";
import { readAnchorOf } from "./drizzle-query.ts";
import type { DrizzleBuilderChain, ReadAnchor, ReadStatement } from "./drizzle-query-contract.ts";
import { readDrizzleSelection, readFollowingSelectChain } from "./drizzle-select.ts";
import { runtimeDrizzleOrigin } from "./drizzle-sql-native.ts";
import { sqlValue } from "./drizzle-sql-origin.ts";
import { nativeQueryThenable, sqlCarrierUseStable, sqlSelectionCallbackUsesStable } from "./drizzle-sql-stability.ts";
import { drizzleExportOf } from "./drizzle-table-ref.ts";
import { declaredInDrizzle, readCalledMember } from "./drizzle-write-chain.ts";
import { enclosingFn } from "./function-context.ts";
import { inspectReferenceWrites, resolveStableExpression } from "./reference-fact.ts";
import { unwrapTarget as unwrapExpression } from "./reference-fact-alias.ts";
import type { CallReturnObservations, CallReturnProgram, ReferenceFact, UnresolvedReferenceFact } from "./reference-fact-contract.ts";
import { MEMBER_ACCESS_KINDS } from "./reference-fact-contract.ts";
import { referencesOf } from "./value-carrier.ts";

const WHERE_VERB = "where";
const INNER_JOIN_VERB = "innerJoin";
const DYNAMIC_VERB = "$dynamic";
const SEALED_VERBS: ReadonlySet<string> = new Set(["all", "get", "run", "execute"]);

/** The outermost node of a read's own builder chain, and the calls applied along the way. */
export function readFollowingBuilderChain(start: Node): DrizzleBuilderChain {
  return readFollowingSelectChain(start);
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

function nativeSqlCarrier(value: Node): boolean {
  const parent = value.getParent();
  if (N.isTemplateSpan(parent) && parent.getExpression() === value) {
    const template = parent.getParent().getParent();
    return N.isTaggedTemplateExpression(template) && drizzleExportOf(template.getTag()) === "sql" && runtimeDrizzleOrigin(template.getTag());
  }
  if (!(N.isCallExpression(parent) && parent.getArguments().includes(value) && runtimeDrizzleOrigin(parent.getExpression()))) {
    return false;
  }
  return (
    ["exists", "notExists", "inArray", "notInArray"].some((name) => callsDrizzleOperator(parent, name)) ||
    staticMemberAccess(parent.getExpression())?.name === "as"
  );
}

function closedBuilderUse(top: Node, state: BuilderFilterState, program?: CallReturnProgram): boolean | undefined {
  if (N.isAwaitExpression(top)) {
    const value = top.getExpression();
    const continued = state.origin !== undefined && N.isCallExpression(value) && runtimeDrizzleOrigin(value.getExpression()) && nativeQueryThenable(value);
    return continued || sqlCarrierUseStable(value, program);
  }
  if (N.isCallExpression(top) && SEALED_VERBS.has(staticMemberAccess(top.getExpression())?.name ?? "")) {
    return true;
  }
  if (N.isCallExpression(top) && sqlValue(top.getType()) && runtimeDrizzleOrigin(top.getExpression())) {
    return sqlCarrierUseStable(top, program);
  }
  return nativeSqlCarrier(top) ? sqlCarrierUseStable(top, program) : undefined;
}
/** Does this unawaited builder value leave the statement's view: passed as a call argument, returned, or bound
 *  to a name some use reads other than as a method receiver or an `await`? */
function builderEscapes(top: Node, binding: Identifier | undefined, state: BuilderFilterState, program?: CallReturnProgram): boolean {
  const closed = closedBuilderUse(top, state, program);
  if (closed !== undefined) {
    return !closed;
  }
  const parent = top.getParent();
  const fn = enclosingFn(top);
  const asyncReturn =
    fn !== undefined && (N.isFunctionDeclaration(fn) || N.isMethodDeclaration(fn) || N.isFunctionExpression(fn) || N.isArrowFunction(fn)) && fn.isAsync();
  const handedOff =
    !top.isKind(SyntaxKind.AwaitExpression) &&
    ((!asyncReturn && (parent?.isKind(SyntaxKind.ReturnStatement) === true || parent?.isKind(SyntaxKind.ArrowFunction) === true)) ||
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
        !use.getAncestors().some(N.isTypeNode) &&
        symbol !== undefined &&
        use.getSymbol()?.compilerSymbol === symbol &&
        !methodUses.has(use) &&
        !(N.isVariableDeclaration(use.getParent()) && use.getParent().getFirstChild() === use) &&
        !selfBuilderAssignment(use) &&
        (!(state.origin !== undefined && sqlCarrierUseStable(use, program)) || (state.dynamic && methodUses.size > 0)) &&
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
  readonly origin: Node | undefined;
}

function nativeStatementOrigin(node: Node): Node | undefined {
  const selection = readDrizzleSelection(node);
  return selection?.calls.every((call) => runtimeDrizzleOrigin(call.getExpression())) === true ? selection.root : undefined;
}

function nativeBuilderCall(call: CallExpression): boolean {
  const member = readCalledMember(call);
  return (
    member.kind === "resolved" &&
    member.value.declarations.length > 0 &&
    declaredInDrizzle(member.value.declarations) &&
    runtimeDrizzleOrigin(call.getExpression())
  );
}

function builderTransition(calls: readonly CallExpression[], state: BuilderFilterState, program?: CallReturnProgram): StatementCalls | undefined {
  const index = calls.findIndex((call) => SEALED_VERBS.has(staticMemberAccess(call.getExpression())?.name ?? "") || sqlValue(call.getType()));
  const prefix = index < 0 ? calls : calls.slice(0, index + 1);
  if (!prefix.every(nativeBuilderCall)) {
    return { calls, escapes: true, refusals: [] };
  }
  if (
    prefix.some((call) => {
      const argument = call.getArguments()[0];
      return (N.isArrowFunction(argument) || N.isFunctionExpression(argument)) && !sqlSelectionCallbackUsesStable(call, program);
    })
  ) {
    return { calls, escapes: true, refusals: [] };
  }
  const boundary = calls[index];
  if (boundary === undefined) {
    return;
  }
  if (state.origin === undefined) {
    return { calls, escapes: true, refusals: [] };
  }
  const executed = SEALED_VERBS.has(staticMemberAccess(boundary.getExpression())?.name ?? "");
  return { calls, escapes: !(executed || sqlCarrierUseStable(boundary, program)), refusals: [] };
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
    origin: before.origin ?? nativeStatementOrigin(anchor),
  };
  const transition = builderTransition(chain.calls, state, traversal.observations);
  if (transition !== undefined) {
    return transition;
  }
  const binding = builderBinding(chain.top);
  const local = (binding === undefined ? [] : builderUses(binding)).map((use) => statementCalls(use, state, traversal));
  const returns = returnedSteps(returnedBuilder(chain.top), state, traversal);
  const steps = [...local, ...returns];
  return {
    calls: [...chain.calls, ...steps.flatMap((step) => step.calls)],
    escapes:
      (returns.length === 0 &&
        (traversal.observations !== undefined || state.dynamic || !state.filtered) &&
        builderEscapes(chain.top, binding, state, traversal.observations)) ||
      steps.some((step) => step.escapes),
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
  const after = statementCalls(
    anchor,
    { filtered: false, dynamic: false, origin: undefined },
    { seen: new Set(), observations: program?.value, returning: new Set() },
  );
  const calls = [...priorCalls(anchor), ...after.calls];
  const argumentsOf = (verb: string, position: number): readonly Node[] =>
    calls.flatMap((call) => {
      const argument = staticMemberAccess(call.getExpression())?.name === verb ? call.getArguments()[position] : undefined;
      return argument === undefined ? [] : [argument];
    });
  return { wheres: argumentsOf(WHERE_VERB, 0), innerOns: argumentsOf(INNER_JOIN_VERB, 1), escapes: after.escapes, refusals: after.refusals };
}

function predicateWrapper(parent: Node, value: Node): boolean {
  return (
    N.isParenthesizedExpression(parent) ||
    N.isNonNullExpression(parent) ||
    N.isAsExpression(parent) ||
    N.isSatisfiesExpression(parent) ||
    (N.isConditionalExpression(parent) && parent.getCondition() !== value)
  );
}

function predicateCallUse(
  value: Node,
  parent: CallExpression,
  program: CallReturnProgram,
  active: ReadonlySet<object>,
): ReferenceFact<readonly CallExpression[]> {
  if (["and", "or", "not"].some((name) => callsDrizzleOperator(parent, name))) {
    return predicateUses(parent, program, active);
  }
  const member = readCalledMember(parent);
  return member.kind === "resolved" &&
    member.value.name === WHERE_VERB &&
    parent.getArguments()[0] === value &&
    member.value.declarations.length > 0 &&
    declaredInDrizzle(member.value.declarations)
    ? { kind: "resolved", value: [parent], trace: { declarations: [], origin: value } }
    : refusal(parent, "unsupported", "predicate leaves native boolean/WHERE composition");
}

function predicateAliasUses(parent: import("ts-morph").VariableDeclaration): ReferenceFact<readonly Node[]> {
  const name = parent.getNameNode();
  if (!N.isIdentifier(name)) {
    return refusal(parent, "unsupported", "predicate alias is not a lexical identifier");
  }
  const stable = resolveStableExpression(name);
  if ((stable.kind === "unresolved" && stable.reason !== "dynamic") || inspectReferenceWrites(name).kind === "unresolved") {
    return refusal(name, "write", "predicate alias is mutable");
  }
  return { kind: "resolved", value: referencesOf(name, enclosingFn(name) ?? name.getSourceFile()), trace: { declarations: [parent], origin: name } };
}

function predicateReturnUses(value: Node, program: CallReturnProgram): ReferenceFact<readonly Node[]> {
  const fn = enclosingFn(value);
  const paths = fn === undefined ? undefined : readFunctionReturnPaths(fn);
  if (fn === undefined || paths?.kind !== "resolved" || !program.referencesObserved) {
    return refusal(value, "missing", "predicate helper has no complete return/reference observations");
  }
  const escaped = program.escapingReferences.get(fn.compilerNode) ?? [];
  if (escaped[0] !== undefined) {
    return escaped[0];
  }
  const callers = program.callers.get(fn.compilerNode) ?? [];
  const failed = callers.find((caller) => caller.target.kind === "unresolved" || caller.returns.kind === "unresolved");
  return failed === undefined
    ? { kind: "resolved", value: callers.map((caller) => caller.call), trace: { declarations: [fn], origin: value } }
    : refusal(failed.call, "unsupported", "predicate helper has an unresolved consumer");
}

function predicateUses(value: Node, program: CallReturnProgram, active: ReadonlySet<object>): ReferenceFact<readonly CallExpression[]> {
  if (active.has(value.compilerNode)) {
    return refusal(value, "cycle", "predicate consumers revisit an authored value");
  }
  const next = new Set(active).add(value.compilerNode);
  const parent = value.getParent();
  if (parent === undefined) {
    return refusal(value, "missing", "predicate has no consumer");
  }
  if (predicateWrapper(parent, value)) {
    return predicateUses(parent, program, next);
  }
  if (N.isCallExpression(parent) && parent.getArguments().includes(value)) {
    return predicateCallUse(value, parent, program, next);
  }
  let uses: ReferenceFact<readonly Node[]>;
  if (N.isVariableDeclaration(parent) && parent.getInitializer() === value) {
    uses = predicateAliasUses(parent);
  } else if (N.isReturnStatement(parent) || parent === enclosingFn(value)) {
    uses = predicateReturnUses(value, program);
  } else {
    uses = refusal(parent, "unsupported", "predicate value has an unsupported consumer");
  }
  if (uses.kind === "unresolved") {
    return uses;
  }
  if (uses.value.length === 0) {
    return refusal(value, "missing", "predicate helper has no admitted native WHERE consumer");
  }
  const facts = uses.value.map((use) => predicateUses(use, program, next));
  const failed = facts.find((fact) => fact.kind === "unresolved");
  return (
    failed ?? { kind: "resolved", value: facts.flatMap((fact) => (fact.kind === "resolved" ? fact.value : [])), trace: { declarations: [], origin: value } }
  );
}

/** All WHERE consumers of a native EXISTS, including authored predicate-return helpers. One escape,
 * unknown continuation or mismatched compiler epoch refuses the complete correlation proof. */
export function readPredicateConsumers(anchor: Node, observations: CallReturnObservations): ReferenceFact<readonly CallExpression[]> {
  const program = readCallReturnProgram(anchor, observations);
  if (program.kind === "unresolved") {
    return program;
  }
  const top = readFollowingBuilderChain(anchor).top;
  const carrier = top.getParent();
  return N.isCallExpression(carrier) && callsDrizzleOperator(carrier, "exists") && carrier.getArguments()[0] === top
    ? predicateUses(carrier, program.value, new Set())
    : refusal(top, "unsupported", "only a native EXISTS carries correlated read scope");
}

/** Only anchors in this builder's receiver chain, never a nested SELECT passed as an argument. */
export function readStatementAnchors(call: CallExpression): readonly ReadAnchor[] {
  return [call, ...priorCalls(call)].flatMap((candidate) => {
    const anchor = readAnchorOf(candidate);
    return anchor === undefined ? [] : [anchor];
  });
}
