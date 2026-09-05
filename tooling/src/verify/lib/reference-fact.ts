// Final spelling-independent binding/reference facts for the shared gate runtime.
import type { Identifier, Node as MorphNode } from "ts-morph";
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
}

type WriteInspection = { readonly kind: "stable" } | { readonly kind: "written" } | { readonly kind: "unsupported"; readonly detail: string };

function state(): ResolutionState {
  return { declarations: [], visited: new Set<object>() };
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

function inspectWrites(declaration: MorphNode): WriteInspection {
  const name = bindingNameNode(declaration);
  if (name === undefined || !Node.isIdentifier(name) || !Node.isReferenceFindable(name)) {
    return { kind: "unsupported", detail: `ts-morph cannot enumerate writes for ${declaration.getKindName()}` };
  }
  try {
    for (const reference of name.findReferences().flatMap((group) => group.getReferences())) {
      const sameDefinition = reference.getSourceFile() === name.getSourceFile() && reference.getTextSpan().getStart() === name.getStart();
      if (!sameDefinition && reference.isWriteAccess() && !isDeclarationName(reference.getNode())) {
        return { kind: "written" };
      }
    }
  } catch (error) {
    return {
      kind: "unsupported",
      detail: `ts-morph could not enumerate writes for ${name.getText()}: ${Error.isError(error) ? error.message : String(error)}`,
    };
  }
  return { kind: "stable" };
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
  const inspection = inspectWrites(declaration);
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

function resolveConstDeclaration(current: Identifier, declaration: MorphNode, target: ResolutionState): ReferenceFact<MorphNode> {
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
    : resolveStableExpressionInternal(initializer, target);
}

function resolveStableExpressionInternal(raw: MorphNode, target: ResolutionState): ReferenceFact<MorphNode> {
  const current = unwrapExpression(raw);
  if (!Node.isIdentifier(current)) {
    return isDynamicTerminal(current)
      ? unresolved("dynamic", current, target, `${current.getKindName()} depends on runtime evaluation`)
      : resolved(current, target, current);
  }
  const binding = uniqueDeclaration(current, target);
  if (binding.kind === "unresolved") {
    return binding;
  }
  const declaration = Node.isImportSpecifier(binding.value) ? importedTarget(current, binding.value, target) : binding;
  return declaration.kind === "unresolved" ? declaration : resolveConstDeclaration(current, declaration.value, target);
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
    const target: ResolutionState = { declarations: [...fact.trace.declarations], visited: new Set<object>() };
    return resolved(terminal.getLiteralText(), target, terminal);
  }
  const target: ResolutionState = { declarations: [...fact.trace.declarations], visited: new Set<object>() };
  return unresolved("unsupported", terminal, target, `${terminal.getKindName()} is not a static string`);
}

/** Read a static number, including unary signs, through the shared stable-binding resolver. */
export function readStaticNumber(node: MorphNode): ReferenceFact<number> {
  const fact = resolveStableExpression(node);
  if (fact.kind === "unresolved") {
    return fact;
  }
  const terminal = unwrapExpression(fact.value);
  const target: ResolutionState = { declarations: [...fact.trace.declarations], visited: new Set<object>() };
  if (Node.isNumericLiteral(terminal)) {
    return resolved(terminal.getLiteralValue(), target, terminal);
  }
  if (Node.isPrefixUnaryExpression(terminal)) {
    const operator = terminal.getOperatorToken();
    if (operator !== SyntaxKind.PlusToken && operator !== SyntaxKind.MinusToken) {
      return unresolved("unsupported", terminal, target, `${terminal.getKindName()} does not carry a numeric sign`);
    }
    const operand = readStaticNumber(terminal.getOperand());
    if (operand.kind === "unresolved") {
      return mergeUnresolved(operand, target);
    }
    appendTrace(target, operand.trace.declarations);
    return resolved(operator === SyntaxKind.MinusToken ? -operand.value : operand.value, target, operand.trace.origin);
  }
  return unresolved("unsupported", terminal, target, `${terminal.getKindName()} is not a static number`);
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
