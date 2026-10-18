// Canonical identity and authored-value composition for the visitor-fed bus fact collector.

import type { ReferenceUnresolvedReason } from "@orb/tooling/floor/code-facts/reference-fact-contract";
import type { CallExpression, Node as MorphNode, TypeAliasDeclaration, VariableDeclaration } from "ts-morph";
import { Node } from "ts-morph";
import type { ObservedReference, TypeObservationReader } from "../../floor/code-facts/type-observations-contract.ts";
import type { NativeTypeSelector } from "../../floor/code-facts/type-projection-contract.ts";
import { nodeTypeSelector } from "../../floor/code-facts/type-projection-contract.ts";
import type {
  BusAnchor,
  BusDeclarationIdentity,
  BusMemberIdentity,
  BusOperationIdentity,
  BusReadContext,
  BusTypedDiscriminators,
  BusUnresolvedIdentity,
  EmitterSinkKind,
} from "../contract/bus-fact.ts";
import { busAuthored, busCallableMember, busMember, busScalar, busStable, busString } from "./bus-native-read.ts";
import { declarationHome } from "./declaration-home.ts";

export const BUS_UNION_SUFFIX = "BusEvent";
/** The one live-fan member name. A candidate FILTER only — every candidate is proven by the declaration
 *  home of the property symbol (see {@link emitterSink}). */
export const PUBLISH_MEMBER = "publish";
export const NAMED_BUS_UNIONS = new Set(["DomainEvent"]);
export const EVENT_TYPES_SUFFIX = "_EVENT_TYPES";

export const busIdentityKey = ({ path, exportName }: BusDeclarationIdentity): string => `${path}\0${exportName}`;

/** Is a RESOLVED declaration's own home this exact repo-relative path? Read through {@link declarationHome}
 *  because the declarations reaching here come from a property symbol, not from this pass's walk: the
 *  absolute-suffix prefilter this used to carry still let `ctx.relativePath` decide, so a `bus-channel.ts`
 *  sitting in the Project but outside the effective population THREW instead of answering "not our door". */
function declaredAt(context: BusReadContext, sourceFile: import("ts-morph").SourceFile, path: string): boolean {
  return declarationHome(context, sourceFile) === path;
}

export function busAnchor(context: BusReadContext, node: MorphNode): BusAnchor {
  const at = node.getSourceFile().getLineAndColumnAtPos(node.getStart());
  return { path: context.relativePath(node.getSourceFile()), line: at.line, column: at.column, node };
}

/** The identity of a union alias. Its `path` is read through {@link declarationHome} because HALF the call
 *  sites hand it a RESOLVED alias — `canonicalTypeAlias(node.getType())` follows a `Record<SomeLibUnion, …>`
 *  key straight out of the population — and `ctx.relativePath` throws there (guide §3). `undefined` is not
 *  the alternative: a foreign alias keeps a real, comparable path, misses `byUnion` exactly as it always did,
 *  and the caller's existing refusal arm reports it. */
export function busDeclarationIdentity(context: BusReadContext, declaration: TypeAliasDeclaration): BusDeclarationIdentity {
  return { path: declarationHome(context, declaration.getSourceFile()), exportName: declaration.getName() };
}

/** Preserve declaration export-symbol identity, including authored named export lists. */
export function busAliasExported(context: BusReadContext, alias: TypeAliasDeclaration): boolean {
  if (alias.hasExportKeyword()) {
    return true;
  }
  const readers = context.types(alias);
  const symbol = readers.symbol(alias);
  if (symbol === null) {
    return false;
  }
  const key = readers.symbolData(symbol).key;
  return readers
    .exports(alias.getSourceFile())
    .some((exported) => readers.symbolData(exported).key === key || readers.symbolData(readers.symbolData(exported).canonical).key === key);
}

/** Every declaration a symbol names, INCLUDING the ones behind an import alias. `getAliasedSymbol()`
 *  resolves the WHOLE alias chain in one call, not a single hop: `import { X as U }`,
 *  `export { X } from "…"`, and a re-export of a re-export all land on the real declaration here.
 *
 *  The resolution is not optional and it is not local to one reader: a symbol read at a node in a
 *  CONSUMING module is the IMPORT's symbol, whose own declarations are the `ImportSpecifier` — so a caller
 *  looking for the real declaration (a type alias, a const) finds nothing at all. Measured twice on this
 *  tree: a client mapped type keyed by `ChatBusEvent["type"]` located no union, and a policy descriptor
 *  consuming a SHARED union identity const registered as owning no bus.
 *
 *  DELIBERATELY NOT THE ONLY SITE: `callableDeclaration` below keeps its own `getAliasedSymbol()` with
 *  DIFFERENT semantics — aliased-preferred (`aliased ?? own`) and EXACTLY ONE — because it needs the one
 *  callable a call resolves to. Merging it into this helper would answer the import specifier AND the
 *  function declaration for an imported wrapper, fail its exactly-one test, and silently break relay
 *  propagation. Two readers, two questions; do not consolidate them. */
