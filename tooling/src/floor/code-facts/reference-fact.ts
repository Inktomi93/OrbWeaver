// Final spelling-independent binding/reference facts for the shared gate runtime.

import type { Identifier, Node as MorphNode, SourceFile, ts } from "ts-morph";
import { Node, SyntaxKind, VariableDeclarationKind } from "ts-morph";
import { beginNativeReferencePass, endNativeReferencePass, nativeCompilerSourceFiles } from "../compiler/ts-workspace.ts";
import { isDocumentationLinkReference as documentationLinkReference } from "./reference-documentation.ts";
import { lexicalReferenceSymbol } from "./reference-fact-alias.ts";
import type {
  GlobalMemberOrigin,
  InheritedReadEffectContext,
  MemberReference,
  ModuleMemberOrigin,
  ReferenceFact,
  ReferenceResolutionServices,
  ReferenceUnresolvedReason,
  ResolvedReferenceFact,
  SourceWriteFacts,
  UnresolvedReferenceFact,
} from "./reference-fact-contract.ts";
import { resolveGlobalMemberOriginWith } from "./reference-fact-global.ts";
import { readMemberAccessWith, readMemberReferenceWith } from "./reference-fact-member.ts";
import { resolveModuleMemberOriginWith } from "./reference-fact-module.ts";
import { sourceWriteFacts } from "./reference-fact-writes.ts";
import { inventoryExports } from "./semantic-inventory-reader.ts";

interface ResolutionState {
  readonly declarations: MorphNode[];
  readonly visited: Set<object>;
  readonly writesBySource: Map<object, SourceWriteFacts>;
}

type WriteInspection = { readonly kind: "stable" } | { readonly kind: "written" } | { readonly kind: "unsupported"; readonly detail: string };
type WriteScope = "binding" | "value";

// Native source effects share one invocation lifetime; standalone readers keep fresh query-local facts.
// Program-keyed inherited-read projections cannot outlive the source/write cache that supplied them.
interface ReferencePassCaches {
  readonly writesBySource: Map<object, SourceWriteFacts>;
  readonly inheritedReads: Map<ts.Program, readonly MorphNode[]>;
  writeProgram?: ts.Program;
}
let openPass: ReferencePassCaches | undefined;

/** Open the pass-scoped reader caches. Refuses a nested open: passes never overlap. */
export function beginReferencePass(): void {
  if (openPass !== undefined) {
    throw new Error("beginReferencePass: a reference pass is already open — passes never overlap");
  }
  beginNativeReferencePass();
  openPass = { writesBySource: new Map(), inheritedReads: new Map() };
}

/** Close the pass-scoped reader caches; every cached set is dropped with the pass. */
export function endReferencePass(): void {
  try {
    endNativeReferencePass();
  } finally {
    openPass = undefined;
  }
}

function state(): ResolutionState {
  const caches = openPass ?? { writesBySource: new Map() };
  return {
    declarations: [],
    visited: new Set<object>(),
    writesBySource: caches.writesBySource,
  };
}

function appendDeclaration(target: ResolutionState, declaration: MorphNode): void {
  if (!target.declarations.some((existing) => existing.compilerNode === declaration.compilerNode)) {
    target.declarations.push(declaration);
  }
}

function appendTrace(target: ResolutionState, declarations: readonly MorphNode[]): void {
  for (const declaration of declarations) {
    appendDeclaration(target, declaration);
  }
}

function enterDeclaration(target: ResolutionState, declaration: MorphNode): boolean {
  const identity: object = declaration.compilerNode;
  if (target.visited.has(identity)) {
    return false;
  }
  target.visited.add(identity);
  appendDeclaration(target, declaration);
  return true;
}

function resolved<T>(value: T, target: ResolutionState, origin: MorphNode): ResolvedReferenceFact<T> {
  return { kind: "resolved", value, trace: { declarations: [...target.declarations], origin } };
}

