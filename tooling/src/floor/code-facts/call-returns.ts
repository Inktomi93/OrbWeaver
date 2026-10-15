// The expressions the function a call targets returns, entered through a factory that is local, imported or a const-bound arrow.
// Every answer is a `ReferenceFact`: an unreadable factory is an `unresolved` fact with a reason, never an empty list.
import type { CallExpression, Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import {
  readObservedCallableConsumers as callableConsumers,
  readCallReturnProgram as capturedProgram,
  readCallBindings as suppliedBindings,
  readSuppliedParameter as suppliedParameter,
} from "./call-supplied.ts";
import { isDocumentationLinkReference, readStaticString, resolveStableExpression, staticMemberAccess } from "./reference-fact.ts";
import { lexicalReferenceSymbol, unwrapTarget } from "./reference-fact-alias.ts";
import {
  resolveCallableAlternatives,
  resolveCallableDeclaration,
  resolveCallableOrigin,
  resolveCallableValueDeclaration,
  resolveCallableValueOrigin,
} from "./reference-fact-call.ts";
import type {
  CallableDeclaration,
  CallReturnCaptureOptions,
  CallReturnObservation,
  CallReturnObservations,
  CallReturnProgram,
  ReferenceFact,
  ReferenceUnresolvedReason,
  ReturnedValueInputs,
  UnresolvedReferenceFact,
} from "./reference-fact-contract.ts";
import { readStaticAuthoredValue } from "./static-authored-value.ts";
import { declaredByPackage, resolveTypeMemberOrigin } from "./type-member-origin.ts";

import { readAuthoredCallableSources } from "./value-carrier.ts";

interface Trace {
  readonly declarations: MorphNode[];
}

function note(trace: Trace, declaration: MorphNode): void {
  if (!trace.declarations.some((existing) => existing.compilerNode === declaration.compilerNode)) {
    trace.declarations.push(declaration);
  }
}

function unresolved(reason: ReferenceUnresolvedReason, node: MorphNode, trace: Trace, detail: string): UnresolvedReferenceFact {
  return { kind: "unresolved", reason, detail, node, trace: { declarations: [...trace.declarations], origin: node } };
}

function isFunctionish(node: MorphNode): boolean {
  return Node.isFunctionDeclaration(node) || Node.isArrowFunction(node) || Node.isFunctionExpression(node) || Node.isMethodDeclaration(node);
}

/** The function-like node a declaration denotes: a `function`/method directly, an arrow or function
 *  expression through a `const f = …` binding. Anything else is not a factory this reader can enter. */
function functionLike(declaration: MorphNode, trace: Trace): ReferenceFact<MorphNode> {
  if (isFunctionish(declaration)) {
    note(trace, declaration);
    return { kind: "resolved", value: declaration, trace: { declarations: [...trace.declarations], origin: declaration } };
  }
  if (!(Node.isVariableDeclaration(declaration) || Node.isPropertyAssignment(declaration))) {
    return unresolved("unsupported", declaration, trace, `${declaration.getKindName()} is not a callable declaration`);
  }
  const initializer = declaration.getInitializer();
  const value = initializer === undefined ? undefined : unwrapTarget(initializer);
  if (value === undefined || !isFunctionish(value)) {
    return unresolved("unsupported", declaration, trace, `${declaration.getName()} is not bound to a function expression`);
  }
  note(trace, declaration);
  return { kind: "resolved", value, trace: { declarations: [...trace.declarations], origin: value } };
}

/** The module-local declaration an identifier binds, through the SHARED lexical symbol. This is the hop the
 *  module-origin reader deliberately does not model (it answers "which module export", and a non-exported
 *  local is not one); a shadowed or overloaded name resolves to more than one declaration and refuses. */
function localDeclaration(callee: MorphNode, trace: Trace, refusal: UnresolvedReferenceFact): ReferenceFact<MorphNode> {
  if (!(Node.isIdentifier(callee) || Node.isPropertyAccessExpression(callee) || Node.isElementAccessExpression(callee))) {
    return refusal;
  }
  const declarations = (Node.isIdentifier(callee) ? lexicalReferenceSymbol(callee) : callee.getSymbol())?.getDeclarations() ?? [];
  if (declarations.length === 0) {
    return refusal;
  }
  for (const declaration of declarations) {
    note(trace, declaration);
  }
  if (declarations.length !== 1) {
    return unresolved("ambiguous", callee, trace, `${callee.getText()} binds ${declarations.length} declarations`);
  }
  const only = declarations[0];
  return only === undefined ? refusal : functionLike(only, trace);
}

function calleeFunction(call: CallExpression, trace: Trace): ReferenceFact<MorphNode> {
  const origin = resolveCallableOrigin(call);
  if (origin.kind === "resolved" && origin.value.target.kind === "module") {
    const canonical = origin.value.target.canonical;
    return canonical.kind === "project"
      ? functionLike(canonical.declaration, trace)
      : unresolved("unsupported", call, trace, `${canonical.exportedName} is declared in the external package ${canonical.moduleSpecifier}`);
  }
  const refusal =
    origin.kind === "unresolved"
      ? unresolved(origin.reason, origin.node, trace, origin.detail)
      : unresolved("unsupported", call, trace, `${call.getExpression().getText()} resolves to an ambient global, not an authored factory`);
  return localDeclaration(unwrapTarget(call.getExpression()), trace, refusal);
}

/** Every expression a function-like node RETURNS — its OWN returns only, so a nested closure's `return` is
 *  not this function's. A concise arrow's body IS its single return. */
function returnedExpressions(fn: MorphNode, explicitAbsentReturns = false): readonly MorphNode[] {
  if (Node.isArrowFunction(fn) && !Node.isBlock(fn.getBody())) {
    return [fn.getBody()];
  }
  const hasBody = Node.isFunctionDeclaration(fn) || Node.isArrowFunction(fn) || Node.isFunctionExpression(fn) || Node.isMethodDeclaration(fn);
  const body = hasBody ? fn.getBody() : undefined;
  if (body === undefined || !Node.isBlock(body)) {
    return [];
  }
  return body
    .getDescendantsOfKind(SyntaxKind.ReturnStatement)
    .filter((statement) => statement.getFirstAncestor(isFunctionish) === fn)
    .map((statement) => statement.getExpression() ?? (explicitAbsentReturns ? statement : undefined))
    .filter((expression) => expression !== undefined);
}

interface NativeReturnFlow {
  readonly statements: readonly MorphNode[];
  readonly values: readonly MorphNode[];
  readonly stops: boolean;
}

function nativeConditionalReturns(
  statement: import("ts-morph").IfStatement,
  owner: MorphNode,
  projection: Pick<ReturnedValueInputs, "explicitAbsentReturns">,
  trace: Trace,
): ReferenceFact<NativeReturnFlow> {
  const empty: ReferenceFact<NativeReturnFlow> = {
    kind: "resolved",
    value: { values: [], stops: false, statements: [] },
    trace: { declarations: trace.declarations, origin: statement },
  };
  const literal = readStaticAuthoredValue(statement.getExpression());
  const known = literal.kind === "resolved" && literal.value.kind === "scalar" && typeof literal.value.value === "boolean" ? literal.value.value : undefined;
  const alternative = statement.getElseStatement();
  if (known === true) {
    return nativeStatementReturns(statement.getThenStatement(), owner, projection, trace);
  }
  if (known === false) {
    return alternative === undefined ? empty : nativeStatementReturns(alternative, owner, projection, trace);
  }
  const yes = nativeStatementReturns(statement.getThenStatement(), owner, projection, trace);
  const no = alternative === undefined ? empty : nativeStatementReturns(alternative, owner, projection, trace);
  if (yes.kind === "unresolved") {
    return yes;
  }
  if (no.kind === "unresolved") {
    return no;
  }
  return {
    kind: "resolved",
    value: {
      values: [...yes.value.values, ...no.value.values],
      stops: yes.value.stops && no.value.stops,
      statements: [...yes.value.statements, ...no.value.statements],
    },
    trace: { declarations: trace.declarations, origin: statement },
  };
}

function nativeStatementReturns(
  statement: MorphNode,
  owner: MorphNode,
  projection: Pick<ReturnedValueInputs, "explicitAbsentReturns">,
  trace: Trace,
): ReferenceFact<NativeReturnFlow> {
  const empty = (): ReferenceFact<NativeReturnFlow> => ({
    kind: "resolved",
    value: { values: [], stops: false, statements: [statement] },
    trace: { declarations: trace.declarations, origin: statement },
  });
  if (Node.isReturnStatement(statement)) {
    const value = statement.getExpression();
    return value === undefined && projection.explicitAbsentReturns !== true
      ? unresolved("unsupported", statement, trace, "native return has an unrequested expressionless exit")
      : {
          kind: "resolved",
          value: { values: [value ?? statement], stops: true, statements: [statement] },
          trace: { declarations: trace.declarations, origin: statement },
        };
  }
  if (Node.isThrowStatement(statement)) {
    return { kind: "resolved", value: { values: [], stops: true, statements: [statement] }, trace: { declarations: trace.declarations, origin: statement } };
  }
  if (Node.isBlock(statement)) {
    return nativeStatementSequence(statement.getStatements(), owner, projection, trace);
  }
  if (Node.isIfStatement(statement)) {
    return nativeConditionalReturns(statement, owner, projection, trace);
  }
  if (
    Node.isTryStatement(statement) ||
    Node.isSwitchStatement(statement) ||
    Node.isLabeledStatement(statement) ||
    Node.isForStatement(statement) ||
    Node.isForInStatement(statement) ||
    Node.isWhileStatement(statement) ||
    Node.isDoStatement(statement) ||
    statement.getDescendants().some((node) => (Node.isReturnStatement(node) || Node.isThrowStatement(node)) && node.getFirstAncestor(isFunctionish) === owner)
  ) {
    return unresolved("unsupported", statement, trace, "native returned paths have an unsupported control exit");
  }
  return empty();
}

function nativeStatementSequence(
  statements: readonly MorphNode[],
  owner: MorphNode,
  projection: Pick<ReturnedValueInputs, "explicitAbsentReturns">,
  trace: Trace,
): ReferenceFact<NativeReturnFlow> {
  const values: MorphNode[] = [];
  const reachable: MorphNode[] = [];
  for (const statement of statements) {
    const fact = nativeStatementReturns(statement, owner, projection, trace);
    if (fact.kind === "unresolved") {
      return fact;
    }
    values.push(...fact.value.values);
    reachable.push(...fact.value.statements);
    if (fact.value.stops) {
      return { ...fact, value: { values, stops: true, statements: reachable } };
    }
  }
  return { kind: "resolved", value: { values, stops: false, statements: reachable }, trace: { declarations: trace.declarations, origin: owner } };
}

function nativeFunctionReturns(
  fn: MorphNode,
  body: MorphNode,
  projection: Pick<ReturnedValueInputs, "explicitAbsentReturns">,
  trace: Trace,
): ReferenceFact<readonly MorphNode[]> {
  if (
    (Node.isFunctionDeclaration(fn) || Node.isFunctionExpression(fn) || Node.isArrowFunction(fn) || Node.isMethodDeclaration(fn)) &&
    (fn.isAsync() || (!Node.isArrowFunction(fn) && fn.isGenerator()))
  ) {
    return unresolved("unsupported", fn, trace, "native value paths do not project async/generator results");
  }
  if (!Node.isBlock(body)) {
    return { kind: "resolved", value: [body], trace: { declarations: trace.declarations, origin: fn } };
  }
  const native = nativeStatementSequence(body.getStatements(), fn, projection, trace);
  if (native.kind === "unresolved") {
    return native;
  }
  if (!native.value.stops) {
    return unresolved("unsupported", fn, trace, "native returned paths have an implicit exit");
  }
  return native.value.values.length === 0
    ? unresolved("missing", fn, trace, "native returned paths have no retained expression")
    : { kind: "resolved", value: native.value.values, trace: { declarations: trace.declarations, origin: fn } };
}

function nativeStatementReachable(node: MorphNode, program: CallReturnProgram): ReferenceFact<true> {
  const captured = capturedProgram(node, { programs: [program] });
  if (captured.kind === "unresolved") {
    return captured;
  }
  const fn = node.getFirstAncestor(isFunctionish);
  const body =
    Node.isFunctionDeclaration(fn) || Node.isFunctionExpression(fn) || Node.isArrowFunction(fn) || Node.isMethodDeclaration(fn) ? fn.getBody() : undefined;
  const trace = { declarations: fn === undefined ? [] : [fn] };
  if (fn === undefined || !Node.isBlock(body)) {
    return unresolved("unsupported", node, trace, "native writer has no captured authored block owner");
  }
  const flow = nativeStatementSequence(body.getStatements(), fn, { explicitAbsentReturns: true }, trace);
  if (flow.kind === "unresolved") {
    return flow;
  }
  return flow.value.statements.some((statement) => statement.compilerNode === node.compilerNode)
    ? { kind: "resolved", value: true, trace: flow.trace }
    : unresolved("unsupported", node, trace, "native writer statement has no reachable authored path");
}

/** Every visible exit must be authored; only an explicitly requested projection retains bare-return absence. */
export function readFunctionReturnPaths(
  fn: MorphNode,
  projection: Pick<ReturnedValueInputs, "explicitAbsentReturns" | "nativeValueTransfers"> = {},
): ReferenceFact<readonly MorphNode[]> {
  const trace: Trace = { declarations: [fn] };
  const body =
    Node.isFunctionDeclaration(fn) || Node.isArrowFunction(fn) || Node.isFunctionExpression(fn) || Node.isMethodDeclaration(fn) ? fn.getBody() : undefined;
  if (body === undefined) {
    return unresolved("missing", fn, trace, "the callable has no authored body");
  }
  if (projection.nativeValueTransfers === true) {
    return nativeFunctionReturns(fn, body, projection, trace);
  }
  const values = returnedExpressions(fn, true);
  if (Node.isBlock(body)) {
    const last = body.getStatements().at(-1);
    if (!(Node.isReturnStatement(last) || Node.isThrowStatement(last)) || (projection.explicitAbsentReturns !== true && values.some(Node.isReturnStatement))) {
      return unresolved("unsupported", fn, trace, "the callable has an implicit or expressionless return path");
    }
  }
  return values.length === 0
    ? unresolved("missing", fn, trace, "the callable returns no expression")
    : { kind: "resolved", value: values, trace: { declarations: [fn], origin: fn } };
}

/** The expressions the function THIS CALL targets returns. A one-literal factory reader would refuse any function
 *  with more than one `return`; a union reader must see them all, so this is its own door. */
export function readCallReturns(call: CallExpression): ReferenceFact<readonly MorphNode[]> {
  const trace: Trace = { declarations: [] };
  const fn = calleeFunction(call, trace);
  if (fn.kind === "unresolved") {
    return fn;
  }
  const returns = returnedExpressions(fn.value);
  return returns.length === 0
    ? unresolved("missing", fn.value, trace, `${call.getExpression().getText()} returns no expression this reader can enter`)
    : { kind: "resolved", value: returns, trace: { declarations: [...trace.declarations], origin: fn.value } };
}

/** The actual authored callable body; imported, object-contained and lexical calls use the same resolution. */
export function readCallTarget(call: CallExpression): ReferenceFact<MorphNode> {
  return calleeFunction(call, { declarations: [] });
}

function authoredCallTarget(call: CallExpression): ReferenceFact<MorphNode> {
  const authored = resolveCallableDeclaration(call);
  return authored.kind === "resolved" ? { ...authored, value: authored.value.declaration } : authored;
}

function singleCallTargets(target: ReferenceFact<MorphNode>): ReferenceFact<readonly MorphNode[]> {
  return target.kind === "resolved" ? { ...target, value: [target.value] } : target;
}

/** The same authored invocation can select several closed literal callable bodies. */
export function readCallTargets(
  call: CallExpression,
  admitted?: ReadonlySet<import("ts-morph").ts.CallExpression>,
  observations?: CallReturnObservations,
  optionalInvocation = false,
): ReferenceFact<readonly MorphNode[]> {
  let supplied = false;
  if (observations !== undefined) {
    const captured = capturedProgram(call, observations);
    if (captured.kind === "unresolved") {
      return captured;
    }
    supplied = captured.value.suppliedCallableTargets === true;
  }
  const direct = supplied ? authoredCallTarget(call) : readCallTarget(call);
  const expression = unwrapTarget(call.getExpression());
  const optional =
    observations !== undefined &&
    (Node.isPropertyAccessExpression(expression) || Node.isElementAccessExpression(expression)) &&
    expression.hasQuestionDotToken();
  if (direct.kind === "resolved" && !optional) {
    return singleCallTargets(direct);
  }
  const alternatives = resolveCallableAlternatives(call, admitted, observations, optionalInvocation);
  return alternatives.kind === "unresolved" ? alternatives : { ...alternatives, value: alternatives.value.map((target) => target.declaration) };
}

/** Actual supplied bindings, shared with formal-origin readers. */
export function readCallBindings(call: CallExpression, owner: MorphNode, previous: ReadonlyMap<MorphNode, MorphNode>): ReadonlyMap<MorphNode, MorphNode> {
  return suppliedBindings(call, owner, previous);
}

function callBodyCalls(owner: MorphNode, onBodyNode?: (node: MorphNode) => void): readonly CallExpression[] {
  if (onBodyNode === undefined) {
    return owner.getDescendantsOfKind(SyntaxKind.CallExpression);
  }
  const calls: CallExpression[] = [];
  for (const node of owner.getDescendants()) {
    onBodyNode(node);
    if (Node.isCallExpression(node)) {
      calls.push(node);
    }
  }
  return calls;
}

/** Native call/body candidates reachable from the supplied roots, without a second Project or source population. */
export function readCallClosure(roots: readonly CallExpression[], onBodyNode?: (node: MorphNode) => void): readonly CallExpression[] {
  const calls: CallExpression[] = [];
  const seenCalls = new Set<object>();
  const seenBodies = new Set<object>();
  const pending = [...roots];
  for (const call of pending) {
    if (seenCalls.has(call.compilerNode)) {
      continue;
    }
    seenCalls.add(call.compilerNode);
    calls.push(call);
    const targets = readCallTargets(call);
    for (const target of targets.kind === "resolved" ? targets.value : []) {
      if (!seenBodies.has(target.compilerNode)) {
        seenBodies.add(target.compilerNode);
        pending.push(...callBodyCalls(target, onBodyNode));
      }
    }
  }
  return calls;
}

function callableBindingCandidate(node: MorphNode, declaration: MorphNode): boolean {
  if (isFunctionish(declaration)) {
    return true;
  }
  const value = Node.isVariableDeclaration(declaration) || Node.isPropertyAssignment(declaration) ? declaration.getInitializer() : undefined;
  if (value === undefined) {
    return false;
  }
  if (isFunctionish(value)) {
    return true;
  }
  if (!(Node.isIdentifier(value) || Node.isPropertyAccessExpression(value) || Node.isElementAccessExpression(value))) {
    return false;
  }
  const stable = resolveStableExpression(node);
  return stable.kind === "resolved"
    ? isFunctionish(stable.value)
    : stable.reason === "dynamic" && (Node.isPropertyAccessExpression(stable.node) || Node.isElementAccessExpression(stable.node));
}

function referenceCandidate(node: MorphNode): boolean {
  if (
    !(Node.isIdentifier(node) || Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node)) ||
    node.getAncestors().some(Node.isTypeNode)
  ) {
    return false;
  }
  const parent = node.getParent();
  if (
    Node.isIdentifier(node) &&
    ((Node.isPropertyAccessExpression(parent) && parent.getNameNode() === node) ||
      ((Node.isVariableDeclaration(parent) ||
        Node.isParameterDeclaration(parent) ||
        Node.isFunctionDeclaration(parent) ||
        Node.isFunctionExpression(parent) ||
        Node.isMethodDeclaration(parent) ||
        Node.isPropertyAssignment(parent)) &&
        parent.getNameNode() === node) ||
      Node.isImportSpecifier(parent) ||
      Node.isExportSpecifier(parent) ||
      Node.isImportClause(parent) ||
      Node.isNamespaceImport(parent))
  ) {
    return false;
  }
  // Declaration syntax filters unrelated values without asking for their types or walking their references.
  const symbol = Node.isIdentifier(node) ? lexicalReferenceSymbol(node) : node.getSymbol();
  return ((symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations() ?? []).some((declaration) => callableBindingCandidate(node, declaration));
}

function admittedReference(node: MorphNode, target: MorphNode, calls: ReadonlyMap<import("ts-morph").ts.CallExpression, CallReturnObservation>): boolean {
  const invocation = node.getFirstAncestorByKind(SyntaxKind.CallExpression);
  if (invocation !== undefined && unwrapTarget(invocation.getExpression()) === node) {
    const observed = calls.get(invocation.compilerNode);
    const stable = resolveCallableDeclaration(node);
    return stable.kind !== "unresolved" || stable.reason !== "write"
      ? observed?.target.kind === "resolved" && observed.target.value.compilerNode === target.compilerNode
      : false;
  }
  const binding = node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  const initializer = binding?.getInitializer();
  if (binding !== undefined && initializer !== undefined && unwrapTarget(initializer) === node) {
    const alias = resolveCallableDeclaration(binding.getNameNode());
    return alias.kind === "resolved" && alias.value.declaration.compilerNode === target.compilerNode;
  }
  return false;
}

function referenceHomes(fact: ReferenceFact<import("./reference-fact-contract.ts").CallableDeclaration>): readonly MorphNode[] {
  if (fact.kind === "resolved") {
    return [fact.value.declaration];
  }
  return fact.trace.declarations.flatMap((declaration) => {
    if (isFunctionish(declaration)) {
      return [declaration];
    }
    const value = Node.isVariableDeclaration(declaration) || Node.isPropertyAssignment(declaration) ? declaration.getInitializer() : undefined;
    return value !== undefined && isFunctionish(value) ? [value] : [];
  });
}

/** A relevant callable value escape is independent of the calls whose target could be admitted. */
function escapingReferences(
  references: readonly MorphNode[],
  calls: ReadonlyMap<import("ts-morph").ts.CallExpression, CallReturnObservation>,
): ReadonlyMap<import("ts-morph").ts.Node, readonly UnresolvedReferenceFact[]> {
  const escaped = new Map<import("ts-morph").ts.Node, UnresolvedReferenceFact[]>();
  const seen = new Set<object>();
  for (const node of references) {
    if (seen.has(node.compilerNode) || isDocumentationLinkReference(node) || !referenceCandidate(node)) {
      continue;
    }
    seen.add(node.compilerNode);
    const fact = resolveCallableDeclaration(node);
    const homes = referenceHomes(fact);
    for (const home of homes) {
      if (home.getSourceFile().isDeclarationFile() || admittedReference(node, home, calls)) {
        continue;
      }
      const previous = escaped.get(home.compilerNode) ?? [];
      previous.push(
        fact.kind === "unresolved"
          ? fact
          : unresolved("unsupported", node, { declarations: [home] }, "the callable value escapes its admitted native caller continuations"),
      );
      escaped.set(home.compilerNode, previous);
    }
  }
  return escaped;
}

function observeAlternatives(
  targets: ReferenceFact<readonly MorphNode[]>,
  projection: Pick<ReturnedValueInputs, "explicitAbsentReturns" | "nativeValueTransfers">,
): ReferenceFact<readonly import("./reference-fact-contract.ts").CallReturnAlternative[]> {
  return targets.kind === "unresolved"
    ? targets
    : {
        ...targets,
        value: targets.value.map((target) => ({
          target,
          returns: readFunctionReturnPaths(target),
          ...(projection.nativeValueTransfers === true ? { nativeReturns: readFunctionReturnPaths(target, projection) } : {}),
          ...(projection.explicitAbsentReturns === true ? { explicitReturns: readFunctionReturnPaths(target, { explicitAbsentReturns: true }) } : {}),
        })),
      };
}

function optionalReceiverInvocation(call: CallExpression): boolean {
  const expression = unwrapTarget(call.getExpression());
  return (Node.isPropertyAccessExpression(expression) || Node.isElementAccessExpression(expression)) && expression.hasQuestionDotToken();
}

function capturedCallers(calls: readonly CallReturnObservation[]): ReadonlyMap<import("ts-morph").ts.Node, readonly CallReturnObservation[]> {
  const callers = new Map<import("ts-morph").ts.Node, CallReturnObservation[]>();
  for (const observation of calls) {
    const invocation = observation.invocationTargets ?? observation.targets;
    for (const callable of invocation.kind === "resolved" ? invocation.value : []) {
      const target = callable.compilerNode;
      const previous = callers.get(target) ?? [];
      previous.push(observation);
      callers.set(target, previous);
    }
  }
  return callers;
}

function refinedObservation(
  previous: CallReturnObservation,
  admitted: ReadonlySet<import("ts-morph").ts.CallExpression>,
  observed: CallReturnObservations,
  projection: CallReturnCaptureOptions,
): CallReturnObservation {
  const targets = readCallTargets(previous.call, admitted, observed);
  const invocationTargets =
    targets.kind === "unresolved" && optionalReceiverInvocation(previous.call) ? readCallTargets(previous.call, admitted, observed, true) : undefined;
  const first = targets.kind === "resolved" && targets.value.length === 1 ? targets.value[0] : undefined;
  let target: ReferenceFact<MorphNode> = targets.kind === "unresolved" ? targets : readCallTarget(previous.call);
  if (first !== undefined) {
    target = { ...targets, kind: "resolved", value: first };
  }
  return {
    call: previous.call,
    target,
    targets,
    alternatives: observeAlternatives(targets, projection),
    returns: target.kind === "resolved" ? readFunctionReturnPaths(target.value) : target,
    ...(invocationTargets === undefined ? {} : { invocationTargets }),
  };
}

function callableHomeKey(owner: MorphNode): string | undefined {
  if (Node.isCallExpression(owner)) {
    return staticMemberAccess(unwrapTarget(owner.getExpression()))?.name;
  }
  const property = owner.getParent();
  if (!Node.isPropertyAssignment(property) || property.getInitializer() !== owner) {
    return;
  }
  const name = property.getNameNode();
  const literal = Node.isComputedPropertyName(name) ? readStaticString(name.getExpression()) : undefined;
  return literal?.kind === "unresolved" ? undefined : (literal?.value ?? (Node.isStringLiteral(name) ? name.getLiteralText() : property.getName()));
}

function callableHomeKeys(owners: ReadonlySet<MorphNode>): ReadonlySet<string> {
  return new Set(
    [...owners].flatMap((owner) => {
      const key = callableHomeKey(owner);
      return key === undefined ? [] : [key];
    }),
  );
}

function incomingCallableCandidate(call: CallExpression, keys: ReadonlySet<string>): boolean {
  const callee = unwrapTarget(call.getExpression());
  // A dynamic selector or extracted alias cannot be ruled out by one authored property's key.
  if (!Node.isPropertyAccessExpression(callee)) {
    return true;
  }
  const member = staticMemberAccess(callee);
  return member === undefined || keys.has(member.name) || optionalReceiverInvocation(call);
}

interface CapturedCallGroup {
  calls: CallReturnObservation[];
  readonly sources: Map<import("ts-morph").SourceFile, import("ts-morph").ts.SourceFile>;
}

function captureObservationSources(group: CapturedCallGroup, observation: CallReturnObservation): void {
  const { call, targets, alternatives } = observation;
  const paths =
    alternatives.kind === "resolved"
      ? alternatives.value.flatMap((alternative) => {
          const captured = alternative.explicitReturns ?? alternative.returns;
          return captured.kind === "resolved" ? captured.value : [];
        })
      : [];
  for (const node of [call, ...(targets.kind === "resolved" ? targets.value : []), ...paths]) {
    const source = node.getSourceFile();
    group.sources.set(source, source.compilerNode);
  }
}

interface SuppliedRefinement {
  readonly admitted: Set<import("ts-morph").ts.CallExpression>;
  readonly directCalls: ReadonlySet<import("ts-morph").ts.CallExpression>;
  readonly references: readonly MorphNode[];
  readonly demandedOwners: Set<MorphNode>;
  readonly enteredBodies: Set<import("ts-morph").ts.Node>;
  readonly projection: CallReturnCaptureOptions;
  readonly capture: (call: CallExpression) => void;
  readonly snapshot: () => CallReturnObservations;
  readonly onBodyNode: ((node: MorphNode) => void) | undefined;
  readonly targetKey: (targets: ReferenceFact<readonly MorphNode[]> | undefined) => string;
}

function enterObservationBodies(observation: CallReturnObservation, group: CapturedCallGroup, inputs: SuppliedRefinement): readonly CallExpression[] {
  const invocation = observation.invocationTargets ?? observation.targets;
  const calls: CallExpression[] = [];
  for (const body of invocation.kind === "resolved" ? invocation.value : []) {
    const source = body.getSourceFile();
    group.sources.set(source, source.compilerNode);
    if (inputs.enteredBodies.has(body.compilerNode)) {
      continue;
    }
    inputs.enteredBodies.add(body.compilerNode);
    calls.push(...callBodyCalls(body, inputs.onBodyNode));
  }
  return calls;
}

function refineSuppliedRound(groups: ReadonlyMap<import("ts-morph").Project, CapturedCallGroup>, inputs: SuppliedRefinement): boolean {
  const observed = inputs.snapshot();
  const demandedBefore = inputs.demandedOwners.size;
  const keys = callableHomeKeys(inputs.demandedOwners);
  const newCalls: CallExpression[] = [];
  let changed = false;
  for (const group of groups.values()) {
    const previousCalls = group.calls;
    group.calls = previousCalls.map((previous) => {
      if (inputs.directCalls.has(previous.call.compilerNode) || !incomingCallableCandidate(previous.call, keys)) {
        return previous;
      }
      const refined = refinedObservation(previous, inputs.admitted, observed, inputs.projection);
      newCalls.push(...enterObservationBodies(refined, group, inputs));
      return refined;
    });
    changed ||= group.calls.some(
      (observation, index) =>
        inputs.targetKey(observation.targets) !== inputs.targetKey(previousCalls[index]?.targets) ||
        inputs.targetKey(observation.invocationTargets) !== inputs.targetKey(previousCalls[index]?.invocationTargets),
    );
  }
  for (const call of newCalls) {
    if (inputs.admitted.has(call.compilerNode)) {
      continue;
    }
    inputs.admitted.add(call.compilerNode);
    inputs.capture(call);
    changed = true;
  }
  return changed || inputs.demandedOwners.size !== demandedBefore;
}

function refuseCyclicRefinement(
  groups: ReadonlyMap<import("ts-morph").Project, CapturedCallGroup>,
  directCalls: ReadonlySet<import("ts-morph").ts.CallExpression>,
): void {
  for (const group of groups.values()) {
    group.calls = group.calls.map((observation) => {
      if (directCalls.has(observation.call.compilerNode)) {
        return observation;
      }
      const refusal = unresolved("cycle", observation.call, { declarations: [] }, "supplied callable closure does not reach a stable native proof");
      return { ...observation, target: refusal, targets: refusal, returns: refusal, alternatives: refusal, invocationTargets: refusal };
    });
  }
}

function refineSuppliedCapture(
  groups: ReadonlyMap<import("ts-morph").Project, CapturedCallGroup>,
  context: Omit<SuppliedRefinement, "targetKey" | "enteredBodies">,
): CallReturnObservations {
  const nodeIds = new Map<object, number>();
  const identity = (node: MorphNode): number => {
    const previous = nodeIds.get(node.compilerNode);
    if (previous !== undefined) {
      return previous;
    }
    const id = nodeIds.size;
    nodeIds.set(node.compilerNode, id);
    return id;
  };
  const calls = [...groups.values()].flatMap((group) => group.calls);
  const inputs: SuppliedRefinement = {
    ...context,
    targetKey: (targets) => (targets?.kind === "resolved" ? targets.value.map(identity).join(",") : "?"),
    enteredBodies: new Set(calls.flatMap((call) => (call.targets.kind === "resolved" ? call.targets.value.map((target) => target.compilerNode) : []))),
  };
  const states = new Set<string>();
  for (;;) {
    const state =
      [...inputs.demandedOwners].map(identity).join(",") +
      ":" +
      [...groups.values()]
        .flatMap((group) => group.calls.map((call) => `${identity(call.call)}:${inputs.targetKey(call.targets)}:${inputs.targetKey(call.invocationTargets)}`))
        .join(";");
    if (states.has(state)) {
      refuseCyclicRefinement(groups, inputs.directCalls);
      return inputs.snapshot();
    }
    states.add(state);
    if (!refineSuppliedRound(groups, inputs)) {
      return inputs.snapshot();
    }
  }
}

function settledCallableUse(call: CallExpression, program: CallReturnProgram): ReferenceFact<true> {
  const targets = program.byCall.get(call.compilerNode)?.targets;
  return targets?.kind === "resolved"
    ? { ...targets, value: true }
    : (targets ?? unresolved("missing", call, { declarations: [] }, "the supplied callable use has no settled actual target"));
}

function captureCallableValue(node: MorphNode, captured: CallReturnProgram, group: CapturedCallGroup): ReferenceFact<CallableDeclaration> {
  const fact = resolveCallableValueDeclaration(node, { programs: [captured] });
  if (fact.kind === "unresolved") {
    return fact;
  }
  const sources = new Set([fact.value.sourceFile, ...fact.trace.declarations.map((declaration) => declaration.getSourceFile())]);
  if (
    node.getProject().getProgram().compilerObject !== captured.program ||
    [...sources].some((source) => source.getProject() !== node.getProject() || captured.program.getSourceFile(source.getFilePath()) !== source.compilerNode)
  ) {
    return unresolved("unsupported", node, { declarations: [] }, "the supplied callable value has a stale or foreign native declaration source");
  }
  for (const source of sources) {
    group.sources.set(source, source.compilerNode);
  }
  return fact;
}

function suppliedCallableUseReader(
  captured: () => CallReturnProgram,
  context: { readonly activeOwners: Set<import("ts-morph").ts.Node>; readonly demand: (owner: MorphNode) => void },
): (owner: MorphNode) => ReferenceFact<true> {
  const { activeOwners, demand } = context;
  return (owner: MorphNode): ReferenceFact<true> => {
    const program = captured();
    const epoch = capturedProgram(owner, { programs: [program] });
    if (epoch.kind === "unresolved") {
      return epoch;
    }
    if (activeOwners.has(owner.compilerNode)) {
      return unresolved("cycle", owner, { declarations: [] }, "the supplied callable owner revisits its containing uses");
    }
    activeOwners.add(owner.compilerNode);
    try {
      if (Node.isCallExpression(owner) && !program.byCall.has(owner.compilerNode)) {
        return unresolved("missing", owner, { declarations: [] }, "the supplied callable use was not captured in this native invocation");
      }
      demand(owner);
      if (Node.isCallExpression(owner)) {
        return settledCallableUse(owner, program);
      }
      const sources = readAuthoredCallableSources(owner, (call) => program.byCall.has(call.compilerNode), { programs: [program] });
      return sources.kind === "unresolved" ? sources : { ...sources, value: true };
    } finally {
      activeOwners.delete(owner.compilerNode);
    }
  };
}

/** Observe only supplied calls and their shared authored-call closure; never acquire another compiler world. */
export function observeCallReturns(
  roots: readonly CallExpression[],
  references?: readonly MorphNode[],
  projection: CallReturnCaptureOptions = {},
): CallReturnObservations {
  const groups = new Map<import("ts-morph").Project, CapturedCallGroup>();
  const observedReferences = [...(references ?? [])];
  const onBodyNode =
    references === undefined
      ? undefined
      : (node: MorphNode): void => {
          if (Node.isIdentifier(node) || Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node)) {
            observedReferences.push(node);
          }
        };
  const closure = readCallClosure(roots, onBodyNode);
  const admitted = new Set(closure.map((call) => call.compilerNode));
  const directCalls = new Set<import("ts-morph").ts.CallExpression>();
  const capture = (call: CallExpression): void => {
    const target = projection.suppliedCallableTargets === true ? authoredCallTarget(call) : readCallTarget(call);
    const returns = target.kind === "resolved" ? readFunctionReturnPaths(target.value) : target;
    const project = call.getProject();
    let group = groups.get(project);
    if (group === undefined) {
      group = { calls: [], sources: new Map() };
      groups.set(project, group);
    }
    const enumerate =
      projection.suppliedCallableTargets !== true || (target.kind === "unresolved" && target.reason === "dynamic" && !optionalReceiverInvocation(call));
    const targets = enumerate ? readCallTargets(call, admitted) : singleCallTargets(target);
    const alternatives = observeAlternatives(targets, projection);
    if (targets.kind === "resolved" && !optionalReceiverInvocation(call)) {
      directCalls.add(call.compilerNode);
    }
    group.calls.push({ call, target, targets, alternatives, returns });
    captureObservationSources(group, { call, target, targets, alternatives, returns });
  };
  for (const call of closure) {
    capture(call);
  }
  const demandedOwners = new Set<MorphNode>();
  const activeOwners = new Set<import("ts-morph").ts.Node>();
  const publishers: (() => void)[] = [];
  let refining = false;
  let settledDemandCount = 0;
  const demand = (owner: MorphNode): void => {
    demandedOwners.add(owner);
    if (refining || demandedOwners.size === settledDemandCount) {
      return;
    }
    refining = true;
    try {
      refineSuppliedCapture(groups, { admitted, directCalls, references: observedReferences, demandedOwners, projection, capture, snapshot, onBodyNode });
      for (const publish of publishers) {
        publish();
      }
      settledDemandCount = demandedOwners.size;
    } finally {
      refining = false;
    }
  };
  const snapshot = (published = false): CallReturnObservations => ({
    programs: [...groups].map(([project, group]) => {
      const nativeReferences = observedReferences.filter((node) => node.getProject() === project);
      for (const reference of nativeReferences) {
        const source = reference.getSourceFile();
        group.sources.set(source, source.compilerNode);
      }
      const settled = (): Pick<CallReturnProgram, "calls" | "callers" | "byCall" | "escapingReferences"> => {
        const byCall = new Map(group.calls.map((observation) => [observation.call.compilerNode, observation]));
        const currentReferences = observedReferences.filter((node) => node.getProject() === project);
        for (const reference of currentReferences) {
          const source = reference.getSourceFile();
          group.sources.set(source, source.compilerNode);
        }
        return { calls: group.calls, callers: capturedCallers(group.calls), byCall, escapingReferences: escapingReferences(currentReferences, byCall) };
      };
      let indexes = settled();
      if (published) {
        publishers.push(() => {
          indexes = settled();
        });
      }
      const captured: CallReturnProgram = {
        ...group,
        ...(projection.nativeValueTransfers === true
          ? {
              nativeValueTransfers: true as const,
              nativeStatementReachable: (node: MorphNode) => nativeStatementReachable(node, captured),
              nativeSymbolServices: { callableOrigin: resolveCallableValueOrigin, memberOrigin: resolveTypeMemberOrigin, declaredByPackage },
              nativeReturnPaths: (node: MorphNode, explicitAbsentReturns: boolean) =>
                readFunctionReturnPaths(node, {
                  nativeValueTransfers: true,
                  ...(projection.explicitAbsentReturns === true && explicitAbsentReturns ? { explicitAbsentReturns: true } : {}),
                }),
            }
          : {}),
        ...(projection.suppliedCallableTargets === true
          ? {
              suppliedCallableTargets: true as const,
              suppliedCallableUses: suppliedCallableUseReader(() => captured, { activeOwners, demand }),
              suppliedCallableValue: (node: MorphNode) => captureCallableValue(node, captured, group),
            }
          : {}),
        get calls(): CallReturnProgram["calls"] {
          return indexes.calls;
        },
        get callers(): CallReturnProgram["callers"] {
          return indexes.callers;
        },
        get byCall(): CallReturnProgram["byCall"] {
          return indexes.byCall;
        },
        get escapingReferences(): CallReturnProgram["escapingReferences"] {
          return indexes.escapingReferences;
        },
        referencesObserved: references?.some((node) => node.getProject() === project) === true,
        program: project.getProgram().compilerObject,
      };
      return captured;
    }),
  });
  return snapshot(projection.suppliedCallableTargets === true);
}

/** Exact native world and source epochs precede captured value interpretation. */
export function readCallReturnProgram(node: MorphNode, observations: CallReturnObservations): ReferenceFact<CallReturnProgram> {
  return capturedProgram(node, observations);
}

/** Complete observed callers retain the captured native graph. */
export function readObservedCallableConsumers(owner: MorphNode, program: CallReturnProgram): ReferenceFact<readonly CallReturnObservation[]> {
  return callableConsumers(owner, program);
}

/** Supplied origins are actual argument alternatives, never a formal annotation. */
export function readSuppliedParameter(
  node: MorphNode,
  bindings: ReadonlyMap<MorphNode, MorphNode>,
  program: CallReturnProgram | undefined,
): ReferenceFact<readonly import("./reference-fact-contract.ts").ReturnedValueSource[]> {
  return suppliedParameter(node, bindings, program);
}
