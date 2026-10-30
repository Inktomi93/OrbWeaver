// The one matcher for a port member that hand-restates the member flowing into it. The lint rule
// `orb/derived-port-member` and the `pnpm unwired ports` census both call `restatementsAt`, so they agree.
// A hop the checker accepts structurally leaves no symbol link, which is why reference searches lose it.
import ts from "typescript";
import type { ForeignTypes } from "./foreign-types.ts";
import { foreignTypes, isSplitSignature } from "./foreign-types.ts";

/** Server tiers in import order: a member may derive only from a tier at or before its own. */
const SERVER_TIERS = ["primitives", "foundation", "infra", "domain", "transport", "entry"] as const;
type ServerTier = (typeof SERVER_TIERS)[number];
// The workspace packages below the server, in the order their package.json dependencies allow.
const PACKAGE_RANK: Readonly<Record<string, number>> = { kit: 0, contracts: 1, db: 2, inference: 2 };
const SERVER_BASE_RANK = 3;
const MAX_INDEXED_HOPS = 8;

const SOURCE_PATH = /\/packages\/([^/]+)\/src\/(.+)$/u;
const SERVER_PATH = /^([^/]+)\/(?:([^/]+)\/)?/u;

/** Where a declaration lives: its package, its server tier and its domain, when it has them. */
export interface Placement {
  readonly pkg: string;
  readonly tier: ServerTier | null;
  readonly domain: string | null;
}

export function placementOf(fileName: string): Placement | null {
  const source = SOURCE_PATH.exec(fileName.replaceAll("\\", "/"));
  if (source === null || fileName.includes("/node_modules/")) {
    return null;
  }
  const [, pkg = "", rest = ""] = source;
  if (pkg !== "server") {
    return { pkg, tier: null, domain: null };
  }
  const [, top = "", area] = SERVER_PATH.exec(rest) ?? [];
  const tier = SERVER_TIERS.find((name) => name === top) ?? null;
  return { pkg, tier, domain: tier === "domain" ? (area ?? null) : null };
}

/** A rank for "lower tier": kit, contracts, db and inference, then the server tiers in order. Other packages
 *  (client, ui) rank with kit's consumers and never derive across each other. */
export function tierRank(placement: Placement): number {
  if (placement.tier !== null) {
    return SERVER_BASE_RANK + SERVER_TIERS.indexOf(placement.tier);
  }
  return PACKAGE_RANK[placement.pkg] ?? SERVER_BASE_RANK + SERVER_TIERS.length;
}

export type PortMember = ts.PropertySignature | ts.MethodSignature;

function isPortMember(node: ts.Node | undefined): node is PortMember {
  return (
    node !== undefined &&
    (ts.isPropertySignature(node) || ts.isMethodSignature(node)) &&
    (ts.isInterfaceDeclaration(node.parent) || ts.isTypeLiteralNode(node.parent)) &&
    placementOf(node.getSourceFile().fileName) !== null
  );
}

function functionTypeNode(member: PortMember): ts.FunctionTypeNode | ts.MethodSignature | null {
  if (ts.isMethodSignature(member)) {
    return member;
  }
  let type = member.type;
  while (type !== undefined && ts.isParenthesizedTypeNode(type)) {
    type = type.type;
  }
  if (type !== undefined && ts.isUnionTypeNode(type)) {
    const present = type.types.filter(
      (part) => part.kind !== ts.SyntaxKind.UndefinedKeyword && !(ts.isLiteralTypeNode(part) && part.literal.kind === ts.SyntaxKind.NullKeyword),
    );
    type = present.length === 1 ? present[0] : undefined;
  }
  while (type !== undefined && ts.isParenthesizedTypeNode(type)) {
    type = type.type;
  }
  return type !== undefined && ts.isFunctionTypeNode(type) ? type : null;
}

/** A member whose function type is spelled out by hand: a method signature or a function-type property. */
export function isHandTyped(member: PortMember): boolean {
  return functionTypeNode(member) !== null;
}

/** `() => void`: a notification with no concept behind its shape, so two of them share nothing to derive. */
export function isConceptFreeCallback(member: PortMember): boolean {
  const fn = functionTypeNode(member);
  return fn !== null && fn.parameters.length === 0 && fn.type?.kind === ts.SyntaxKind.VoidKeyword;
}

