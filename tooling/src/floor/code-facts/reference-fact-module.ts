// Module-origin traversal for reference-fact.ts, separated from static expression/value resolution.
import type { BindingElement, ExportSpecifier, ImportClause, ImportSpecifier, Node as MorphNode, Symbol as MorphSymbol, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { bindingElementName } from "./reference-fact-binding-name.ts";
import type { ModuleMemberOrigin, ReferenceFact, ReferenceResolutionServices, ResolvedReferenceFact } from "./reference-fact-contract.ts";
import type { CanonicalModuleTarget, NamespaceBinding } from "./reference-fact-module-helpers.ts";
import { externalTarget, importDeclarationOf, originFromTarget, projectTarget, requiresResolvedSource } from "./reference-fact-module-helpers.ts";
import { overloadHome } from "./reference-fact-overload.ts";
import { sameFileMergedExportOrigin } from "./reference-fact-same-file-merge.ts";
import type { ModuleState } from "./reference-fact-state.ts";
import {
  appendTrace,
  cloneModuleState,
  declarationOf,
  enterDeclaration,
  enterSymbol,
  inspectStableBinding,
  mergeUnresolved,
  moduleState,
  resolved,
  unresolved,
} from "./reference-fact-state.ts";

/** The canonical home of a republished import. A named binding re-enters the ordinary door resolver; a
 *  NAMESPACE object has no single leaf declaration, so the home it names is the MODULE itself. */
function republishedTarget(
  binding: ImportSpecifier | ImportClause | import("ts-morph").NamespaceImport,
  exportName: string,
  target: ModuleState,
): ReferenceFact<CanonicalModuleTarget> {
  if (Node.isNamespaceImport(binding)) {
    const namespace = namespaceImportBinding(binding, target);
    if (namespace.kind === "unresolved") {
      return namespace;
    }
    return namespace.value.kind === "external"
      ? resolved(externalTarget(binding, namespace.value.moduleSpecifier, exportName), target, binding)
      : resolved(projectTarget(namespace.value.sourceFile, exportName), target, namespace.value.sourceFile);
  }
  const refusal = inspectStableBinding(binding, target);
  if (refusal !== undefined) {
    return refusal;
  }
  const inner = moduleOriginFromDoor(binding, Node.isImportSpecifier(binding) ? binding.getName() : "default", target);
  return inner.kind === "unresolved" ? inner : resolved(inner.value.canonical, target, inner.value.declaration);
}

function resolveExportSpecifier(
  declaration: ExportSpecifier,
  symbol: MorphSymbol,
  exportName: string,
  target: ModuleState,
): ReferenceFact<CanonicalModuleTarget> {
  if (!enterDeclaration(target, declaration)) {
    return unresolved("cycle", declaration, target, `module export cycle at ${declaration.getText()}`);
  }
  const exportDeclaration = declaration.getFirstAncestorByKind(SyntaxKind.ExportDeclaration);
  const nextSource = exportDeclaration?.getModuleSpecifierSourceFile();
  if (nextSource !== undefined) {
    return resolveExportedDeclaration(nextSource, declaration.getName(), target);
  }
  const externalSpecifier = exportDeclaration?.getModuleSpecifierValue();
  if (externalSpecifier !== undefined) {
    if (requiresResolvedSource(externalSpecifier)) {
      return unresolved("missing", declaration, target, `re-export door ${externalSpecifier} has no resolvable source file`);
    }
    return resolved(externalTarget(declaration, externalSpecifier, declaration.getName()), target, declaration);
  }
  return resolveLocalExportBinding(declaration, symbol, exportName, target);
}

function resolveLocalExportBinding(
  declaration: ExportSpecifier,
  symbol: MorphSymbol,
  exportName: string,
  target: ModuleState,
): ReferenceFact<CanonicalModuleTarget> {
  const aliasedTargets = declaration.getLocalTargetSymbol()?.getDeclarations() ?? [];
  // Flattened declarations guard multiplicity only; the lexical target owns provenance.
  const flattened = symbol.getAliasedSymbol()?.getDeclarations() ?? [];
  if (flattened.length > 1 && overloadHome(flattened) === undefined) {
    return unresolved("ambiguous", declaration, target, `local export ${exportName} resolves to ${flattened.length} declarations`);
  }
  const overload = overloadHome(aliasedTargets);
  const aliased = overload ?? aliasedTargets[0];
  if (aliased === undefined) {
    return unresolved("missing", declaration, target, `local export ${exportName} has no resolvable declaration`);
  }
  if (aliasedTargets.length !== 1 && overload === undefined) {
    return unresolved("ambiguous", declaration, target, `local export ${exportName} resolves to ${aliasedTargets.length} declarations`);
  }
  if (Node.isImportSpecifier(aliased) || Node.isImportClause(aliased) || Node.isNamespaceImport(aliased)) {
    return republishedTarget(aliased, exportName, target);
  }
  if (Node.isBindingElement(aliased)) {
    const inner = moduleOriginFromBinding(aliased, target, target.services);
    return inner.kind === "unresolved" ? inner : resolved(inner.value.canonical, target, inner.value.declaration);
  }
  if (!enterDeclaration(target, aliased)) {
    return unresolved("cycle", aliased, target, `module export cycle at ${aliased.getText()}`);
  }
  return validatedProjectTarget(aliased, exportName, target);
}

function starExportCandidates(sourceFile: SourceFile, exportName: string): readonly import("ts-morph").ExportDeclaration[] {
  return sourceFile.getExportDeclarations().filter((declaration) => {
    if (declaration.hasNamedExports() || declaration.getNamespaceExport() !== undefined) {
      return false;
    }
    const exportedSource = declaration.getModuleSpecifierSourceFile();
    return exportedSource?.getExportSymbols().some((exportedSymbol) => exportedSymbol.getName() === exportName) ?? false;
  });
}

function resolveStarExport(sourceFile: SourceFile, exportName: string, target: ModuleState): ReferenceFact<CanonicalModuleTarget> | undefined {
  const candidates = starExportCandidates(sourceFile, exportName);
  if (candidates.length === 0) {
    return;
  }
  if (candidates.length !== 1) {
    return unresolved("ambiguous", sourceFile, target, `${sourceFile.getFilePath()} has ${candidates.length} export-star origins for ${exportName}`);
  }
  const declaration = candidates[0];
  if (declaration === undefined) {
    return unresolved("missing", sourceFile, target, `${sourceFile.getFilePath()} has no export-star origin for ${exportName}`);
  }
  if (!enterDeclaration(target, declaration)) {
    return unresolved("cycle", declaration, target, `module export-star cycle resolving ${exportName}`);
  }
  const exportedSource = declaration.getModuleSpecifierSourceFile();
  return exportedSource === undefined
    ? unresolved("missing", declaration, target, `export star ${declaration.getText()} has no resolvable source`)
    : resolveExportedDeclaration(exportedSource, exportName, target);
}

function isBindingAliasInitializer(node: MorphNode, services: ReferenceResolutionServices): boolean {
  const current = services.unwrapExpression(node);
  return Node.isIdentifier(current) || Node.isPropertyAccessExpression(current) || Node.isElementAccessExpression(current);
}

function validatedProjectTarget(declaration: MorphNode, exportedName: string, target: ModuleState): ReferenceFact<CanonicalModuleTarget> {
  const initializer = Node.isVariableDeclaration(declaration) ? declaration.getInitializer() : undefined;
  if (initializer !== undefined && isBindingAliasInitializer(initializer, target.services)) {
    const stable = target.services.inspectStableBinding(declaration);
    if (stable.kind === "unresolved") {
      return mergeUnresolved(stable, target);
    }
    const inner = resolveInternal(initializer, target, target.services);
    return inner.kind === "unresolved" ? inner : resolved(inner.value.canonical, target, inner.value.declaration);
  }
  return resolved(projectTarget(declaration, exportedName), target, declaration);
}

function uniqueExportSymbol(sourceFile: SourceFile, exportName: string, target: ModuleState): ReferenceFact<MorphSymbol> {
  const symbols = sourceFile.getExportSymbols().filter((exportedSymbol) => exportedSymbol.getName() === exportName);
  const symbol = symbols[0];
  if (symbol === undefined) {
    return unresolved("missing", sourceFile, target, `${sourceFile.getFilePath()} exports no member named ${exportName}`);
  }
  if (symbols.length !== 1) {
    return unresolved("ambiguous", sourceFile, target, `${sourceFile.getFilePath()} exposes ${symbols.length} export symbols named ${exportName}`);
  }
  return resolved(symbol, target, sourceFile);
}

function resolveExportedDeclaration(sourceFile: SourceFile, exportName: string, target: ModuleState): ReferenceFact<CanonicalModuleTarget> {
  appendTrace(target, [sourceFile]);
  const symbolFact = uniqueExportSymbol(sourceFile, exportName, target);
  if (symbolFact.kind === "unresolved") {
    return symbolFact;
  }
  const symbol = symbolFact.value;
  const declarations = symbol.getDeclarations();
  const overload = overloadHome(declarations);
  const declaration = overload ?? declarations[0];
  if (declaration === undefined) {
    return unresolved("missing", sourceFile, target, `export ${exportName} has no declaration`);
  }
  if (declarations.length !== 1 && overload === undefined) {
    return unresolved("ambiguous", sourceFile, target, `export ${exportName} has ${declarations.length} declarations`);
  }
  if (declaration.getSourceFile() !== sourceFile) {
    const star = resolveStarExport(sourceFile, exportName, target);
    if (star !== undefined) {
      return star;
    }
  }
  if (!enterSymbol(target, symbol)) {
    return unresolved("cycle", sourceFile, target, `module export cycle resolving ${exportName}`);
  }
  if (Node.isExportSpecifier(declaration)) {
    return resolveExportSpecifier(declaration, symbol, exportName, target);
  }
  if (!enterDeclaration(target, declaration)) {
    return unresolved("cycle", declaration, target, `module export cycle at ${declaration.getText()}`);
  }
  return validatedProjectTarget(declaration, exportName, target);
}

function moduleOriginFromDoor(
  door: ImportClause | ImportSpecifier | import("ts-morph").NamespaceImport,
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
    if (requiresResolvedSource(moduleSpecifier)) {
      return unresolved("missing", importDeclaration.getModuleSpecifier(), target, `module door ${moduleSpecifier} has no resolvable source file`);
    }
    const canonical = externalTarget(door, moduleSpecifier, exportedName);
    return resolved(originFromTarget(moduleSpecifier, exportedName, canonical), target, door);
  }
  const terminal = resolveExportedDeclaration(sourceFile, exportedName, target);
  if (terminal.kind === "unresolved") {
    return terminal;
  }
  return resolved(originFromTarget(moduleSpecifier, exportedName, terminal.value), target, terminal.value.declaration);
}