function aliasResolvedDeclarations(symbol: ObservedReference<"symbol"> | null, readers: TypeObservationReader): readonly MorphNode[] {
  const rows: MorphNode[] = [];
  for (const declaration of symbol === null
    ? []
    : [...readers.symbolData(symbol).declarations, ...readers.symbolData(readers.symbolData(symbol).canonical).declarations]) {
    if (!rows.some((existing) => existing.compilerNode === declaration.compilerNode)) {
      rows.push(declaration);
    }
  }
  return rows;
}

/** The ONE type-alias declaration a resolved type names, through {@link aliasResolvedDeclarations}. */
export function canonicalTypeAlias(context: BusReadContext, type: NativeTypeSelector, at: MorphNode): TypeAliasDeclaration | undefined {
  const readers = context.types(at);
  const selected = readers.select(type);
  if (selected === null) {
    return;
  }
  const data = readers.type(selected);
  const declarations = aliasResolvedDeclarations(data.aliasSymbol ?? data.symbol, readers).filter(Node.isTypeAliasDeclaration);
  return declarations.length === 1 ? declarations[0] : undefined;
}

interface RefusalInput {
  readonly context: BusReadContext;
  readonly stage: BusUnresolvedIdentity["stage"];
  readonly reason: ReferenceUnresolvedReason;
  readonly detail: string;
  readonly node?: MorphNode;
  readonly expected?: BusDeclarationIdentity | null;
}

export function busRefusal(input: RefusalInput): BusUnresolvedIdentity {
  const source = input.node?.getSourceFile().compilerNode;
  const anchor =
    input.node !== undefined && input.context.files.some((candidate) => candidate.compilerNode === source) ? busAnchor(input.context, input.node) : null;
  return {
    stage: input.stage,
    reason: input.reason,
    detail: input.detail,
    expected: input.expected ?? null,
    anchor,
  };
}

function indexedBusUnion(node: MorphNode | undefined): MorphNode | undefined {
  if (!Node.isIndexedAccessTypeNode(node)) {
    return;
  }
  const index = node.getIndexTypeNode();
  if (!Node.isLiteralTypeNode(index)) {
    return;
  }
  const literal = index.getLiteral();
  return Node.isStringLiteral(literal) && literal.getLiteralText() === "type" ? node.getObjectTypeNode() : undefined;
}

export function beltUnionNode(declaration: VariableDeclaration): MorphNode | undefined {
  const initializer = declaration.getInitializer();
  if (!Node.isSatisfiesExpression(initializer)) {
    return;
  }
  const type = initializer.getTypeNode();
  if (Node.isTypeReference(type) && type.getTypeName().getText() === "Record") {
    return indexedBusUnion(type.getTypeArguments()[0]);
  }
  const array = Node.isTypeOperatorTypeNode(type) ? type.getTypeNode() : type;
  return Node.isArrayTypeNode(array) ? indexedBusUnion(array.getElementTypeNode()) : undefined;
}

export function beltMembers(
  context: BusReadContext,
  declaration: VariableDeclaration,
  bus: BusDeclarationIdentity,
  unresolved: BusUnresolvedIdentity[],
): BusMemberIdentity[] {
  const initializer = declaration.getInitializerOrThrow();
  const authored = busAuthored(context, Node.isSatisfiesExpression(initializer) ? initializer.getExpression() : initializer);
  if (authored.kind === "unresolved") {
    unresolved.push(busRefusal({ context, stage: "member", reason: authored.reason, detail: authored.detail, node: authored.node, expected: bus }));
    return [];
  }
  const values: { readonly name: string; readonly node: MorphNode }[] = [];
  if (authored.value.kind === "object") {
    values.push(...authored.value.properties.map(({ key, keyNode }) => ({ name: key, node: keyNode })));
  } else if (authored.value.kind === "tuple") {
    values.push(
      ...authored.value.elements.flatMap((element) =>
        element.kind === "scalar" && typeof element.value === "string" ? [{ name: element.value, node: element.node }] : [],
      ),
    );
  }
  if (values.length === 0) {
    unresolved.push(
      busRefusal({
        context,
        stage: "member",
        reason: "missing",
        detail: `${declaration.getName()} resolves no event members`,
        node: declaration,
        expected: bus,
      }),
    );
  }
  return values.map(({ name, node }) => ({ bus, name, anchor: busAnchor(context, node) }));
}