function unresolved(reason: ReferenceUnresolvedReason, node: MorphNode, target: ResolutionState, detail: string): UnresolvedReferenceFact {
  return { kind: "unresolved", reason, detail, node, trace: { declarations: [...target.declarations], origin: node } };
}

function mergeUnresolved(fact: UnresolvedReferenceFact, target: ResolutionState): UnresolvedReferenceFact {
  appendTrace(target, fact.trace.declarations);
  return unresolved(fact.reason, fact.node, target, fact.detail);
}

function unwrapExpression(node: MorphNode): MorphNode {
  let current = node;
  while (Node.isParenthesizedExpression(current) || Node.isAsExpression(current) || Node.isSatisfiesExpression(current) || Node.isNonNullExpression(current)) {
    current = current.getExpression();
  }
  return current;
}

function isDynamicTerminal(node: MorphNode): boolean {
  return (
    Node.isCallExpression(node) ||
    Node.isNewExpression(node) ||
    Node.isAwaitExpression(node) ||
    Node.isYieldExpression(node) ||
    Node.isTaggedTemplateExpression(node) ||
    Node.isTemplateExpression(node) ||
    Node.isPropertyAccessExpression(node) ||
    Node.isElementAccessExpression(node) ||
    Node.isConditionalExpression(node) ||
    Node.isBinaryExpression(node) ||
    Node.isPostfixUnaryExpression(node)
  );
}

function bindingNameNode(declaration: MorphNode): MorphNode | undefined {
  let name: MorphNode | undefined;
  if (Node.isVariableDeclaration(declaration) || Node.isBindingElement(declaration)) {
    name = declaration.getNameNode();
  } else if (Node.isImportSpecifier(declaration)) {
    name = declaration.getAliasNode() ?? declaration.getNameNode();
  } else if (Node.isNamespaceImport(declaration)) {
    name = declaration.getNameNode();
  } else if (Node.isImportClause(declaration)) {
    name = declaration.getDefaultImport();
  }
  return name;
}

function inspectWrites(declaration: MorphNode, target: ResolutionState, scope: WriteScope): WriteInspection {
  const name = bindingNameNode(declaration);
  if (name === undefined || !Node.isIdentifier(name)) {
    return { kind: "unsupported", detail: `ts-morph cannot enumerate writes for ${declaration.getKindName()}` };
  }
  const symbol = lexicalReferenceSymbol(name);
  if (symbol === undefined) {
    return { kind: "unsupported", detail: `ts-morph cannot resolve the binding symbol for ${name.getText()}` };
  }
  const written =
    scope === "binding"
      ? sourceWriteFacts(name.getSourceFile(), target.writesBySource).reassigned
      : sourceWriteFacts(name.getSourceFile(), target.writesBySource).written;
  return written.has(symbol.compilerSymbol) ? { kind: "written" } : { kind: "stable" };
}

/** Refuse when this lexical symbol is assigned, updated, deleted, or used as the root of a member write. */
export function inspectReferenceWrites(identifier: Identifier): ReferenceFact<true> {
  const symbol = lexicalReferenceSymbol(identifier);
  return symbol === undefined
    ? unresolved("missing", identifier, state(), `no lexical symbol binds ${identifier.getText()}`)
    : inspectSymbolWrites(symbol, identifier);
}

/** Refuse when this lexical BINDING is reassigned, updated or deleted in its authored source file.
 *
 *  The binding-scope twin of `inspectReferenceWrites`, which is value-scope. The distinction is the whole
 *  reason both exist: a member mutation (`f.cache = x`) changes the VALUE and leaves the DECLARATION the
 *  name denotes untouched, so a reader asking "which declaration is this" must not refuse on it, while a
 *  reader asking "what does this hold" must. Shares the open pass's write caches, so the file-wide scan
 *  still happens once per file per pass. */