function moduleOriginFromExportDoor(declaration: ExportSpecifier, target: ModuleState): ReferenceFact<ModuleMemberOrigin> {
  const exportDeclaration = declaration.getFirstAncestorByKind(SyntaxKind.ExportDeclaration);
  if (exportDeclaration === undefined) {
    return unresolved("missing", declaration, target, `export ${declaration.getName()} has no export declaration`);
  }
  const moduleSpecifier = exportDeclaration.getModuleSpecifierValue();
  if (moduleSpecifier === undefined) {
    return unresolved("unsupported", declaration, target, `local export ${declaration.getName()} has no module door`);
  }
  const sourceFile = exportDeclaration.getModuleSpecifierSourceFile();
  if (sourceFile === undefined) {
    if (requiresResolvedSource(moduleSpecifier)) {
      return unresolved("missing", declaration, target, `re-export door ${moduleSpecifier} has no resolvable source file`);
    }
    const canonical = externalTarget(declaration, moduleSpecifier, declaration.getName());
    return resolved(originFromTarget(moduleSpecifier, declaration.getName(), canonical), target, declaration);
  }
  const terminal = resolveExportedDeclaration(sourceFile, declaration.getName(), target);
  return terminal.kind === "unresolved"
    ? terminal
    : resolved(originFromTarget(moduleSpecifier, declaration.getName(), terminal.value), target, terminal.value.declaration);
}

