// The expressions the function a call targets returns, entered through a factory that is local, imported or a const-bound arrow.
// Every answer is a `ReferenceFact`: an unreadable factory is an `unresolved` fact with a reason, never an empty list.
import type { CallExpression, Node as MorphNode, ts } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { captureNativeReferenceReads } from "../compiler/ts-workspace.ts";
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
  CallReturnProofContext,
  ReferenceFact,
  ReferenceUnresolvedReason,
  ReturnedValueInputs,
  UnresolvedReferenceFact,
} from "./reference-fact-contract.ts";
import { readStaticAuthoredValue } from "./static-authored-value.ts";
import { declaredByPackage, resolveTypeMemberOrigin } from "./type-member-origin.ts";
import { readAuthoredCallableSources } from "./value-carrier.ts";
import { readZodParsedValue } from "./zod-origin.ts";

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
    .filter((statement) => statement.getFirstAncestor(Node.isFunctionLikeDeclaration) === fn)
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
    statement
      .getDescendants()
      .some((node) => (Node.isReturnStatement(node) || Node.isThrowStatement(node)) && node.getFirstAncestor(Node.isFunctionLikeDeclaration) === owner)
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
  const fn = node.getFirstAncestor(Node.isFunctionLikeDeclaration);
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

function optionalInvocationSite(call: CallExpression): boolean {
  const expression = unwrapTarget(call.getExpression());
  return (
    call.hasQuestionDotToken() ||
    ((Node.isPropertyAccessExpression(expression) || Node.isElementAccessExpression(expression)) && expression.hasQuestionDotToken())
  );
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
    targets.kind === "unresolved" && optionalInvocationSite(previous.call) ? readCallTargets(previous.call, admitted, observed, true) : undefined;
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
  return member === undefined || keys.has(member.name) || optionalInvocationSite(call);
}

type CapturedCallIndexes = Pick<CallReturnProgram, "calls" | "callers" | "byCall" | "escapingReferences">;

interface SettledCapture {
  readonly owner: CallReturnProgram;
  readonly indexes: CapturedCallIndexes;
  readonly callCount: number;
  readonly referenceRevision: number;
  readonly nodes: ReadonlyMap<MorphNode, import("ts-morph").ts.Node>;
}

interface CapturedCallGroup {
  calls: CallReturnObservation[];
  readonly sources: Map<import("ts-morph").SourceFile, import("ts-morph").ts.SourceFile>;
  settled?: SettledCapture;
  readonly refinement: CapturedRefinementIndexes;
}

// Forgetting a wrapper leaves its native Program alive, so index reuse also retains each input wrapper identity.
function settledNodes(indexes: CapturedCallIndexes, references: readonly MorphNode[]): ReadonlyMap<MorphNode, import("ts-morph").ts.Node> {
  const nodes = new Map<MorphNode, import("ts-morph").ts.Node>();
  const capture = (node: MorphNode): void => {
    nodes.set(node, node.compilerNode);
  };
  for (const observation of indexes.calls) {
    capture(observation.call);
    if (observation.target.kind === "resolved") {
      capture(observation.target.value);
    }
    const invocation = observation.invocationTargets ?? observation.targets;
    if (invocation.kind === "resolved") {
      invocation.value.forEach(capture);
    }
  }
  references.forEach(capture);
  for (const facts of indexes.escapingReferences.values()) {
    for (const fact of facts) {
      capture(fact.node);
      capture(fact.trace.origin);
      fact.trace.declarations.forEach(capture);
    }
  }
  return nodes;
}

function sameCaptureProjection(left: Readonly<Record<keyof CallReturnCaptureOptions, boolean>>, right: CallReturnCaptureOptions): boolean {
  return (
    (left.explicitAbsentReturns === true) === (right.explicitAbsentReturns === true) &&
    (left.nativeValueTransfers === true) === (right.nativeValueTransfers === true) &&
    (left.suppliedCallableTargets === true) === (right.suppliedCallableTargets === true)
  );
}

function sameCapturedNode(left: MorphNode, right: MorphNode): boolean {
  return !(left.wasForgotten() || right.wasForgotten()) && left.compilerNode === right.compilerNode;
}

function sameOrdered<T>(left: readonly T[], right: readonly T[], same: (left: T, right: T) => boolean): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => {
      const other = right[index];
      return other !== undefined && same(value, other);
    })
  );
}

function sameCapturedFact<T>(left: ReferenceFact<T>, right: ReferenceFact<T>, same: (left: T, right: T) => boolean): boolean {
  if (!(sameCapturedNode(left.trace.origin, right.trace.origin) && sameOrdered(left.trace.declarations, right.trace.declarations, sameCapturedNode))) {
    return false;
  }
  return left.kind === "unresolved"
    ? right.kind === "unresolved" && left.reason === right.reason && left.detail === right.detail && sameCapturedNode(left.node, right.node)
    : right.kind === "resolved" && same(left.value, right.value);
}

function sameCapturedNodes(left: readonly MorphNode[], right: readonly MorphNode[]): boolean {
  return sameOrdered(left, right, sameCapturedNode);
}

function sameOptionalFact<T>(left: ReferenceFact<T> | undefined, right: ReferenceFact<T> | undefined, same: (left: T, right: T) => boolean): boolean {
  return left === undefined || right === undefined ? left === right : sameCapturedFact(left, right, same);
}

function sameCapturedAlternative(
  left: import("./reference-fact-contract.ts").CallReturnAlternative,
  right: import("./reference-fact-contract.ts").CallReturnAlternative,
): boolean {
  return (
    sameCapturedNode(left.target, right.target) &&
    sameCapturedFact(left.returns, right.returns, sameCapturedNodes) &&
    sameOptionalFact(left.explicitReturns, right.explicitReturns, sameCapturedNodes) &&
    sameOptionalFact(left.nativeReturns, right.nativeReturns, sameCapturedNodes)
  );
}

