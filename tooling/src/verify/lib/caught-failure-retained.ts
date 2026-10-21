// Same-function returns, held-local rethrows and returned async disposal retain their failures for the caller.
// Lifetime continuation reads are lexical syntax, never extra native declaration hops (D328).
import type { Block, Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { CaughtFailureReadServices } from "../contract/caught-failure.ts";
import { unwrapExpression } from "./ast-read.ts";
import {
  ambientIdentifier,
  directlyCarriesBinding,
  FUNCTION_KINDS,
  literalMember,
  sourceDeclaresName,
  sourceNameImports,
  uniqueLexicalBinding,
} from "./caught-failure-core.ts";
import { carriesFailure } from "./caught-failure-outcome.ts";
import { rawFailureDeclarations } from "./caught-failure-read.ts";

/** Chain links that settle with their receiver's rejection when they carry no rejection handler. */
const REJECTION_PRESERVING_LINKS: ReadonlyMap<string, number> = new Map([
  ["finally", Number.POSITIVE_INFINITY],
  ["then", 1],
]);
const DEFERRED_FACTORY = "withResolvers";
const DEFERRED_REJECT = "reject";
const DEFERRED_PROMISE = "promise";

function enclosingFunction(node: Node): Node | undefined {
  return node.getFirstAncestor((ancestor) => FUNCTION_KINDS.has(ancestor.getKind()));
}

/** A same-function `const` binding, or one member read off it (`operation.promise`): the receivers whose
 *  identity a later `return` can repeat by text alone. */
interface RetainedReceiver {
  readonly text: string;
  readonly declaration: Node;
  readonly body: Block;
}

/** The index of the body statement that holds `node`, or -1. */
function statementIndex(body: Block, node: Node): number {
  return body.getStatements().findIndex((statement) => statement.getStart() <= node.getStart() && statement.getEnd() >= node.getEnd());
}

const LEAVING_KINDS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.ReturnStatement,
  SyntaxKind.ThrowStatement,
  SyntaxKind.BreakStatement,
  SyntaxKind.ContinueStatement,
]);

function insideNestedFunction(node: Node, boundary: Node): boolean {
  if (node === boundary) {
    return false;
  }
  let current = node.getParent();
  while (current !== undefined && current !== boundary) {
    if (FUNCTION_KINDS.has(current.getKind())) {
      return true;
    }
    current = current.getParent();
  }
  return false;
}

function leavesBefore(statement: Node): boolean {
  return [statement, ...statement.getDescendants()].some((node) => LEAVING_KINDS.has(node.getKind()) && !insideNestedFunction(node, statement));
}

function returnsRejectionOf(value: Node, text: string, reads?: CaughtFailureReadServices): boolean {
  const unwrapped = unwrapExpression(value);
  if (unwrapped.getText() === text) {
    return true;
  }
  if (!unwrapped.isKind(SyntaxKind.CallExpression)) {
    return false;
  }
  const member = literalMember(unwrapped.getExpression(), reads);
  const arity = member === undefined ? undefined : REJECTION_PRESERVING_LINKS.get(member.name);
  return member !== undefined && arity !== undefined && unwrapped.getArguments().length <= arity && returnsRejectionOf(member.receiver, text, reads);
}

function writesMember(body: Block, text: string): boolean {
  return body.getDescendantsOfKind(SyntaxKind.BinaryExpression).some((write) => {
    const operator = write.getOperatorToken().getKind();
    return operator >= SyntaxKind.FirstAssignment && operator <= SyntaxKind.LastAssignment && unwrapExpression(write.getLeft()).getText() === text;
  });
}

