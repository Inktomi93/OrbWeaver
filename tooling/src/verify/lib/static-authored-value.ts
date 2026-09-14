// Recursive authored scalar/object/tuple facts built on the one stable-binding resolver.

import { inspectReferenceWrites, readStaticNumber, readStaticString, resolveStableExpression } from "@orb/tooling/_shared/reference-fact";
import type { ReferenceFact, ReferenceUnresolvedReason, UnresolvedReferenceFact } from "@orb/tooling/_shared/reference-fact-contract";
import { invokedMemberThroughAliases, unprovenReferenceUse } from "@orb/tooling/_shared/reference-fact-writes";
import type { Identifier, Node as MorphNode, SpreadElement } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { StaticAuthoredObjectValue, StaticAuthoredProperty, StaticAuthoredScalar, StaticAuthoredValue } from "../contract/static-authored-value.ts";

interface ReadState {
  readonly active: Set<object>;
  readonly declarations: MorphNode[];
  readonly invokedMembersBySource: Map<object, ReadonlyMap<object, MorphNode>>;
}

function state(): ReadState {
  return { active: new Set<object>(), declarations: [], invokedMembersBySource: new Map<object, ReadonlyMap<object, MorphNode>>() };
}

function appendDeclarations(target: ReadState, declarations: readonly MorphNode[]): void {
  for (const declaration of declarations) {
    if (!target.declarations.some((existing) => existing.compilerNode === declaration.compilerNode)) {
      target.declarations.push(declaration);
    }
  }
}

function unresolved(reason: ReferenceUnresolvedReason, node: MorphNode, target: ReadState, detail: string): UnresolvedReferenceFact {
  return { kind: "unresolved", reason, detail, node, trace: { declarations: [...target.declarations], origin: node } };
}

function mergeRefusal(fact: UnresolvedReferenceFact, target: ReadState): UnresolvedReferenceFact {
  appendDeclarations(target, fact.trace.declarations);
  return unresolved(fact.reason, fact.node, target, fact.detail);
}

function isTransparent(parent: MorphNode, child: MorphNode): boolean {
  return (
    (Node.isParenthesizedExpression(parent) || Node.isAsExpression(parent) || Node.isSatisfiesExpression(parent) || Node.isNonNullExpression(parent)) &&
    parent.getExpression() === child
  );
}

function ownerBinding(terminal: MorphNode): MorphNode | undefined {
  let wrapped = terminal;
  let parent = wrapped.getParent();
  while (parent !== undefined && isTransparent(parent, wrapped)) {
    wrapped = parent;
    parent = wrapped.getParent();
  }
  return Node.isVariableDeclaration(parent) && parent.getInitializer() === wrapped ? parent : undefined;
}

function bindingIdentifier(declaration: MorphNode): Identifier | undefined {
  let name: MorphNode | undefined;
  if (Node.isVariableDeclaration(declaration) || Node.isBindingElement(declaration) || Node.isNamespaceImport(declaration)) {
    name = declaration.getNameNode();
  } else if (Node.isImportSpecifier(declaration)) {
    name = declaration.getAliasNode() ?? declaration.getNameNode();
  } else if (Node.isImportClause(declaration)) {
    name = declaration.getDefaultImport();
  }
  return name !== undefined && Node.isIdentifier(name) ? name : undefined;
}

function compositeBindings(terminal: MorphNode, declarations: readonly MorphNode[]): readonly Identifier[] {
  const all = [...declarations];
  const owner = ownerBinding(terminal);
  if (owner !== undefined && !all.some((declaration) => declaration.compilerNode === owner.compilerNode)) {
    all.push(owner);
  }
  return all.map(bindingIdentifier).filter((identifier) => identifier !== undefined);
}

function explicitCompositeRefusal(
  terminal: MorphNode,
  declarations: readonly MorphNode[],
  target: ReadState,
): { readonly node: MorphNode; readonly reason: "dynamic" | "write" } | undefined {
  let refusal: { readonly node: MorphNode; readonly reason: "dynamic" | "write" } | undefined;
  for (const binding of compositeBindings(terminal, declarations)) {
    const writes = inspectReferenceWrites(binding);
    if (writes.kind === "unresolved" && writes.reason === "write") {
      refusal = { node: writes.node, reason: "write" };
      break;
    }
    const invocation = invokedMemberThroughAliases(binding, target.invokedMembersBySource);
    if (invocation !== undefined) {
      refusal = { node: invocation, reason: "dynamic" };
      break;
    }
  }
  return refusal;
}

