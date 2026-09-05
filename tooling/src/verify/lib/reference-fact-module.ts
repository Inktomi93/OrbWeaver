// Module-origin traversal for reference-fact.ts, separated from static expression/value resolution.
import type { BindingElement, ExportSpecifier, ImportSpecifier, Node as MorphNode, Symbol as MorphSymbol, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type {
  ModuleMemberOrigin,
  ReferenceFact,
  ReferenceResolutionServices,
  ReferenceUnresolvedReason,
  ResolvedReferenceFact,
  UnresolvedReferenceFact,
} from "../contract/reference-fact.ts";

interface ModuleState {
  readonly declarations: MorphNode[];
  readonly visited: Set<object>;
}

type NamespaceBinding =
  | { readonly kind: "project"; readonly moduleSpecifier: string; readonly declaration: MorphNode; readonly sourceFile: SourceFile }
  | { readonly kind: "external"; readonly moduleSpecifier: string; readonly declaration: MorphNode };

function state(): ModuleState {
  return { declarations: [], visited: new Set<object>() };
}

function cloneState(input: ModuleState): ModuleState {
  return { declarations: [...input.declarations], visited: new Set(input.visited) };
}

function appendDeclaration(target: ModuleState, declaration: MorphNode): void {
  if (!target.declarations.some((existing) => existing.compilerNode === declaration.compilerNode)) {
    target.declarations.push(declaration);
  }
}

function appendTrace(target: ModuleState, declarations: readonly MorphNode[]): void {
  for (const declaration of declarations) {
    appendDeclaration(target, declaration);
  }
}

function enterDeclaration(target: ModuleState, declaration: MorphNode): boolean {
  const identity: object = declaration.compilerNode;
  if (target.visited.has(identity)) {
    return false;
  }
  target.visited.add(identity);
  appendDeclaration(target, declaration);
  return true;
}

function enterSymbol(target: ModuleState, symbol: MorphSymbol): boolean {
  const identity: object = symbol.compilerSymbol;
  if (target.visited.has(identity)) {
    return false;
  }
  target.visited.add(identity);
  return true;
}

function resolved<T>(value: T, target: ModuleState, origin: MorphNode): ResolvedReferenceFact<T> {
  return { kind: "resolved", value, trace: { declarations: [...target.declarations], origin } };
}

function unresolved(reason: ReferenceUnresolvedReason, node: MorphNode, target: ModuleState, detail: string): UnresolvedReferenceFact {
  return { kind: "unresolved", reason, detail, node, trace: { declarations: [...target.declarations], origin: node } };
}

function mergeUnresolved(fact: UnresolvedReferenceFact, target: ModuleState): UnresolvedReferenceFact {
  appendTrace(target, fact.trace.declarations);
  return unresolved(fact.reason, fact.node, target, fact.detail);
}

function inspectStableBinding(declaration: MorphNode, target: ModuleState, services: ReferenceResolutionServices): UnresolvedReferenceFact | undefined {
  if (!enterDeclaration(target, declaration)) {
    return unresolved("cycle", declaration, target, `binding cycle at ${declaration.getText()}`);
  }
  const fact = services.inspectStableBinding(declaration);
  appendTrace(target, fact.trace.declarations);
  return fact.kind === "unresolved" ? mergeUnresolved(fact, target) : undefined;
}

function declarationOf(identifier: import("ts-morph").Identifier, target: ModuleState, services: ReferenceResolutionServices): ReferenceFact<MorphNode> {
  const fact = services.declarationOf(identifier);
  if (fact.kind === "unresolved") {
    return mergeUnresolved(fact, target);
  }
  return resolved(fact.value, target, fact.value);
}

function importDeclarationOf(node: MorphNode): import("ts-morph").ImportDeclaration | undefined {
  return node.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
}

function resolveExportSpecifier(declaration: ExportSpecifier, symbol: MorphSymbol, exportName: string, target: ModuleState): ReferenceFact<MorphNode> {
  if (!enterDeclaration(target, declaration)) {
    return unresolved("cycle", declaration, target, `module export cycle at ${declaration.getText()}`);
  }
  const exportDeclaration = declaration.getFirstAncestorByKind(SyntaxKind.ExportDeclaration);
  const nextSource = exportDeclaration?.getModuleSpecifierSourceFile();
  if (nextSource !== undefined) {
    return resolveExportedDeclaration(nextSource, declaration.getName(), target);
  }
  if (exportDeclaration?.getModuleSpecifierValue() !== undefined) {
    return resolved(declaration, target, declaration);
  }
  const aliasedTargets = symbol.getAliasedSymbol()?.getDeclarations() ?? [];
  if (aliasedTargets.length === 0) {
    return unresolved("missing", declaration, target, `local export ${exportName} has no resolvable declaration`);
  }
  if (aliasedTargets.length !== 1) {
    return unresolved("ambiguous", declaration, target, `local export ${exportName} resolves to ${aliasedTargets.length} declarations`);
  }
  const aliased = aliasedTargets[0];
  if (aliased === undefined) {
    return unresolved("missing", declaration, target, `local export ${exportName} has no resolvable declaration`);
  }
  if (!enterDeclaration(target, aliased)) {
    return unresolved("cycle", aliased, target, `module export cycle at ${aliased.getText()}`);
  }
  return resolved(aliased, target, aliased);
}

function resolveExportedDeclaration(sourceFile: SourceFile, exportName: string, target: ModuleState): ReferenceFact<MorphNode> {
  const symbols = sourceFile.getExportSymbols().filter((exportedSymbol) => exportedSymbol.getName() === exportName);
  if (symbols.length === 0) {
    return unresolved("missing", sourceFile, target, `${sourceFile.getFilePath()} exports no member named ${exportName}`);
  }
  if (symbols.length !== 1) {
    return unresolved("ambiguous", sourceFile, target, `${sourceFile.getFilePath()} exposes ${symbols.length} export symbols named ${exportName}`);
  }
  const symbol = symbols[0];
  if (symbol === undefined) {
    return unresolved("missing", sourceFile, target, `${sourceFile.getFilePath()} exports no member named ${exportName}`);
  }
  if (!enterSymbol(target, symbol)) {
    return unresolved("cycle", sourceFile, target, `module export cycle resolving ${exportName}`);
  }
  const declarations = symbol.getDeclarations();
  if (declarations.length === 0) {
    return unresolved("missing", sourceFile, target, `export ${exportName} has no declaration`);
  }
  if (declarations.length !== 1) {
    return unresolved("ambiguous", sourceFile, target, `export ${exportName} has ${declarations.length} declarations`);
  }
  const declaration = declarations[0];
  if (declaration === undefined) {
    return unresolved("missing", sourceFile, target, `export ${exportName} has no declaration`);
  }
  if (Node.isExportSpecifier(declaration)) {
    return resolveExportSpecifier(declaration, symbol, exportName, target);
  }
  return enterDeclaration(target, declaration)
    ? resolved(declaration, target, declaration)
    : unresolved("cycle", declaration, target, `module export cycle at ${declaration.getText()}`);
}

function moduleOriginFromDoor(
  door: ImportSpecifier | import("ts-morph").NamespaceImport,
  exportedName: string,
  target: ModuleState,
): ReferenceFact<ModuleMemberOrigin> {
  const importDeclaration = importDeclarationOf(door);
  if (importDeclaration === undefined) {
    return unresolved("missing", door, target, `${door.getKindName()} has no import declaration`);
  }
  const moduleSpecifier = importDeclaration.getModuleSpecifierValue();
  const sourceFile = importDeclaration.getModuleSpecifierSourceFile();
  if (sourceFile === undefined) {
    return resolved({ moduleSpecifier, exportedName, memberPath: [], declaration: door }, target, door);
  }
  const terminal = resolveExportedDeclaration(sourceFile, exportedName, target);
  if (terminal.kind === "unresolved") {
    return terminal;
  }
  return resolved({ moduleSpecifier, exportedName, memberPath: [], declaration: terminal.value }, target, terminal.value);
}

function namespaceBindingInternal(node: MorphNode, target: ModuleState, services: ReferenceResolutionServices): ReferenceFact<NamespaceBinding> {
  const current = services.unwrapExpression(node);
  if (!Node.isIdentifier(current)) {
    return unresolved("unsupported", current, target, `${current.getKindName()} is not a namespace binding`);
  }
  const declarationFact = declarationOf(current, target, services);
  if (declarationFact.kind === "unresolved") {
    return declarationFact;
  }
  const declaration = declarationFact.value;
  if (Node.isNamespaceImport(declaration)) {
    const refusal = inspectStableBinding(declaration, target, services);
    if (refusal !== undefined) {
      return refusal;
    }
    const importDeclaration = importDeclarationOf(declaration);
    if (importDeclaration === undefined) {
      return unresolved("missing", declaration, target, `namespace ${declaration.getName()} has no import declaration`);
    }
    const moduleSpecifier = importDeclaration.getModuleSpecifierValue();
    const sourceFile = importDeclaration.getModuleSpecifierSourceFile();
    return sourceFile === undefined
      ? resolved({ kind: "external", moduleSpecifier, declaration }, target, declaration)
      : resolved({ kind: "project", moduleSpecifier, declaration, sourceFile }, target, declaration);
  }
  if (Node.isVariableDeclaration(declaration)) {
    const refusal = inspectStableBinding(declaration, target, services);
    if (refusal !== undefined) {
      return refusal;
    }
    const initializer = declaration.getInitializer();
    return initializer === undefined
      ? unresolved("missing", declaration, target, `namespace alias ${declaration.getName()} has no initializer`)
      : namespaceBindingInternal(initializer, target, services);
  }
  if (Node.isParameterDeclaration(declaration)) {
    return unresolved("missing", declaration, target, `parameter ${current.getText()} does not denote the shadowed namespace import`);
  }
  return unresolved("unsupported", declaration, target, `${declaration.getKindName()} is not a namespace import or const alias`);
}

function originFromNamespace(namespace: NamespaceBinding, exportedName: string, target: ModuleState): ReferenceFact<ModuleMemberOrigin> {
  if (namespace.kind === "external") {
    return resolved(
      { moduleSpecifier: namespace.moduleSpecifier, exportedName, memberPath: [], declaration: namespace.declaration },
      target,
      namespace.declaration,
    );
  }
  const terminal = resolveExportedDeclaration(namespace.sourceFile, exportedName, target);
  return terminal.kind === "unresolved"
    ? terminal
    : resolved({ moduleSpecifier: namespace.moduleSpecifier, exportedName, memberPath: [], declaration: terminal.value }, target, terminal.value);
}

function appendMemberPath(fact: ResolvedReferenceFact<ModuleMemberOrigin>, name: string): ResolvedReferenceFact<ModuleMemberOrigin> {
  return { kind: "resolved", value: { ...fact.value, memberPath: [...fact.value.memberPath, name] }, trace: fact.trace };
}

function bindingElementName(binding: BindingElement, target: ModuleState, services: ReferenceResolutionServices): ReferenceFact<string> {
  if (binding.getDotDotDotToken() !== undefined) {
    return unresolved("dynamic", binding, target, "a rest binding does not name one property");
  }
  const property = binding.getPropertyNameNode() ?? binding.getNameNode();
  if (Node.isIdentifier(property)) {
    return resolved(property.getText(), target, property);
  }
  if (Node.isStringLiteral(property) || Node.isNoSubstitutionTemplateLiteral(property)) {
    return resolved(property.getLiteralText(), target, property);
  }
  if (Node.isNumericLiteral(property)) {
    return resolved(String(property.getLiteralValue()), target, property);
  }
  if (Node.isComputedPropertyName(property)) {
    const computed = services.readComputedName(property.getExpression());
    return computed.kind === "unresolved" ? mergeUnresolved(computed, target) : resolved(computed.value, target, computed.trace.origin);
  }
  return unresolved("unsupported", property, target, `${property.getKindName()} does not name one destructured property`);
}

function moduleOriginFromBinding(binding: BindingElement, target: ModuleState, services: ReferenceResolutionServices): ReferenceFact<ModuleMemberOrigin> {
  const pattern = binding.getParent();
  const variable = binding.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  if (!Node.isObjectBindingPattern(pattern) || variable === undefined || pattern.getParent() !== variable) {
    return unresolved("unsupported", binding, target, "nested and array destructuring are not module-member bindings");
  }
  const refusal = inspectStableBinding(binding, target, services);
  if (refusal !== undefined) {
    return refusal;
  }
  const name = bindingElementName(binding, target, services);
  if (name.kind === "unresolved") {
    return name;
  }
  const receiver = variable.getInitializer();
  if (receiver === undefined) {
    return unresolved("missing", variable, target, "destructuring declaration has no receiver initializer");
  }
  const namespaceState = cloneState(target);
  const namespace = namespaceBindingInternal(receiver, namespaceState, services);
  if (namespace.kind === "resolved") {
    return originFromNamespace(namespace.value, name.value, namespaceState);
  }
  if (namespace.reason !== "unsupported") {
    return namespace;
  }
  const importedObject = resolveInternal(receiver, target, services);
  return importedObject.kind === "unresolved" ? importedObject : appendMemberPath(importedObject, name.value);
}

function moduleOriginFromMember(node: MorphNode, target: ModuleState, services: ReferenceResolutionServices): ReferenceFact<ModuleMemberOrigin> {
  const read = services.readMemberReference(node);
  if (read.kind === "unresolved") {
    return mergeUnresolved(read, target);
  }
  appendTrace(target, read.trace.declarations);
  const namespaceState = cloneState(target);
  const namespace = namespaceBindingInternal(read.value.receiver, namespaceState, services);
  if (namespace.kind === "resolved") {
    return originFromNamespace(namespace.value, read.value.name, namespaceState);
  }
  if (namespace.reason !== "unsupported") {
    return namespace;
  }
  const importedObject = resolveInternal(read.value.receiver, target, services);
  return importedObject.kind === "unresolved" ? importedObject : appendMemberPath(importedObject, read.value.name);
}

function moduleOriginFromIdentifier(
  identifier: import("ts-morph").Identifier,
  target: ModuleState,
  services: ReferenceResolutionServices,
): ReferenceFact<ModuleMemberOrigin> {
  const declarationFact = declarationOf(identifier, target, services);
  if (declarationFact.kind === "unresolved") {
    return declarationFact;
  }
  const declaration = declarationFact.value;
  if (Node.isImportSpecifier(declaration)) {
    const refusal = inspectStableBinding(declaration, target, services);
    return refusal ?? moduleOriginFromDoor(declaration, declaration.getName(), target);
  }
  if (Node.isBindingElement(declaration)) {
    return moduleOriginFromBinding(declaration, target, services);
  }
  if (Node.isVariableDeclaration(declaration)) {
    const refusal = inspectStableBinding(declaration, target, services);
    if (refusal !== undefined) {
      return refusal;
    }
    const initializer = declaration.getInitializer();
    return initializer === undefined
      ? unresolved("missing", declaration, target, `module alias ${declaration.getName()} has no initializer`)
      : resolveInternal(initializer, target, services);
  }
  if (Node.isParameterDeclaration(declaration)) {
    return unresolved("missing", declaration, target, `parameter ${identifier.getText()} has no module origin`);
  }
  return unresolved("unsupported", declaration, target, `${declaration.getKindName()} is not a supported module-member binding`);
}

function resolveInternal(node: MorphNode, target: ModuleState, services: ReferenceResolutionServices): ReferenceFact<ModuleMemberOrigin> {
  const current = services.unwrapExpression(node);
  if (Node.isPropertyAccessExpression(current) || Node.isElementAccessExpression(current)) {
    return moduleOriginFromMember(current, target, services);
  }
  if (Node.isIdentifier(current)) {
    return moduleOriginFromIdentifier(current, target, services);
  }
  if (Node.isImportSpecifier(current)) {
    const refusal = inspectStableBinding(current, target, services);
    return refusal ?? moduleOriginFromDoor(current, current.getName(), target);
  }
  if (Node.isBindingElement(current)) {
    return moduleOriginFromBinding(current, target, services);
  }
  return unresolved("dynamic", current, target, `${current.getKindName()} has no stable module-member origin`);
}

/** Internal engine; reference-fact.ts owns the one-argument public API and injects its shared readers. */
export function resolveModuleMemberOriginWith(node: MorphNode, services: ReferenceResolutionServices): ReferenceFact<ModuleMemberOrigin> {
  return resolveInternal(node, state(), services);
}