/** The binding behind `receiver` when it is a top-level `const` of the function that holds `site`. */
function retainedReceiver(receiver: Node, site: Node, reads?: CaughtFailureReadServices): RetainedReceiver | undefined {
  const value = unwrapExpression(receiver);
  const root = value.isKind(SyntaxKind.PropertyAccessExpression) ? unwrapExpression(value.getExpression()) : value;
  if (!root.isKind(SyntaxKind.Identifier) || (value !== root && !value.isKind(SyntaxKind.PropertyAccessExpression))) {
    return;
  }
  const fn = site.getFirstAncestor((ancestor) => FUNCTION_KINDS.has(ancestor.getKind()));
  const body = fn?.getChildrenOfKind(SyntaxKind.Block)[0];
  const [declaration, ...others] = rawFailureDeclarations(root, reads);
  const statement = declaration?.getFirstAncestorByKind(SyntaxKind.VariableStatement);
  if (body === undefined || declaration === undefined || others.length > 0 || statement?.getParent() !== body || statement.getDeclarationKind() !== "const") {
    return;
  }
  return value === root || !writesMember(body, value.getText()) ? { text: value.getText(), declaration, body } : undefined;
}

/** Does the function return `retained` (or a handler-free link off it) as its LAST statement, with nothing from
 *  `site`'s own statement up to that return able to leave first? */
function returnedAfter(retained: RetainedReceiver, site: Node, reads?: CaughtFailureReadServices): boolean {
  const statements = retained.body.getStatements();
  const returned = statements.at(-1)?.asKind(SyntaxKind.ReturnStatement)?.getExpression();
  const at = statementIndex(retained.body, site);
  const declared = statementIndex(retained.body, retained.declaration);
  if (returned === undefined || at < 0 || at >= statements.length - 1 || declared < 0 || declared >= at) {
    return false;
  }
  return !statements.slice(at, -1).some(leavesBefore) && returnsRejectionOf(returned, retained.text, reads);
}

/** `p.catch(noop)` beside `return p` (or `return p.finally(…)`): the rejection still reaches the caller, so the
 *  discarding handler forks bookkeeping and absorbs nothing. */
export function rejectionRetainedByReturn(call: Node, receiver: Node, reads?: CaughtFailureReadServices): boolean {
  const retained = retainedReceiver(receiver, call, reads);
  return retained !== undefined && returnedAfter(retained, call, reads);
}

/** `.then(d.resolve, d.reject)` where `d` is a native `Promise.withResolvers()` deferred whose `d.promise` the
 *  function returns: the rejection is forwarded into a promise the caller holds. */
export function rejectionForwardedToReturnedDeferred(handler: Node, reads?: CaughtFailureReadServices): boolean {
  const member = literalMember(handler, reads);
  if (member?.name !== DEFERRED_REJECT || !member.receiver.isKind(SyntaxKind.Identifier)) {
    return false;
  }
  const declaration = rawFailureDeclarations(member.receiver, reads)[0];
  const initializer = declaration?.asKind(SyntaxKind.VariableDeclaration)?.getInitializerIfKind(SyntaxKind.CallExpression);
  const factory = initializer === undefined ? undefined : literalMember(initializer.getExpression(), reads);
  if (factory?.name !== DEFERRED_FACTORY || !factory.receiver.isKind(SyntaxKind.Identifier) || factory.receiver.getText() !== "Promise") {
    return false;
  }
  const shadowed = rawFailureDeclarations(factory.receiver, reads).some(
    (candidate) => candidate.getSourceFile() === handler.getSourceFile() && !candidate.getSourceFile().isDeclarationFile(),
  );
  if (shadowed) {
    return false;
  }
  const promise = `${member.receiver.getText()}.${DEFERRED_PROMISE}`;
  const retained = retainedReceiver(member.receiver, handler, reads);
  return retained !== undefined && !writesMember(retained.body, promise) && returnedAfter({ ...retained, text: promise }, handler, reads);
}