function scalarFromResolved(node: MorphNode, terminal: MorphNode, target: ReadState): ReferenceFact<StaticAuthoredValue> {
  let value: StaticAuthoredScalar | undefined;
  if (Node.isStringLiteral(terminal) || Node.isNoSubstitutionTemplateLiteral(terminal)) {
    value = terminal.getLiteralText();
  } else if (Node.isNumericLiteral(terminal)) {
    value = terminal.getLiteralValue();
  } else if (Node.isPrefixUnaryExpression(terminal)) {
    const numberFact = readStaticNumber(node);
    if (numberFact.kind === "unresolved") {
      return mergeRefusal(numberFact, target);
    }
    appendDeclarations(target, numberFact.trace.declarations);
    value = numberFact.value;
  } else if (terminal.isKind(SyntaxKind.TrueKeyword)) {
    value = true;
  } else if (terminal.isKind(SyntaxKind.FalseKeyword)) {
    value = false;
  } else if (terminal.isKind(SyntaxKind.NullKeyword)) {
    value = null;
  }
  return value === undefined
    ? unresolved("unsupported", terminal, target, `${terminal.getKindName()} is not an authored scalar`)
    : { kind: "resolved", value: { kind: "scalar", value, node: terminal }, trace: { declarations: [...target.declarations], origin: terminal } };
}

function propertyName(node: MorphNode, target: ReadState): ReferenceFact<string> {
  if (Node.isIdentifier(node) || Node.isPrivateIdentifier(node) || Node.isStringLiteral(node) || Node.isNumericLiteral(node)) {
    let value = node.getText();
    if (Node.isNumericLiteral(node)) {
      value = String(node.getLiteralValue());
    } else if (Node.isStringLiteral(node)) {
      value = node.getLiteralText();
    }
    return {
      kind: "resolved",
      value,
      trace: { declarations: [], origin: node },
    };
  }
  if (!Node.isComputedPropertyName(node)) {
    return unresolved("unsupported", node, target, `${node.getKindName()} is not a static property name`);
  }
  const stringFact = readStaticString(node.getExpression());
  if (stringFact.kind === "resolved") {
    appendDeclarations(target, stringFact.trace.declarations);
    return stringFact;
  }
  const numberFact = readStaticNumber(node.getExpression());
  if (numberFact.kind === "resolved") {
    appendDeclarations(target, numberFact.trace.declarations);
    return { kind: "resolved", value: String(numberFact.value), trace: numberFact.trace };
  }
  return mergeRefusal(stringFact.reason === "write" || stringFact.reason === "cycle" || stringFact.reason === "ambiguous" ? stringFact : numberFact, target);
}

function readProperty(property: MorphNode, target: ReadState): ReferenceFact<readonly StaticAuthoredProperty[]> {
  if (Node.isSpreadAssignment(property)) {
    const spread = readValue(property.getExpression(), target);
    if (spread.kind === "unresolved") {
      return spread;
    }
    return spread.value.kind === "object"
      ? { kind: "resolved", value: spread.value.properties, trace: spread.trace }
      : unresolved("unsupported", property, target, `object spread ${property.getText()} does not resolve to an authored object`);
  }
  if (!(Node.isPropertyAssignment(property) || Node.isShorthandPropertyAssignment(property))) {
    return unresolved("unsupported", property, target, `${property.getKindName()} is not an authored data property`);
  }
  const name = propertyName(property.getNameNode(), target);
  if (name.kind === "unresolved") {
    return name;
  }
  if (name.value === "__proto__") {
    return unresolved("unsupported", property.getNameNode(), target, "__proto__ has setter semantics in an object literal");
  }
  const valueNode = Node.isPropertyAssignment(property) ? property.getInitializer() : property.getNameNode();
  if (valueNode === undefined) {
    return unresolved("missing", property, target, `property ${name.value} has no initializer`);
  }
  const value = readValue(valueNode, target);
  return value.kind === "unresolved"
    ? value
    : {
        kind: "resolved",
        value: [{ key: name.value, keyNode: property.getNameNode(), value: value.value }],
        trace: value.trace,
      };
}

function readObject(node: import("ts-morph").ObjectLiteralExpression, target: ReadState): ReferenceFact<StaticAuthoredObjectValue> {
  const properties: StaticAuthoredProperty[] = [];
  for (const property of node.getProperties()) {
    const read = readProperty(property, target);
    if (read.kind === "unresolved") {
      return read;
    }
    properties.push(...read.value);
  }
  return { kind: "resolved", value: { kind: "object", properties, node }, trace: { declarations: [...target.declarations], origin: node } };
}

/** Known elements are a lower bound when unknownSpreads is nonempty, never an exact element list. */
interface ArrayRead<Value> {
  readonly elements: readonly Value[];
  readonly unknownSpreads: readonly UnresolvedReferenceFact[];
}

function exactElements<Value>(fact: ReferenceFact<ArrayRead<Value>>): ReferenceFact<readonly Value[]> {
  if (fact.kind === "unresolved") {
    return fact;
  }
  return fact.value.unknownSpreads[0] ?? { kind: "resolved", value: fact.value.elements, trace: fact.trace };
}

