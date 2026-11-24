// `pnpm unwired ports`: each hand-restated port member planned against its chain's one owner, each cross-domain import
// (its shape moves to packages/contracts, Core-0 §4) and each type a door forgot to export. Only a flow, a type
// reference or an alias makes two shapes one concept; every target lands in the cluster of its concept's owner.
// A flow is followed into element types, call signatures, JSX props forwarded whole, and a generic parameter's bound
// when the value has the bound's own shape. Of two linked copies, one in a lower tier owns the shape, and a pair
// neither file may import under a dependency-cruiser rule is a ruled restatement.
import { dirname, relative } from "node:path";
import ts from "typescript";
import type { Flow, LibrarySources, PortMember } from "../eslint/index.ts";
import {
  aliasChain,
  aliased,
  aliasOf,
  derivedMembers,
  describeForeignTypes,
  flowMembers,
  flowsAt,
  foreignTypes,
  homeFileOf,
  homeSourceOf,
  isContractFile,
  isHandTyped,
  isSplitSignature,
  jointBatchRulingOf,
  librarySources,
  mergeForeignTypes,
  passesDbHandle,
  placementOf,
  placementOfSource,
  rankOfSource,
  restatementOf,
  rulingKeysOf,
  tierRank,
} from "../eslint/index.ts";
import { loadWorld } from "../floor/testing/test-worlds.ts";
import type { DistinctRegistry } from "./distinct-lookalikes.ts";
import { DISTINCT_LOOKALIKES, isDistinctPair } from "./distinct-lookalikes.ts";
import { ImportGraph } from "./doors.ts";
import type { ForgottenExport } from "./forgotten-exports.ts";
import { forgottenDoorExports } from "./forgotten-exports.ts";
import type { PlanContext } from "./port-plan.ts";
import { collapse, doorExportTargets, planMember } from "./port-plan.ts";
import type { Indexed, Pair, PlannedTarget, PortTarget, RulingKeys, TargetKind } from "./port-targets.ts";
import {
  clustered,
  conceptOf,
  crossDomainKind,
  crossDomainNote,
  importBarredBy,
  keyOf,
  legOf,
  lineOf,
  placementOfKey,
  SPLIT_RULING,
  sharedHomeOf,
} from "./port-targets.ts";
import { isProduction, packageWorlds } from "./worlds.ts";

// The host's realpath, so a workspace package keeps its source path.
const realpath = (path: string): string => ts.sys.realpath?.(path) ?? path;

// One package world as a TypeScript 6 program: the port-ownership helpers in tooling/src/eslint/ read its checker.
function createWorldProgram(root: string, config: string): ts.Program {
  const parsed = loadWorld(root, config);
  const host = ts.createCompilerHost(parsed.options);
  host.realpath = realpath;
  return ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options, host });
}

interface WorldCount {
  readonly config: string;
  readonly files: number;
  readonly pairs: number;
}

/** The census of one tree: the restating pairs, cross-domain imports and forgotten door exports, then the targets. */
export interface PortCensus {
  readonly targets: readonly PortTarget[];
  readonly worlds: readonly WorldCount[];
}

// --- Concept links -----------------------------------------------------------------------------------------

// Union-find over census keys: two keys share a root when a real flow, a type reference or an alias joins them.
class Links {
  readonly #parent = new Map<string, string>();

  root(key: string): string {
    let current = key;
    for (let next = this.#parent.get(current); next !== undefined && next !== current; next = this.#parent.get(current)) {
      current = next;
    }
    return current;
  }

  join(a: string | null, b: string | null): void {
    if (a !== null && b !== null && a !== b) {
      this.#parent.set(this.root(a), this.root(b));
    }
  }

  linked(a: string, b: string): boolean {
    return this.root(a) === this.root(b);
  }
}

type Declared = ts.InterfaceDeclaration | ts.TypeAliasDeclaration;

const declarationKey = (root: string, declaration: Declared): string =>
  `${relative(root, declaration.getSourceFile().fileName)}:${lineOf(declaration)}:${declaration.name.text}`;

// The interface or alias a type is named by, as a census key; null for an anonymous or library type.
function namedKey(root: string, type: ts.Type): string | null {
  const declaration = (type.aliasSymbol ?? type.getSymbol())?.declarations?.[0];
  if (declaration === undefined || !(ts.isInterfaceDeclaration(declaration) || ts.isTypeAliasDeclaration(declaration))) {
    return null;
  }
  return isProduction(relative(root, declaration.getSourceFile().fileName)) ? declarationKey(root, declaration) : null;
}

/** A declaration a handler parameter receives whole from a wider named type: the slice derives from that type. */
interface Slice {
  /** The census key of the wider type the slot passes. */
  readonly owner: string;
  /** The slice's member names, sorted. */
  readonly members: readonly string[];
}

interface LinkContext {
  readonly root: string;
  readonly checker: ts.TypeChecker;
  readonly sources: LibrarySources;
  /** Whether a file is one of the compiler's default library files. */
  readonly isLibrary: (source: ts.SourceFile) => boolean;
  readonly links: Links;
  readonly slices: Map<string, Slice>;
}

// How far a type flow is followed into element types, intersection parts and signatures: a port's parameter, its
// elements, and one level below.
const TYPE_FLOW_DEPTH = 3;

