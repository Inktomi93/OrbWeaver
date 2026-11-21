// `pnpm unwired codes`: each error and refusal code of a closed code vocabulary in `packages/contracts`, with the sites that
// throw or build it, where it crosses the wire, and the client branches that name it. A vocabulary is one of codes when
// production throws one of its members, or when a field of a tRPC procedure's answer or an HTTP route's JSON body is typed
// by it. A code nothing throws, or in a returned vocabulary nothing builds, is dead vocabulary; a live code that crosses
// the wire with no client branch reaches the user as a generic failure.
import type { Node } from "@typescript/native/ast";
import {
  getTouchingPropertyName,
  isAsExpression,
  isBinaryExpression,
  isCallExpression,
  isConditionalExpression,
  isFunctionDeclaration,
  isIdentifier,
  isNewExpression,
  isNonNullExpression,
  isObjectLiteralExpression,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isSatisfiesExpression,
  isStringLiteral,
  isVariableDeclaration,
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Symbol as NativeSymbol, Type } from "@typescript/native/sync";
import { all, SignatureKind, SymbolFlags, TypeFlags } from "@typescript/native/sync";
import ts from "typescript";
import type { LiteralRole, Site, Sources } from "./classify.ts";
import { isProductionFile, nameAt, readRoleAt, siteKey } from "./classify.ts";
import type { NativeWorld } from "./native.ts";
import { constituents, hasFlag } from "./native.ts";
import type { ScanOptions } from "./scan.ts";
import { sortDeliberate } from "./scan.ts";
import { isNativeConstAssertion } from "./union-oracles.ts";
import type { LiteralSite, Tuple, UnionReading, UnionWorld } from "./unions.ts";
import { readUnions } from "./unions.ts";
import { isProduction } from "./worlds.ts";

const CODE_KINDS = ["unthrown", "unhandled"] as const;
/** `unthrown`: nothing throws the code, and in a returned vocabulary nothing builds it either. `unhandled`: a live code
 *  crosses the wire and no client branch names it. */
type CodeKind = (typeof CODE_KINDS)[number];

const CHANNELS = ["thrown", "returned"] as const;
/** How a vocabulary's codes leave the server. `thrown`: a member is built into an `Error`'s construction. `returned`: a
 *  field of a procedure's answer or a route's JSON body is typed by the vocabulary. */
type Channel = (typeof CHANNELS)[number];

const CROSSINGS = ["reason", "answer", "client"] as const;
/** Where a code crosses to the client. `reason`: a throw builds a class the transport carries on `data.reason`.
 *  `answer`: its vocabulary types a field of a procedure's answer or a route's body. `client`: client code names it. */
type Crossing = (typeof CROSSINGS)[number];

const CONTRACTS = "packages/contracts/src/";
const CLIENT = "packages/client/src/";

/** The transport function whose `instanceof` tests name the error classes whose code rides `data.reason`. */
const REASON_CARRIER = { file: "packages/server/src/transport/trpc/error-mapping.ts", name: "domainReason" } as const;

/** The library calls that send a value to the client: a tRPC procedure's resolver answers with its return, and a Hono
 *  context's `json` sends its first argument as the body. Each is known by the module that declares the method. */
const SENDS = [
  { module: "/@trpc/server/", methods: ["query", "mutation", "subscription"], value: "return" },
  { module: "/hono/", methods: ["json"], value: "argument" },
] as const;
type Send = (typeof SENDS)[number];

// Deep enough for a subscription's frame union inside its generator inside the resolver's promise, and a field one
// object below a frame.
const MAX_DEPTH = 6;

// Joins a field's sorted literal texts into one key; a code never holds it.
const TEXT_JOIN = "|";

const BRANCH_ROLES: ReadonlySet<LiteralRole | "record-key"> = new Set<LiteralRole | "record-key">(["case", "compare", "key", "record-key"]);

