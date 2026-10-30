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

/** Follow `Owner["m"]` to the member it names, so a derived member counts as its owner. Pick and other
 *  homomorphic mapped members already carry the original declaration. */
export function effectiveMember(checker: ts.TypeChecker, member: PortMember): PortMember {
  let current = member;
  for (let hop = 0; hop < MAX_INDEXED_HOPS; hop++) {
    const type = ts.isPropertySignature(current) ? current.type : undefined;
    if (type === undefined || !ts.isIndexedAccessTypeNode(type) || !ts.isLiteralTypeNode(type.indexType) || !ts.isStringLiteral(type.indexType.literal)) {
      return current;
    }
    const target = checker.getPropertyOfType(checker.getTypeFromTypeNode(type.objectType), type.indexType.literal.text)?.declarations?.[0];
    if (!isPortMember(target)) {
      return current;
    }
    current = target;
  }
  return current;
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

function sameParameters(checker: ts.TypeChecker, port: ts.Type, owner: ts.Type): boolean {
  const [mine, ...more] = port.getCallSignatures();
  const [theirs, ...others] = owner.getCallSignatures();
  if (mine === undefined || theirs === undefined || more.length + others.length > 0 || mine.parameters.length !== theirs.parameters.length) {
    return false;
  }
  return mine.parameters.every((parameter, index) => {
    const other = theirs.parameters[index];
    if (other === undefined) {
      return false;
    }
    const a = checker.getTypeOfSymbol(parameter);
    const b = checker.getTypeOfSymbol(other);
    return checker.isTypeAssignableTo(a, b) && checker.isTypeAssignableTo(b, a);
  });
}

function relationOf(checker: ts.TypeChecker, port: ts.Type, owner: ts.Type): Relation | null {
  const ownerFits = checker.isTypeAssignableTo(owner, port);
  if (!ownerFits) {
    return null;
  }
  if (checker.isTypeAssignableTo(port, owner)) {
    return RELATION.identical;
  }
  return sameParameters(checker, port, owner) ? RELATION.params : RELATION.narrowed;
}

function judge(checker: ts.TypeChecker, site: ts.Node, slot: ts.Symbol, value: ts.Symbol): Restatement | null {
  const slotMember = slot.declarations?.[0];
  const valueMember = value.declarations?.[0];
  if (!(isPortMember(slotMember) && isPortMember(valueMember))) {
    return null;
  }
  const port = effectiveMember(checker, slotMember);
  const owner = effectiveMember(checker, valueMember);
  if (port === owner || !(isHandTyped(port) || isHandTyped(owner))) {
    return null;
  }
  const slotType = nonNullable(checker, checker.getTypeOfSymbolAtLocation(slot, site));
  const valueType = nonNullable(checker, checker.getTypeOfSymbolAtLocation(value, site));
  const [restating, home, restatingType, homeType, slotRestates] = ((): readonly [PortMember, PortMember, ts.Type, ts.Type, boolean] => {
    const asPort = [port, owner, slotType, valueType, true] as const;
    const asOwner = [owner, port, valueType, slotType, false] as const;
    if (!isHandTyped(owner)) {
      return asPort;
    }
    if (!isHandTyped(port)) {
      return asOwner;
    }
    if (rankOf(owner) !== rankOf(port)) {
      return rankOf(owner) > rankOf(port) ? asOwner : asPort;
    }
    // A tie goes to the contract file as the home: a hook or a service beside it restates the contract.
    return isContractFile(port.getSourceFile().fileName) && !isContractFile(owner.getSourceFile().fileName) ? asOwner : asPort;
  })();
  // Judged in the rewrite's direction: the home's whole member type must fit where the restating one stands.
  const relation = relationOf(checker, restatingType, homeType);
  // A narrowing is judged against the member's owner, the value it is built from. A member that is only passed into a
  // wider slot (`points: () => deps.resolveLoginLimit()`) is its own op, not a restatement of that slot.
  if (relation === null || (relation !== RELATION.identical && !slotRestates)) {
    return null;
  }
  if (isConceptFreeCallback(restating)) {
    return null;
  }
  const from = placementOf(restating.getSourceFile().fileName);
  const to = placementOf(home.getSourceFile().fileName);
  const fromDomain = from?.domain ?? null;
  const toDomain = to?.domain ?? null;
  const crossDomain = fromDomain !== null && toDomain !== null && fromDomain !== toDomain;
  const foreign = crossDomain ? foreignTypes(checker, restating) : null;
  // A split signature (contracts data plus runtime types) is the consumer's own contract, not a restated concept.
  if (foreign !== null && isSplitSignature(foreign)) {
    return null;
  }
  return { site, restating, owner: home, relation, crossDomain, foreign, source: owner };
}

const CONTRACT_FILE = /\/packages\/(?:contracts|kit)\/|\/contract\/|[/.-]contract\.ts$/u;

/** A contract file is a shape's home: a domain's `contract/`, a `*-contract.ts`, contracts or kit. */
export const isContractFile = (fileName: string): boolean => CONTRACT_FILE.test(fileName.replaceAll("\\", "/"));

function rankOf(member: PortMember): number {
  const placement = placementOf(member.getSourceFile().fileName);
  return placement === null ? Number.MAX_SAFE_INTEGER : tierRank(placement);
}

// Whole-object flow: every hand-typed member of the slot's type against the same-named member of the value.
function objectFlow(checker: ts.TypeChecker, site: ts.Node, slotType: ts.Type | undefined, value: ts.Expression): Restatement[] {
  const slot = slotType === undefined ? null : slotObjectType(checker, slotType);
  const valueType = nonNullable(checker, checker.getTypeAtLocation(value));
  if (slot === null || valueType.isUnion()) {
    return [];
  }
  const found: Restatement[] = [];
  for (const member of checker.getPropertiesOfType(slot)) {
    const source = checker.getPropertyOfType(valueType, member.name);
    const restatement = source === undefined ? null : judge(checker, site, member, source);
    if (restatement !== null) {
      found.push(restatement);
    }
  }
  return found;
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

function propertyFlow(checker: ts.TypeChecker, property: ts.PropertyAssignment | ts.ShorthandPropertyAssignment): Restatement[] {
  const contextual = checker.getContextualType(property.parent);
  const name = property.name.getText();
  const slot = contextual === undefined ? undefined : propertyOf(checker, contextual, name);
  if (slot === undefined) {
    return [];
  }
  const value = ts.isPropertyAssignment(property) ? property.initializer : property.name;
  const found = objectFlow(checker, property, checker.getTypeOfSymbolAtLocation(slot, property), value);
  const source = ts.isPropertyAssignment(property)
    ? (forwardedMember(checker, property.initializer) ?? wrappedMember(checker, property.initializer, name))
    : checker.getShorthandAssignmentValueSymbol(property);
  const member = source === undefined ? null : judge(checker, property, slot, source);
  return member === null ? found : [...found, member];
}

const isCallback = (node: ts.Node): boolean => ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isObjectLiteralExpression(node);

/** Every restatement whose flow site is `node`. Object literals are judged property by property, so a
 *  variable, return or argument that is itself a literal is skipped here and met through its properties. */
export function restatementsAt(checker: ts.TypeChecker, node: ts.Node): readonly Restatement[] {
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
    return node.arguments
      .filter((argument) => !isCallback(argument))
      .flatMap((argument) => objectFlow(checker, argument, checker.getContextualType(argument), argument));
  }
  return [];
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
