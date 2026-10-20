// A RETAINED rejection: a discarding handler on a promise this function also returns forks bookkeeping off a
// rejection the caller still receives. Every read past the declaration is syntax inside one function body, so a
// verdict here asks no native answer outside the site's own closure (D328).
import type { Block, Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { CaughtFailureReadServices } from "../contract/caught-failure.ts";
import { unwrapExpression } from "./ast-read.ts";
import { FUNCTION_KINDS, literalMember } from "./caught-failure-core.ts";
import { rawFailureDeclarations } from "./caught-failure-read.ts";

/** Chain links that settle with their receiver's rejection when they carry no rejection handler. */
const REJECTION_PRESERVING_LINKS: ReadonlyMap<string, number> = new Map([
  ["finally", Number.POSITIVE_INFINITY],
  ["then", 1],
]);
const DEFERRED_FACTORY = "withResolvers";
const DEFERRED_REJECT = "reject";
const DEFERRED_PROMISE = "promise";

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

function returnsRejectionOf(value: Node, text: string): boolean {
  const unwrapped = unwrapExpression(value);
  if (unwrapped.getText() === text) {
    return true;
  }
  if (!unwrapped.isKind(SyntaxKind.CallExpression)) {
    return false;
  }
  const member = literalMember(unwrapped.getExpression());
  const arity = member === undefined ? undefined : REJECTION_PRESERVING_LINKS.get(member.name);
  return member !== undefined && arity !== undefined && unwrapped.getArguments().length <= arity && returnsRejectionOf(member.receiver, text);
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

/** Does the function return `retained` (or a handler-free link off it) as its LAST statement, with nothing between
 *  `site`'s statement and that return able to leave first? */
function returnedAfter(retained: RetainedReceiver, site: Node): boolean {
  const statements = retained.body.getStatements();
  const returned = statements.at(-1)?.asKind(SyntaxKind.ReturnStatement)?.getExpression();
  const at = statementIndex(retained.body, site);
  const declared = statementIndex(retained.body, retained.declaration);
  if (returned === undefined || at < 0 || at >= statements.length - 1 || declared < 0 || declared >= at) {
    return false;
  }
  return !statements.slice(at + 1, -1).some(leavesBefore) && returnsRejectionOf(returned, retained.text);
}

/** `p.catch(noop)` beside `return p` (or `return p.finally(…)`): the rejection still reaches the caller, so the
 *  discarding handler forks bookkeeping and absorbs nothing. */
export function rejectionRetainedByReturn(call: Node, receiver: Node, reads?: CaughtFailureReadServices): boolean {
  const retained = retainedReceiver(receiver, call, reads);
  return retained !== undefined && returnedAfter(retained, call);
}

/** `.then(d.resolve, d.reject)` where `d` is a native `Promise.withResolvers()` deferred whose `d.promise` the
 *  function returns: the rejection is forwarded into a promise the caller holds. */
export function rejectionForwardedToReturnedDeferred(handler: Node, reads?: CaughtFailureReadServices): boolean {
  const member = literalMember(handler);
  if (member?.name !== DEFERRED_REJECT || !member.receiver.isKind(SyntaxKind.Identifier)) {
    return false;
  }
  const declaration = rawFailureDeclarations(member.receiver, reads)[0];
  const initializer = declaration?.asKind(SyntaxKind.VariableDeclaration)?.getInitializerIfKind(SyntaxKind.CallExpression);
  const factory = initializer === undefined ? undefined : literalMember(initializer.getExpression());
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
  return retained !== undefined && !writesMember(retained.body, promise) && returnedAfter({ ...retained, text: promise }, handler);
}