/** One ordering/hole/spread grammar for exact values and presence. Partial spreads do not stop the
 *  sibling scan: a later hole, cycle or binding refusal must still invalidate a known nonempty prefix. */
function arrayEntries<Value>(
  node: import("ts-morph").ArrayLiteralExpression,
  target: ReadState,
  readElement: (node: MorphNode) => ReferenceFact<Value>,
  readSpread: (node: SpreadElement) => ReferenceFact<ArrayRead<Value>>,
): ReferenceFact<ArrayRead<Value>> {
  const elements: Value[] = [];
  const unknownSpreads: UnresolvedReferenceFact[] = [];
  for (const element of node.getElements()) {
    if (Node.isOmittedExpression(element)) {
      return unresolved("unsupported", element, target, "array holes are not authored tuple values");
    }
    if (Node.isSpreadElement(element)) {
      const spread = readSpread(element);
      if (spread.kind === "unresolved") {
        return spread;
      }
      elements.push(...spread.value.elements);
      unknownSpreads.push(...spread.value.unknownSpreads);
      continue;
    }
    const value = readElement(element);
    if (value.kind === "unresolved") {
      return value;
    }
    elements.push(value.value);
  }
  return { kind: "resolved", value: { elements, unknownSpreads }, trace: { declarations: [...target.declarations], origin: node } };
}

function readArray(node: import("ts-morph").ArrayLiteralExpression, target: ReadState): ReferenceFact<StaticAuthoredValue> {
  const elements = exactElements(
    arrayEntries(
      node,
      target,
      (element) => readValue(element, target),
      (element) => {
        const spread = readValue(element.getExpression(), target);
        if (spread.kind === "unresolved") {
          return spread;
        }
        return spread.value.kind === "tuple"
          ? { kind: "resolved", value: { elements: spread.value.elements, unknownSpreads: [] }, trace: spread.trace }
          : unresolved("unsupported", element, target, `array spread ${element.getText()} does not resolve to an authored tuple`);
      },
    ),
  );
  return elements.kind === "unresolved" ? elements : { kind: "resolved", value: { kind: "tuple", elements: elements.value, node }, trace: elements.trace };
}

function shallowArray(node: MorphNode, target: ReadState, accepted: ReadonlySet<MorphNode>, spread = false): ReferenceFact<ArrayRead<MorphNode>> {
  const read = resolveAuthoredComposite(node);
  if (read.kind === "unresolved") {
    // A runtime expression is an unknown contribution, whereas a dynamic USE of an authored array
    // is a hard refusal. Ask the binding resolver to distinguish them; do not copy its terminal grammar
    // or infer provenance from a diagnostic string. Destructured bindings are not expression terminals.
    const stable = spread && read.reason === "dynamic" ? resolveStableExpression(node) : undefined;
    if (stable?.kind === "unresolved" && stable.reason === "dynamic" && Node.isExpression(stable.node)) {
      appendDeclarations(target, stable.trace.declarations);
      return { kind: "resolved", value: { elements: [], unknownSpreads: [stable] }, trace: stable.trace };
    }
    return mergeRefusal(read, target);
  }
  appendDeclarations(target, read.trace.declarations);
  const terminal = read.value;
  if (!Node.isArrayLiteralExpression(terminal)) {
    const refusal = unresolved("unsupported", terminal, target, "declaration does not resolve to an authored array");
    return spread ? { kind: "resolved", value: { elements: [], unknownSpreads: [refusal] }, trace: read.trace } : refusal;
  }
  for (const binding of compositeBindings(terminal, read.trace.declarations)) {
    const use = unprovenReferenceUse(binding, accepted);
    if (use !== undefined) {
      return unresolved("dynamic", use, target, "an array use has an unproven effect on its cardinality");
    }
  }
  if (target.active.has(terminal.compilerNode)) {
    return unresolved("cycle", terminal, target, "authored array contains a spread cycle");
  }
  target.active.add(terminal.compilerNode);
  const elements = arrayEntries(
    terminal,
    target,
    (element) => ({ kind: "resolved", value: element, trace: { declarations: [], origin: element } }),
    (element) => shallowArray(element.getExpression(), target, accepted, true),
  );
  target.active.delete(terminal.compilerNode);
  return elements;
}

/** Exact shallow array elements through stable aliases/spreads and proven uses. Element values remain
 *  opaque: a fact provider can be a call/import without becoming an unreadable JSON-like value.
 *  Unlike readStaticAuthoredValue, every array identity use must be accounted for by the query. */
export function readAuthoredArrayElements(node: MorphNode, accepted: ReadonlySet<MorphNode>): ReferenceFact<readonly MorphNode[]> {
  return exactElements(shallowArray(node, state(), accepted));
}

