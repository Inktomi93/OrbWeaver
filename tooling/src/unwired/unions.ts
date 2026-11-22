// `pnpm unwired unions`: members of `as const` string tuples that no production literal builds into a slot of their
// type, with the `case` branches, equality checks and `Record` keys that test or key them. A tuple production
// enumerates (maps, spreads, indexes, hands on) can build any member, so it is listed and never judged.
import type { Expression, Identifier, Node, ObjectLiteralExpression, StringLiteral } from "@typescript/native/ast";
import {
  isArrayLiteralExpression,
  isBinaryExpression,
  isCaseBlock,
  isCaseClause,
  isComputedPropertyName,
  isElementAccessExpression,
  isIdentifier,
  isMethodDeclaration,
  isObjectLiteralExpression,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isSatisfiesExpression,
  isShorthandPropertyAssignment,
  isStringLiteral,
  isSwitchStatement,
  isTypePredicateNode,
  isTypeReferenceNode,
  isVariableDeclaration,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Type } from "@typescript/native/sync";
import ts from "typescript";
import type { LiteralRole, Site, ValueUse } from "./classify.ts";
import { isProductionFile, literalRoleAt, Sources, siteKey, valueUseAt } from "./classify.ts";
import type { JudgedSplit } from "./judged.ts";
import { sortJudged } from "./judged.ts";
import { ServiceWorld, serviceReferences } from "./language-service.ts";
import type { WorldFiles } from "./native.ts";
import { constituents, declarationKeys, homeFiles, NativeWorld } from "./native.ts";
import { valueIndex } from "./occurrences.ts";
import type { ScanOptions } from "./scan.ts";
import { scanWorlds, sitesOf, sortDeliberate } from "./scan.ts";
import { isNativeConstAssertion, nativeOracle, serviceOracle } from "./union-oracles.ts";
import type { Origins, SlotOracle, Spelled } from "./union-origins.ts";
import {
  constantDepth,
  declaredSites,
  isKeyTypeName,
  keyListTuples,
  predicateTuples,
  respelledProperty,
  satisfiedOrigins,
  settled,
  slotOrigins,
  subjectOrigins,
  switchPassThroughs,
  valueSlotOrigins,
} from "./union-origins.ts";
import { isProduction } from "./worlds.ts";

const UNION_KINDS = ["unbuilt", "parsed"] as const;
/** `unbuilt`: no production literal builds the member into a slot of its union. `parsed`: no production literal
 *  builds it either, but production narrows outside input into its tuple with `z.enum`, a membership test or a type
 *  guard, so a model's structured output, a file, an env var or a platform name can still produce it. */
type UnionKind = (typeof UNION_KINDS)[number];

/** How production narrows outside input into a tuple. */
const NARROWINGS = ["z.enum", "membership test", "type guard"] as const;
type Narrowing = (typeof NARROWINGS)[number];

const GUARD_NARROWING = "type guard" satisfies Narrowing;

const NARROWING_OF_USE = { parse: "z.enum", test: "membership test" } as const satisfies Record<"parse" | "test", Narrowing>;

interface UnwiredUnionMember {
  readonly key: string;
  readonly kind: UnionKind;
  readonly file: string;
  readonly line: number;
  /** The tuple. */
  readonly home: string;
  /** The member's text. */
  readonly member: string;
  /** `case` clauses that branch on the member, `file:line`. */
  readonly cases: readonly string[];
  /** Equality and membership checks against the member. */
  readonly checks: readonly string[];
  /** Keys of `Record`-typed object literals the member names. */
  readonly keys: readonly string[];
}

/** A parsed member, with each site that narrows outside input into its tuple or a tuple it is a subset of. */
interface ParsedUnionMember extends UnwiredUnionMember {
  /** `<narrowing> file:line`: the place outside input enters the vocabulary. */
  readonly sources: readonly string[];
}

export interface UnionsReport {
  readonly scanned: number;
  /** Tuples production enumerates, so no member is judged. */
  readonly enumerated: readonly string[];
  /** Tuples a lib key selection names (`Omit<Props, (typeof KEYS)[number]>`): their members are property keys of a
   *  type, never values, so none is judged. */
  readonly keyLists: readonly string[];
  /** Each tuple written `as const satisfies readonly P[]` with the tuples `P` derives from; its members are judged as theirs. */
  readonly subsets: Readonly<Record<string, readonly string[]>>;
  /** Unbuilt members: no production literal builds them and no outside input is parsed into their tuple. */
  readonly unwired: readonly UnwiredUnionMember[];
  /** Members only outside input produces, each with the sites that parse the input in. Reported, never judged dead. */
  readonly parsed: readonly ParsedUnionMember[];
  readonly deliberate: readonly (UnwiredUnionMember & { readonly reason: string })[];
  /** Rows a board item owns, with the item. */
  readonly judged: JudgedSplit<UnwiredUnionMember>["judged"];
  /** Judged entries whose row no longer reports or whose item is no longer open. */
  readonly staleJudged: JudgedSplit<UnwiredUnionMember>["staleJudged"];
  /** Members engine one found unbuilt that engine two finds built, or whose tuple engine two finds enumerated. */
  readonly disagreements: readonly string[];
  readonly limits: readonly string[];
}

