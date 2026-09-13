// Exact text from a deliberately small intrinsic grammar: Object.freeze, Object.keys, and string-array
// join. Binding/global identity comes from reference-fact; authored object fields come from its existing
// scalar/object reader. Nothing here executes authored code or turns a consumer census into permission.
//
// Unfrozen collections must stay inside this grammar through every local alias. Frozen primitive arrays
// can escape: other consumers cannot change their elements. This is a source-value model under the
// standard ambient intrinsics, not proof against an external host replacing built-in prototypes.
import type { CallExpression, Node as MorphNode, Symbol as MorphSymbol, SourceFile } from "ts-morph";
import { Node, SyntaxKind, VariableDeclarationKind } from "ts-morph";
import { inspectReferenceWrites, inspectSymbolWrites, readMemberReference, resolveGlobalMemberOrigin, resolveStableExpression } from "./reference-fact.ts";
import { readStaticAuthoredValue } from "./static-authored-value.ts";

type Value =
  | { readonly kind: "scalar"; readonly value: string | number | boolean | null }
  | { readonly kind: "array"; readonly values: readonly string[]; readonly frozen: boolean }
  | { readonly kind: "object"; readonly keys: readonly string[]; readonly frozen: boolean };

interface ReadState {
  readonly active: Set<object>;
  readonly activeBindings: Set<object>;
  readonly checkedBindings: Map<object, boolean>;
  readonly sources: Set<SourceFile>;
  readonly intrinsicSymbols: Set<MorphSymbol>;
}

function transparentParent(node: MorphNode): MorphNode {
  let current = node;
  for (let parent = current.getParent(); parent !== undefined; parent = current.getParent()) {
    if (
      !(
        (Node.isParenthesizedExpression(parent) || Node.isAsExpression(parent) || Node.isSatisfiesExpression(parent) || Node.isNonNullExpression(parent)) &&
        parent.getExpression() === current
      )
    ) {
      break;
    }
    current = parent;
  }
  return current;
}

/** These two operations are authored semantic choices, not a list of current callers. */
function objectOperation(call: CallExpression, state: ReadState): "freeze" | "keys" | undefined {
  const origin = resolveGlobalMemberOrigin(call.getExpression());
  if (origin.kind !== "resolved" || origin.value.globalName !== "Object" || origin.value.memberPath.length !== 1 || call.getArguments().length !== 1) {
    return;
  }
  for (const declaration of origin.value.declarations) {
    const symbol = declaration.getSymbol();
    if (symbol !== undefined) {
      state.intrinsicSymbols.add(symbol);
    }
  }
  const operation = origin.value.memberPath[0];
  return operation === "freeze" || operation === "keys" ? operation : undefined;
}

function joinReceiver(call: CallExpression, state: ReadState): MorphNode | undefined {
  const member = readMemberReference(call.getExpression());
  if (member.kind !== "resolved" || member.value.name !== "join" || call.getArguments().length > 1) {
    return;
  }
  // The receiver's value is separately proven to be an array from this grammar. ReadonlyArray.join and
  // Array.prototype.join have different checker symbols but share the runtime method. Derive that
  // prototype symbol from the ambient constructor beside the receiver's declaration, then ask the same
  // shared write reader about both symbols. A cast to a lookalike declaration cannot invent this origin.
  const symbol = member.value.receiver.getType().getProperty(member.value.name);
  if (symbol === undefined || inspectSymbolWrites(symbol, member.value.nameNode).kind !== "resolved") {
    return;
  }
  state.intrinsicSymbols.add(symbol);
  const constructors = symbol.getDeclarations().flatMap((declaration) => declaration.getSourceFile().getVariableDeclaration("Array") ?? []);
  const prototypes = constructors.flatMap((arrayConstructor) => {
    const origin = resolveGlobalMemberOrigin(arrayConstructor.getNameNode());
    if (origin.kind !== "resolved" || origin.value.globalName !== "Array" || origin.value.memberPath.length > 0) {
      return [];
    }
    return arrayConstructor.getType().getProperty("prototype")?.getTypeAtLocation(arrayConstructor).getProperty(member.value.name) ?? [];
  });
  for (const prototype of prototypes) {
    state.intrinsicSymbols.add(prototype);
  }
  return prototypes.length > 0 && prototypes.every((prototype) => inspectSymbolWrites(prototype, member.value.nameNode).kind === "resolved")
    ? member.value.receiver
    : undefined;
}

function stringValue(node: MorphNode, state: ReadState): string | undefined {
  const read = readValue(node, state);
  return read?.kind === "scalar" && typeof read.value === "string" ? read.value : undefined;
}

function harmlessUse(reference: MorphNode, state: ReadState): boolean {
  if (reference.getAncestors().some(Node.isTypeNode)) {
    return true;
  }
  const wrapped = transparentParent(reference);
  const parent = wrapped.getParent();
  if (Node.isVariableDeclaration(parent) && parent.getInitializer() === wrapped) {
    return closedBinding(parent.getNameNode(), state);
  }
  if (Node.isCallExpression(parent) && parent.getArguments()[0] === wrapped) {
    return objectOperation(parent, state) !== undefined;
  }
  if (Node.isPropertyAccessExpression(parent) || Node.isElementAccessExpression(parent)) {
    const call = parent.getParent();
    if (Node.isCallExpression(call) && call.getExpression() === parent && joinReceiver(call, state) === wrapped) {
      const separator = call.getArguments()[0];
      return separator === undefined || stringValue(separator, state) !== undefined;
    }
  }
  return false;
}

