// Native member and type declaration facts; receiver and member refusal anchors remain distinct.
import { readMemberReference } from "@orb/tooling/floor/code-facts/reference-fact";
import type { ReferenceFact } from "@orb/tooling/floor/code-facts/reference-fact-contract";
import type { CallExpression, Node as MorphNode, SourceFile, Type, TypeAliasDeclaration, TypeParameterDeclaration } from "ts-morph";
import { createWrappedNode, Node, SyntaxKind, ts } from "ts-morph";
import { resolveCallableDeclaration } from "./reference-fact-call.ts";
import type {
  CallMemberDeclarationOrigin,
  ContextualMemberOrigin,
  DeclaredCallTerminalSelection,
  NativeParserTypeContext,
  NativeSubstitutedTypeInput,
  NativeSubstitutedTypeSlot,
  NativeTypeIdentityGraphInput,
  TypeIdentityOrigin,
  TypeMemberOrigin,
} from "./type-member-origin-contract.ts";
import { annotationReferenceOrigin, normalizedPath, resolved, resolveTypePropertyValue, symbolDeclarations, unresolved } from "./type-member-origin-core.ts";
import type { TypeObservationReader } from "./type-observations-contract.ts";
import { nodeTypeSelector } from "./type-projection-contract.ts";

/** The refusal classifier deliberately treats only a dotted member's name as its binding leaf. */
export function originRefusalLeaf(node: MorphNode): MorphNode {
  return Node.isPropertyAccessExpression(node) ? node.getNameNode() : node;
}

/** Project existing invoked-member meaning without retaining its native property Symbol. */
export function readCallMemberDeclarationOrigin(call: CallExpression): CallMemberDeclarationOrigin {
  const callee = call.getExpression();
  const member = readMemberReference(callee);
  const origin = member.kind === "resolved" ? resolveTypeMemberOrigin(callee) : member;
  return {
    name: member.kind === "resolved" ? member.value.name : null,
    origin: origin.kind === "resolved" ? { ...origin, value: origin.value.declarations } : origin,
  };
}

/** Resolve one property read to the declarations of the property symbol the checker found on the receiver's
 *  type. Dotted, optional, and computed-literal spellings normalize through the shared member reader, so a
 *  `x["setQueryData"]` respelling is the same fact; an assignment target refuses as a write. */
export function resolveTypeMemberOrigin(node: MorphNode): ReferenceFact<TypeMemberOrigin> {
  const read = readMemberReference(node);
  if (read.kind === "unresolved") {
    return read;
  }
  const { name, receiver, nameNode, access } = read.value;
  // NON-NULLABLE on purpose: an optional chain (`cache?.setQueryData`) types its receiver as
  // `Cache | undefined`, and a union carrying `undefined` exposes NO property symbols at all — the read
  // would refuse as `missing` on a spelling that is the same fact. The read only happens when the receiver
  // is present, so the present arm is the one whose home the policy is asking about.
  const symbol = receiver.getType().getNonNullableType().getProperty(name);
  if (symbol === undefined) {
    return unresolved("missing", nameNode, `the checker resolved no property symbol named ${name} on ${receiver.getText()}`);
  }
  const declarations = symbolDeclarations(symbol, nameNode, `property ${name}`);
  return declarations.kind === "unresolved"
    ? declarations
    : resolved({ name, access, receiver, nameNode, symbol, declarations: declarations.value }, nameNode, declarations.value);
}

/** Resolve one object-literal key to the property of the CONTEXTUAL type the literal is checked against.
 *  The key's own symbol declares on the literal and therefore carries no identity at all; the contextual
 *  property is what says the key belongs to a query-options type rather than an unrelated config bag. */
export function resolveContextualMemberOrigin(node: MorphNode): ReferenceFact<ContextualMemberOrigin> {
  if (!Node.isPropertyAssignment(node)) {
    return unresolved("unsupported", node, `${node.getKindName()} is not an object-literal property assignment`);
  }
  const nameNode = node.getNameNode();
  if (Node.isComputedPropertyName(nameNode)) {
    return unresolved("dynamic", nameNode, "a computed key does not name one contextual property");
  }
  // ts-morph types a PropertyAssignment's parent as the ObjectLiteralExpression that owns it, so there is
  // no other-parent arm to write — a `!isObjectLiteralExpression` guard narrows to `never` and reds TS7.
  const literal = node.getParent();
  const contextual = literal.getContextualType();
  if (contextual === undefined) {
    return unresolved("missing", literal, "the object literal has no contextual type");
  }
  const name = node.getName();
  const symbol = contextual.getNonNullableType().getProperty(name);
  if (symbol === undefined) {
    return unresolved("missing", nameNode, `the contextual type declares no property named ${name}`);
  }
  const declarations = symbolDeclarations(symbol, nameNode, `contextual property ${name}`);
  return declarations.kind === "unresolved"
    ? declarations
    : resolved({ name, assignment: node, nameNode, literal, symbol, declarations: declarations.value }, nameNode, declarations.value);
}