/** What the unions scan cannot see, printed with every run. */
const UNION_LIMITS: readonly string[] = [
  "A tuple with any element whose type is not one string literal (a spread, a `string`, a union) is skipped whole, so none of its members is judged. An element read from a constant (`CODE.x`) is the member its type names.",
  'A member is built by a literal in its slot, or by a module-private unannotated constant the slot reads: the whole constant, its property (`ROOT.carriers`) or a spread of its object (`{ ...ROOT }`). An exported constant read into a slot (`take(CODE.x)`) builds nothing, nor does a literal in an inline `as const` array production maps (`(["main", "ui"] as const).map(...)`).',
  "A literal builds a member in a slot spelled from the tuple, or in a literal type linked to it: written by the type the tuple `satisfies`, or annotating a property whose value production feeds into the tuple's slot (an argument, a property, a return or an element-access key). A literal type with no such link (a discriminated union arm, a hand-written union, a conditional type's arm) builds nothing, so a member production builds only there reports unbuilt.",
  "A narrowed value handed on builds the labels that narrow it only in a `switch` on a name or a member access read again in the clause, and only for a label production builds in the switched value's own vocabulary; an `if` narrowing builds nothing.",
  "A read by name (`POSTURES.arbiter`) of an entry of an `as const satisfies Record<Tuple, …>` literal builds the member its key names; a read of a `Record` annotated with a type, or through a computed key, builds nothing.",
  "Two tuples with the same members in different files are separate vocabularies; a member built into one's slots does not build the other's, and a value typed by one that production hands into the other's slot builds nothing there.",
  "A call that infers its own type parameter from a literal types the slot by the literal alone, so the slot is read from the declared parameter with that type parameter at its constraint: an object literal's property through the constraint's property, and a callback's returned value through the call's own slot when the callee returns the type parameter or a list of it. A constraint with no literal type (`<N extends string>(name: N)`) builds nothing.",
  'A literal whose declared slot is still a type parameter (`Object.freeze({ source: "checkout" })`, a generic row helper) holds nothing, so it builds nothing.',
  "A member built only from a computed string (a template, a concatenation, a lookup by string key), from a JSON or scenario file, or outside the tree (a plugin guest, the model) is not built; a tuple production parses outside input into, with `z.enum`, a membership test or a type guard on a `string` or `unknown` parameter, is reported apart as parsed, with the sites that parse the input in.",
  "A tuple reached through a re-export or a wrapper keeps its references; a reference that hands the tuple on (a spread, a map, an index) enumerates it, and an enumerated tuple is listed, never judged. An enumerated subset builds each of its members in the tuples it is a subset of.",
  "A tuple a lib key selection names (`Pick<T, K>`, `Omit<T, K>`, `Exclude<keyof T, K>`, `Extract<keyof T, K>`) is a key list: listed, never judged, so a stale key the type no longer has is not reported.",
  "Only package worlds are scanned; a test literal never builds a member, and a file no package world compiles (a package-root build script such as `packages/ui/tokens.build.ts`) is not read, so a tuple only such a file enumerates reports its members.",
];

interface Member {
  readonly text: string;
  readonly site: Site;
  readonly line: number;
}

/** An `as const` string tuple, keyed `file:NAME`, with the declaration keys its references resolve to. */
export interface Tuple {
  readonly key: string;
  readonly site: Site;
  readonly name: string;
  readonly keys: readonly string[];
  readonly members: readonly Member[];
}

/** A literal or object key carrying a member's text, whether the type it lands in holds that member, and the tuples
 *  that type is spelled from. */
export interface LiteralSite {
  readonly site: Site;
  readonly text: string;
  readonly role: LiteralRole | "record-key";
  readonly holds: boolean;
  readonly origins: Origins;
}

const NOTHING_SPELLED: Spelled = { tuples: new Set(), literals: new Map() };

interface Construction {
  readonly text: string;
  readonly origins: Origins;
}

// Where each text is built: the tuples the slots of its constructing literals are spelled from.
type Built = ReadonlyMap<string, readonly Origins[]>;

function builtInto(constructions: Iterable<Construction>): Built {
  const built = new Map<string, Origins[]>();
  for (const { text, origins } of constructions) {
    built.set(text, [...(built.get(text) ?? []), origins]);
  }
  return built;
}

// A member's vocabulary: `lineage` is its tuple and the tuples that tuple is a subset of, since a member built into the
// parent's vocabulary is the subset's member built; `respelled` holds the literal types linked to them that re-spell it.
interface Vocabulary {
  readonly lineage: readonly string[];
  readonly respelled: ReadonlySet<string>;
}

// A slot whose declaration cannot be read may be any tuple's, so it rules none out.
const belongsTo = (origins: Origins, vocabulary: Vocabulary): boolean =>
  origins === null || vocabulary.lineage.some((key) => origins.tuples.has(key)) || [...origins.literals.keys()].some((key) => vocabulary.respelled.has(key));

const buildsMember = (built: Built, vocabulary: Vocabulary, text: string): boolean => (built.get(text) ?? []).some((origins) => belongsTo(origins, vocabulary));

const lineOf = (node: Node): number => node.getSourceFile().getLineAndCharacterOfPosition(node.getStart(node.getSourceFile())).line + 1;

