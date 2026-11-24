// Optional fields supplied separately: two optional members of one home that production writes at separate constructions
// and never sets together may be alternative representations. A query over the reference graph: the fields are its
// optional member declarations, their writes its role sites, and the merged program answers what each construction is.
// - A construction is the object literal or JSX attributes a write's key sits in, followed out through spreads. Writes in
//   opposite arms of one conditional cannot coexist; two independently guarded spreads can both reach one object.
// - A spread, a computed key or a write the graph credits away from any literal leaves its production write unknown.
// - An inherited or mapped option belongs to the type expected at its construction, so those writes group by that
//   contextual type, never by the field declarations alone, which would mix unrelated derived types or instantiations.
// - A shape whose types already answer the question leaves the inventory: a union member its sibling arm forbids or
//   widens, a mapped copy no reader joins, and a Drizzle table's insert row or set value, which takes any column subset.
// - Production is product source and the plugin author and SDK sources the author programs hold: a bundle that sets
//   both fields cancels a pair. A world walked apart from the merged program has no parse here, so its constructions
//   are unknown.
import type {
  Expression,
  Identifier,
  JsxAttributes,
  Node,
  ObjectLiteralExpression,
  PropertyAccessExpression,
  PropertySignatureDeclaration,
  SourceFile,
} from "@typescript/native/ast";
import {
  isAsExpression,
  isBinaryExpression,
  isBindingElement,
  isComputedPropertyName,
  isConditionalExpression,
  isFunctionDeclaration,
  isIdentifier,
  isIfStatement,
  isInterfaceDeclaration,
  isJsxAttribute,
  isJsxAttributes,
  isJsxExpression,
  isJsxOpeningElement,
  isJsxSelfClosingElement,
  isJsxSpreadAttribute,
  isLiteralTypeNode,
  isMethodDeclaration,
  isMethodSignatureDeclaration,
  isObjectBindingPattern,
  isObjectLiteralExpression,
  isParameterDeclaration,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isPropertyDeclaration,
  isPropertySignatureDeclaration,
  isSatisfiesExpression,
  isSourceFile,
  isSpreadAssignment,
  isStringLiteral,
  isTypeAliasDeclaration,
  isTypeLiteralNode,
  isUnionTypeNode,
  isVariableDeclaration,
  SyntaxKind,
  skipTrivia,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Symbol as NativeSymbol, Type } from "@typescript/native/sync";
import { all, SymbolFlags, TypeFlags } from "@typescript/native/sync";
import { editorLineOf } from "../../floor/typescript/editor-lines.ts";
import type { Site } from "../classify.ts";
import { siteKey } from "../classify.ts";
import type { RowTable } from "../drizzle-rows.ts";
import { rowTables, rowTablesOf } from "../drizzle-rows.ts";
import type { NativeWorld } from "../native.ts";
import { constituents, declarationKeys, hasFlag, nameAt } from "../native.ts";
import type { PluginSources } from "../plugin-surface.ts";
import { isPluginProduction } from "../plugin-surface.ts";
import { isProduction as isAppSource } from "../worlds.ts";
import { nodeAt } from "./declared.ts";
import type { DeclKey } from "./resolve.ts";
import { declKeyParts, Resolver } from "./resolve.ts";
import type { GraphFacts } from "./state.ts";

/** A construction: where it starts, and the conditional arms that guard the write inside it. */
interface ConstructionSite extends Site {
  readonly branches: readonly Branch[];
}

interface Branch {
  readonly condition: number;
  readonly positive: boolean;
}

type Witness = Site | ConstructionSite | string;

interface OptionalPair {
  /** Index in optionalGroups. The group's id and these two field names identify a reviewed pair. */
  readonly group: number;
  readonly left: string;
  readonly right: string;
  /** Each evidence reference indexes optionalWitnessSets; its entries index optionalWitnesses. */
  readonly testCoSets: number;
  readonly possibleCoSets: number;
  readonly fallbackReaders: number;
  readonly jointDomReads: number;
}

interface OptionalGroup {
  readonly id: string;
  readonly file: string;
  readonly line: number;
  readonly owner: string;
  readonly unknownWrites: number;
  readonly fields: readonly {
    readonly name: string;
    readonly line: number;
    readonly writes: number;
    readonly testWrites: number;
    readonly unknownWrites: number;
  }[];
}