/** What the codes scan cannot see, printed with every run. */
const CODE_LIMITS: readonly string[] = [
  "A vocabulary is an `as const` string tuple the unions scan reads, or an `as const` object whose every value is a string literal, declared in packages/contracts/src; a code vocabulary declared in a server domain is not read.",
  "A code is thrown only where it is an argument, directly or as a property of an object literal argument, of a construction or call whose type is assignable to `Error`; a code stored in a binding first and thrown later is not.",
  "A member of an object vocabulary is built only by a read of its property (`CODES.x`); a literal that spells its text builds nothing, nor names a branch.",
  "A returned vocabulary is found only through a field whose string literals are exactly its members, in a value a tRPC resolver returns or a Hono `json` call sends, followed through unions, type arguments and properties to a fixed depth; a socket frame or a hand-written response is not followed.",
  "A client branch is a case label, an equality or membership operand, or a key, written as a literal in the member's vocabulary or as a read of the member's constant. A literal compared to a value typed `string`, such as `trpcErrorReason(error)`, is no checker link, so it names no branch.",
  "The transport carries a thrown code on `data.reason` only for the classes domainReason in packages/server/src/transport/trpc/error-mapping.ts tests; any other thrown code crosses only where client code names its vocabulary.",
  "Engine one only: no TypeScript 6 audit runs, so the report has no disagreements.",
];

interface CodeMember {
  readonly text: string;
  readonly line: number;
  /** The name production reads the member through, a map property or a named constant; null for a spelled literal. */
  readonly read: Site | null;
}

interface Vocabulary {
  readonly key: string;
  readonly name: string;
  readonly site: Site;
  readonly members: readonly CodeMember[];
  /** The unions scan's tuple, whose literal sites and verdict the member judgement reuses; null for an object vocabulary. */
  readonly tuple: Tuple | null;
}

/** One code with where it is thrown or built, how it crosses, and the client branches that name it. */
interface Code {
  readonly key: string;
  readonly file: string;
  readonly line: number;
  readonly home: string;
  readonly member: string;
  readonly throws: readonly string[];
  /** Production sites that build it without a throw. */
  readonly builds: readonly string[];
  readonly crosses: readonly Crossing[];
  readonly handlers: readonly string[];
}

interface CodeFinding {
  readonly key: string;
  readonly kind: CodeKind;
  readonly file: string;
  readonly line: number;
  readonly home: string;
  readonly member: string;
}

interface CodeVocabulary {
  readonly key: string;
  readonly channels: readonly Channel[];
  /** The sends whose value has a field the vocabulary types, `file:line`. */
  readonly sends: readonly string[];
}

export interface CodesReport {
  /** Every vocabulary read in packages/contracts. */
  readonly scanned: number;
  readonly vocabularies: readonly CodeVocabulary[];
  readonly codes: readonly Code[];
  readonly unwired: readonly CodeFinding[];
  readonly deliberate: readonly (CodeFinding & { readonly reason: string })[];
  readonly disagreements: readonly string[];
  readonly limits: readonly string[];
}

const lineOf = (node: Node): number => node.getSourceFile().getLineAndCharacterOfPosition(node.getStart(node.getSourceFile())).line + 1;

const inContracts = (file: string): boolean => file.startsWith(CONTRACTS) && isProduction(file);
const inClient = (file: string): boolean => file.startsWith(CLIENT);

// The name a tuple element is read through: a constant, or the property a member access names. A spelled literal has none.
function elementRead(sources: Sources, site: Site): Site | null {
  const source = sources.get(site.file);
  const node = nameAt(source, site.position);
  if (node === undefined || !ts.isIdentifier(node)) {
    return null;
  }
  const { parent } = node;
  return ts.isPropertyAccessExpression(parent) && parent.expression === node ? { file: site.file, position: parent.name.getStart(source) } : site;
}

function tupleVocabulary(sources: Sources, tuple: Tuple): Vocabulary {
  return {
    key: tuple.key,
    name: tuple.name,
    site: tuple.site,
    members: tuple.members.map((member) => ({ text: member.text, line: member.line, read: elementRead(sources, member.site) })),
    tuple,
  };
}

function walk(root: Node, visit: (node: Node) => void): void {
  const step = (node: Node): void => {
    visit(node);
    node.forEachChild(step);
  };
  root.forEachChild(step);
}