function sameCapturedObservation(left: CallReturnObservation, right: CallReturnObservation): boolean {
  return (
    sameCapturedNode(left.call, right.call) &&
    sameCapturedFact(left.target, right.target, sameCapturedNode) &&
    sameCapturedFact(left.targets, right.targets, sameCapturedNodes) &&
    sameOptionalFact(left.invocationTargets, right.invocationTargets, sameCapturedNodes) &&
    sameCapturedFact(left.returns, right.returns, sameCapturedNodes) &&
    sameCapturedFact(left.alternatives, right.alternatives, (a, b) => sameOrdered(a, b, sameCapturedAlternative))
  );
}

function capturedFactNodes<T>(fact: ReferenceFact<T>, nodes: (value: T) => readonly MorphNode[]): readonly MorphNode[] {
  return [fact.trace.origin, ...fact.trace.declarations, ...(fact.kind === "resolved" ? nodes(fact.value) : [fact.node])];
}

function observationNodes(observation: CallReturnObservation): readonly MorphNode[] {
  const facts = [observation.targets, observation.returns, ...(observation.invocationTargets === undefined ? [] : [observation.invocationTargets])];
  return [
    observation.call,
    ...capturedFactNodes(observation.target, (value) => [value]),
    ...facts.flatMap((fact) => capturedFactNodes(fact, (value) => value)),
    ...capturedFactNodes(observation.alternatives, (values) =>
      values.flatMap((value) => [
        value.target,
        ...[
          value.returns,
          ...(value.explicitReturns === undefined ? [] : [value.explicitReturns]),
          ...(value.nativeReturns === undefined ? [] : [value.nativeReturns]),
        ].flatMap((fact) => capturedFactNodes(fact, (nodes) => nodes)),
      ]),
    ),
  ];
}

interface RefinementCell {
  readonly users: Set<ts.CallExpression>;
  readonly refresh: () => boolean;
}

interface RefinementReadSet {
  readonly cells: Set<RefinementCell>;
  readonly nodes: Map<MorphNode, ts.Node>;
  opaque: boolean;
}

interface RefinementEntry extends RefinementReadSet {
  readonly projection: Readonly<Record<keyof CallReturnCaptureOptions, boolean>>;
  readonly nativeProgram: ts.Program;
  readonly sources: CallReturnProgram["sources"];
  readonly context: CallReturnProofContext | undefined;
  readonly referencesObserved: boolean;
  readonly supplied: boolean;
  readonly nativeValues: boolean;
  readonly sourceCount: number;
  readonly validateNative: (() => boolean) | undefined;
}

class RefinementMap<K, V extends object> extends Map<K, V> {
  readonly #read: (key: K, value: V | undefined, presence: boolean) => void;
  readonly #opaque: () => void;
  constructor(values: Iterable<readonly [K, V]>, read: (key: K, value: V | undefined, presence: boolean) => void, opaque: () => void) {
    super(values);
    this.#read = read;
    this.#opaque = opaque;
  }
  override get(key: K): V | undefined {
    const value = super.get(key);
    this.#read(key, value, false);
    return value;
  }
  override has(key: K): boolean {
    const value = super.has(key);
    this.#read(key, super.get(key), true);
    return value;
  }
  override get size(): number {
    this.#opaque();
    return super.size;
  }
  override entries(): ReturnType<Map<K, V>["entries"]> {
    this.#opaque();
    return super.entries();
  }
  override keys(): ReturnType<Map<K, V>["keys"]> {
    this.#opaque();
    return super.keys();
  }
  override values(): ReturnType<Map<K, V>["values"]> {
    this.#opaque();
    return super.values();
  }
  override [Symbol.iterator](): ReturnType<Map<K, V>[typeof Symbol.iterator]> {
    this.#opaque();
    return super[Symbol.iterator]();
  }
  override forEach(...args: Parameters<Map<K, V>["forEach"]>): void {
    this.#opaque();
    super.forEach(...args);
  }
}

class RefinementIndex<K, V extends object> {
  readonly #ledger: RefinementLedger;
  readonly #same: (left: V, right: V) => boolean;
  readonly #nodes: (value: V) => readonly MorphNode[];
  readonly #reads = new Map<K, RefinementCell>();
  readonly #presence = new Map<K, RefinementCell>();
  #current: ReadonlyMap<K, V> = new Map();
  constructor(ledger: RefinementLedger, same: (left: V, right: V) => boolean, nodes: (value: V) => readonly MorphNode[]) {
    this.#ledger = ledger;
    this.#same = same;
    this.#nodes = nodes;
    ledger.releaseReaders.add(() => {
      this.#reads.clear();
      this.#presence.clear();
    });
  }
  map(values: Iterable<readonly [K, V]>): ReadonlyMap<K, V> {
    this.#ledger.opaque();
    const current: RefinementMap<K, V> = new RefinementMap(
      values,
      (key, value, presence) => this.#record(current, key, value, presence),
      () => this.#ledger.opaque(),
    );
    this.#current = current;
    return current;
  }
  #record(view: ReadonlyMap<K, V>, key: K, value: V | undefined, presence: boolean): void {
    const read = this.#ledger.active;
    if (read === undefined || read.opaque) {
      return;
    }
    if (view !== this.#current) {
      this.#ledger.opaque();
      return;
    }
    const cells = presence ? this.#presence : this.#reads;
    let cell = cells.get(key);
    if (cell === undefined) {
      let prior = value;
      cell = {
        users: new Set(),
        refresh: (): boolean => {
          const next = this.#current.get(key);
          const valuesEqual = prior === undefined || next === undefined ? prior === next : this.#same(prior, next);
          const equal = presence ? (prior === undefined) === (next === undefined) : valuesEqual;
          prior = next;
          return !equal;
        },
      };
      cells.set(key, cell);
      this.#ledger.cells.add(cell);
    }
    read.cells.add(cell);
    if (!presence && value !== undefined) {
      this.#ledger.remember(this.#nodes(value));
    }
  }
}