export function inspectBindingReassignment(identifier: Identifier): ReferenceFact<true> {
  const target = state();
  const symbol = lexicalReferenceSymbol(identifier);
  if (symbol === undefined) {
    return unresolved("missing", identifier, target, `no lexical symbol binds ${identifier.getText()}`);
  }
  return sourceWriteFacts(identifier.getSourceFile(), target.writesBySource).reassigned.has(symbol.compilerSymbol)
    ? unresolved("write", identifier, target, `the binding ${identifier.getText()} is reassigned after its declaration`)
    : resolved(true, target, identifier);
}

/** Refuse when the checker symbol is written anywhere in this authored source file. */
export function inspectSymbolWrites(symbol: import("ts-morph").Symbol, node: MorphNode): ReferenceFact<true> {
  const target = state();
  return sourceWriteFacts(node.getSourceFile(), target.writesBySource).written.has(symbol.compilerSymbol)
    ? unresolved("write", node, target, `the reference ${node.getText()} is assigned or has a member assigned`)
    : resolved(true, target, node);
}

function observedWithoutTransfer(node: MorphNode): boolean {
  let current = node;
  while (Node.isParenthesizedExpression(current.getParent()) || Node.isAsExpression(current.getParent()) || Node.isNonNullExpression(current.getParent())) {
    const parent = current.getParent();
    if (parent === undefined) {
      return false;
    }
    current = parent;
  }
  const parent = current.getParent();
  return (
    Node.isTypeOfExpression(parent) ||
    Node.isVoidExpression(parent) ||
    (Node.isBinaryExpression(parent) &&
      [SyntaxKind.EqualsEqualsEqualsToken, SyntaxKind.ExclamationEqualsEqualsToken].includes(parent.getOperatorToken().getKind()))
  );
}

function freshEffectValue(source: import("./reference-fact-contract.ts").ReturnedValueSource): boolean {
  return (
    source.present &&
    source.path.length === 0 &&
    (Node.isObjectLiteralExpression(source.value) ||
      Node.isArrayLiteralExpression(source.value) ||
      Node.isFunctionDeclaration(source.value) ||
      Node.isFunctionExpression(source.value) ||
      Node.isArrowFunction(source.value) ||
      Node.isStringLiteral(source.value) ||
      Node.isNumericLiteral(source.value) ||
      [SyntaxKind.NullKeyword, SyntaxKind.TrueKeyword, SyntaxKind.FalseKeyword].includes(source.value.getKind()))
  );
}

function freshEffectTarget(node: MorphNode | undefined, context: InheritedReadEffectContext): boolean {
  if (node === undefined) {
    return false;
  }
  const value = context.values(node, [], new Map());
  return value.kind === "resolved" && value.value.length > 0 && value.value.every(freshEffectValue);
}

function authoredEffectCallable(source: import("./reference-fact-contract.ts").ReturnedValueSource): boolean {
  return (
    source.present &&
    source.path.length === 0 &&
    (Node.isArrowFunction(source.value) || Node.isFunctionExpression(source.value) || Node.isFunctionDeclaration(source.value)) &&
    source.value.getBody() !== undefined
  );
}

function projectedEffectValue(
  member: MorphNode,
  context: InheritedReadEffectContext,
  accepts: (source: import("./reference-fact-contract.ts").ReturnedValueSource) => boolean = freshEffectValue,
): boolean {
  if (!(Node.isPropertyAccessExpression(member) || Node.isElementAccessExpression(member))) {
    return false;
  }
  if (Node.isPropertyAccessExpression(member)) {
    const value = context.values(member.getExpression(), [member.getName()], new Map());
    return value.kind === "resolved" && value.value.length > 0 && value.value.every(accepts);
  }
  const expression = member.getArgumentExpression();
  if (expression === undefined) {
    return false;
  }
  const keys = context.values(expression, [], new Map());
  if (keys.kind === "unresolved" || keys.value.length === 0) {
    return false;
  }
  return keys.value.every((key) => {
    if (!key.present || key.path.length > 0) {
      return false;
    }
    const string = readStaticString(key.value);
    const number = string.kind === "resolved" ? undefined : readStaticNumber(key.value);
    let name: string | undefined;
    if (string.kind === "resolved") {
      name = string.value;
    } else if (number?.kind === "resolved") {
      name = String(number.value);
    }
    if (name === undefined) {
      return false;
    }
    const value = context.values(member.getExpression(), [name], key.bindings);
    return value.kind === "resolved" && value.value.length > 0 && value.value.every(accepts);
  });
}