function unwrap(node: Expression): Expression {
  let current = node;
  while (isParenthesizedExpression(current) || isSatisfiesExpression(current)) {
    current = current.expression;
  }
  return current;
}

interface ConstArray {
  readonly name: Identifier;
  readonly elements: readonly Expression[];
}

// `const NAME = [...] as const` with at least one element.
function constArrayOf(node: Node): ConstArray | null {
  if (!(isVariableDeclaration(node) && isIdentifier(node.name) && node.initializer !== undefined)) {
    return null;
  }
  const value = unwrap(node.initializer);
  const array = isNativeConstAssertion(value) ? unwrap(value.expression) : null;
  if (array === null || !isArrayLiteralExpression(array) || array.elements.length === 0) {
    return null;
  }
  return { name: node.name, elements: [...array.elements] };
}

interface NamedElement {
  readonly element: Expression;
  readonly text: string;
}

// The arrays whose every element names a member, with each element's text. A string literal is its own text; any other
// element (`CODE.x`, a named constant) is the string literal its type is, asked of the checker in one batch for the world.
function stringTuples(world: NativeWorld, arrays: readonly ConstArray[]): readonly { readonly name: Identifier; readonly named: readonly NamedElement[] }[] {
  const asked = arrays.flatMap(({ elements }) => elements.filter((element) => !isStringLiteral(element)));
  const types = world.typesAt(asked);
  const typed = new Map<Expression, string>();
  for (const [at, element] of asked.entries()) {
    const type = types[at];
    if (type?.isStringLiteralType() === true) {
      typed.set(element, type.value);
    }
  }
  return arrays.flatMap(({ name, elements }) => {
    const named = elements.flatMap((element): NamedElement[] => {
      const text = isStringLiteral(element) ? element.text : typed.get(element);
      return text === undefined ? [] : [{ element, text }];
    });
    return named.length === elements.length ? [{ name, named }] : [];
  });
}

function eachProductionNode(world: NativeWorld, visit: (node: Node) => void): void {
  const step = (node: Node): void => {
    visit(node);
    node.forEachChild(step);
  };
  for (const file of world.files.filter((source) => isProduction(world.siteOf(source).file))) {
    file.forEachChild(step);
  }
}

function tuples(world: NativeWorld): readonly Tuple[] {
  const arrays: ConstArray[] = [];
  eachProductionNode(world, (node) => {
    const array = constArrayOf(node);
    if (array !== null) {
      arrays.push(array);
    }
  });
  const found = stringTuples(world, arrays);
  const symbols = world.symbolsAt(found.map(({ name }) => name));
  return found.map(({ name, named }, index) => {
    const site = world.siteOf(name);
    const symbol = symbols[index];
    return {
      key: `${site.file}:${name.text}`,
      site,
      name: name.text,
      keys: symbol === undefined ? [] : declarationKeys(symbol),
      members: named.map(({ element, text }) => ({ text, site: world.siteOf(element), line: lineOf(element) })),
    };
  });
}

function* holdsText(type: Type | undefined, text: string): APIRequestGenerator<boolean> {
  if (type === undefined) {
    return false;
  }
  const members = yield* constituents(type);
  return members.some((member) => member.isStringLiteralType() && member.value === text);
}

// The object literal a name or literal keys: a plain key, or a string literal written as a computed key (`["a"]: …`).
function keyedLiteral(node: Node): ObjectLiteralExpression | null {
  const name = isStringLiteral(node) && isComputedPropertyName(node.parent) ? node.parent : node;
  const parent = name.parent;
  const keyed = (isPropertyAssignment(parent) || isShorthandPropertyAssignment(parent) || isMethodDeclaration(parent)) && parent.name === name;
  return keyed && isObjectLiteralExpression(parent.parent) ? parent.parent : null;
}

interface Found {
  readonly node: Identifier | StringLiteral;
  readonly site: Site;
}

// The literal's slot: the other operand of an equality, the switch expression of a `case`, else its contextual type. A
// `??`, `||` or `&&` operand is no comparison: it hands the literal on, so its contextual type is the slot.
function* slotHolds(world: NativeWorld, node: StringLiteral, role: LiteralRole): APIRequestGenerator<boolean> {
  const { parent } = node;
  if (role === "compare" && isBinaryExpression(parent)) {
    return yield* holdsText(yield* world.checker.getTypeAtLocation.gen(parent.left === node ? parent.right : parent.left), node.text);
  }
  const block = parent.parent;
  if (isCaseClause(parent) && isCaseBlock(block) && isSwitchStatement(block.parent)) {
    return yield* holdsText(yield* world.checker.getTypeAtLocation.gen(block.parent.expression), node.text);
  }
  return yield* holdsText(yield* world.checker.getContextualType.gen(node), node.text);
}

// A `Record<Union, …>` key: the literal's contextual type has the property, and no declaration writes it.
function* isRecordKey(world: NativeWorld, literal: ObjectLiteralExpression, text: string): APIRequestGenerator<boolean> {
  const type = yield* world.checker.getContextualType.gen(literal);
  const property = type === undefined ? undefined : yield* world.checker.getPropertyOfType.gen(type, text);
  return property !== undefined && property.declarations.length === 0;
}