function closedBinding(name: MorphNode, state: ReadState): boolean {
  if (!Node.isIdentifier(name)) {
    return false;
  }
  const checked = state.checkedBindings.get(name.compilerNode);
  if (checked !== undefined) {
    return checked;
  }
  if (state.activeBindings.has(name.compilerNode)) {
    return false;
  }
  const declaration = name.getParent();
  if (
    !Node.isVariableDeclaration(declaration) ||
    declaration.getVariableStatement()?.isExported() === true ||
    declaration.getParentIfKind(SyntaxKind.VariableDeclarationList)?.getDeclarationKind() !== VariableDeclarationKind.Const ||
    inspectReferenceWrites(name).kind !== "resolved"
  ) {
    return false;
  }
  state.activeBindings.add(name.compilerNode);
  const result = name.findReferencesAsNodes().every((reference) => reference === name || harmlessUse(reference, state));
  state.activeBindings.delete(name.compilerNode);
  state.checkedBindings.set(name.compilerNode, result);
  return result;
}

function closedCollection(node: MorphNode, state: ReadState): boolean {
  const wrapped = transparentParent(node);
  const owner = wrapped.getParent();
  return !(Node.isVariableDeclaration(owner) && owner.getInitializer() === wrapped) || closedBinding(owner.getNameNode(), state);
}

function literalValue(node: MorphNode, state: ReadState): Value | undefined {
  if (Node.isArrayLiteralExpression(node)) {
    const values: string[] = [];
    for (const element of node.getElements()) {
      const text = stringValue(element, state);
      if (text === undefined) {
        return;
      }
      values.push(text);
    }
    return { kind: "array", values, frozen: false };
  }
  const authored = readStaticAuthoredValue(node);
  if (authored.kind !== "resolved") {
    return;
  }
  if (authored.value.kind === "scalar") {
    return { kind: "scalar", value: authored.value.value };
  }
  let object: Value | undefined;
  if (
    authored.value.kind === "object" &&
    Node.isObjectLiteralExpression(node) &&
    !node.getProperties().some(Node.isSpreadAssignment) &&
    authored.value.properties.every((property) => property.value.kind === "scalar")
  ) {
    // Standard property creation supplies both duplicate-key replacement and integer-index ordering.
    // This executes only our inert key records, never an authored initializer or getter.
    object = { kind: "object", keys: Object.keys(Object.fromEntries(authored.value.properties.map(({ key }) => [key, null]))), frozen: false };
  }
  return object;
}

function callValue(call: CallExpression, state: ReadState): Value | undefined {
  const operation = objectOperation(call, state);
  const argument = call.getArguments()[0];
  if (operation !== undefined && argument !== undefined) {
    const input = readValue(argument, state);
    if (input === undefined || input.kind === "scalar") {
      return;
    }
    if (operation === "freeze") {
      return { ...input, frozen: true };
    }
    return input.kind === "object" ? { kind: "array", values: input.keys, frozen: false } : undefined;
  }
  const receiver = joinReceiver(call, state);
  const input = receiver === undefined ? undefined : readValue(receiver, state);
  const separator = argument === undefined ? "," : stringValue(argument, state);
  return input?.kind === "array" && separator !== undefined ? { kind: "scalar", value: input.values.join(separator) } : undefined;
}

function terminalValue(node: MorphNode, state: ReadState): Value | undefined {
  if (Node.isCallExpression(node)) {
    return callValue(node, state);
  }
  if (Node.isBinaryExpression(node) && node.getOperatorToken().getKind() === SyntaxKind.PlusToken) {
    const left = stringValue(node.getLeft(), state);
    const right = stringValue(node.getRight(), state);
    return left === undefined || right === undefined ? undefined : { kind: "scalar", value: left + right };
  }
  if (Node.isTemplateExpression(node)) {
    let value = node.getHead().getLiteralText();
    for (const span of node.getTemplateSpans()) {
      const part = stringValue(span.getExpression(), state);
      if (part === undefined) {
        return;
      }
      value += part + span.getLiteral().getLiteralText();
    }
    return { kind: "scalar", value };
  }
  return literalValue(node, state);
}

function readValue(expression: MorphNode, state: ReadState): Value | undefined {
  const fact = resolveStableExpression(expression);
  if (fact.kind === "unresolved" && fact.reason !== "dynamic") {
    return;
  }
  const node = fact.kind === "resolved" ? fact.value : fact.node;
  for (const source of [expression.getSourceFile(), node.getSourceFile(), ...fact.trace.declarations.map((declaration) => declaration.getSourceFile())]) {
    if (!source.isDeclarationFile()) {
      state.sources.add(source);
    }
  }
  if (state.active.has(node.compilerNode)) {
    return;
  }
  state.active.add(node.compilerNode);
  const value = terminalValue(node, state);
  const result = value === undefined || value.kind === "scalar" || value.frozen || closedCollection(node, state) ? value : undefined;
  state.active.delete(node.compilerNode);
  return result;
}

/** Exact derived string, or unreadable. No result cache survives an invocation or source overwrite. */
export function staticDerivedText(expression: MorphNode): string | undefined {
  const state: ReadState = { active: new Set(), activeBindings: new Set(), checkedBindings: new Map(), sources: new Set(), intrinsicSymbols: new Set() };
  const value = stringValue(expression, state);
  // Producer and consumer files both matter: a helper can replace Array.prototype.join while exporting
  // an otherwise frozen sequence. The same shared symbol-write query runs over every traversed source.
  const unchanged = [...state.intrinsicSymbols].every((symbol) =>
    [...state.sources].every((source) => inspectSymbolWrites(symbol, source).kind === "resolved"),
  );
  return unchanged ? value : undefined;
}