/** The pairs, their groups and the witnesses both index into. */
export interface OptionalInventory {
  readonly optionalGroups: readonly OptionalGroup[];
  readonly optionalAlternatives: readonly OptionalPair[];
  readonly optionalWitnesses: readonly Witness[];
  readonly optionalWitnessSets: readonly (readonly number[])[];
}

// Rows reference one witness inventory: repeating an owner's unknown writes per pair grows the JSON with pairs times
// constructions.
class OptionalEvidence {
  readonly groups: OptionalGroup[] = [];
  readonly pairs: OptionalPair[] = [];
  readonly #witnesses: Witness[] = [];
  readonly #sets: number[][] = [[]];
  readonly #witnessIds = new Map<string, number>();
  readonly #setIds = new Map<string, number>([["", 0]]);

  record(items: Iterable<Witness>): number {
    const ids = new Set<number>();
    for (const item of items) {
      ids.add(this.#witnessIds.getOrInsertComputed(JSON.stringify(item), () => this.#witnesses.push(item) - 1));
    }
    const members = [...ids].sort((left, right) => left - right);
    return this.#setIds.getOrInsertComputed(members.join(","), () => this.#sets.push(members) - 1);
  }

  inventory(): OptionalInventory {
    return { optionalGroups: this.groups, optionalAlternatives: this.pairs, optionalWitnesses: this.#witnesses, optionalWitnessSets: this.#sets };
  }
}

/** What one query reads: the graph, the merged program it was built from, and the plugin sources that count as
 *  production beside the product's own. */
interface Scope {
  readonly facts: GraphFacts;
  readonly world: NativeWorld;
  readonly plugins: PluginSources;
}

const production = (scope: Scope, file: string): boolean => isPluginProduction(file, scope.plugins);

const TEST_SOURCE = "tests/";

// --- Constructions ---------------------------------------------------------------------------------------------------

type Container = ObjectLiteralExpression | JsxAttributes;

const isContainer = (node: Node | undefined): node is Container => node !== undefined && (isObjectLiteralExpression(node) || isJsxAttributes(node));

function closedSpread(node: Expression): boolean {
  if (isObjectLiteralExpression(node)) {
    return !uncertainKeys(node);
  }
  if (isParenthesizedExpression(node) || isAsExpression(node) || isSatisfiesExpression(node)) {
    return closedSpread(node.expression);
  }
  if (isConditionalExpression(node)) {
    return closedSpread(node.whenTrue) && closedSpread(node.whenFalse);
  }
  return isBinaryExpression(node) && node.operatorToken.kind === SyntaxKind.AmpersandAmpersandToken && closedSpread(node.right);
}

function uncertainKeys(node: Container): boolean {
  return node.properties.some((prop) =>
    isSpreadAssignment(prop) || isJsxSpreadAttribute(prop) ? !closedSpread(prop.expression) : isComputedPropertyName(prop.name),
  );
}

function spreadBranch(source: SourceFile, node: Node, parent: Node): Branch | undefined {
  if (isConditionalExpression(parent) && (parent.whenTrue === node || parent.whenFalse === node)) {
    return { condition: parent.condition.getStart(source), positive: parent.whenTrue === node };
  }
  return isBinaryExpression(parent) && node === parent.right && parent.operatorToken.kind === SyntaxKind.AmpersandAmpersandToken
    ? { condition: parent.left.getStart(source), positive: true }
    : undefined;
}

interface Construction {
  readonly site: ConstructionSite;
  readonly uncertain: boolean;
}

// The object a write's key sits in, followed out through the spreads that carry it into an enclosing object.
function construction(world: NativeWorld, site: Site): Construction | undefined {
  const source = world.source(site.file);
  const start = source === undefined ? undefined : nameAt(source, site.position)?.parent.parent;
  if (source === undefined || !isContainer(start)) {
    return;
  }
  let owner = start;
  const branches: Branch[] = [];
  for (let node: Node = start; !isSourceFile(node); node = node.parent) {
    const parent = node.parent;
    const branch = spreadBranch(source, node, parent);
    if (branch !== undefined) {
      branches.push(branch);
    } else if (isSpreadAssignment(parent) || isJsxSpreadAttribute(parent)) {
      if (isContainer(parent.parent)) {
        owner = parent.parent;
        node = parent;
      }
    } else if (!(isParenthesizedExpression(parent) || isAsExpression(parent) || isSatisfiesExpression(parent))) {
      break;
    }
  }
  return { site: { file: site.file, position: owner.getStart(source), branches }, uncertain: uncertainKeys(owner) };
}

interface Writes {
  readonly sites: Map<string, ConstructionSite>;
  readonly unknown: Set<string>;
  readonly tests: Map<string, ConstructionSite>;
}

function writesOf(scope: Scope, sites: readonly Site[]): Writes {
  const built = new Map<string, ConstructionSite>();
  const tests = new Map<string, ConstructionSite>();
  const unknown = new Set<string>();
  for (const site of sites) {
    const evidence = construction(scope.world, site);
    const ours = production(scope, site.file);
    if (ours && (evidence === undefined || evidence.uncertain)) {
      unknown.add(siteKey(site));
    }
    if (evidence !== undefined && (ours || site.file.startsWith(TEST_SOURCE))) {
      (ours ? built : tests).set(siteKey(site), evidence.site);
    }
  }
  return { sites: built, tests, unknown };
}

function containsBranches(left: readonly Branch[], right: readonly Branch[]): boolean {
  return left.every((one) => right.some((two) => one.condition === two.condition && one.positive === two.positive));
}

// When one write's guards imply the other's, supplying the narrower field supplies both. Unrelated tests on nearby
// spreads might be correlated by a producer outside the expression.
function coSets(left: Iterable<ConstructionSite>, right: Iterable<ConstructionSite>): { proven: ConstructionSite[]; possible: ConstructionSite[] } {
  const byConstruction = Map.groupBy(right, siteKey);
  const proven: ConstructionSite[] = [];
  const possible: ConstructionSite[] = [];
  for (const one of left) {
    for (const two of byConstruction.get(siteKey(one)) ?? []) {
      if (containsBranches(one.branches, two.branches) || containsBranches(two.branches, one.branches)) {
        proven.push(one);
      } else if (!one.branches.some((a) => two.branches.some((b) => a.condition === b.condition && a.positive !== b.positive))) {
        possible.push(one);
      }
    }
  }
  return { proven, possible };
}

// --- Fields ----------------------------------------------------------------------------------------------------------

interface Field {
  readonly keys: readonly DeclKey[];
  readonly member: string;
  readonly site: Site;
  readonly line: number;
  readonly home: string;
}

function enclosingName(node: Node): string {
  for (let at = node; at.kind !== SyntaxKind.SourceFile; at = at.parent) {
    if (
      isTypeAliasDeclaration(at) ||
      isFunctionDeclaration(at) ||
      isMethodDeclaration(at) ||
      isParameterDeclaration(at) ||
      isVariableDeclaration(at) ||
      isInterfaceDeclaration(at) ||
      isPropertySignatureDeclaration(at)
    ) {
      return at.name?.getText() ?? "<anonymous>";
    }
  }
  return "<anonymous>";
}

const FIELD_KINDS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.PropertySignature,
  SyntaxKind.MethodSignature,
  SyntaxKind.PropertyDeclaration,
  SyntaxKind.PropertyAssignment,
]);

