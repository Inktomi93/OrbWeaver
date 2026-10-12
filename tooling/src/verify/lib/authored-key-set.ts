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
//   (the retired `lib/ast-read.ts` object-literal and factory-return readers had the same one-literal
//   ceiling and demanded EXACTLY ONE `return`; they were deleted once this reader replaced their last caller.)
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
//   2. A factory's returns come from `floor/code-facts/call-returns.ts` `readCallReturns`, which reaches
//      cross-module factories through the shared module-origin reader and a MODULE-LOCAL one (every real
//      factory in canon-write) through the shared lexical symbol.
//
// REFUSAL VOCABULARY is the shared one (`floor/code-facts/reference-fact-contract.ts`): every answer is a `ReferenceFact`,
// so unsupported syntax is an `unresolved` FACT with a reason and an anchor — never absence, never an empty
// key set (§12.3). A caller's fail-closed decision is its own: this reader states what it could not read.
//
// DECLARED LIMIT: a computed property name refuses as `unsupported` even when it is statically knowable.
// The key-set question could resolve it through `readStaticString`, but doing so would make a payload
// GREENER for its consumers, and no consumer or live site asks for it; widening is a separate, provable
// change. No hop cap: the walk is bounded by a node-identity cycle guard, not by a depth budget.

import { readCallReturns } from "@orb/tooling/floor/code-facts/call-returns";
import { resolveStableExpression } from "@orb/tooling/floor/code-facts/reference-fact";
import type { ReferenceFact, ReferenceUnresolvedReason, UnresolvedReferenceFact } from "@orb/tooling/floor/code-facts/reference-fact-contract";
import type { CallExpression, Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
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
