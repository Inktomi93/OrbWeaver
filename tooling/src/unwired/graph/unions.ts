// `pnpm unwired unions` on the reference graph's session: members of `as const` string tuples that no production literal
// builds into a slot of their type, with the `case` branches, equality checks and `Record` keys that test or key them. A
// tuple production enumerates (maps, spreads, indexes, hands on) can build any member, so it is listed and never judged.
//
// - The scan reads the session's one merged program (D357): one checker, the graph's resolver for what a name means,
//   and the site-role reader in ./roles.ts for what a literal or a reference does. Its slot reading is ./union-slots.ts.
// - The report keeps the buckets the per-world scan wrote except `disagreements`: the graph is one engine, so no second
//   engine can disagree with it.
// - A tuple's references are the names in product and snap files the resolver resolves to its declaration; a read
//   elsewhere never enumerates or parses a tuple. Only a tuple product source declares is judged: snap credits the
//   product's members as a user does, and its own tuples stay out of the population.
import type { Expression, Identifier, Node, ObjectLiteralExpression, StringLiteral } from "@typescript/native/ast";
import {
  isArrayLiteralExpression,
  isBinaryExpression,
  isBindingElement,
  isCaseBlock,
  isCaseClause,
  isComputedPropertyName,
  isElementAccessExpression,
  isExportSpecifier,
  isExpressionWithTypeArguments,
  isIdentifier,
  isImportSpecifier,
  isMethodDeclaration,
  isObjectLiteralExpression,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isQualifiedName,
  isSatisfiesExpression,
  isShorthandPropertyAssignment,
  isStringLiteral,
  isSwitchStatement,
  isTypePredicateNode,
  isTypeQueryNode,
  isTypeReferenceNode,
  isVariableDeclaration,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Type } from "@typescript/native/sync";
import { SymbolFlags } from "@typescript/native/sync";
import type { Site } from "../classify.ts";
import type { DeliberateEntry } from "../deliberate.ts";
import { sortDeliberate } from "../deliberate.ts";
import type { JudgedEntry, JudgedSplit } from "../judged.ts";
import { sortJudged } from "../judged.ts";
import type { NativeWorld } from "../native.ts";
import { constituents, hasFlag } from "../native.ts";
import { isProduction } from "../worlds.ts";
import type { GraphLog } from "./options.ts";
import type { DeclKey } from "./resolve.ts";
import { Resolver } from "./resolve.ts";
import type { LiteralRole, ValueUse } from "./roles.ts";
import { literalRole, sameNode, valueUse } from "./roles.ts";
import { declarationNameOf } from "./sites.ts";
import { productReader } from "./state.ts";
import type { Origins, Spelled } from "./union-slots.ts";
import {
  constantDepth,
  declaredSites,
  isConstAssertion,
  isKeyTypeName,
  keyListTuples,
  NOTHING_SPELLED,
  nodeKey,
  predicateTuples,
  respelledProperty,
  satisfiedOrigins,
  slotOrigins,
  subjectOrigins,
  switchPassThroughs,
  valueSlotOrigins,
} from "./union-slots.ts";

/** A 1-based line of a node's own text. */
export const lineOf = (node: Node): number => {
  const source = node.getSourceFile();
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
};

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