// Node and callable-result queries retain the same compiler alias and declaration identity.
function typeIdentityOrigin(type: Type, node: MorphNode): ReferenceFact<TypeIdentityOrigin> {
  const alias = type.getAliasSymbol();
  const symbol = alias ?? type.getSymbol();
  if (symbol === undefined) {
    return unresolved("missing", node, `the checker resolved no named type for ${node.getText()}`);
  }
  const declarations = symbolDeclarations(symbol, node, `type ${symbol.getName()}`);
  return declarations.kind === "unresolved"
    ? declarations
    : resolved({ name: symbol.getName(), node, aliased: alias !== undefined, declarations: declarations.value }, node, declarations.value);
}

/** Resolve a node's own TYPE to the declarations of the symbol that names it — the alias symbol when the
 *  checker kept one (`GatedStoreHook<T>`), otherwise the structural symbol. */
export function resolveTypeIdentityOrigin(node: MorphNode): ReferenceFact<TypeIdentityOrigin> {
  return typeIdentityOrigin(node.getType(), node);
}

/** Preserve the native alias-before-symbol identity in the explicitly supplied importing capture. */
export function observedTypeIdentityOrigin(node: MorphNode, readers: TypeObservationReader): ReferenceFact<TypeIdentityOrigin> {
  const selected = readers.select(nodeTypeSelector(node));
  if (selected === null) {
    return unresolved("missing", node, `the checker resolved no named type for ${node.getText()}`);
  }
  const type = readers.type(selected);
  const symbol = type.aliasSymbol ?? type.symbol;
  if (symbol === null) {
    return unresolved("missing", node, `the checker resolved no named type for ${node.getText()}`);
  }
  const data = readers.symbolData(symbol);
  return data.declarations.length === 0
    ? unresolved("missing", node, `type ${data.name} has no declaration`)
    : resolved({ name: data.name, node, aliased: type.aliasSymbol !== null, declarations: data.declarations }, node, data.declarations);
}

// The callable owner, not a selected overload guess, supplies both result queries.
function callableReturnType(node: MorphNode): ReferenceFact<Type> {
  const callable = resolveCallableDeclaration(node);
  if (callable.kind === "unresolved") {
    return callable;
  }
  const declaration = callable.value.declaration;
  if (
    !(
      Node.isFunctionDeclaration(declaration) ||
      Node.isArrowFunction(declaration) ||
      Node.isFunctionExpression(declaration) ||
      Node.isMethodDeclaration(declaration)
    )
  ) {
    return unresolved("unsupported", node, "the callable has no native return-type signature");
  }
  const result = declaration.getReturnType().getAwaitedType();
  return result === undefined
    ? unresolved("missing", node, "the checker resolved no awaited callable result")
    : resolved(result, node, callable.trace.declarations);
}

/** Resolve the native awaited result of the same callable declaration the origin reader admits. */
export function resolveReturnTypeIdentityOrigin(node: MorphNode): ReferenceFact<TypeIdentityOrigin> {
  const result = callableReturnType(node);
  return result.kind === "unresolved" ? result : typeIdentityOrigin(result.value, node);
}

// Only actual data members carry a nested value; function signatures and phantom type arguments do not.
function returnedDataChildren(type: Type, node: MorphNode): readonly Type[] {
  const parts = [...type.getUnionTypes(), ...type.getIntersectionTypes()];
  if (parts.length > 0) {
    return parts;
  }
  if (type.isTuple()) {
    return type.getTupleElements();
  }
  const element = type.getArrayElementType();
  if (element !== undefined) {
    return [element];
  }
  if (!type.isObject()) {
    return [];
  }
  const indexed = [type.getStringIndexType(), type.getNumberIndexType()].filter((member) => member !== undefined);
  return [...type.getProperties().map((property) => property.getTypeAtLocation(node)), ...indexed];
}

/** Named identities physically carried by the callable's returned data, including wrappers and containers.
 * Callable parameters/results and erased generic arguments are not carried data. An optional declaration
 * home ends the query when that identity is proven, without expanding the service's remaining type universe. */
export function resolveReturnTypeIdentityGraph(node: MorphNode, stopAtDeclarationHome?: string): ReferenceFact<readonly TypeIdentityOrigin[]> {
  const result = callableReturnType(node);
  return result.kind === "unresolved" ? result : typeIdentityGraph(result.value, node, { kind: "returned-data", stopAtDeclarationHome });
}

type IdentityGraphMode =
  | { readonly kind: "returned-data"; readonly stopAtDeclarationHome: string | undefined }
  | { readonly kind: "signature-exposure"; readonly parser: NativeParserTypeContext };

function signatureTypeChildren(type: Type, node: MorphNode): readonly Type[] {
  const signatures = [...type.getCallSignatures(), ...type.getConstructSignatures()];
  const awaited = type.getAwaitedType();
  return [
    ...(awaited === undefined || awaited.compilerType === type.compilerType ? [] : [awaited]),
    ...signatures.flatMap((signature) => [...signature.getParameters().map((parameter) => parameter.getTypeAtLocation(node)), signature.getReturnType()]),
  ];
}