// The non-generic type alias a reference names, through an import alias.
function aliasDeclarationOf(checker: ts.TypeChecker, reference: ts.TypeReferenceNode): ts.TypeAliasDeclaration | null {
  const symbol = checker.getSymbolAtLocation(reference.typeName);
  // biome-ignore lint/suspicious/noBitwiseOperators: SymbolFlags is a compiler-owned bitfield.
  const target = symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
  const declaration = target?.declarations?.[0];
  return declaration !== undefined && ts.isTypeAliasDeclaration(declaration) && declaration.typeParameters === undefined ? declaration : null;
}

const isNonNullable = (node: ts.TypeReferenceNode): boolean => ts.isIdentifier(node.typeName) && node.typeName.text === "NonNullable";

// The type node a derived form stands for: parentheses, `NonNullable<T>` and a non-generic alias of either are seen
// through, so `ApplyRegexReplaceOp = NonNullable<RegexExecuteOptions["applyReplace"]>` reads as the indexed access.
function derivedForm(checker: ts.TypeChecker, node: ts.TypeNode | undefined): ts.TypeNode | undefined {
  let current = node;
  for (let hop = 0; hop < MAX_INDEXED_HOPS && current !== undefined; hop++) {
    if (ts.isParenthesizedTypeNode(current)) {
      current = current.type;
    } else if (ts.isTypeReferenceNode(current) && isNonNullable(current) && current.typeArguments?.length === 1) {
      current = current.typeArguments[0];
    } else if (ts.isTypeReferenceNode(current) && current.typeArguments === undefined && aliasDeclarationOf(checker, current) !== null) {
      current = aliasDeclarationOf(checker, current)?.type;
    } else {
      return current;
    }
  }
  return current;
}

// The member an `Owner["m"]` (or `Owner["a"]["b"]`) node names, or null.
function indexedMember(checker: ts.TypeChecker, node: ts.IndexedAccessTypeNode): PortMember | null {
  if (!(ts.isLiteralTypeNode(node.indexType) && ts.isStringLiteral(node.indexType.literal))) {
    return null;
  }
  const target = checker.getPropertyOfType(checker.getTypeFromTypeNode(node.objectType), node.indexType.literal.text)?.declarations?.[0];
  return isPortMember(target) ? target : null;
}

/** Follow `Owner["m"]`, `NonNullable<Owner["m"]>` and a local alias of either to the member it names, so a derived
 *  member counts as its owner. Pick and other homomorphic mapped members already carry the original declaration. */
export function effectiveMember(checker: ts.TypeChecker, member: PortMember): PortMember {
  let current = member;
  for (let hop = 0; hop < MAX_INDEXED_HOPS; hop++) {
    const type = derivedForm(checker, ts.isPropertySignature(current) ? current.type : undefined);
    const target = type !== undefined && ts.isIndexedAccessTypeNode(type) ? indexedMember(checker, type) : null;
    if (target === null) {
      return current;
    }
    current = target;
  }
  return current;
}

/** The non-generic type alias a member is typed by (`readonly op: ResolveUtilityPresetParams`), through
 *  parentheses and `NonNullable`; null for a hand-typed member or a derived form. */
export function aliasOf(checker: ts.TypeChecker, member: PortMember): ts.TypeAliasDeclaration | null {
  let type = ts.isPropertySignature(member) ? member.type : undefined;
  while (
    type !== undefined &&
    (ts.isParenthesizedTypeNode(type) || (ts.isTypeReferenceNode(type) && isNonNullable(type) && type.typeArguments?.length === 1))
  ) {
    type = ts.isParenthesizedTypeNode(type) ? type.type : type.typeArguments?.[0];
  }
  const alias = type !== undefined && ts.isTypeReferenceNode(type) && type.typeArguments === undefined ? aliasDeclarationOf(checker, type) : null;
  return alias !== null && derivedForm(checker, alias.type)?.kind === ts.SyntaxKind.FunctionType ? alias : null;
}

/** Every member `node`'s type derives from: each `Owner["m"]` inside it, in `Parameters<…>`, `ReturnType<…>`,
 *  `Awaited<…>` and `Pick<…>` alike, and inside the non-generic aliases it names. */