// `const NAME = { key: "text", ... } as const` with at least one property, every one a string literal.
function objectVocabulary(world: NativeWorld, node: Node): Vocabulary | null {
  if (!(isVariableDeclaration(node) && isIdentifier(node.name) && node.initializer !== undefined)) {
    return null;
  }
  let value: Node = node.initializer;
  while (isParenthesizedExpression(value) || isSatisfiesExpression(value)) {
    value = value.expression;
  }
  const object = isNativeConstAssertion(value) ? value.expression : null;
  if (object === null || !isObjectLiteralExpression(object) || object.properties.length === 0) {
    return null;
  }
  const members = object.properties.flatMap((property): CodeMember[] =>
    isPropertyAssignment(property) && isIdentifier(property.name) && isStringLiteral(property.initializer)
      ? [{ text: property.initializer.text, line: lineOf(property), read: world.siteOf(property.name) }]
      : [],
  );
  const site = world.siteOf(node.name);
  return members.length === object.properties.length ? { key: `${site.file}:${node.name.text}`, name: node.name.text, site, members, tuple: null } : null;
}

function objectVocabularies(world: NativeWorld): readonly Vocabulary[] {
  const found: Vocabulary[] = [];
  for (const file of world.files.filter((source) => inContracts(world.siteOf(source).file))) {
    walk(file, (node) => {
      const vocabulary = objectVocabulary(world, node);
      if (vocabulary !== null) {
        found.push(vocabulary);
      }
    });
  }
  return found;
}

// The construction a value is an argument of: through parentheses, assertions, a conditional's branch and an object
// literal argument's property. Null for a value that is no argument.
function constructionOf(start: Node): Node | null {
  let node = isPropertyAccessExpression(start.parent) && start.parent.name === start ? start.parent : start;
  for (let outer = wrapperOf(node); outer !== null; outer = wrapperOf(node)) {
    node = outer;
  }
  const { parent } = node;
  const argument = node;
  return (isCallExpression(parent) || isNewExpression(parent)) && (parent.arguments ?? []).some((candidate) => candidate === argument) ? parent : null;
}

// The expression that hands `node` on unchanged as its own value, or null.
function wrapperOf(node: Node): Node | null {
  const { parent } = node;
  if (
    isParenthesizedExpression(parent) ||
    isAsExpression(parent) ||
    isSatisfiesExpression(parent) ||
    isNonNullExpression(parent) ||
    (isConditionalExpression(parent) && parent.condition !== node)
  ) {
    return parent;
  }
  return isPropertyAssignment(parent) && parent.initializer === node && isObjectLiteralExpression(parent.parent) ? parent.parent : null;
}

/** What one world knows about a production site that builds a code: whether it throws, and whether the transport carries it. */
interface Built {
  readonly thrown: boolean;
  readonly carried: boolean;
}

const NOT_THROWN: Built = { thrown: false, carried: false };

// The classes domainReason tests with `instanceof`, as instance types; null when the world does not hold its file.
function reasonCarriers(world: NativeWorld): readonly Type[] | null {
  const source = world.source(REASON_CARRIER.file);
  if (source === undefined) {
    return null;
  }
  const carriers: Node[] = [];
  walk(source, (node) => {
    if (isFunctionDeclaration(node) && node.name?.text === REASON_CARRIER.name) {
      carriers.push(node);
    }
  });
  const tested: Node[] = [];
  for (const carrier of carriers) {
    walk(carrier, (inner) => {
      if (isBinaryExpression(inner) && inner.operatorToken.kind === SyntaxKind.InstanceOfKeyword) {
        tested.push(inner.right);
      }
    });
  }
  if (carriers.length === 0) {
    throw new Error(`${REASON_CARRIER.file}: no ${REASON_CARRIER.name} names the classes the transport carries on data.reason`);
  }
  const symbols = world.symbolsAt(tested).filter((symbol): symbol is NativeSymbol => symbol !== undefined);
  return world.batch(symbols.map((symbol) => world.checker.getDeclaredTypeOfSymbol.gen(symbol)));
}