function graphRefusal(node: MorphNode, detail: string, declarations: readonly MorphNode[]): ReferenceFact<readonly TypeIdentityOrigin[]> {
  return { ...unresolved("unsupported", node, detail), trace: { origin: node, declarations } };
}

function graphChain(type: Type, node: MorphNode, mode: IdentityGraphMode): readonly TypeIdentityOrigin[] {
  if (mode.kind === "returned-data" && (type.getCallSignatures().length > 0 || type.getConstructSignatures().length > 0)) {
    return [];
  }
  const identity = typeIdentityOrigin(type, node);
  return identity.kind === "resolved" ? identityChain(identity.value) : [];
}

function graphChildren(type: Type, node: MorphNode, mode: IdentityGraphMode): readonly Type[] {
  if (mode.kind === "returned-data" && (type.getCallSignatures().length > 0 || type.getConstructSignatures().length > 0)) {
    return [];
  }
  return [...returnedDataChildren(type, node), ...(mode.kind === "signature-exposure" ? signatureTypeChildren(type, node) : [])];
}

function nativeGraphRefusal(
  type: Type,
  chain: readonly TypeIdentityOrigin[],
  ancestors: ReadonlySet<object>,
  parser: NativeParserTypeContext,
): string | undefined {
  if (type.isAny() || type.isUnknown() || type.isTypeParameter()) {
    return "signature exposure has an unresolved native type";
  }
  const declarations = chain.flatMap((identity) => identity.declarations);
  if (
    declarations.some((declaration) => parser.program.getSourceFile(declaration.getSourceFile().getFilePath()) !== declaration.getSourceFile().compilerNode)
  ) {
    return "signature exposure contains a foreign or stale declaration";
  }
  return declarations.some((declaration) => ancestors.has(declaration.compilerNode)) ? "signature exposure recursively expands a declaration" : undefined;
}

function typeIdentityGraph(root: Type, node: MorphNode, mode: IdentityGraphMode): ReferenceFact<readonly TypeIdentityOrigin[]> {
  const pending: { readonly type: Type; readonly ancestors: ReadonlySet<object> }[] = [{ type: root, ancestors: new Set() }];
  const visited = new Set<object>();
  const identities: TypeIdentityOrigin[] = [];
  const declarations: MorphNode[] = [];
  const refusals = new Set<string>();
  for (const { type, ancestors } of pending) {
    if (visited.has(type.compilerType)) {
      continue;
    }
    visited.add(type.compilerType);
    const chain = graphChain(type, node, mode);
    identities.push(...chain);
    declarations.push(...chain.flatMap((identity) => identity.declarations));
    if (mode.kind === "signature-exposure") {
      declarations.push(...[...type.getCallSignatures(), ...type.getConstructSignatures()].map((signature) => signature.getDeclaration()));
    }
    if (
      mode.kind === "returned-data" &&
      chain.some((origin) => origin.declarations.some((declaration) => normalizedPath(declaration) === mode.stopAtDeclarationHome))
    ) {
      break;
    }
    const refusal = mode.kind === "signature-exposure" ? nativeGraphRefusal(type, chain, ancestors, mode.parser) : undefined;
    if (refusal !== undefined) {
      refusals.add(refusal);
      continue;
    }
    const lineage = new Set([...ancestors, ...chain.flatMap((identity) => identity.declarations.map((declaration) => declaration.compilerNode))]);
    for (const child of graphChildren(type, node, mode)) {
      pending.push({ type: child, ancestors: lineage });
    }
  }
  return refusals.size > 0 ? graphRefusal(node, [...refusals].join("; "), declarations) : resolved(identities, node, declarations);
}

/** Inspect signature/data exposure using only the supplied parser Program, never callable/value resolution. */
export function readParserSignatureTypeIdentities(input: NativeTypeIdentityGraphInput): ReferenceFact<readonly TypeIdentityOrigin[]> {
  const { node, rootType, parser } = input;
  const source = node.getSourceFile();
  const wrapped = createWrappedNode(node, { typeChecker: parser.checker, sourceFile: source });
  if (
    source !== parser.source ||
    parser.program.getSourceFile(source.fileName) !== source ||
    parser.program.getTypeChecker() !== parser.checker ||
    parser.checker.getTypeAtLocation(node) !== rootType
  ) {
    return unresolved("unsupported", wrapped, "signature exposure parser node/type/checker belongs to a foreign or stale epoch");
  }
  return typeIdentityGraph(wrapped.getType(), wrapped, { kind: "signature-exposure", parser });
}

/** Resolve the direct array element's named identity, never a type nested inside that element. */
export function resolveArrayElementTypeIdentityOrigin(node: MorphNode): ReferenceFact<TypeIdentityOrigin> {
  const element = node.getType().getArrayElementType();
  const symbol = element?.getSymbol();
  if (symbol === undefined) {
    return unresolved("missing", node, "the checker resolved no named direct array element type");
  }
  const declarations = symbolDeclarations(symbol, node, `array element ${symbol.getName()}`);
  return declarations.kind === "unresolved"
    ? declarations
    : resolved({ name: symbol.getName(), node, aliased: false, declarations: declarations.value }, node, declarations.value);
}

