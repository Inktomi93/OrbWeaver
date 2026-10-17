// Checker-proven ambient global origins for reference-fact call and policy readers.
import type { BindingElement, Identifier, Node as MorphNode, Symbol as MorphSymbol } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type {
  CallReturnObservations,
  CallReturnProgram,
  GlobalMemberOrigin,
  NativeAmbientCallServices,
  NativeStringCall,
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

/** Ambient global-object names are syntax; their actual binding still requires native declaration identity. */
export const GLOBAL_OBJECTS: ReadonlySet<string> = new Set(["globalThis", "self", "window"]);

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

/** The SHAPE of a declaration that ambiently names a global: a non-module `.d.ts` (no top-level
 *  import/export — a "script global") or a member sitting inside a `declare global {}` block. Shape
 *  alone does not prove trust — see `isAmbientGlobalDeclaration` below — because a hand-authored `.d.ts`
 *  anywhere in the repo can take this shape while inventing a name no runtime actually carries. */
function isGlobalAugmentationShaped(declaration: MorphNode): boolean {
  const sourceFile = declaration.getSourceFile();
  const scriptGlobal = sourceFile.getImportDeclarations().length === 0 && sourceFile.getExportDeclarations().length === 0;
  return sourceFile.isDeclarationFile() && (scriptGlobal || isGlobalAugmentation(declaration));
}

/** A declaration trusted ENOUGH to establish, on its own, that a symbol names a real ambient global:
 *  shipped inside TypeScript's own libs or a `@types/*` package. */
function isAmbientGlobalDeclaration(declaration: MorphNode): boolean {
  const path = declaration.getSourceFile().getFilePath().replaceAll("\\", "/");
  const trustedDeclaration = path.includes("/node_modules/typescript/lib/lib.") || path.includes("/node_modules/@types/");
  return trustedDeclaration && isGlobalAugmentationShaped(declaration);
}

function ambientDeclarations(symbol: MorphSymbol, node: MorphNode, target: GlobalState): ReferenceFact<readonly MorphNode[]> {
  const declarations = symbol.getDeclarations();
  if (declarations.length === 0) {
    return unresolved("missing", node, target, `the symbol for ${symbol.getName()} has no declaration`);
  }
  // A symbol counts as the runtime's own ambient global only once ONE of its declarations is itself
  // trusted (a lib or `@types/*` declaration proves the identity independent of anything the repo or a
  // vendored package authored) — an untrusted declaration set, however global-shaped, never earns the
  // identity on its own (#2037's `fake.d.ts`/`augmented.d.ts` controls). Once that anchor exists, an
  // ADDITIONAL merged declaration outside a trusted path is still the SAME symbol, not a different one:
  // the repo's own `platform.d.ts` and a package's global augmentation (`@total-typescript/ts-reset`)
  // both merge INTO the lib's `Map`/`Set`/etc. interface rather than inventing a new global, so requiring
  // every declaration to be independently trusted was refusing the runtime's own collections whenever an
  // augmentation loaded beside them. Every declaration still has to be augmentation-SHAPED — a real
  // module-alias import (`ImportSpecifier`/`ImportClause`/`NamespaceImport`/`ExportSpecifier`) never is.
  const isAmbient = declarations.some(isAmbientGlobalDeclaration) && declarations.every(isGlobalAugmentationShaped);
  if (!isAmbient) {
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

function primitiveStringInput(type: import("ts-morph").Type): boolean {
  const alternatives = type.isUnion() ? type.getUnionTypes() : [type];
  return (
    alternatives.length > 0 &&
    alternatives.every(
      (value) => value.isString() || value.isStringLiteral() || value.isNumber() || value.isNumberLiteral() || value.isBoolean() || value.isBooleanLiteral(),
    )
  );
}

function nativeSource(node: MorphNode, program: CallReturnProgram): boolean {
  const source = node.getSourceFile();
  return program.program.getSourceFile(source.getFilePath()) === source.compilerNode && program.program.isSourceFileDefaultLibrary(source.compilerNode);
}

function ambientValue(origin: GlobalMemberOrigin, call: MorphNode, program: CallReturnProgram, target: GlobalState): ReferenceFact<MorphNode> {
  const checker = program.program.getTypeChecker();
  const values = origin.declarations.map((declaration) => {
    const symbol = declaration.getSymbol();
    return symbol === undefined ? undefined : checker.getMergedSymbol(symbol.compilerSymbol).valueDeclaration;
  });
  const selected = values[0];
  const value = origin.declarations.find((declaration) => declaration.compilerNode === selected);
  if (value === undefined || values.some((candidate) => candidate !== selected)) {
    return unresolved("ambiguous", call, target, "the ambient symbol has no unique checker-selected VALUE declaration");
  }
  if (!(Node.isVariableDeclaration(value) && origin.declarations.every((declaration) => nativeSource(declaration, program)) && nativeSource(value, program))) {
    return unresolved("unsupported", call, target, "the ambient VALUE or merged declaration is not supplied by the selected native libraries");
  }
  appendDeclaration(target, value);
  return resolved(value, target, value);
}

function stableAmbientValue(
  value: ReferenceFact<MorphNode>,
  call: MorphNode,
  target: GlobalState,
  services: NativeAmbientCallServices,
): ReferenceFact<MorphNode> {
  if (value.kind === "unresolved") {
    return value;
  }
  const symbol = value.value.getSymbol();
  if (symbol === undefined) {
    return unresolved("missing", call, target, "the native VALUE has no write-inspection symbol");
  }
  const stable = services.inspectSymbolWrites(symbol, call);
  return stable.kind === "unresolved" ? mergeUnresolved(stable, target) : value;
}

// Only rejection leaves about this exact binding can prove a surviving primitive; authored predicates cannot.
function rejectsNonprimitive(condition: MorphNode, home: MorphNode, services: NativeAmbientCallServices): boolean {
  const value = services.unwrapExpression(condition);
  if (!Node.isBinaryExpression(value)) {
    return false;
  }
  const operator = value.getOperatorToken().getKind();
  if (operator === SyntaxKind.AmpersandAmpersandToken) {
    return rejectsNonprimitive(value.getLeft(), home, services) && rejectsNonprimitive(value.getRight(), home, services);
  }
  const left = services.unwrapExpression(value.getLeft());
  const right = value.getRight();
  if (operator !== SyntaxKind.ExclamationEqualsEqualsToken || !Node.isTypeOfExpression(left) || !Node.isStringLiteral(right)) {
    return false;
  }
  const input = services.unwrapExpression(left.getExpression());
  const declaration = Node.isIdentifier(input) ? services.declarationOf(input) : undefined;
  return (
    ["string", "number", "boolean"].includes(right.getLiteralText()) && declaration?.kind === "resolved" && declaration.value.compilerNode === home.compilerNode
  );
}

function guardedUnknownInput(value: MorphNode, target: GlobalState, services: NativeAmbientCallServices): ReferenceFact<boolean> {
  if (!Node.isIdentifier(value)) {
    return resolved(false, target, value);
  }
  const declaration = declarationOf(value, target, services);
  if (declaration.kind === "unresolved") {
    return declaration;
  }
  const home = declaration.value;
  const name = Node.isVariableDeclaration(home) || Node.isParameterDeclaration(home) ? home.getNameNode() : undefined;
  if (name?.getType().isUnknown() !== true || (Node.isVariableDeclaration(home) && home.getInitializer() === undefined)) {
    return resolved(false, target, home);
  }
  const stable = services.inspectReferenceWrites(value);
  if (stable.kind === "unresolved") {
    return mergeUnresolved(stable, target);
  }
  const body = value.getFirstAncestor((ancestor) => Node.isBlock(ancestor) || Node.isFunctionLikeDeclaration(ancestor));
  const ancestors = value.getAncestors();
  const statements = body !== undefined && Node.isBlock(body) ? body.getStatements() : [];
  const at = statements.findIndex((statement) => ancestors.includes(statement));
  const guard = statements.slice(0, Math.max(at, 0)).find((statement) => {
    if (!Node.isIfStatement(statement) || statement.getElseStatement() !== undefined) {
      return false;
    }
    const branch = statement.getThenStatement();
    const exit = Node.isBlock(branch) && branch.getStatements().length === 1 ? branch.getStatements()[0] : branch;
    return Node.isReturnStatement(exit) && rejectsNonprimitive(statement.getExpression(), home, services);
  });
  return resolved(guard !== undefined, target, guard ?? value);
}

function narrowedInput(argument: MorphNode, target: GlobalState, services: NativeAmbientCallServices): ReferenceFact<import("ts-morph").Type> {
  const value = services.unwrapExpression(argument);
  const type = value.getType();
  if (!primitiveStringInput(type)) {
    return unresolved("unsupported", argument, target, "String input is not narrowed to primitive string, number or boolean");
  }
  const source = services.resolveStableExpression(value);
  appendTrace(target, source.trace.declarations);
  if (source.kind === "unresolved" && !["dynamic", "missing"].includes(source.reason)) {
    return mergeUnresolved(source, target);
  }
  const origin = source.kind === "resolved" ? source.value : source.node;
  if (source.kind === "resolved" && primitiveStringInput(origin.getType())) {
    return resolved(type, target, value);
  }
  if (origin.getType().isUnknown()) {
    const declaration = guardedUnknownInput(value, target, services);
    if (declaration.kind === "unresolved") {
      return declaration;
    }
    if (declaration.value) {
      return resolved(type, target, value);
    }
  }
  return unresolved("unsupported", argument, target, "String input lacks an authored primitive source or dominating same-binding native typeof rejection");
}

function ambientSignature(
  call: import("ts-morph").CallExpression,
  value: MorphNode,
  program: CallReturnProgram,
  target: GlobalState,
): ReferenceFact<import("ts-morph").Signature> {
  const signature = call.getProject().getTypeChecker().getResolvedSignature(call);
  const nativeType = value.getType();
  const declarations = nativeType.getSymbol()?.getDeclarations() ?? [];
  if (
    signature === undefined ||
    !nativeSource(signature.getDeclaration(), program) ||
    declarations.length === 0 ||
    !declarations.every((declaration) => nativeSource(declaration, program)) ||
    !nativeType.getCallSignatures().some((candidate) => candidate.compilerSignature === signature.compilerSignature) ||
    !signature.getReturnType().isString()
  ) {
    return unresolved("unsupported", call, target, "the selected signature is not the native ambient VALUE call signature");
  }
  return resolved(signature, target, signature.getDeclaration());
}

/** Classify one captured native String call without changing declaration/module multiplicity or trusting a return annotation. */
export function readNativeStringCallWith(
  node: MorphNode,
  observations: CallReturnObservations,
  services: NativeAmbientCallServices,
): ReferenceFact<NativeStringCall> {
  const target = state();
  const captured = services.readCallReturnProgram(node, observations);
  if (captured.kind === "unresolved") {
    return mergeUnresolved(captured, target);
  }
  if (!(Node.isCallExpression(node) && captured.value.byCall.has(node.compilerNode))) {
    return unresolved("unsupported", node, target, "the captured source does not supply this actual call");
  }
  const origin = resolveGlobalMemberOriginWith(node.getExpression(), services);
  if (origin.kind === "unresolved") {
    return mergeUnresolved(origin, target);
  }
  appendTrace(target, origin.trace.declarations);
  if (origin.value.globalName !== "String" || origin.value.memberPath.length > 0) {
    return unresolved("unsupported", node, target, "the actual ambient origin is not the direct String intrinsic");
  }
  const value = stableAmbientValue(ambientValue(origin.value, node, captured.value, target), node, target, services);
  if (value.kind === "unresolved") {
    return value;
  }
  const signature = ambientSignature(node, value.value, captured.value, target);
  if (signature.kind === "unresolved") {
    return signature;
  }
  const argument = node.getArguments()[0];
  if (argument === undefined || node.getArguments().length !== 1 || Node.isSpreadElement(argument)) {
    return unresolved("unsupported", node, target, "String conversion requires one actual primitive argument");
  }
  const input = narrowedInput(argument, target, services);
  if (input.kind === "unresolved") {
    return input;
  }
  appendDeclaration(target, signature.value.getDeclaration());
  return resolved(
    {
      call: node,
      origin: origin.value,
      valueDeclaration: value.value,
      signature: signature.value,
      argument,
      argumentType: input.value,
      program: captured.value,
    },
    target,
    node,
  );
}
