// Final spelling-independent binding/reference facts for the shared gate runtime.
import type { Identifier, Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind, VariableDeclarationKind } from "ts-morph";
import type {
  GlobalMemberOrigin,
  MemberReference,
  ModuleMemberOrigin,
  ReferenceFact,
  ReferenceResolutionServices,
  ReferenceUnresolvedReason,
  ResolvedReferenceFact,
  UnresolvedReferenceFact,
} from "../contract/reference-fact.ts";
import { resolveGlobalMemberOriginWith } from "./reference-fact-global.ts";
import { readMemberReferenceWith } from "./reference-fact-member.ts";
import { resolveModuleMemberOriginWith } from "./reference-fact-module.ts";
import { lexicalReferenceSymbol, reassignedReferenceSymbols, writtenReferenceSymbols } from "./reference-fact-writes.ts";

interface ResolutionState {
  readonly declarations: MorphNode[];
  readonly visited: Set<object>;
  readonly writtenSymbolsBySource: Map<object, ReadonlySet<object>>;
  readonly reassignedSymbolsBySource: Map<object, ReadonlySet<object>>;
}

type WriteInspection = { readonly kind: "stable" } | { readonly kind: "written" } | { readonly kind: "unsupported"; readonly detail: string };
type WriteScope = "binding" | "value";

// PASS-SCOPED write caches. `state()` used to mint two fresh Maps per identity QUERY, so the file-wide write
// scan (`collectWrites`: every Identifier in the source file + a symbol lookup each) re-ran for every query
// in a file instead of once per file per pass — measured 2026-09-06 as 29 s of a 76 s composed pass over 119
// policies (CPU profile: ts-morph descendant iteration + GC, not the checker). The caches now live for
// exactly one pass: both dispatchers open them with `beginReferencePass` and close them with
// `endReferencePass`; a reader called OUTSIDE a pass (a unit test driving the reader directly) still gets
// fresh per-query maps, so its semantics are unchanged. Keyed by nothing but the open pass — there is one
// pass per invocation and passes never overlap (the dispatcher is synchronous) — so no module-level cache
// survives an invocation and no Project is retained.
interface ReferencePassCaches {
  readonly writtenSymbolsBySource: Map<object, ReadonlySet<object>>;
  readonly reassignedSymbolsBySource: Map<object, ReadonlySet<object>>;
}
let openPass: ReferencePassCaches | undefined;

/** Open the pass-scoped reader caches. Refuses a nested open: passes never overlap. */
export function beginReferencePass(): void {
  if (openPass !== undefined) {
    throw new Error("beginReferencePass: a reference pass is already open — passes never overlap");
  }
  openPass = { writtenSymbolsBySource: new Map(), reassignedSymbolsBySource: new Map() };
}

/** Close the pass-scoped reader caches; every cached set is dropped with the pass. */
export function endReferencePass(): void {
  openPass = undefined;
}

function state(): ResolutionState {
  const caches = openPass ?? { writtenSymbolsBySource: new Map(), reassignedSymbolsBySource: new Map() };
  return {
    declarations: [],
    visited: new Set<object>(),
    writtenSymbolsBySource: caches.writtenSymbolsBySource,
    reassignedSymbolsBySource: caches.reassignedSymbolsBySource,
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
      ? reassignedReferenceSymbols(name.getSourceFile(), target.reassignedSymbolsBySource)
      : writtenReferenceSymbols(name.getSourceFile(), target.writtenSymbolsBySource);
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
  return reassignedReferenceSymbols(identifier.getSourceFile(), target.reassignedSymbolsBySource).has(symbol.compilerSymbol)
    ? unresolved("write", identifier, target, `the binding ${identifier.getText()} is reassigned after its declaration`)
    : resolved(true, target, identifier);
}

/** Refuse when the checker symbol is written anywhere in this authored source file. */
export function inspectSymbolWrites(symbol: import("ts-morph").Symbol, node: MorphNode): ReferenceFact<true> {
  const target = state();
  return writtenReferenceSymbols(node.getSourceFile(), target.writtenSymbolsBySource).has(symbol.compilerSymbol)
    ? unresolved("write", node, target, `the reference ${node.getText()} is assigned or has a member assigned`)
    : resolved(true, target, node);
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

function constInitializer(current: Identifier, declaration: MorphNode, target: ResolutionState): ReferenceFact<MorphNode> {
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
  if (declaration.getParentIfKind(SyntaxKind.VariableDeclarationList)?.getDeclarationKind() !== VariableDeclarationKind.Const) {
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

function resolveStableExpressionInternal(raw: MorphNode, target: ResolutionState): ReferenceFact<MorphNode> {
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
    const initializer = constInitializer(current, declaration.value, target);
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
  const declarations = sourceFile.getExportedDeclarations().get(name) ?? [];
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
  const declaration = node.getSymbol()?.getValueDeclaration();
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
export function readStaticString(node: MorphNode): ReferenceFact<string> {
  const fact = resolveStableExpression(node);
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
export function readStaticNumber(node: MorphNode): ReferenceFact<number> {
  const target = state();
  let current = node;
  let sign = 1;
  for (;;) {
    const fact = resolveStableExpressionInternal(current, target);
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
  const stringFact = readStaticString(node);
  if (stringFact.kind === "resolved") {
    appendTrace(target, stringFact.trace.declarations);
    return resolved(stringFact.value, target, stringFact.trace.origin);
  }
  if (stringFact.reason === "write" || stringFact.reason === "cycle" || stringFact.reason === "ambiguous") {
    return mergeUnresolved(stringFact, target);
  }
  const numberFact = readStaticNumber(node);
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

export function readMemberReference(node: MorphNode): ReferenceFact<MemberReference> {
  return readMemberReferenceWith(node, { unwrapExpression, readComputedName: (member) => computedName(member, state()) });
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