/** One step UP a declared type-alias chain: `type MyHook = GatedStoreHook<T>` steps from `MyHook` to
 *  `GatedStoreHook`, following an import specifier to the real declaration on the way. */
function aliasStep(origin: TypeIdentityOrigin, directOnly = false): TypeIdentityOrigin | undefined {
  let step: TypeIdentityOrigin | undefined;
  for (const declaration of origin.declarations) {
    if (step !== undefined || !Node.isTypeAliasDeclaration(declaration)) {
      continue;
    }
    const typeNode = declaration.getTypeNode();
    if (typeNode === undefined || !Node.isTypeReference(typeNode) || (directOnly && typeNode.getTypeArguments().length > 0)) {
      continue;
    }
    const nameNode = typeNode.getTypeName();
    const symbol = nameNode.getSymbol();
    const target = symbol?.getAliasedSymbol() ?? symbol;
    const declarations = target?.getDeclarations() ?? [];
    if (target !== undefined && declarations.length > 0) {
      step = { name: target.getName(), node: nameNode, aliased: true, declarations };
    }
  }
  return step;
}

/** Every type identity a node's type resolves through, OUTERMOST FIRST, walking declared type aliases to
 *  their root. Unresolved exactly when {@link resolveTypeIdentityOrigin} is, so a caller has one door.
 *
 *  WHY A CHAIN AND NOT ONE NAME: the checker keeps the OUTERMOST alias symbol, so a store hook re-aliased
 *  one hop (`type MyHook = GatedStoreHook<S>; declare const useUserStore: MyHook`) reports as `MyHook`
 *  declared in the CONSUMING file, and a home test against the outermost name alone silently misses it. That
 *  is the same alias/re-export positive twin every policy in this family owes on its other axes; the walk is
 *  bounded by a visited set over declaration identity, so a self-referential alias terminates. */
export function resolveTypeIdentityChain(node: MorphNode): ReferenceFact<readonly TypeIdentityOrigin[]> {
  const first = resolveTypeIdentityOrigin(node);
  if (first.kind === "unresolved") {
    return first;
  }
  const chain = identityChain(first.value);
  return resolved(
    chain,
    node,
    chain.flatMap((origin) => origin.declarations),
  );
}

function identityChain(first: TypeIdentityOrigin, directOnly = false): readonly TypeIdentityOrigin[] {
  const chain: TypeIdentityOrigin[] = [first];
  const visited = new Set<object>(first.declarations.map((declaration) => declaration.compilerNode));
  let current: TypeIdentityOrigin = first;
  for (;;) {
    const next: TypeIdentityOrigin | undefined = aliasStep(current, directOnly);
    if (next === undefined || next.declarations.some((declaration) => visited.has(declaration.compilerNode))) {
      break;
    }
    for (const declaration of next.declarations) {
      visited.add(declaration.compilerNode);
    }
    chain.push(next);
    current = next;
  }
  return chain;
}

/** Normalize only transparent alias spellings through the same native origin chain, not generic transformations. */
export function readParserTransparentAliasOrigin(
  declaration: ts.TypeAliasDeclaration,
  parser: NativeParserTypeContext,
): ReferenceFact<readonly TypeIdentityOrigin[]> {
  const source = declaration.getSourceFile();
  const wrapped = createWrappedNode(declaration, { sourceFile: source, typeChecker: parser.checker });
  if (source !== parser.source || parser.program.getSourceFile(source.fileName) !== source || parser.program.getTypeChecker() !== parser.checker) {
    return unresolved("unsupported", wrapped, "transparent alias belongs to a foreign or stale parser epoch");
  }
  const body = wrapped.getTypeNodeOrThrow();
  if (!Node.isTypeReference(body) || body.getTypeArguments().length > 0) {
    return unresolved("unsupported", wrapped, "the alias is not a direct zero-argument type reference");
  }
  const origin = annotationReferenceOrigin(body.getTypeName());
  if (origin.kind === "unresolved") {
    return origin;
  }
  const chain = identityChain(origin.value, true);
  const declarations = chain.flatMap((entry) => entry.declarations);
  return declarations.some((node) => parser.program.getSourceFile(node.getSourceFile().getFilePath()) !== node.getSourceFile().compilerNode)
    ? unresolved("unsupported", wrapped, "transparent alias target belongs to a foreign or stale native source")
    : resolved(chain, wrapped, declarations);
}

/** Is EVERY declaration in this fact declared by the named npm package's own type surface? The fragment is
 *  the package's `node_modules` directory, which survives version bumps, pnpm's virtual store, and the
 *  package's internal `dist/`/`build/` layout — the three things a pinned file path does not. */
export function declaredByPackage(declarations: readonly MorphNode[], packageName: string): boolean {
  const home = `/node_modules/${packageName}/`;
  return declarations.length > 0 && declarations.every((declaration) => normalizedPath(declaration).includes(home));
}