const isReference = (type: ts.Type): type is ts.TypeReference =>
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeFlags and ObjectFlags are compiler-owned bitfields.
  (type.flags & ts.TypeFlags.Object) !== 0 && ((type as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference) !== 0;

// A generic the default library declares (arrays, iterables, generators, promises, sets, maps): each one's type
// parameters, in order, are the element types it carries, so an `AsyncGenerator<A>` fed into an `AsyncIterable<B>`
// flows `A` into `B`. A package's augmentation (`@total-typescript/ts-reset` merges into `Array`) leaves it the
// library's generic. Two user generics pair their arguments only when they are one generic.
function isLibraryGeneric({ isLibrary }: LinkContext, type: ts.TypeReference): boolean {
  return (type.target.getSymbol()?.declarations ?? []).some((declaration) => isLibrary(declaration.getSourceFile()));
}

function elementPairs(context: LinkContext, slot: ts.Type, value: ts.Type): readonly (readonly [ts.Type, ts.Type])[] {
  const { checker } = context;
  if (!(isReference(slot) && isReference(value))) {
    return [];
  }
  const tuples = checker.isTupleType(slot) && checker.isTupleType(value);
  if (!(slot.target === value.target || tuples || (isLibraryGeneric(context, slot) && isLibraryGeneric(context, value)))) {
    return [];
  }
  const theirs = checker.getTypeArguments(value);
  return checker.getTypeArguments(slot).flatMap((argument, index) => {
    const other = theirs[index];
    return other === undefined ? [] : [[argument, other] as const];
  });
}

const partsOf = (type: ts.Type): readonly ts.Type[] => (type.isIntersection() ? type.types : [type]);

// A handler that accepts `accepted` where its slot passes a wider named type: `accepted` is that type's slice.
function recordSlice({ root, checker, slices }: LinkContext, received: ts.Type, accepted: ts.Type): void {
  const slice = namedKey(root, accepted);
  if (slice === null) {
    return;
  }
  const members = checker.getPropertiesOfType(accepted).map((member) => member.name);
  for (const part of partsOf(received)) {
    const owner = namedKey(root, part);
    const wider = new Set(checker.getPropertiesOfType(part).map((member) => member.name));
    if (
      owner !== null &&
      owner !== slice &&
      wider.size > members.length &&
      members.every((name) => wider.has(name)) &&
      checker.isTypeAssignableTo(part, accepted)
    ) {
      slices.set(slice, { owner, members: members.toSorted() });
    }
  }
}

/** A production type parameter's bound: the concept every value of the bound's shape it takes belongs to. */
interface Bound {
  /** The census key of the type parameter's declaration. */
  readonly key: string;
  readonly constraint: ts.Type;
}

// A production type parameter with a bound (`T extends SquashRow`, `T extends { … }`) stands for its bound's concept,
// and a named bound joins it. An unbounded one has no shape to compare a value with, so it names no concept.
function boundOf({ root, links }: LinkContext, type: ts.Type): Bound | null {
  const declaration = type.isTypeParameter() ? type.getSymbol()?.declarations?.[0] : undefined;
  const constraint = type.getConstraint();
  if (declaration === undefined || !ts.isTypeParameterDeclaration(declaration) || constraint === undefined) {
    return null;
  }
  const file = relative(root, declaration.getSourceFile().fileName);
  if (!isProduction(file)) {
    return null;
  }
  const key = `${file}:${lineOf(declaration)}:${declaration.name.text}`;
  links.join(key, namedKey(root, constraint));
  return { key, constraint };
}

// Two names one flow joins. Through a bounded type parameter only a value of the bound's own shape joins: a wider row
// that merely satisfies the bound is its own concept, as is a narrower bound's parameter forwarded into a wider one.
function joinNames(context: LinkContext, slot: ts.Type, value: ts.Type): void {
  const { root, checker, links } = context;
  const [mine, theirs] = [boundOf(context, slot), boundOf(context, value)];
  const [slotShape, valueShape] = [mine?.constraint ?? slot, theirs?.constraint ?? value];
  if ((mine === null && theirs === null) || (checker.isTypeAssignableTo(slotShape, valueShape) && checker.isTypeAssignableTo(valueShape, slotShape))) {
    links.join(mine?.key ?? namedKey(root, slot), theirs?.key ?? namedKey(root, value));
  }
}

// A value of type `value` flowing into a slot of type `slot` joins their names, then the element types they carry,
// the named parts of an intersection, and the parameters and awaited returns of their call signatures.
function joinTypes(context: LinkContext, slot: ts.Type, value: ts.Type, depth = TYPE_FLOW_DEPTH): void {
  const { checker } = context;
  const [bareSlot, bareValue] = [checker.getNonNullableType(slot), checker.getNonNullableType(value)];
  joinNames(context, bareSlot, bareValue);
  if (depth === 0) {
    return;
  }
  for (const [mine, theirs] of elementPairs(context, bareSlot, bareValue)) {
    joinTypes(context, mine, theirs, depth - 1);
  }
  const [slotParts, valueParts] = [partsOf(bareSlot), partsOf(bareValue)];
  if (slotParts.length > 1 || valueParts.length > 1) {
    for (const [mine, theirs] of slotParts.flatMap((part) => valueParts.map((other) => [part, other] as const))) {
      joinTypes(context, mine, theirs, depth - 1);
    }
    return;
  }
  joinSignatures(context, bareSlot, bareValue, depth);
}

// One call signature on each side: each parameter the slot passes into the value's, then the awaited returns.
function joinSignatures(context: LinkContext, slot: ts.Type, value: ts.Type, depth: number): void {
  const { checker } = context;
  const [mine, ...moreMine] = slot.getCallSignatures();
  const [theirs, ...moreTheirs] = value.getCallSignatures();
  if (mine === undefined || theirs === undefined || moreMine.length > 0 || moreTheirs.length > 0) {
    return;
  }
  mine.parameters.forEach((parameter, index) => {
    const other = theirs.parameters[index];
    if (other !== undefined) {
      const [received, accepted] = [checker.getTypeOfSymbol(parameter), checker.getTypeOfSymbol(other)];
      joinTypes(context, received, accepted, depth - 1);
      recordSlice(context, checker.getNonNullableType(received), checker.getNonNullableType(accepted));
    }
  });
  const awaited = (signature: ts.Signature): ts.Type => checker.getAwaitedType(signature.getReturnType()) ?? signature.getReturnType();
  joinTypes(context, awaited(mine), awaited(theirs), depth - 1);
}

// A generic call's contextual slot is the instantiated parameter, which names the argument's own type back: the
// declared parameter keeps its type parameter, so each argument reaches the bound. A rest parameter takes each
// argument as an element, and a spread argument whole.
function joinGenericArguments(context: LinkContext, call: ts.CallExpression | ts.NewExpression): void {
  const { checker } = context;
  const resolved = checker.getResolvedSignature(call);
  const declaration = resolved?.getDeclaration();
  if (declaration === undefined || ts.isJSDocSignature(declaration)) {
    return;
  }
  const declared = checker.getSignatureFromDeclaration(declaration);
  if (declared === undefined || declared === resolved) {
    return;
  }
  const last = declared.parameters.length - 1;
  (call.arguments ?? []).forEach((argument, index) => {
    const parameter = declared.parameters[Math.min(index, last)];
    const rest = parameter?.declarations?.some((node) => ts.isParameter(node) && node.dotDotDotToken !== undefined) === true;
    if (parameter === undefined || (index > last && !rest)) {
      return;
    }
    const type = checker.getTypeOfSymbol(parameter);
    const slot = rest && !ts.isSpreadElement(argument) ? checker.getIndexTypeOfType(type, ts.IndexKind.Number) : type;
    const value = ts.isSpreadElement(argument) ? argument.expression : argument;
    if (slot !== undefined) {
      joinTypes(context, slot, checker.getTypeAtLocation(value));
    }
  });
}

function linkMember({ root, checker, links }: LinkContext, member: PortMember): string {
  const key = keyOf(root, member);
  const alias = aliasOf(checker, member);
  links.join(key, alias === null ? null : declarationKey(root, alias));
  return key;
}

// `type B = A` and `type Op = NonNullable<Owner["m"]>` name one concept with two names.
function linkAlias({ root, checker, sources, links }: LinkContext, alias: ts.TypeAliasDeclaration): void {
  const key = declarationKey(root, alias);
  for (const member of derivedMembers(sources, checker, alias.type)) {
    links.join(key, keyOf(root, member));
  }
  if (ts.isTypeReferenceNode(alias.type)) {
    links.join(key, namedKey(root, checker.getTypeFromTypeNode(alias.type)));
  }
}

// The props member a JSX attribute value forwards: `a={a}` from a destructured prop, or `a={props.a}`.
function forwardedProp(checker: ts.TypeChecker, value: ts.Expression): ts.Declaration | undefined {
  const bare = ts.isParenthesizedExpression(value) ? value.expression : value;
  const node = ts.isIdentifier(bare) ? checker.getSymbolAtLocation(bare)?.declarations?.[0] : bare;
  return node === undefined ? undefined : readMembers(checker, node)[0]?.declarations?.[0];
}

// The props declaration an attribute fills and the one its value forwards from, or null for a value the component
// computes itself.
function forwardedHolders(checker: ts.TypeChecker, props: ts.Type, attribute: ts.JsxAttribute): { readonly slot: Declared; readonly source: Declared } | null {
  const slot = checker.getPropertyOfType(props, attribute.name.getText())?.declarations?.[0];
  const value = attribute.initializer !== undefined && ts.isJsxExpression(attribute.initializer) ? attribute.initializer.expression : undefined;
  const source = value === undefined ? undefined : forwardedProp(checker, value);
  const [slotHolder, sourceHolder] = [slot === undefined ? null : holderOf(slot), source === undefined ? null : holderOf(source)];
  return slotHolder === null || sourceHolder === null ? null : { slot: slotHolder, source: sourceHolder };
}

// `<Child a={a} b={b} />`: when the members of one props declaration fill every member of the child's props
// declaration, the component passes its props on whole, member by member, so the two name one concept. A prop the
// component fills itself, or members drawn from two declarations, join nothing. A spread passes its whole type.
function linkJsxProps(context: LinkContext, element: ts.JsxOpeningLikeElement): void {
  const { root, checker, links } = context;
  const props = checker.getContextualType(element.attributes);
  if (props === undefined) {
    return;
  }
  const sources = new Set<Declared>();
  const slots = new Set<Declared>();
  let forwarded = 0;
  for (const attribute of element.attributes.properties) {
    if (ts.isJsxSpreadAttribute(attribute)) {
      joinTypes(context, props, checker.getTypeAtLocation(attribute.expression));
      continue;
    }
    const holders = forwardedHolders(checker, props, attribute);
    if (holders === null) {
      return;
    }
    slots.add(holders.slot);
    sources.add(holders.source);
    forwarded += 1;
  }
  const [slot] = slots;
  const [source] = sources;
  if (slot === undefined || source === undefined || slots.size > 1 || sources.size > 1 || slot === source) {
    return;
  }
  if (checker.getPropertiesOfType(checker.getTypeAtLocation(slot.name)).length === forwarded) {
    links.join(declarationKey(root, slot), declarationKey(root, source));
  }
}

// --- Pass 1: pairs, concept links, member reads and cross-domain imports, world by world ---------------------

// Where a chain member's shape lives (the alias it is typed by, else its own file) and whether it is typed by a name.
interface Home {
  readonly rank: number;
  readonly file: string;
  readonly named: boolean;
}

interface Collected {
  readonly pairs: Map<string, Pair>;
  readonly concepts: Set<string>;
  readonly homes: Map<string, Home>;
  readonly links: Links;
  /** `consumerDomain|ownerDeclarationKey` to the member names that domain reads off the owner's type. */
  readonly reads: Map<string, Set<string>>;
  readonly crossImports: Map<string, PlannedTarget>;
  readonly forgotten: Map<string, ForgottenExport>;
  /** An alias's declaration key to the members typed by it, through renames: the op members a type names. */
  readonly typedBy: Map<string, Set<string>>;
  /** A handler parameter's declaration key to the wider type its slot passes it. */
  readonly slices: Map<string, Slice>;
}

function homeOf(sources: LibrarySources, checker: ts.TypeChecker, member: PortMember): Home {
  return { rank: rankOfSource(sources, homeSourceOf(checker, member)), file: homeFileOf(checker, member), named: !isHandTyped(member) };
}

function collectMemberFlow(context: LinkContext, flow: Flow, into: Collected): void {
  const { root, checker, sources, links } = context;
  const members = flowMembers(sources, checker, flow);
  if (members !== null) {
    links.join(linkMember(context, members.port), linkMember(context, members.owner));
    joinTypes(context, checker.getTypeAtLocation(members.port), checker.getTypeAtLocation(members.owner));
  }
  const found = restatementOf(sources, checker, flow);
  if (found === null) {
    return;
  }
  const pair = { restating: keyOf(root, found.restating), owner: keyOf(root, found.owner), source: keyOf(root, found.source), relation: found.relation };
  into.pairs.set(`${pair.restating}>${pair.owner}`, pair);
  into.homes.set(pair.restating, homeOf(sources, checker, found.restating));
  into.homes.set(pair.owner, homeOf(sources, checker, found.owner));
}

// `readonly copyHandoffBooks: CopyHandoffBooksOp`: the alias and each alias it renames name the op `copyHandoffBooks`.
function recordTypedBy(root: string, checker: ts.TypeChecker, member: ts.PropertySignature, typedBy: Collected["typedBy"]): void {
  for (const alias of aliasChain(checker, member)) {
    const key = declarationKey(root, alias);
    typedBy.set(key, (typedBy.get(key) ?? new Set()).add(member.name.getText()));
  }
}

// The flows whose site is `node`: a JSX element's props, then each whole-value and member flow.
function collectNodeFlows(context: LinkContext, node: ts.Node, into: Collected): void {
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
    linkJsxProps(context, node);
  }
  if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
    joinGenericArguments(context, node);
  }
  const flows = flowsAt(context.checker, node);
  for (const flow of flows.types) {
    joinTypes(context, flow.slot, flow.value);
  }
  for (const flow of flows.members) {
    collectMemberFlow(context, flow, into);
  }
}