// The global `Error` instance type, resolved from the world's first file.
function errorType(world: NativeWorld): Type | undefined {
  const [anchor] = world.files;
  if (anchor === undefined) {
    return undefined;
  }
  const { checker } = world;
  const [type] = world.batch([
    (function* (): APIRequestGenerator<Type | undefined> {
      const symbol = yield* checker.resolveName.gen("Error", SymbolFlags.Type, anchor);
      return symbol === undefined ? undefined : yield* checker.getDeclaredTypeOfSymbol.gen(symbol);
    })(),
  ]);
  return type;
}

interface Throwing {
  readonly error: Type | undefined;
  readonly carriers: readonly Type[];
}

function* builtAt(world: NativeWorld, construction: Node | null, { error, carriers }: Throwing): APIRequestGenerator<Built> {
  if (construction === null || error === undefined) {
    return NOT_THROWN;
  }
  const { checker } = world;
  const type = yield* checker.getTypeAtLocation.gen(construction);
  const [thrown, ...carried] = yield* all(
    checker.isTypeAssignableTo.gen(type, error),
    ...carriers.map((carrier) => checker.isTypeAssignableTo.gen(type, carrier)),
  );
  return { thrown: thrown === true, carried: carried.includes(true) };
}

// The value a send hands the client: a resolver's return, awaited, or a body argument.
function* sentType(world: NativeWorld, send: Send, argument: Node): APIRequestGenerator<Type | undefined> {
  const { checker } = world;
  const type = yield* checker.getTypeAtLocation.gen(argument);
  if (send.value === "argument") {
    return type;
  }
  const [signature] = yield* checker.getSignaturesOfType.gen(type, SignatureKind.Call);
  if (signature === undefined) {
    return undefined;
  }
  const returned = yield* checker.getReturnTypeOfSignature.gen(signature);
  return (yield* checker.getAwaitedType.gen(returned)) ?? returned;
}

interface Explored {
  /** Each field whose type is a union of string literals, as its sorted texts joined by {@link TEXT_JOIN}. */
  readonly fields: readonly string[];
  readonly next: readonly Type[];
}

const isOptional = (type: Type): boolean => hasFlag(type.flags, TypeFlags.Undefined) || hasFlag(type.flags, TypeFlags.Null);

function* fieldTexts(field: Type): APIRequestGenerator<string | null> {
  const members = (yield* constituents(field)).filter((member) => !isOptional(member));
  const texts = members.flatMap((member) => (member.isStringLiteralType() ? [member.value] : []));
  return texts.length > 0 && texts.length === members.length ? [...new Set(texts)].sort().join(TEXT_JOIN) : null;
}

// One step into a sent type: a union's members, a reference's type arguments and an object's properties. A callable
// type is a method, never data.
function* explore(world: NativeWorld, type: Type): APIRequestGenerator<Explored> {
  const { checker } = world;
  if (type.isUnionType()) {
    return { fields: [], next: yield* type.getTypes.gen() };
  }
  if (!type.isObjectType() || (yield* type.getCallSignatures.gen()).length > 0) {
    return { fields: [], next: [] };
  }
  const args = type.isTypeReference() ? yield* checker.getTypeArguments.gen(type) : [];
  const properties = yield* checker.getPropertiesOfType.gen(type);
  const types = properties.length === 0 ? [] : yield* checker.getTypeOfSymbol.gen(properties);
  const fields = yield* all(...types.map(fieldTexts));
  return { fields: fields.filter((field) => field !== null), next: [...args, ...types] };
}

// Every field literal set inside the sent types, breadth first to MAX_DEPTH, each type explored once.
function sentFields(world: NativeWorld, roots: readonly Type[]): ReadonlySet<string> {
  const seen = new Set<number>();
  const fields = new Set<string>();
  let level = roots;
  for (let depth = 0; depth < MAX_DEPTH && level.length > 0; depth += 1) {
    const fresh = [...new Map(level.filter((type) => !seen.has(type.id)).map((type) => [type.id, type])).values()];
    for (const type of fresh) {
      seen.add(type.id);
    }
    const explored = world.batch(fresh.map((type) => explore(world, type)));
    for (const field of explored.flatMap((step) => step.fields)) {
      fields.add(field);
    }
    level = explored.flatMap((step) => step.next);
  }
  return fields;
}