function inheritedReadEffect(input: MorphNode, context: InheritedReadEffectContext): MorphNode | undefined {
  if (observedWithoutTransfer(input)) {
    return;
  }
  const call = input.getParent();
  if (!Node.isCallExpression(call) || call.getExpression() !== input) {
    return projectedEffectValue(input, context) ? undefined : input;
  }
  const origin = resolveGlobalMemberOrigin(input);
  if (origin.kind === "unresolved" || !["Object", "Reflect"].includes(origin.value.globalName) || origin.value.memberPath.length !== 1) {
    // Actual authored callees remain subject to the complete Project's body and parameter effect sites.
    return projectedEffectValue(input, context, authoredEffectCallable) ? undefined : input;
  }
  const member = origin.value.memberPath[0];
  switch (member) {
    case "keys":
    case "values":
    case "entries":
    case "getOwnPropertyNames":
    case "getOwnPropertySymbols":
    case "ownKeys":
    case "hasOwn":
    case "has":
    case "is":
    case "isExtensible":
    case "isFrozen":
    case "isSealed":
    case "freeze":
    case "seal":
    case "preventExtensions":
      return;
    case "getPrototypeOf":
      return observedWithoutTransfer(call) ? undefined : input;
    case "assign":
    case "defineProperty":
    case "defineProperties":
    case "setPrototypeOf":
    case "set":
    case "deleteProperty":
      return freshEffectTarget(call.getArguments()[0], context) ? undefined : input;
    case undefined:
    default:
      return input;
  }
}

function collectInheritedReadInputs(sources: readonly SourceFile[], writes: Map<object, SourceWriteFacts>): readonly MorphNode[] {
  return sources.flatMap((source) => (source.isDeclarationFile() ? [] : sourceWriteFacts(source, writes).inheritedReads));
}

/** Project source effects are neutral facts; every projection retains actual captured binding dependencies. */
export function inspectInheritedReadEffects(node: MorphNode, context: InheritedReadEffectContext): ReferenceFact<true> {
  const target = state();
  if (node.wasForgotten()) {
    return unresolved("unsupported", node, target, "inherited read input belongs to a forgotten source");
  }
  const project = node.getProject();
  const program = project.getProgram().compilerObject;
  if (context.program.program !== program || program.getSourceFile(node.getSourceFile().getFilePath()) !== node.getSourceFile().compilerNode) {
    return unresolved("unsupported", node, target, "inherited read input is not the captured native Project source");
  }
  if (openPass !== undefined && openPass.writeProgram !== program) {
    openPass.writesBySource.clear();
    openPass.writeProgram = program;
  }
  const cached = openPass?.inheritedReads.get(program);
  const inputs = cached ?? collectInheritedReadInputs(nativeCompilerSourceFiles(project), target.writesBySource);
  if (cached === undefined) {
    openPass?.inheritedReads.set(program, inputs);
  }
  for (const input of inputs) {
    if (input.wasForgotten()) {
      return unresolved("unsupported", node, target, "an inherited effect source was forgotten");
    }
    const effect = inheritedReadEffect(input, context);
    if (effect !== undefined) {
      return unresolved("unsupported", effect, target, "the loaded Project contains an unclosed inherited descriptor or prototype exposure");
    }
  }
  return !node.wasForgotten() && project.getProgram().compilerObject === program
    ? resolved(true, target, node)
    : unresolved("unsupported", node, target, "native Project changed while projecting inherited read effects");
}

