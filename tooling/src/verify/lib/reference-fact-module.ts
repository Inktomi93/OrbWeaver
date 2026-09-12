// Module-origin traversal for reference-fact.ts, separated from static expression/value resolution.
import type { BindingElement, ExportSpecifier, ImportClause, ImportSpecifier, Node as MorphNode, Symbol as MorphSymbol, SourceFile } from "ts-morph";
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
  readonly services: ReferenceResolutionServices;
}
type NamespaceBinding =
  | { readonly kind: "project"; readonly moduleSpecifier: string; readonly declaration: MorphNode; readonly sourceFile: SourceFile }
  | { readonly kind: "external"; readonly moduleSpecifier: string; readonly declaration: MorphNode };
type CanonicalModuleTarget = ModuleMemberOrigin["canonical"];
const state = (services: ReferenceResolutionServices): ModuleState => ({ declarations: [], visited: new Set<object>(), services });
const cloneState = (input: ModuleState): ModuleState => ({ ...input, declarations: [...input.declarations], visited: new Set(input.visited) });
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

const requiresResolvedSource = (moduleSpecifier: string): boolean =>
  moduleSpecifier.startsWith(".") || moduleSpecifier.startsWith("/") || moduleSpecifier.startsWith("#");

const projectTarget = (declaration: MorphNode, exportedName: string): CanonicalModuleTarget => ({
  kind: "project",
  sourceFile: declaration.getSourceFile(),
  exportedName,
  declaration,
});

/** The ONE declaration kind a MODULE EXPORT symbol may legitimately carry more than once and still name one
 *  home: a function-overload set — signatures plus at most one implementation, or an ambient
 *  `declare function` set in a `.d.ts`.
 *
 *  It is deliberately not the whole TypeScript overload vocabulary. A `MethodDeclaration`/`MethodSignature`/
 *  call-signature overload set belongs to a symbol reached off a TYPE (`type-member-origin.ts`), which this
 *  axis cannot produce: every symbol that reaches here comes from `SourceFile#getExportSymbols()` or an
 *  export specifier's aliased symbol, so its declarations are module-level. Admitting kinds this reader
 *  cannot be handed would be an arm no proof row could ever turn red.
 *
 *  Everything else that yields several declarations for one exported name — an `interface`+`const` merge, a
 *  `function`+`namespace` merge, a two-file ambient module merge, an `export *` fan-in — is genuinely more
 *  than one declaration or has no unique home, and stays `ambiguous`. */
const OVERLOAD_DECLARATION_KINDS: ReadonlySet<SyntaxKind> = new Set<SyntaxKind>([SyntaxKind.FunctionDeclaration]);

/** The one declaration of an overload set that carries a body. Two bodies is not an overload set at all
 *  (it is a duplicate implementation), so the home stays unproven. */
function isOverloadImplementation(declaration: MorphNode): boolean {
  return Node.isFunctionDeclaration(declaration) && declaration.getBody() !== undefined;
}

/** ONE identity home for several declarations of one symbol, or `undefined` when they are genuinely
 *  different declarations.
 *
 *  WHY THIS EXISTS: a declaration COUNT is not an identity question. `useState`, drizzle-orm's `inArray`,
 *  `@trpc/server`'s `TRPCError` and our own `defineBusChannel` each have N declarations that are ONE symbol
 *  in ONE file (overload signatures plus an implementation, or an ambient `declare` set in a `.d.ts`), so the
 *  home is unique even though the count is not — and refusing them as `ambiguous` cost three policy families a
 *  loud "unreadable" where the precise verdict existed, and closed the `.publish` door for every bus channel
 *  on the tree (bus-pair-1584.md §1). The set is admitted only when every declaration is the same overloadable
 *  KIND, in the same SOURCE FILE, with at most one implementation body; the home is the implementation when
 *  there is one, otherwise the first signature. Two files, a value/type merge, and an `export *` fan-in all
 *  fail at least one of those and keep the refusal.
 *
 *  This is the MODULE-EXPORT axis only. A member resolved off a RECEIVER'S TYPE (`type-member-origin.ts`,
 *  `drizzle-client-call.ts`) deliberately keeps asking every declaration of the property symbol, because that
 *  reader's question is "is EVERY declaration of this member declared by that home" — a set-membership test
 *  that an overload set answers correctly as-is. */
function overloadHome(declarations: readonly MorphNode[]): MorphNode | undefined {
  const first = declarations[0];
  if (first === undefined || declarations.length < 2 || !OVERLOAD_DECLARATION_KINDS.has(first.getKind())) {
    return;
  }
  const kind = first.getKind();
  const sourceFile = first.getSourceFile().compilerNode;
  if (!declarations.every((declaration) => declaration.getKind() === kind && declaration.getSourceFile().compilerNode === sourceFile)) {
    return;
  }
  const implementations = declarations.filter(isOverloadImplementation);
  return implementations.length > 1 ? undefined : (implementations[0] ?? first);
}

const externalTarget = (declaration: MorphNode, moduleSpecifier: string, exportedName: string): CanonicalModuleTarget => ({
  kind: "external-door",
  moduleSpecifier,
  exportedName,
  declaration,
});

function originFromTarget(moduleSpecifier: string, exportedName: string, canonical: CanonicalModuleTarget): ModuleMemberOrigin {
  return { kind: "module", moduleSpecifier, exportedName, memberPath: [], declaration: canonical.declaration, canonical };
}