/** What the unions scan is given: the lists that excuse or own a row, where docs/work is read from, and its log. */
export interface UnionsOptions {
  readonly root: string;
  readonly deliberate: readonly DeliberateEntry[];
  /** The rows a board item owns. */
  readonly judged?: readonly JudgedEntry[] | undefined;
  readonly log: GraphLog;
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
  /** Always empty: one engine reads the unions, so there is nothing to disagree with. */
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
  "A slot names a tuple only through a declaration that traces to it: its type node followed through aliases, references and instantiations to `(typeof T)[number]`. A type parameter reads what instantiates it (a call's explicit type argument, the declared type of the argument it is inferred from, its constraint when that names exactly one tuple, a type reference's written argument or default, never a type that merely equals the default or constraint), and one that indexes `T[K]` selects the property its string-literal argument names. A library parameter reads its declared type with those instantiations and a method receiver's declared type arguments; a property assignment reads the property's declaration, a name destructured from an annotated holder the property it reads, and an unannotated return the return type its function's slot declares. A slot typed by an inline literal union, a library container's argument (`Box<Mode>`) for a literal that is no element of it, or a type parameter nothing instantiates names no tuple, so a literal there builds nothing.",
  'A literal in array literals is read at its position in the slot\'s array or tuple type (a Map\'s entry is its key then its value, `new Map<Key, Val>([["a", "b"]])`). A `new Map(...)`, `new Set(...)`, `new WeakMap(...)` or `new WeakSet(...)` with no type arguments reads each type parameter through the type argument at the same position in the annotation its result is assigned to (`const X: ReadonlyMap<K, V> = new Map([...])`), so the annotation names a tuple only through the declaration its written arguments trace to; an inline literal union there, a call that infers its type arguments from an argument, and any other generic constructor or helper (`Object.fromEntries`, `Array.from`) read no annotation.',
  "`Extract<T, U>` and `Exclude<T, U>` read every name in both arguments: a literal the slot takes is a member the selector kept, and a name in either argument credits it only where the literal's text is one of its members, so no type argument needs filtering.",
  "A property of an object literal an inferred generic call takes is read from the type node the callee writes for the parameter, with the callee's own type parameters at their constraints: through a type parameter (what instantiates it, else its constraint), an alias, an interface and what it extends, a type literal, `Readonly`, `Partial`, `Required`, `Record<K, V>` and an indexed access at the keys its index selects, ending at the written member type with each reference's written arguments or defaults, so a one-member tuple's element reads through the default that names it. A step the descent cannot read (any other library type, a conditional, a mapped type) leaves the slot to the checker's instantiation, which names no tuple when a type argument is a one-member tuple's element (a bare literal with no alias, indistinguishable from a twin tuple's). A union the descent reaches reads every arm that declares the property, with no narrowing by a sibling property's literal.",
  "An `infer X` in a conditional type adds no vocabulary of its own: the names the checked type writes are read where it is written, so a slot read through a conditional that infers (`T extends { name: infer N } ? N : never`) is readable.",
  "A member built only from a computed string (a template, a concatenation, a lookup by string key), from a JSON or scenario file, or outside the tree (a plugin guest, the model) is not built; a tuple production parses outside input into, with `z.enum`, a membership test or a type guard on a `string` or `unknown` parameter, is reported apart as parsed, with the sites that parse the input in.",
  "A tuple reached through a re-export or a wrapper keeps its references; a reference that hands the tuple on (a spread, a map, an index) enumerates it, and an enumerated tuple is listed, never judged. An enumerated subset builds each of its members in the tuples it is a subset of.",
  "A tuple a lib key selection names (`Pick<T, K>`, `Omit<T, K>`, `Exclude<keyof T, K>`, `Extract<keyof T, K>`) is a key list: listed, never judged, so a stale key the type no longer has is not reported.",
  "A tuple is judged only when product source (packages/*/src) declares it. A literal or reference credits a member when product source or tooling/src/snap/, which uses the product as its user does, writes it into a slot read to the tuple. A test or other tooling literal never builds a member, and a package-root file outside src (a build script such as `packages/ui/tokens.build.ts`) is tooling, so a tuple only such a file enumerates reports its members.",
];

/** One member of a tuple: its text, its line and its element. */
interface UnionMember {
  readonly text: string;
  readonly line: number;
  readonly element: Expression;
  readonly site: Site;
}

/** An `as const` string tuple in a product file, keyed `file:NAME`, with the product names that refer to it. */
export interface UnionTuple {
  readonly key: string;
  readonly name: string;
  readonly nameNode: Identifier;
  readonly site: Site;
  readonly members: readonly UnionMember[];
  /** Product names the resolver resolves to the tuple's declaration, its own name excluded. */
  readonly references: readonly Node[];
}