// Literals and object keys that carry a member's text, outside the tuples themselves, with the sites the other facts
// start from: switches, lib key selections and type guards.
interface FirstWalk {
  readonly literals: readonly LiteralSite[];
  readonly switches: readonly Site[];
  readonly selections: readonly Site[];
  readonly guards: readonly Site[];
}

// A switch, a lib key selection or a type guard, kept for the facts read from it after the walk.
function startSite(world: NativeWorld, node: Node, into: { readonly switches: Site[]; readonly selections: Site[]; readonly guards: Site[] }): void {
  if (isSwitchStatement(node)) {
    into.switches.push(world.siteOf(node));
  } else if (isTypeReferenceNode(node) && isIdentifier(node.typeName) && isKeyTypeName(node.typeName.text)) {
    into.selections.push(world.siteOf(node.typeName));
  } else if (isTypePredicateNode(node)) {
    into.guards.push(world.siteOf(node));
  }
}

function literalSites(world: NativeWorld, sources: Sources, local: readonly Tuple[]): FirstWalk {
  const texts = new Set(local.flatMap((tuple) => tuple.members.map((member) => member.text)));
  const own = new Set(local.flatMap((tuple) => tuple.members.map((member) => siteKey(member.site))));
  const keys: (Found & { readonly literal: ObjectLiteralExpression })[] = [];
  const values: (Found & { readonly node: StringLiteral; readonly role: LiteralRole })[] = [];
  const switches: Site[] = [];
  const selections: Site[] = [];
  const guards: Site[] = [];
  eachProductionNode(world, (node) => {
    startSite(world, node, { switches, selections, guards });
    if (!((isIdentifier(node) || isStringLiteral(node)) && texts.has(node.text))) {
      return;
    }
    const site = world.siteOf(node);
    if (own.has(siteKey(site))) {
      return;
    }
    const literal = keyedLiteral(node);
    if (literal !== null) {
      keys.push({ node, site, literal });
    } else if (isStringLiteral(node)) {
      values.push({ node, site, role: literalRoleAt(sources.get(site.file), site.position) });
    }
  });
  const holds = world.batch([
    ...values.map(({ node, role }) => (role === "type" || role === "module" ? holdsText(undefined, node.text) : slotHolds(world, node, role))),
    ...keys.map(({ node, literal }) => isRecordKey(world, literal, node.text)),
  ]);
  const found: (Omit<LiteralSite, "origins"> & { readonly nested: boolean })[] = [
    ...values.map(({ node, site, role }, index) => {
      const depth = role === "construct" ? constantDepth(sources, site) : null;
      return { site, text: node.text, role, holds: holds[index] === true || depth !== null, nested: depth === "nested" };
    }),
    ...keys.map(({ node, site }, index) => ({
      site,
      text: node.text,
      role: "record-key" as const,
      holds: holds[values.length + index] === true,
      nested: false,
    })),
  ];
  // Only a slot that holds the text can build or name a member, so only those are asked which tuples they derive from.
  const oracle = nativeOracle(world);
  const asked = found.filter((literal) => literal.holds);
  const origins = world.batch(asked.map((literal) => slotOrigins(oracle, sources, literal.site, literal.role)));
  const originsAt = new Map(asked.map((literal, index) => [siteKey(literal.site), origins[index] ?? null]));
  // A literal deep in a constant's object reaches its slot only through a read of its own property; when no slot can be
  // read it is no evidence for any tuple, where a direct constant may be any tuple's.
  const literals = found.map(({ nested, ...literal }) => {
    const at = originsAt.get(siteKey(literal.site)) ?? null;
    return { ...literal, holds: literal.holds && !(nested && at === null), origins: at };
  });
  return { literals, switches, selections, guards };
}

interface Access {
  readonly site: Site;
  readonly text: string;
}

// Member reads named by one of `names`: `x.name` and `x["name"]`, each by the site of its name.
function memberReads(world: NativeWorld, names: ReadonlySet<string>): readonly Access[] {
  const found: Access[] = [];
  eachProductionNode(world, (node) => {
    const { parent } = node;
    const named =
      (isIdentifier(node) && isPropertyAccessExpression(parent) && parent.name === node) ||
      (isStringLiteral(node) && isElementAccessExpression(parent) && parent.argumentExpression === node);
    if (named && names.has(node.text)) {
      found.push({ site: world.siteOf(node), text: node.text });
    }
  });
  return found;
}

/** What one world adds beyond its literals: values fed into a tuple's slot from a property whose literal types re-spell
 *  members, constructions no literal in the slot spells, the tuples used as key lists, and the tuples a type guard
 *  narrows raw input into. */
interface WorldFacts {
  readonly first: FirstWalk;
  readonly feeds: readonly Spelled[];
  readonly constructions: readonly Construction[];
  readonly passThroughs: readonly PassedOn[];
  readonly keyLists: ReadonlySet<string>;
  /** Each tuple a type guard narrows raw input into, with the guards' sites. */
  readonly guarded: ReadonlyMap<string, readonly Site[]>;
}

/** A switch label handed on into a slot: it builds the member there only when production builds it in `via`, the
 *  vocabulary of the switched value, since a switch over a value already typed by the tuple produces nothing. */
interface PassedOn extends Construction {
  readonly via: Spelled;
}

interface RespelledProperty {
  readonly name: string;
  /** The literal types its annotation writes, each site key to its text. */
  readonly literals: Map<string, string>;
}