/** The named import that binds `exportName` locally, or `undefined` when none does OR the one that does
 *  RENAMES (`import { record as pick }`) — a renamed binding publishes a name the leaf does not own. */
function namedBindingFor(importDeclaration: import("ts-morph").ImportDeclaration, exportName: string): ImportSpecifier | undefined {
  let binding: ImportSpecifier | undefined;
  for (const specifier of importDeclaration.getNamedImports()) {
    if ((specifier.getAliasNode()?.getText() ?? specifier.getName()) === exportName) {
      binding = specifier.getAliasNode() === undefined ? specifier : undefined;
    }
  }
  return binding;
}

/** The import binding a barrel republishes UNDER ITS OWN NAME, or `undefined` when either hop renames.
 *
 *  `import { X } from "./x"; export { X };` and `import * as z from "./external"; export { z };` republish the
 *  door they imported rather than naming anything new, so the canonical home is whatever the inner door
 *  resolves to. Both shapes are live: `@trpc/server`'s `TRPCError` (7 server import specifiers) and zod 4.4.3
 *  `index.d.cts:1,3` — the latter is what closed the Zod door for `no-raw-id`.
 *
 *  NAME PRESERVATION IS THE WHOLE GUARD, and it is taken against the leaf's OWN exported name, not just the
 *  export hop: `import { record as pick } from "./leaf"; export { pick };` fails it even though the export
 *  hop is bare, because the barrel's `pick` is the leaf's `record` and the leaf may export its own `pick`.
 *  Once either hop renames, a same-named leaf export would validate a renaming re-export — the hazard the
 *  cross-file refusal was written for, pinned by three rows in `reference-fact-module.test.ts`. */
function republishedImport(declaration: ExportSpecifier, exportName: string): ImportSpecifier | import("ts-morph").NamespaceImport | undefined {
  let binding: ImportSpecifier | import("ts-morph").NamespaceImport | undefined;
  if (declaration.getAliasNode() === undefined && declaration.getName() === exportName) {
    for (const importDeclaration of declaration.getSourceFile().getImportDeclarations()) {
      const namespaceImport = importDeclaration.getNamespaceImport()?.getParentIfKind(SyntaxKind.NamespaceImport);
      binding = namespaceImport?.getName() === exportName ? namespaceImport : (namedBindingFor(importDeclaration, exportName) ?? binding);
    }
  }
  return binding;
}

/** The canonical home of a republished import. A named binding re-enters the ordinary door resolver; a
 *  NAMESPACE object has no single leaf declaration, so the home it names is the MODULE itself. */
function republishedTarget(
  binding: ImportSpecifier | import("ts-morph").NamespaceImport,
  exportName: string,
  target: ModuleState,
): ReferenceFact<CanonicalModuleTarget> {
  if (Node.isNamespaceImport(binding)) {
    const namespace = namespaceImportBinding(binding, target, target.services);
    if (namespace.kind === "unresolved") {
      return namespace;
    }
    return namespace.value.kind === "external"
      ? resolved(externalTarget(binding, namespace.value.moduleSpecifier, exportName), target, binding)
      : resolved(projectTarget(namespace.value.sourceFile, exportName), target, namespace.value.sourceFile);
  }
  const refusal = inspectStableBinding(binding, target, target.services);
  if (refusal !== undefined) {
    return refusal;
  }
  const inner = moduleOriginFromDoor(binding, binding.getName(), target);
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
  const aliasedTargets = symbol.getAliasedSymbol()?.getDeclarations() ?? [];
  const overload = overloadHome(aliasedTargets);
  const aliased = overload ?? aliasedTargets[0];
  if (aliased === undefined) {
    return unresolved("missing", declaration, target, `local export ${exportName} has no resolvable declaration`);
  }
  if (aliasedTargets.length !== 1 && overload === undefined) {
    return unresolved("ambiguous", declaration, target, `local export ${exportName} resolves to ${aliasedTargets.length} declarations`);
  }
  if (aliased.getSourceFile() !== declaration.getSourceFile()) {
    const republished = republishedImport(declaration, exportName);
    return republished === undefined
      ? unresolved("unsupported", declaration, target, `local export ${exportName} forwards an imported binding without a proven canonical export`)
      : republishedTarget(republished, exportName, target);
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
    return unresolved("unsupported", initializer, target, `export ${exportedName} aliases another binding whose canonical origin is not proven`);
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

function namespaceImportBinding(
  declaration: import("ts-morph").NamespaceImport,
  target: ModuleState,
  services: ReferenceResolutionServices,
): ReferenceFact<NamespaceBinding> {
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
  if (sourceFile === undefined) {
    return requiresResolvedSource(moduleSpecifier)
      ? unresolved("missing", importDeclaration.getModuleSpecifier(), target, `namespace door ${moduleSpecifier} has no resolvable source file`)
      : resolved({ kind: "external", moduleSpecifier, declaration }, target, declaration);
  }
  return resolved({ kind: "project", moduleSpecifier, declaration, sourceFile }, target, declaration);
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
    return namespaceImportBinding(declaration, target, services);
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
  if (binding.getInitializer() !== undefined) {
    return unresolved("dynamic", binding, target, "a destructuring default chooses its origin at runtime");
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
  if (Node.isImportClause(declaration)) {
    const refusal = inspectStableBinding(declaration, target, services);
    return refusal ?? moduleOriginFromDoor(declaration, "default", target);
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
  return resolveInternal(node, state(services), services);
}
