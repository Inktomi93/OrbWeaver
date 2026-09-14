// Checker-proven ambient global origins for reference-fact call and policy readers.
import type { BindingElement, Identifier, Node as MorphNode, Symbol as MorphSymbol } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type {
  GlobalMemberOrigin,
  ReferenceFact,
  ReferenceResolutionServices,
  ReferenceUnresolvedReason,
  ResolvedReferenceFact,
  UnresolvedReferenceFact,
} from "./reference-fact-contract.ts";

interface GlobalState {
  readonly declarations: MorphNode[];
  readonly visited: Set<object>;
}

const GLOBAL_OBJECTS = new Set(["globalThis", "self", "window"]);

function state(): GlobalState {
  return { declarations: [], visited: new Set<object>() };
}

function appendDeclaration(target: GlobalState, declaration: MorphNode): void {
  if (!target.declarations.some((existing) => existing.compilerNode === declaration.compilerNode)) {
    target.declarations.push(declaration);
  }
}

function appendTrace(target: GlobalState, declarations: readonly MorphNode[]): void {
  for (const declaration of declarations) {
    appendDeclaration(target, declaration);
  }
}

function enterDeclaration(target: GlobalState, declaration: MorphNode): boolean {
  const identity: object = declaration.compilerNode;
  if (target.visited.has(identity)) {
    return false;
  }
  target.visited.add(identity);
  appendDeclaration(target, declaration);
  return true;
}

function resolved<T>(value: T, target: GlobalState, origin: MorphNode): ResolvedReferenceFact<T> {
  return { kind: "resolved", value, trace: { declarations: [...target.declarations], origin } };
}

function unresolved(reason: ReferenceUnresolvedReason, node: MorphNode, target: GlobalState, detail: string): UnresolvedReferenceFact {
  return { kind: "unresolved", reason, detail, node, trace: { declarations: [...target.declarations], origin: node } };
}

function mergeUnresolved(fact: UnresolvedReferenceFact, target: GlobalState): UnresolvedReferenceFact {
  appendTrace(target, fact.trace.declarations);
  return unresolved(fact.reason, fact.node, target, fact.detail);
}