export function derivedMembers(checker: ts.TypeChecker, node: ts.Node): ReadonlySet<PortMember> {
  const found = new Set<PortMember>();
  const followed = new Set<ts.Node>();
  const visit = (child: ts.Node): void => {
    if (ts.isIndexedAccessTypeNode(child)) {
      const target = indexedMember(checker, child);
      if (target !== null) {
        found.add(target);
        found.add(effectiveMember(checker, target));
      }
    }
    const alias = ts.isTypeReferenceNode(child) ? aliasDeclarationOf(checker, child) : null;
    if (alias !== null && !followed.has(alias)) {
      followed.add(alias);
      visit(alias.type);
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

/** `identical`: each type fits the other. `params`: the parameters are identical and only the return narrows.
 *  `narrowed`: the owner's type fits the port's and the parameters differ too. */
export const RELATION = { identical: "identical", params: "params", narrowed: "narrowed" } as const;
export type Relation = (typeof RELATION)[keyof typeof RELATION];

/** One hand-typed member restating another member's function type at a flow site. */
export interface Restatement {
  /** The node where the value flows into the slot. */
  readonly site: ts.Node;
  /** The member to rewrite: the hand-typed one in the higher tier, the slot side on a tie. */
  readonly restating: PortMember;
  /** The member it should derive from. */
  readonly owner: PortMember;
  /** See {@link RELATION}. */
  readonly relation: Relation;
  /** Both sit in server domains, and different ones: no domain imports another, so the shape moves to contracts. */
  readonly crossDomain: boolean;
  /** For a cross-domain pair, the types in the restating signature packages/contracts cannot hold; else null. */
  readonly foreign: ForeignTypes | null;
  /** The member the value comes from, whichever of the two is restating: the implemented side of the hop. */
  readonly source: PortMember;
}

const nonNullable = (checker: ts.TypeChecker, type: ts.Type): ts.Type => checker.getNonNullableType(type);

// An async function's contextual return is `T | PromiseLike<T>`; the thenable arm is never a port.
function slotObjectType(checker: ts.TypeChecker, type: ts.Type): ts.Type | null {
  const parts = ((): readonly ts.Type[] => {
    const bare = nonNullable(checker, type);
    return bare.isUnion() ? bare.types : [bare];
  })().filter((part) => checker.getPropertyOfType(part, "then") === undefined);
  return parts.length === 1 ? (parts[0] ?? null) : null;
}

// How deep an exact-shape comparison recurses: a port's parameter object, its fields, and one level below.
const SHAPE_DEPTH = 4;

const isOptionalParameter = (parameter: ts.Symbol): boolean => {
  const declaration = parameter.valueDeclaration;
  return declaration !== undefined && ts.isParameter(declaration) && (declaration.questionToken !== undefined || declaration.initializer !== undefined);
};

const isRestParameter = (parameter: ts.Symbol): boolean => {
  const declaration = parameter.valueDeclaration;
  return declaration !== undefined && ts.isParameter(declaration) && declaration.dotDotDotToken !== undefined;
};

const partsOf = (type: ts.Type): readonly ts.Type[] => (type.isUnion() ? type.types : [type]);

const referenceTarget = (type: ts.Type): ts.Type | null =>
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeFlags and ObjectFlags are compiler-owned bitfields.
  (type.flags & ts.TypeFlags.Object) !== 0 && ((type as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference) !== 0 ? (type as ts.TypeReference).target : null;

/** Mutual assignability lets a port add an optional parameter or an optional field its owner lacks
 *  (`opts?: { signal?: AbortSignal }` against `opts?: {}`); deriving would drop it. Two types have the same shape
 *  when they are mutually assignable and every signature, parameter, union arm and field matches too. */
function sameShape(checker: ts.TypeChecker, a: ts.Type, b: ts.Type, depth: number): boolean {
  if (a === b) {
    return true;
  }
  if (!(checker.isTypeAssignableTo(a, b) && checker.isTypeAssignableTo(b, a))) {
    return false;
  }
  if (depth === 0) {
    return true;
  }
  const [aParts, bParts] = [partsOf(a), partsOf(b)];
  if (aParts.length > 1 || bParts.length > 1) {
    return aParts.length === bParts.length && aParts.every((part) => bParts.some((other) => sameShape(checker, part, other, depth - 1)));
  }
  const target = referenceTarget(a);
  if (target !== null && target === referenceTarget(b)) {
    const [aArgs, bArgs] = [checker.getTypeArguments(a as ts.TypeReference), checker.getTypeArguments(b as ts.TypeReference)];
    return aArgs.length === bArgs.length && aArgs.every((arg, index) => bArgs[index] !== undefined && sameShape(checker, arg, bArgs[index], depth - 1));
  }
  const [aSignatures, bSignatures] = [a.getCallSignatures(), b.getCallSignatures()];
  if (aSignatures.length !== bSignatures.length) {
    return false;
  }
  if (aSignatures.length > 0) {
    return aSignatures.every((signature, index) => {
      const other = bSignatures[index];
      return (
        other !== undefined &&
        sameParameterList(checker, signature, other, depth - 1) &&
        sameShape(checker, signature.getReturnType(), other.getReturnType(), depth - 1)
      );
    });
  }
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeFlags is a compiler-owned bitfield.
  if ((a.flags & ts.TypeFlags.Object) === 0) {
    return true;
  }
  const aProperties = checker.getPropertiesOfType(a);
  const bProperties = checker.getPropertiesOfType(b);
  return (
    aProperties.length === bProperties.length &&
    aProperties.every((property) => {
      const other = bProperties.find((candidate) => candidate.name === property.name);
      // biome-ignore lint/suspicious/noBitwiseOperators: SymbolFlags is a compiler-owned bitfield.
      const optional = (symbol: ts.Symbol): boolean => (symbol.flags & ts.SymbolFlags.Optional) !== 0;
      return (
        other !== undefined &&
        optional(property) === optional(other) &&
        sameShape(checker, checker.getTypeOfSymbol(property), checker.getTypeOfSymbol(other), depth - 1)
      );
    })
  );
}

function sameParameterList(checker: ts.TypeChecker, mine: ts.Signature, theirs: ts.Signature, depth: number): boolean {
  if (mine.parameters.length !== theirs.parameters.length) {
    return false;
  }
  return mine.parameters.every((parameter, index) => {
    const other = theirs.parameters[index];
    return (
      other !== undefined &&
      isOptionalParameter(parameter) === isOptionalParameter(other) &&
      isRestParameter(parameter) === isRestParameter(other) &&
      sameShape(checker, checker.getTypeOfSymbol(parameter), checker.getTypeOfSymbol(other), depth)
    );
  });
}

function sameParameters(checker: ts.TypeChecker, port: ts.Type, owner: ts.Type): boolean {
  const [mine, ...more] = port.getCallSignatures();
  const [theirs, ...others] = owner.getCallSignatures();
  // An empty parameter list copies nothing, so a narrowed `() => R` is its own op.
  return (
    mine !== undefined &&
    theirs !== undefined &&
    more.length + others.length === 0 &&
    mine.parameters.length > 0 &&
    sameParameterList(checker, mine, theirs, SHAPE_DEPTH - 1)
  );
}

function relationOf(checker: ts.TypeChecker, port: ts.Type, owner: ts.Type): Relation | null {
  const ownerFits = checker.isTypeAssignableTo(owner, port);
  if (!ownerFits) {
    return null;
  }
  if (sameShape(checker, port, owner, SHAPE_DEPTH)) {
    return RELATION.identical;
  }
  return sameParameters(checker, port, owner) ? RELATION.params : RELATION.narrowed;
}

// A `{ op } = deps` binding is the member it destructures, so a destructured op still links to its owner.
function memberDeclarationOf(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Declaration | undefined {
  const declaration = symbol.declarations?.[0];
  if (
    declaration === undefined ||
    !ts.isBindingElement(declaration) ||
    !ts.isObjectBindingPattern(declaration.parent) ||
    declaration.dotDotDotToken !== undefined
  ) {
    return declaration;
  }
  const name = (declaration.propertyName ?? declaration.name).getText();
  return checker.getPropertyOfType(checker.getTypeAtLocation(declaration.parent), name)?.declarations?.[0];
}

/** The alias a member is typed by, through `type B = A` renames to A, so a rename is one home. */
export function rootAlias(checker: ts.TypeChecker, member: PortMember): ts.TypeAliasDeclaration | null {
  let alias = aliasOf(checker, member);
  for (let hop = 0; hop < MAX_INDEXED_HOPS && alias !== null; hop++) {
    const next = ts.isTypeReferenceNode(alias.type) && alias.type.typeArguments === undefined ? aliasDeclarationOf(checker, alias.type) : null;
    if (next === null) {
      return alias;
    }
    alias = next;
  }
  return alias;
}

/** The file that owns a member's shape: the alias it is typed by, else its own file. */
export function homeFileOf(checker: ts.TypeChecker, member: PortMember): string {
  return (aliasOf(checker, member) ?? member).getSourceFile().fileName;
}

const rankOfFile = (fileName: string): number => {
  const placement = placementOf(fileName);
  return placement === null ? Number.MAX_SAFE_INTEGER : tierRank(placement);
};

// Two aliases of one shape are two homes for one concept; a member typed by one alias is already named.
function isAliasPair(checker: ts.TypeChecker, port: PortMember, owner: PortMember): boolean {
  const portAlias = isHandTyped(port) ? null : rootAlias(checker, port);
  const ownerAlias = isHandTyped(owner) ? null : rootAlias(checker, owner);
  return portAlias !== null && ownerAlias !== null && portAlias !== ownerAlias;
}

// Does the slot side restate? The hand-typed side restates a named one; else the higher tier; a tie goes to the
// contract file as the home, since a hook or a service beside it restates the contract.
function slotRestates(checker: ts.TypeChecker, port: PortMember, owner: PortMember, aliasPair: boolean): boolean {
  if (!(aliasPair || isHandTyped(owner))) {
    return true;
  }
  if (!(aliasPair || isHandTyped(port))) {
    return false;
  }
  const [portFile, ownerFile] = [homeFileOf(checker, port), homeFileOf(checker, owner)];
  if (rankOfFile(ownerFile) !== rankOfFile(portFile)) {
    return rankOfFile(ownerFile) <= rankOfFile(portFile);
  }
  return !(isContractFile(portFile) && !isContractFile(ownerFile));
}

interface Candidate {
  readonly port: PortMember;
  readonly owner: PortMember;
  readonly aliasPair: boolean;
}

/** The two members a flow joins, each seen through its derived forms; null when one already derives from the other. */
export function flowMembers(checker: ts.TypeChecker, { slot, value }: Pick<Flow, "slot" | "value">): Candidate | null {
  const slotMember = slot.declarations?.[0];
  const valueMember = memberDeclarationOf(checker, value);
  if (!(isPortMember(slotMember) && isPortMember(valueMember))) {
    return null;
  }
  const port = effectiveMember(checker, slotMember);
  const owner = effectiveMember(checker, valueMember);
  if (port === owner || derivedMembers(checker, port).has(owner) || derivedMembers(checker, owner).has(port)) {
    return null;
  }
  return { port, owner, aliasPair: isAliasPair(checker, port, owner) };
}

// The cross-domain foreign types of a restating member, or null when both sides share a domain or neither has one.
function crossDomainForeign(checker: ts.TypeChecker, restating: PortMember, home: PortMember): ForeignTypes | null {
  const fromDomain = placementOf(homeFileOf(checker, restating))?.domain ?? null;
  const toDomain = placementOf(homeFileOf(checker, home))?.domain ?? null;
  return fromDomain !== null && toDomain !== null && fromDomain !== toDomain ? foreignTypes(checker, restating) : null;
}

/** The restatement a member flow carries, or null. */
export function restatementOf(checker: ts.TypeChecker, flow: Flow): Restatement | null {
  const { site, slot, value } = flow;
  const candidate = flowMembers(checker, flow);
  if (candidate === null) {
    return null;
  }
  const { port, owner, aliasPair } = candidate;
  if (!(isHandTyped(port) || isHandTyped(owner) || aliasPair)) {
    return null;
  }
  const slotType = nonNullable(checker, checker.getTypeOfSymbolAtLocation(slot, site));
  const valueType = nonNullable(checker, checker.getTypeOfSymbolAtLocation(value, site));
  const fromSlot = slotRestates(checker, port, owner, aliasPair);
  const [restating, home] = fromSlot ? [port, owner] : [owner, port];
  // Judged in the rewrite's direction: the home's whole member type must fit where the restating one stands.
  const relation = fromSlot ? relationOf(checker, slotType, valueType) : relationOf(checker, valueType, slotType);
  // A narrowing is judged against the member's owner, the value it is built from. A member that is only passed into a
  // wider slot (`points: () => deps.resolveLoginLimit()`) is its own op, not a restatement of that slot.
  if (relation === null || (relation !== RELATION.identical && !fromSlot)) {
    return null;
  }
  if (isConceptFreeCallback(restating)) {
    return null;
  }
  const foreign = crossDomainForeign(checker, restating, home);
  // A split signature (contracts data plus runtime types) is the consumer's own contract, not a restated concept.
  if (foreign !== null && isSplitSignature(foreign)) {
    return null;
  }
  return { site, restating, owner: home, relation, crossDomain: foreign !== null, foreign, source: owner };
}

const CONTRACT_FILE = /\/packages\/(?:contracts|kit)\/|\/contract\/|[/.-]contract\.ts$/u;

/** A contract file is a shape's home: a domain's `contract/`, a `*-contract.ts`, contracts or kit. */
export const isContractFile = (fileName: string): boolean => CONTRACT_FILE.test(fileName.replaceAll("\\", "/"));

/** A value flowing into a member slot: a property assignment, a forward, or one member of a whole object. */
export interface Flow {
  readonly site: ts.Node;
  readonly slot: ts.Symbol;
  readonly value: ts.Symbol;
}

/** A whole value flowing into a slot of a named type: a typed variable, a return, an argument, a property. */
export interface TypeFlow {
  readonly slot: ts.Type;
  readonly value: ts.Type;
}

interface Flows {
  readonly members: readonly Flow[];
  readonly types: readonly TypeFlow[];
}

const NO_FLOWS: Flows = { members: [], types: [] };

// Whole-object flow: every member of the slot's type against the same-named member of the value.
function objectFlow(checker: ts.TypeChecker, site: ts.Node, slotType: ts.Type | undefined, value: ts.Expression): Flows {
  const slot = slotType === undefined ? null : slotObjectType(checker, slotType);
  const valueType = nonNullable(checker, checker.getTypeAtLocation(value));
  if (slot === null || valueType.isUnion()) {
    return NO_FLOWS;
  }
  const members = checker.getPropertiesOfType(slot).flatMap((member): Flow[] => {
    const source = checker.getPropertyOfType(valueType, member.name);
    return source === undefined ? [] : [{ site, slot: member, value: source }];
  });
  return { members, types: [{ slot, value: valueType }] };
}

function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isParenthesizedExpression(current) || ts.isAwaitExpression(current) || ts.isNonNullExpression(current)) {
    current = current.expression;
  }
  return current;
}

function memberSymbolOf(checker: ts.TypeChecker, expression: ts.Expression): ts.Symbol | undefined {
  const bare = unwrap(expression);
  return ts.isPropertyAccessExpression(bare) || ts.isIdentifier(bare) ? checker.getSymbolAtLocation(bare) : undefined;
}

// `owner.m`, or `(a, b) => owner.m(a, b)` passing its parameters through unchanged and in order.
function forwardedMember(checker: ts.TypeChecker, value: ts.Expression): ts.Symbol | undefined {
  if (!(ts.isArrowFunction(value) || ts.isFunctionExpression(value))) {
    return memberSymbolOf(checker, value);
  }
  let body: ts.Node = value.body;
  if (ts.isBlock(body)) {
    const [only] = body.statements;
    if (body.statements.length !== 1 || only === undefined || !ts.isReturnStatement(only) || only.expression === undefined) {
      return undefined;
    }
    body = only.expression;
  }
  const call = unwrap(body as ts.Expression);
  if (!ts.isCallExpression(call) || call.arguments.length !== value.parameters.length) {
    return undefined;
  }
  const passesThrough = value.parameters.every((parameter, index) => {
    const argument = call.arguments[index];
    return ts.isIdentifier(parameter.name) && argument !== undefined && ts.isIdentifier(argument) && argument.text === parameter.name.text;
  });
  return passesThrough ? memberSymbolOf(checker, call.expression) : undefined;
}

// An adapter lambda (`async (id) => { const n = await deps.m(id); evict(id); return n; }`) that calls exactly one
// member of its own name: the member it wraps, judged like a forward so an identical signature still counts.
function wrappedMember(checker: ts.TypeChecker, value: ts.Expression, name: string): ts.Symbol | undefined {
  if (!(ts.isArrowFunction(value) || ts.isFunctionExpression(value))) {
    return undefined;
  }
  const called = new Set<ts.Symbol>();
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === name) {
      const symbol = checker.getSymbolAtLocation(node.expression);
      if (symbol !== undefined) {
        called.add(symbol);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(value.body);
  return called.size === 1 ? [...called][0] : undefined;
}

function propertyOf(checker: ts.TypeChecker, type: ts.Type, name: string): ts.Symbol | undefined {
  const parts = ((): readonly ts.Type[] => {
    const bare = nonNullable(checker, type);
    return bare.isUnion() ? bare.types : [bare];
  })();
  const found = new Set(parts.map((part) => checker.getPropertyOfType(part, name)).filter((symbol) => symbol !== undefined));
  return found.size === 1 ? [...found][0] : undefined;
}

function propertyFlow(checker: ts.TypeChecker, property: ts.PropertyAssignment | ts.ShorthandPropertyAssignment): Flows {
  const contextual = checker.getContextualType(property.parent);
  const name = property.name.getText();
  const slot = contextual === undefined ? undefined : propertyOf(checker, contextual, name);
  if (slot === undefined) {
    return NO_FLOWS;
  }
  const value = ts.isPropertyAssignment(property) ? property.initializer : property.name;
  const found = objectFlow(checker, property, checker.getTypeOfSymbolAtLocation(slot, property), value);
  const source = ts.isPropertyAssignment(property)
    ? (forwardedMember(checker, property.initializer) ?? wrappedMember(checker, property.initializer, name))
    : checker.getShorthandAssignmentValueSymbol(property);
  return source === undefined ? found : { members: [...found.members, { site: property, slot, value: source }], types: found.types };
}

const isCallback = (node: ts.Node): boolean => ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isObjectLiteralExpression(node);

/** Every flow whose site is `node`. Object literals are met property by property, so a variable, return or argument
 *  that is itself a literal is skipped here and met through its properties. */
export function flowsAt(checker: ts.TypeChecker, node: ts.Node): Flows {
  if (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) {
    return propertyFlow(checker, node);
  }
  if (ts.isVariableDeclaration(node) && node.type !== undefined && node.initializer !== undefined && !isCallback(node.initializer)) {
    return objectFlow(checker, node, checker.getTypeFromTypeNode(node.type), node.initializer);
  }
  if (ts.isReturnStatement(node) && node.expression !== undefined && !isCallback(node.expression)) {
    return objectFlow(checker, node, checker.getContextualType(node.expression), node.expression);
  }
  if ((ts.isCallExpression(node) || ts.isNewExpression(node)) && node.arguments !== undefined) {
    const each = node.arguments
      .filter((argument) => !isCallback(argument))
      .map((argument) => objectFlow(checker, argument, checker.getContextualType(argument), argument));
    return { members: each.flatMap((flows) => flows.members), types: each.flatMap((flows) => flows.types) };
  }
  return NO_FLOWS;
}

/** Every restatement among the member flows of `node`. */
export function restatementsAt(checker: ts.TypeChecker, node: ts.Node): readonly Restatement[] {
  return flowsAt(checker, node).members.flatMap((flow) => restatementOf(checker, flow) ?? []);
}

/** `Interface.member` for a message or a report row; a member of a nested type literal names its enclosing declaration. */
export function memberLabel(member: PortMember): string {
  let home: ts.Node = member.parent;
  while (!(ts.isSourceFile(home) || ts.isInterfaceDeclaration(home) || ts.isTypeAliasDeclaration(home))) {
    home = home.parent;
  }
  const name = ts.isSourceFile(home) ? "(inline)" : home.name.text;
  const nested = ts.isTypeLiteralNode(member.parent) && !(ts.isTypeAliasDeclaration(home) && home.type === member.parent);
  return `${name}${nested ? "{…}" : ""}.${member.name.getText()}`;
}