const memberSet = (vocabulary: Vocabulary): string => [...new Set(vocabulary.members.map((member) => member.text))].sort().join(TEXT_JOIN);

interface Gathered {
  readonly vocabularies: Map<string, Vocabulary>;
  /** Every reference to a vocabulary's name or a member's read name, by the asked site's key. */
  readonly references: Map<string, Map<string, Site>>;
  readonly built: Map<string, Built>;
  /** The sends whose value has a field of each literal set, by set. */
  readonly sentBy: Map<string, Set<string>>;
  readonly carrierWorlds: string[];
}

// The type alias a reference to a vocabulary sits in, by its name's site: `type Code = (typeof CODES)[number]`.
function aliasAt(sources: Sources, site: Site): Site | null {
  const source = sources.get(site.file);
  for (let node = nameAt(source, site.position); node !== undefined; node = node.parent) {
    if (ts.isTypeAliasDeclaration(node)) {
      return { file: site.file, position: node.name.getStart(source) };
    }
    if (ts.isSourceFile(node) || ts.isStatement(node)) {
      return null;
    }
  }
  return null;
}

// A vocabulary is named through its own name and through each type alias spelled from it, which is how client code
// usually takes a code's type.
function vocabularyNames(open: UnionWorld, local: readonly Vocabulary[]): ReadonlyMap<string, readonly Site[]> {
  const found = open.world.referencesAt(local.map((vocabulary) => vocabulary.site));
  const aliases = local.map((_, at) => (found[at] ?? []).flatMap((site) => aliasAt(open.sources, site) ?? []));
  const aliasReferences = open.world.referencesAt(aliases.flat());
  let next = 0;
  return new Map(
    local.map((vocabulary, at) => {
      const own = found[at] ?? [];
      const viaAliases = (aliases[at] ?? []).flatMap(() => aliasReferences[next++] ?? []);
      return [siteKey(vocabulary.site), [...own, ...viaAliases]];
    }),
  );
}

function gatherReferences(open: UnionWorld, local: readonly Vocabulary[], into: Gathered): readonly Site[] {
  for (const [key, sites] of vocabularyNames(open, local)) {
    const held = into.references.get(key) ?? new Map<string, Site>();
    for (const site of sites.filter((candidate) => open.home.has(candidate.file))) {
      held.set(siteKey(site), site);
    }
    into.references.set(key, held);
  }
  const asked = local.flatMap((vocabulary) => vocabulary.members.flatMap((member) => (member.read === null ? [] : [member.read])));
  const found = open.world.referencesAt(asked);
  const reads: Site[] = [];
  for (const [at, site] of asked.entries()) {
    const held = into.references.get(siteKey(site)) ?? new Map<string, Site>();
    for (const reference of (found[at] ?? []).filter((candidate) => open.home.has(candidate.file))) {
      held.set(siteKey(reference), reference);
      reads.push(reference);
    }
    into.references.set(siteKey(site), held);
  }
  return reads;
}

function gatherWorld(open: UnionWorld, into: Gathered): void {
  const { world, home, sources } = open;
  const local = [...open.tuples.filter((tuple) => inContracts(tuple.site.file)).map((tuple) => tupleVocabulary(sources, tuple)), ...objectVocabularies(world)];
  for (const vocabulary of local) {
    if (!into.vocabularies.has(vocabulary.key)) {
      into.vocabularies.set(vocabulary.key, vocabulary);
    }
  }
  const reads = gatherReferences(open, local, into);
  const texts = new Set(local.flatMap((vocabulary) => vocabulary.members.map((member) => member.text)));
  const candidates = [
    ...open.literals.filter((literal) => literal.role === "construct" && literal.holds && texts.has(literal.text)).map((literal) => literal.site),
    ...reads.filter((site) => readRoleAt(sources.get(site.file), site.position) === "construct"),
  ].filter((site) => isProduction(site.file) && home.has(site.file) && !into.built.has(siteKey(site)));
  const carriers = reasonCarriers(world);
  if (carriers !== null) {
    into.carrierWorlds.push(world.config);
  }
  const throwing = { error: errorType(world), carriers: carriers ?? [] };
  const constructions = candidates.map((site) => {
    const source = world.source(site.file);
    return source === undefined ? null : constructionOf(getTouchingPropertyName(source, site.position));
  });
  const answers = world.batch(constructions.map((construction) => builtAt(world, construction, throwing)));
  for (const [at, site] of candidates.entries()) {
    into.built.set(siteKey(site), answers[at] ?? NOT_THROWN);
  }
  gatherSends(open, into);
}