function uniqueDeclaration(identifier: Identifier, target: ResolutionState): ReferenceFact<MorphNode> {
  const symbol = lexicalReferenceSymbol(identifier);
  if (symbol === undefined) {
    return unresolved("missing", identifier, target, `no lexical symbol binds ${identifier.getText()}`);
  }
  const declarations = symbol.getDeclarations();
  if (declarations.length === 0) {
    return unresolved("missing", identifier, target, `the symbol for ${identifier.getText()} has no declaration`);
  }
  if (declarations.length !== 1) {
    return unresolved("ambiguous", identifier, target, `the symbol for ${identifier.getText()} has ${declarations.length} declarations`);
  }
  const declaration = declarations[0];
  return declaration === undefined
    ? unresolved("missing", identifier, target, `the symbol for ${identifier.getText()} has no declaration`)
    : resolved(declaration, target, declaration);
}

function writtenBinding(declaration: MorphNode, target: ResolutionState, scope: WriteScope): UnresolvedReferenceFact | undefined {
  const inspection = inspectWrites(declaration, target, scope);
  let fact: UnresolvedReferenceFact | undefined;
  if (inspection.kind === "written") {
    fact = unresolved("write", declaration, target, `the binding ${declaration.getText()} is reassigned or updated`);
  } else if (inspection.kind === "unsupported") {
    fact = unresolved("unsupported", declaration, target, inspection.detail);
  }
  return fact;
}

function importedTarget(current: Identifier, declaration: import("ts-morph").ImportSpecifier, target: ResolutionState): ReferenceFact<MorphNode> {
  if (!enterDeclaration(target, declaration)) {
    return unresolved("cycle", declaration, target, `import alias cycle at ${declaration.getText()}`);
  }
  const importWrite = writtenBinding(declaration, target, "binding");
  if (importWrite !== undefined) {
    return importWrite;
  }
  const targets = lexicalReferenceSymbol(current)?.getAliasedSymbol()?.getDeclarations() ?? [];
  if (targets.length === 0) {
    return unresolved("missing", declaration, target, `the imported binding ${current.getText()} has no resolvable declaration`);
  }
  if (targets.length !== 1) {
    return unresolved("ambiguous", declaration, target, `the imported binding ${current.getText()} resolves to ${targets.length} declarations`);
  }
  const targetDeclaration = targets[0];
  return targetDeclaration === undefined
    ? unresolved("missing", declaration, target, `the imported binding ${current.getText()} has no resolvable declaration`)
    : resolved(targetDeclaration, target, targetDeclaration);
}

/** Which bindings a stable read follows: `const`, or also a `let` the file never reassigns (a member key). */
export type StableBindings = "const" | "unreassigned";

function constInitializer(current: Identifier, declaration: MorphNode, target: ResolutionState, bindings: StableBindings): ReferenceFact<MorphNode> {
  if (!Node.isVariableDeclaration(declaration)) {
    if (Node.isParameterDeclaration(declaration)) {
      return unresolved("missing", declaration, target, `parameter ${current.getText()} has no stable initializer`);
    }
    if (Node.isBindingElement(declaration)) {
      return unresolved("dynamic", declaration, target, `destructured binding ${current.getText()} depends on its runtime receiver`);
    }
    return unresolved("unsupported", declaration, target, `${declaration.getKindName()} is not a const alias declaration`);
  }
  if (!enterDeclaration(target, declaration)) {
    return unresolved("cycle", declaration, target, `const alias cycle at ${declaration.getName()}`);
  }
  const kind = declaration.getParentIfKind(SyntaxKind.VariableDeclarationList)?.getDeclarationKind();
  if (kind !== VariableDeclarationKind.Const && !(bindings === "unreassigned" && kind === VariableDeclarationKind.Let)) {
    return unresolved("write", declaration, target, `binding ${declaration.getName()} is mutable`);
  }
  const write = writtenBinding(declaration, target, "binding");
  if (write !== undefined) {
    return write;
  }
  const initializer = declaration.getInitializer();
  return initializer === undefined
    ? unresolved("missing", declaration, target, `const binding ${declaration.getName()} has no initializer`)
    : resolved(initializer, target, initializer);
}