/** A literal or object key carrying a member's text, whether the type it lands in holds that member, and the tuples
 *  that type is spelled from. */
export interface UnionLiteral {
  readonly node: StringLiteral | Identifier;
  readonly site: Site;
  readonly text: string;
  readonly role: LiteralRole | "record-key";
  readonly holds: boolean;
  readonly origins: Origins;
}

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

// A slot whose tuple cannot be read names none: crediting every tuple there would let one literal build a same-text
// member of any vocabulary.
const belongsTo = (origins: Origins, vocabulary: Vocabulary): boolean =>
  origins !== null && (vocabulary.lineage.some((key) => origins.tuples.has(key)) || [...origins.literals.keys()].some((key) => vocabulary.respelled.has(key)));

const buildsMember = (built: Built, vocabulary: Vocabulary, text: string): boolean => (built.get(text) ?? []).some((origins) => belongsTo(origins, vocabulary));

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
  const array = isConstAssertion(value) ? unwrap(value.expression) : null;
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
// element (`CODE.x`, a named constant) is the string literal its type is, asked of the checker in one batch.
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

const productSources = (world: NativeWorld): readonly Node[] => world.files.filter((source) => productReader(world.fileOfSource(source)));

function eachProductionNode(world: NativeWorld, visit: (node: Node) => void): void {
  const step = (node: Node): void => {
    visit(node);
    node.forEachChild(step);
  };
  for (const source of productSources(world)) {
    source.forEachChild(step);
  }
}

// A module namespace's member (`ns.X` after `import * as ns`) reads the module's declaration of `X`.
const MODULE_MEMBERS: readonly SymbolFlags[] = [SymbolFlags.Variable, SymbolFlags.Function, SymbolFlags.Class, SymbolFlags.Alias];

// A name that refers to a value: not a declaration's own name, a property or specifier key, a type position or a
// shorthand (whose value is read apart).
function isValueName(node: Identifier): boolean {
  const { parent } = node;
  if (isShorthandPropertyAssignment(parent)) {
    return false;
  }
  if (isTypeReferenceNode(parent) || isTypeQueryNode(parent) || isQualifiedName(parent) || isExpressionWithTypeArguments(parent)) {
    return false;
  }
  const keyed = (isBindingElement(parent) || isImportSpecifier(parent) || isExportSpecifier(parent)) && sameNode(parent.propertyName, node);
  return !(keyed || sameNode(declarationNameOf(parent), node));
}