function isGlobalAugmentation(declaration: MorphNode): boolean {
  return declaration.getAncestors().some((ancestor) => Node.isModuleDeclaration(ancestor) && ancestor.getName().replace(/^['"]|['"]$/gu, "") === "global");
}

function isAmbientGlobalDeclaration(declaration: MorphNode): boolean {
  const sourceFile = declaration.getSourceFile();
  const path = sourceFile.getFilePath().replaceAll("\\", "/");
  const trustedDeclaration = path.includes("/node_modules/typescript/lib/lib.") || path.includes("/node_modules/@types/");
  const scriptGlobal = sourceFile.getImportDeclarations().length === 0 && sourceFile.getExportDeclarations().length === 0;
  return trustedDeclaration && sourceFile.isDeclarationFile() && (scriptGlobal || isGlobalAugmentation(declaration));
}

function ambientDeclarations(symbol: MorphSymbol, node: MorphNode, target: GlobalState): ReferenceFact<readonly MorphNode[]> {
  const declarations = symbol.getDeclarations();
  if (declarations.length === 0) {
    return unresolved("missing", node, target, `the symbol for ${symbol.getName()} has no declaration`);
  }
  if (!declarations.every(isAmbientGlobalDeclaration)) {
    return unresolved("missing", node, target, `${symbol.getName()} is shadowed by a non-ambient declaration`);
  }
  for (const declaration of declarations) {
    appendDeclaration(target, declaration);
  }
  return resolved(declarations, target, declarations[0] ?? node);
}

function declarationOf(identifier: Identifier, target: GlobalState, services: ReferenceResolutionServices): ReferenceFact<MorphNode> {
  const fact = services.declarationOf(identifier);
  if (fact.kind === "unresolved") {
    return mergeUnresolved(fact, target);
  }
  return resolved(fact.value, target, fact.value);
}

function bindingName(binding: BindingElement, target: GlobalState, services: ReferenceResolutionServices): ReferenceFact<string> {
  if (binding.getDotDotDotToken() !== undefined || binding.getInitializer() !== undefined) {
    return unresolved("dynamic", binding, target, "a rest/default binding does not have one stable global origin");
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
    const fact = services.readComputedName(property.getExpression());
    return fact.kind === "unresolved" ? mergeUnresolved(fact, target) : resolved(fact.value, target, fact.trace.origin);
  }
  return unresolved("unsupported", property, target, `${property.getKindName()} does not name one destructured global member`);
}

function appendMember(origin: GlobalMemberOrigin, name: string, declarations: readonly MorphNode[]): GlobalMemberOrigin {
  if (GLOBAL_OBJECTS.has(origin.globalName) && origin.memberPath.length === 0) {
    return { kind: "global", globalName: name, memberPath: [], declarations };
  }
  return { ...origin, memberPath: [...origin.memberPath, name], declarations: [...origin.declarations, ...declarations] };
}

function globalFromBinding(binding: BindingElement, target: GlobalState, services: ReferenceResolutionServices): ReferenceFact<GlobalMemberOrigin> {
  const pattern = binding.getParent();
  const variable = binding.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  if (!Node.isObjectBindingPattern(pattern) || variable === undefined || pattern.getParent() !== variable) {
    return unresolved("unsupported", binding, target, "nested and array destructuring are not global-member bindings");
  }
  if (!enterDeclaration(target, binding)) {
    return unresolved("cycle", binding, target, `global binding cycle at ${binding.getText()}`);
  }
  const stability = services.inspectStableBinding(binding);
  if (stability.kind === "unresolved") {
    return mergeUnresolved(stability, target);
  }
  const name = bindingName(binding, target, services);
  if (name.kind === "unresolved") {
    return name;
  }
  const receiver = variable.getInitializer();
  if (receiver === undefined) {
    return unresolved("missing", variable, target, "destructuring declaration has no receiver initializer");
  }
  const origin = resolveInternal(receiver, target, services);
  if (origin.kind === "unresolved") {
    return origin;
  }
  const symbol = receiver.getType().getProperty(name.value);
  if (symbol === undefined) {
    return unresolved("missing", binding, target, `checker resolved no property symbol for ${name.value}`);
  }
  const writes = services.inspectSymbolWrites(symbol, binding);
  if (writes.kind === "unresolved") {
    return mergeUnresolved(writes, target);
  }
  const ambient = ambientDeclarations(symbol, binding, target);
  return ambient.kind === "unresolved" ? ambient : resolved(appendMember(origin.value, name.value, ambient.value), target, ambient.trace.origin);
}

function globalFromVariable(
  declaration: import("ts-morph").VariableDeclaration,
  target: GlobalState,
  services: ReferenceResolutionServices,
): ReferenceFact<GlobalMemberOrigin> {
  if (!enterDeclaration(target, declaration)) {
    return unresolved("cycle", declaration, target, `global alias cycle at ${declaration.getName()}`);
  }
  const stability = services.inspectStableBinding(declaration);
  if (stability.kind === "unresolved") {
    return mergeUnresolved(stability, target);
  }
  const initializer = declaration.getInitializer();
  return initializer === undefined
    ? unresolved("missing", declaration, target, `global alias ${declaration.getName()} has no initializer`)
    : resolveInternal(initializer, target, services);
}

function globalFromIdentifier(identifier: Identifier, target: GlobalState, services: ReferenceResolutionServices): ReferenceFact<GlobalMemberOrigin> {
  const symbol = identifier.getSymbol();
  if (symbol === undefined) {
    return unresolved("missing", identifier, target, `no checker symbol binds ${identifier.getText()}`);
  }
  const declarations = symbol.getDeclarations();
  const intrinsicGlobalThis = identifier.getText() === "globalThis" && declarations.length === 0;
  if (intrinsicGlobalThis) {
    const writes = services.inspectReferenceWrites(identifier);
    if (writes.kind === "unresolved") {
      return mergeUnresolved(writes, target);
    }
    return resolved({ kind: "global", globalName: "globalThis", memberPath: [], declarations: [] }, target, identifier);
  }
  const ambient = ambientDeclarations(symbol, identifier, target);
  if (ambient.kind === "resolved") {
    const writes = services.inspectReferenceWrites(identifier);
    if (writes.kind === "unresolved") {
      return mergeUnresolved(writes, target);
    }
    return resolved({ kind: "global", globalName: symbol.getName(), memberPath: [], declarations: ambient.value }, target, ambient.trace.origin);
  }
  const declaration = declarationOf(identifier, target, services);
  if (declaration.kind === "unresolved") {
    return declaration;
  }
  if (Node.isVariableDeclaration(declaration.value)) {
    return globalFromVariable(declaration.value, target, services);
  }
  if (Node.isBindingElement(declaration.value)) {
    return globalFromBinding(declaration.value, target, services);
  }
  if (Node.isParameterDeclaration(declaration.value)) {
    return unresolved("missing", declaration.value, target, `parameter ${identifier.getText()} shadows the ambient global`);
  }
  return unresolved("missing", declaration.value, target, `${declaration.value.getKindName()} is not an ambient global or immutable alias`);
}

function globalFromMember(node: MorphNode, target: GlobalState, services: ReferenceResolutionServices): ReferenceFact<GlobalMemberOrigin> {
  const read = services.readMemberReference(node);
  if (read.kind === "unresolved") {
    return mergeUnresolved(read, target);
  }
  appendTrace(target, read.trace.declarations);
  const receiver = resolveInternal(read.value.receiver, target, services);
  if (receiver.kind === "unresolved") {
    return receiver;
  }
  const symbol = read.value.receiver.getType().getProperty(read.value.name);
  if (symbol === undefined) {
    return unresolved("missing", read.value.nameNode, target, `checker resolved no property symbol for ${read.value.name}`);
  }
  const writes = services.inspectSymbolWrites(symbol, read.value.nameNode);
  if (writes.kind === "unresolved") {
    return mergeUnresolved(writes, target);
  }
  const ambient = ambientDeclarations(symbol, read.value.nameNode, target);
  if (ambient.kind === "unresolved") {
    return ambient;
  }
  return resolved(appendMember(receiver.value, read.value.name, ambient.value), target, ambient.trace.origin);
}

function resolveInternal(node: MorphNode, target: GlobalState, services: ReferenceResolutionServices): ReferenceFact<GlobalMemberOrigin> {
  const current = services.unwrapExpression(node);
  if (Node.isPropertyAccessExpression(current) || Node.isElementAccessExpression(current)) {
    return globalFromMember(current, target, services);
  }
  if (Node.isIdentifier(current)) {
    return globalFromIdentifier(current, target, services);
  }
  return unresolved("dynamic", current, target, `${current.getKindName()} has no stable ambient-global origin`);
}

export function resolveGlobalMemberOriginWith(node: MorphNode, services: ReferenceResolutionServices): ReferenceFact<GlobalMemberOrigin> {
  return resolveInternal(node, state(), services);
}