// The properties a type-position literal annotates, by the site key of the property's name.
function respelledProperties(sources: Sources, literals: readonly LiteralSite[]): ReadonlyMap<string, RespelledProperty> {
  const properties = new Map<string, RespelledProperty>();
  for (const literal of literals.filter((candidate) => candidate.role === "type")) {
    const property = respelledProperty(sources, literal.site);
    if (property !== null) {
      const held = properties.get(siteKey(property.site)) ?? { name: property.name, literals: new Map<string, string>() };
      held.literals.set(siteKey(literal.site), literal.text);
      properties.set(siteKey(property.site), held);
    }
  }
  return properties;
}

function worldFacts(world: NativeWorld, sources: Sources, local: readonly Tuple[]): WorldFacts {
  const first = literalSites(world, sources, local);
  const oracle = nativeOracle(world);
  const texts = new Set(local.flatMap((tuple) => tuple.members.map((member) => member.text)));
  const properties = respelledProperties(sources, first.literals);
  const reads = memberReads(world, new Set([...[...properties.values()].map(({ name }) => name), ...texts]));
  const declared = world.batch(reads.map((read) => declaredSites(oracle, read.site)));
  const recordKeys = new Map(
    first.literals
      .filter((literal) => literal.role === "record-key" && literal.holds && literal.origins !== null)
      .map((literal) => [siteKey(literal.site), literal]),
  );
  const fed: { readonly read: Access; readonly literals: ReadonlyMap<string, string> }[] = [];
  const constructions: Construction[] = [];
  for (const [at, read] of reads.entries()) {
    const sites = (declared[at] ?? []).map(siteKey);
    const respelled = new Map(sites.flatMap((key) => [...(properties.get(key)?.literals ?? [])]));
    if (respelled.size > 0) {
      fed.push({ read, literals: respelled });
    }
    // A read of a `Record<Tuple, …>` entry by name uses the member its key names.
    for (const key of sites.flatMap((site) => recordKeys.get(site) ?? [])) {
      constructions.push({ text: key.text, origins: key.origins });
    }
  }
  const fedOrigins = world.batch(fed.map(({ read }) => valueSlotOrigins(oracle, sources, read.site)));
  const feeds = fed.flatMap(({ literals }, at) => {
    const origins = fedOrigins[at];
    return origins === undefined || origins === null ? [] : [{ tuples: origins.tuples, literals }];
  });
  const passed = first.switches.flatMap((site) => switchPassThroughs(sources, site));
  const passedOrigins = world.batch(passed.map(({ value }) => valueSlotOrigins(oracle, sources, value)));
  const subjects = world.batch(passed.map(({ subject }) => subjectOrigins(oracle, sources, subject)));
  const passThroughs: PassedOn[] = [];
  for (const [at, { labels }] of passed.entries()) {
    const origins = passedOrigins[at];
    const via = subjects[at];
    if (origins !== undefined && origins !== null && via !== undefined && via !== null) {
      passThroughs.push(...labels.filter((label) => texts.has(label)).map((text) => ({ text, origins, via })));
    }
  }
  const keyLists = new Set(world.batch(first.selections.map((site) => keyListTuples(oracle, sources, site))).flatMap((keys) => [...keys]));
  const guarded = new Map<string, Site[]>();
  for (const [at, keys] of world.batch(first.guards.map((site) => predicateTuples(oracle, sources, site))).entries()) {
    const site = first.guards[at] as Site;
    for (const key of keys) {
      guarded.set(key, [...(guarded.get(key) ?? []), site]);
    }
  }
  return { first, feeds, constructions, passThroughs, keyLists, guarded };
}

/** Whether a production reference hands the tuple on (a spread, a map, an index), so it can build any member. */
export function enumerates(sources: Sources, sites: Iterable<Site>): boolean {
  for (const site of sites) {
    const use = valueUseAt(sources.get(site.file), site.position);
    if (isProductionFile(site.file) && !(use === "type" || use === "test" || use === "parse")) {
      return true;
    }
  }
  return false;
}

const NARROWING_USES: ReadonlySet<ValueUse> = new Set<ValueUse>(["parse", "test"]);

const parses = (sources: Sources, sites: Iterable<Site>): boolean =>
  [...sites].some((site) => isProductionFile(site.file) && NARROWING_USES.has(valueUseAt(sources.get(site.file), site.position)));

function serviceHolds(world: ServiceWorld, node: ts.StringLiteral): boolean {
  const type = world.checker.getContextualType(node);
  if (type === undefined) {
    return false;
  }
  return (type.isUnion() ? type.types : [type]).some((member) => member.isStringLiteral() && member.value === node.text);
}

// The construction a TypeScript 6 literal makes, read as engine one reads it: a contextual type that holds it, or a
// constant it initialises; a literal deep in a constant's object with no readable slot is no evidence.
function serviceConstruction(
  { world, oracle }: { readonly world: ServiceWorld; readonly oracle: SlotOracle },
  sources: Sources,
  node: ts.StringLiteral,
  own: ReadonlySet<string>,
): Construction | null {
  const site = world.siteOf(node);
  if (own.has(siteKey(site)) || literalRoleAt(sources.get(site.file), site.position) !== "construct") {
    return null;
  }
  const depth = constantDepth(sources, site);
  if (!(serviceHolds(world, node) || depth !== null)) {
    return null;
  }
  const origins = settled(slotOrigins(oracle, sources, site, "construct"));
  return depth === "nested" && origins === null ? null : { text: node.text, origins };
}