// Each tuple in the product files, with the product names that resolve to its declaration.
function tuples(world: NativeWorld, resolver: Resolver): readonly UnionTuple[] {
  const arrays: ConstArray[] = [];
  const plain: Identifier[] = [];
  const accessed: Identifier[] = [];
  const shorthand: Node[] = [];
  eachProductionNode(world, (node) => {
    const array = constArrayOf(node);
    // snap uses the product and credits its members, but its own tuples are never judged
    if (array !== null && isProduction(world.fileOfSource(node.getSourceFile()))) {
      arrays.push(array);
    }
    if (!isIdentifier(node)) {
      return;
    }
    const { parent } = node;
    if (isShorthandPropertyAssignment(parent) && sameNode(parent.name, node)) {
      shorthand.push(parent);
    } else if (isPropertyAccessExpression(parent) && sameNode(parent.name, node)) {
      accessed.push(node);
    } else if (isValueName(node)) {
      plain.push(node);
    }
  });
  const found = stringTuples(world, arrays);
  const homes = new Map(found.map(({ name }) => [resolver.keyOf(name.parent), name]));
  const references = new Map<DeclKey, Node[]>();
  const credit = (names: readonly Node[], keys: readonly (readonly DeclKey[])[]): void => {
    for (const [at, name] of names.entries()) {
      for (const key of (keys[at] ?? []).filter((candidate) => homes.has(candidate))) {
        references.set(key, [...(references.get(key) ?? []), name]);
      }
    }
  };
  credit(plain, resolver.declarations(world.symbolsAt(plain)));
  const members = world
    .symbolsAt(accessed)
    .map((symbol) => (symbol !== undefined && MODULE_MEMBERS.some((flag) => hasFlag(symbol.flags, flag)) ? symbol : undefined));
  credit(accessed, resolver.declarations(members));
  credit(
    shorthand.flatMap((node) => (isShorthandPropertyAssignment(node) ? [node.name] : [])),
    resolver.declarations(world.shorthandValues(shorthand)),
  );
  return found.map(({ name, named }) => {
    const site = world.siteOf(name);
    return {
      key: `${site.file}:${name.text}`,
      name: name.text,
      nameNode: name,
      site,
      members: named.map(({ element, text }) => ({ text, element, line: lineOf(element), site: world.siteOf(element) })),
      references: (references.get(resolver.keyOf(name.parent)) ?? []).filter((reference) => !sameNode(reference, name)),
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
  const { parent } = name;
  const keyed = (isPropertyAssignment(parent) || isShorthandPropertyAssignment(parent) || isMethodDeclaration(parent)) && sameNode(parent.name, name);
  return keyed && isObjectLiteralExpression(parent.parent) ? parent.parent : null;
}

// The literal's slot: the other operand of an equality, the switch expression of a `case`, else its contextual type. A
// `??`, `||` or `&&` operand is no comparison: it hands the literal on, so its contextual type is the slot.
function* slotHolds(world: NativeWorld, node: StringLiteral, role: LiteralRole): APIRequestGenerator<boolean> {
  const { parent } = node;
  if (role === "compare" && isBinaryExpression(parent)) {
    return yield* holdsText(yield* world.checker.getTypeAtLocation.gen(sameNode(parent.left, node) ? parent.right : parent.left), node.text);
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

// Literals and object keys that carry a member's text, outside the tuples themselves, with the nodes the other facts
// start from: switches, lib key selections and type guards.
interface FirstWalk {
  readonly literals: readonly UnionLiteral[];
  readonly switches: readonly Node[];
  readonly selections: readonly Node[];
  readonly guards: readonly Node[];
}

// A switch, a lib key selection or a type guard, kept for the facts read from it after the walk.
function startSite(node: Node, into: { readonly switches: Node[]; readonly selections: Node[]; readonly guards: Node[] }): void {
  if (isSwitchStatement(node)) {
    into.switches.push(node);
  } else if (isTypeReferenceNode(node) && isIdentifier(node.typeName) && isKeyTypeName(node.typeName.text)) {
    into.selections.push(node.typeName);
  } else if (isTypePredicateNode(node)) {
    into.guards.push(node);
  }
}

interface Found {
  readonly node: Identifier | StringLiteral;
  readonly site: Site;
}

function literalSites(world: NativeWorld, local: readonly UnionTuple[]): FirstWalk {
  const texts = new Set(local.flatMap((tuple) => tuple.members.map((member) => member.text)));
  const own = new Set(local.flatMap((tuple) => tuple.members.map((member) => nodeKey(member.element))));
  const keys: (Found & { readonly literal: ObjectLiteralExpression })[] = [];
  const values: (Found & { readonly node: StringLiteral; readonly role: LiteralRole })[] = [];
  const into = { switches: [] as Node[], selections: [] as Node[], guards: [] as Node[] };
  eachProductionNode(world, (node) => {
    startSite(node, into);
    if (!((isIdentifier(node) || isStringLiteral(node)) && texts.has(node.text)) || own.has(nodeKey(node))) {
      return;
    }
    const site = world.siteOf(node);
    const literal = keyedLiteral(node);
    if (literal !== null) {
      keys.push({ node, site, literal });
    } else if (isStringLiteral(node)) {
      values.push({ node, site, role: literalRole(node) });
    }
  });
  const holds = world.batch([
    ...values.map(({ node, role }) => (role === "type" || role === "module" ? holdsText(undefined, node.text) : slotHolds(world, node, role))),
    ...keys.map(({ node, literal }) => isRecordKey(world, literal, node.text)),
  ]);
  const found: (Omit<UnionLiteral, "origins"> & { readonly nested: boolean })[] = [
    ...values.map(({ node, site, role }, index) => {
      const depth = role === "construct" ? constantDepth(node) : null;
      return { node, site, text: node.text, role, holds: holds[index] === true || depth !== null, nested: depth === "nested" };
    }),
    ...keys.map(({ node, site }, index) => ({
      node,
      site,
      text: node.text,
      role: "record-key" as const,
      holds: holds[values.length + index] === true,
      nested: false,
    })),
  ];
  // Only a slot that holds the text can build or name a member, so only those are asked which tuples they derive from.
  const asked = found.filter((literal) => literal.holds);
  const origins = world.batch(asked.map((literal) => slotOrigins(world, literal.node, literal.role)));
  const originsAt = new Map(asked.map((literal, index) => [nodeKey(literal.node), origins[index] ?? null]));
  // A literal deep in a constant's object reaches its slot only through a read of its own property; when no slot can be
  // read it holds nothing there.
  const literals = found.map(({ nested, ...literal }) => {
    const at = originsAt.get(nodeKey(literal.node)) ?? null;
    return { ...literal, holds: literal.holds && !(nested && at === null), origins: at };
  });
  return { literals, ...into };
}

// Member reads named by one of `names`: `x.name` and `x["name"]`, each by its name.
function memberReads(world: NativeWorld, names: ReadonlySet<string>): readonly (Identifier | StringLiteral)[] {
  const found: (Identifier | StringLiteral)[] = [];
  eachProductionNode(world, (node) => {
    const { parent } = node;
    const named =
      (isIdentifier(node) && isPropertyAccessExpression(parent) && sameNode(parent.name, node)) ||
      (isStringLiteral(node) && isElementAccessExpression(parent) && sameNode(parent.argumentExpression, node));
    if (named && (isIdentifier(node) || isStringLiteral(node)) && names.has(node.text)) {
      found.push(node);
    }
  });
  return found;
}

/** A switch label handed on into a slot: it builds the member there only when production builds it in `via`, the
 *  vocabulary of the switched value, since a switch over a value already typed by the tuple produces nothing. */
interface PassedOn extends Construction {
  readonly via: Spelled;
}

/** What the walk adds beyond its literals: values fed into a tuple's slot from a property whose literal types re-spell
 *  members, constructions no literal in the slot spells, the tuples used as key lists, and the tuples a type guard
 *  narrows raw input into. */
interface Facts {
  readonly first: FirstWalk;
  readonly feeds: readonly Spelled[];
  readonly constructions: readonly Construction[];
  readonly passThroughs: readonly PassedOn[];
  readonly keyLists: ReadonlySet<string>;
  /** Each tuple a type guard narrows raw input into, with the guards. */
  readonly guarded: ReadonlyMap<string, readonly Node[]>;
}

interface RespelledProperty {
  readonly name: string;
  /** The literal types its annotation writes, each node key to its text. */
  readonly literals: Map<string, string>;
}

const siteText = (site: Site): string => `${site.file}:${String(site.position)}`;

// The properties a type-position literal annotates, by the site of the property's name.
function respelledProperties(world: NativeWorld, literals: readonly UnionLiteral[]): ReadonlyMap<string, RespelledProperty> {
  const properties = new Map<string, RespelledProperty>();
  for (const literal of literals.filter((candidate) => candidate.role === "type")) {
    const property = respelledProperty(world, literal.node);
    if (property !== null) {
      const held = properties.get(siteText(property.site)) ?? { name: property.name, literals: new Map<string, string>() };
      held.literals.set(nodeKey(literal.node), literal.text);
      properties.set(siteText(property.site), held);
    }
  }
  return properties;
}

function readFacts(world: NativeWorld, local: readonly UnionTuple[]): Facts {
  const first = literalSites(world, local);
  const texts = new Set(local.flatMap((tuple) => tuple.members.map((member) => member.text)));
  const properties = respelledProperties(world, first.literals);
  const reads = memberReads(world, new Set([...[...properties.values()].map(({ name }) => name), ...texts]));
  const declared = world.batch(reads.map((read) => declaredSites(world, read)));
  const recordKeys = new Map(
    first.literals
      .filter((literal) => literal.role === "record-key" && literal.holds && literal.origins !== null)
      .map((literal) => [siteText(literal.site), literal]),
  );
  const fed: { readonly read: Node; readonly literals: ReadonlyMap<string, string> }[] = [];
  const constructions: Construction[] = [];
  for (const [at, read] of reads.entries()) {
    const sites = (declared[at] ?? []).map(siteText);
    const respelled = new Map(sites.flatMap((key) => [...(properties.get(key)?.literals ?? [])]));
    if (respelled.size > 0) {
      fed.push({ read, literals: respelled });
    }
    // A read of a `Record<Tuple, …>` entry by name uses the member its key names.
    for (const key of sites.flatMap((site) => recordKeys.get(site) ?? [])) {
      constructions.push({ text: key.text, origins: key.origins });
    }
  }
  const fedOrigins = world.batch(fed.map(({ read }) => valueSlotOrigins(world, read)));
  const feeds = fed.flatMap(({ literals }, at) => {
    const origins = fedOrigins[at];
    return origins === undefined || origins === null ? [] : [{ tuples: origins.tuples, literals }];
  });
  const passThroughs = passThroughsOf(world, first.switches, texts);
  const keyLists = new Set(world.batch(first.selections.map((node) => keyListTuples(world, node))).flatMap((keys) => [...keys]));
  return { first, feeds, constructions, passThroughs, keyLists, guarded: guardedTuples(world, first.guards) };
}

// The switch labels each clause hands on into a slot, with the vocabulary of the switched value.
function passThroughsOf(world: NativeWorld, switches: readonly Node[], texts: ReadonlySet<string>): readonly PassedOn[] {
  const passed = switches.flatMap((node) => switchPassThroughs(node));
  const passedOrigins = world.batch(passed.map(({ value }) => valueSlotOrigins(world, value)));
  const subjects = world.batch(passed.map(({ subject }) => subjectOrigins(world, subject)));
  const passThroughs: PassedOn[] = [];
  for (const [at, { labels }] of passed.entries()) {
    const origins = passedOrigins[at];
    const via = subjects[at];
    if (origins !== undefined && origins !== null && via !== undefined && via !== null) {
      passThroughs.push(...labels.filter((label) => texts.has(label)).map((text) => ({ text, origins, via })));
    }
  }
  return passThroughs;
}

// Each tuple a type guard narrows raw input into, with the guards.
function guardedTuples(world: NativeWorld, guards: readonly Node[]): ReadonlyMap<string, readonly Node[]> {
  const guarded = new Map<string, Node[]>();
  for (const [at, keys] of world.batch(guards.map((node) => predicateTuples(world, node))).entries()) {
    const guard = guards[at];
    if (guard === undefined) {
      continue;
    }
    for (const key of keys) {
      guarded.set(key, [...(guarded.get(key) ?? []), guard]);
    }
  }
  return guarded;
}

const INSPECTING_USES: ReadonlySet<ValueUse> = new Set<ValueUse>(["type", "test", "parse"]);

// Whether a product reference hands the tuple on (a spread, a map, an index), so it can build any member.
const enumerates = (references: Iterable<Node>): boolean => [...references].some((reference) => !INSPECTING_USES.has(valueUse(reference)));

interface TupleEntry {
  readonly tuple: UnionTuple;
  readonly satisfied: Spelled;
}

// Each tuple's parents: the tuples its `satisfies` spelling reaches that hold every one of its members. The member test
// is what makes a reached tuple a parent, since a `keyof` or an indexed access reaches tuples of another vocabulary.
function subsetLineages(entries: ReadonlyMap<string, TupleEntry>): ReadonlyMap<string, readonly string[]> {
  const texts = new Map([...entries].map(([key, { tuple }]) => [key, new Set(tuple.members.map((member) => member.text))]));
  const lineages = new Map<string, readonly string[]>();
  for (const [key, { tuple, satisfied }] of entries) {
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
function respellings(entries: ReadonlyMap<string, TupleEntry>, feeds: readonly Spelled[]): Respellings {
  const found = new Map<string, Map<string, Set<string>>>();
  const link = (key: string, literals: ReadonlyMap<string, string>): void => {
    const members = new Set(entries.get(key)?.tuple.members.map((member) => member.text));
    const byText = found.get(key) ?? new Map<string, Set<string>>();
    for (const [site, text] of literals) {
      if (members.has(text)) {
        byText.set(text, new Set([...(byText.get(text) ?? []), site]));
      }
    }
    found.set(key, byText);
  };
  for (const [key, { satisfied }] of entries) {
    link(key, satisfied.literals);
  }
  for (const feed of feeds) {
    for (const key of feed.tuples) {
      link(key, feed.literals);
    }
  }
  return found;
}

// A subset tuple production enumerates hands each of its members to its parents' slots.
function enumeratedSubsets(
  entries: ReadonlyMap<string, TupleEntry>,
  enumerated: ReadonlySet<string>,
  subsets: ReadonlyMap<string, readonly string[]>,
): readonly Construction[] {
  return [...enumerated].flatMap((key) => {
    const parents = subsets.get(key) ?? [];
    const origins: Spelled = { tuples: new Set(parents), literals: new Map() };
    return parents.length === 0 ? [] : (entries.get(key)?.tuple.members ?? []).map((member) => ({ text: member.text, origins }));
  });
}

// The reading of the product files, and each member's vocabulary: its tuple's lineage and linked literal types.
interface Reading {
  readonly facts: Facts;
  readonly entries: ReadonlyMap<string, TupleEntry>;
  readonly subsets: ReadonlyMap<string, readonly string[]>;
  readonly ownEnumerated: ReadonlySet<string>;
  readonly lineage: (tuple: UnionTuple) => readonly string[];
  readonly vocabulary: (tuple: UnionTuple, text: string) => Vocabulary;
  readonly built: Built;
}

function readTuples(world: NativeWorld, log: GraphLog): Reading {
  const local = tuples(world, new Resolver(world));
  const facts = readFacts(world, local);
  const satisfied = world.batch(local.map((tuple) => satisfiedOrigins(world, tuple.nameNode)));
  const entries = new Map(local.map((tuple, at) => [tuple.key, { tuple, satisfied: satisfied[at] ?? NOTHING_SPELLED }]));
  log(`unions: ${String(local.length)} tuples`);
  const subsets = subsetLineages(entries);
  const respelled = respellings(entries, facts.feeds);
  const lineage = (tuple: UnionTuple): readonly string[] => [tuple.key, ...(subsets.get(tuple.key) ?? [])];
  const vocabulary = (tuple: UnionTuple, text: string): Vocabulary => {
    const keys = lineage(tuple);
    return { lineage: keys, respelled: new Set(keys.flatMap((key) => [...(respelled.get(key)?.get(text) ?? [])])) };
  };
  const ownEnumerated = new Set(local.filter((tuple) => enumerates(tuple.references)).map((tuple) => tuple.key));
  const produced = [
    ...facts.first.literals.filter((site) => site.role === "construct" && site.holds),
    ...facts.constructions,
    ...enumeratedSubsets(entries, ownEnumerated, subsets),
  ];
  const producedBuilt = builtInto(produced);
  // A switch label handed on builds the member only when production already builds it in the switched value's vocabulary.
  const viaVocabulary = (via: Spelled, text: string): Vocabulary => {
    const keys = [...via.tuples].flatMap((key) => [key, ...(subsets.get(key) ?? [])]);
    const spelled = [...via.literals].filter(([, literal]) => literal === text).map(([site]) => site);
    return { lineage: keys, respelled: new Set([...spelled, ...keys.flatMap((key) => [...(respelled.get(key)?.get(text) ?? [])])]) };
  };
  const passedOn = facts.passThroughs.filter(({ text, via }) => buildsMember(producedBuilt, viaVocabulary(via, text), text));
  return { facts, entries, subsets, ownEnumerated, lineage, vocabulary, built: builtInto([...produced, ...passedOn]) };
}

/** The tuples of a graph session's program, for a scan built on this one: every tuple and its references, every
 *  literal and key site, whether a site's slot is a member's vocabulary, and whether production builds a member. */
export interface UnionReading {
  readonly tuples: readonly UnionTuple[];
  readonly literals: readonly UnionLiteral[];
  /** Whether the literal site holds a member of `tuple` in a slot of that member's vocabulary. */
  readonly names: (literal: UnionLiteral, tuple: UnionTuple) => boolean;
  /** Whether a production literal builds the member `text` of `tuple` into a slot of its vocabulary. */
  readonly builds: (tuple: UnionTuple, text: string) => boolean;
  /** Whether a product reference hands a tuple on, so it can build any member. */
  readonly enumerates: (references: Iterable<Node>) => boolean;
}

/** Read the tuples of the session's merged program. */
export function readUnionsOnGraph(world: NativeWorld, log: GraphLog): UnionReading {
  const { facts, entries, vocabulary, built } = readTuples(world, log);
  return {
    tuples: [...entries.values()].map(({ tuple }) => tuple),
    literals: facts.first.literals,
    names: (literal, tuple) =>
      literal.holds && tuple.members.some((member) => member.text === literal.text) && belongsTo(literal.origins, vocabulary(tuple, literal.text)),
    builds: (tuple, text) => buildsMember(built, vocabulary(tuple, text), text),
    enumerates,
  };
}

/** The string-union members nothing builds in the session's merged program. */
export function scanUnionsOnGraph(world: NativeWorld, options: UnionsOptions): UnionsReport {
  const { facts, entries, subsets, ownEnumerated, lineage, vocabulary, built } = readTuples(world, options.log);
  const all = [...entries.values()].map(({ tuple }) => tuple);
  // A subset of an enumerated tuple holds members production may build by enumerating the parent.
  const enumerated = all.filter((tuple) => lineage(tuple).some((key) => ownEnumerated.has(key))).map((tuple) => tuple.key);
  const keyLists = [...facts.keyLists].filter((key) => entries.has(key) && !enumerated.includes(key)).sort();
  const judged = all.filter((tuple) => !(enumerated.includes(tuple.key) || keyLists.includes(tuple.key)));
  const located = (site: Site, node: Node): string => `${site.file}:${String(lineOf(node))}`;
  const referencesOf = new Map(all.map((tuple) => [tuple.key, tuple.references]));
  // Where outside input enters a tuple: each production z.enum or membership test on its references, and each guard.
  const narrowings = (key: string): readonly string[] => [
    ...(referencesOf.get(key) ?? []).flatMap((reference) => {
      const use = valueUse(reference);
      return use === "parse" || use === "test" ? [`${NARROWING_OF_USE[use]} ${located(world.siteOf(reference), reference)}`] : [];
    }),
    ...(facts.guarded.get(key) ?? []).map((guard) => `${GUARD_NARROWING} ${located(world.siteOf(guard), guard)}`),
  ];
  const findings: UnwiredUnionMember[] = [];
  const parsedSources = new Map<string, readonly string[]>();
  for (const tuple of judged) {
    for (const member of tuple.members.filter((candidate) => !buildsMember(built, vocabulary(tuple, candidate.text), candidate.text))) {
      const key = `${tuple.key}.${member.text}`;
      const members = vocabulary(tuple, member.text);
      const sites = facts.first.literals.filter((site) => site.text === member.text && site.holds && belongsTo(site.origins, members));
      const of = (role: UnionLiteral["role"]): readonly string[] => sites.filter((site) => site.role === role).map((site) => located(site.site, site.node));
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
  }
  const { unwired, deliberate } = sortDeliberate(findings, options.deliberate);
  return {
    scanned: entries.size,
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
    limits: UNION_LIMITS,
  };
}
