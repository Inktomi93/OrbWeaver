// Native member and type declaration facts; receiver and member refusal anchors remain distinct.
import { readMemberReference } from "@orb/tooling/floor/code-facts/reference-fact";
import type { ReferenceFact } from "@orb/tooling/floor/code-facts/reference-fact-contract";
import type { CallExpression, Node as MorphNode, SourceFile, Type, ts } from "ts-morph";
import { Node } from "ts-morph";
import nativeTs from "typescript";
import { resolveCallableDeclaration } from "./reference-fact-call.ts";
import type {
  CallMemberDeclarationOrigin,
  ContextualMemberOrigin,
  DeclaredCallTerminalSelection,
  NativeParserTypeContext,
  NativeSubstitutedTypeInput,
  NativeSubstitutedTypeSlot,
  NativeTypeIdentityGraphInput,
  ParserSubstitutedTypeInput,
  TypeIdentityOrigin,
  TypeMemberOrigin,
  TypeRealmOperations,
} from "./type-member-origin-contract.ts";
import { morphTypeOperations, normalizedPath, parserTypeOperations, resolved, symbolDeclarations, unresolved } from "./type-member-origin-core.ts";
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

/** Named identities physically carried by the callable's returned data, including wrappers and containers.
 * Callable parameters/results and erased generic arguments are not carried data. An optional declaration
 * home ends the query when that identity is proven, without expanding the service's remaining type universe. */
export function resolveReturnTypeIdentityGraph(node: MorphNode, stopAtDeclarationHome?: string): ReferenceFact<readonly TypeIdentityOrigin[]> {
  const result = callableReturnType(node);
  return result.kind === "unresolved" ? result : typeIdentityGraph(result.value, node, { kind: "returned-data", stopAtDeclarationHome });
}

type IdentityGraphMode =
  | { readonly kind: "returned-data"; readonly stopAtDeclarationHome: string | undefined }
  | { readonly kind: "parser-returned-data" | "signature-exposure" };

function graphOrigin<N extends object, T, S, G, I extends object>(type: T, node: N, ops: TypeRealmOperations<N, T, S, G, I>): readonly TypeIdentityOrigin<N>[] {
  const alias = ops.aliasSymbol(type);
  const symbol = alias ?? ops.typeSymbol(type);
  if (symbol === undefined || ops.declarations(symbol).length === 0) {
    return [];
  }
  const first = { name: ops.symbolName(symbol), node, aliased: alias !== undefined, declarations: ops.declarations(symbol) };
  return identityChainCore(first, (origin) => realmAliasStep(origin, false, ops), ops.nodeIdentity);
}

function aliasStepCore<N>(
  origin: TypeIdentityOrigin<N>,
  directOnly: boolean,
  reference: (declaration: N) => { readonly name: N; readonly arguments: readonly N[] } | undefined,
  target: (name: N) => TypeIdentityOrigin<N> | undefined,
): TypeIdentityOrigin<N> | undefined {
  for (const declaration of origin.declarations) {
    const selected = reference(declaration);
    if (selected === undefined || (directOnly && selected.arguments.length > 0)) {
      continue;
    }
    const next = target(selected.name);
    if (next !== undefined) {
      return next;
    }
  }
  return undefined;
}

function realmAliasStep<N extends object, T, S, G, I extends object>(
  origin: TypeIdentityOrigin<N>,
  direct: boolean,
  ops: TypeRealmOperations<N, T, S, G, I>,
): TypeIdentityOrigin<N> | undefined {
  return aliasStepCore(
    origin,
    direct,
    (node) => {
      const generic = ops.generic(node);
      return generic?.kind === "alias" && generic.body !== undefined ? ops.reference(generic.body) : undefined;
    },
    (name) => {
      const symbol = ops.symbol(name);
      const target = symbol === undefined ? undefined : ops.alias(symbol);
      return target === undefined || ops.declarations(target).length === 0
        ? undefined
        : { name: ops.symbolName(target), node: name, aliased: true, declarations: ops.declarations(target) };
    },
  );
}

function dataChildren<N extends object, T, S, G, I extends object>(type: T, node: N, ops: TypeRealmOperations<N, T, S, G, I>): readonly T[] {
  const parts = [...ops.unions(type), ...ops.intersections(type)];
  if (parts.length > 0) {
    return parts;
  }
  const tuple = ops.tuple(type);
  if (tuple !== undefined) {
    return tuple;
  }
  const element = ops.element(type);
  if (element !== undefined) {
    return [element];
  }
  return ops.flags(type).object ? [...ops.properties(type).map((property) => ops.symbolType(property, node)), ...ops.indexes(type)] : [];
}

