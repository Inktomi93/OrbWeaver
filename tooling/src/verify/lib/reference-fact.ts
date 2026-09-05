// Final spelling-independent binding/reference facts for the shared gate runtime.
import type { Identifier, Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind, VariableDeclarationKind } from "ts-morph";
import type {
  MemberReference,
  ModuleMemberOrigin,
  ReferenceFact,
  ReferenceResolutionServices,
  ReferenceUnresolvedReason,
  ResolvedReferenceFact,
  UnresolvedReferenceFact,
} from "../contract/reference-fact.ts";
import { resolveModuleMemberOriginWith } from "./reference-fact-module.ts";

interface ResolutionState {
  readonly declarations: MorphNode[];
  readonly visited: Set<object>;
  readonly writtenSymbolsBySource: Map<object, ReadonlySet<object>>;
}

type WriteInspection = { readonly kind: "stable" } | { readonly kind: "written" } | { readonly kind: "unsupported"; readonly detail: string };

function state(): ResolutionState {
  return { declarations: [], visited: new Set<object>(), writtenSymbolsBySource: new Map<object, ReadonlySet<object>>() };
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
  }
  return name;
}

function isDeclarationName(node: MorphNode): boolean {
  const parent = node.getParent();
  if (parent === undefined) {
    return false;
  }
  if (Node.isVariableDeclaration(parent) || Node.isBindingElement(parent) || Node.isParameterDeclaration(parent) || Node.isNamespaceImport(parent)) {
    return parent.getNameNode() === node;
  }
  if (Node.isImportSpecifier(parent) || Node.isExportSpecifier(parent)) {
    return parent.getNameNode() === node || parent.getAliasNode() === node;
  }
  return false;
}

function isTransparentWriteWrapper(parent: MorphNode, child: MorphNode): boolean {
  return (
    (Node.isParenthesizedExpression(parent) || Node.isAsExpression(parent) || Node.isSatisfiesExpression(parent) || Node.isNonNullExpression(parent)) &&
    parent.getExpression() === child
  );
}

function isAssignmentContainer(parent: MorphNode, child: MorphNode): boolean {
  if (Node.isArrayLiteralExpression(parent)) {
    return parent.getElements().some((element) => element.compilerNode === child.compilerNode);
  }
  if (Node.isObjectLiteralExpression(parent)) {
    return parent.getProperties().some((property) => property.compilerNode === child.compilerNode);
  }
  if (Node.isPropertyAssignment(parent)) {
    return parent.getInitializer() === child;
  }
  if (Node.isShorthandPropertyAssignment(parent)) {
    return parent.getNameNode() === child;
  }
  return (Node.isSpreadAssignment(parent) || Node.isSpreadElement(parent)) && parent.getExpression() === child;
}

function isDirectWriteTarget(parent: MorphNode, child: MorphNode): boolean {
  if (Node.isBinaryExpression(parent) && parent.getLeft() === child) {
    const operator = parent.getOperatorToken().getKind();
    return operator >= SyntaxKind.FirstAssignment && operator <= SyntaxKind.LastAssignment;
  }
  if ((Node.isPrefixUnaryExpression(parent) || Node.isPostfixUnaryExpression(parent)) && parent.getOperand() === child) {
    const operator = parent.getOperatorToken();
    return operator === SyntaxKind.PlusPlusToken || operator === SyntaxKind.MinusMinusToken;
  }
  return (
    (Node.isDeleteExpression(parent) && parent.getExpression() === child) ||
    ((Node.isForInStatement(parent) || Node.isForOfStatement(parent)) && parent.getInitializer() === child)
  );
}

function isWriteTarget(node: MorphNode): boolean {
  let current = node;
  let parent = current.getParent();
  while (parent !== undefined && (isTransparentWriteWrapper(parent, current) || isAssignmentContainer(parent, current))) {
    current = parent;
    parent = current.getParent();
  }
  return parent !== undefined && isDirectWriteTarget(parent, current);
}