/** A consumer-selected terminal keeps dotted grammar and complete declaration ownership separate from value proof. */
export function matchesDeclaredCallTerminal(
  call: CallExpression,
  origin: ReferenceFact<readonly MorphNode[]>,
  selection: DeclaredCallTerminalSelection,
): boolean {
  const callee = call.getExpression();
  if (!Node.isPropertyAccessExpression(callee)) {
    return false;
  }
  const name = callee.getName();
  const home = selection.projectHome;
  const declarations = origin.kind === "resolved" ? origin.value : [];
  return (
    (selection.packageMethods.includes(name) && declaredByPackage(declarations, selection.packageName)) ||
    (selection.projectMethods.includes(name) &&
      home !== null &&
      declarations.length > 0 &&
      declarations.every((declaration) => normalizedPath(declaration).includes(home)))
  );
}

/** Is EVERY declaration in this fact declared by exactly this project source file? The caller obtains the
 *  file through `ctx.sourceFile(path)`, so a rename REFUSES at the door instead of silently un-matching. */
export function declaredByFile(declarations: readonly MorphNode[], sourceFile: SourceFile): boolean {
  return declarations.length > 0 && declarations.every((declaration) => declaration.getSourceFile().compilerNode === sourceFile.compilerNode);
}

/** Is EVERY declaration ambient TypeScript/DefinitelyTyped surface? Used to separate a real vendor type from
 *  a project lookalike when the vendor ships its own `@types` package rather than inline declarations. */
export function declaredByAnyPackage(declarations: readonly MorphNode[], packageNames: readonly string[]): boolean {
  return packageNames.some((packageName) => declaredByPackage(declarations, packageName));
}

function sameTypeDeclaration(left: Type, right: Type): boolean {
  const origins = (left.getAliasSymbol() ?? left.getSymbol())?.getDeclarations() ?? [];
  const targets = new Set(((right.getAliasSymbol() ?? right.getSymbol())?.getDeclarations() ?? []).map((node) => node.compilerNode));
  return origins.length > 0 && origins.some((node) => targets.has(node.compilerNode));
}

interface NativeSlotPair {
  readonly template: Type;
  readonly actual: Type;
  readonly declarations: readonly MorphNode[];
}

function nativeUnionSlots(pair: NativeSlotPair, formal: Type): readonly NativeSlotPair[] | undefined {
  const templates = [...pair.template.getUnionTypes(), ...pair.template.getIntersectionTypes()];
  const actuals = [...pair.actual.getUnionTypes(), ...pair.actual.getIntersectionTypes()];
  if (templates.length === 0 && actuals.length === 0) {
    return;
  }
  return (templates.length === 0 ? [pair.template] : templates).flatMap((left) =>
    (actuals.length === 0 ? [pair.actual] : actuals)
      .filter((right) => nativeFormalIndexedPath(left.compilerType, formal.compilerType) !== undefined || sameTypeDeclaration(left, right))
      .map((right) => ({ template: left, actual: right, declarations: pair.declarations })),
  );
}

// Candidate arguments prune irrelevant instantiation; only the actual declaration-paired slots below prove contribution.
function nativeFormalCandidate(type: Type, input: NativeSubstitutedTypeInput, visited = new Set<object>()): boolean {
  if (nativeFormalIndexedPath(type.compilerType, input.parameter.getType().compilerType) !== undefined) {
    return true;
  }
  if (visited.has(type.compilerType) || type.isAny() || type.isUnknown() || type.isTypeParameter()) {
    return false;
  }
  visited.add(type.compilerType);
  const arguments_ = [...type.getAliasTypeArguments(), ...type.getTypeArguments(), ...type.getUnionTypes(), ...type.getIntersectionTypes()];
  if (arguments_.length > 0) {
    return arguments_.some((argument) => nativeFormalCandidate(argument, input, visited));
  }
  const declarations = (type.getAliasSymbol() ?? type.getSymbol())?.getDeclarations() ?? [];
  return declarations.some((declaration) =>
    declaration.getDescendantsOfKind(SyntaxKind.Identifier).some((identifier) => {
      const origin = annotationReferenceOrigin(identifier);
      return origin.kind === "resolved" && origin.value.declarations.some((node) => node.compilerNode === input.parameter.compilerNode);
    }),
  );
}

function nativeIndexedAccess(type: ts.Type): type is ts.IndexedAccessType {
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript TypeFlags is the compiler-owned type discriminator.
  return (type.flags & ts.TypeFlags.IndexedAccess) !== 0;
}

function nativeFormalIndexedPath(type: ts.Type, formal: ts.Type, visited = new Set<ts.Type>()): readonly string[] | undefined {
  if (type === formal) {
    return [];
  }
  if (visited.has(type) || !nativeIndexedAccess(type) || !type.indexType.isStringLiteral()) {
    return;
  }
  visited.add(type);
  const parent = nativeFormalIndexedPath(type.objectType, formal, visited);
  return parent === undefined ? undefined : [...parent, type.indexType.value];
}