function resolveStableExpressionInternal(raw: MorphNode, target: ResolutionState, bindings: StableBindings = "const"): ReferenceFact<MorphNode> {
  let current = unwrapExpression(raw);
  while (Node.isIdentifier(current)) {
    const binding = uniqueDeclaration(current, target);
    if (binding.kind === "unresolved") {
      return binding;
    }
    const declaration = Node.isImportSpecifier(binding.value) ? importedTarget(current, binding.value, target) : binding;
    if (declaration.kind === "unresolved") {
      return declaration;
    }
    const initializer = constInitializer(current, declaration.value, target, bindings);
    if (initializer.kind === "unresolved") {
      return initializer;
    }
    current = unwrapExpression(initializer.value);
  }
  return isDynamicTerminal(current)
    ? unresolved("dynamic", current, target, `${current.getKindName()} depends on runtime evaluation`)
    : resolved(current, target, current);
}

/** Every declaration published under one module export, retaining overloads and merged declarations.
 *  Re-export aliases name their declaring source; no initializer is followed and no first declaration
 *  stands in for the set. Consumers decide whether a home requires one declaration or all of them. */
export function resolveExportedDeclarations(sourceFile: SourceFile, name: string): ReferenceFact<readonly MorphNode[]> {
  const target = state();
  const declarations = inventoryExports(sourceFile).get(name) ?? [];
  if (declarations.length === 0) {
    return unresolved("missing", sourceFile, target, `module ${sourceFile.getFilePath()} exports no declaration named ${name}`);
  }
  appendTrace(target, declarations);
  return resolved(declarations, target, sourceFile);
}

/** The checker-selected VALUE declaration of this lexical reference, without following an import target
 *  or initializer. Scope consumers need the authored binding even when it is mutable, a parameter, or
 *  part of a merged symbol; stable-value resolution answers a different question. A type-only symbol or
 *  an import alias with no lexical value declaration refuses explicitly. */
export function resolveLexicalValueDeclaration(node: MorphNode): ReferenceFact<MorphNode> {
  const target = state();
  const symbol = Node.isIdentifier(node) ? lexicalReferenceSymbol(node) : node.getSymbol();
  const declaration = symbol?.getValueDeclaration();
  if (declaration === undefined) {
    return unresolved("missing", node, target, `no lexical value declaration binds ${node.getText()}`);
  }
  appendDeclaration(target, declaration);
  return resolved(declaration, target, declaration);
}

/** Resolve stable bindings to their source expression; origin/value readers separately refuse member effects. */
export function resolveStableExpression(node: MorphNode): ReferenceFact<MorphNode> {
  return resolveStableExpressionInternal(node, state());
}

/** Read a static string through the shared stable-binding resolver. */
export function readStaticString(node: MorphNode, bindings: StableBindings = "const"): ReferenceFact<string> {
  const fact = resolveStableExpressionInternal(node, state(), bindings);
  if (fact.kind === "unresolved") {
    return fact;
  }
  const terminal = unwrapExpression(fact.value);
  const target = state();
  appendTrace(target, fact.trace.declarations);
  if (Node.isStringLiteral(terminal) || Node.isNoSubstitutionTemplateLiteral(terminal)) {
    return resolved(terminal.getLiteralText(), target, terminal);
  }
  return unresolved("unsupported", terminal, target, `${terminal.getKindName()} is not a static string`);
}