/** Presence on successful array construction, not exact cardinality or validity of opaque elements.
 *  An unknown spread cannot remove an authored element; unknown-only spreads cannot prove emptiness.
 *  Root/binding/effect refusals and malformed authored arrays are checked before this projection.
 *  As with the exact source reader, modified built-in prototypes and external host mutation are not modeled. */
export function readAuthoredArrayPresence(node: MorphNode, accepted: ReadonlySet<MorphNode>): ReferenceFact<"empty" | "nonempty"> {
  const read = shallowArray(node, state(), accepted);
  if (read.kind === "unresolved") {
    return read;
  }
  if (read.value.elements.length > 0) {
    return { kind: "resolved", value: "nonempty", trace: read.trace };
  }
  return read.value.unknownSpreads[0] ?? { kind: "resolved", value: "empty", trace: read.trace };
}

function readValue(node: MorphNode, target: ReadState): ReferenceFact<StaticAuthoredValue> {
  const stable = resolveStableExpression(node);
  if (stable.kind === "unresolved") {
    return mergeRefusal(stable, target);
  }
  appendDeclarations(target, stable.trace.declarations);
  const terminal = stable.value;
  if (Node.isObjectLiteralExpression(terminal) || Node.isArrayLiteralExpression(terminal)) {
    const refusal = explicitCompositeRefusal(terminal, stable.trace.declarations, target);
    if (refusal !== undefined) {
      const detail = refusal.reason === "write" ? "is mutated after declaration" : "has an invoked member whose effect is not statically known";
      return unresolved(refusal.reason, refusal.node, target, `authored composite ${terminal.getText()} ${detail}`);
    }
    if (target.active.has(terminal.compilerNode)) {
      return unresolved("cycle", terminal, target, `authored value cycle returns to ${terminal.getText()}`);
    }
    target.active.add(terminal.compilerNode);
    const fact = Node.isObjectLiteralExpression(terminal) ? readObject(terminal, target) : readArray(terminal, target);
    target.active.delete(terminal.compilerNode);
    return fact;
  }
  return scalarFromResolved(node, terminal, target);
}

/** Resolve one authored entry to its stable terminal, refusing only when the composite's OWN binding is
 *  mutated or has an invoked member.
 *
 *  This answers ROOT PROVENANCE ("which authored node is this value?"), which is a strictly weaker and
 *  independent question from `readStaticAuthoredValue`'s ("is every field of it statically readable?").
 *  A caller that needs the literal's own identity — a registry definition whose fields legitimately carry
 *  imported icons, components, and hooks — must not inherit a FIELD-level refusal as a provenance refusal;
 *  that conflation reported zero live definitions for four registry kinds while every path check stayed
 *  green (#1584 registry family). */
export function resolveAuthoredComposite(node: MorphNode): ReferenceFact<MorphNode> {
  const target = state();
  const stable = resolveStableExpression(node);
  if (stable.kind === "unresolved") {
    return mergeRefusal(stable, target);
  }
  appendDeclarations(target, stable.trace.declarations);
  const terminal = stable.value;
  if (!(Node.isObjectLiteralExpression(terminal) || Node.isArrayLiteralExpression(terminal))) {
    return { kind: "resolved", value: terminal, trace: stable.trace };
  }
  const refusal = explicitCompositeRefusal(terminal, stable.trace.declarations, target);
  if (refusal === undefined) {
    return { kind: "resolved", value: terminal, trace: stable.trace };
  }
  const detail = refusal.reason === "write" ? "is mutated after declaration" : "has an invoked member whose effect is not statically known";
  return unresolved(refusal.reason, refusal.node, target, `authored composite ${terminal.getText()} ${detail}`);
}

/** Read one literal scalar through immutable aliases; unsupported syntax is always a loud fact. */
export function readStaticAuthoredScalar(node: MorphNode): ReferenceFact<StaticAuthoredScalar> {
  const fact = readStaticAuthoredValue(node);
  if (fact.kind === "unresolved") {
    return fact;
  }
  return fact.value.kind === "scalar"
    ? { kind: "resolved", value: fact.value.value, trace: fact.trace }
    : {
        kind: "unresolved",
        reason: "unsupported",
        detail: `${fact.value.node.getKindName()} is not an authored scalar`,
        node: fact.value.node,
        trace: fact.trace,
      };
}

/** Read authored JSON-like source shape.
 *
 * This does not execute builders, getters, methods, or arbitrary code, and does not claim the returned
 * shape is the effective runtime value. Explicit assignments/updates/deletes refuse as writes; invoked
 * members refuse as dynamic. Passing the value to an arbitrary function remains outside this reader's
 * effect model because the intended policy query itself is such a call. */
export function readStaticAuthoredValue(node: MorphNode): ReferenceFact<StaticAuthoredValue> {
  return readValue(node, state());
}
