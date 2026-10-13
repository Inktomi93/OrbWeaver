// The expressions the function a call targets returns, entered through a factory that is local, imported or a const-bound arrow.
// Every answer is a `ReferenceFact`: an unreadable factory is an `unresolved` fact with a reason, never an empty list.
import type { CallExpression, Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { lexicalReferenceSymbol, unwrapTarget } from "./reference-fact-alias.ts";
import { resolveCallableOrigin } from "./reference-fact-call.ts";
import type { ReferenceFact, ReferenceUnresolvedReason, UnresolvedReferenceFact } from "./reference-fact-contract.ts";

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

/** The supplied arguments of one actual callable body, preserving declaration identity rather than parameter names. */
export function readCallBindings(call: CallExpression, owner: MorphNode, previous: ReadonlyMap<MorphNode, MorphNode>): ReadonlyMap<MorphNode, MorphNode> {
  const bindings = new Map(previous);
  if (Node.isFunctionDeclaration(owner) || Node.isArrowFunction(owner) || Node.isFunctionExpression(owner) || Node.isMethodDeclaration(owner)) {
    for (const [index, parameter] of owner.getParameters().entries()) {
      const argument = call.getArguments()[index];
      if (argument !== undefined) {
        bindings.set(parameter, argument);
      }
    }
  }
  return bindings;
}

/** Native call/body candidates reachable from the supplied roots, without a second Project or source population. */
export function readCallClosure(roots: readonly CallExpression[]): readonly CallExpression[] {
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
    const target = readCallTarget(call);
    if (target.kind === "resolved" && !seenBodies.has(target.value.compilerNode)) {
      seenBodies.add(target.value.compilerNode);
      pending.push(...target.value.getDescendantsOfKind(SyntaxKind.CallExpression));
    }
  }
  return calls;
}