// Engine two's view of where production builds each text: a TypeScript 6 literal whose contextual type holds it.
function builtByService(world: ServiceWorld, sources: Sources, texts: ReadonlySet<string>, own: ReadonlySet<string>): readonly Construction[] {
  const built: Construction[] = [];
  const oracle = serviceOracle(world);
  const visit = (node: ts.Node): void => {
    const construction = ts.isStringLiteral(node) && texts.has(node.text) ? serviceConstruction({ world, oracle }, sources, node, own) : null;
    if (construction !== null) {
      built.push(construction);
    }
    ts.forEachChild(node, visit);
  };
  for (const source of world.program.getSourceFiles()) {
    if (!source.isDeclarationFile && isProduction(world.siteOf(source).file)) {
      visit(source);
    }
  }
  return built;
}

interface TupleEntry {
  readonly tuple: Tuple;
  readonly references: ReadonlyMap<string, Site>;
  readonly satisfied: Spelled;
}

interface FirstPass {
  readonly tuples: ReadonlyMap<string, TupleEntry>;
  readonly literals: readonly LiteralSite[];
  readonly feeds: readonly Spelled[];
  readonly constructions: readonly Construction[];
  readonly passThroughs: readonly PassedOn[];
  readonly keyLists: ReadonlySet<string>;
  readonly guarded: ReadonlyMap<string, readonly Site[]>;
}

interface Joined {
  readonly literals: Map<string, LiteralSite>;
  readonly feeds: Spelled[];
  readonly constructions: Construction[];
  readonly passThroughs: PassedOn[];
  readonly keyLists: Set<string>;
  readonly guarded: Map<string, readonly Site[]>;
}

// One world's facts joined into every world's: a literal site keeps the world whose slot holds its text.
function mergeFacts(facts: WorldFacts, into: Joined): void {
  for (const literal of facts.first.literals) {
    const seen = into.literals.get(siteKey(literal.site));
    into.literals.set(siteKey(literal.site), seen?.holds === true ? seen : literal);
  }
  into.feeds.push(...facts.feeds);
  into.constructions.push(...facts.constructions);
  into.passThroughs.push(...facts.passThroughs);
  for (const key of facts.keyLists) {
    into.keyLists.add(key);
  }
  for (const [key, sites] of facts.guarded) {
    into.guarded.set(key, [...(into.guarded.get(key) ?? []), ...sites]);
  }
}

/** One package world while it is open: its tuples, its literal and key sites, and the files only it is asked about, for a
 *  scan built on this one that asks its own checker questions before the world closes. */
export interface UnionWorld {
  readonly world: NativeWorld;
  readonly sources: Sources;
  readonly tuples: readonly Tuple[];
  readonly literals: readonly LiteralSite[];
  readonly home: ReadonlySet<string>;
}

type VisitWorld = (open: UnionWorld) => void;

interface EngineOneInput {
  readonly worlds: readonly string[];
  readonly lists: ReadonlyMap<string, WorldFiles>;
  readonly sources: Sources;
  readonly visit: VisitWorld;
}

function engineOne(options: ScanOptions, { worlds, lists, sources, visit }: EngineOneInput): FirstPass {
  const found = new Map<string, TupleEntry & { readonly references: Map<string, Site> }>();
  const literals = new Map<string, LiteralSite>();
  const feeds: Spelled[] = [];
  const constructions: Construction[] = [];
  const passThroughs: PassedOn[] = [];
  const keyLists = new Set<string>();
  const guarded = new Map<string, readonly Site[]>();
  const homes = homeFiles(worlds, lists);
  for (const config of worlds) {
    using world = NativeWorld.open(options.root, config);
    const local = tuples(world);
    const facts = worldFacts(world, sources, local);
    mergeFacts(facts, { literals, feeds, constructions, passThroughs, keyLists, guarded });
    visit({ world, sources, tuples: local, literals: facts.first.literals, home: homes.get(config) ?? new Set() });
    const index = valueIndex(world, homes.get(config));
    const oracle = nativeOracle(world);
    const satisfied = world.batch(local.map((tuple) => satisfiedOrigins(oracle, sources, tuple.site)));
    for (const [at, tuple] of local.entries()) {
      const entry = found.get(tuple.key) ?? { tuple, references: new Map<string, Site>(), satisfied: satisfied[at] ?? NOTHING_SPELLED };
      for (const site of sitesOf(index, tuple.keys, tuple.site)) {
        entry.references.set(siteKey(site), site);
      }
      found.set(tuple.key, entry);
    }
    options.log(`${config}: ${local.length} tuples`);
  }
  return { tuples: found, literals: [...literals.values()], feeds, constructions, passThroughs, keyLists, guarded };
}