interface SendCall {
  readonly call: Node;
  readonly name: Node;
  readonly argument: Node;
  readonly sends: readonly Send[];
}

function sendCalls(open: UnionWorld): readonly SendCall[] {
  const { world, home } = open;
  const calls: SendCall[] = [];
  for (const file of world.files.filter((source) => home.has(world.siteOf(source).file) && isProduction(world.siteOf(source).file))) {
    walk(file, (node) => {
      if (!(isCallExpression(node) && isPropertyAccessExpression(node.expression))) {
        return;
      }
      const method = node.expression.name.text;
      const sends = SENDS.filter((send) => (send.methods as readonly string[]).includes(method));
      const [argument] = node.arguments;
      if (sends.length > 0 && argument !== undefined) {
        calls.push({ call: node, name: node.expression.name, argument, sends });
      }
    });
  }
  return calls;
}

function gatherSends(open: UnionWorld, into: Gathered): void {
  const { world } = open;
  const calls = sendCalls(open);
  const symbols = world.symbolsAt(calls.map(({ name }) => name));
  const declared = calls.flatMap(({ call, argument, sends }, at) => {
    const paths = (symbols[at]?.declarations ?? []).map((handle) => handle.path);
    const send = sends.find((candidate) => paths.some((path) => path.includes(candidate.module)));
    return send === undefined ? [] : [{ call, argument, send }];
  });
  const types = world.batch(declared.map(({ argument, send }) => sentType(world, send, argument)));
  for (const [at, { call }] of declared.entries()) {
    const type = types[at];
    if (type !== undefined) {
      const where = `${world.siteOf(call).file}:${lineOf(call)}`;
      for (const field of sentFields(world, [type])) {
        into.sentBy.set(field, (into.sentBy.get(field) ?? new Set<string>()).add(where));
      }
    }
  }
}

const sortedSites = (sources: Sources, sites: Iterable<Site>): readonly string[] =>
  [...new Set([...sites].map((site) => `${site.file}:${sources.line(site)}`))].sort();

interface Judged {
  readonly throws: readonly string[];
  readonly builds: readonly string[];
  readonly carried: boolean;
  /** Whether production builds the member: the unions verdict for a tuple's literals, or a read of its constant. */
  readonly produced: boolean;
  readonly handlers: readonly string[];
  readonly clientNamed: boolean;
}

interface Lookups {
  readonly sources: Sources;
  readonly reading: UnionReading;
  readonly refs: (site: Site | null) => readonly Site[];
  readonly built: ReadonlyMap<string, Built>;
}

function judge({ sources, reading, refs, built }: Lookups, vocabulary: Vocabulary, member: CodeMember): Judged {
  const { tuple } = vocabulary;
  const literals: readonly LiteralSite[] =
    tuple === null ? [] : reading.literals.filter((literal) => literal.text === member.text && reading.names(literal, tuple));
  const own = member.read === null ? null : siteKey(member.read);
  const reads = refs(member.read)
    .filter((site) => siteKey(site) !== own)
    .map((site) => ({ site, role: readRoleAt(sources.get(site.file), site.position) }));
  const producers = [
    ...literals.filter((literal) => literal.role === "construct").map((literal) => literal.site),
    ...reads.filter(({ role }) => role === "construct").map(({ site }) => site),
  ].filter((site) => isProductionFile(site.file));
  const thrown = producers.filter((site) => built.get(siteKey(site))?.thrown === true);
  const handlers = [
    ...literals.filter((literal) => BRANCH_ROLES.has(literal.role)).map((literal) => literal.site),
    ...reads.filter(({ role }) => role !== null && BRANCH_ROLES.has(role)).map(({ site }) => site),
  ].filter((site) => inClient(site.file));
  return {
    throws: sortedSites(sources, thrown),
    builds: sortedSites(
      sources,
      producers.filter((site) => !thrown.includes(site)),
    ),
    carried: producers.some((site) => built.get(siteKey(site))?.carried === true),
    produced: (tuple !== null && reading.builds(tuple, member.text)) || producers.length > 0,
    handlers: sortedSites(sources, handlers),
    clientNamed: reads.some(({ site }) => inClient(site.file)),
  };
}