class RefinementMembership extends Set<ts.CallExpression> {
  readonly #ledger: RefinementLedger;
  readonly #reads = new Map<ts.CallExpression, RefinementCell>();
  constructor(values: Iterable<ts.CallExpression>, ledger: RefinementLedger) {
    super(values);
    this.#ledger = ledger;
    ledger.releaseReaders.add(() => this.#reads.clear());
  }
  override has(key: ts.CallExpression): boolean {
    const value = super.has(key);
    const read = this.#ledger.active;
    if (read !== undefined && !read.opaque) {
      let cell = this.#reads.get(key);
      if (cell === undefined) {
        let prior = value;
        cell = {
          users: new Set(),
          refresh: (): boolean => {
            const next = super.has(key);
            const changed = next !== prior;
            prior = next;
            return changed;
          },
        };
        this.#reads.set(key, cell);
        this.#ledger.cells.add(cell);
      }
      read.cells.add(cell);
    }
    return value;
  }
  override get size(): number {
    this.#ledger.opaque();
    return super.size;
  }
  get proofSize(): number {
    return super.size;
  }
  override entries(): ReturnType<Set<ts.CallExpression>["entries"]> {
    this.#ledger.opaque();
    return super.entries();
  }
  override keys(): ReturnType<Set<ts.CallExpression>["keys"]> {
    this.#ledger.opaque();
    return super.keys();
  }
  override values(): ReturnType<Set<ts.CallExpression>["values"]> {
    this.#ledger.opaque();
    return super.values();
  }
  override [Symbol.iterator](): ReturnType<Set<ts.CallExpression>[typeof Symbol.iterator]> {
    this.#ledger.opaque();
    return super[Symbol.iterator]();
  }
  override forEach(...args: Parameters<Set<ts.CallExpression>["forEach"]>): void {
    this.#ledger.opaque();
    super.forEach(...args);
  }
}

class RefinementLedger {
  readonly cells = new Set<RefinementCell>();
  readonly releaseReaders = new Set<() => void>();
  readonly release = (): void => {
    this.opaque();
    for (const cell of this.cells) {
      cell.users.clear();
    }
    this.cells.clear();
    this.#entries.clear();
    this.#dirty.clear();
    for (const release of this.releaseReaders) {
      release();
    }
  };
  readonly #entries = new Map<ts.CallExpression, RefinementEntry>();
  readonly #dirty = new Set<ts.CallExpression>();
  active: RefinementReadSet | undefined;
  opaque(): void {
    if (this.active !== undefined) {
      this.active.opaque = true;
      this.active.cells.clear();
      this.active.nodes.clear();
    }
  }
  remember(nodes: readonly MorphNode[]): void {
    const read = this.active;
    if (read === undefined || read.opaque) {
      return;
    }
    for (const node of nodes) {
      if (node.wasForgotten()) {
        this.opaque();
        return;
      }
      read.nodes.set(node, node.compilerNode);
    }
  }
  refresh(): void {
    for (const cell of this.cells) {
      if (cell.refresh()) {
        for (const user of cell.users) {
          this.#dirty.add(user);
        }
      }
    }
  }
  #remove(key: ts.CallExpression): void {
    const previous = this.#entries.get(key);
    for (const cell of previous?.cells ?? []) {
      cell.users.delete(key);
    }
    this.#entries.delete(key);
  }
  #current(previous: CallReturnObservation, observed: CallReturnObservations, entry: RefinementEntry): boolean {
    const admitted = capturedProgram(previous.call, observed);
    if (admitted.kind !== "resolved") {
      return false;
    }
    const program = admitted.value;
    if (
      program.program !== entry.nativeProgram ||
      program.sources !== entry.sources ||
      program.sources.size !== entry.sourceCount ||
      program.callableContext !== entry.context ||
      program.referencesObserved !== entry.referencesObserved ||
      (program.suppliedCallableTargets === true) !== entry.supplied ||
      (program.nativeValueTransfers === true) !== entry.nativeValues
    ) {
      return false;
    }
    for (const [node, native] of entry.nodes) {
      if (node.wasForgotten() || node.compilerNode !== native) {
        return false;
      }
    }
    return true;
  }
  reuse(previous: CallReturnObservation, observed: CallReturnObservations, projection: CallReturnCaptureOptions): boolean {
    const key = previous.call.compilerNode;
    const entry = this.#entries.get(key);
    if (entry === undefined || this.#dirty.has(key) || !sameCaptureProjection(entry.projection, projection) || !this.#current(previous, observed, entry)) {
      return false;
    }
    return (entry.validateNative?.() ?? true) && sameCaptureProjection(entry.projection, projection) && this.#current(previous, observed, entry);
  }
  evaluate(
    previous: CallReturnObservation,
    observed: CallReturnObservations,
    projection: CallReturnCaptureOptions,
    compute: () => CallReturnObservation,
  ): CallReturnObservation {
    if (this.active !== undefined) {
      this.opaque();
      return compute();
    }
    const key = previous.call.compilerNode;
    this.#remove(key);
    this.#dirty.delete(key);
    const read: RefinementReadSet = { cells: new Set(), nodes: new Map(), opaque: false };
    const native = captureNativeReferenceReads(this.release);
    const options = {
      suppliedCallableTargets: projection.suppliedCallableTargets === true,
      explicitAbsentReturns: projection.explicitAbsentReturns === true,
      nativeValueTransfers: projection.nativeValueTransfers === true,
    } satisfies Readonly<Record<keyof CallReturnCaptureOptions, boolean>>;
    this.active = read;
    try {
      const next = compute();
      this.remember(observationNodes(next));
      const captured = capturedProgram(previous.call, observed);
      const validation = native();
      if (
        !read.opaque &&
        captured.kind === "resolved" &&
        sameCaptureProjection(options, projection) &&
        (!validation.used || validation.validate !== undefined)
      ) {
        const program = captured.value;
        const entry: RefinementEntry = {
          ...read,
          projection: options,
          nativeProgram: program.program,
          sources: program.sources,
          context: program.callableContext,
          referencesObserved: program.referencesObserved,
          supplied: program.suppliedCallableTargets === true,
          nativeValues: program.nativeValueTransfers === true,
          sourceCount: program.sources.size,
          validateNative: validation.validate,
        };
        this.#entries.set(key, entry);
        for (const cell of entry.cells) {
          cell.users.add(key);
        }
      }
      return sameCapturedObservation(previous, next) ? previous : next;
    } finally {
      this.active = undefined;
    }
  }
}