// Each tuple's parents: the tuples its `satisfies` spelling reaches that hold every one of its members. The member test
// is what makes a reached tuple a parent, since a `keyof` or an indexed access reaches tuples of another vocabulary.
function subsetLineages(first: FirstPass): ReadonlyMap<string, readonly string[]> {
  const texts = new Map([...first.tuples].map(([key, { tuple }]) => [key, new Set(tuple.members.map((member) => member.text))]));
  const lineages = new Map<string, readonly string[]>();
  for (const [key, { tuple, satisfied }] of first.tuples) {
    const parents = [...satisfied.tuples].filter((parent) => parent !== key && tuple.members.every((member) => texts.get(parent)?.has(member.text) === true));
    if (parents.length > 0) {
      lineages.set(key, parents.sort());
    }
  }
  return lineages;
}

type Respellings = ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<string>>>;

// Each tuple's linked literal types, by member text: the ones the type it `satisfies` writes, and the ones a property
// writes whose value production feeds into the tuple's slot.
function respellings(first: FirstPass): Respellings {
  const found = new Map<string, Map<string, Set<string>>>();
  const link = (key: string, literals: ReadonlyMap<string, string>): void => {
    const members = new Set(first.tuples.get(key)?.tuple.members.map((member) => member.text));
    const byText = found.get(key) ?? new Map<string, Set<string>>();
    for (const [site, text] of literals) {
      if (members.has(text)) {
        byText.set(text, new Set([...(byText.get(text) ?? []), site]));
      }
    }
    found.set(key, byText);
  };
  for (const [key, { satisfied }] of first.tuples) {
    link(key, satisfied.literals);
  }
  for (const feed of first.feeds) {
    for (const key of feed.tuples) {
      link(key, feed.literals);
    }
  }
  return found;
}

// A subset tuple production enumerates hands each of its members to its parents' slots.
function enumeratedSubsets(first: FirstPass, enumerated: ReadonlySet<string>, subsets: ReadonlyMap<string, readonly string[]>): readonly Construction[] {
  return [...enumerated].flatMap((key) => {
    const parents = subsets.get(key) ?? [];
    const origins: Spelled = { tuples: new Set(parents), literals: new Map() };
    return parents.length === 0 ? [] : (first.tuples.get(key)?.tuple.members ?? []).map((member) => ({ text: member.text, origins }));
  });
}

// Engine one's reading of every package world, and each member's vocabulary: its tuple's lineage and linked literal types.
interface Reading {
  readonly worlds: readonly string[];
  readonly sources: Sources;
  readonly lists: ReadonlyMap<string, WorldFiles>;
  readonly first: FirstPass;
  readonly entries: readonly TupleEntry[];
  readonly subsets: ReadonlyMap<string, readonly string[]>;
  readonly respelled: Respellings;
  readonly lineage: (tuple: Tuple) => readonly string[];
  readonly vocabulary: (tuple: Tuple, text: string) => Vocabulary;
  readonly built: Built;
}

function readWorlds(options: ScanOptions, visit: VisitWorld): Reading {
  const { worlds } = scanWorlds(options);
  const sources = new Sources(options.root);
  const lists = NativeWorld.fileLists(options.root, worlds);
  const first = engineOne(options, { worlds, lists, sources, visit });
  const entries = [...first.tuples.values()];
  const subsets = subsetLineages(first);
  const respelled = respellings(first);
  const lineage = (tuple: Tuple): readonly string[] => [tuple.key, ...(subsets.get(tuple.key) ?? [])];
  const vocabulary = (tuple: Tuple, text: string): Vocabulary => {
    const keys = lineage(tuple);
    return { lineage: keys, respelled: new Set(keys.flatMap((key) => [...(respelled.get(key)?.get(text) ?? [])])) };
  };
  const ownEnumerated = new Set(entries.filter(({ references }) => enumerates(sources, references.values())).map(({ tuple }) => tuple.key));
  const produced = [
    ...first.literals.filter((site) => site.role === "construct" && site.holds),
    ...first.constructions,
    ...enumeratedSubsets(first, ownEnumerated, subsets),
  ];
  const producedBuilt = builtInto(produced);
  // A switch label handed on builds the member only when production already builds it in the switched value's vocabulary.
  const viaVocabulary = (via: Spelled, text: string): Vocabulary => {
    const keys = [...via.tuples].flatMap((key) => [key, ...(subsets.get(key) ?? [])]);
    const spelled = [...via.literals].filter(([, literal]) => literal === text).map(([site]) => site);
    return { lineage: keys, respelled: new Set([...spelled, ...keys.flatMap((key) => [...(respelled.get(key)?.get(text) ?? [])])]) };
  };
  const passedOn = first.passThroughs.filter(({ text, via }) => buildsMember(producedBuilt, viaVocabulary(via, text), text));
  return { worlds, sources, lists, first, entries, subsets, respelled, lineage, vocabulary, built: builtInto([...produced, ...passedOn]) };
}

/** Engine one's reading of the tuples, for a scan built on this one: every literal and key site, whether a site's slot is a member's vocabulary, and whether production builds a member, as the unions
 *  verdict reads it before engine two audits it. */
export interface UnionReading {
  readonly sources: Sources;
  readonly literals: readonly LiteralSite[];
  /** Whether the literal site holds a member of `tuple` in a slot of that member's vocabulary. */
  readonly names: (literal: LiteralSite, tuple: Tuple) => boolean;
  /** Whether a production literal builds the member `text` of `tuple` into a slot of its vocabulary. */
  readonly builds: (tuple: Tuple, text: string) => boolean;
}