function namespaceImportBinding(declaration: import("ts-morph").NamespaceImport, target: ModuleState): ReferenceFact<NamespaceBinding> {
  const refusal = inspectStableBinding(declaration, target);
  if (refusal !== undefined) {
    return refusal;
  }
  const importDeclaration = importDeclarationOf(declaration);
  if (importDeclaration === undefined) {
    return unresolved("missing", declaration, target, `namespace ${declaration.getName()} has no import declaration`);
  }
  const moduleSpecifier = importDeclaration.getModuleSpecifierValue();
  const sourceFile = importDeclaration.getModuleSpecifierSourceFile();
  if (sourceFile === undefined) {
    return requiresResolvedSource(moduleSpecifier)
      ? unresolved("missing", importDeclaration.getModuleSpecifier(), target, `namespace door ${moduleSpecifier} has no resolvable source file`)
      : resolved({ kind: "external", moduleSpecifier, declaration }, target, declaration);
  }
  return resolved({ kind: "project", moduleSpecifier, declaration, sourceFile }, target, declaration);
}

function dynamicNamespaceBinding(call: import("ts-morph").CallExpression, target: ModuleState): ReferenceFact<NamespaceBinding> {
  const [argument] = call.getArguments();
  if (argument === undefined || !Node.isStringLiteral(argument)) {
    return unresolved("dynamic", call, target, "a dynamic namespace requires one literal module door");
  }
  if (!enterDeclaration(target, call)) {
    return unresolved("cycle", call, target, `dynamic module cycle at ${call.getText()}`);
  }
  const moduleSpecifier = argument.getLiteralText();
  const sourceFile = argument.getSymbol()?.getDeclarations().find(Node.isSourceFile);
  if (sourceFile === undefined) {
    return requiresResolvedSource(moduleSpecifier)
      ? unresolved("missing", argument, target, `dynamic module door ${moduleSpecifier} has no resolvable source file`)
      : resolved({ kind: "external", moduleSpecifier, declaration: call }, target, call);
  }
  appendTrace(target, [sourceFile]);
  return resolved({ kind: "project", moduleSpecifier, declaration: call, sourceFile }, target, call);
}