function nativeProjectedSlot(pair: NativeSlotPair, input: NativeSubstitutedTypeInput): NativeSubstitutedTypeSlot | undefined {
  const formal = input.parameter.getType();
  const path = nativeFormalIndexedPath(pair.template.compilerType, formal.compilerType);
  if (path === undefined || path.length === 0) {
    return;
  }
  const index = input.templateLocation.getTypeParameters().findIndex((node) => node.compilerNode === input.parameter.compilerNode);
  const argument = input.actualLocation.getTypeArguments()[index];
  if (argument?.getType().compilerType !== input.witnessLocation.getType().compilerType) {
    return;
  }
  const selected = resolveTypePropertyValue(input.witnessLocation, path);
  if (
    selected.kind !== "resolved" ||
    selected.value.type.compilerType !== pair.actual.compilerType ||
    pair.actual.isAny() ||
    pair.actual.isUnknown() ||
    pair.actual.isNever() ||
    selected.value.declarations.some((node) => input.program.getSourceFile(node.getSourceFile().getFilePath()) !== node.getSourceFile().compilerNode)
  ) {
    return;
  }
  return { formal, actual: pair.actual, projection: path, declarations: [...pair.declarations, ...selected.value.declarations] };
}

function nativePropertySlots(pair: NativeSlotPair, input: NativeSubstitutedTypeInput): readonly NativeSlotPair[] {
  return pair.template.getProperties().flatMap((property) => {
    const template = property.getTypeAtLocation(input.templateLocation);
    if (!nativeFormalCandidate(template, input)) {
      return [];
    }
    const target = pair.actual.getProperty(property.getName());
    const declarations = property.getDeclarations();
    const targetNodes = new Set(target?.getDeclarations().map((node) => node.compilerNode));
    return target !== undefined && declarations.length > 0 && declarations.every((node) => targetNodes.has(node.compilerNode))
      ? [{ template, actual: target.getTypeAtLocation(input.actualLocation), declarations }]
      : [];
  });
}

function nativeSignatureSlots(pair: NativeSlotPair, input: NativeSubstitutedTypeInput): readonly NativeSlotPair[] {
  const slots: NativeSlotPair[] = [];
  for (const signature of [...pair.template.getCallSignatures(), ...pair.template.getConstructSignatures()]) {
    const declaration = signature.getDeclaration();
    for (const target of [...pair.actual.getCallSignatures(), ...pair.actual.getConstructSignatures()]) {
      if (target.getDeclaration().compilerNode !== declaration.compilerNode) {
        continue;
      }
      const targets = target.getParameters();
      slots.push(
        ...signature.getParameters().flatMap((parameter, index) => {
          const supplied = targets[index];
          const declarations = parameter.getDeclarations();
          const targetNodes = new Set(supplied?.getDeclarations().map((node) => node.compilerNode));
          return supplied !== undefined && declarations.length > 0 && declarations.every((node) => targetNodes.has(node.compilerNode))
            ? [{ template: parameter.getTypeAtLocation(input.templateLocation), actual: supplied.getTypeAtLocation(input.actualLocation), declarations }]
            : [];
        }),
      );
      slots.push({ template: signature.getReturnType(), actual: target.getReturnType(), declarations: [declaration] });
    }
  }
  return slots;
}

interface NativeMappedEffect {
  readonly utility: TypeAliasDeclaration;
  readonly parameter: TypeParameterDeclaration;
  readonly supplied: Type;
  readonly output: Type;
  readonly suppliedLocation: MorphNode;
  readonly outputLocation: MorphNode;
  readonly nativeKeys?: true;
}

// Authored and instantiated entrypoints share this exact mapped syntax, declaration and native field identity proof.
function mappedNativeProjection(input: NativeMappedEffect): readonly Type[] {
  const { utility, parameter, supplied, output, suppliedLocation, outputLocation } = input;
  const mapped = utility.getTypeNode();
  if (mapped === undefined || !Node.isMappedTypeNode(mapped)) {
    return [];
  }
  const key = mapped.getTypeParameter();
  const constraint = key.getConstraint();
  const value = mapped.getTypeNode();
  if (constraint === undefined || !Node.isTypeOperatorTypeNode(constraint) || value === undefined || !Node.isIndexedAccessTypeNode(value)) {
    return [];
  }
  if (
    constraint.getTypeNode().getType().compilerType !== parameter.getType().compilerType ||
    value.getObjectTypeNode().getType().compilerType !== parameter.getType().compilerType ||
    value
      .getIndexTypeNode()
      .getType()
      .getSymbol()
      ?.getDeclarations()
      .some((declaration) => declaration.compilerNode === key.compilerNode) !== true ||
    mapped.getNameTypeNode() !== undefined
  ) {
    return [];
  }
  const witnesses: Type[] = [];
  for (const property of output.getProperties()) {
    const origin = supplied.getProperty(property.getName());
    const declarations = property.getDeclarations();
    const originNodes = new Set(origin?.getDeclarations().map((node) => node.compilerNode));
    // Native key maps have no property declaration; only the authored key-map entrypoint supplies its existing evidence.
    if (origin === undefined || (declarations.length === 0 && input.nativeKeys !== true) || !declarations.every((node) => originNodes.has(node.compilerNode))) {
      return [];
    }
    const initial = origin.getTypeAtLocation(suppliedLocation);
    const actual = property.getTypeAtLocation(outputLocation).getNonNullableType();
    if (actual.compilerType !== initial.getNonNullableType().compilerType || actual.isAny() || actual.isUnknown() || actual.isNever()) {
      return [];
    }
    witnesses.push(actual);
  }
  return witnesses;
}