function collectFlows(root: string, program: ts.Program, source: ts.SourceFile, into: Collected): void {
  const checker = program.getTypeChecker();
  const isLibrary = (file: ts.SourceFile): boolean => program.isSourceFileDefaultLibrary(file);
  const context: LinkContext = { root, checker, sources: librarySources(program, root), isLibrary, links: into.links, slices: into.slices };
  const visit = (node: ts.Node): void => {
    if ((ts.isPropertySignature(node) || ts.isMethodSignature(node)) && isHandTyped(node) && conceptOf(node)?.sweep === true) {
      into.concepts.add(keyOf(root, node));
    }
    if (ts.isTypeAliasDeclaration(node) && node.typeParameters === undefined) {
      linkAlias(context, node);
    }
    if (ts.isPropertySignature(node)) {
      recordTypedBy(root, checker, node, into.typedBy);
    }
    collectNodeFlows(context, node, into);
    ts.forEachChild(node, visit);
  };
  visit(source);
}

const literalKey = (key: ts.Node): string | null => (ts.isLiteralTypeNode(key) && ts.isStringLiteral(key.literal) ? key.literal.text : null);

function propertiesNamed(checker: ts.TypeChecker, type: ts.Type, names: readonly (string | null)[]): readonly ts.Symbol[] {
  return names.flatMap((name) => {
    const found = name === null ? undefined : checker.getPropertyOfType(type.getNonNullableType(), name);
    return found === undefined ? [] : [found];
  });
}