// A member typed `never` or `undefined` forbids a value.
const forbids = (type: Node): boolean => type.kind === SyntaxKind.NeverKeyword || type.kind === SyntaxKind.UndefinedKeyword;

// A member typed one literal, or literals beside `undefined` (`false | undefined`), pins its arm.
const pins = (type: Node): boolean =>
  isLiteralTypeNode(type) || (isUnionTypeNode(type) && type.types.every((part) => isLiteralTypeNode(part) || forbids(part)));

// A member a sibling arm of its union forbids, or one this arm pins that a sibling arm also declares, is already the
// union's discriminant: the union refuses setting it beside the other arm's fields.
function unionRuled(member: PropertySignatureDeclaration, name: string): boolean {
  const arm = member.parent;
  const union = isTypeLiteralNode(arm) ? arm.parent : undefined;
  if (union === undefined || !isUnionTypeNode(union)) {
    return false;
  }
  const pinned = pins(member.type);
  return union.types.some(
    (other) =>
      other !== arm &&
      isTypeLiteralNode(other) &&
      other.members.some(
        (sibling) =>
          isPropertySignatureDeclaration(sibling) &&
          (isIdentifier(sibling.name) || isStringLiteral(sibling.name)) &&
          sibling.name.text === name &&
          (pinned || forbids(sibling.type)),
      ),
  );
}