/** The executed body of the factory's returned async disposer, including its returned, once-cached IIFE. */
export function returnedDisposalBody(scope: Node): Block | undefined {
  const body = scope.getChildrenOfKind(SyntaxKind.Block)[0];
  const object = body?.getStatements().at(-1)?.asKind(SyntaxKind.ReturnStatement)?.getExpression()?.asKind(SyntaxKind.ObjectLiteralExpression);
  const method = object
    ?.getProperties()
    .map((candidate) => candidate.asKind(SyntaxKind.MethodDeclaration))
    .find((candidate) => candidate?.getNameNode().getText() === "[Symbol.asyncDispose]");
  const shadowed = sourceDeclaresName(scope.getSourceFile(), "Symbol") || sourceNameImports(scope.getSourceFile(), "Symbol").length > 0;
  if (method === undefined || object?.getProperties().at(-1) !== method || method.isGenerator() || method.getParameters().length > 0 || shadowed) {
    return;
  }
  const disposal = method.getBody()?.asKind(SyntaxKind.Block);
  if (method.isAsync()) {
    return disposal;
  }
  const statements = disposal?.getStatements();
  const assignment = statements?.[0]?.asKind(SyntaxKind.ExpressionStatement)?.getExpression().asKind(SyntaxKind.BinaryExpression);
  const returned = statements?.[1]?.asKind(SyntaxKind.ReturnStatement)?.getExpression();
  const left = assignment?.getLeft().asKind(SyntaxKind.Identifier);
  if (
    statements?.length !== 2 ||
    assignment?.getOperatorToken().getKind() !== SyntaxKind.QuestionQuestionEqualsToken ||
    left === undefined ||
    returned?.getText() !== left.getText()
  ) {
    return;
  }
  const declaration = uniqueLexicalBinding(scope, left.getText())?.asKind(SyntaxKind.VariableDeclaration);
  const writes = scope
    .getDescendantsOfKind(SyntaxKind.BinaryExpression)
    .filter(
      (node) =>
        unwrapExpression(node.getLeft()).getText() === left.getText() &&
        node.getOperatorToken().getKind() >= SyntaxKind.FirstAssignment &&
        node.getOperatorToken().getKind() <= SyntaxKind.LastAssignment,
    );
  if (
    declaration === undefined ||
    declaration.getVariableStatement()?.getParent() !== body ||
    declaration.getInitializer() !== undefined ||
    writes.length !== 1 ||
    writes[0] !== assignment
  ) {
    return;
  }
  const call = unwrapExpression(assignment.getRight()).asKind(SyntaxKind.CallExpression);
  const invoked = call === undefined ? undefined : unwrapExpression(call.getExpression()).asKind(SyntaxKind.ArrowFunction);
  return call?.getArguments().length === 0 && invoked?.isAsync() === true ? invoked.getBody().asKind(SyntaxKind.Block) : undefined;
}

function guardRethrowsHeld(statement: Node, name: string): boolean {
  const guarded = guardedThrow(statement);
  const condition = guarded?.guard.asKind(SyntaxKind.BinaryExpression);
  return (
    condition?.getLeft().getText() === name &&
    condition.getOperatorToken().getText() === "!==" &&
    condition.getRight().getText() === "undefined" &&
    guarded?.thrown.getText() === name
  );
}

/** `undefined` is the empty slot, so a retained value must be an object on every successful branch. */
function heldFailurePresent(node: Node, errorBinding: Node, reads?: CaughtFailureReadServices): boolean {
  const value = unwrapExpression(node);
  if (value.isKind(SyntaxKind.NewExpression)) {
    return true;
  }
  if (!value.isKind(SyntaxKind.ConditionalExpression)) {
    return false;
  }
  const truthy = value.getWhenTrue();
  const falsy = value.getWhenFalse();
  if (heldFailurePresent(truthy, errorBinding, reads) && heldFailurePresent(falsy, errorBinding, reads)) {
    return true;
  }
  const guard = unwrapExpression(value.getCondition()).asKind(SyntaxKind.BinaryExpression);
  return (
    guard?.getOperatorToken().getKind() === SyntaxKind.InstanceOfKeyword &&
    directlyCarriesBinding(guard.getLeft(), errorBinding, reads) &&
    ambientIdentifier(guard.getRight(), "Error", new Set(), reads) &&
    directlyCarriesBinding(truthy, errorBinding, reads) &&
    heldFailurePresent(falsy, errorBinding, reads)
  );
}