function namespaceBindingInternal(node: MorphNode, target: ModuleState, services: ReferenceResolutionServices): ReferenceFact<NamespaceBinding> {
  const current = services.unwrapExpression(node);
  if (Node.isAwaitExpression(current)) {
    return namespaceBindingInternal(current.getExpression(), target, services);
  }
  if (Node.isCallExpression(current) && current.getExpression().getKind() === SyntaxKind.ImportKeyword) {
    return dynamicNamespaceBinding(current, target);
  }
  if (!Node.isIdentifier(current)) {
    return unresolved("unsupported", current, target, `${current.getKindName()} is not a namespace binding`);
  }
  const declarationFact = declarationOf(current, target);
  if (declarationFact.kind === "unresolved") {
    return declarationFact;
  }
  const declaration = declarationFact.value;
  if (Node.isNamespaceImport(declaration)) {
    return namespaceImportBinding(declaration, target);
  }
  if (Node.isVariableDeclaration(declaration)) {
    const refusal = inspectStableBinding(declaration, target);
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
    const canonical = externalTarget(namespace.declaration, namespace.moduleSpecifier, exportedName);
    return resolved(originFromTarget(namespace.moduleSpecifier, exportedName, canonical), target, namespace.declaration);
  }
  const terminal = resolveExportedDeclaration(namespace.sourceFile, exportedName, target);
  return terminal.kind === "unresolved"
    ? terminal
    : resolved(originFromTarget(namespace.moduleSpecifier, exportedName, terminal.value), target, terminal.value.declaration);
}