// Each production optional member and its declaring home's start, the group key; a member typed `never` or `undefined` is
// an exclusion marker no construction may set, and a member its union already rules on leaves the pairing.
function declaredFields(scope: Scope): ReadonlyMap<string, Field[]> {
  const owners = new Map<string, Field[]>();
  for (const [key, info] of scope.facts.decls) {
    const parts = declKeyParts(key);
    const source = info.optional && FIELD_KINDS.has(parts.kind) && production(scope, info.file) ? scope.world.source(info.file) : undefined;
    const node = source === undefined ? undefined : nodeAt(source, parts);
    if (
      source === undefined ||
      node === undefined ||
      !(isPropertySignatureDeclaration(node) || isMethodSignatureDeclaration(node) || isPropertyDeclaration(node) || isPropertyAssignment(node)) ||
      !(isIdentifier(node.name) || isStringLiteral(node.name)) ||
      (isPropertySignatureDeclaration(node) && (forbids(node.type) || unionRuled(node, node.name.text)))
    ) {
      continue;
    }
    const position = node.name.getStart(source);
    const owner = siteKey({ file: info.file, position: node.parent.getStart(source) });
    owners
      .getOrInsert(owner, [])
      .push({ keys: [key], member: node.name.text, site: { file: info.file, position }, line: info.line, home: enclosingName(node.parent) });
  }
  return owners;
}

// A role site is a name's full start, its leading trivia included; a site here is where the name itself starts. A
// plugin write sits outside the graph's population, so it comes from the plugin constructions instead.
const writeSites = (scope: Scope, keys: readonly DeclKey[], plugin: ReadonlyMap<DeclKey, readonly Site[]>): readonly Site[] =>
  keys.flatMap((key) => [
    ...(scope.facts.roleSites.get(key) ?? []).flatMap(({ role, file, at }) => {
      const text = scope.world.source(file)?.text;
      return role === "write" ? [{ file, position: text === undefined ? at : skipTrivia(text, at) }] : [];
    }),
    ...(plugin.get(key) ?? []),
  ]);

// The member each key of a plugin construction writes: the graph walks only knip's project files, so a bundle's
// literals are read here, their contextual types and the members they name each one batch.
function pluginWrites(scope: Scope, resolver: Resolver, containers: readonly Container[]): ReadonlyMap<DeclKey, readonly Site[]> {
  const { world } = scope;
  const contextual = world.contextualTypes(containers);
  const named = containers.flatMap((literal, at) => {
    const type = contextual[at];
    return type === undefined ? [] : namesOf(literal).map((entry) => ({ ...entry, type }));
  });
  const members = world.batch(named.map(({ type, name }) => world.checker.getPropertyOfType.gen(type, name)));
  const found = named.flatMap((entry, at) => {
    const member = members[at];
    return member === undefined ? [] : [{ site: world.siteOf(entry.node), member }];
  });
  const keys = resolver.declarations(found.map(({ member }) => member));
  const out = new Map<DeclKey, Site[]>();
  for (const [at, { site }] of found.entries()) {
    for (const key of keys[at] ?? []) {
      out.getOrInsert(key, []).push(site);
    }
  }
  return out;
}

// --- Contexts --------------------------------------------------------------------------------------------------------

interface ContextIdentity {
  readonly id: string;
  readonly optionalNames: ReadonlySet<string>;
  readonly owner: string;
  readonly site: Site | undefined;
  readonly specialized: boolean;
  readonly mapped: boolean;
}

// A context is a type of the one program, so its id is the type's own: two constructions typed alike share it.
function* contextIdentity(scope: Scope, type: Type): APIRequestGenerator<ContextIdentity | undefined> {
  const { world } = scope;
  const [alias, symbol] = yield* all(type.getAliasSymbol.gen(), type.getSymbol.gen());
  const handle = (alias ?? symbol)?.declarations[0];
  const declaration = handle === undefined ? undefined : yield* handle.resolve.gen();
  const inherited = declaration !== undefined && isInterfaceDeclaration(declaration) && (declaration.heritageClauses?.length ?? 0) > 0;
  const generic = alias !== undefined && (yield* type.getAliasTypeArguments.gen()).length > 0;
  if (!(inherited || generic || type.isMappedType() || type.isIntersectionType())) {
    return;
  }
  const properties = yield* world.checker.getPropertiesOfType.gen(type);
  const ours = handle !== undefined && production(scope, world.fileOf(handle) ?? "");
  return {
    id: String(type.id),
    optionalNames: new Set(properties.filter((prop) => hasFlag(prop.flags, SymbolFlags.Optional)).map((prop) => prop.name)),
    owner: yield* world.checker.typeToString.gen(type),
    site: declaration === undefined || !ours ? undefined : world.siteOf(declaration),
    specialized: type.isMappedType() || (generic && ours),
    mapped: type.isMappedType(),
  };
}

