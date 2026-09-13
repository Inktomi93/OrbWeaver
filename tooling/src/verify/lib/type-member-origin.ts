// Shared TYPE-level origin facts: the declaration home of a member, of a contextual key, and of a node's
// own type. The value-origin readers in `reference-fact.ts` refuse a receiver produced by a call, which is
// what every client seam looks like (`useTRPC()`, `useQueryClient()`, a store hook, a form api). This is
// the other half of "identity, never spelling" for those subjects, and it is a pure reader over nodes the
// dispatcher delivered: no project discovery, no cache, no filesystem.
//
// WHY DECLARATIONS AND NOT A TYPE NAME: a type NAME is spelling again (`interface QueryClient` can be
// declared anywhere). The declaration's own source file is the home, and comparing it against a package
// directory or a project SourceFile identity is what a same-named lookalike cannot satisfy.
import type { Node as MorphNode, Symbol as MorphSymbol, SourceFile, Type, TypeNode } from "ts-morph";
import { Node, SyntaxKind, TypeFlags } from "ts-morph";
import type { ReferenceFact, ReferenceUnresolvedReason } from "../contract/reference-fact.ts";
import type { ContextualMemberOrigin, TypeIdentityOrigin, TypeMemberOrigin } from "../contract/type-member-origin.ts";
import { readMemberReference } from "./reference-fact.ts";

function resolved<T>(value: T, origin: MorphNode, declarations: readonly MorphNode[]): ReferenceFact<T> {
  return { kind: "resolved", value, trace: { declarations: [...declarations], origin } };
}

function unresolved(reason: ReferenceUnresolvedReason, node: MorphNode, detail: string): ReferenceFact<never> {
  return { kind: "unresolved", reason, detail, node, trace: { declarations: [], origin: node } };
}

