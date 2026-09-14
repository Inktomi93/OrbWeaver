// The KEY-SET reader: the union of authored property NAMES a write payload can carry, across every branch
// that composes it. `lib/` already had VALUE readers and no key-set reader, and the difference is not a
// nuance — it is why `freeze-provenance-write-pairing` could not convert (#1584, measured on the seven live
// `messageVariants` writes in packages/server/src/domain/chat/persistence/canon-write.ts):
//
//   `readStaticAuthoredValue`   refuses every one of them, because a real write's FIELDS are `params.x`
//                               (dynamic: PropertyAccessExpression) or a builder call (dynamic:
//                               CallExpression) — a value reader must refuse those, and a pairing rule does
//                               not care what the values ARE.
//   `resolveAuthoredComposite`  answers "which literal node is this", so it stops at the FIRST literal and
//                               refuses a builder call outright: it never unions a spread's contribution.
//   `readObjectLiteral`         same one-literal ceiling ("a call expression (a builder)").
//   `readReturnedObjectLiteral` reaches a factory's literal but demands EXACTLY ONE `return`.
//
// So this module answers a strictly weaker and independent question from all four: WHICH KEYS could this
// expression author, on any branch. It resolves the union through a `...spread` of a call, through EVERY
// expression a factory returns (a conditional writer "may write" each key — the conservative read for a
// pairing rule), through ternary branches, and through arrays. Values are never read.
//
// TWO PLACES IT SITS ABOVE THE SHARED VALUE RESOLVER, deliberately:
//   1. `resolveStableExpression` classifies a CallExpression / ConditionalExpression as a `dynamic` TERMINAL
//      — correct for a value reader, since the value is not statically known. For a KEY-SET reader those two
//      are COMPOSITION nodes, so the walk continues at the refusal's own `node`. The binding identity below
//      them is still entirely the shared resolver's; nothing here re-implements an alias hop.
//   2. `resolveCallableOrigin` / `resolveModuleMemberOrigin` cannot reach a MODULE-LOCAL factory: a
//      non-exported `function f() {}` refuses as "FunctionDeclaration is not a supported module-member
//      binding", and every real factory in canon-write is exactly that. `resolveCalleeFunction` therefore
//      tries the shared module-origin reader FIRST (which is what closes cross-module factories, aliases and
//      re-export renames) and falls back to the shared lexical symbol for the module-local case.
//
// REFUSAL VOCABULARY is the shared one (`_shared/reference-fact-contract.ts`): every answer is a `ReferenceFact`,
// so unsupported syntax is an `unresolved` FACT with a reason and an anchor — never absence, never an empty
// key set (§12.3). A caller's fail-closed decision is its own: this reader states what it could not read.
//
// DECLARED LIMIT: a computed property name refuses as `unsupported` even when it is statically knowable.
// The key-set question could resolve it through `readStaticString`, but doing so would make a payload
// GREENER for its consumers, and no consumer or live site asks for it; widening is a separate, provable
// change. No hop cap: the walk is bounded by a node-identity cycle guard, not by a depth budget.

import { resolveStableExpression } from "@orb/tooling/_shared/reference-fact";
import { resolveCallableOrigin } from "@orb/tooling/_shared/reference-fact-call";
import type { ReferenceFact, ReferenceUnresolvedReason, UnresolvedReferenceFact } from "@orb/tooling/_shared/reference-fact-contract";
import { lexicalReferenceSymbol } from "@orb/tooling/_shared/reference-fact-writes";
import type { CallExpression, Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readStringValue, unwrapExpression } from "./ast-read.ts";

interface KeyState {
  /** Node-identity cycle guard: every composition node the walk has entered and not yet left. */
  readonly active: Set<object>;
  readonly declarations: MorphNode[];
}

function state(): KeyState {
  return { active: new Set<object>(), declarations: [] };
}

function note(target: KeyState, declaration: MorphNode): void {
  if (!target.declarations.some((existing) => existing.compilerNode === declaration.compilerNode)) {
    target.declarations.push(declaration);
  }
}

function unresolved(reason: ReferenceUnresolvedReason, node: MorphNode, target: KeyState, detail: string): UnresolvedReferenceFact {
  return { kind: "unresolved", reason, detail, node, trace: { declarations: [...target.declarations], origin: node } };
}

function resolvedKeys(keys: ReadonlySet<string>, origin: MorphNode, target: KeyState): ReferenceFact<ReadonlySet<string>> {
  return { kind: "resolved", value: keys, trace: { declarations: [...target.declarations], origin } };
}