/** Engine one over the package worlds of `root`, calling `visit` with each world before it closes. */
export function readUnions(options: ScanOptions, visit: VisitWorld): UnionReading {
  const { sources, first, vocabulary, built } = readWorlds(options, visit);
  return {
    sources,
    literals: first.literals,
    names: (literal, tuple) =>
      literal.holds && tuple.members.some((member) => member.text === literal.text) && belongsTo(literal.origins, vocabulary(tuple, literal.text)),
    builds: (tuple, text) => buildsMember(built, vocabulary(tuple, text), text),
  };
}

/** Run both engines over the package worlds of `root` for string-union members nothing builds. */
export function scanUnions(options: ScanOptions): UnionsReport {
  const { worlds, sources, lists, first, entries, subsets, lineage, vocabulary, built } = readWorlds(options, () => undefined);
  const ownEnumerated = new Set(entries.filter(({ references }) => enumerates(sources, references.values())).map(({ tuple }) => tuple.key));
  // A subset of an enumerated tuple holds members production may build by enumerating the parent.
  const enumerated = entries.filter(({ tuple }) => lineage(tuple).some((key) => ownEnumerated.has(key))).map(({ tuple }) => tuple.key);
  const keyLists = [...first.keyLists].filter((key) => first.tuples.has(key) && !enumerated.includes(key)).sort();
  const judged = entries.map(({ tuple }) => tuple).filter((tuple) => !(enumerated.includes(tuple.key) || keyLists.includes(tuple.key)));
  const candidates = judged.flatMap((tuple) =>
    tuple.members.filter((member) => !buildsMember(built, vocabulary(tuple, member.text), member.text)).map((member) => ({ tuple, member })),
  );
  const own = new Set(entries.flatMap(({ tuple }) => tuple.members.map((member) => siteKey(member.site))));
  const texts = new Set(candidates.map(({ member }) => member.text));
  const builtTwo = builtInto(worlds.flatMap((config) => builtByService(ServiceWorld.open(options.root, config), sources, texts, own)));
  const tupleSites = [...new Set(candidates.map(({ tuple }) => tuple))].map((tuple) => tuple.site);
  const referencesTwo = serviceReferences(options.root, worlds, tupleSites, { log: options.log, crossCheck: options.crossCheck, lists });
  const located = (site: Site): string => `${site.file}:${sources.line(site)}`;
  const findings: UnwiredUnionMember[] = [];
  const disagreements: string[] = [];
  // Engine two reads parses off the tuple's references only; a type guard is engine one's own reading of the code.
  const parsedByReference = new Set(entries.filter(({ references }) => parses(sources, references.values())).map(({ tuple }) => tuple.key));
  const referencesOf = new Map(entries.map(({ tuple, references }) => [tuple.key, [...references.values()]]));
  // Where outside input enters a tuple: each production z.enum or membership test on its references, and each guard.
  const narrowings = (key: string): readonly string[] => [
    ...(referencesOf.get(key) ?? []).flatMap((site) => {
      const use = isProductionFile(site.file) ? valueUseAt(sources.get(site.file), site.position) : null;
      return use === "parse" || use === "test" ? [`${NARROWING_OF_USE[use]} ${located(site)}`] : [];
    }),
    ...(first.guarded.get(key) ?? []).map((site) => `${GUARD_NARROWING} ${located(site)}`),
  ];
  const parsedSources = new Map<string, readonly string[]>();
  for (const { tuple, member } of candidates) {
    const key = `${tuple.key}.${member.text}`;
    const two = referencesTwo.get(siteKey(tuple.site)) ?? [];
    const members = vocabulary(tuple, member.text);
    if (buildsMember(builtTwo, members, member.text) || enumerates(sources, two) || parses(sources, two) !== parsedByReference.has(tuple.key)) {
      disagreements.push(key);
      continue;
    }
    const sites = first.literals.filter((site) => site.text === member.text && site.holds && belongsTo(site.origins, members));
    const of = (role: LiteralSite["role"]): readonly string[] => sites.filter((site) => site.role === role).map((site) => located(site.site));
    const entered = lineage(tuple).flatMap(narrowings);
    if (entered.length > 0) {
      parsedSources.set(key, entered);
    }
    findings.push({
      key,
      kind: entered.length > 0 ? "parsed" : "unbuilt",
      file: tuple.site.file,
      line: member.line,
      home: tuple.name,
      member: member.text,
      cases: of("case"),
      checks: of("compare"),
      keys: of("record-key"),
    });
  }
  const { unwired, deliberate } = sortDeliberate(findings, options.deliberate);
  return {
    scanned: entries.length,
    enumerated,
    keyLists,
    subsets: Object.fromEntries([...subsets].sort(([a], [b]) => a.localeCompare(b))),
    // Only an unbuilt member is a row to judge; a parsed one reports apart, so a judged entry never hides it.
    ...sortJudged(
      unwired.filter(({ kind }) => kind === "unbuilt"),
      options,
    ),
    parsed: unwired.flatMap((row) => (row.kind === "parsed" ? [{ ...row, sources: parsedSources.get(row.key) ?? [] }] : [])),
    deliberate,
    disagreements,
    limits: UNION_LIMITS,
  };
}
