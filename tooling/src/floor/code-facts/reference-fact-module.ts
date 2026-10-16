// Module-origin traversal for reference-fact.ts, separated from static expression/value resolution.
import type {
  BindingElement,
  CallExpression,
  ExportSpecifier,
  Identifier,
  ImportClause,
  ImportSpecifier,
  Node as MorphNode,
  Symbol as MorphSymbol,
  SourceFile,
} from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { bindingElementName } from "./reference-fact-binding-name.ts";
import type {
  CallReturnProgram,
  ModuleMemberOrigin,
  NativeNamespaceValueServices,
  ReferenceFact,
  ReferenceResolutionServices,
  ResolvedReferenceFact,
  ReturnedValueContext,
  ReturnedValueSource,
} from "./reference-fact-contract.ts";
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

function dynamicNamespaceFulfillment(source: SourceFile, target: ModuleState): ReferenceFact<true> {
  if (!enterDeclaration(target, source)) {
    return unresolved("cycle", source, target, "dynamic namespace wildcard export coverage is cyclic");
  }
  if (source.getExportSymbols().some((symbol) => symbol.getName() === "then")) {
    return unresolved("unsupported", source, target, "a dynamic module then export may replace its fulfilled namespace");
  }
  for (const declaration of source.getExportDeclarations()) {
    if (declaration.isTypeOnly() || declaration.hasNamedExports() || declaration.getNamespaceExport() !== undefined) {
      continue;
    }
    const next = declaration.getModuleSpecifierSourceFile();
    if (next === undefined) {
      return unresolved("missing", declaration, target, "dynamic namespace wildcard export coverage is incomplete");
    }
    const closed = dynamicNamespaceFulfillment(next, cloneModuleState(target));
    appendTrace(target, closed.trace.declarations);
    if (closed.kind === "unresolved") {
      return mergeUnresolved(closed, target);
    }
  }
  return resolved(true, target, source);
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
  const fulfillment = dynamicNamespaceFulfillment(sourceFile, target);
  return fulfillment.kind === "unresolved" ? fulfillment : resolved({ kind: "project", moduleSpecifier, declaration: call, sourceFile }, target, call);
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

/** A destructured module declaration is an alias only after its namespace and exact exported target agree. */
export function readModuleAliasBindingWith(
  reference: MorphNode,
  expected: MorphNode,
  services: ReferenceResolutionServices,
): ReferenceFact<Identifier> | undefined {
  const target = moduleState(services);
  if (reference.wasForgotten() || expected.wasForgotten()) {
    return unresolved("unsupported", reference, target, "the module alias or its target was forgotten");
  }
  const binding = reference.getParent();
  if (!Node.isBindingElement(binding) || (binding.getNameNode() !== reference && binding.getPropertyNameNode() !== reference)) {
    return;
  }
  const name = binding.getNameNode();
  if (!Node.isIdentifier(name)) {
    return unresolved("unsupported", binding, target, "the module alias has no single native binding");
  }
  const project = expected.getProject();
  const program = project.getProgram().compilerObject;
  const source = reference.getSourceFile();
  if (
    reference.getProject() !== project ||
    program.getSourceFile(source.getFilePath()) !== source.compilerNode ||
    program.getSourceFile(expected.getSourceFile().getFilePath()) !== expected.getSourceFile().compilerNode
  ) {
    return unresolved("unsupported", reference, target, "the module alias is not the target's current native Project source");
  }
  const lexical = services.declarationOf(name);
  if (lexical.kind === "unresolved") {
    return lexical;
  }
  if (lexical.value.compilerNode !== binding.compilerNode) {
    return unresolved("ambiguous", name, target, "the module alias has a different native lexical declaration");
  }
  const origin = moduleOriginFromBinding(binding, target, services);
  if (origin.kind === "unresolved") {
    return origin;
  }
  return origin.value.canonical.kind === "project" &&
    origin.value.canonical.declaration.compilerNode === expected.compilerNode &&
    origin.value.memberPath.length === 0
    ? { ...origin, value: name }
    : unresolved("ambiguous", reference, target, "the module alias does not retain the exact native exported target");
}

function immediateNamespaceCatch(call: CallExpression, services: ReferenceResolutionServices): CallExpression | undefined {
  const expression = services.unwrapExpression(call.getExpression());
  if (
    !(Node.isPropertyAccessExpression(expression) || Node.isElementAccessExpression(expression)) ||
    call.hasQuestionDotToken() ||
    expression.hasQuestionDotToken()
  ) {
    return;
  }
  const member = services.readMemberReference(expression);
  if (member.kind === "unresolved" || member.value.name !== "catch") {
    return;
  }
  const receiver = services.unwrapExpression(member.value.receiver);
  return Node.isCallExpression(receiver) && receiver.getExpression().getKind() === SyntaxKind.ImportKeyword ? receiver : undefined;
}

function awaitedNamespaceCatch(call: CallExpression, services: ReferenceResolutionServices): boolean {
  for (let parent = call.getParent(); parent !== undefined; parent = parent.getParent()) {
    if (Node.isAwaitExpression(parent)) {
      return services.unwrapExpression(parent.getExpression()) === call;
    }
    if (services.unwrapExpression(parent) !== call) {
      return false;
    }
  }
  return false;
}

function capturedNamespaceContext(
  call: CallExpression,
  context: ReturnedValueContext,
  services: NativeNamespaceValueServices,
): ReferenceFact<CallReturnProgram> {
  const program = context.program;
  if (program === undefined || program.suppliedCallableTargets !== true || program.callableProofEpoch === undefined) {
    return services.refusal(call, "missing", "namespace transfer has no supplied-callable capture epoch");
  }
  const admitted = services.capturedProgram(call, { programs: [program] });
  if (admitted.kind === "unresolved") {
    return admitted;
  }
  if (!program.byCall.has(call.compilerNode)) {
    return services.refusal(call, "missing", "the namespace catch call was not captured");
  }
  const premise = context.inheritedReadPremise;
  if (premise !== undefined) {
    const live = premise.require(call, program);
    if (live.kind === "unresolved") {
      return live;
    }
  } else if (program.inheritedReadTrialActive?.() === true) {
    return services.refusal(call, "unsupported", "namespace transfer cannot borrow a private trial without its continuation");
  }
  return admitted;
}

function nativeNamespaceCatchIdentity(call: CallExpression, program: CallReturnProgram, services: NativeNamespaceValueServices): ReferenceFact<true> {
  const member = program.nativeSymbolServices?.memberOrigin(call.getExpression());
  const signature = call.getProject().getTypeChecker().getResolvedSignature(call)?.getDeclaration();
  const owner = signature?.getParent();
  if (
    member?.kind !== "resolved" ||
    member.value.name !== "catch" ||
    signature === undefined ||
    !Node.isInterfaceDeclaration(owner) ||
    owner.getName() !== "Promise" ||
    !program.program.isSourceFileDefaultLibrary(signature.getSourceFile().compilerNode) ||
    member.value.declarations.length === 0 ||
    !member.value.declarations.every((declaration) => program.program.isSourceFileDefaultLibrary(declaration.getSourceFile().compilerNode))
  ) {
    return services.refusal(call, "unsupported", "the immediate import has no installed native Promise catch member");
  }
  return services.references.inspectSymbolWrites(member.value.symbol, call.getExpression());
}

function namespaceHandlerCompletion(
  call: CallExpression,
  context: ReturnedValueContext,
  program: CallReturnProgram,
  services: NativeNamespaceValueServices,
): ReferenceFact<true> {
  const argument = call.getArguments()[0];
  if (argument === undefined || call.getArguments().length !== 1 || Node.isSpreadElement(argument)) {
    return services.refusal(call, "unsupported", "namespace catch requires one actual all-abrupt rejection handler");
  }
  const selected = services.readValue(argument, [], context);
  if (selected.kind === "unresolved") {
    return selected;
  }
  const source = selected.value[0];
  if (selected.value.length !== 1 || source === undefined || !source.present || source.path.length > 0) {
    return services.refusal(argument, "unsupported", "namespace catch has no one actual rejection handler");
  }
  const completion = services.abruptCompletion(source.value, program);
  return { ...completion, trace: { ...completion.trace, declarations: [...selected.trace.declarations, ...completion.trace.declarations] } };
}

function namespaceExportValues(
  imported: CallExpression,
  path: readonly string[],
  context: ReturnedValueContext,
  services: NativeNamespaceValueServices,
): ReferenceFact<readonly ReturnedValueSource[]> {
  const [name] = path;
  if (path.length !== 1 || name === undefined || imported.getArguments().length !== 1) {
    return services.refusal(imported, "unsupported", "namespace transfer selects exactly one exported callable without a residual path");
  }
  const target = moduleState(services.references);
  const namespace = dynamicNamespaceBinding(imported, target);
  if (namespace.kind === "unresolved") {
    return namespace;
  }
  const origin = originFromNamespace(namespace.value, name, target);
  if (origin.kind === "unresolved") {
    return origin;
  }
  const canonical = origin.value.canonical;
  if (canonical.kind !== "project") {
    return services.refusal(imported, "unsupported", "namespace transfer has no actual native project export");
  }
  const declaration = canonical.declaration;
  if (Node.isVariableDeclaration(declaration)) {
    const stable = services.references.inspectStableBinding(declaration);
    if (stable.kind === "unresolved") {
      return stable;
    }
  } else if (!Node.isFunctionDeclaration(declaration)) {
    return services.refusal(declaration, "unsupported", "namespace transfer has no authored callable export binding");
  }
  const value = declaration.getNameNode() ?? declaration;
  const callable = services.callableDeclaration(value);
  if (callable.kind === "unresolved") {
    return callable;
  }
  const projected = services.readValue(callable.value.declaration, [], context);
  return {
    ...projected,
    trace: { ...projected.trace, declarations: [...origin.trace.declarations, ...callable.trace.declarations, ...projected.trace.declarations] },
  };
}

function namespaceValueNodes(values: ResolvedReferenceFact<readonly ReturnedValueSource[]>): readonly MorphNode[] {
  return [...values.trace.declarations, ...values.value.flatMap((source) => [source.value, ...source.bindings.keys(), ...source.bindings.values()])];
}

function admittedNamespaceValues(
  call: CallExpression,
  values: ResolvedReferenceFact<readonly ReturnedValueSource[]>,
  program: CallReturnProgram,
  services: NativeNamespaceValueServices,
): ReferenceFact<true> {
  if (
    values.value.length !== 1 ||
    values.value.some(
      (source) =>
        !source.present ||
        source.path.length > 0 ||
        !(Node.isFunctionDeclaration(source.value) || Node.isFunctionExpression(source.value) || Node.isArrowFunction(source.value)) ||
        source.value.getBody() === undefined,
    )
  ) {
    return services.refusal(call, "unsupported", "namespace transfer has no one actual authored callable leaf");
  }
  for (const node of namespaceValueNodes(values)) {
    const admitted = services.capturedReference(node, call, program);
    if (admitted.kind === "unresolved") {
      return admitted;
    }
  }
  return { kind: "resolved", value: true, trace: values.trace };
}

/** Conditional namespace candidates remain stack-local value leaves until the existing effect owner discharges them. */
export function readCapturedNamespaceValue(
  call: CallExpression,
  path: readonly string[],
  context: ReturnedValueContext,
  services: NativeNamespaceValueServices,
): ReferenceFact<readonly ReturnedValueSource[]> | undefined {
  if (call.wasForgotten()) {
    return services.refusal(call, "unsupported", "the captured namespace call was forgotten");
  }
  const imported = immediateNamespaceCatch(call, services.references);
  if (imported === undefined) {
    return;
  }
  if (!awaitedNamespaceCatch(call, services.references)) {
    return services.refusal(call, "unsupported", "the namespace catch Promise has no immediate awaited fulfillment boundary");
  }
  const captured = capturedNamespaceContext(call, context, services);
  if (captured.kind === "unresolved") {
    return captured;
  }
  const program = captured.value;
  const readEpoch = program.callableProofEpoch;
  const epoch = readEpoch?.();
  if (epoch === undefined) {
    return services.refusal(call, "missing", "namespace transfer has no actual captured epoch operation");
  }
  const identity = nativeNamespaceCatchIdentity(call, program, services);
  if (identity.kind === "unresolved") {
    return identity;
  }
  const abrupt = namespaceHandlerCompletion(call, context, program, services);
  if (abrupt.kind === "unresolved") {
    return abrupt;
  }
  const candidate = namespaceExportValues(imported, path, context, services);
  if (candidate.kind === "unresolved") {
    return candidate;
  }
  const proofCandidate = { ...candidate, trace: { ...candidate.trace, declarations: [...abrupt.trace.declarations, ...candidate.trace.declarations] } };
  const admitted = admittedNamespaceValues(call, proofCandidate, program, services);
  if (admitted.kind === "unresolved") {
    return admitted;
  }
  const nodes = namespaceValueNodes(proofCandidate).map((node) => ({ node, native: node.compilerNode }));
  const effects = services.inheritedEffects(call, context);
  if (effects.kind === "unresolved") {
    return effects;
  }
  if (effects.kind === "conditional" && context.inheritedReadPremise === undefined) {
    return services.refusal(call, "unsupported", "ordinary namespace projection cannot export a conditional effect assumption");
  }
  const current = capturedNamespaceContext(call, context, services);
  const after = program.callableProofEpoch?.();
  if (current.kind === "unresolved") {
    return current;
  }
  if (
    current.value !== program ||
    readEpoch !== program.callableProofEpoch ||
    after === undefined ||
    !services.sameEpoch(epoch, after) ||
    nodes.some(({ node, native }) => node.wasForgotten() || node.compilerNode !== native)
  ) {
    return services.refusal(call, "unsupported", "namespace candidate inputs changed while discharging captured effects");
  }
  return { ...candidate, trace: { ...candidate.trace, origin: call } };
}