interface ContextWrite {
  readonly id: string;
  readonly owner: string;
  readonly site: Site;
  readonly field: string;
  readonly prop: NativeSymbol;
  readonly parent: string | null;
  readonly writer: Site;
}

function* contextWrite(
  scope: Scope,
  type: Type,
  context: ContextIdentity,
  { node, name: field }: { readonly node: Node; readonly name: string },
): APIRequestGenerator<ContextWrite | undefined> {
  const { world } = scope;
  if (!context.optionalNames.has(field)) {
    return;
  }
  const prop = yield* world.checker.getPropertyOfType.gen(type, field);
  if (prop === undefined || !hasFlag(prop.flags, SymbolFlags.Optional)) {
    return;
  }
  const value = yield* world.checker.getTypeOfPropertyOfType.gen(type, field);
  if (value === undefined || (yield* constituents(value)).every((part) => hasFlag(part.flags, TypeFlags.Undefined) || hasFlag(part.flags, TypeFlags.Never))) {
    return;
  }
  const handle = prop.declarations.find((origin) => production(scope, world.fileOf(origin) ?? ""));
  if (handle === undefined && context.site === undefined && prop.declarations.length > 0) {
    return;
  }
  const decl = handle === undefined ? undefined : yield* handle.resolve.gen();
  const site = context.site ?? (decl === undefined ? world.siteOf(node) : world.siteOf(decl));
  const original =
    decl !== undefined &&
    (isPropertySignatureDeclaration(decl) || isMethodSignatureDeclaration(decl) || isPropertyDeclaration(decl)) &&
    decl.postfixToken?.kind === SyntaxKind.QuestionToken;
  const parent = original && !context.specialized ? `${decl.parent.getSourceFile().path}#${decl.parent.pos}` : null;
  return { id: context.id, owner: context.owner, site, field, prop, parent, writer: world.siteOf(node) };
}

function namesOf(literal: Container): { readonly name: string; readonly node: Node }[] {
  return literal.properties.flatMap((property) => {
    if (isSpreadAssignment(property) || isJsxSpreadAttribute(property)) {
      return [];
    }
    const name = property.name;
    return isIdentifier(name) || isStringLiteral(name) ? [{ name: name.text, node: name }] : [];
  });
}

interface Contexts {
  readonly identities: ReadonlyMap<string, ContextIdentity>;
  readonly writes: readonly (ContextWrite & { readonly keys: readonly DeclKey[] })[];
  readonly unknown: readonly { readonly id: string; readonly site: Site }[];
}

// Every construction's contextual type, its arms and their identities, then each optional key it writes: one batch per
// step across every construction, never a round trip per literal.
function contextWrites(scope: Scope, resolver: Resolver, containers: readonly Container[]): Contexts {
  const { world } = scope;
  const contextual = world.contextualTypes(containers);
  const arms = world.batch(
    contextual.map(function* (type): APIRequestGenerator<readonly Type[]> {
      return type === undefined ? [] : yield* constituents(yield* world.checker.getNonNullableType.gen(type));
    }),
  );
  const types = new Map(arms.flat().map((type) => [type.id, type]));
  const described = world.batch([...types.values()].map((type) => contextIdentity(scope, type)));
  // A Drizzle table's insert row or set value takes any subset of the table's columns, so it is never a context.
  rowTables(world);
  const tables = world.batch(
    [...types.values()].map(function* (type, at): APIRequestGenerator<readonly RowTable[]> {
      return described[at] === undefined ? [] : yield* rowTablesOf(world, type);
    }),
  );
  const identities = new Map([...types.keys()].map((id, at) => [id, (tables[at] ?? []).length > 0 ? undefined : described[at]]));
  const requests: APIRequestGenerator<ContextWrite | undefined>[] = [];
  const unknown: { id: string; site: Site }[] = [];
  for (const [at, literal] of containers.entries()) {
    const held = arms[at] ?? [];
    const spread = literal.properties.some((field) => isSpreadAssignment(field) || isJsxSpreadAttribute(field));
    for (const type of held) {
      const context = identities.get(type.id);
      if (context === undefined) {
        continue;
      }
      if (spread || held.length !== 1) {
        unknown.push({ id: context.id, site: world.siteOf(literal) });
      }
      if (held.length === 1) {
        requests.push(...namesOf(literal).map((named) => contextWrite(scope, type, context, named)));
      }
    }
  }
  const writes = world.batch(requests).filter((entry) => entry !== undefined);
  const keys = resolver.declarations(writes.map(({ prop }) => prop));
  return {
    identities: new Map([...identities.values()].flatMap((context) => (context === undefined ? [] : [[context.id, context]]))),
    writes: writes.map((entry, at) => ({ ...entry, keys: keys[at] ?? [] })),
    unknown,
  };
}