interface CapturedRefinementIndexes {
  readonly calls: RefinementIndex<ts.CallExpression, CallReturnObservation>;
  readonly callers: RefinementIndex<ts.Node, readonly CallReturnObservation[]>;
  readonly escapes: RefinementIndex<ts.Node, readonly UnresolvedReferenceFact[]>;
}

function refinementIndexes(ledger: RefinementLedger): CapturedRefinementIndexes {
  return {
    calls: new RefinementIndex(ledger, sameCapturedObservation, observationNodes),
    callers: new RefinementIndex(
      ledger,
      (left, right) => sameOrdered(left, right, sameCapturedObservation),
      (rows) => rows.flatMap(observationNodes),
    ),
    escapes: new RefinementIndex(
      ledger,
      (left, right) => sameOrdered(left, right, (a, b) => sameCapturedFact(a, b, () => true)),
      (rows) => rows.flatMap((fact) => capturedFactNodes(fact, () => [])),
    ),
  };
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
  readonly beforeWrite: () => void;
  readonly admitted: Set<import("ts-morph").ts.CallExpression>;
  readonly directCalls: ReadonlySet<import("ts-morph").ts.CallExpression>;
  readonly references: readonly MorphNode[];
  readonly demandedOwners: Set<MorphNode>;
  readonly enteredBodies: Set<import("ts-morph").ts.Node>;
  readonly projection: CallReturnCaptureOptions;
  readonly capture: (call: CallExpression) => void;
  readonly snapshot: () => CallReturnObservations;
  readonly onBodyNode: ((node: MorphNode) => void) | undefined;
  readonly ledger: RefinementLedger;
  readonly flushValueCalls: () => boolean;
}

interface PendingValueCall {
  readonly call: CallExpression;
  readonly program: CallReturnProgram;
  refusal?: UnresolvedReferenceFact;
}

interface ReachedValueInputs {
  readonly calls: readonly CallExpression[];
  readonly references: readonly MorphNode[];
}

function deferredValueNode(node: MorphNode): boolean {
  const parent = node.getParent();
  return (
    Node.isFunctionDeclaration(node) ||
    Node.isFunctionExpression(node) ||
    Node.isArrowFunction(node) ||
    Node.isParameterDeclaration(node) ||
    Node.isTypeNode(node) ||
    Node.isTypeParameterDeclaration(node) ||
    (Node.isFunctionLikeDeclaration(parent) && (Node.isBodied(parent) || Node.isBodyable(parent)) && parent.getBody() === node)
  );
}