function writtenSymbols(sourceFile: SourceFile, target: ResolutionState): ReadonlySet<object> {
  const key: object = sourceFile.compilerNode;
  const cached = target.writtenSymbolsBySource.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const symbols = new Set<object>();
  for (const identifier of sourceFile.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (isDeclarationName(identifier) || !isWriteTarget(identifier)) {
      continue;
    }
    const symbol = identifier.getSymbol();
    if (symbol !== undefined) {
      symbols.add(symbol.compilerSymbol);
    }
  }
  target.writtenSymbolsBySource.set(key, symbols);
  return symbols;
}

function inspectWrites(declaration: MorphNode, target: ResolutionState): WriteInspection {
  const name = bindingNameNode(declaration);
  if (name === undefined || !Node.isIdentifier(name)) {
    return { kind: "unsupported", detail: `ts-morph cannot enumerate writes for ${declaration.getKindName()}` };
  }
  const symbol = name.getSymbol();
  if (symbol === undefined) {
    return { kind: "unsupported", detail: `ts-morph cannot resolve the binding symbol for ${name.getText()}` };
  }
  return writtenSymbols(name.getSourceFile(), target).has(symbol.compilerSymbol) ? { kind: "written" } : { kind: "stable" };
}

function uniqueDeclaration(identifier: Identifier, target: ResolutionState): ReferenceFact<MorphNode> {
  const symbol = identifier.getSymbol();
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

function writtenBinding(declaration: MorphNode, target: ResolutionState): UnresolvedReferenceFact | undefined {
  const inspection = inspectWrites(declaration, target);
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
  const importWrite = writtenBinding(declaration, target);
  if (importWrite !== undefined) {
    return importWrite;
  }
  const targets = current.getSymbol()?.getAliasedSymbol()?.getDeclarations() ?? [];
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
  const write = writtenBinding(declaration, target);
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

/** Resolve wrappers and immutable aliases to one terminal expression, or return the exact refusal. */
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
  if (Node.isStringLiteral(terminal) || Node.isNoSubstitutionTemplateLiteral(terminal)) {
    const target: ResolutionState = { declarations: [...fact.trace.declarations], visited: new Set<object>(), writtenSymbolsBySource: new Map() };
    return resolved(terminal.getLiteralText(), target, terminal);
  }
  const target: ResolutionState = { declarations: [...fact.trace.declarations], visited: new Set<object>(), writtenSymbolsBySource: new Map() };
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

/** Normalize dotted, optional, and computed-literal property reads into one fact. */
export function readMemberReference(node: MorphNode): ReferenceFact<MemberReference> {
  const access = unwrapExpression(node);
  const target = state();
  if ((Node.isPropertyAccessExpression(access) || Node.isElementAccessExpression(access)) && isWriteTarget(access)) {
    return unresolved("write", access, target, `member ${access.getText()} is an assignment, update, or delete target`);
  }
  if (Node.isPropertyAccessExpression(access)) {
    const nameNode = access.getNameNode();
    return resolved({ name: access.getName(), receiver: access.getExpression(), nameNode, access }, target, nameNode);
  }
  if (!Node.isElementAccessExpression(access)) {
    return unresolved("unsupported", access, target, `${access.getKindName()} is not a member access`);
  }
  const argument = access.getArgumentExpression();
  if (argument === undefined) {
    return unresolved("missing", access, target, "element access has no key expression");
  }
  const name = computedName(argument, target);
  if (name.kind === "unresolved") {
    return name;
  }
  return resolved({ name: name.value, receiver: access.getExpression(), nameNode: argument, access }, target, name.trace.origin);
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
  if (owner === undefined && !Node.isImportSpecifier(declaration) && !Node.isNamespaceImport(declaration)) {
    return unresolved("unsupported", declaration, target, `${declaration.getKindName()} is not an immutable binding`);
  }
  const write = writtenBinding(declaration, target);
  return write ?? resolved(true, target, declaration);
}

const MODULE_SERVICES = {
  unwrapExpression,
  declarationOf,
  inspectStableBinding,
  readComputedName: (node: MorphNode): ReferenceFact<string> => computedName(node, state()),
  readMemberReference,
} satisfies ReferenceResolutionServices;

/** Resolve a reference to its module export through aliases, namespaces, re-exports, and destructuring. */
export function resolveModuleMemberOrigin(node: MorphNode): ReferenceFact<ModuleMemberOrigin> {
  return resolveModuleMemberOriginWith(node, MODULE_SERVICES);
}