// --- Readers ---------------------------------------------------------------------------------------------------------

/** A fallback (`a ?? b`, an else-if over presence) or a DOM element reading two values at once. */
interface ReaderEvidence {
  readonly kind: "fallback" | "dom";
  readonly context: string | undefined;
  readonly site: Site;
  readonly left: readonly DeclKey[];
  readonly right: readonly DeclKey[];
}

interface ReadGroup {
  readonly kind: ReaderEvidence["kind"];
  readonly node: Node;
  readonly values: readonly Node[];
}

const operand = (node: Node | undefined): node is Identifier | PropertyAccessExpression =>
  node !== undefined && (isIdentifier(node) || isPropertyAccessExpression(node));
const nullish = (node: Node): boolean => node.kind === SyntaxKind.NullKeyword || (isIdentifier(node) && node.text === "undefined");

function presence(node: Node): Node | undefined {
  if (operand(node)) {
    return node;
  }
  if (!isBinaryExpression(node) || node.operatorToken.kind !== SyntaxKind.ExclamationEqualsEqualsToken) {
    return;
  }
  return nullish(node.right) && operand(node.left) ? node.left : undefined;
}

function readGroup(node: Node): ReadGroup | undefined {
  if (
    isBinaryExpression(node) &&
    (node.operatorToken.kind === SyntaxKind.QuestionQuestionToken || node.operatorToken.kind === SyntaxKind.BarBarToken) &&
    operand(node.left) &&
    operand(node.right)
  ) {
    return { kind: "fallback", node, values: [node.left, node.right] };
  }
  if (isIfStatement(node) && node.elseStatement !== undefined && isIfStatement(node.elseStatement)) {
    const left = presence(node.expression);
    const right = presence(node.elseStatement.expression);
    if (left !== undefined && right !== undefined) {
      return { kind: "fallback", node, values: [left, right] };
    }
  }
  if (
    !(
      isJsxAttributes(node) &&
      (isJsxOpeningElement(node.parent) || isJsxSelfClosingElement(node.parent)) &&
      isIdentifier(node.parent.tagName) &&
      /^[a-z]/u.test(node.parent.tagName.text)
    )
  ) {
    return;
  }
  const values = node.properties.flatMap((prop) => {
    const init = isJsxAttribute(prop) ? prop.initializer : undefined;
    return init !== undefined && isJsxExpression(init) && operand(init.expression) ? [init.expression] : [];
  });
  return values.length > 1 ? { kind: "dom", node, values } : undefined;
}

interface Reader {
  readonly source: string;
  readonly context: string | undefined;
  readonly keys: readonly DeclKey[];
}