function staticPropertyName(context: BusReadContext, node: MorphNode, unresolved: BusUnresolvedIdentity[]): string | undefined {
  if (Node.isIdentifier(node)) {
    return node.getText();
  }
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
    return node.getLiteralText();
  }
  if (!Node.isComputedPropertyName(node)) {
    return;
  }
  const read = busString(context, node.getExpression());
  if (read.kind === "unresolved") {
    unresolved.push(busRefusal({ context, stage: "emitter", reason: read.reason, detail: read.detail, node: read.node }));
    return;
  }
  return read.value;
}

function objectOf(context: BusReadContext, node: MorphNode, unresolved: BusUnresolvedIdentity[]): import("ts-morph").ObjectLiteralExpression | undefined {
  const stable = busStable(context, node);
  if (stable.kind === "unresolved") {
    if (!Node.isParameterDeclaration(stable.node)) {
      unresolved.push(busRefusal({ context, stage: "emitter", reason: stable.reason, detail: stable.detail, node: stable.node }));
    }
    return;
  }
  return Node.isObjectLiteralExpression(stable.value) ? stable.value : undefined;
}

export function authoredProperty(
  context: BusReadContext,
  object: import("ts-morph").ObjectLiteralExpression,
  wanted: string,
  unresolved: BusUnresolvedIdentity[],
): MorphNode | undefined {
  return [...object.getProperties()]
    .reverse()
    .reduce<MorphNode | undefined>((value, property) => value ?? authoredPropertyEntry(context, property, wanted, unresolved), undefined);
}

function authoredPropertyEntry(context: BusReadContext, property: MorphNode, wanted: string, unresolved: BusUnresolvedIdentity[]): MorphNode | undefined {
  if (Node.isSpreadAssignment(property)) {
    const spread = objectOf(context, property.getExpression(), unresolved);
    return spread === undefined ? undefined : authoredProperty(context, spread, wanted, unresolved);
  }
  if (!(Node.isPropertyAssignment(property) || Node.isShorthandPropertyAssignment(property))) {
    return;
  }
  if (staticPropertyName(context, property.getNameNode(), unresolved) !== wanted) {
    return;
  }
  return Node.isPropertyAssignment(property) ? property.getInitializer() : property.getNameNode();
}

function parameterDeclaration(context: BusReadContext, node: MorphNode): import("ts-morph").ParameterDeclaration | undefined {
  const stable = busStable(context, node);
  return stable.kind === "unresolved" && Node.isParameterDeclaration(stable.node) ? stable.node : undefined;
}

export interface ParameterProjection {
  readonly parameter: import("ts-morph").ParameterDeclaration;
  readonly memberPath: readonly string[];
}

export function parameterProjection(
  context: BusReadContext,
  node: MorphNode,
  property: string,
  unresolved: BusUnresolvedIdentity[],
): ParameterProjection | undefined {
  const direct = parameterDeclaration(context, node);
  if (direct !== undefined) {
    return { parameter: direct, memberPath: [] };
  }
  const object = objectOf(context, node, []);
  const value = object === undefined ? node : authoredProperty(context, object, property, unresolved);
  if (value === undefined) {
    return;
  }
  const parameter = parameterDeclaration(context, value);
  if (parameter !== undefined) {
    return { parameter, memberPath: [] };
  }
  const member = busMember(context, value);
  if (member.kind !== "resolved") {
    return;
  }
  const receiver = parameterDeclaration(context, member.value.receiver);
  return receiver === undefined ? undefined : { parameter: receiver, memberPath: [member.value.name] };
}