/** A caught failure held until its later nonempty guard rethrows it; resets and earlier exits refuse. */
export function heldFailureRethrown(expression: Node, errorBinding: Node, reads?: CaughtFailureReadServices): boolean {
  const assignment = expression.asKind(SyntaxKind.BinaryExpression);
  const left = assignment === undefined ? undefined : unwrapExpression(assignment.getLeft());
  if (
    assignment?.getOperatorToken().getKind() !== SyntaxKind.EqualsToken ||
    left?.isKind(SyntaxKind.Identifier) !== true ||
    !carriesFailure(assignment.getRight(), errorBinding, reads) ||
    !heldFailurePresent(assignment.getRight(), errorBinding, reads)
  ) {
    return false;
  }
  const declaration = rawFailureDeclarations(left, reads)[0]?.asKind(SyntaxKind.VariableDeclaration);
  const scope = declaration === undefined ? undefined : enclosingFunction(declaration);
  const body = scope?.getChildrenOfKind(SyntaxKind.Block)[0];
  if (
    declaration === undefined ||
    scope === undefined ||
    body === undefined ||
    declaration.getVariableStatement()?.getParent() !== body ||
    enclosingFunction(assignment) !== scope
  ) {
    return false;
  }
  const name = left.getText();
  const statements = body.getStatements();
  const at = statementIndex(body, assignment);
  const guardedAt = statements.findIndex((statement, index) => index > at && guardRethrowsHeld(statement, name));
  if (at < 0 || guardedAt < 0) {
    return false;
  }
  const writes = body
    .getDescendantsOfKind(SyntaxKind.BinaryExpression)
    .filter(
      (node) =>
        unwrapExpression(node.getLeft()).getText() === name &&
        node.getOperatorToken().getKind() >= SyntaxKind.FirstAssignment &&
        node.getOperatorToken().getKind() <= SyntaxKind.LastAssignment,
    );
  const shadowed = uniqueLexicalBinding(scope, name) !== declaration;
  const resetByUnary = body
    .getDescendants()
    .some((node) => (node.isKind(SyntaxKind.PrefixUnaryExpression) || node.isKind(SyntaxKind.PostfixUnaryExpression)) && node.getOperand().getText() === name);
  return (
    !(shadowed || resetByUnary) &&
    writes.length === 1 &&
    writes[0] === assignment &&
    !statements
      .slice(at, guardedAt)
      .some((statement) =>
        [statement, ...statement.getDescendants()].some((node) => LEAVING_KINDS.has(node.getKind()) && !insideNestedFunction(node, statement)),
      )
  );
}

/** The thrown expression of a branch that is exactly one `throw`. */
function onlyThrow(branch: Node | undefined): Node | undefined {
  if (branch === undefined) {
    return;
  }
  const statements = branch.isKind(SyntaxKind.Block) ? branch.getStatements() : [branch];
  return statements.length === 1 ? statements[0]?.asKind(SyntaxKind.ThrowStatement)?.getExpression() : undefined;
}

/** `if (<guard>) throw <value>` with no else, as the guard and the thrown value. */
export function guardedThrow(statement: Node | undefined): { readonly guard: Node; readonly thrown: Node } | undefined {
  const branch = statement?.asKind(SyntaxKind.IfStatement);
  const thrown = branch === undefined || branch.getElseStatement() !== undefined ? undefined : onlyThrow(branch.getThenStatement());
  return branch === undefined || thrown === undefined ? undefined : { guard: branch.getExpression(), thrown };
}
