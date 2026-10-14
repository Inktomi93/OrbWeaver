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
import { resolveStableExpression } from "./reference-fact.ts";
import { lexicalReferenceSymbol, unwrapTarget } from "./reference-fact-alias.ts";
import { resolveCallableAlternatives, resolveCallableDeclaration, resolveCallableOrigin } from "./reference-fact-call.ts";
import type {
  CallReturnObservation,
  CallReturnObservations,
  CallReturnProgram,
  ReferenceFact,
  ReferenceUnresolvedReason,
  UnresolvedReferenceFact,
} from "./reference-fact-contract.ts";

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
function returnedExpressions(fn: MorphNode): readonly MorphNode[] {
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
    .map((statement) => statement.getExpression())
    .filter((expression) => expression !== undefined);
}

/** Return expressions only when every syntactically visible exit supplies one; an implicit return is unresolved. */
export function readFunctionReturnPaths(fn: MorphNode): ReferenceFact<readonly MorphNode[]> {
  const trace: Trace = { declarations: [fn] };
  const body =
    Node.isFunctionDeclaration(fn) || Node.isArrowFunction(fn) || Node.isFunctionExpression(fn) || Node.isMethodDeclaration(fn) ? fn.getBody() : undefined;
  if (body === undefined) {
    return unresolved("missing", fn, trace, "the callable has no authored body");
  }
  if (Node.isBlock(body)) {
    const last = body.getStatements().at(-1);
    const ownReturns = body.getDescendantsOfKind(SyntaxKind.ReturnStatement).filter((statement) => statement.getFirstAncestor(isFunctionish) === fn);
    if (!(Node.isReturnStatement(last) || Node.isThrowStatement(last)) || ownReturns.some((statement) => statement.getExpression() === undefined)) {
      return unresolved("unsupported", fn, trace, "the callable has an implicit or expressionless return path");
    }
  }
  const values = returnedExpressions(fn);
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
    if (seen.has(node.compilerNode) || !referenceCandidate(node)) {
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
): ReferenceFact<readonly import("./reference-fact-contract.ts").CallReturnAlternative[]> {
  return targets.kind === "unresolved" ? targets : { ...targets, value: targets.value.map((target) => ({ target, returns: readFunctionReturnPaths(target) })) };
}

/** Observe only supplied calls and their shared authored-call closure; never acquire another compiler world. */
export function observeCallReturns(roots: readonly CallExpression[], references?: readonly MorphNode[]): CallReturnObservations {
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
    const alternatives = observeAlternatives(targets);
    group.calls.push({ call, target, targets, alternatives, returns });
    const paths =
      alternatives.kind === "resolved"
        ? alternatives.value.flatMap((alternative) => (alternative.returns.kind === "resolved" ? alternative.returns.value : []))
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
      return {
        ...group,
        callers,
        byCall,
        escapingReferences: escapes,
        referencesObserved: references?.some((node) => node.getProject() === project) === true,
        program: project.getProgram().compilerObject,
      };
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