export function discriminatorValues(
  context: BusReadContext,
  node: MorphNode,
  property: string,
  unresolved: BusUnresolvedIdentity[],
): readonly { readonly value: string; readonly node: MorphNode }[] {
  const stable = busStable(context, node);
  if (stable.kind === "unresolved" && Node.isConditionalExpression(stable.node)) {
    return [
      ...discriminatorValues(context, stable.node.getWhenTrue(), property, unresolved),
      ...discriminatorValues(context, stable.node.getWhenFalse(), property, unresolved),
    ];
  }
  if (stable.kind === "unresolved") {
    if (!Node.isParameterDeclaration(stable.node)) {
      unresolved.push(busRefusal({ context, stage: "emitter", reason: stable.reason, detail: stable.detail, node: stable.node }));
    }
    return [];
  }
  const valueNode = Node.isObjectLiteralExpression(stable.value) ? authoredProperty(context, stable.value, property, unresolved) : stable.value;
  if (valueNode === undefined || parameterProjection(context, valueNode, property, []) !== undefined) {
    return [];
  }
  const value = busScalar(context, valueNode);
  if (value.kind === "unresolved") {
    unresolved.push(busRefusal({ context, stage: "emitter", reason: value.reason, detail: value.detail, node: value.node }));
    return [];
  }
  return typeof value.value === "string" ? [{ value: value.value, node: value.trace.origin }] : [];
}

/** The FLOW type of one argument delivered to a proven emitter sink, read as its discriminator set.
 *
 *  WHY THE FLOW TYPE AND NOT MORE SYNTAX: TypeScript narrows a union-annotated binding to the constituents
 *  it was actually assigned, so an argument the authored reader cannot walk — a conditional local, a
 *  factory result, a narrowed parameter — still carries its exact member set at the CALL. Reading it is
 *  the only way to prove those producers without re-implementing narrowing.
 *
 *  It answers a SET, never absence: `any`/`unknown`/`never`, a constituent with no `type` property, and a
 *  non-literal discriminator are all refusals the caller turns into a `BusUnresolvedIdentity`. The
 *  totality judgement (a set that is the WHOLE declared union proves no single producer) belongs to the
 *  caller, which is the only side that knows the bus's declared members. */
export function typedDiscriminators(context: BusReadContext, node: MorphNode): BusTypedDiscriminators {
  const readers = context.types(node);
  const selector = nodeTypeSelector(node);
  const selected = readers.select(selector);
  if (selected === null) {
    throw new Error("bus flow Type is absent");
  }
  const type = readers.type(selected);
  if (type.any || type.unknown || type.never) {
    return { kind: "refused", reason: "unsupported", detail: `the checker gives ${node.getKindName()} no readable event type` };
  }
  const union = readers.unions(selector);
  const values: string[] = [];
  for (const part of union.length > 0 ? union : [selector]) {
    const property = { ...part, steps: [...part.steps, { kind: "property" as const, name: "type", at: node }] };
    const literal = readers.select(property) === null ? null : readers.literal(property);
    if (literal === null) {
      return { kind: "refused", reason: "unsupported", detail: `an event constituent of ${node.getKindName()} carries no literal type discriminator` };
    }
    values.push(literal);
  }
  return values.length === 0
    ? { kind: "refused", reason: "missing", detail: `${node.getKindName()} resolves no event constituent` }
    : { kind: "resolved", values: [...new Set(values)].toSorted((left, right) => left.localeCompare(right)) };
}

/** A TOTALITY TABLE's key→discriminator translation: for `Record<Union["type"], Union>`-shaped consts, the
 *  member each key republishes. The coarse per-user fan (`COARSE_USER_BUS_EVENT[event.type]`) is exactly
 *  this shape, and reading the table as a producer is the measured false green the union's own header
 *  records — the table names every member, so the caller must relay the KEY, not harvest the table. This
 *  reader supplies the translation that makes the relayed key an honest emission. */
export function discriminatorTranslation(context: BusReadContext, receiver: MorphNode): ReadonlyMap<string, string> | undefined {
  const readers = context.types(receiver);
  const properties = readers.properties(nodeTypeSelector(receiver), receiver);
  const translation = new Map<string, string>();
  for (const property of properties) {
    const selector = { ...property.selector, steps: [...property.selector.steps, { kind: "property" as const, name: "type", at: receiver }] };
    const literal = readers.select(selector) === null ? null : readers.literal(selector);
    if (literal === null) {
      return;
    }
    translation.set(property.name, literal);
  }
  return translation.size === 0 ? undefined : translation;
}

export function callName(context: BusReadContext, call: CallExpression): string | undefined {
  const expression = call.getExpression();
  if (Node.isIdentifier(expression)) {
    return expression.getText();
  }
  const member = busMember(context, expression);
  return member.kind === "resolved" ? member.value.name : undefined;
}

export function typeForParameter(context: BusReadContext, call: CallExpression, index: number): NativeTypeSelector | undefined {
  return context.types(call).callParameters(call)?.[index];
}

/** The ONE callable a call resolves to. Aliased-PREFERRED and exactly-one on purpose — see the note in
 *  {@link aliasResolvedDeclarations} for why this cannot use the merged helper. */