// `Pick<Owner, "a" | "b">` reads `a` and `b`.
function pickedMembers(checker: ts.TypeChecker, node: ts.TypeReferenceNode): readonly ts.Symbol[] {
  const [owner, keys] = node.typeArguments ?? [];
  if (node.typeName.getText() !== "Pick" || owner === undefined || keys === undefined) {
    return [];
  }
  const names = ts.isUnionTypeNode(keys) ? keys.types.map(literalKey) : [literalKey(keys)];
  return propertiesNamed(checker, checker.getTypeFromTypeNode(owner), names);
}

// The member a read names: `x.m`, `x?.m`, `x["m"]`, `Owner["m"]`, `Pick<Owner, "m">` or `{ m } = x`.
function readMembers(checker: ts.TypeChecker, node: ts.Node): readonly ts.Symbol[] {
  const of = (type: ts.Type, name: string | null): readonly ts.Symbol[] => propertiesNamed(checker, type, [name]);
  if (ts.isPropertyAccessExpression(node)) {
    return of(checker.getTypeAtLocation(node.expression), node.name.text);
  }
  if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)) {
    return of(checker.getTypeAtLocation(node.expression), node.argumentExpression.text);
  }
  if (ts.isIndexedAccessTypeNode(node)) {
    return of(checker.getTypeFromTypeNode(node.objectType), literalKey(node.indexType));
  }
  if (ts.isTypeReferenceNode(node)) {
    return pickedMembers(checker, node);
  }
  if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent) && node.dotDotDotToken === undefined) {
    return of(checker.getTypeAtLocation(node.parent), (node.propertyName ?? node.name).getText());
  }
  return [];
}

// The declaration that holds a member: an interface, or the alias whose type literal it sits in.
function holderOf(member: ts.Declaration): Declared | null {
  if (!(ts.isPropertySignature(member) || ts.isMethodSignature(member))) {
    return null;
  }
  const holder = member.parent;
  if (ts.isInterfaceDeclaration(holder)) {
    return holder;
  }
  return ts.isTypeLiteralNode(holder) && ts.isTypeAliasDeclaration(holder.parent) ? holder.parent : null;
}

// A read of a member another domain declares, keyed by the reading domain and the declaring shape.
// One world's program as the census reads it.
type CensusWorld = Pick<LinkContext, "root" | "checker" | "sources">;

function recordRead({ root, sources }: CensusWorld, domain: string, symbol: ts.Symbol, into: Collected): void {
  for (const declaration of symbol.declarations ?? []) {
    const holder = holderOf(declaration);
    const owner = holder === null ? null : (placementOfSource(sources, holder.getSourceFile())?.domain ?? null);
    if (holder !== null && owner !== null && owner !== domain) {
      const key = `${domain}|${declarationKey(root, holder)}`;
      into.reads.set(key, (into.reads.get(key) ?? new Set()).add(symbol.name));
    }
  }
}