function appendMemberPath(fact: ResolvedReferenceFact<ModuleMemberOrigin>, name: string): ResolvedReferenceFact<ModuleMemberOrigin> {
  return { kind: "resolved", value: { ...fact.value, memberPath: [...fact.value.memberPath, name] }, trace: fact.trace };
}

function moduleOriginFromBinding(binding: BindingElement, target: ModuleState, services: ReferenceResolutionServices): ReferenceFact<ModuleMemberOrigin> {
  const pattern = binding.getParent();
  const variable = binding.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  if (!Node.isObjectBindingPattern(pattern) || variable === undefined || pattern.getParent() !== variable) {
    return unresolved("unsupported", binding, target, "nested and array destructuring are not module-member bindings");
  }
  if (binding.getInitializer() !== undefined) {
    return unresolved("dynamic", binding, target, "a destructuring default chooses its origin at runtime");
  }
  const refusal = inspectStableBinding(binding, target);
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
  const namespaceState = cloneModuleState(target);
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
  const namespaceState = cloneModuleState(target);
  const namespace = namespaceBindingInternal(read.value.receiver, namespaceState, services);
  if (namespace.kind === "resolved") {
    return originFromNamespace(namespace.value, read.value.name, namespaceState);
  }
  if (namespace.reason !== "unsupported") {
    return namespace;
  }
  const merged = sameFileMergedExportOrigin(services.unwrapExpression(read.value.receiver), target);
  if (merged !== undefined) {
    return merged.kind === "unresolved" ? merged : appendMemberPath(merged, read.value.name);
  }
  const importedObject = resolveInternal(read.value.receiver, target, services);
  return importedObject.kind === "unresolved" ? importedObject : appendMemberPath(importedObject, read.value.name);
}

function moduleOriginFromIdentifier(
  identifier: import("ts-morph").Identifier,
  target: ModuleState,
  services: ReferenceResolutionServices,
): ReferenceFact<ModuleMemberOrigin> {
  const declarationFact = declarationOf(identifier, target);
  if (declarationFact.kind === "unresolved") {
    return declarationFact;
  }
  const declaration = declarationFact.value;
  if (Node.isImportSpecifier(declaration)) {
    const refusal = inspectStableBinding(declaration, target);
    return refusal ?? moduleOriginFromDoor(declaration, declaration.getName(), target);
  }
  if (Node.isImportClause(declaration)) {
    const refusal = inspectStableBinding(declaration, target);
    return refusal ?? moduleOriginFromDoor(declaration, "default", target);
  }
  if (Node.isBindingElement(declaration)) {
    return moduleOriginFromBinding(declaration, target, services);
  }
  if (Node.isVariableDeclaration(declaration)) {
    const refusal = inspectStableBinding(declaration, target);
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
  if (Node.isPropertyAccessExpression(current) || Node.isElementAccessExpression(current) || Node.isQualifiedName(current)) {
    return moduleOriginFromMember(current, target, services);
  }
  if (Node.isIdentifier(current)) {
    return moduleOriginFromIdentifier(current, target, services);
  }
  if (Node.isImportSpecifier(current)) {
    const refusal = inspectStableBinding(current, target);
    return refusal ?? moduleOriginFromDoor(current, current.getName(), target);
  }
  if (Node.isExportSpecifier(current)) {
    return moduleOriginFromExportDoor(current, target);
  }
  if (Node.isBindingElement(current)) {
    return moduleOriginFromBinding(current, target, services);
  }
  return unresolved("dynamic", current, target, `${current.getKindName()} has no stable module-member origin`);
}

/** Internal engine; reference-fact.ts owns the one-argument public API and injects its shared readers. */
export function resolveModuleMemberOriginWith(node: MorphNode, services: ReferenceResolutionServices): ReferenceFact<ModuleMemberOrigin> {
  return resolveInternal(node, moduleState(services), services);
}
