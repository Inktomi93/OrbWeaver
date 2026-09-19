// Recognizing a PROMISE REJECTION HANDLER invocation in every spelling (`p.catch(h)`, `p.then(_, h)`,
// `.call`/`.apply`/`Reflect.apply`/a bound alias), whether the receiver is actually promise-shaped, and
// whether a recovered value reaches a real consumer or is discarded in statement position. No ownership
// verdict lives here — this reader only names WHICH invocation is a rejection handler and what it touches.
import type { CallExpression, Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { unwrapExpression } from "./ast-read.ts";
import { ambientIdentifier, hasInterveningWrite, importedName, literalMember, REJECTION_HANDLER_INDEX } from "./caught-failure-core.ts";

function isZodSchemaExpression(node: Node, seen: ReadonlySet<Node> = new Set()): boolean {
  const value = unwrapExpression(node);
  if (seen.has(value)) {
    return false;
  }
  const nextSeen = new Set(seen).add(value);
  if (value.isKind(SyntaxKind.Identifier)) {
    if (importedName(value, new Set(["zod"])) !== undefined) {
      return true;
    }
    const declaration = value.getSymbol()?.getDeclarations()[0];
    const initializer = declaration?.isKind(SyntaxKind.VariableDeclaration) === true ? declaration.getInitializer() : undefined;
    return initializer !== undefined && isZodSchemaExpression(initializer, nextSeen);
  }
  if (value.isKind(SyntaxKind.CallExpression)) {
    const callee = unwrapExpression(value.getExpression());
    if (callee.isKind(SyntaxKind.Identifier) && importedName(callee, new Set(["zod"])) !== undefined) {
      return true;
    }
    const member = literalMember(callee);
    return member !== undefined && isZodSchemaExpression(member.receiver, nextSeen);
  }
  const member = literalMember(value);
  return member !== undefined && isZodSchemaExpression(member.receiver, nextSeen);
}

export function promiseLikeValue(receiver: Node): boolean {
  if (isZodSchemaExpression(receiver)) {
    return false;
  }
  const type = receiver.getType();
  const constituents = type.isUnion() ? type.getUnionTypes() : [type];
  const nonNullish = constituents.filter((part) => !["null", "undefined"].includes(part.getText()));
  return nonNullish.length > 0 && nonNullish.every((part) => ["any", "unknown"].includes(part.getText()) || part.getProperty("then") !== undefined);
}

export interface PromiseRejectionInvocation {
  readonly handler: Node;
  readonly link: "catch" | "then";
  readonly receiver: Node;
  readonly direct: boolean;
}

type RejectionLink = "catch" | "then";

function rejectionLink(name: string | undefined): RejectionLink | undefined {
  return name === "catch" || name === "then" ? name : undefined;
}

/** `p.catch(h)` / `p.then(_, h)` — the direct spelling, and the only one that owns a whole chain. */
function directRejection(call: CallExpression, member: { readonly name: string; readonly receiver: Node }): PromiseRejectionInvocation | undefined {
  const link = rejectionLink(member.name);
  if (link === undefined) {
    return;
  }
  const handler = call.getArguments()[REJECTION_HANDLER_INDEX.get(link) ?? -1];
  return handler === undefined ? undefined : { handler, link, receiver: member.receiver, direct: true };
}

/** `p.catch.call(p, h)` / `Promise.prototype.catch.call(p, h)` — the same absorb, one argument to the right. */
function calledRejection(call: CallExpression, member: { readonly name: string; readonly receiver: Node }): PromiseRejectionInvocation | undefined {
  const link = member.name === "call" ? rejectionLink(literalMember(member.receiver)?.name) : undefined;
  if (link === undefined) {
    return;
  }
  const receiver = call.getArguments()[0];
  const handler = call.getArguments()[(REJECTION_HANDLER_INDEX.get(link) ?? -2) + 1];
  return receiver === undefined || handler === undefined ? undefined : { handler, link, receiver, direct: false };
}

/** `p.catch.apply(p, [h])` and `Reflect.apply(p.catch, p, [h])` — the handler moves into the array literal. */
function appliedRejection(call: CallExpression, member: { readonly name: string; readonly receiver: Node }): PromiseRejectionInvocation | undefined {
  if (member.name !== "apply") {
    return;
  }
  const reflect = ambientIdentifier(member.receiver, "Reflect", new Set());
  const rejectionNode = reflect ? call.getArguments()[0] : member.receiver;
  const receiver = call.getArguments()[reflect ? 1 : 0];
  const args = call.getArguments()[reflect ? 2 : 1];
  const link = rejectionNode === undefined ? undefined : rejectionLink(literalMember(rejectionNode)?.name);
  if (link === undefined || receiver === undefined || args?.isKind(SyntaxKind.ArrayLiteralExpression) !== true) {
    return;
  }
  const handler = args.getElements()[REJECTION_HANDLER_INDEX.get(link) ?? -1];
  return handler === undefined ? undefined : { handler, link, receiver, direct: false };
}

/** `const recover = p.catch.bind(p); recover(h)` — the absorb one hop behind a const. */
function boundRejection(call: CallExpression, callee: Node): PromiseRejectionInvocation | undefined {
  if (!callee.isKind(SyntaxKind.Identifier)) {
    return;
  }
  const declaration = callee.getSymbol()?.getDeclarations()[0];
  if (declaration?.isKind(SyntaxKind.VariableDeclaration) !== true || hasInterveningWrite(callee, declaration)) {
    return;
  }
  const initializer = declaration.getInitializerIfKind(SyntaxKind.CallExpression);
  const bind = initializer === undefined ? undefined : literalMember(initializer.getExpression());
  if (initializer === undefined || bind?.name !== "bind") {
    return;
  }
  const link = rejectionLink(literalMember(bind.receiver)?.name);
  if (link === undefined) {
    return;
  }
  const receiver = initializer.getArguments()[0];
  const handler = call.getArguments()[REJECTION_HANDLER_INDEX.get(link) ?? -1];
  return receiver === undefined || handler === undefined ? undefined : { handler, link, receiver, direct: false };
}

/** Every way to hand a promise a REJECTION HANDLER. Method syntax is only the most common one — a reader that
 *  stops there leaves `call`/`apply`/`Reflect.apply`/`bind` as silent laundering routes for the same absorb. */
export function promiseRejectionInvocation(call: CallExpression): PromiseRejectionInvocation | undefined {
  const callee = unwrapExpression(call.getExpression());
  const member = literalMember(callee);
  if (member === undefined) {
    return boundRejection(call, callee);
  }
  return directRejection(call, member) ?? calledRejection(call, member) ?? appliedRejection(call, member) ?? boundRejection(call, callee);
}

/** Kinds that WRAP a value without giving anyone a handle on it — the whole wrapper is discarded exactly when
 *  its content is. Property access is handled separately (it may continue into an outer call). */
const TRANSPARENT_WRAPPER_KINDS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.ArrayLiteralExpression,
  SyntaxKind.AsExpression,
  SyntaxKind.AwaitExpression,
  SyntaxKind.ConditionalExpression,
  SyntaxKind.NonNullExpression,
  SyntaxKind.ObjectLiteralExpression,
  SyntaxKind.ParenthesizedExpression,
  SyntaxKind.PrefixUnaryExpression,
  SyntaxKind.TemplateExpression,
  SyntaxKind.TemplateSpan,
  SyntaxKind.VoidExpression,
]);
/** Binary operators that PASS THE VALUE THROUGH rather than storing it. `=` is deliberately absent: an
 *  assignment gives a caller a handle, so the recovered value is retained, not discarded. */