function graphRefusalCore<N extends object, T, S, G, I extends object>(
  type: T,
  origins: readonly N[],
  ancestors: ReadonlySet<object>,
  ops: TypeRealmOperations<N, T, S, G, I>,
): string | undefined {
  const flags = ops.flags(type);
  if (flags.any || flags.unknown || flags.parameter) {
    return "signature exposure has an unresolved native type";
  }
  if (origins.some((origin) => !ops.contains(origin))) {
    return "signature exposure contains a foreign or stale declaration";
  }
  return origins.some((origin) => ancestors.has(ops.nodeIdentity(origin))) ? "signature exposure recursively expands a declaration" : undefined;
}

function graphChildrenCore<N extends object, T, S, G, I extends object>(
  observed: { readonly type: T; readonly node: N; readonly signatures: readonly G[] },
  mode: IdentityGraphMode,
  ops: TypeRealmOperations<N, T, S, G, I>,
): readonly T[] {
  const { type, node, signatures } = observed;
  const identity = ops.typeIdentity(type);
  const children = [...dataChildren(type, node, ops)];
  if (mode.kind === "signature-exposure") {
    const awaited = ops.property(type, "then") === undefined ? undefined : ops.awaited(type);
    if (awaited !== undefined && ops.typeIdentity(awaited) !== identity) {
      children.push(awaited);
    }
    for (const signature of signatures) {
      children.push(...ops.signatureParameters(signature).map((parameter) => ops.symbolType(parameter, node)), ops.signatureReturn(signature));
    }
  }

  return children;
}

function graphSignatureDeclarations<N extends object, T, S, G, I extends object>(
  signatures: readonly G[],
  mode: IdentityGraphMode,
  ops: TypeRealmOperations<N, T, S, G, I>,
): readonly N[] {
  return mode.kind !== "signature-exposure"
    ? []
    : signatures.flatMap((signature) => {
        const declaration = ops.signatureDeclaration(signature);
        return declaration === undefined ? [] : [declaration];
      });
}

function typeIdentityGraphCore<N extends object, T, S, G, I extends object>(
  root: T,
  node: N,
  mode: IdentityGraphMode,
  ops: TypeRealmOperations<N, T, S, G, I>,
): ReferenceFact<readonly TypeIdentityOrigin<N>[], N> {
  const pending: { readonly type: T; readonly ancestors: ReadonlySet<object> }[] = [{ type: root, ancestors: new Set() }];
  const visited = new Set<I>();
  const identities: TypeIdentityOrigin<N>[] = [];
  const declarations: N[] = [];
  const refusals = new Set<string>();
  for (const { type, ancestors } of pending) {
    const identity = ops.typeIdentity(type);
    if (visited.has(identity)) {
      continue;
    }
    visited.add(identity);
    const signatures = [...ops.signatures(type, "call"), ...ops.signatures(type, "construct")];
    if (mode.kind !== "signature-exposure" && signatures.length > 0) {
      continue;
    }
    const chain = graphOrigin(type, node, ops);
    const origins = chain.flatMap((origin) => origin.declarations);
    identities.push(...chain);
    declarations.push(...origins);
    declarations.push(...graphSignatureDeclarations(signatures, mode, ops));
    if (mode.kind === "returned-data" && origins.some((origin) => ops.path(origin) === mode.stopAtDeclarationHome)) {
      break;
    }
    const refusal = mode.kind === "returned-data" ? undefined : graphRefusalCore(type, origins, ancestors, ops);
    if (refusal !== undefined) {
      refusals.add(refusal);
      continue;
    }
    const children = graphChildrenCore({ type, node, signatures }, mode, ops);
    const lineage = new Set([...ancestors, ...origins.map(ops.nodeIdentity)]);
    pending.push(...children.map((child) => ({ type: child, ancestors: lineage })));
  }
  return refusals.size > 0
    ? { ...unresolved("unsupported", node, [...refusals].join("; ")), trace: { origin: node, declarations } }
    : resolved(identities, node, declarations);
}

function typeIdentityGraph(root: Type, node: MorphNode, mode: IdentityGraphMode): ReferenceFact<readonly TypeIdentityOrigin[]> {
  return typeIdentityGraphCore(root, node, mode, morphTypeOperations(node.getProject().getProgram().compilerObject));
}

function parserGraphEpoch(input: NativeTypeIdentityGraphInput): boolean {
  const { node, parser } = input;
  return (
    node.getSourceFile() === parser.source &&
    parser.program.getSourceFile(parser.source.fileName) === parser.source &&
    parser.program.getTypeChecker() === parser.checker
  );
}