/** Read a static number, including unary signs, through the shared stable-binding resolver. */
export function readStaticNumber(node: MorphNode, bindings: StableBindings = "const"): ReferenceFact<number> {
  const target = state();
  let current = node;
  let sign = 1;
  for (;;) {
    const fact = resolveStableExpressionInternal(current, target, bindings);
    if (fact.kind === "unresolved") {
      return fact;
    }
    const terminal = unwrapExpression(fact.value);
    if (Node.isNumericLiteral(terminal)) {
      return resolved(sign * terminal.getLiteralValue(), target, terminal);
    }
    if (!Node.isPrefixUnaryExpression(terminal)) {
      return unresolved("unsupported", terminal, target, `${terminal.getKindName()} is not a static number`);
    }
    const operator = terminal.getOperatorToken();
    if (operator !== SyntaxKind.PlusToken && operator !== SyntaxKind.MinusToken) {
      return unresolved("unsupported", terminal, target, `${terminal.getKindName()} does not carry a numeric sign`);
    }
    if (operator === SyntaxKind.MinusToken) {
      sign *= -1;
    }
    current = terminal.getOperand();
  }
}

function computedName(node: MorphNode, target: ResolutionState): ReferenceFact<string> {
  const stringFact = readStaticString(node, "unreassigned");
  if (stringFact.kind === "resolved") {
    appendTrace(target, stringFact.trace.declarations);
    return resolved(stringFact.value, target, stringFact.trace.origin);
  }
  if (stringFact.reason === "write" || stringFact.reason === "cycle" || stringFact.reason === "ambiguous") {
    return mergeUnresolved(stringFact, target);
  }
  const numberFact = readStaticNumber(node, "unreassigned");
  if (numberFact.kind === "resolved") {
    appendTrace(target, numberFact.trace.declarations);
    return resolved(String(numberFact.value), target, numberFact.trace.origin);
  }
  if (numberFact.reason === "write" || numberFact.reason === "cycle" || numberFact.reason === "ambiguous") {
    return mergeUnresolved(numberFact, target);
  }
  appendTrace(target, stringFact.trace.declarations);
  return unresolved("dynamic", node, target, `computed key ${node.getText()} does not resolve to one static property name`);
}

/** Demand only when the canonical transparent/unary grammar can reach a lexical binding. */
export function computedNameNeedsBindings(node: MorphNode): boolean {
  let current = unwrapExpression(node);
  while (
    Node.isPrefixUnaryExpression(current) &&
    (current.getOperatorToken() === SyntaxKind.PlusToken || current.getOperatorToken() === SyntaxKind.MinusToken)
  ) {
    current = unwrapExpression(current.getOperand());
  }
  return Node.isIdentifier(current);
}

/** Key demands on a delivered callee/receiver chain; arguments and unrelated subtrees are not walked. */
export function computedMemberNameInputs(node: MorphNode): readonly MorphNode[] {
  const keys: MorphNode[] = [];
  let current = node;
  for (;;) {
    if (Node.isElementAccessExpression(current)) {
      const key = current.getArgumentExpression();
      if (key !== undefined && computedNameNeedsBindings(key)) {
        keys.push(key);
      }
      current = current.getExpression();
    } else if (Node.isPropertyAccessExpression(current) || Node.isCallExpression(current)) {
      current = current.getExpression();
    } else if (Node.isTaggedTemplateExpression(current)) {
      current = current.getTag();
    } else {
      return keys;
    }
  }
}

export function readMemberReference(node: MorphNode): ReferenceFact<MemberReference> {
  return readMemberReferenceWithName(node, (member) => computedName(member, state()));
}

/** Preserve the canonical member/read grammar while injecting sealed computed-name facts. */
export function readMemberReferenceWithName(
  node: MorphNode,
  readComputedName: ReferenceResolutionServices["readComputedName"],
): ReferenceFact<MemberReference> {
  return readMemberReferenceWith(node, { unwrapExpression, readComputedName });
}

/** Read a static member's syntax, including assignment, update and delete targets; identity is separate. */
export function readMemberAccess(
  node: MorphNode,
  readComputedName: ReferenceResolutionServices["readComputedName"] = (member) => computedName(member, state()),
): ReferenceFact<MemberReference> {
  return readMemberAccessWith(node, { unwrapExpression, readComputedName });
}