const TRANSPARENT_BINARY_OPERATORS: ReadonlySet<string> = new Set([",", "&&", "||", "??"]);

/** The next node up that the recovered value flows into, or undefined when the chain leaves this reader. */
function transparentParent(current: Node): Node | undefined {
  const parent = current.getParent();
  if (parent === undefined) {
    return;
  }
  if (TRANSPARENT_WRAPPER_KINDS.has(parent.getKind())) {
    return parent;
  }
  if (parent.isKind(SyntaxKind.PropertyAssignment) && parent.getInitializer() === current) {
    return parent;
  }
  if (parent.isKind(SyntaxKind.BinaryExpression) && TRANSPARENT_BINARY_OPERATORS.has(parent.getOperatorToken().getText())) {
    return parent;
  }
  if (parent.isKind(SyntaxKind.CallExpression) && parent.getArguments().some((argument) => argument === current) && isNativePromiseAggregate(parent)) {
    return parent;
  }
  const memberRead = parent.isKind(SyntaxKind.PropertyAccessExpression) || parent.isKind(SyntaxKind.ElementAccessExpression);
  if (!(memberRead && parent.getExpression() === current)) {
    return;
  }
  return parent.getParentIfKind(SyntaxKind.CallExpression) ?? parent;
}

/** Does this recovered promise reach a STATEMENT with nobody holding it? Wrapping it in an object, an array,
 *  a template, an aggregate, or a derived property does not create a consumer for its failure value. */
export function isDiscardedExpression(call: CallExpression): boolean {
  let current: Node = call;
  for (;;) {
    if (current.getParent()?.isKind(SyntaxKind.ExpressionStatement) === true) {
      return true;
    }
    const next = transparentParent(current);
    if (next === undefined) {
      return false;
    }
    current = next;
  }
}

function isNativePromiseAggregate(call: CallExpression): boolean {
  const member = literalMember(call.getExpression());
  if (
    member === undefined ||
    !new Set(["all", "allSettled", "any", "race"]).has(member.name) ||
    !member.receiver.isKind(SyntaxKind.Identifier) ||
    member.receiver.getText() !== "Promise"
  ) {
    return false;
  }
  return (member.receiver.getSymbol()?.getDeclarations() ?? []).every(
    (declaration) => declaration.getSourceFile() !== call.getSourceFile() || declaration.getSourceFile().isDeclarationFile(),
  );
}