function reachedValueInputs(call: CallExpression): ReferenceFact<ReachedValueInputs> {
  const calls = [call];
  const references: MorphNode[] = [];
  let unclosedClass: MorphNode | undefined;
  call.forEachDescendant((node, traversal) => {
    if (Node.isClassDeclaration(node) || Node.isClassExpression(node)) {
      unclosedClass ??= node;
      traversal.skip();
    } else if (deferredValueNode(node)) {
      traversal.skip();
    } else {
      if (Node.isIdentifier(node) || Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node)) {
        references.push(node);
      }
      if (Node.isCallExpression(node)) {
        calls.push(node);
      }
    }
  });
  return unclosedClass === undefined
    ? { kind: "resolved", value: { calls, references }, trace: { declarations: [], origin: call } }
    : unresolved("unsupported", unclosedClass, { declarations: [] }, "reached value arguments contain unclosed class initialization");
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
  inputs.beforeWrite();
  const observed = inputs.snapshot();
  inputs.ledger.refresh();
  const demandedBefore = inputs.demandedOwners.size;
  const referencesBefore = inputs.references.length;
  const directBefore = inputs.directCalls.size;
  const sourcesBefore = [...groups.values()].map((group) => group.sources.size);
  const keys = callableHomeKeys(inputs.demandedOwners);
  const newCalls: CallExpression[] = [];
  let changed = false;
  for (const group of groups.values()) {
    const previousCalls = group.calls;
    group.calls = previousCalls.map((previous) => {
      if (inputs.directCalls.has(previous.call.compilerNode) || !incomingCallableCandidate(previous.call, keys)) {
        return previous;
      }
      const refined = inputs.ledger.reuse(previous, observed, inputs.projection)
        ? previous
        : inputs.ledger.evaluate(previous, observed, inputs.projection, () => refinedObservation(previous, inputs.admitted, observed, inputs.projection));
      newCalls.push(...enterObservationBodies(refined, group, inputs));
      return refined;
    });
    changed ||= group.calls.some((observation, index) => previousCalls[index] === undefined || !sameCapturedObservation(observation, previousCalls[index]));
  }
  for (const call of newCalls) {
    if (inputs.admitted.has(call.compilerNode)) {
      continue;
    }
    inputs.admitted.add(call.compilerNode);
    inputs.capture(call);
    changed = true;
  }
  changed = inputs.flushValueCalls() || changed;
  return (
    changed ||
    inputs.demandedOwners.size !== demandedBefore ||
    inputs.references.length !== referencesBefore ||
    inputs.directCalls.size !== directBefore ||
    [...groups.values()].some((group, index) => group.sources.size !== sourcesBefore[index])
  );
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
  context: Omit<SuppliedRefinement, "enteredBodies">,
): CallReturnObservations {
  const calls = [...groups.values()].flatMap((group) => group.calls);
  const inputs: SuppliedRefinement = {
    ...context,
    enteredBodies: new Set(calls.flatMap((call) => (call.targets.kind === "resolved" ? call.targets.value.map((target) => target.compilerNode) : []))),
  };
  const states: {
    readonly calls: readonly CallReturnObservation[];
    readonly owners: readonly MorphNode[];
    readonly references: number;
    readonly direct: readonly ts.CallExpression[];
  }[] = [];
  for (;;) {
    const state = {
      calls: [...groups.values()].flatMap((group) => group.calls),
      owners: [...inputs.demandedOwners],
      references: inputs.references.length,
      direct: [...inputs.directCalls],
    };
    if (
      states.some(
        (previous) =>
          sameOrdered(previous.calls, state.calls, sameCapturedObservation) &&
          sameOrdered(previous.owners, state.owners, sameCapturedNode) &&
          previous.references === state.references &&
          sameOrdered(previous.direct, state.direct, (left, right) => left === right),
      )
    ) {
      refuseCyclicRefinement(groups, inputs.directCalls);
      return inputs.snapshot();
    }
    states.push(state);
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

function captureCallableValue(
  node: MorphNode,
  captured: CallReturnProgram,
  group: CapturedCallGroup,
  readonlySources?: (sources: ReadonlySet<import("ts-morph").SourceFile>) => void,
): ReferenceFact<CallableDeclaration> {
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
  if (readonlySources !== undefined) {
    readonlySources(sources);
  } else {
    for (const source of sources) {
      group.sources.set(source, source.compilerNode);
    }
  }
  return fact;
}

function suppliedCallableUseReader(
  captured: () => CallReturnProgram,
  context: {
    readonly activeOwners: Set<import("ts-morph").ts.Node>;
    readonly demand: (owner: MorphNode) => void;
    readonly opaque: () => void;
    readonly readonlyUse: (owner: MorphNode) => ReferenceFact<true> | undefined;
  },
): (owner: MorphNode) => ReferenceFact<true> {
  const { activeOwners, demand } = context;
  return (owner: MorphNode): ReferenceFact<true> => {
    const program = captured();
    const epoch = capturedProgram(owner, { programs: [program] });
    if (epoch.kind === "unresolved") {
      return epoch;
    }
    const readonlyUse = context.readonlyUse(owner);
    if (readonlyUse !== undefined) {
      return readonlyUse;
    }
    context.opaque();
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
      const sources = readAuthoredCallableSources(owner, { captured: program }, { programs: [program] });
      return sources.kind === "unresolved" ? sources : { ...sources, value: true };
    } finally {
      activeOwners.delete(owner.compilerNode);
    }
  };
}

class InheritedCaptureDemand extends Error {
  readonly attempt: object;
  readonly node: MorphNode;
  readonly fulfill: (() => void) | undefined;
  constructor(attempt: object, node: MorphNode, fulfill: (() => void) | undefined) {
    super("inherited-effect proof requires ordinary capture before a read-only trial");
    this.attempt = attempt;
    this.node = node;
    this.fulfill = fulfill;
  }
}

/** Supplied calls and reached value dependencies share one authored-call capture, never another compiler world. */
export function observeCallReturns(
  roots: readonly CallExpression[],
  references?: readonly MorphNode[],
  projection: CallReturnCaptureOptions = {},
): CallReturnObservations {
  const nativeSymbols =
    projection.nativeValueTransfers === true || projection.suppliedCallableTargets === true
      ? { nativeSymbolServices: { callableOrigin: resolveCallableValueOrigin, memberOrigin: resolveTypeMemberOrigin, declaredByPackage } }
      : {};
  const ledger = new RefinementLedger();
  let inheritedAttempt: { readonly node: MorphNode } | undefined;
  const beforeWrite = (node?: MorphNode, fulfill?: () => void): void => {
    if (inheritedAttempt !== undefined) {
      throw new InheritedCaptureDemand(inheritedAttempt, node ?? inheritedAttempt.node, fulfill);
    }
  };
  const nativeReads = captureNativeReferenceReads(ledger.release);
  const groups = new Map<import("ts-morph").Project, CapturedCallGroup>();
  const observedReferences = [...(references ?? [])];
  const observedNodes = new Set(observedReferences.map((node) => node.compilerNode));
  const onBodyNode =
    references === undefined
      ? undefined
      : (node: MorphNode): void => {
          if (Node.isIdentifier(node) || Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node)) {
            observedReferences.push(node);
            observedNodes.add(node.compilerNode);
          }
        };
  const closure = readCallClosure(roots, onBodyNode);
  const admitted = new RefinementMembership(
    closure.map((call) => call.compilerNode),
    ledger,
  );
  const directCalls = new Set<import("ts-morph").ts.CallExpression>();
  const observeCall = (call: CallExpression, membership: ReadonlySet<ts.CallExpression>): CallReturnObservation => {
    const target = projection.suppliedCallableTargets === true ? authoredCallTarget(call) : readCallTarget(call);
    const returns = target.kind === "resolved" ? readFunctionReturnPaths(target.value) : target;
    const enumerate =
      projection.suppliedCallableTargets !== true || (target.kind === "unresolved" && target.reason === "dynamic" && !optionalInvocationSite(call));
    const targets = enumerate ? readCallTargets(call, membership) : singleCallTargets(target);
    const alternatives = observeAlternatives(targets, projection);
    return { call, target, targets, alternatives, returns };
  };
  const appendObservation = (observation: CallReturnObservation): void => {
    beforeWrite();
    const project = observation.call.getProject();
    let group = groups.get(project);
    if (group === undefined) {
      group = { calls: [], sources: new Map(), refinement: refinementIndexes(ledger) };
      groups.set(project, group);
    }
    if (observation.targets.kind === "resolved" && !optionalInvocationSite(observation.call)) {
      directCalls.add(observation.call.compilerNode);
    }
    group.calls.push(observation);
    captureObservationSources(group, observation);
  };
  const capture = (call: CallExpression): void => appendObservation(observeCall(call, admitted));
  for (const call of closure) {
    capture(call);
  }
  const demandedOwners = new Set<MorphNode>();
  const activeOwners = new Set<import("ts-morph").ts.Node>();
  const publishers: (() => void)[] = [];
  const publishCapture = (): void => {
    beforeWrite();
    for (const publish of publishers) {
      publish();
    }
  };
  let refining = false;
  let settledDemandCount = 0;
  const pendingValueCalls = new Map<ts.CallExpression, PendingValueCall>();
  const valueAdmission = (call: MorphNode, captured: CallReturnProgram): ReferenceFact<true> => {
    const current = capturedProgram(call, { programs: [captured] });
    if (current.kind === "unresolved") {
      return current;
    }
    const reads = nativeReads();
    if (reads.used && (reads.validate === undefined || !reads.validate())) {
      return unresolved("unsupported", call, { declarations: [] }, "reached value capture belongs to an invalid native reference invocation");
    }
    return { kind: "resolved", value: true, trace: { declarations: [], origin: call } };
  };
  const appendValueCapture = (
    observations: readonly CallReturnObservation[],
    discoveredReferences: readonly MorphNode[],
    replaced: Set<CapturedCallGroup>,
  ): void => {
    beforeWrite();
    for (const observation of observations) {
      const group = groups.get(observation.call.getProject());
      if (group !== undefined && !replaced.has(group)) {
        group.calls = [...group.calls];
        replaced.add(group);
      }
      admitted.add(observation.call.compilerNode);
      appendObservation(observation);
    }
    for (const reference of discoveredReferences) {
      if (!observedNodes.has(reference.compilerNode)) {
        onBodyNode?.(reference);
      }
    }
  };
  const captureValueRequest = (request: PendingValueCall, replaced: Set<CapturedCallGroup>): boolean => {
    beforeWrite();
    const current = valueAdmission(request.call, request.program);
    if (current.kind === "unresolved") {
      request.refusal = current;
      return false;
    }
    if (admitted.has(request.call.compilerNode)) {
      return false;
    }
    const input = reachedValueInputs(request.call);
    if (input.kind === "unresolved") {
      request.refusal = input;
      return false;
    }
    const discoveredReferences = [...input.value.references];
    const demandedClosure = readCallClosure(input.value.calls, (node) => {
      if (Node.isIdentifier(node) || Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node)) {
        discoveredReferences.push(node);
      }
    }).filter((call) => !admitted.has(call.compilerNode));
    const membership = new Set([...admitted, ...demandedClosure.map((call) => call.compilerNode)]);
    const observations = demandedClosure.map((call) => observeCall(call, membership));
    const after = valueAdmission(request.call, request.program);
    if (after.kind === "unresolved") {
      request.refusal = after;
      return false;
    }
    appendValueCapture(observations, discoveredReferences, replaced);
    return observations.length > 0;
  };
  const flushValueCalls = (): boolean => {
    beforeWrite();
    let changed = false;
    const replaced = new Set<CapturedCallGroup>();
    for (const [native, request] of pendingValueCalls) {
      pendingValueCalls.delete(native);
      changed = captureValueRequest(request, replaced) || changed;
    }
    return changed;
  };
  const callableContext: CallReturnProofContext = {
    untrackedRead: () => ledger.opaque(),
    admitted,
    activeOwners,
    get referenceRevision(): number {
      ledger.opaque();
      return observedReferences.length;
    },
    get demandRevision(): number {
      ledger.opaque();
      return demandedOwners.size;
    },
    get directRevision(): number {
      ledger.opaque();
      return directCalls.size;
    },
    get settledDemandRevision(): number {
      ledger.opaque();
      return settledDemandCount;
    },
    get refining(): boolean {
      ledger.opaque();
      return refining;
    },
  };
  const settleDemands = (): void => {
    beforeWrite();
    refining = true;
    try {
      refineSuppliedCapture(groups, {
        beforeWrite,
        admitted,
        directCalls,
        references: observedReferences,
        demandedOwners,
        projection,
        capture,
        snapshot,
        onBodyNode,
        ledger,
        flushValueCalls,
      });
      publishCapture();
      settledDemandCount = demandedOwners.size;
    } finally {
      refining = false;
    }
  };
  const demand = (owner: MorphNode): void => {
    beforeWrite();
    demandedOwners.add(owner);
    if (!refining && demandedOwners.size !== settledDemandCount) {
      settleDemands();
    }
  };
  const demandValueCall = (call: CallExpression, captured: CallReturnProgram): ReferenceFact<true> => {
    const current = valueAdmission(call, captured);
    if (current.kind === "unresolved") {
      return current;
    }
    if (captured.byCall.has(call.compilerNode)) {
      return current;
    }
    beforeWrite(call, () => demandValueCall(call, captured));
    const request: PendingValueCall = pendingValueCalls.get(call.compilerNode) ?? { call, program: captured };
    pendingValueCalls.set(call.compilerNode, request);
    if (refining) {
      return unresolved("missing", call, { declarations: [] }, "reached value call is queued until the current capture round publishes");
    }
    flushValueCalls();
    publishCapture();
    if (demandedOwners.size > 0 && projection.suppliedCallableTargets === true) {
      settleDemands();
    }
    if (request.refusal !== undefined) {
      return request.refusal;
    }
    return captured.byCall.has(call.compilerNode)
      ? current
      : unresolved("missing", call, { declarations: [] }, "reached value call is unavailable in the published capture");
  };
  const referenceSourceGroup = (reference: MorphNode, binding: MorphNode, captured: CallReturnProgram): ReferenceFact<CapturedCallGroup> => {
    const admission = valueAdmission(binding, captured);
    if (admission.kind === "unresolved") {
      return admission;
    }
    if (reference.wasForgotten()) {
      return unresolved("unsupported", reference, { declarations: [] }, "the reached native reference was forgotten");
    }
    const project = binding.getProject();
    const source = reference.getSourceFile();
    const group = groups.get(project);
    if (
      group === undefined ||
      captured.sources !== group.sources ||
      reference.getProject() !== project ||
      captured.program.getSourceFile(source.getFilePath()) !== source.compilerNode
    ) {
      return unresolved("unsupported", reference, { declarations: [] }, "the reached reference is not the captured native Project source");
    }
    return { kind: "resolved", value: group, trace: { declarations: [binding], origin: reference } };
  };
  const demandReferenceSource = (reference: MorphNode, binding: MorphNode, captured: CallReturnProgram): ReferenceFact<true> => {
    const admittedGroup = referenceSourceGroup(reference, binding, captured);
    if (admittedGroup.kind === "unresolved") {
      return admittedGroup;
    }
    const group = admittedGroup.value;
    const source = reference.getSourceFile();
    const changed = !(group.sources.has(source) && observedNodes.has(reference.compilerNode));
    if (changed) {
      beforeWrite(reference, () => demandReferenceSource(reference, binding, captured));
      group.sources.set(source, source.compilerNode);
      appendValueCapture([], [reference], new Set());
    }
    if (changed && !refining) {
      publishCapture();
      if (demandedOwners.size > 0 && projection.suppliedCallableTargets === true) {
        settleDemands();
      }
    }
    ledger.remember([reference, binding]);
    const current = valueAdmission(reference, captured);
    return current.kind === "unresolved" ? current : { kind: "resolved", value: true, trace: { declarations: [binding], origin: reference } };
  };
  const inheritedCaptureInputs = (captured: CallReturnProgram): readonly (object | number | boolean | undefined)[] => [
    captured.program,
    captured.sources,
    captured.byCall,
    captured.callers,
    captured.escapingReferences,
    captured.callableContext,
    captured.referencesObserved,
    captured.suppliedCallableTargets,
    captured.nativeValueTransfers,
    captured.nativeParsedValue,
    captured.nativeReturnPaths,
    projection.suppliedCallableTargets,
    projection.nativeValueTransfers,
    projection.explicitAbsentReturns,
    observedReferences.length,
    admitted.proofSize,
    demandedOwners.size,
    directCalls.size,
    settledDemandCount,
    refining,
    ledger.active,
    ...groups.values().flatMap((group) => [group.calls, ...group.calls, ...group.sources.keys(), ...group.sources.values()]),
  ];
  const runInheritedAttempt = (node: MorphNode, prove: () => ReferenceFact<true>): ReferenceFact<true> | InheritedCaptureDemand => {
    const attempt = { node };
    inheritedAttempt = attempt;
    try {
      return prove();
    } catch (error) {
      if (!(error instanceof InheritedCaptureDemand) || error.attempt !== attempt) {
        throw error;
      }
      return error;
    } finally {
      inheritedAttempt = undefined;
    }
  };
  const evaluateInheritedAttempt = (
    node: MorphNode,
    captured: CallReturnProgram,
    prove: () => ReferenceFact<true>,
  ): ReferenceFact<true> | { readonly kind: "retry" } => {
    const admission = valueAdmission(node, captured);
    if (admission.kind === "unresolved") {
      return admission;
    }
    const before = inheritedCaptureInputs(captured);
    const changed = (): boolean => {
      const after = inheritedCaptureInputs(captured);
      return before.length !== after.length || before.some((value, index) => value !== after[index]);
    };
    const result = runInheritedAttempt(node, prove);
    const current = valueAdmission(node, captured);
    if (current.kind === "unresolved") {
      return current;
    }
    if (changed()) {
      return unresolved("unsupported", node, { declarations: [] }, "capture inputs changed during an inherited-effect trial");
    }
    if (!(result instanceof InheritedCaptureDemand)) {
      return result;
    }
    // Discard the entire conditional attempt before the ordinary owner can demand or publish facts.
    result.fulfill?.();
    return changed() ? { kind: "retry" } : unresolved("missing", result.node, { declarations: [] }, result.message);
  };
  const readonlyInheritedProof = (node: MorphNode, captured: CallReturnProgram, prove: () => ReferenceFact<true>): ReferenceFact<true> => {
    if (inheritedAttempt !== undefined) {
      return unresolved("unsupported", node, { declarations: [] }, "an inherited-effect trial cannot admit a reentrant public proof");
    }
    ledger.opaque();
    for (;;) {
      const result = evaluateInheritedAttempt(node, captured, prove);
      if (result.kind !== "retry") {
        return result;
      }
    }
  };
  const valueServices = (
    captured: () => CallReturnProgram,
  ): Pick<
    CallReturnProgram,
    "demandValueCall" | "demandReferenceSource" | "nativeParsedValue" | "nativeValueTransfers" | "nativeStatementReachable" | "nativeReturnPaths"
  > => ({
    ...(references === undefined
      ? {}
      : {
          demandValueCall: (call: CallExpression) => demandValueCall(call, captured()),
          demandReferenceSource: (reference: MorphNode, binding: MorphNode) => demandReferenceSource(reference, binding, captured()),
        }),
    nativeParsedValue: (call, path, context, services) => readZodParsedValue(call, path, context, { ...services, returnPaths: readFunctionReturnPaths }),
    ...(projection.nativeValueTransfers === true
      ? {
          nativeValueTransfers: true as const,
          nativeStatementReachable: (node: MorphNode) => nativeStatementReachable(node, captured()),
          nativeReturnPaths: (node: MorphNode, explicitAbsentReturns: boolean) =>
            readFunctionReturnPaths(node, {
              nativeValueTransfers: true,
              ...(projection.explicitAbsentReturns === true && explicitAbsentReturns ? { explicitAbsentReturns: true } : {}),
            }),
        }
      : {}),
  });
  const snapshot = (published = false): CallReturnObservations => ({
    programs: [...groups].map(([project, group]) => {
      beforeWrite();
      const nativeReferences = observedReferences.filter((node) => node.getProject() === project);
      for (const reference of nativeReferences) {
        const source = reference.getSourceFile();
        group.sources.set(source, source.compilerNode);
      }
      let nodes: SettledCapture["nodes"] = new Map();
      const settled = (): CapturedCallIndexes => {
        const previous = group.settled;
        const first = group.calls[0]?.call;
        if (
          previous !== undefined &&
          previous.indexes.calls === group.calls &&
          previous.callCount === group.calls.length &&
          previous.referenceRevision === observedReferences.length &&
          first !== undefined &&
          capturedProgram(first, { programs: [previous.owner] }).kind === "resolved" &&
          [...previous.nodes].every(([node, native]) => !node.wasForgotten() && node.compilerNode === native)
        ) {
          nodes = previous.nodes;
          return previous.indexes;
        }
        const byCall = group.refinement.calls.map(group.calls.map((observation) => [observation.call.compilerNode, observation] as const));
        const currentReferences = observedReferences.filter((node) => node.getProject() === project);
        for (const reference of currentReferences) {
          const source = reference.getSourceFile();
          group.sources.set(source, source.compilerNode);
        }
        const indexes = {
          calls: group.calls,
          callers: group.refinement.callers.map(capturedCallers(group.calls)),
          byCall,
          escapingReferences: group.refinement.escapes.map(escapingReferences(currentReferences, byCall)),
        };
        if (projection.suppliedCallableTargets === true) {
          nodes = settledNodes(indexes, currentReferences);
        }
        return indexes;
      };
      let indexes = settled();
      if (published) {
        publishers.push(() => {
          indexes = settled();
        });
      }
      const captured: CallReturnProgram = {
        ...valueServices(() => captured),
        inheritedReadTrialActive: () => inheritedAttempt !== undefined,
        withInheritedReadTrial: (node, owner, prove) =>
          owner === captured
            ? readonlyInheritedProof(node, captured, prove)
            : unresolved("unsupported", node, { declarations: [] }, "an inherited-effect trial belongs to another capture owner"),
        sources: group.sources,
        ...nativeSymbols,
        ...(projection.suppliedCallableTargets === true
          ? {
              suppliedCallableTargets: true as const,
              callableContext,
              callableProofEpoch: () => ({
                ...indexes,
                callCount: indexes.calls.length,
                sourceCount: group.sources.size,
                admittedCount: admitted.proofSize,
                referenceRevision: observedReferences.length,
                demandRevision: demandedOwners.size,
                directRevision: directCalls.size,
                settledDemandRevision: settledDemandCount,
                refining,
                dependencyOwner: ledger.active,
              }),
              suppliedCallableUses: suppliedCallableUseReader(() => captured, {
                activeOwners,
                demand,
                opaque: () => ledger.opaque(),
                readonlyUse: (owner) => {
                  if (inheritedAttempt === undefined) {
                    return;
                  }
                  if (Node.isCallExpression(owner) && demandedOwners.has(owner)) {
                    return settledCallableUse(owner, captured);
                  }
                  throw new InheritedCaptureDemand(inheritedAttempt, owner, () => demand(owner));
                },
              }),
              suppliedCallableValue: (node: MorphNode) =>
                captureCallableValue(
                  node,
                  captured,
                  group,
                  inheritedAttempt === undefined
                    ? undefined
                    : (sources) => {
                        if ([...sources].some((source) => group.sources.get(source) !== source.compilerNode) && inheritedAttempt !== undefined) {
                          throw new InheritedCaptureDemand(inheritedAttempt, node, () => captureCallableValue(node, captured, group));
                        }
                      },
                ),
            }
          : {}),
        get calls(): CallReturnProgram["calls"] {
          ledger.opaque();
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
      if (projection.suppliedCallableTargets === true) {
        group.settled = { owner: captured, indexes, callCount: group.calls.length, referenceRevision: observedReferences.length, nodes };
      }
      return captured;
    }),
  });
  return snapshot(true);
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
): ReferenceFact<readonly import("./reference-fact-contract.ts").SuppliedValueSource[]> {
  return suppliedParameter(node, bindings, program);
}