/** The composition nodes this reader owns, which the shared value resolver reports as `dynamic` terminals. */
function isCompositionNode(node: MorphNode): boolean {
  return Node.isCallExpression(node) || Node.isConditionalExpression(node);
}

function isFunctionish(node: MorphNode): boolean {
  return Node.isFunctionDeclaration(node) || Node.isArrowFunction(node) || Node.isFunctionExpression(node) || Node.isMethodDeclaration(node);
}

/** The function-like node a declaration denotes: a `function`/method directly, an arrow or function
 *  expression through a `const f = …` binding. Anything else is not a factory this reader can enter. */
function functionLike(declaration: MorphNode, target: KeyState): ReferenceFact<MorphNode> {
  if (isFunctionish(declaration)) {
    note(target, declaration);
    return { kind: "resolved", value: declaration, trace: { declarations: [...target.declarations], origin: declaration } };
  }
  if (!Node.isVariableDeclaration(declaration)) {
    return unresolved("unsupported", declaration, target, `${declaration.getKindName()} is not a callable declaration`);
  }
  const initializer = declaration.getInitializer();
  const value = initializer === undefined ? undefined : unwrapExpression(initializer);
  if (value === undefined || !isFunctionish(value)) {
    return unresolved("unsupported", declaration, target, `${declaration.getName()} is not bound to a function expression`);
  }
  note(target, declaration);
  return { kind: "resolved", value, trace: { declarations: [...target.declarations], origin: value } };
}

/** The module-local declaration an identifier binds, through the SHARED lexical symbol. This is the hop the
 *  module-origin reader deliberately does not model (it answers "which module export", and a non-exported
 *  local is not one); a shadowed or overloaded name resolves to more than one declaration and refuses. */
function localDeclaration(callee: MorphNode, target: KeyState, refusal: UnresolvedReferenceFact): ReferenceFact<MorphNode> {
  if (!Node.isIdentifier(callee)) {
    return refusal;
  }
  const declarations = lexicalReferenceSymbol(callee)?.getDeclarations() ?? [];
  if (declarations.length === 0) {
    return refusal;
  }
  if (declarations.length !== 1) {
    return unresolved("ambiguous", callee, target, `${callee.getText()} binds ${declarations.length} declarations`);
  }
  const only = declarations[0];
  return only === undefined ? refusal : functionLike(only, target);
}