// What each read value reads: `receiver.member` by the receiver's declaration and the member's, a destructured binding
// by its pattern and the members of the pattern's type with its key's name. Each step is one batch over every value.
function readersOf(scope: Scope, resolver: Resolver, values: readonly Node[]): ReadonlyMap<Node, Reader> {
  const { world } = scope;
  const readers = new Map<Node, Reader>();
  const accesses = values.flatMap((node) => (isPropertyAccessExpression(node) && isIdentifier(node.expression) ? [node] : []));
  const receivers = world.symbolsAt(accesses.map(({ expression }) => expression));
  const members = world.symbolsAt(accesses.map(({ name }) => name));
  const receiverTypes = world.typesAt(accesses.map(({ expression }) => expression));
  const memberKeys = resolver.declarations(members);
  const names = values.filter(isIdentifier);
  const bound = world.symbolsAt(names);
  const bindings = world.batch(
    bound.map(function* (symbol): APIRequestGenerator<Node | undefined> {
      const handle = symbol?.declarations[0];
      return handle === undefined ? undefined : yield* handle.resolve.gen();
    }),
  );
  const patterns = names.flatMap((name, at) => {
    const binding = bindings[at];
    const key =
      binding !== undefined && isBindingElement(binding) && isObjectBindingPattern(binding.parent) ? (binding.propertyName ?? binding.name) : undefined;
    return binding === undefined || key === undefined ? [] : [{ name, pattern: binding.parent, key: key.getText() }];
  });
  const owners = world.typesAt(patterns.map(({ pattern }) => pattern));
  const named = world.batch(owners.map((owner, at) => world.checker.getPropertyOfType.gen(owner, patterns[at]?.key ?? "")));
  const namedKeys = resolver.declarations(named);
  const contexts = world.batch([...receiverTypes, ...owners].map((type) => contextIdentity(scope, type)));
  for (const [at, access] of accesses.entries()) {
    const receiver = receivers[at];
    const key = receiver === undefined ? undefined : declarationKeys(receiver)[0];
    if (key !== undefined && members[at] !== undefined) {
      readers.set(access, { source: key, context: contexts[at]?.id, keys: memberKeys[at] ?? [] });
    }
  }
  for (const [at, { name, pattern }] of patterns.entries()) {
    readers.set(name, { source: siteKey(world.siteOf(pattern)), context: contexts[accesses.length + at]?.id, keys: namedKeys[at] ?? [] });
  }
  return readers;
}

function readerEvidence(scope: Scope, resolver: Resolver, groups: readonly ReadGroup[]): readonly ReaderEvidence[] {
  const readers = readersOf(scope, resolver, [...new Set(groups.flatMap((group) => group.values))]);
  return groups.flatMap(({ kind, node, values }) =>
    values.flatMap((name, at) => {
      const left = readers.get(name);
      if (left === undefined) {
        return [];
      }
      return values.slice(at + 1).flatMap((other) => {
        const right = readers.get(other);
        return right === undefined || right.source !== left.source
          ? []
          : [{ kind, site: scope.world.siteOf(node), context: left.context, left: left.keys, right: right.keys }];
      });
    }),
  );
}

// --- Pairs -----------------------------------------------------------------------------------------------------------

interface ObservedField {
  readonly field: Field;
  readonly writes: Writes;
  readonly parent?: string | null;
}

interface GroupSource {
  readonly id: string;
  readonly context?: string;
  readonly unknown?: readonly Site[];
  /** A mapped copy (`Partial`, `Pick`, `Record`) takes any subset of what it maps, so separate writes alone prove no
   *  alternative: only a reader that takes one field or the other lists its pair. */
  readonly readerOnly?: boolean;
}

// The readers in the group's context that read both fields.
const jointReaders = (field: Field, sibling: Field, readers: ReadonlyMap<DeclKey, ReaderEvidence[]>, context: string | undefined): ReaderEvidence[] =>
  field.keys
    .flatMap((key) => readers.get(key) ?? [])
    .filter((reader) => context === undefined || reader.context === context)
    .filter((reader) => reader.left.some((key) => sibling.keys.includes(key)) || reader.right.some((key) => sibling.keys.includes(key)));

function alternatives(fields: readonly ObservedField[], readers: ReadonlyMap<DeclKey, ReaderEvidence[]>, group: GroupSource, output: OptionalEvidence): void {
  const before = output.pairs.length;
  const index = output.groups.length;
  for (const [at, { field, writes, parent }] of fields.entries()) {
    for (const sibling of fields.slice(at + 1)) {
      if (parent !== undefined && parent !== null && parent === sibling.parent) {
        continue;
      }
      const overlap = coSets(writes.sites.values(), sibling.writes.sites.values());
      const evidence = jointReaders(field, sibling.field, readers, group.context);
      if (overlap.proven.length > 0 || (group.readerOnly === true && evidence.length === 0)) {
        continue;
      }
      output.pairs.push({
        group: index,
        left: field.member,
        right: sibling.field.member,
        testCoSets: output.record(coSets(writes.tests.values(), sibling.writes.tests.values()).proven),
        possibleCoSets: output.record(overlap.possible),
        fallbackReaders: output.record(evidence.filter((reader) => reader.kind === "fallback").map((reader) => reader.site)),
        jointDomReads: output.record(evidence.filter((reader) => reader.kind === "dom").map((reader) => reader.site)),
      });
    }
  }
  const first = fields[0]?.field;
  if (output.pairs.length > before && first !== undefined) {
    output.groups.push({
      id: group.id,
      file: first.site.file,
      line: first.line,
      owner: first.home,
      unknownWrites: output.record(group.unknown ?? []),
      fields: fields.map(({ field, writes }) => ({
        name: field.member,
        line: field.line,
        writes: output.record(writes.sites.values()),
        testWrites: output.record(writes.tests.values()),
        unknownWrites: output.record(writes.unknown),
      })),
    });
  }
}