/** Inspect signature/data exposure in the parser's actual compiler realm, without foreign wrappers. */
export function readParserSignatureTypeIdentities(
  input: NativeTypeIdentityGraphInput,
): ReferenceFact<readonly TypeIdentityOrigin<nativeTs.Node>[], nativeTs.Node> {
  if (!parserGraphEpoch(input) || input.parser.checker.getTypeAtLocation(input.node) !== input.rootType) {
    return unresolved("unsupported", input.node, "signature exposure parser node/type/checker belongs to a foreign or stale epoch");
  }
  return typeIdentityGraphCore(input.rootType, input.node, { kind: "signature-exposure" }, parserTypeOperations(input.parser));
}

/** Observe the actual native signature return; a parser Program never becomes a Morph Program. */
export function readParserReturnedTypeIdentities(
  input: NativeTypeIdentityGraphInput,
): ReferenceFact<readonly TypeIdentityOrigin<nativeTs.Node>[], nativeTs.Node> {
  const { node, parser } = input;
  if (
    !(
      parserGraphEpoch(input) &&
      (nativeTs.isFunctionDeclaration(node) ||
        nativeTs.isFunctionExpression(node) ||
        nativeTs.isArrowFunction(node) ||
        nativeTs.isMethodDeclaration(node) ||
        nativeTs.isConstructorDeclaration(node))
    )
  ) {
    return unresolved("unsupported", node, "returned data parser declaration/checker belongs to a foreign or stale epoch");
  }
  const signature = parser.checker.getSignatureFromDeclaration(node);
  if (signature === undefined || parser.checker.getReturnTypeOfSignature(signature) !== input.rootType) {
    return unresolved("unsupported", node, "returned data root does not match the actual native signature");
  }
  const awaited = parser.checker.getAwaitedType(input.rootType);
  return awaited === undefined
    ? unresolved("unsupported", node, "returned data has no native awaited type")
    : typeIdentityGraphCore(awaited, node, { kind: "parser-returned-data" }, parserTypeOperations(parser));
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
  return aliasStepCore(
    origin,
    directOnly,
    (declaration) => {
      const body = Node.isTypeAliasDeclaration(declaration) ? declaration.getTypeNode() : undefined;
      return body !== undefined && Node.isTypeReference(body) ? { name: body.getTypeName(), arguments: body.getTypeArguments() } : undefined;
    },
    (nameNode) => {
      const symbol = nameNode.getSymbol();
      const target = symbol?.getAliasedSymbol() ?? symbol;
      const declarations = target?.getDeclarations() ?? [];
      return target === undefined || declarations.length === 0 ? undefined : { name: target.getName(), node: nameNode, aliased: true, declarations };
    },
  );
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
  return identityChainCore(
    first,
    (origin) => aliasStep(origin, directOnly),
    (node) => node.compilerNode,
  );
}

function identityChainCore<N>(
  first: TypeIdentityOrigin<N>,
  step: (origin: TypeIdentityOrigin<N>) => TypeIdentityOrigin<N> | undefined,
  identity: (node: N) => object,
): readonly TypeIdentityOrigin<N>[] {
  const chain: TypeIdentityOrigin<N>[] = [first];
  const visited = new Set<object>(first.declarations.map(identity));
  let current = first;
  for (;;) {
    const next = step(current);
    if (next === undefined || next.declarations.some((declaration) => visited.has(identity(declaration)))) {
      break;
    }
    for (const declaration of next.declarations) {
      visited.add(identity(declaration));
    }
    chain.push(next);
    current = next;
  }
  return chain;
}