function collectReads(world: CensusWorld, source: ts.SourceFile, into: Collected): void {
  const domain = placementOfSource(world.sources, source)?.domain ?? null;
  if (domain === null) {
    return;
  }
  const visit = (node: ts.Node): void => {
    for (const symbol of readMembers(world.checker, node)) {
      recordRead(world, domain, symbol, into);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

function importedNames(statement: ts.ImportDeclaration | ts.ExportDeclaration): readonly string[] {
  if (ts.isExportDeclaration(statement)) {
    return statement.exportClause !== undefined && ts.isNamedExports(statement.exportClause)
      ? statement.exportClause.elements.map((element) => (element.propertyName ?? element.name).getText())
      : ["*"];
  }
  const bindings = statement.importClause?.namedBindings;
  if (bindings === undefined) {
    return statement.importClause?.name === undefined ? [] : ["default"];
  }
  return ts.isNamedImports(bindings) ? bindings.elements.map((element) => (element.propertyName ?? element.name).getText()) : ["*"];
}

function moduleTarget(checker: ts.TypeChecker, specifier: ts.StringLiteral): { readonly module: ts.Symbol; readonly file: ts.SourceFile } | null {
  const module = checker.getSymbolAtLocation(specifier);
  const file = module?.valueDeclaration?.getSourceFile() ?? module?.declarations?.[0]?.getSourceFile();
  return module === undefined || file === undefined ? null : { module, file };
}

type ModuleStatement = ts.ImportDeclaration | ts.ExportDeclaration;

// D117: the one ruled cross-domain import, the workloads door's `WorkloadContribution`, whose AbortSignal keeps it out of contracts.
const D117_DOOR = { domain: "workloads", names: new Set(["WorkloadContribution"]) };

// The other domain a statement imports from, or null for a same-domain or non-domain module.
function crossDomainTarget(
  { checker, sources }: CensusWorld,
  statement: ts.Statement,
  domain: string,
): { readonly statement: ModuleStatement; readonly module: ts.Symbol; readonly domain: string } | null {
  if (!(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))) {
    return null;
  }
  const specifier = statement.moduleSpecifier;
  const target = specifier !== undefined && ts.isStringLiteral(specifier) ? moduleTarget(checker, specifier) : null;
  const targetDomain = target === null ? null : (placementOfSource(sources, target.file)?.domain ?? null);
  return target === null || targetDomain === null || targetDomain === domain ? null : { statement, module: target.module, domain: targetDomain };
}

// A service or port: a declared shape with a hand-typed function member. A consumer depends on the ops it calls,
// never on the whole interface (the service stays in its domain).
function isService(declaration: ts.Declaration): declaration is Declared {
  const holdsOp = (members: ts.NodeArray<ts.TypeElement>): boolean =>
    members.some((member) => (ts.isPropertySignature(member) || ts.isMethodSignature(member)) && isHandTyped(member));
  if (ts.isInterfaceDeclaration(declaration)) {
    return holdsOp(declaration.members);
  }
  return ts.isTypeAliasDeclaration(declaration) && ts.isTypeLiteralNode(declaration.type) && holdsOp(declaration.type.members);
}

interface ImportSite {
  readonly root: string;
  readonly sources: LibrarySources;
  readonly file: string;
  readonly line: number;
  readonly specifier: string;
  readonly domain: string;
  readonly from: string;
  readonly module: ts.Symbol;
}

function importTarget(site: ImportSite, fields: Pick<PlannedTarget, "kind" | "members" | "port" | "owner" | "ownerAt" | "note">): PlannedTarget {
  return { leg: legOf(site.file), form: "import", file: site.file, line: site.line, type: null, imports: [], exports: [], ...fields };
}

// One target per op a consumer domain reads off an imported service, or a review target when it reads none.
function serviceTargets(checker: ts.TypeChecker, site: ImportSite, service: Declared, reads: ReadonlyMap<string, ReadonlySet<string>>): PlannedTarget[] {
  const name = service.name.text;
  const ops = [...(reads.get(`${site.domain}|${declarationKey(site.root, service)}`) ?? [])].sort();
  const at = (node: ts.Node): string => `${relative(site.root, node.getSourceFile().fileName)}:${lineOf(node)}`;
  if (ops.length === 0) {
    const note = `domain ${site.domain} imports the whole ${name} from domain ${site.from} and reads no member: name the op it passes on, or drop the import`;
    return [importTarget(site, { kind: "review", members: [name], port: `import ${name} from ${site.specifier}`, owner: name, ownerAt: at(service), note })];
  }
  const type = checker.getTypeAtLocation(service.name);
  return ops.flatMap((op) => {
    const member = checker.getPropertyOfType(type, op)?.declarations?.[0];
    if (member === undefined) {
      return [];
    }
    const foreign = foreignTypes(site.sources, checker, member);
    const isOp = (ts.isPropertySignature(member) || ts.isMethodSignature(member)) && isHandTyped(member);
    const keys = { names: memberRulingKeys(checker, `${name}.${op}`, member), domains: [site.domain, site.from] };
    // A field whose type contracts already holds moves nothing: the consumer declares the slice it reads.
    const kind: TargetKind = !isOp && foreign.server.length === 0 && !passesDbHandle(foreign) ? "split" : crossDomainKind(foreign, keys);
    const plan =
      kind === "move-to-contracts"
        ? `name ${op} ${isOp ? "as a contracts op type" : "'s type in contracts"}`
        : `type ${op} in domain ${site.domain}'s contract/ over contracts data`;
    const note = [
      `domain ${site.domain} ${isOp ? "calls" : "reads"} ${name}.${op} from domain ${site.from}; never move the whole ${name}: ${plan}`,
      crossDomainNote(kind, foreign, keys),
    ]
      .filter((part) => part !== "")
      .join("; ");
    return [
      importTarget(site, { kind, members: [op], port: `import ${name}.${op} from ${site.specifier}`, owner: `${name}.${op}`, ownerAt: at(member), note }),
    ];
  });
}

const memberRulingKeys = (checker: ts.TypeChecker, label: string, member: ts.Declaration): readonly string[] => [
  label,
  ...(ts.isPropertySignature(member) || ts.isMethodSignature(member) ? rulingKeysOf(checker, member) : []),
];

// The op members a declared type names: every member typed by it, through renames.
const typedNames = (root: string, declarations: readonly ts.Declaration[], typedBy: Collected["typedBy"]): readonly string[] =>
  declarations
    .filter((declaration) => ts.isInterfaceDeclaration(declaration) || ts.isTypeAliasDeclaration(declaration))
    .flatMap((declaration) => [...(typedBy.get(declarationKey(root, declaration)) ?? [])]);

interface ImportedData {
  readonly name: string;
  readonly declarations: readonly ts.Declaration[];
  /** The imported name and the op members it types, with the two domains, for a joint-batch ruling. */
  readonly keys: RulingKeys;
}

// A data shape another domain declares: it moves to contracts whole, or splits around its runtime types.
function dataTarget(checker: ts.TypeChecker, site: ImportSite, { name, declarations, keys }: ImportedData): PlannedTarget {
  const foreign = mergeForeignTypes(declarations.map((declaration) => foreignTypes(site.sources, checker, declaration)));
  const kind = crossDomainKind(foreign, keys);
  const ownerAt = declarations.map((declaration) => `${relative(site.root, declaration.getSourceFile().fileName)}:${lineOf(declaration)}`).join(", ");
  const note = [`domain ${site.domain} takes ${name} from domain ${site.from}`, crossDomainNote(kind, foreign, keys)].filter((part) => part !== "").join("; ");
  return importTarget(site, { kind, members: [name], port: `import ${name} from ${site.specifier}`, owner: name, ownerAt, note });
}

// The targets for one name a cross-domain import takes: none for the D117 door, the ops read off a service, else the data.
function nameTargets(checker: ts.TypeChecker, site: ImportSite, name: string, { reads, typedBy }: Collected): readonly PlannedTarget[] {
  if (site.from === D117_DOOR.domain && D117_DOOR.names.has(name)) {
    return [];
  }
  const declarations =
    aliased(
      checker,
      checker.getExportsOfModule(site.module).find((symbol) => symbol.name === name),
    )?.declarations ?? [];
  const service = declarations.find(isService);
  if (service !== undefined) {
    return serviceTargets(checker, site, service, reads);
  }
  const keys = { names: [name, ...typedNames(site.root, declarations, typedBy)], domains: [site.domain, site.from] };
  return [dataTarget(checker, site, { name, declarations, keys })];
}

function collectCrossImports(world: CensusWorld, source: ts.SourceFile, into: Collected): void {
  const { root, checker, sources } = world;
  const domain = placementOfSource(sources, source)?.domain ?? null;
  if (domain === null) {
    return;
  }
  const file = relative(root, source.fileName);
  for (const candidate of source.statements) {
    const cross = crossDomainTarget(world, candidate, domain);
    if (cross === null) {
      continue;
    }
    const specifier = cross.statement.moduleSpecifier?.getText().slice(1, -1) ?? "";
    const site: ImportSite = { root, sources, file, line: lineOf(cross.statement), specifier, domain, from: cross.domain, module: cross.module };
    for (const target of importedNames(cross.statement).flatMap((name) => nameTargets(checker, site, name, into))) {
      into.crossImports.set(`${file}:${target.line}:${target.port}`, target);
    }
  }
}

// --- Owner choice ------------------------------------------------------------------------------------------

// Union-find over identical pairs: each chain of members that restate one another.
function chainsOf(pairs: readonly Pair[]): ReadonlyMap<string, readonly string[]> {
  const links = new Links();
  for (const pair of pairs) {
    links.join(pair.restating, pair.restating);
    if (pair.relation === "identical") {
      links.join(pair.restating, pair.owner);
    }
  }
  const byHead = new Map<string, string[]>();
  for (const key of new Set(pairs.flatMap((pair) => [pair.restating, pair.owner]))) {
    const head = links.root(key);
    byHead.set(head, [...(byHead.get(head) ?? []), key]);
  }
  const chains = new Map<string, readonly string[]>();
  for (const members of byHead.values()) {
    for (const key of members) {
      chains.set(key, members);
    }
  }
  return chains;
}

/** The member whose shape sits in the lowest tier (an alias it is typed by counts as its home); then one already
 *  typed by a name; then a contract file over a service or composition file beside it; then the member no value
 *  flows into (the implemented one). */
function ownerChooser(fed: ReadonlySet<string>, homes: ReadonlyMap<string, Home>): (chain: readonly string[]) => string {
  const home = (key: string): Home => homes.get(key) ?? { rank: Number.MAX_SAFE_INTEGER, file: key, named: false };
  return (chain) => {
    const lowest = Math.min(...chain.map((key) => home(key).rank));
    const tier = chain.filter((key) => home(key).rank === lowest).sort();
    const named = tier.filter((key) => home(key).named);
    const pool = named.length > 0 ? named : tier;
    const contracts = pool.filter((key) => isContractFile(home(key).file));
    const lows = contracts.length > 0 ? contracts : pool;
    const sources = lows.filter((key) => !fed.has(key));
    return (sources.length === 1 ? sources[0] : lows[0]) ?? chain[0] ?? "";
  };
}

function indexMembers(root: string, program: ts.Program): ReadonlyMap<string, Indexed> {
  const nodes = new Map<string, Indexed>();
  for (const source of program.getSourceFiles()) {
    const file = relative(root, source.fileName);
    if (source.isDeclarationFile || !isProduction(file)) {
      continue;
    }
    const visit = (node: ts.Node): void => {
      if (ts.isPropertySignature(node) || ts.isMethodSignature(node)) {
        const key = keyOf(root, node);
        nodes.set(key, { key, member: node, file, line: lineOf(node) });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return nodes;
}

// A cross-domain copy that carries a database handle cannot move to contracts (contracts reaches only kit and zod):
// D337's table rules it, or the ledger review does.
interface Copies {
  readonly linked: readonly string[];
  /** The census key of each linked copy, in the order of {@link Copies.linked}. */
  readonly linkedKeys: readonly string[];
  /** Shape-only copies the distinct registry has not judged. */
  readonly open: readonly string[];
  readonly distinct: readonly string[];
}

// A ruled handle signature is settled whatever its copies; otherwise only a linked copy is the same concept, and a
// look-alike is open review work until the distinct registry records the judgment.
function forgottenKind(entry: ForgottenExport, copies: Copies, ruled: boolean): TargetKind {
  if (entry.crossDomain && passesDbHandle(entry.foreign) && ruled) {
    return "ruled";
  }
  // A split signature (contracts data plus runtime types) is the consumer's own contract: the restatement matcher
  // never reports one, so a cross-domain copy of it is settled the same way, linked or not.
  const split = entry.crossDomain && isSplitSignature(entry.foreign);
  if (copies.linked.length === 0) {
    if (copies.open.length === 0) {
      return "distinct";
    }
    return split ? "ruled" : "review";
  }
  if (!entry.crossDomain) {
    return "forgotten-door-export";
  }
  if (passesDbHandle(entry.foreign)) {
    return "db-handle-review";
  }
  return split ? "ruled" : "move-to-contracts";
}

// `file:line:Name` to the registry's `file#Name`.
const shapeRefOf = (key: string): string => `${key.slice(0, key.indexOf(":"))}#${key.slice(key.lastIndexOf(":") + 1)}`;

interface Judgments {
  readonly links: Links;
  readonly typedBy: Collected["typedBy"];
  readonly slices: Collected["slices"];
  readonly distinct: DistinctRegistry;
}

function copiesOf(entry: ForgottenExport, { links, distinct }: Judgments): Copies {
  const sorted: { linked: string[]; linkedKeys: string[]; open: string[]; distinct: string[] } = { linked: [], linkedKeys: [], open: [], distinct: [] };
  entry.copies.forEach((copy, index) => {
    const key = entry.copyKeys[index] ?? "";
    if (links.linked(entry.key, key)) {
      sorted.linked.push(copy);
      sorted.linkedKeys.push(key);
    } else {
      sorted[isDistinctPair(distinct, shapeRefOf(entry.key), shapeRefOf(key)) ? "distinct" : "open"].push(copy);
    }
  });
  return sorted;
}

// The names a ruling may know a forgotten type by: its own, its copies', and the op members each of them types.
const forgottenRulingKeys = (entry: ForgottenExport, typedBy: Collected["typedBy"]): RulingKeys => {
  const keys = [entry.key, ...entry.copyKeys];
  return {
    names: keys.flatMap((key) => [key.slice(key.lastIndexOf(":") + 1), ...(typedBy.get(key) ?? [])]),
    domains: keys.map((key) => placementOfKey(key)?.domain ?? null),
  };
};

// `file:line:Name` split into the name and its `file:line`.
const splitKey = (key: string): { readonly name: string; readonly at: string } => ({
  name: key.slice(key.lastIndexOf(":") + 1),
  at: key.slice(0, key.lastIndexOf(":")),
});

const fileOfKey = (key: string): string => key.slice(0, key.indexOf(":"));

const rankOfKey = (key: string): number => {
  const placement = placementOfKey(key);
  return placement === null ? Number.MAX_SAFE_INTEGER : tierRank(placement);
};

/** A judgment that names the shape's real owner, or settles the restatement, over the forgotten-export kind. */
interface Owned {
  readonly kind: TargetKind;
  readonly owner: string | null;
  readonly ownerAt: string | null;
  readonly note: string;
}

// A linked copy neither file may import. D160's shape is a required restatement: a server domain declares the type it
// needs in its own contract/, and the composition root injects the other side's value. Any other mutually barred pair
// is review work, with the shared home both files may import named as the place to declare the shape once.
function ruledByDependencyRule(entry: ForgottenExport, copies: Copies): Owned | null {
  for (const key of copies.linkedKeys) {
    const judged = mutuallyBarred(entry.file, fileOfKey(key));
    if (judged !== null) {
      return judged;
    }
  }
  return null;
}

function mutuallyBarred(file: string, copy: string): Owned | null {
  const [mine, theirs] = [importBarredBy(file, copy), importBarredBy(copy, file)];
  if (mine === null || theirs === null) {
    return null;
  }
  const barred = `dependency-cruiser ${mine.name ?? "(unnamed)"} bars this file from ${copy}; ${theirs.name ?? "(unnamed)"} bars the reverse`;
  const home = isDomainContract(file) || isDomainContract(copy) ? null : sharedHomeOf(file, copy);
  if (home !== null) {
    return { kind: "review", owner: home, ownerAt: home, note: `${barred}; both may import ${home}: name the shape there and derive both` };
  }
  const why = mine.comment === undefined ? "" : `: ${mine.comment}`;
  return { kind: "ruled", owner: null, ownerAt: null, note: `each side declares its own, as ${barred}${why}` };
}

const isDomainContract = (file: string): boolean => isContractFile(`/${file}`) && (placementOf(`/${file}`)?.domain ?? null) !== null;

// A linked copy in a lower tier the declaration may import owns the shape.
function lowerTierOwner(entry: ForgottenExport, copies: Copies): Owned | null {
  const [lower] = copies.linkedKeys
    .filter((key) => rankOfKey(key) < rankOfKey(entry.key) && importBarredBy(entry.file, fileOfKey(key)) === null)
    .toSorted((a, b) => rankOfKey(a) - rankOfKey(b));
  if (lower === undefined) {
    return null;
  }
  const { name, at } = splitKey(lower);
  return { kind: "hand", owner: name, ownerAt: at, note: `${at} ${name} sits in a lower tier and owns the shape: delete this declaration and import it` };
}

// With no linked copy, a handler parameter its slot feeds from a wider type is that type's slice, whatever it looks like.
function sliceOwner(entry: ForgottenExport, copies: Copies, kind: TargetKind, slices: Collected["slices"]): Owned | null {
  const slice = copies.linked.length === 0 && (kind === "review" || kind === "distinct") ? slices.get(entry.key) : undefined;
  if (slice === undefined) {
    return null;
  }
  const { name, at } = splitKey(slice.owner);
  const pick = `Pick<${name}, ${slice.members.map((member) => `"${member}"`).join(" | ")}>`;
  return { kind: "hand", owner: name, ownerAt: at, note: `a slice of ${name}, which its slot passes it: derive ${pick}` };
}

// Across domains neither the dependency rule nor the lower tier applies: the shape moves to contracts.
function ownedElsewhere(entry: ForgottenExport, copies: Copies, kind: TargetKind, slices: Collected["slices"]): Owned | null {
  const local = entry.crossDomain ? null : (ruledByDependencyRule(entry, copies) ?? lowerTierOwner(entry, copies));
  return local ?? sliceOwner(entry, copies, kind, slices);
}

interface Judged {
  readonly copies: Copies;
  readonly keys: RulingKeys;
  readonly kind: TargetKind;
  readonly owned: Owned | null;
}

function forgottenNote(entry: ForgottenExport, { copies, keys, kind, owned }: Judged): string {
  const split = owned === null && kind === "ruled" && !passesDbHandle(entry.foreign) ? `${describeForeignTypes(entry.foreign)}; ruling: ${SPLIT_RULING}` : "";
  const handle = passesDbHandle(entry.foreign) ? crossDomainNote(kind, entry.foreign, keys) : split;
  return [
    owned?.note ?? "",
    copies.linked.length > 0 ? `copies: ${copies.linked.join(", ")}` : "",
    copies.open.length > 0 ? `same shape, no flow: ${copies.open.join(", ")}` : "",
    copies.distinct.length > 0 ? `distinct by registry: ${copies.distinct.join(", ")}` : "",
    handle,
  ]
    .filter((part) => part !== "")
    .join("; ");
}

// A copy counts as the same concept only when a flow, a type reference or an alias links it to the declaration;
// a copy that matches only by printed shape goes to review, never into a contracts move.
function forgottenTargets(found: Iterable<ForgottenExport>, judgments: Judgments): PlannedTarget[] {
  return [...found].map((entry): PlannedTarget => {
    const copies = copiesOf(entry, judgments);
    const keys = forgottenRulingKeys(entry, judgments.typedBy);
    const forgotten = forgottenKind(entry, copies, jointBatchRulingOf(keys.names, keys.domains) !== null);
    const owned = ownedElsewhere(entry, copies, forgotten, judgments.slices);
    const kind = owned?.kind ?? forgotten;
    const exports =
      kind !== "forgotten-door-export" || entry.doorFile === null || entry.door === null
        ? []
        : [{ file: entry.doorFile, name: entry.name, from: `./${relative(dirname(entry.doorFile), entry.file)}` }];
    const note = forgottenNote(entry, { copies, keys, kind, owned });
    return {
      leg: legOf(entry.file),
      kind,
      form: "type",
      file: entry.file,
      line: entry.line,
      members: [entry.name],
      port: entry.name,
      owner: owned?.owner ?? entry.door ?? "(no door)",
      ownerAt: owned?.ownerAt ?? entry.file,
      type: null,
      imports: [],
      exports,
      note,
    };
  });
}

/** Run the census over every package world in `root`, one program at a time. */
export function portCensus(root: string, log: (line: string) => void, distinct: DistinctRegistry = DISTINCT_LOOKALIKES): PortCensus {
  const collected: Collected = {
    pairs: new Map(),
    concepts: new Set(),
    homes: new Map(),
    links: new Links(),
    reads: new Map(),
    crossImports: new Map(),
    forgotten: new Map(),
    typedBy: new Map(),
    slices: new Map(),
  };
  const worlds: WorldCount[] = [];
  for (const config of packageWorlds(root)) {
    const before = collected.pairs.size;
    const program = createWorldProgram(root, config);
    const world: CensusWorld = { root, checker: program.getTypeChecker(), sources: librarySources(program, root) };
    const sources = program.getSourceFiles().filter((file) => !file.isDeclarationFile && isProduction(relative(root, file.fileName)));
    for (const source of sources) {
      collectFlows(root, program, source, collected);
      collectReads(world, source, collected);
    }
    // Reads first: a service import is planned against every op its domain reads, across all of that domain's files.
    for (const source of sources) {
      collectCrossImports(world, source, collected);
    }
    for (const entry of forgottenDoorExports({ program, root })) {
      collected.forgotten.set(`${entry.file}:${entry.line}`, entry);
    }
    worlds.push({ config, files: program.getSourceFiles().length, pairs: collected.pairs.size - before });
    log(`${config}: ${collected.pairs.size - before} new pairs`);
  }
  const pairs = [...collected.pairs.values()];
  // The member a value flows into: the restating side unless the restating member is the value's own source.
  const fed = new Set(pairs.map((pair) => (pair.source === pair.restating ? pair.owner : pair.restating)));
  const chains = chainsOf(pairs);
  const keys = [...new Set([...pairs.flatMap((pair) => [pair.restating, pair.owner]), ...collected.concepts])];
  const planned: PlannedTarget[] = [];
  for (const config of packageWorlds(root)) {
    const pkg = /^packages\/([^/]+)\//u.exec(config)?.[1] ?? "";
    const mine = keys.filter((key) => key.startsWith(`packages/${pkg}/`));
    if (mine.length === 0) {
      continue;
    }
    const program = createWorldProgram(root, config);
    const context: PlanContext = {
      world: { program, root },
      checker: program.getTypeChecker(),
      sources: librarySources(program, root),
      nodes: indexMembers(root, program),
      chains,
      pairs,
      graph: new ImportGraph(program, root),
      chooseOwner: ownerChooser(fed, collected.homes),
    };
    planned.push(
      ...mine.flatMap((key) => {
        const node = context.nodes.get(key);
        const target = node === undefined ? null : planMember(context, node);
        return target === null ? [] : [target];
      }),
    );
    log(`${config}: planned ${mine.length} members`);
  }
  // Two members typed by one alias plan one alias rewrite.
  const unique = [...new Map(planned.map((target) => [`${target.file}:${target.line}:${target.form}:${target.members.join(",")}`, target])).values()];
  const placed = collapse(unique).map(clustered);
  // An alias the plan already rewrites needs no forgotten-export target: its copy is the owner it derives from.
  const rewritten = new Set(placed.filter((target) => target.form === "type").map((target) => `${target.file}:${target.line}`));
  const judgments: Judgments = { links: collected.links, typedBy: collected.typedBy, slices: collected.slices, distinct };
  const forgotten = forgottenTargets(collected.forgotten.values(), judgments).filter((target) => !rewritten.has(`${target.file}:${target.line}`));
  const targets = [...placed, ...doorExportTargets(placed), ...[...collected.crossImports.values()].map(clustered), ...forgotten.map(clustered)];
  return { targets: targets.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line), worlds };
}