function nativeMappedSubstitutionSlots(pair: NativeSlotPair, input: NativeSubstitutedTypeInput): readonly NativeSlotPair[] {
  const declarations = pair.template.getAliasSymbol()?.getDeclarations() ?? [];
  const targets = new Set(
    pair.actual
      .getAliasSymbol()
      ?.getDeclarations()
      .map((node) => node.compilerNode),
  );
  const utility = declarations[0];
  if (
    declarations.length !== 1 ||
    !Node.isTypeAliasDeclaration(utility) ||
    !targets.has(utility.compilerNode) ||
    input.program.getSourceFile(utility.getSourceFile().getFilePath()) !== utility.getSourceFile().compilerNode
  ) {
    return [];
  }
  const templateArguments = pair.template.getAliasTypeArguments();
  const actualArguments = pair.actual.getAliasTypeArguments();
  const parameters = utility.getTypeParameters();
  if (templateArguments.length !== parameters.length || actualArguments.length !== parameters.length) {
    return [];
  }
  return parameters.flatMap((parameter, index) => {
    const template = templateArguments[index];
    const actual = actualArguments[index];
    if (template === undefined || actual === undefined || !nativeFormalCandidate(template, input) || actual.isAny() || actual.isUnknown() || actual.isNever()) {
      return [];
    }
    const witnesses = mappedNativeProjection({
      utility,
      parameter,
      supplied: actual,
      output: pair.actual,
      suppliedLocation: input.actualLocation,
      outputLocation: input.actualLocation,
    });
    return witnesses.length === 0 ? [] : [{ template, actual, declarations: [...pair.declarations, utility, parameter] }];
  });
}

function concreteNativeSlotType(type: Type): boolean {
  return type.isObject() || type.isUnion() || type.isIntersection();
}

interface NativeSlotStep {
  readonly pair: NativeSlotPair;
  readonly ancestors: ReadonlySet<object>;
}

function nativeConstituents(type: Type): readonly Type[] {
  return type.isUnion() ? type.getUnionTypes() : [type];
}

function nativeSubstitutedSlot(pair: NativeSlotPair, input: NativeSubstitutedTypeInput): NativeSubstitutedTypeSlot | undefined {
  const formal = input.parameter.getType();
  return pair.template.compilerType === formal.compilerType
    ? { formal, actual: pair.actual, declarations: pair.declarations }
    : nativeProjectedSlot(pair, input);
}

function nativeSubstitutionChildren({ pair, ancestors }: NativeSlotStep, input: NativeSubstitutedTypeInput): readonly NativeSlotStep[] {
  const origins = (pair.template.getAliasSymbol() ?? pair.template.getSymbol())?.getDeclarations().map((node) => node.compilerNode) ?? [];
  if (
    origins.some((origin) => ancestors.has(origin)) ||
    !concreteNativeSlotType(pair.template) ||
    pair.template.compilerType === pair.actual.compilerType ||
    !nativeFormalCandidate(pair.template, input)
  ) {
    return [];
  }
  // Recursive expansion is not a finite declaration witness.
  const lineage = new Set([...ancestors, ...origins]);
  const children = nativeUnionSlots(pair, input.parameter.getType()) ?? [
    ...nativeMappedSubstitutionSlots(pair, input),
    ...nativePropertySlots(pair, input),
    ...nativeSignatureSlots(pair, input),
  ];
  return children.map((child) => ({ pair: child, ancestors: lineage }));
}

function collectNativeSubstitutedSlots(input: NativeSubstitutedTypeInput): readonly NativeSubstitutedTypeSlot[] {
  const candidate = input.witnessLocation.getType();
  const identities = new Set(nativeConstituents(candidate).map((type) => type.compilerType));
  const pending: NativeSlotStep[] = [
    {
      pair: { template: input.templateLocation.getType(), actual: input.actualLocation.getType(), declarations: [input.templateLocation] },
      ancestors: new Set(),
    },
  ];
  const visited = new Map<object, Set<object>>();
  const slots: NativeSubstitutedTypeSlot[] = [];
  for (const { pair, ancestors } of pending) {
    const seen = visited.get(pair.template.compilerType) ?? new Set<object>();
    if (seen.has(pair.actual.compilerType)) {
      continue;
    }
    seen.add(pair.actual.compilerType);
    visited.set(pair.template.compilerType, seen);
    if (pair.actual.isAny() || pair.actual.isUnknown() || pair.actual.isNever() || pair.actual.isTypeParameter()) {
      continue;
    }
    const slot = nativeSubstitutedSlot(pair, input);
    if (slot !== undefined) {
      slots.push(slot);
      if (slot.projection !== undefined || nativeConstituents(pair.actual).some((type) => identities.has(type.compilerType))) {
        return slots;
      }
      continue;
    }
    for (const child of nativeSubstitutionChildren({ pair, ancestors }, input)) {
      pending.push(child);
    }
  }
  return slots;
}