/** The member `node` itself reads in any of the three spellings (`x.foo`, `x?.foo`, `x["foo"]`), or undefined
 *  when it names no ONE static member. Callers needing the refusal reason or a wrapped access use `readMemberAccess`. */
export function staticMemberAccess(node: MorphNode, readComputedName?: ReferenceResolutionServices["readComputedName"]): MemberReference | undefined {
  const fact = Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node) ? readMemberAccess(node, readComputedName) : undefined;
  return fact?.kind === "resolved" ? fact.value : undefined;
}

/** A JSDoc link is documentation rather than a code or type reference. */
export function isDocumentationLinkReference(node: MorphNode): boolean {
  return documentationLinkReference(node);
}

/** Read only authored member spelling; constant bindings, wrappers and numeric keys remain outside this door. */
export function literalMemberAccess(node: MorphNode, includeTemplates = false): MemberReference | undefined {
  if (!(Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node))) {
    return;
  }
  const fact = readMemberAccessWith(node, {
    unwrapExpression: (expression) => expression,
    readComputedName: (key): ReferenceFact<string> => {
      const target = state();
      return Node.isStringLiteral(key) || (includeTemplates && Node.isNoSubstitutionTemplateLiteral(key))
        ? resolved(key.getLiteralText(), target, key)
        : unresolved("unsupported", key, target, "computed member key is not an admitted authored string literal");
    },
  });
  return fact.kind === "resolved" ? fact.value : undefined;
}

/** A string-literal type index, distinct from a runtime member expression or constant-origin read. */
export function literalTypeIndex(node: MorphNode): string | undefined {
  if (!Node.isLiteralTypeNode(node)) {
    return;
  }
  const literal = node.getLiteral();
  return Node.isStringLiteral(literal) ? literal.getLiteralText() : undefined;
}

function declarationOf(identifier: Identifier): ReferenceFact<MorphNode> {
  return uniqueDeclaration(identifier, state());
}

function inspectStableBinding(declaration: MorphNode): ReferenceFact<true> {
  const target = state();
  if (!enterDeclaration(target, declaration)) {
    return unresolved("cycle", declaration, target, `binding cycle at ${declaration.getText()}`);
  }
  let owner: import("ts-morph").VariableDeclaration | undefined;
  if (Node.isBindingElement(declaration)) {
    owner = declaration.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  } else if (Node.isVariableDeclaration(declaration)) {
    owner = declaration;
  }
  if (owner !== undefined && owner.getParentIfKind(SyntaxKind.VariableDeclarationList)?.getDeclarationKind() !== VariableDeclarationKind.Const) {
    return unresolved("write", declaration, target, `binding ${declaration.getText()} is mutable`);
  }
  if (owner === undefined && !Node.isImportSpecifier(declaration) && !Node.isNamespaceImport(declaration) && !Node.isImportClause(declaration)) {
    return unresolved("unsupported", declaration, target, `${declaration.getKindName()} is not an immutable binding`);
  }
  const write = writtenBinding(declaration, target, "value");
  return write ?? resolved(true, target, declaration);
}

export const referenceResolutionServices = {
  unwrapExpression,
  declarationOf,
  inspectStableBinding,
  inspectReferenceWrites,
  inspectSymbolWrites,
  readComputedName: (node: MorphNode): ReferenceFact<string> => computedName(node, state()),
  readMemberReference,
} satisfies ReferenceResolutionServices;

/** Resolve a reference to its module export through aliases, namespaces, re-exports, and destructuring. */
export function resolveModuleMemberOrigin(node: MorphNode): ReferenceFact<ModuleMemberOrigin> {
  return resolveModuleMemberOriginWith(node, referenceResolutionServices);
}

/** Resolve a checker-proven ambient global through immutable aliases, members, and destructuring. */
export function resolveGlobalMemberOrigin(node: MorphNode): ReferenceFact<GlobalMemberOrigin> {
  return resolveGlobalMemberOriginWith(node, referenceResolutionServices);
}