function crossings(judged: Judged, returned: boolean, named: boolean): readonly Crossing[] {
  return CROSSINGS.filter((crossing) => {
    switch (crossing) {
      case "reason":
        return judged.carried;
      case "answer":
        return returned;
      case "client":
        return named || judged.clientNamed;
      default:
        return assertNever(crossing);
    }
  });
}

function assertNever(value: never): never {
  throw new Error(`codes: unhandled crossing ${JSON.stringify(value)}`);
}

// A code vocabulary's codes and findings; null for a vocabulary nothing throws and no send returns.
function judgeVocabulary(
  lookups: Lookups,
  vocabulary: Vocabulary,
  sends: readonly string[],
): { readonly vocabulary: CodeVocabulary; readonly codes: readonly Code[]; readonly findings: readonly CodeFinding[] } | null {
  const members = vocabulary.members.map((member) => ({ member, judged: judge(lookups, vocabulary, member) }));
  const thrown = members.some(({ judged }) => judged.throws.length > 0);
  const channels = CHANNELS.filter((channel) => (channel === "thrown" ? thrown : sends.length > 0));
  if (channels.length === 0) {
    return null;
  }
  const named = lookups.refs(vocabulary.site).some((site) => inClient(site.file));
  const codes: Code[] = [];
  const findings: CodeFinding[] = [];
  for (const { member, judged } of members) {
    const crosses = crossings(judged, sends.length > 0, named);
    const live = judged.throws.length > 0 || (sends.length > 0 && judged.produced);
    const row = { key: `${vocabulary.key}.${member.text}`, file: vocabulary.site.file, line: member.line, home: vocabulary.name, member: member.text };
    codes.push({ ...row, throws: judged.throws, builds: judged.builds, crosses, handlers: judged.handlers });
    if (!live) {
      findings.push({ ...row, kind: "unthrown" });
    } else if (crosses.length > 0 && judged.handlers.length === 0) {
      findings.push({ ...row, kind: "unhandled" });
    }
  }
  return { vocabulary: { key: vocabulary.key, channels, sends }, codes, findings };
}

/** Read every package world of `root` for the codes of the closed code vocabularies in packages/contracts. */
export function scanCodes(options: ScanOptions): CodesReport {
  const gathered: Gathered = { vocabularies: new Map(), references: new Map(), built: new Map(), sentBy: new Map(), carrierWorlds: [] };
  const reading = readUnions(options, (open) => gatherWorld(open, gathered));
  const lookups: Lookups = {
    sources: reading.sources,
    reading,
    refs: (site) => (site === null ? [] : [...(gathered.references.get(siteKey(site))?.values() ?? [])]),
    built: gathered.built,
  };
  const judged = [...gathered.vocabularies.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .flatMap((vocabulary) => judgeVocabulary(lookups, vocabulary, [...(gathered.sentBy.get(memberSet(vocabulary)) ?? [])].sort()) ?? []);
  const vocabularies = judged.map(({ vocabulary }) => vocabulary);
  const codes = judged.flatMap((entry) => entry.codes);
  const findings = judged.flatMap((entry) => entry.findings);
  options.log(
    `codes: vocabularies=${gathered.vocabularies.size} code vocabularies=${vocabularies.length} reason carriers read in ${gathered.carrierWorlds.join(",") || "no world"}`,
  );
  return {
    scanned: gathered.vocabularies.size,
    vocabularies,
    codes,
    ...sortDeliberate(findings, options.deliberate),
    disagreements: [],
    limits: CODE_LIMITS,
  };
}