export function callableDeclaration(context: BusReadContext, call: CallExpression): MorphNode | undefined {
  const expression = call.getExpression();
  const readers = context.types(call);
  const symbol = Node.isIdentifier(expression) || busMember(context, expression).kind === "resolved" ? readers.symbol(expression) : null;
  const declarations = symbol === null ? [] : readers.symbolData(readers.symbolData(symbol).canonical).declarations;
  return declarations.length === 1 ? declarations[0] : undefined;
}

/** The one live-fan mint. A receiver handle is never the identity — `bus`, `channel` and `this.#bus` are
 *  spellings — and the MINTING CALL cannot carry it either: `defineBusChannel` is an OVERLOADED export, so
 *  `resolveModuleMemberOrigin` refuses it as `ambiguous` and every real `.publish` fell through as a
 *  non-door (measured: the live `chatsChanged` relay was invisible for exactly this reason). The canonical
 *  fact is the METHOD: `publish` is declared once, by this file's `BusChannel` interface, and every
 *  channel — firehose or not — inherits that one declaration. */
const BUS_CHANNEL_HOME = "packages/server/src/transport/trpc/bus-channel.ts";

function busChannelPublisher(context: BusReadContext, receiver: MorphNode, name: string): boolean {
  // Through the shared reader (#2097): this predicate already demanded a NON-EMPTY declaration set, so the
  // unresolved arms ("no property symbol", "a symbol with no declaration") collapse to the empty set and
  // answer false exactly as the open-coded `?? []` did.
  const readers = context.types(receiver);
  const property = readers.properties({ ...nodeTypeSelector(receiver), steps: [{ kind: "nonnullable" }] }, receiver).find((entry) => entry.name === name);
  const declarations = property === undefined ? [] : readers.symbolData(property.symbol).declarations;
  return declarations.length > 0 && declarations.every((declaration) => declaredAt(context, declaration.getSourceFile(), BUS_CHANNEL_HOME));
}

function injectedReceiver(context: BusReadContext, receiver: MorphNode): boolean {
  let root = receiver;
  for (;;) {
    const member = busMember(context, root);
    if (member.kind !== "resolved") {
      break;
    }
    root = member.value.receiver;
  }
  const stable = busStable(context, root);
  return stable.kind === "unresolved" && Node.isParameterDeclaration(stable.node);
}

/** Prove the call reaches an injected callable or the one bus-channel publisher, not a same-typed decoy. */
export function emitterSink(context: BusReadContext, call: CallExpression): EmitterSinkKind | undefined {
  const expression = call.getExpression();
  if (Node.isIdentifier(expression)) {
    const readers = context.types(expression);
    const symbol = readers.symbol(expression);
    const declarations = symbol === null ? [] : readers.symbolData(symbol).declarations;
    if (declarations.length === 1 && Node.isParameterDeclaration(declarations[0])) {
      return "injected";
    }
    // NOT a dead end: `const publish = bus.publish; publish(userId, event)` is the same door one binding
    // later, and `resolveCallableMember` follows an immutable const alias to the member it holds. Stopping
    // here would let a LOCAL NAME decide identity, which is the thing this family exists to refuse.
  }
  const member = busCallableMember(context, expression);
  if (member === undefined) {
    return;
  }
  if (injectedReceiver(context, member.receiver)) {
    const readers = context.types(member.receiver);
    const property = readers.properties(nodeTypeSelector(member.receiver), member.receiver).find((entry) => entry.name === member.name);
    const declarations = property === undefined ? [] : readers.symbolData(property.symbol).declarations;
    return declarations.some((declaration) => Node.isPropertySignature(declaration)) ? "injected" : undefined;
  }
  return member.name === PUBLISH_MEMBER && busChannelPublisher(context, member.receiver, member.name) ? "channel" : undefined;
}

export function operationIdentity(context: BusReadContext, call: CallExpression, bus: BusDeclarationIdentity): BusOperationIdentity {
  const expression = call.getExpression();
  const member = busMember(context, expression);
  const wrapper = member.kind === "resolved" && ["call", "apply", "bind"].includes(member.value.name);
  const callable = context.invocation(expression).modules.get(expression);
  if (!wrapper && callable?.kind === "resolved" && callable.value.canonical.kind === "project") {
    return {
      kind: "module",
      module: { path: declarationHome(context, callable.value.canonical.sourceFile), exportName: callable.value.canonical.exportedName },
      memberPath: callable.value.memberPath,
    };
  }
  return { kind: "injected", owner: bus, memberPath: [callName(context, call) ?? "<call>"] };
}
