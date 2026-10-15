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
import { isDocumentationLinkReference, resolveStableExpression } from "./reference-fact.ts";
import { lexicalReferenceSymbol, unwrapTarget } from "./reference-fact-alias.ts";
import { resolveCallableAlternatives, resolveCallableDeclaration, resolveCallableOrigin, resolveCallableValueOrigin } from "./reference-fact-call.ts";
import type {
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

/** The same authored invocation can select several closed literal callable bodies. */
export function readCallTargets(call: CallExpression, admitted?: ReadonlySet<import("ts-morph").ts.CallExpression>): ReferenceFact<readonly MorphNode[]> {
  const direct = readCallTarget(call);
  if (direct.kind === "resolved") {
    return { ...direct, value: [direct.value] };
  }
  const alternatives = resolveCallableAlternatives(call, admitted);
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

/** Observe only supplied calls and their shared authored-call closure; never acquire another compiler world. */
export function observeCallReturns(
  roots: readonly CallExpression[],
  references?: readonly MorphNode[],
  projection: Pick<ReturnedValueInputs, "explicitAbsentReturns" | "nativeValueTransfers"> = {},
): CallReturnObservations {
  const groups = new Map<
    import("ts-morph").Project,
    { calls: CallReturnObservation[]; sources: Map<import("ts-morph").SourceFile, import("ts-morph").ts.SourceFile> }
  >();
  const observedReferences = [...(references ?? [])];
  const closure = readCallClosure(
    roots,
    references === undefined
      ? undefined
      : (node): void => {
          if (Node.isIdentifier(node) || Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node)) {
            observedReferences.push(node);
          }
        },
  );
  const admitted = new Set(closure.map((call) => call.compilerNode));
  for (const call of closure) {
    const target = readCallTarget(call);
    const returns = target.kind === "resolved" ? readFunctionReturnPaths(target.value) : target;
    const project = call.getProject();
    let group = groups.get(project);
    if (group === undefined) {
      group = { calls: [], sources: new Map() };
      groups.set(project, group);
    }
    const targets = readCallTargets(call, admitted);
    const alternatives = observeAlternatives(targets, projection);
    group.calls.push({ call, target, targets, alternatives, returns });
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
  return {
    programs: [...groups].map(([project, group]) => {
      const nativeReferences = observedReferences.filter((node) => node.getProject() === project);
      for (const reference of nativeReferences) {
        const source = reference.getSourceFile();
        group.sources.set(source, source.compilerNode);
      }
      const byCall = new Map(group.calls.map((observation) => [observation.call.compilerNode, observation]));
      const escapes = escapingReferences(nativeReferences, byCall);
      const callers = new Map<import("ts-morph").ts.Node, CallReturnObservation[]>();
      for (const observation of group.calls) {
        for (const callable of observation.targets.kind === "resolved" ? observation.targets.value : []) {
          const target = callable.compilerNode;
          const previous = callers.get(target) ?? [];
          previous.push(observation);
          callers.set(target, previous);
        }
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
        callers,
        byCall,
        escapingReferences: escapes,
        referencesObserved: references?.some((node) => node.getProject() === project) === true,
        program: project.getProgram().compilerObject,
      };
      return captured;
    }),
  };
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