function calleeFunction(call: CallExpression, target: KeyState): ReferenceFact<MorphNode> {
  const origin = resolveCallableOrigin(call);
  if (origin.kind === "resolved" && origin.value.target.kind === "module") {
    const canonical = origin.value.target.canonical;
    return canonical.kind === "project"
      ? functionLike(canonical.declaration, target)
      : unresolved("unsupported", call, target, `${canonical.exportedName} is declared in the external package ${canonical.moduleSpecifier}`);
  }
  const refusal =
    origin.kind === "unresolved"
      ? unresolved(origin.reason, origin.node, target, origin.detail)
      : unresolved("unsupported", call, target, `${call.getExpression().getText()} resolves to an ambient global, not an authored factory`);
  return localDeclaration(unwrapExpression(call.getExpression()), target, refusal);
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

/** The expressions the function THIS CALL targets returns. `readReturnedObjectLiteral` refuses any function
 *  with more than one `return`; a union reader must see them all, so this is its own door. */
export function readCallReturns(call: CallExpression): ReferenceFact<readonly MorphNode[]> {
  const target = state();
  const fn = calleeFunction(call, target);
  if (fn.kind === "unresolved") {
    return fn;
  }
  const returns = returnedExpressions(fn.value);
  return returns.length === 0
    ? unresolved("missing", fn.value, target, `${call.getExpression().getText()} returns no expression this reader can enter`)
    : { kind: "resolved", value: returns, trace: { declarations: [...target.declarations], origin: fn.value } };
}

/** One authored property's key, through the shared string-literal door (`"glyph-xs":` reads as `"glyph-xs"`
 *  from `getName()`, which is why `readStringValue` comes first). */
function propertyKey(property: MorphNode, target: KeyState): ReferenceFact<string> {
  if (Node.isShorthandPropertyAssignment(property)) {
    return { kind: "resolved", value: property.getName(), trace: { declarations: [...target.declarations], origin: property } };
  }
  if (!Node.isPropertyAssignment(property)) {
    return unresolved("unsupported", property, target, `${property.getKindName()} is not an authored data property`);
  }
  const nameNode = property.getNameNode();
  return Node.isComputedPropertyName(nameNode)
    ? unresolved("unsupported", nameNode, target, `the computed key ${nameNode.getText()} is not a statically authored property name`)
    : { kind: "resolved", value: readStringValue(nameNode) ?? nameNode.getText(), trace: { declarations: [...target.declarations], origin: nameNode } };
}

function objectKeys(object: MorphNode, keys: Set<string>, target: KeyState): UnresolvedReferenceFact | undefined {
  let refusal: UnresolvedReferenceFact | undefined;
  for (const property of Node.isObjectLiteralExpression(object) ? object.getProperties() : []) {
    if (refusal !== undefined) {
      break;
    }
    if (Node.isSpreadAssignment(property)) {
      refusal = collect(property.getExpression(), keys, target);
      continue;
    }
    const key = propertyKey(property, target);
    if (key.kind === "unresolved") {
      refusal = key;
      continue;
    }
    keys.add(key.value);
  }
  return refusal;
}

function arrayKeys(array: MorphNode, keys: Set<string>, target: KeyState): UnresolvedReferenceFact | undefined {
  let refusal: UnresolvedReferenceFact | undefined;
  for (const element of Node.isArrayLiteralExpression(array) ? array.getElements() : []) {
    if (refusal !== undefined) {
      break;
    }
    if (Node.isOmittedExpression(element)) {
      refusal = unresolved("unsupported", element, target, "an array hole authors no properties");
      continue;
    }
    refusal = collect(Node.isSpreadElement(element) ? element.getExpression() : element, keys, target);
  }
  return refusal;
}

function branchKeys(node: MorphNode, keys: Set<string>, target: KeyState): UnresolvedReferenceFact | undefined {
  const branches = Node.isConditionalExpression(node) ? [node.getWhenTrue(), node.getWhenFalse()] : [];
  let refusal: UnresolvedReferenceFact | undefined;
  for (const branch of branches) {
    refusal = refusal ?? collect(branch, keys, target);
  }
  return refusal;
}

function callKeys(call: CallExpression, keys: Set<string>, target: KeyState): UnresolvedReferenceFact | undefined {
  const returns = readCallReturns(call);
  if (returns.kind === "unresolved") {
    return returns;
  }
  let refusal: UnresolvedReferenceFact | undefined;
  for (const expression of returns.value) {
    refusal = refusal ?? collect(expression, keys, target);
  }
  return refusal;
}

/** Continue the walk at a node the shared value resolver classified as a `dynamic` terminal but this reader
 *  composes over; any other refusal is this reader's refusal too. */
function throughRefusal(refusal: UnresolvedReferenceFact, keys: Set<string>, target: KeyState): UnresolvedReferenceFact | undefined {
  return refusal.reason === "dynamic" && isCompositionNode(refusal.node) ? collect(refusal.node, keys, target) : refusal;
}

function collect(node: MorphNode, keys: Set<string>, target: KeyState): UnresolvedReferenceFact | undefined {
  const current = unwrapExpression(node);
  if (target.active.has(current.compilerNode)) {
    return unresolved("cycle", current, target, `authored key-set cycle returns to ${current.getKindName()}`);
  }
  target.active.add(current.compilerNode);
  const refusal = collectEntered(current, keys, target);
  target.active.delete(current.compilerNode);
  return refusal;
}

function collectEntered(current: MorphNode, keys: Set<string>, target: KeyState): UnresolvedReferenceFact | undefined {
  if (Node.isObjectLiteralExpression(current)) {
    return objectKeys(current, keys, target);
  }
  if (Node.isArrayLiteralExpression(current)) {
    return arrayKeys(current, keys, target);
  }
  if (Node.isConditionalExpression(current)) {
    return branchKeys(current, keys, target);
  }
  if (Node.isCallExpression(current)) {
    return callKeys(current, keys, target);
  }
  const stable = resolveStableExpression(current);
  if (stable.kind === "unresolved") {
    return throughRefusal(stable, keys, target);
  }
  for (const declaration of stable.trace.declarations) {
    note(target, declaration);
  }
  return stable.value.compilerNode === current.compilerNode
    ? unresolved("unsupported", current, target, `${current.getKindName()} authors no statically readable property names`)
    : collect(stable.value, keys, target);
}

/** The union of authored property names this expression can carry on any branch, or one precise refusal.
 *  An empty resolved set means "this expression authors no properties"; it never means "I could not read
 *  it" — that is always an `unresolved` fact. */
export function readAuthoredKeySet(node: MorphNode): ReferenceFact<ReadonlySet<string>> {
  const target = state();
  const keys = new Set<string>();
  const refusal = collect(node, keys, target);
  return refusal ?? resolvedKeys(keys, node, target);
}