const lineOf = (world: NativeWorld, site: Site): number => {
  const source = world.source(site.file);
  return source === undefined ? 1 : editorLineOf(source, site.position);
};

function contextualAlternatives(scope: Scope, contexts: Contexts, readers: ReadonlyMap<DeclKey, ReaderEvidence[]>, output: OptionalEvidence): void {
  const unknown = Map.groupBy(contexts.unknown, (entry) => entry.id);
  for (const [id, observations] of Map.groupBy(contexts.writes, (entry) => entry.id)) {
    const allowed = contexts.identities.get(id)?.optionalNames ?? new Set<string>();
    if (!observations.every((observation) => allowed.has(observation.field))) {
      throw new Error(`Inconsistent contextual field group: ${id}`);
    }
    const fields = [...Map.groupBy(observations, (entry) => entry.field)].flatMap(([name, entries]): ObservedField[] => {
      const [first] = entries;
      const writes = writesOf(
        scope,
        entries.map((entry) => entry.writer),
      );
      if (first === undefined || writes.sites.size === 0) {
        return [];
      }
      const keys = [...new Set(entries.flatMap((entry) => entry.keys))];
      return [{ field: { keys, home: first.owner, member: name, site: first.site, line: lineOf(scope.world, first.site) }, writes, parent: first.parent }];
    });
    const representative = observations
      .filter((entry) => production(scope, entry.writer.file))
      .sort((a, b) => a.writer.file.localeCompare(b.writer.file) || a.writer.position - b.writer.position)[0];
    if (representative !== undefined) {
      const uncertain = (unknown.get(id) ?? []).map((entry) => entry.site);
      const readerOnly = contexts.identities.get(id)?.mapped === true;
      alternatives(fields, readers, { id: `context:${siteKey(representative.writer)}`, context: id, unknown: uncertain, readerOnly }, output);
    }
  }
}

/** The optional-pair inventory of a built graph over the merged program it was built from. */
export function optionalPairsOf(facts: GraphFacts, world: NativeWorld, plugins: PluginSources): OptionalInventory {
  const scope: Scope = { facts, world, plugins };
  const resolver = new Resolver(world);
  const containers: Container[] = [];
  const pluginContainers: Container[] = [];
  const groups: ReadGroup[] = [];
  for (const source of world.files) {
    const file = world.fileOfSource(source);
    const ours = production(scope, file);
    const plugin = ours && !isAppSource(file);
    const visit = (node: Node): void => {
      if (isObjectLiteralExpression(node) || isJsxAttributes(node)) {
        containers.push(node);
        if (plugin) {
          pluginContainers.push(node);
        }
      }
      const group = ours ? readGroup(node) : undefined;
      if (group !== undefined) {
        groups.push(group);
      }
      node.forEachChild(visit);
    };
    source.forEachChild(visit);
  }
  const readers = new Map<DeclKey, ReaderEvidence[]>();
  for (const reader of readerEvidence(scope, resolver, groups)) {
    for (const key of [...reader.left, ...reader.right]) {
      readers.getOrInsert(key, []).push(reader);
    }
  }
  const plugin = pluginWrites(scope, resolver, pluginContainers);
  const output = new OptionalEvidence();
  for (const [owner, fields] of declaredFields(scope)) {
    const observed = fields.flatMap((field) => {
      const writes = writesOf(scope, writeSites(scope, field.keys, plugin));
      return writes.sites.size > 0 ? [{ field, writes }] : [];
    });
    alternatives(observed, readers, { id: `declaration:${owner}` }, output);
  }
  contextualAlternatives(scope, contextWrites(scope, resolver, containers), readers, output);
  return output.inventory();
}