function symbolDeclarations(symbol: MorphSymbol, node: MorphNode, subject: string): ReferenceFact<readonly MorphNode[]> {
  const declarations = symbol.getDeclarations();
  return declarations.length === 0 ? unresolved("missing", node, `${subject} has no declaration`) : resolved(declarations, node, declarations);
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

/** Resolve `<expression>.<name>` WHEN THERE IS NO MEMBER-ACCESS NODE TO HAND OVER — the BINDING-PATTERN twin
 *  of {@link resolveTypeMemberOrigin}. A destructure (`const { issues } = failure`) asks the same question
 *  the dotted read asks, but its subject is a `BindingElement`: there is no `PropertyAccessExpression` for
 *  the member reader to normalise, only the initializer expression and a name. Without this door a policy
 *  finishes the chain itself (`type.getProperty(name)?.getDeclarations()`) — the #2097 class, and the exact
 *  reason the audit routes those sites to a shared reader: a `lib/` reader that hands back a `Symbol`
 *  invites the gate to answer the declaration question, so the reader answers it.
 *
 *  NON-NULLABLE for the same reason the member reader is: a union carrying `undefined` exposes NO property
 *  symbols at all, and the read only happens where the receiver is present. Unresolved exactly when the
 *  checker resolves no such property, or resolves one with no declaration — both of which are "cannot be
 *  established", never "not this identity".
 *
 *  WHAT FOLDED ONTO IT, AND WHAT DID NOT (the move must END a duplicate, never create one). Folded in the
 *  same commit: `project-home-origin.ts#uncastMemberDeclaredByPackage` and
 *  `bus-fact-read.ts#busChannelPublisher` — both spelled the identical chain and both already treated "no
 *  symbol" and "no declaration" as one no-evidence answer, so each collapses an unresolved fact to `[]` and
 *  is behaviour-identical. NOT folded: `resolveTypeMemberOrigin` directly above, which looks like the same
 *  three lines and is a DIFFERENT predicate — it anchors its refusal on the `nameNode` rather than on the
 *  receiver expression (the coordinate a policy reports), and it needs the property SYMBOL itself for the
 *  `TypeMemberOrigin` it returns, which this reader deliberately does not hand back. Folding it would move
 *  every one of that reader's refusal positions. */
export function resolveTypePropertyOrigin(expression: MorphNode, name: string): ReferenceFact<readonly MorphNode[]> {
  const symbol = expression.getType().getNonNullableType().getProperty(name);
  if (symbol === undefined) {
    return unresolved("missing", expression, `the checker resolved no property symbol named ${name} on ${expression.getText()}`);
  }
  return symbolDeclarations(symbol, expression, `property ${name}`);
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
  const contextual: Type | undefined = literal.getContextualType();
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

/** Resolve a node's own TYPE to the declarations of the symbol that names it — the alias symbol when the
 *  checker kept one (`GatedStoreHook<T>`), otherwise the structural symbol. */
export function resolveTypeIdentityOrigin(node: MorphNode): ReferenceFact<TypeIdentityOrigin> {
  const type = node.getType();
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

/** One step UP a declared type-alias chain: `type MyHook = GatedStoreHook<T>` steps from `MyHook` to
 *  `GatedStoreHook`, following an import specifier to the real declaration on the way. */
function aliasStep(origin: TypeIdentityOrigin): TypeIdentityOrigin | undefined {
  let step: TypeIdentityOrigin | undefined;
  for (const declaration of origin.declarations) {
    if (step !== undefined || !Node.isTypeAliasDeclaration(declaration)) {
      continue;
    }
    const typeNode = declaration.getTypeNode();
    if (typeNode === undefined || !Node.isTypeReference(typeNode)) {
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
  const chain: TypeIdentityOrigin[] = [first.value];
  const visited = new Set<object>(first.value.declarations.map((declaration) => declaration.compilerNode));
  let current: TypeIdentityOrigin = first.value;
  for (;;) {
    const next: TypeIdentityOrigin | undefined = aliasStep(current);
    if (next === undefined || next.declarations.some((declaration) => visited.has(declaration.compilerNode))) {
      break;
    }
    for (const declaration of next.declarations) {
      visited.add(declaration.compilerNode);
    }
    chain.push(next);
    current = next;
  }
  return resolved(
    chain,
    node,
    chain.flatMap((origin) => origin.declarations),
  );
}

/** One authored reference's declaration identity. This is provenance only: the value query below must
 *  establish that this reference's resolved type is actually carried by the received value. */
function annotationReferenceOrigin(node: MorphNode): ReferenceFact<TypeIdentityOrigin> {
  const symbol = node.getSymbol();
  const target = symbol?.getAliasedSymbol() ?? symbol;
  if (target === undefined) {
    return unresolved("missing", node, `the checker resolved no type reference for ${node.getText()}`);
  }
  const declarations = symbolDeclarations(target, node, `type reference ${target.getName()}`);
  return declarations.kind === "unresolved"
    ? declarations
    : resolved(
        { name: target.getName(), node, aliased: declarations.value.some(Node.isTypeAliasDeclaration), declarations: declarations.value },
        node,
        declarations.value,
      );
}

/** Syntax supplies candidate provenance, never a value edge. In particular a generic argument or keyof
 *  operand can name an identity the resulting value does not carry. Eligibility is decided by the checker
 *  graph, not by reaching this syntax. Callable signatures supply no data edge. */
function dataMemberAnnotation(node: MorphNode): readonly TypeNode[] {
  let annotation: TypeNode | undefined;
  if (Node.isPropertySignature(node) || Node.isPropertyDeclaration(node)) {
    annotation = node.getTypeNode();
  } else if (Node.isIndexSignatureDeclaration(node)) {
    annotation = node.getReturnTypeNode();
  }
  return annotation === undefined ? [] : [annotation];
}

function annotationChildren(node: TypeNode): readonly TypeNode[] {
  if (Node.isIndexedAccessTypeNode(node)) {
    const key = node.getIndexTypeNode().getType();
    const keys = key.isUnion() ? key.getUnionTypes() : [key];
    // Only selected literal members supply authored candidate provenance. Traversing the holder would
    // falsely import a Row sibling into Holder["clean"]. Nonliteral outputs still use the checker graph.
    return keys.flatMap((selected) => {
      const value = selected.getLiteralValue();
      if (typeof value !== "string" && typeof value !== "number") {
        return [];
      }
      const member = resolveTypePropertyOrigin(node.getObjectTypeNode(), String(value));
      return member.kind === "resolved" ? member.value.flatMap(dataMemberAnnotation) : [];
    });
  }
  if (Node.isTypeReference(node)) {
    return node.getTypeArguments();
  }
  if (Node.isConditionalTypeNode(node)) {
    return [node.getTrueType(), node.getFalseType()];
  }
  if (Node.isMappedTypeNode(node)) {
    const output = node.getTypeNode();
    return output === undefined ? [] : [output];
  }
  if (Node.isArrayTypeNode(node)) {
    return [node.getElementTypeNode()];
  }
  if (
    Node.isTypeOperatorTypeNode(node) ||
    Node.isParenthesizedTypeNode(node) ||
    Node.isNamedTupleMember(node) ||
    Node.isOptionalTypeNode(node) ||
    Node.isRestTypeNode(node)
  ) {
    return [node.getTypeNode()];
  }
  if (Node.isUnionTypeNode(node) || Node.isIntersectionTypeNode(node)) {
    return node.getTypeNodes();
  }
  if (Node.isTypeLiteral(node)) {
    return node.getMembers().flatMap(dataMemberAnnotation);
  }
  return Node.isTupleTypeNode(node) ? node.getElements() : [];
}

function unprovenTypeIdentity(origin: TypeIdentityOrigin, reason: ReferenceUnresolvedReason, detail: string): ReferenceFact<TypeIdentityOrigin> {
  return { kind: "unresolved", reason, detail, node: origin.node, trace: { origin: origin.node, declarations: origin.declarations } };
}

function opaqueType(type: Type): boolean {
  return type.isAny() || type.isUnknown() || type.isTypeParameter();
}

function projectedInterfaceOrigin(declaration: MorphNode): readonly ReferenceFact<TypeIdentityOrigin>[] {
  const parent = declaration.getParent();
  if (parent === undefined || !Node.isInterfaceDeclaration(parent)) {
    return [];
  }
  const origin = annotationReferenceOrigin(parent.getNameNode());
  return origin.kind === "unresolved"
    ? []
    : [unprovenTypeIdentity(origin.value, "unsupported", "member provenance does not establish the containing value's type identity")];
}

/** Actual data types, never callable parameters/results, type arguments or constraints. A named property
 *  carries its type regardless of whether a type literal, interface or mapping declared it. Member-origin
 *  provenance alone cannot establish the containing object's identity after a projection. */
function valueTypeEdges(
  type: Type,
  annotation: TypeNode,
): {
  readonly types: readonly { readonly type: Type; readonly definitions: readonly TypeNode[] }[];
  readonly projections: readonly ReferenceFact<TypeIdentityOrigin>[];
  readonly annotations: readonly TypeNode[];
} {
  // Primitive prototype members are not contained data. Object properties include callable values, but
  // the traversal never follows their signatures; a function can still have its own named data property.
  const properties = type.isObject() ? type.getProperties() : [];
  const declarations = properties.flatMap((property) => property.getDeclarations());
  // A narrowed conditional output uses a substitution wrapper. Unlike a type parameter's constraint,
  // its apparent type is the resolved output. Opaque type parameters never reach this function.
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript TypeFlags is a compiler-owned bitfield; only a substitution output is normalized, never a generic constraint.
  const substituted = (type.getFlags() & TypeFlags.Substitution) !== 0 ? [type.getApparentType()] : [];
  const indices = [type.getNumberIndexType(), type.getStringIndexType()].flatMap((element) => (element === undefined ? [] : [element]));
  const aggregateDefinitions = (type.getAliasSymbol()?.getDeclarations() ?? []).flatMap((declaration) => {
    const body = Node.isTypeAliasDeclaration(declaration) ? declaration.getTypeNode() : undefined;
    return body === undefined ? [] : [body];
  });
  return {
    types: [
      ...[...type.getUnionTypes(), ...type.getIntersectionTypes(), ...type.getTupleElements(), ...indices, ...substituted].map((element) => ({
        type: element,
        definitions: aggregateDefinitions,
      })),
      ...properties.map((property) => ({
        type: property.getTypeAtLocation(annotation),
        definitions: property.getDeclarations().flatMap(dataMemberAnnotation),
      })),
    ],
    projections: declarations.flatMap(projectedInterfaceOrigin),
    annotations: declarations.flatMap(dataMemberAnnotation),
  };
}

type GenericDeclaration = import("ts-morph").InterfaceDeclaration | import("ts-morph").TypeAliasDeclaration;

interface GenericDescriptor {
  readonly target: object;
  readonly declaration?: GenericDeclaration;
  readonly arguments: readonly Type[];
}

function declaredGeneric(symbol: MorphSymbol | undefined): GenericDeclaration | undefined {
  return symbol
    ?.getDeclarations()
    .find(
      (candidate): candidate is GenericDeclaration =>
        (Node.isTypeAliasDeclaration(candidate) || Node.isInterfaceDeclaration(candidate)) && candidate.getTypeParameters().length > 0,
    );
}

/** One compiler/declaration identity space for a constructor and its supplied arguments. A zero-parameter
 *  alias follows its authored TypeReference rather than relying on checker alias retention. */
function genericDescriptor(type: Type): GenericDescriptor | undefined {
  const alias = type.getAliasSymbol();
  const declaration = declaredGeneric(alias ?? type.getSymbol());
  if (declaration !== undefined) {
    const aliasArguments = type.getAliasTypeArguments();
    return { target: declaration.compilerNode, declaration, arguments: aliasArguments.length > 0 ? aliasArguments : type.getTypeArguments() };
  }
  const aliasDeclaration = alias?.getDeclarations().find(Node.isTypeAliasDeclaration);
  const body = aliasDeclaration?.getTypeNode();
  if (body !== undefined && Node.isTypeReference(body)) {
    const name = body.getTypeName();
    const symbol = (Node.isQualifiedName(name) ? name.getRight() : name).getSymbol();
    const targetDeclaration = declaredGeneric(symbol?.getAliasedSymbol() ?? symbol);
    if (targetDeclaration !== undefined) {
      return {
        target: targetDeclaration.compilerNode,
        declaration: targetDeclaration,
        arguments: body.getTypeArguments().map((argument) => argument.getType()),
      };
    }
  }
  const target = type.getTargetType()?.compilerType;
  return target === undefined ? undefined : { target, arguments: type.getTypeArguments() };
}

/** Generic constructor identity comes from the compiler declaration, never a type or utility name. */
function genericTarget(type: Type): object | undefined {
  return genericDescriptor(type)?.target;
}

/** Peeling a supplied argument is finite nesting, not recursive construction: `Box<Box<Row>>` to `Box<Row>`.
 *  Arguments are used only to classify recurrence; they never become data-containment evidence. */
function suppliedArgumentContains(outer: Type, inner: Type): boolean {
  const seen = new Set<object>();
  const pending = [...outer.getAliasTypeArguments(), ...outer.getTypeArguments()];
  for (let candidate = pending.pop(); candidate !== undefined; candidate = pending.pop()) {
    if (candidate.compilerType === inner.compilerType) {
      return true;
    }
    if (!seen.has(candidate.compilerType)) {
      seen.add(candidate.compilerType);
      pending.push(...candidate.getAliasTypeArguments(), ...candidate.getTypeArguments());
    }
  }
  return false;
}

function genericArguments(type: Type): readonly Type[] {
  return genericDescriptor(type)?.arguments ?? [];
}

function containedTypeEdges(candidate: Type, context: TransportContext): readonly Type[] {
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript TypeFlags is a compiler-owned bitfield; only a substitution output is normalized.
  const substituted = (candidate.getFlags() & TypeFlags.Substitution) !== 0 ? [candidate.getApparentType()] : [];
  const aggregate = [...candidate.getUnionTypes(), ...candidate.getIntersectionTypes(), ...candidate.getTupleElements()];
  const properties = candidate.isObject() && aggregate.length === 0 && !candidate.isArray() ? candidate.getProperties() : [];
  const indices = [candidate.getNumberIndexType(), candidate.getStringIndexType()].flatMap((index) => (index === undefined ? [] : [index]));
  return [...aggregate, ...indices, ...substituted, ...properties.map((property) => property.getTypeAtLocation(context.location))];
}

type Containment = "no" | "possible" | "yes";

function summaryContainment(candidate: Type, expected: Type, summary: ConstructorSummary, context: TransportContext): Containment {
  const arguments_ = genericArguments(candidate);
  const relationAt = (index: number): Containment => {
    const argument = arguments_[index];
    return argument === undefined ? "no" : typeExpressionContains(argument, expected, context);
  };
  const definite = [...summary.definite].map(relationAt);
  if (definite.includes("yes")) {
    return "yes";
  }
  const possible = [...summary.possible].map(relationAt);
  return definite.includes("possible") || possible.some((relation) => relation !== "no") || summary.outputs.has(expected.compilerType) ? "possible" : "no";
}

function summarizedContainment(candidate: Type, expected: Type, context: TransportContext): Containment | undefined {
  const target = genericTarget(candidate);
  const summary = target === undefined ? undefined : context.summaries.get(target);
  return summary === undefined ? undefined : summaryContainment(candidate, expected, summary, context);
}

function strongestContainment(relations: readonly Containment[]): Containment {
  if (relations.includes("yes")) {
    return "yes";
  }
  return relations.includes("possible") ? "possible" : "no";
}

/** Does a resolved type expression retain another resolved type through its value-bearing shape?
 *  A recurrence target's properties are already represented by the recurrence state, so expanding them
 *  here would recreate the infinite graph. Its arguments are not evidence either: erased arguments and
 *  callable positions remain outside DATA CONTAINMENT. */
function typeExpressionContains(type: Type, expected: Type, context: TransportContext): Containment {
  const cached = context.relations.get(type.compilerType)?.get(expected.compilerType);
  if (cached !== undefined) {
    return cached;
  }
  const seen = new Set<object>();
  const pending = [type];
  let contains: Containment = "no";
  for (let candidate = pending.pop(); candidate !== undefined; candidate = pending.pop()) {
    if (candidate.compilerType === expected.compilerType) {
      contains = "yes";
      break;
    }
    if (seen.has(candidate.compilerType)) {
      continue;
    }
    seen.add(candidate.compilerType);
    const relation = summarizedContainment(candidate, expected, context);
    if (relation !== undefined) {
      if (relation === "yes") {
        contains = "yes";
        break;
      }
      if (relation === "possible") {
        contains = "possible";
      }
      continue;
    }
    pending.push(...containedTypeEdges(candidate, context));
  }
  const relations = context.relations.get(type.compilerType) ?? new Map<object, Containment>();
  relations.set(expected.compilerType, contains);
  context.relations.set(type.compilerType, relations);
  return contains;
}

interface RecurrenceFrame {
  readonly target: object;
  readonly roots: readonly Type[];
  readonly relations: Map<object, Map<object, Containment>>;
  readonly signatures: Set<string>;
}

interface TransportContext {
  readonly location: TypeNode;
  readonly relations: Map<object, Map<object, Containment>>;
  readonly summaries: ReadonlyMap<object, ConstructorSummary>;
}

/** A recurrence state records parameter transport and immediate data outputs relative to the first
 *  instantiation's arguments. The boolean lattice is finite even when concrete types keep growing. */
function recurrenceSignature(type: Type, edges: readonly Type[], roots: readonly Type[], context: TransportContext): string {
  const relation = (candidate: Type): readonly Containment[] => roots.map((root) => typeExpressionContains(candidate, root, context));
  const data = roots.map((root) => {
    const relations = edges.map((edge) => typeExpressionContains(edge, root, context));
    return strongestContainment(relations);
  });
  return JSON.stringify({ arguments: genericArguments(type).map(relation), data });
}

function genericDeclaration(type: Type): GenericDeclaration | undefined {
  return genericDescriptor(type)?.declaration;
}

function declarationDataAnnotations(declaration: GenericDeclaration): readonly TypeNode[] {
  if (Node.isInterfaceDeclaration(declaration)) {
    return declaration.getMembers().flatMap(dataMemberAnnotation);
  }
  const body = declaration.getTypeNode();
  if (body === undefined) {
    return [];
  }
  return Node.isTypeLiteral(body) ? body.getMembers().flatMap(dataMemberAnnotation) : [body];
}

interface ConstructorSummary {
  readonly declaration: GenericDeclaration;
  readonly definite: Set<number>;
  readonly possible: Set<number>;
  readonly outputs: Map<object, Type>;
  readonly successors: Set<object>;
  recursive: boolean;
  unsupported: boolean;
}

interface ParameterFlow {
  readonly definite: ReadonlySet<number>;
  readonly possible: ReadonlySet<number>;
  readonly outputs: readonly Type[];
  readonly unsupported: boolean;
}

function emptyFlow(): ParameterFlow {
  return { definite: new Set(), possible: new Set(), outputs: [], unsupported: false };
}

function mergeFlow(flows: readonly ParameterFlow[]): ParameterFlow {
  const outputs = new Map<object, Type>();
  for (const type of flows.flatMap((flow) => flow.outputs)) {
    outputs.set(type.compilerType, type);
  }
  return {
    definite: new Set(flows.flatMap((flow) => [...flow.definite])),
    possible: new Set(flows.flatMap((flow) => [...flow.possible, ...flow.definite])),
    outputs: [...outputs.values()],
    unsupported: flows.some((flow) => flow.unsupported),
  };
}

function parameterIndex(node: TypeNode, indices: ReadonlyMap<object, number>): number | undefined {
  if (!Node.isTypeReference(node)) {
    return;
  }
  const name = node.getTypeName();
  const symbol = (Node.isQualifiedName(name) ? name.getRight() : name).getSymbol();
  return (symbol?.getDeclarations() ?? []).flatMap((declaration) => {
    const index = indices.get(declaration.compilerNode);
    return index === undefined ? [] : [index];
  })[0];
}

function conditionalFlow(
  node: import("ts-morph").ConditionalTypeNode,
  indices: ReadonlyMap<object, number>,
  summaries: ReadonlyMap<object, ConstructorSummary>,
): ParameterFlow {
  const outputs = [node.getTrueType(), node.getFalseType()].map((output) => expressionFlow(output, indices, summaries));
  const possible = mergeFlow(outputs);
  const outputTypes = new Map<object, Type>(possible.outputs.map((type) => [type.compilerType, type]));
  for (const output of [node.getTrueType(), node.getFalseType()]) {
    const type = output.getType();
    if (!(opaqueType(type) || type.isNever())) {
      outputTypes.set(type.compilerType, type);
    }
  }
  return { definite: new Set(), possible: new Set([...possible.definite, ...possible.possible]), outputs: [...outputTypes.values()], unsupported: true };
}

function referenceFlow(
  node: import("ts-morph").TypeReferenceNode,
  indices: ReadonlyMap<object, number>,
  summaries: ReadonlyMap<object, ConstructorSummary>,
): ParameterFlow {
  const summary = summaries.get(genericTarget(node.getType()) ?? node.compilerNode);
  if (summary === undefined) {
    return node.getType().isObject() ? possibleParameterFlow(node, indices) : emptyFlow();
  }
  const arguments_ = node.getTypeArguments();
  const flowsFor = (positions: ReadonlySet<number>): readonly ParameterFlow[] =>
    [...positions].flatMap((index) => (arguments_[index] === undefined ? [] : [expressionFlow(arguments_[index], indices, summaries)]));
  const definite = mergeFlow(flowsFor(summary.definite));
  const possible = mergeFlow(flowsFor(summary.possible));
  return {
    definite: new Set(definite.definite),
    possible: new Set([...definite.possible, ...possible.definite, ...possible.possible]),
    outputs: [...summary.outputs.values(), ...definite.outputs, ...possible.outputs],
    unsupported: summary.unsupported || definite.unsupported || possible.unsupported,
  };
}

function possibleParameterFlow(node: TypeNode, indices: ReadonlyMap<object, number>): ParameterFlow {
  if (Node.isFunctionTypeNode(node) || Node.isConstructorTypeNode(node)) {
    return emptyFlow();
  }
  const references = [node, ...node.getDescendants()].flatMap((candidate) => (Node.isTypeReference(candidate) ? [candidate] : []));
  return {
    definite: new Set(),
    possible: new Set(references.flatMap((reference) => parameterIndex(reference, indices) ?? [])),
    outputs: [],
    unsupported: true,
  };
}

function expressionFlow(node: TypeNode, indices: ReadonlyMap<object, number>, summaries: ReadonlyMap<object, ConstructorSummary>): ParameterFlow {
  if (Node.isFunctionTypeNode(node) || Node.isConstructorTypeNode(node)) {
    return emptyFlow();
  }
  if (Node.isTypeOperatorTypeNode(node) && node.getOperator() === SyntaxKind.KeyOfKeyword) {
    return emptyFlow();
  }
  if (Node.isConditionalTypeNode(node)) {
    return conditionalFlow(node, indices, summaries);
  }
  if (Node.isMappedTypeNode(node)) {
    const output = node.getTypeNode();
    if (output === undefined) {
      return possibleParameterFlow(node, indices);
    }
    const flow = possibleParameterFlow(output, indices);
    return { ...flow, outputs: [...flow.outputs, output.getType()], unsupported: true };
  }
  const ownParameter = parameterIndex(node, indices);
  if (ownParameter !== undefined) {
    return { definite: new Set([ownParameter]), possible: new Set([ownParameter]), outputs: [], unsupported: false };
  }
  if (Node.isTypeReference(node)) {
    return referenceFlow(node, indices, summaries);
  }
  if (Node.isIndexedAccessTypeNode(node) && annotationChildren(node).length === 0) {
    return possibleParameterFlow(node.getObjectTypeNode(), indices);
  }
  const children = annotationChildren(node);
  return children.length === 0 ? emptyFlow() : mergeFlow(children.map((child) => expressionFlow(child, indices, summaries)));
}

function referencedConstructors(declaration: GenericDeclaration): readonly Type[] {
  return declarationDataAnnotations(declaration).flatMap((annotation) =>
    [annotation, ...annotation.getDescendants()].flatMap((node) => {
      if (!Node.isTypeReference(node)) {
        return [];
      }
      const type = node.getType();
      return genericTarget(type) === undefined || genericDeclaration(type) === undefined ? [] : [type];
    }),
  );
}

function referencedTypes(node: TypeNode): readonly Type[] {
  return [node, ...node.getDescendants()].flatMap((candidate) => (Node.isTypeReference(candidate) ? [candidate.getType()] : []));
}

function collectConstructorSummaries(root: TypeNode): Map<object, ConstructorSummary> {
  const summaries = new Map<object, ConstructorSummary>();
  const declarations = new Set<object>();
  const pending = [...referencedTypes(root)];
  for (let type = pending.pop(); type !== undefined; type = pending.pop()) {
    const target = genericTarget(type);
    const declaration = genericDeclaration(type);
    if (declaration === undefined || declarations.has(declaration.compilerNode)) {
      continue;
    }
    declarations.add(declaration.compilerNode);
    if (target !== undefined && declaration.getTypeParameters().length > 0) {
      summaries.set(target, {
        declaration,
        definite: new Set(),
        possible: new Set(),
        outputs: new Map(),
        successors: new Set(),
        recursive: false,
        unsupported: false,
      });
    }
    pending.push(...referencedConstructors(declaration));
  }
  return summaries;
}

function constructorReaches(start: object, target: object, summaries: ReadonlyMap<object, ConstructorSummary>, seen: Set<object>): boolean {
  if (seen.has(start)) {
    return false;
  }
  seen.add(start);
  const summary = summaries.get(start);
  return summary !== undefined && [...summary.successors].some((successor) => successor === target || constructorReaches(successor, target, summaries, seen));
}

function classifyRecursiveConstructors(summaries: ReadonlyMap<object, ConstructorSummary>): void {
  for (const summary of summaries.values()) {
    for (const referenced of referencedConstructors(summary.declaration)) {
      const successor = genericTarget(referenced);
      if (successor !== undefined && summaries.has(successor)) {
        summary.successors.add(successor);
      }
    }
  }
  for (const [target, summary] of summaries) {
    summary.recursive = [...summary.successors].some((successor) => successor === target || constructorReaches(successor, target, summaries, new Set()));
  }
}

function addIndices(target: Set<number>, source: ReadonlySet<number>): boolean {
  let changed = false;
  for (const index of source) {
    if (!target.has(index)) {
      target.add(index);
      changed = true;
    }
  }
  return changed;
}

function updateConstructorSummary(summary: ConstructorSummary, summaries: ReadonlyMap<object, ConstructorSummary>): boolean {
  const parameters = summary.declaration.getTypeParameters();
  const indices = new Map<object, number>(parameters.map((parameter, index) => [parameter.compilerNode, index]));
  const flow = mergeFlow(declarationDataAnnotations(summary.declaration).map((annotation) => expressionFlow(annotation, indices, summaries)));
  const flowChanged = addIndices(summary.definite, flow.definite) || addIndices(summary.possible, flow.possible);
  let outputsChanged = false;
  for (const type of flow.outputs) {
    if (!summary.outputs.has(type.compilerType)) {
      summary.outputs.set(type.compilerType, type);
      outputsChanged = true;
    }
  }
  const unsupportedChanged = flow.unsupported && !summary.unsupported;
  summary.unsupported ||= flow.unsupported;
  return flowChanged || outputsChanged || unsupportedChanged;
}

/** Least fixed point over declaration parameters. Definite flow uses only structural data operators;
 *  dependent mappings/conditionals contribute candidate-specific possible flow but never a positive. */
function constructorSummaries(root: TypeNode): ReadonlyMap<object, ConstructorSummary> {
  const summaries = collectConstructorSummaries(root);
  classifyRecursiveConstructors(summaries);
  let changed = true;
  while (changed) {
    changed = false;
    for (const summary of summaries.values()) {
      changed = updateConstructorSummary(summary, summaries) || changed;
    }
  }
  return summaries;
}

/** The actual data path already re-entered a constructor. Its source definition must independently name
 *  that same target before changing instantiation is refused; a parameter's spelling alone cannot do so. */
function dataDefinitionReenters(definition: TypeNode, target: object, activeDeclarations: ReadonlySet<object>): boolean {
  // A finite input like Readonly<{ child: Readonly<Row> }> names the constructor in caller-authored
  // data, not in that constructor's recursive definition. Only active generic declarations can recur.
  if (!definition.getAncestors().some((ancestor) => activeDeclarations.has(ancestor.compilerNode))) {
    return false;
  }
  const seen = new Set<object>();
  const pending = [definition];
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    if (Node.isTypeReference(node) && genericTarget(node.getType()) === target) {
      return true;
    }
    if (!seen.has(node.compilerNode)) {
      seen.add(node.compilerNode);
      pending.push(...annotationChildren(node));
    }
  }
  return false;
}

interface RecurrenceAncestor {
  readonly type: Type;
  readonly definitionStart: number;
  readonly frame?: RecurrenceFrame;
}

interface RecurrenceStep {
  readonly type: Type;
  readonly ancestors: readonly RecurrenceAncestor[];
  readonly definitions: readonly TypeNode[];
}

function activeGenericDeclarations(ancestors: readonly RecurrenceAncestor[]): ReadonlySet<object> {
  return new Set(
    ancestors.flatMap((ancestor) => {
      const symbol = ancestor.type.getAliasSymbol() ?? ancestor.type.getSymbol();
      return genericTarget(ancestor.type) === undefined ? [] : (symbol?.getDeclarations() ?? []).map((declaration) => declaration.compilerNode);
    }),
  );
}

function recurrenceAncestor(step: RecurrenceStep, target: object): RecurrenceAncestor | undefined {
  const activeDeclarations = activeGenericDeclarations(step.ancestors);
  return [...step.ancestors]
    .reverse()
    .find(
      (ancestor) =>
        genericTarget(ancestor.type) === target &&
        !suppliedArgumentContains(ancestor.type, step.type) &&
        step.definitions.slice(ancestor.definitionStart).some((definition) => dataDefinitionReenters(definition, target, activeDeclarations)),
    );
}

function repeatedCandidateRoots(type: Type, frame: RecurrenceFrame, context: TransportContext): readonly Type[] {
  const dataParameters = context.summaries.get(frame.target)?.possible ?? new Set<number>();
  const argumentsAtBoundary = genericArguments(type);
  return frame.roots.filter((root) =>
    [...dataParameters].some((index) => {
      const argument = argumentsAtBoundary[index];
      return argument !== undefined && typeExpressionContains(argument, root, context) !== "no";
    }),
  );
}

function unsupportedClosedOutputs(summary: ConstructorSummary | undefined): readonly Type[] {
  return summary === undefined || !summary.unsupported ? [] : [...summary.outputs.values()];
}

function advanceRecurrence(
  step: RecurrenceStep,
  edges: readonly Type[],
  location: TypeNode,
  summaries: ReadonlyMap<object, ConstructorSummary>,
): { readonly frame?: RecurrenceFrame; readonly repeatedRoots: readonly Type[]; readonly stop: boolean } {
  const target = genericTarget(step.type);
  if (target === undefined || summaries.get(target)?.recursive !== true) {
    return { repeatedRoots: [], stop: false };
  }
  const frame = recurrenceAncestor(step, target)?.frame;
  if (frame === undefined) {
    const roots = genericArguments(step.type);
    const relations = new Map<object, Map<object, Containment>>();
    const context = { location, relations, summaries };
    return {
      frame: { target, roots, relations, signatures: new Set([recurrenceSignature(step.type, edges, roots, context)]) },
      repeatedRoots: [],
      stop: false,
    };
  }
  const context = { location, relations: frame.relations, summaries };
  const signature = recurrenceSignature(step.type, edges, frame.roots, context);
  if (!frame.signatures.has(signature)) {
    frame.signatures.add(signature);
    return { frame, repeatedRoots: [], stop: false };
  }
  return {
    frame,
    repeatedRoots: [...repeatedCandidateRoots(step.type, frame, context), ...unsupportedClosedOutputs(summaries.get(frame.target))],
    stop: true,
  };
}

/** Stable recursive types terminate by compilerType identity. A changed generic instantiation needs a
 *  separate boundary: an active data definition that recursively names its target is unsupported rather
 *  than expanded indefinitely. Finite supplied-argument nesting remains supported. No hop/time cap. */
function annotationValueGraph(annotation: TypeNode): {
  readonly types: readonly Type[];
  readonly projections: readonly ReferenceFact<TypeIdentityOrigin>[];
  readonly annotations: readonly TypeNode[];
  readonly recursiveTypes: ReadonlySet<object>;
} {
  const types = new Map<object, Type>();
  const projections: ReferenceFact<TypeIdentityOrigin>[] = [];
  const annotations = new Map<object, TypeNode>();
  const recursiveTypes = new Set<object>();
  const summaries = constructorSummaries(annotation);
  const pending: RecurrenceStep[] = [{ type: annotation.getType(), ancestors: [], definitions: [] }];
  for (let step = pending.pop(); step !== undefined; step = pending.pop()) {
    const { type, ancestors, definitions } = step;
    if (types.has(type.compilerType)) {
      continue;
    }
    types.set(type.compilerType, type);
    if (opaqueType(type)) {
      continue;
    }
    const edges = valueTypeEdges(type, annotation);
    const recurrence = advanceRecurrence(
      step,
      edges.types.map(({ type: edge }) => edge),
      annotation,
      summaries,
    );
    for (const root of recurrence.repeatedRoots) {
      recursiveTypes.add(root.compilerType);
    }
    if (recurrence.stop) {
      continue;
    }
    const ancestor: RecurrenceAncestor = {
      type,
      definitionStart: definitions.length,
      ...(recurrence.frame === undefined ? {} : { frame: recurrence.frame }),
    };
    const nextAncestors = [...ancestors, ancestor];
    pending.push(...edges.types.map((edge) => ({ type: edge.type, ancestors: nextAncestors, definitions: [...definitions, ...edge.definitions] })));
    projections.push(...edges.projections);
    for (const member of edges.annotations) {
      annotations.set(member.compilerNode, member);
    }
  }
  return { types: [...types.values()], projections, annotations: [...annotations.values()], recursiveTypes };
}

function annotationAliasBodies(origin: TypeIdentityOrigin, visited: Set<object>): readonly ReferenceFact<TypeNode>[] {
  const bodies: ReferenceFact<TypeNode>[] = [];
  for (const declaration of origin.declarations) {
    if (visited.has(declaration.compilerNode)) {
      continue;
    }
    visited.add(declaration.compilerNode);
    if (Node.isInterfaceDeclaration(declaration)) {
      // In particular retain index annotations whose opaque element leaves no property declaration.
      bodies.push(
        ...declaration
          .getMembers()
          .flatMap(dataMemberAnnotation)
          .map((member) => resolved(member, declaration, [declaration])),
      );
      continue;
    }
    if (!Node.isTypeAliasDeclaration(declaration)) {
      continue;
    }
    const body = declaration.getTypeNode();
    bodies.push(
      body === undefined
        ? unresolved("missing", declaration, `type alias ${declaration.getName()} has no authored body`)
        : resolved(body, declaration, [declaration]),
    );
  }
  return bodies;
}

/** A concrete transforming expression bounds candidate provenance to its own value positions. Otherwise
 *  an unknown sibling could make a proven-erased Phantom<Row> argument look unreadable. The finite prefix
 *  before a recursive boundary is still a valid scope: recursion makes only actual data candidates on that
 *  prefix unreadable, never every supplied argument. An opaque result cannot supply a bound and deliberately
 *  keeps its authored candidates unresolved. */
function candidateScopes(node: TypeNode, scopes: readonly ReadonlySet<object>[]): readonly ReadonlySet<object>[] {
  if (!(Node.isTypeReference(node) || Node.isTypeOperatorTypeNode(node) || Node.isIndexedAccessTypeNode(node) || Node.isConditionalTypeNode(node))) {
    return scopes;
  }
  // biome-ignore lint/suspicious/noBitwiseOperators: a still-dependent conditional has no concrete output with which to bound its possible branches, including through an alias reference.
  if ((node.getType().getFlags() & TypeFlags.Conditional) !== 0) {
    return scopes;
  }
  const graph = annotationValueGraph(node);
  return graph.types.some(opaqueType) ? scopes : [...scopes, new Set([...graph.types.map((type) => type.compilerType), ...graph.recursiveTypes])];
}

/** Declaration candidates, not evidence of receipt. Their effective types still have to match a value
 *  position. This syntax pass preserves authored alias names that checker simplification can erase. */
function annotationCandidates(annotation: TypeNode): readonly { readonly origin: ReferenceFact<TypeIdentityOrigin>; readonly type: Type }[] {
  const candidates: { readonly origin: ReferenceFact<TypeIdentityOrigin>; readonly type: Type }[] = [];
  const pending: { readonly node: TypeNode; readonly scopes: readonly ReadonlySet<object>[]; readonly aliases: ReadonlySet<object> }[] = [
    { node: annotation, scopes: [], aliases: new Set<object>() },
  ];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const scopes = candidateScopes(next.node, next.scopes);
    pending.push(...annotationChildren(next.node).map((node) => ({ node, scopes, aliases: next.aliases })));
    if (!Node.isTypeReference(next.node)) {
      continue;
    }
    const name = next.node.getTypeName();
    const origin = annotationReferenceOrigin(Node.isQualifiedName(name) ? name.getRight() : name);
    const type = next.node.getType();
    if (next.scopes.every((scope) => scope.has(type.compilerType))) {
      candidates.push({ origin, type });
    }
    if (origin.kind === "unresolved") {
      continue;
    }
    // Eligibility depends on the path: visiting an erased argument must not consume the same alias's
    // later value path. A path-local declaration set terminates cycles without conflating those reads.
    const aliases = new Set(next.aliases);
    for (const body of annotationAliasBodies(origin.value, aliases)) {
      if (body.kind === "resolved") {
        pending.push({ node: body.value, scopes, aliases });
      } else {
        candidates.push({ origin: body, type });
      }
    }
  }
  return candidates;
}

function eligibleTypeOrigin(
  origin: ReferenceFact<TypeIdentityOrigin>,
  type: Type,
  valueTypes: ReadonlySet<object>,
  unreadableDetail: string | undefined,
): ReferenceFact<TypeIdentityOrigin> | undefined {
  const eligible = valueTypes.has(type.compilerType);
  let fact: ReferenceFact<TypeIdentityOrigin> | undefined;
  if (origin.kind === "unresolved") {
    fact = eligible || unreadableDetail !== undefined ? origin : undefined;
  } else if (eligible && !opaqueType(type) && !type.isNever()) {
    fact = origin;
  } else if (unreadableDetail !== undefined) {
    fact = unprovenTypeIdentity(origin.value, "unsupported", unreadableDetail);
  }
  return fact;
}

function resolvedValueTypeOrigins(type: Type, annotation: TypeNode): readonly ReferenceFact<TypeIdentityOrigin>[] {
  if (opaqueType(type) || type.isNever()) {
    return [];
  }
  const alias = type.getAliasSymbol();
  return [alias, type.getSymbol()].flatMap((symbol) => {
    if (symbol === undefined) {
      return [];
    }
    const declarations = symbolDeclarations(symbol, annotation, `value type ${symbol.getName()}`);
    return [
      declarations.kind === "unresolved"
        ? declarations
        : resolved({ name: symbol.getName(), node: annotation, aliased: symbol === alias, declarations: declarations.value }, annotation, declarations.value),
    ];
  });
}

function appendTypeOrigin(facts: ReferenceFact<TypeIdentityOrigin>[], fact: ReferenceFact<TypeIdentityOrigin>): void {
  const duplicate = facts.some((existing) => {
    if (fact.kind === "unresolved") {
      return existing.kind === "unresolved" && existing.node.compilerNode === fact.node.compilerNode && existing.reason === fact.reason;
    }
    return (
      existing.kind === "resolved" &&
      existing.value.name === fact.value.name &&
      existing.value.declarations.length === fact.value.declarations.length &&
      existing.value.declarations.every((declaration) => fact.value.declarations.some((candidate) => candidate.compilerNode === declaration.compilerNode))
    );
  });
  if (!duplicate) {
    facts.push(fact);
  }
}

/** Declaration identities carried by an authored value type, with explicit unresolved candidates.
 *
 *  The checker owns data containment: unions/intersections, tuple/array/index elements and named property
 *  types, uniformly for ordinary objects and mappings. Written references and alias bodies retain a name
 *  only when their resolved compilerType occurs in that graph. This keeps a simplified ExemptionTable alias
 *  without treating keyof Table or an erased Phantom<Table> argument as a table value. Resolved symbols cover actual generic/indexed outputs without
 *  interpreting generics or maintaining a utility-name roster. Declaration sets remain complete.
 *
 *  An any/unknown/type-parameter value position cannot establish an authored candidate's identity. A
 *  projection may retain an interface's member provenance without its value identity. Both return
 *  unresolved facts whose trace retains that candidate's declarations; foreign provenance stays foreign.
 *  Cyclic alias syntax terminates by declaration identity, and an opaque cyclic result is a refusal, never
 *  a positive inferred from a sibling's spelling. Changed recursive instantiation through an active data
 *  definition stops that expanding edge; only canonical evidence on the finite data prefix can resolve or
 *  refuse, so an erased supplied argument stays syntax-only. A compilerType visited set alone cannot terminate that graph.
 *  Primitive results are proven non-candidates. This is not a whole-TypeScript validity check or a structural assignability test. All caches are invocation-local. */
export function resolveTypeValueOrigins(annotation: TypeNode): readonly ReferenceFact<TypeIdentityOrigin>[] {
  const graph = annotationValueGraph(annotation);
  const valueTypes = new Set(graph.types.map((type) => type.compilerType));
  let unreadableDetail: string | undefined;
  if (graph.recursiveTypes.size > 0) {
    unreadableDetail = "a recursively transported data candidate does not have a finite resolved containment graph";
  } else if (graph.types.some(opaqueType)) {
    unreadableDetail = "an opaque value type does not establish this authored candidate's identity";
  }
  const facts: ReferenceFact<TypeIdentityOrigin>[] = [];
  // Property declarations retain opaque authored candidates erased from the effective property type.
  // Each candidate still passes its own transformation scopes and the complete received data graph.
  for (const { origin, type } of [annotation, ...graph.annotations].flatMap(annotationCandidates)) {
    const fact = eligibleTypeOrigin(origin, type, valueTypes, unreadableDetail);
    if (fact !== undefined) {
      appendTypeOrigin(facts, fact);
    }
  }
  for (const type of graph.types) {
    for (const origin of resolvedValueTypeOrigins(type, annotation)) {
      appendTypeOrigin(facts, origin);
    }
  }
  for (const projection of graph.projections) {
    appendTypeOrigin(facts, projection);
  }
  return facts;
}

function normalizedPath(node: MorphNode): string {
  return node.getSourceFile().getFilePath().replaceAll("\\", "/");
}

/** Is EVERY declaration in this fact declared by the named npm package's own type surface? The fragment is
 *  the package's `node_modules` directory, which survives version bumps, pnpm's virtual store, and the
 *  package's internal `dist/`/`build/` layout — the three things a pinned file path does not. */
export function declaredByPackage(declarations: readonly MorphNode[], packageName: string): boolean {
  const home = `/node_modules/${packageName}/`;
  return declarations.length > 0 && declarations.every((declaration) => normalizedPath(declaration).includes(home));
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