/** Normalize only transparent alias spellings through the same native origin chain, not generic transformations. */
export function readParserTransparentAliasOrigin(
  declaration: nativeTs.TypeAliasDeclaration,
  parser: NativeParserTypeContext,
): ReferenceFact<readonly TypeIdentityOrigin<nativeTs.Node>[], nativeTs.Node> {
  const source = declaration.getSourceFile();
  if (source !== parser.source || parser.program.getSourceFile(source.fileName) !== source || parser.program.getTypeChecker() !== parser.checker) {
    return unresolved("unsupported", declaration, "transparent alias belongs to a foreign or stale parser epoch");
  }
  const ops = parserTypeOperations(parser);
  const reference = ops.reference(declaration.type);
  if (reference === undefined || reference.arguments.length > 0) {
    return unresolved("unsupported", declaration, "the alias is not a direct zero-argument type reference");
  }
  const selected = ops.symbol(reference.name);
  const symbol = selected === undefined ? undefined : ops.alias(selected);
  if (symbol === undefined || ops.declarations(symbol).length === 0) {
    return unresolved("missing", reference.name, "the checker resolved no transparent alias declaration");
  }
  const first = { name: ops.symbolName(symbol), node: reference.name, aliased: true, declarations: ops.declarations(symbol) };
  const chain = identityChainCore(first, (origin) => realmAliasStep(origin, true, ops), ops.nodeIdentity);
  const declarations = chain.flatMap((entry) => entry.declarations);
  return declarations.some((node) => !ops.contains(node))
    ? unresolved("unsupported", declaration, "transparent alias target belongs to a foreign or stale native source")
    : resolved(chain, declaration, declarations);
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

interface NativeSlotPair<T, N> {
  readonly template: T;
  readonly actual: T;
  readonly declarations: readonly N[];
}
export interface SubstitutionQuery<N extends object, T, S, G, I extends object> {
  readonly parameter: N;
  readonly template: N;
  readonly actual: N;
  readonly witness: N;
  readonly ops: TypeRealmOperations<N, T, S, G, I>;
}

/** Internal canonical operation entry; callers first validate their actual realm's ownership. */
export function readRealmSubstitution<N extends object, T, S, G, I extends object>(
  input: SubstitutionQuery<N, T, S, G, I>,
): ReferenceFact<readonly NativeSubstitutedTypeSlot<T, N>[], N> {
  const slots = collectSubstitutedSlotsCore(input);
  return resolved(
    slots,
    input.actual,
    slots.flatMap((slot) => slot.declarations),
  );
}

/** Internal mapped operation entry shared by both admitted realm adapters. */
export function readRealmMappedProjection<N extends object, T, S, G, I extends object>(
  input: SubstitutionQuery<N, T, S, G, I>,
  nativeKeys?: true,
): ReferenceFact<readonly T[], N> {
  return mappedProjectionQuery(input, nativeKeys);
}

function realmDescendants<N extends object, T, S, G, I extends object>(node: N, ops: TypeRealmOperations<N, T, S, G, I>): readonly N[] {
  const pending = [...ops.children(node)];
  for (const child of pending) {
    pending.push(...ops.children(child));
  }
  return pending;
}

function sameTypeDeclarationCore<N extends object, T, S, G, I extends object>(left: T, right: T, ops: TypeRealmOperations<N, T, S, G, I>): boolean {
  const leftSymbol = ops.aliasSymbol(left) ?? ops.typeSymbol(left);
  const rightSymbol = ops.aliasSymbol(right) ?? ops.typeSymbol(right);
  const targets = new Set(rightSymbol === undefined ? [] : ops.declarations(rightSymbol).map(ops.nodeIdentity));
  return leftSymbol !== undefined && ops.declarations(leftSymbol).some((node) => targets.has(ops.nodeIdentity(node)));
}

function formalIndexedPathCore<N extends object, T, S, G, I extends object>(
  type: I,
  formal: I,
  ops: TypeRealmOperations<N, T, S, G, I>,
  visited = new Set<I>(),
): readonly string[] | undefined {
  if (type === formal) {
    return [];
  }
  if (visited.has(type)) {
    return;
  }
  visited.add(type);
  const indexed = ops.indexedType(type);
  if (indexed === undefined) {
    return;
  }
  const parent = formalIndexedPathCore(indexed.object, formal, ops, visited);
  return parent === undefined ? undefined : [...parent, indexed.key];
}

function formalCandidateCore<N extends object, T, S, G, I extends object>(type: T, input: SubstitutionQuery<N, T, S, G, I>, visited = new Set<I>()): boolean {
  const { ops } = input;
  const identity = ops.typeIdentity(type);
  if (formalIndexedPathCore(identity, ops.typeIdentity(ops.type(input.parameter)), ops) !== undefined) {
    return true;
  }
  const flags = ops.flags(type);
  if (visited.has(identity) || flags.any || flags.unknown || flags.parameter) {
    return false;
  }
  visited.add(identity);
  const arguments_ = [...ops.aliasArguments(type), ...ops.arguments(type), ...ops.unions(type), ...ops.intersections(type)];
  if (arguments_.length > 0) {
    return arguments_.some((argument) => formalCandidateCore(argument, input, visited));
  }
  const signatures = [...ops.signatures(type, "call"), ...ops.signatures(type, "construct")];
  if (
    signatures.some((signature) =>
      [...ops.signatureParameters(signature).map((parameter) => ops.symbolType(parameter, input.template)), ops.signatureReturn(signature)].some((member) =>
        formalCandidateCore(member, input, visited),
      ),
    )
  ) {
    return true;
  }
  const symbol = ops.aliasSymbol(type) ?? ops.typeSymbol(type);
  return (
    symbol !== undefined &&
    ops.declarations(symbol).some((declaration) =>
      realmDescendants(declaration, ops).some((node) => {
        if (!ops.identifier(node)) {
          return false;
        }
        const target = ops.symbol(node);
        return (
          target !== undefined && ops.declarations(ops.alias(target)).some((candidate) => ops.nodeIdentity(candidate) === ops.nodeIdentity(input.parameter))
        );
      }),
    )
  );
}

function propertyValueCore<N extends object, T, S, G, I extends object>(
  node: N,
  path: readonly string[],
  ops: TypeRealmOperations<N, T, S, G, I>,
): { readonly type: T; readonly declarations: readonly N[] } | undefined {
  let type = ops.type(node);
  let declarations: readonly N[] = [];
  for (const name of path) {
    const symbol = ops.property(ops.nonnullable(type), name);
    if (symbol === undefined || ops.declarations(symbol).length === 0) {
      return;
    }
    declarations = ops.declarations(symbol);
    type = ops.symbolType(symbol, node);
  }
  return { type, declarations };
}

function projectedSlotCore<N extends object, T, S, G, I extends object>(
  pair: NativeSlotPair<T, N>,
  input: SubstitutionQuery<N, T, S, G, I>,
): NativeSubstitutedTypeSlot<T, N> | undefined {
  const { ops } = input;
  const formal = ops.type(input.parameter);
  const path = formalIndexedPathCore(ops.typeIdentity(pair.template), ops.typeIdentity(formal), ops);
  if (path === undefined || path.length === 0) {
    return;
  }
  const index = ops.generic(input.template)?.parameters.findIndex((node) => ops.nodeIdentity(node) === ops.nodeIdentity(input.parameter)) ?? -1;
  const argument = ops.reference(input.actual)?.arguments[index];
  if (argument === undefined || ops.typeIdentity(ops.type(argument)) !== ops.typeIdentity(ops.type(input.witness))) {
    return;
  }
  const selected = propertyValueCore(input.witness, path, ops);
  const flags = ops.flags(pair.actual);
  return selected === undefined ||
    ops.typeIdentity(selected.type) !== ops.typeIdentity(pair.actual) ||
    flags.any ||
    flags.unknown ||
    flags.never ||
    selected.declarations.some((node) => !ops.contains(node))
    ? undefined
    : { formal, actual: pair.actual, projection: path, declarations: [...pair.declarations, ...selected.declarations] };
}

function mappedDefinitionCore<N extends object, T, S, G, I extends object>(utility: N, parameter: N, ops: TypeRealmOperations<N, T, S, G, I>): boolean {
  const body = ops.generic(utility)?.body;
  const mapped = body === undefined ? undefined : ops.mapped(body);
  if (mapped?.constraint === undefined || mapped.value === undefined) {
    return false;
  }
  const constraint = ops.operatorType(mapped.constraint);
  const value = ops.indexedNode(mapped.value);
  if (constraint === undefined || value === undefined || mapped.remap !== undefined) {
    return false;
  }
  const formal = ops.typeIdentity(ops.type(parameter));
  const key = ops.typeSymbol(ops.type(value.index));
  if (
    ops.typeIdentity(ops.type(constraint)) !== formal ||
    ops.typeIdentity(ops.type(value.object)) !== formal ||
    key === undefined ||
    !ops.declarations(key).some((node) => ops.nodeIdentity(node) === ops.nodeIdentity(mapped.parameter))
  ) {
    return false;
  }
  return true;
}

function mappedProjectionCore<N extends object, T, S, G, I extends object>(
  input: {
    readonly utility: N;
    readonly parameter: N;
    readonly supplied: T;
    readonly output: T;
    readonly suppliedAt: N;
    readonly outputAt: N;
    readonly nativeKeys?: true;
  },
  ops: TypeRealmOperations<N, T, S, G, I>,
): readonly T[] {
  if (!mappedDefinitionCore(input.utility, input.parameter, ops)) {
    return [];
  }
  const witnesses: T[] = [];
  for (const property of ops.properties(input.output)) {
    const origin = ops.property(input.supplied, ops.symbolName(property));
    const declarations = ops.declarations(property);
    const origins = new Set(origin === undefined ? [] : ops.declarations(origin).map(ops.nodeIdentity));
    if (
      origin === undefined ||
      (declarations.length === 0 && input.nativeKeys !== true) ||
      !declarations.every((node) => origins.has(ops.nodeIdentity(node)))
    ) {
      return [];
    }
    const initial = ops.nonnullable(ops.symbolType(origin, input.suppliedAt));
    const actual = ops.nonnullable(ops.symbolType(property, input.outputAt));
    const flags = ops.flags(actual);
    if (ops.typeIdentity(actual) !== ops.typeIdentity(initial) || flags.any || flags.unknown || flags.never) {
      return [];
    }
    witnesses.push(actual);
  }
  return witnesses;
}

function substitutionChildrenCore<N extends object, T, S, G, I extends object>(
  pair: NativeSlotPair<T, N>,
  input: SubstitutionQuery<N, T, S, G, I>,
): readonly NativeSlotPair<T, N>[] {
  const union = unionSlotsCore(pair, input);
  return union ?? [...mappedSlotsCore(pair, input), ...propertySlotsCore(pair, input), ...signatureSlotsCore(pair, input)];
}

function unionSlotsCore<N extends object, T, S, G, I extends object>(
  pair: NativeSlotPair<T, N>,
  input: SubstitutionQuery<N, T, S, G, I>,
): readonly NativeSlotPair<T, N>[] | undefined {
  const { ops } = input;
  const templates = [...ops.unions(pair.template), ...ops.intersections(pair.template)];
  const actuals = [...ops.unions(pair.actual), ...ops.intersections(pair.actual)];
  if (templates.length > 0 || actuals.length > 0) {
    return (templates.length === 0 ? [pair.template] : templates).flatMap((left) =>
      (actuals.length === 0 ? [pair.actual] : actuals)
        .filter(
          (right) =>
            formalIndexedPathCore(ops.typeIdentity(left), ops.typeIdentity(ops.type(input.parameter)), ops) !== undefined ||
            sameTypeDeclarationCore(left, right, ops),
        )
        .map((right) => ({ template: left, actual: right, declarations: pair.declarations })),
    );
  }

  return undefined;
}

function mappedSlotsCore<N extends object, T, S, G, I extends object>(
  pair: NativeSlotPair<T, N>,
  input: SubstitutionQuery<N, T, S, G, I>,
): readonly NativeSlotPair<T, N>[] {
  const { ops } = input;
  const children: NativeSlotPair<T, N>[] = [];
  const alias = ops.aliasSymbol(pair.template);
  const targetAlias = ops.aliasSymbol(pair.actual);
  const declarations = alias === undefined ? [] : ops.declarations(alias);
  const targets = new Set(targetAlias === undefined ? [] : ops.declarations(targetAlias).map(ops.nodeIdentity));
  const utility = declarations[0];
  const generic = utility === undefined ? undefined : ops.generic(utility);
  if (utility === undefined || declarations.length !== 1 || generic?.kind !== "alias" || !targets.has(ops.nodeIdentity(utility)) || !ops.contains(utility)) {
    return [];
  }
  const left = ops.aliasArguments(pair.template);
  const right = ops.aliasArguments(pair.actual);
  if (left.length !== generic.parameters.length || right.length !== generic.parameters.length) {
    return [];
  }
  for (const [index, parameter] of generic.parameters.entries()) {
    const template = left[index];
    const actual = right[index];
    if (template === undefined || actual === undefined || !formalCandidateCore(template, input)) {
      continue;
    }
    const flags = ops.flags(actual);
    if ([flags.any, flags.unknown, flags.never].some(Boolean)) {
      continue;
    }
    const witnesses = mappedProjectionCore(
      { utility, parameter, supplied: actual, output: pair.actual, suppliedAt: input.actual, outputAt: input.actual },
      ops,
    );
    if (witnesses.length > 0) {
      children.push({ template, actual, declarations: [...pair.declarations, utility, parameter] });
    }
  }
  return children;
}

function propertySlotsCore<N extends object, T, S, G, I extends object>(
  pair: NativeSlotPair<T, N>,
  input: SubstitutionQuery<N, T, S, G, I>,
): readonly NativeSlotPair<T, N>[] {
  const { ops } = input;
  const children: NativeSlotPair<T, N>[] = [];
  for (const property of ops.properties(pair.template)) {
    const template = ops.symbolType(property, input.template);
    if (!formalCandidateCore(template, input)) {
      continue;
    }
    const target = ops.property(pair.actual, ops.symbolName(property));
    const declarations = ops.declarations(property);
    const targets = new Set(target === undefined ? [] : ops.declarations(target).map(ops.nodeIdentity));
    if (target !== undefined && declarations.length > 0 && declarations.every((node) => targets.has(ops.nodeIdentity(node)))) {
      children.push({ template, actual: ops.symbolType(target, input.actual), declarations });
    }
  }

  return children;
}

function signatureSlotsCore<N extends object, T, S, G, I extends object>(
  pair: NativeSlotPair<T, N>,
  input: SubstitutionQuery<N, T, S, G, I>,
): readonly NativeSlotPair<T, N>[] {
  const { ops } = input;
  const children: NativeSlotPair<T, N>[] = [];
  for (const kind of ["call", "construct"] as const) {
    for (const signature of ops.signatures(pair.template, kind)) {
      const declaration = ops.signatureDeclaration(signature);
      if (declaration === undefined) {
        continue;
      }
      for (const target of ops.signatures(pair.actual, kind)) {
        const targetDeclaration = ops.signatureDeclaration(target);
        if (targetDeclaration === undefined || ops.nodeIdentity(targetDeclaration) !== ops.nodeIdentity(declaration)) {
          continue;
        }
        children.push(...pairedSignatureSlotsCore(signature, target, declaration, input));
      }
    }
  }

  return children;
}

function pairedSignatureSlotsCore<N extends object, T, S, G, I extends object>(
  signature: G,
  target: G,
  declaration: N,
  input: SubstitutionQuery<N, T, S, G, I>,
): readonly NativeSlotPair<T, N>[] {
  const { ops } = input;
  const children: NativeSlotPair<T, N>[] = [];
  const parameters = ops.signatureParameters(target);
  for (const [index, parameter] of ops.signatureParameters(signature).entries()) {
    const supplied = parameters[index];
    const declarations = ops.declarations(parameter);
    const targets = new Set(supplied === undefined ? [] : ops.declarations(supplied).map(ops.nodeIdentity));
    if (supplied !== undefined && declarations.length > 0 && declarations.every((node) => targets.has(ops.nodeIdentity(node)))) {
      children.push({ template: ops.symbolType(parameter, input.template), actual: ops.symbolType(supplied, input.actual), declarations });
    }
  }

  children.push({ template: ops.signatureReturn(signature), actual: ops.signatureReturn(target), declarations: [declaration] });
  return children;
}

function substitutionStepChildrenCore<N extends object, T, S, G, I extends object>(
  pair: NativeSlotPair<T, N>,
  ancestors: ReadonlySet<object>,
  input: SubstitutionQuery<N, T, S, G, I>,
): readonly { readonly pair: NativeSlotPair<T, N>; readonly ancestors: ReadonlySet<object> }[] {
  const { ops } = input;
  const template = ops.typeIdentity(pair.template);
  const actual = ops.typeIdentity(pair.actual);
  const symbol = ops.aliasSymbol(pair.template) ?? ops.typeSymbol(pair.template);
  const origins = symbol === undefined ? [] : ops.declarations(symbol).map(ops.nodeIdentity);
  const typeFlags = ops.flags(pair.template);
  if (
    origins.some((origin) => ancestors.has(origin)) ||
    !(typeFlags.object || ops.unions(pair.template).length > 0 || ops.intersections(pair.template).length > 0) ||
    template === actual ||
    !formalCandidateCore(pair.template, input)
  ) {
    return [];
  }
  const lineage = new Set([...ancestors, ...origins]);

  return substitutionChildrenCore(pair, input).map((child) => ({ pair: child, ancestors: lineage }));
}

function collectSubstitutedSlotsCore<N extends object, T, S, G, I extends object>(
  input: SubstitutionQuery<N, T, S, G, I>,
): readonly NativeSubstitutedTypeSlot<T, N>[] {
  const { ops } = input;
  const parts = (type: T): readonly T[] => {
    const union = ops.unions(type);
    return union.length === 0 ? [type] : union;
  };
  const identities = new Set(parts(ops.type(input.witness)).map(ops.typeIdentity));
  const pending: { readonly pair: NativeSlotPair<T, N>; readonly ancestors: ReadonlySet<object> }[] = [
    { pair: { template: ops.type(input.template), actual: ops.type(input.actual), declarations: [input.template] }, ancestors: new Set() },
  ];
  const visited = new Map<I, Set<I>>();
  const slots: NativeSubstitutedTypeSlot<T, N>[] = [];
  for (const { pair, ancestors } of pending) {
    const template = ops.typeIdentity(pair.template);
    const actual = ops.typeIdentity(pair.actual);
    const seen = visited.get(template) ?? new Set<I>();
    if (seen.has(actual)) {
      continue;
    }
    seen.add(actual);
    visited.set(template, seen);
    const flags = ops.flags(pair.actual);
    if (flags.any || flags.unknown || flags.never || flags.parameter) {
      continue;
    }
    const formal = ops.type(input.parameter);
    const slot = template === ops.typeIdentity(formal) ? { formal, actual: pair.actual, declarations: pair.declarations } : projectedSlotCore(pair, input);
    if (slot !== undefined) {
      slots.push(slot);
      if (slot.projection !== undefined || parts(pair.actual).some((type) => identities.has(ops.typeIdentity(type)))) {
        return slots;
      }
      continue;
    }
    pending.push(...substitutionStepChildrenCore(pair, ancestors, input));
  }
  return slots;
}

function nativeSubstitutionInput(
  input: NativeSubstitutedTypeInput,
): ReferenceFact<SubstitutionQuery<MorphNode, Type, import("ts-morph").Symbol, import("ts-morph").Signature, ts.Type>> {
  const { parameter, templateLocation, actualLocation, program, source, witnessLocation } = input;
  const nodes = [parameter, templateLocation, actualLocation, witnessLocation];
  if (nodes.some((node) => node.wasForgotten())) {
    return unresolved("unsupported", actualLocation, "native substitution received a forgotten declaration");
  }
  const project = actualLocation.getProject();
  if (
    project.getProgram().compilerObject !== program ||
    actualLocation.getSourceFile().compilerNode !== source ||
    witnessLocation.getSourceFile().compilerNode !== source ||
    parameter.getParent() !== templateLocation ||
    nodes.some((node) => node.getProject() !== project || program.getSourceFile(node.getSourceFile().getFilePath()) !== node.getSourceFile().compilerNode)
  ) {
    return unresolved("unsupported", actualLocation, "native substitution belongs to a foreign or stale declaration/program epoch");
  }
  return resolved(
    { parameter, template: templateLocation, actual: actualLocation, witness: witnessLocation, ops: morphTypeOperations(program) },
    actualLocation,
    nodes,
  );
}

function parserSubstitutionQuery(
  input: ParserSubstitutedTypeInput,
): ReferenceFact<SubstitutionQuery<nativeTs.Node, nativeTs.Type, nativeTs.Symbol, nativeTs.Signature, nativeTs.Type>, nativeTs.Node> {
  const { parser, parameter, templateLocation, actualLocation, witnessLocation } = input;
  const ops = parserTypeOperations(parser);
  const nodes = [parameter, templateLocation, actualLocation, witnessLocation];
  if (
    parser.checker !== parser.program.getTypeChecker() ||
    parser.program.getSourceFile(parser.source.fileName) !== parser.source ||
    actualLocation.getSourceFile() !== parser.source ||
    witnessLocation.getSourceFile() !== parser.source ||
    parameter.parent !== templateLocation ||
    nodes.some((node) => !ops.contains(node))
  ) {
    return unresolved("unsupported", actualLocation, "native substitution parser source/checker belongs to a foreign or stale epoch");
  }
  return resolved({ parameter, template: templateLocation, actual: actualLocation, witness: witnessLocation, ops }, actualLocation, nodes);
}

function mappedProjectionQuery<N extends object, T, S, G, I extends object>(
  input: SubstitutionQuery<N, T, S, G, I>,
  nativeKeys?: true,
): ReferenceFact<readonly T[], N> {
  const { ops } = input;
  const generic = ops.generic(input.template);
  const index = generic?.parameters.findIndex((node) => ops.nodeIdentity(node) === ops.nodeIdentity(input.parameter)) ?? -1;
  const supplied = ops.reference(input.actual)?.arguments[index];
  if (generic?.kind !== "alias" || supplied === undefined || ops.nodeIdentity(supplied) !== ops.nodeIdentity(input.witness)) {
    return resolved([], input.actual, []);
  }
  return resolved(
    mappedProjectionCore(
      {
        utility: input.template,
        parameter: input.parameter,
        supplied: ops.type(input.witness),
        output: ops.type(input.actual),
        suppliedAt: input.witness,
        outputAt: input.actual,
        ...(nativeKeys === undefined ? {} : { nativeKeys }),
      },
      ops,
    ),
    input.actual,
    [input.template, input.parameter],
  );
}

/** The canonical mapped-property proof in the Morph consumer's own compiler realm. */
export function readNativeMappedProjection(input: NativeSubstitutedTypeInput, nativeKeys?: true): ReferenceFact<readonly Type[]> {
  const delivered = nativeSubstitutionInput(input);
  return delivered.kind === "unresolved" ? delivered : mappedProjectionQuery(delivered.value, nativeKeys);
}

/** Seek paired slots in the Morph consumer's actual Program; parser values cannot enter this API. */
export function readNativeSubstitutedTypeSlots(input: NativeSubstitutedTypeInput): ReferenceFact<readonly NativeSubstitutedTypeSlot[]> {
  const delivered = nativeSubstitutionInput(input);
  if (delivered.kind === "unresolved") {
    return delivered;
  }
  const slots = collectSubstitutedSlotsCore(delivered.value);
  return resolved(
    slots,
    input.actualLocation,
    slots.flatMap((slot) => slot.declarations),
  );
}

/** The same canonical slot algorithm over the raw parser's actual native values. */
export function readParserSubstitutedTypeSlots(
  input: ParserSubstitutedTypeInput,
): ReferenceFact<readonly NativeSubstitutedTypeSlot<nativeTs.Type, nativeTs.Node>[], nativeTs.Node> {
  const delivered = parserSubstitutionQuery(input);
  if (delivered.kind === "unresolved") {
    return delivered;
  }
  const slots = collectSubstitutedSlotsCore(delivered.value);
  return resolved(
    slots,
    input.actualLocation,
    slots.flatMap((slot) => slot.declarations),
  );
}

/** Mapped projections keep identical syntax/property checks in both actual compiler realms. */
export function readParserMappedProjection(input: ParserSubstitutedTypeInput, nativeKeys?: true): ReferenceFact<readonly nativeTs.Type[], nativeTs.Node> {
  const delivered = parserSubstitutionQuery(input);
  return delivered.kind === "unresolved" ? delivered : mappedProjectionQuery(delivered.value, nativeKeys);
}