function parserSubstitutionInput(input: NativeSubstitutedTypeInput): NativeSubstitutedTypeInput | undefined {
  const parser = input.parser;
  if (parser === undefined || parser.program !== input.program || parser.source !== input.source || parser.checker !== input.program.getTypeChecker()) {
    return;
  }
  const nodes = [input.parameter, input.templateLocation, input.actualLocation, input.witnessLocation];
  if (
    input.actualLocation.getSourceFile().compilerNode !== input.source ||
    input.witnessLocation.getSourceFile().compilerNode !== input.source ||
    nodes.some((node) => node.wasForgotten() || input.program.getSourceFile(node.getSourceFile().getFilePath()) !== node.getSourceFile().compilerNode)
  ) {
    return;
  }
  const templateLocation = createWrappedNode(input.templateLocation.compilerNode, {
    typeChecker: parser.checker,
    sourceFile: input.templateLocation.compilerNode.getSourceFile(),
  });
  const parameter = templateLocation.getTypeParameters().find((node) => node.compilerNode === input.parameter.compilerNode);
  if (parameter === undefined || input.parameter.compilerNode.parent !== input.templateLocation.compilerNode) {
    return;
  }
  return {
    ...input,
    parameter,
    templateLocation,
    witnessLocation: createWrappedNode(input.witnessLocation.compilerNode, { typeChecker: parser.checker, sourceFile: input.source }),
    actualLocation: createWrappedNode(input.actualLocation.compilerNode, { typeChecker: parser.checker, sourceFile: input.source }),
  };
}

function nativeSubstitutionInput(input: NativeSubstitutedTypeInput): ReferenceFact<NativeSubstitutedTypeInput> {
  const { parameter, templateLocation, actualLocation, program, source } = input;
  const nodes = [parameter, templateLocation, actualLocation, input.witnessLocation];
  if (nodes.some((node) => node.wasForgotten())) {
    return unresolved("unsupported", actualLocation, "native substitution received a forgotten declaration");
  }
  let delivered = input;
  if (input.parser !== undefined) {
    const parserInput = parserSubstitutionInput(input);
    if (parserInput === undefined) {
      return unresolved("unsupported", actualLocation, "native substitution parser source/checker belongs to a foreign or stale epoch");
    }
    delivered = parserInput;
  } else {
    const project = actualLocation.getProject();
    if (
      project.getProgram().compilerObject !== program ||
      actualLocation.getSourceFile().compilerNode !== source ||
      input.witnessLocation.getSourceFile().compilerNode !== source ||
      parameter.getParent() !== templateLocation ||
      nodes.some((node) => node.getProject() !== project || program.getSourceFile(node.getSourceFile().getFilePath()) !== node.getSourceFile().compilerNode)
    ) {
      return unresolved("unsupported", actualLocation, "native substitution belongs to a foreign or stale declaration/program epoch");
    }
  }
  return resolved(delivered, actualLocation, nodes);
}

/** The existing mapped-property proof with the same parser/morph epoch guards as ordinary substitution. */
export function readNativeMappedProjection(input: NativeSubstitutedTypeInput, nativeKeys?: true): ReferenceFact<readonly Type[]> {
  const delivered = nativeSubstitutionInput(input);
  if (delivered.kind === "unresolved") {
    return delivered;
  }
  const { templateLocation: utility, parameter, witnessLocation, actualLocation } = delivered.value;
  const index = utility.getTypeParameters().findIndex((node) => node.compilerNode === parameter.compilerNode);
  if (!Node.isTypeAliasDeclaration(utility) || actualLocation.getTypeArguments()[index]?.compilerNode !== witnessLocation.compilerNode) {
    return resolved([], actualLocation, []);
  }
  const witnesses = mappedNativeProjection({
    utility,
    parameter,
    supplied: witnessLocation.getType(),
    output: actualLocation.getType(),
    suppliedLocation: witnessLocation,
    outputLocation: actualLocation,
    ...(nativeKeys === undefined ? {} : { nativeKeys }),
  });
  return resolved(witnesses, actualLocation, [utility, parameter]);
}

/** Seek a candidate identity in concrete declaration-paired slots; recursive or unresolved templates grant no witness. */
export function readNativeSubstitutedTypeSlots(input: NativeSubstitutedTypeInput): ReferenceFact<readonly NativeSubstitutedTypeSlot[]> {
  const delivered = nativeSubstitutionInput(input);
  if (delivered.kind === "unresolved") {
    return delivered;
  }
  const slots = collectNativeSubstitutedSlots(delivered.value);

  return resolved(
    slots,
    input.actualLocation,
    slots.flatMap((slot) => slot.declarations),
  );
}
