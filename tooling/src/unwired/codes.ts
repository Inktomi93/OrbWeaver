// `pnpm unwired codes`: each error and refusal code of a closed code vocabulary in `packages/contracts`, with the sites that
// throw or build it, where it crosses the wire, and the client branches that name it. A vocabulary is one of codes when
// production hands a member to the code parameter the transport reads onto `data.reason`, or when a refusal field of a
// tRPC procedure's answer or an HTTP route's JSON body is typed by it. A member riding an error's detail object or a
// success answer's field is no code. A code nothing throws, or in a returned vocabulary nothing builds, is dead vocabulary; a live code that crosses
// the wire with no client branch reaches the user as a generic failure.
import type { Node } from "@typescript/native/ast";
import {
  isCallExpression,
  isIdentifier,
  isObjectLiteralExpression,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isSatisfiesExpression,
  isStringLiteral,
  isVariableDeclaration,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Type } from "@typescript/native/sync";
import { all, SignatureKind, SymbolFlags, TypeFlags } from "@typescript/native/sync";
import ts from "typescript";
import type { LiteralRole, Site, Sources } from "./classify.ts";
import { isProductionFile, nameAt, readRoleAt, siteKey } from "./classify.ts";
import type { NativeWorld } from "./native.ts";
import { constituents, hasFlag } from "./native.ts";
import type { ScanOptions } from "./scan.ts";
import { sortDeliberate } from "./scan.ts";
import { isNativeConstAssertion, nativeOracle } from "./union-oracles.ts";
import { boundParameter, declaredSites } from "./union-origins.ts";
import type { LiteralSite, Tuple, UnionReading, UnionWorld } from "./unions.ts";
import { readUnions } from "./unions.ts";
import { isProduction } from "./worlds.ts";

const CODE_KINDS = ["unthrown", "unhandled"] as const;
/** `unthrown`: nothing throws the code, and in a returned vocabulary nothing builds it either. `unhandled`: a live code
 *  crosses the wire and no client branch names it. */
type CodeKind = (typeof CODE_KINDS)[number];

const CHANNELS = ["thrown", "returned"] as const;
/** How a vocabulary's codes leave the server. `thrown`: a member is handed to a code parameter. `returned`: a refusal
 *  field of a procedure's answer or a route's JSON body is typed by the vocabulary. */
type Channel = (typeof CHANNELS)[number];

const CROSSINGS = ["reason", "answer", "client"] as const;
/** Where a code crosses to the client. `reason`: a throw hands it to the code the transport carries on `data.reason`.
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

// How many parameter hand-offs a code is followed through: a helper, a subclass constructor and its `super` call.
const MAX_HOPS = 6;

/** The statuses a refusal body is sent with, client and server errors. */
const REFUSAL_STATUS = { min: 400, max: 599 } as const;

// Joins a field's sorted literal texts into one key; a code never holds it.
const TEXT_JOIN = "|";

const BRANCH_ROLES: ReadonlySet<LiteralRole | "record-key"> = new Set<LiteralRole | "record-key">(["case", "compare", "key", "record-key"]);

/** What the codes scan cannot see, printed with every run. */
const CODE_LIMITS: readonly string[] = [
  "A vocabulary is an `as const` string tuple the unions scan reads, or an `as const` object whose every value is a string literal, declared in packages/contracts/src; a code vocabulary declared in a server domain is not read.",
  "A member is thrown only as an argument the resolved signature binds to a code parameter: a constructor parameter of a class domainReason in packages/server/src/transport/trpc/error-mapping.ts tests that is, or is stored into, the property it reads, or a parameter a function hands on, as or inside an argument, to one, followed a fixed number of hand-offs. A member in an object literal argument (a detail object), a binding thrown later, or a class the transport does not carry is no thrown code.",
  "A member of an object vocabulary is built only by a read of its property (`CODES.x`); a literal that spells its text builds nothing, nor names a branch.",
  "A returned vocabulary types a refusal field: one whose string literals are exactly its members, in a value a tRPC resolver returns or a Hono `json` call sends, followed through unions, type arguments and properties to a fixed depth. A refusal field is (a) carried only by the members of an object union whose boolean literal discriminant is `false`, (b) the one vocabulary field of an object that may be null or undefined and holds one required string sentence and nothing else required, or (c) any vocabulary field of a `json` body sent with a status typed by 4xx and 5xx literals only. Any other field, an optional one included, is no code; a socket frame or a hand-written response is not followed.",
  "A client branch is a case label, an equality or membership operand, or a key, written as a literal in the member's vocabulary or as a read of the member's constant. A literal compared to a value typed `string`, such as `trpcErrorReason(error)`, is no checker link, so it names no branch.",
  "A throw is read only in a world that holds the error mapping.",
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

// The argument a value stands as, through parentheses, assertions and a conditional's branch, by its start; null for a
// value that is no argument. A property of an object literal argument is no argument: a member riding a detail object
// is no code.
function argumentAt(sources: Sources, site: Site): Site | null {
  const source = sources.get(site.file);
  const start = nameAt(source, site.position);
  if (start === undefined) {
    return null;
  }
  let node: ts.Node = ts.isPropertyAccessExpression(start.parent) && start.parent.name === start ? start.parent : start;
  while (handsOn(node)) {
    node = node.parent;
  }
  const { parent } = node;
  const argument = node;
  const bound = (ts.isCallExpression(parent) || ts.isNewExpression(parent)) && (parent.arguments ?? []).some((candidate) => candidate === argument);
  return bound ? { file: site.file, position: node.getStart(source) } : null;
}

const handsOn = (node: ts.Node): boolean =>
  ts.isParenthesizedExpression(node.parent) ||
  ts.isAsExpression(node.parent) ||
  ts.isSatisfiesExpression(node.parent) ||
  ts.isNonNullExpression(node.parent) ||
  (ts.isConditionalExpression(node.parent) && node.parent.condition !== node);

// The nodes of domainReason the code read is found from: the classes it tests with `instanceof` and the properties it reads.
function reasonReads(sources: Sources): { readonly classes: readonly Site[]; readonly properties: readonly Site[] } {
  const source = sources.get(REASON_CARRIER.file);
  const functions = source.statements.filter((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === REASON_CARRIER.name);
  if (functions.length === 0) {
    throw new Error(`${REASON_CARRIER.file}: no ${REASON_CARRIER.name} names the classes the transport carries on data.reason`);
  }
  const classes: Site[] = [];
  const properties: Site[] = [];
  const at = (node: ts.Node): Site => ({ file: REASON_CARRIER.file, position: node.getStart(source) });
  const visit = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword) {
      classes.push(at(node.right));
    } else if (ts.isPropertyAccessExpression(node)) {
      properties.push(at(node.name));
    }
    ts.forEachChild(node, visit);
  };
  functions.forEach(visit);
  return { classes, properties };
}

// A carrier constructor's parameters that are, or are assigned to, a property the code read names, by site key.
function carrierParameters(sources: Sources, carrier: Site, read: ReadonlySet<string>): readonly string[] {
  const source = sources.get(carrier.file);
  const declaration = nameAt(source, carrier.position)?.parent;
  const initializer = declaration !== undefined && ts.isClassDeclaration(declaration) ? declaration.members.find(ts.isConstructorDeclaration) : undefined;
  if (declaration === undefined || !ts.isClassDeclaration(declaration) || initializer === undefined) {
    return [];
  }
  const key = (node: ts.Node): string => siteKey({ file: carrier.file, position: node.getStart(source) });
  const parameters = initializer.parameters.filter((parameter) => ts.isIdentifier(parameter.name));
  const readNames = new Set(
    declaration.members.filter(ts.isPropertyDeclaration).flatMap((member) => (read.has(key(member.name)) ? [member.name.getText(source)] : [])),
  );
  const assigned = new Set<string>();
  const visit = (node: ts.Node): void => {
    const store = ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken ? node : null;
    if (
      store !== null &&
      ts.isPropertyAccessExpression(store.left) &&
      store.left.expression.kind === ts.SyntaxKind.ThisKeyword &&
      readNames.has(store.left.name.text) &&
      ts.isIdentifier(store.right)
    ) {
      assigned.add(store.right.text);
    }
    ts.forEachChild(node, visit);
  };
  if (initializer.body !== undefined) {
    visit(initializer.body);
  }
  return parameters
    .filter((parameter) => read.has(key(parameter.name)) || assigned.has(parameter.name.getText(source)))
    .map((parameter) => key(parameter.name));
}

// The code parameters the transport's read starts from: each carrier constructor's parameter that is, or is stored into,
// the property domainReason reads. Null when the world does not hold the error mapping.
function codeSeeds(world: NativeWorld, sources: Sources): ReadonlySet<string> | null {
  if (!world.has(REASON_CARRIER.file)) {
    return null;
  }
  const { classes, properties } = reasonReads(sources);
  const oracle = nativeOracle(world);
  const declared = world.batch([...classes, ...properties].map((site) => declaredSites(oracle, site)));
  const read = new Set(declared.slice(classes.length).flat().map(siteKey));
  return new Set(
    declared
      .slice(0, classes.length)
      .flat()
      .flatMap((carrier) => carrierParameters(sources, carrier, read)),
  );
}

// The arguments the function declaring the parameter at `site` hands it on in: any call or construction in its body
// with an argument that names the parameter, the parameter itself or inside another call (`super(reasonOf(code))`).
function forwardedArguments(sources: Sources, site: Site): readonly Site[] {
  if (!isProductionFile(site.file)) {
    return [];
  }
  const source = sources.get(site.file);
  const name = nameAt(source, site.position);
  const owner = name?.parent.parent;
  if (name === undefined || !ts.isIdentifier(name) || owner === undefined || !ts.isFunctionLike(owner)) {
    return [];
  }
  const body = (owner as ts.FunctionLikeDeclaration).body;
  const names = (argument: ts.Node): boolean => {
    let found = false;
    const visit = (node: ts.Node): void => {
      const member = ts.isPropertyAccessExpression(node.parent) && node.parent.name === node;
      found ||= ts.isIdentifier(node) && node.text === name.text && !member;
      ts.forEachChild(node, visit);
    };
    visit(argument);
    return found;
  };
  const forwarded: Site[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      for (const argument of (node.arguments ?? []).filter(names)) {
        forwarded.push({ file: site.file, position: argument.getStart(source) });
      }
    }
    ts.forEachChild(node, visit);
  };
  if (body !== undefined) {
    visit(body);
  }
  return forwarded;
}

// Whether each argument binds a parameter that reaches a seed: a seed, or a parameter its function hands on into an
// argument that binds one, followed MAX_HOPS deep.
function codeArguments(world: NativeWorld, sources: Sources, seeds: ReadonlySet<string>, asked: readonly Site[]): readonly boolean[] {
  const oracle = nativeOracle(world);
  const bound = new Map<string, string | null>();
  const forwards = new Map<string, readonly Site[]>();
  let pending = asked;
  for (let hop = 0; hop < MAX_HOPS && pending.length > 0; hop += 1) {
    const fresh = [...new Map(pending.filter((site) => !bound.has(siteKey(site))).map((site) => [siteKey(site), site])).values()];
    const parameters = world.batch(fresh.map((site) => boundParameter(oracle, site)));
    const next: Site[] = [];
    for (const [at, site] of fresh.entries()) {
      const parameter = parameters[at] ?? null;
      bound.set(siteKey(site), parameter === null ? null : siteKey(parameter));
      if (parameter !== null && !seeds.has(siteKey(parameter)) && !forwards.has(siteKey(parameter))) {
        const handed = forwardedArguments(sources, parameter);
        forwards.set(siteKey(parameter), handed);
        next.push(...handed);
      }
    }
    pending = next;
  }
  const reaches = (parameter: string, seen: ReadonlySet<string>): boolean =>
    seeds.has(parameter) ||
    (!seen.has(parameter) &&
      (forwards.get(parameter) ?? []).some((argument) => {
        const next = bound.get(siteKey(argument));
        return next !== undefined && next !== null && reaches(next, new Set([...seen, parameter]));
      }));
  return asked.map((site) => {
    const parameter = bound.get(siteKey(site));
    return parameter !== undefined && parameter !== null && reaches(parameter, new Set());
  });
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

const isNullish = (type: Type): boolean => hasFlag(type.flags, TypeFlags.Undefined) || hasFlag(type.flags, TypeFlags.Null);

function* fieldTexts(field: Type): APIRequestGenerator<string | null> {
  const members = (yield* constituents(field)).filter((member) => !isNullish(member));
  const texts = members.flatMap((member) => (member.isStringLiteralType() ? [member.value] : []));
  return texts.length > 0 && texts.length === members.length ? [...new Set(texts)].sort().join(TEXT_JOIN) : null;
}

/** One property of a sent object type. */
interface Field {
  readonly name: string;
  readonly optional: boolean;
  readonly type: Type;
  /** Its string literals sorted and joined by {@link TEXT_JOIN} when its type is a union of them, else null. */
  readonly texts: string | null;
  /** Whether its type is `string`: a sentence. */
  readonly sentence: boolean;
  /** Its boolean literal, for a discriminant such as `ok: false`, else null. */
  readonly flag: boolean | null;
}

function* fieldsOf(world: NativeWorld, type: Type): APIRequestGenerator<readonly Field[]> {
  const { checker } = world;
  const properties = yield* checker.getPropertiesOfType.gen(type);
  const types = properties.length === 0 ? [] : yield* checker.getTypeOfSymbol.gen(properties);
  const texts = yield* all(...types.map(fieldTexts));
  return properties.flatMap((property, at): Field[] => {
    const field = types[at];
    return field === undefined
      ? []
      : [
          {
            name: property.name,
            optional: hasFlag(property.flags, SymbolFlags.Optional),
            type: field,
            texts: texts[at] ?? null,
            sentence: hasFlag(field.flags, TypeFlags.String),
            flag: field.isBooleanLiteralType() ? field.value : null,
          },
        ];
  });
}

function* isData(type: Type): APIRequestGenerator<boolean> {
  return type.isObjectType() && (yield* type.getCallSignatures.gen()).length === 0;
}

// (a) A union of objects split by a boolean literal discriminant: a vocabulary field only the members whose discriminant
// is `false` carry is a refusal's code.
function discriminatedRefusals(shapes: readonly (readonly Field[])[]): readonly string[] {
  if (shapes.length < 2) {
    return [];
  }
  const fieldOf = (shape: readonly Field[], name: string): Field | undefined => shape.find((field) => field.name === name);
  const discriminants = (shapes[0] ?? [])
    .filter((field) => shapes.every((shape) => (fieldOf(shape, field.name)?.flag ?? null) !== null))
    .map((field) => field.name);
  return discriminants.flatMap((name) => {
    const failing = shapes.filter((shape) => fieldOf(shape, name)?.flag === false);
    const passing = shapes.filter((shape) => fieldOf(shape, name)?.flag === true);
    if (failing.length === 0 || passing.length === 0) {
      return [];
    }
    const succeeds = new Set(passing.flatMap((shape) => shape.map((field) => field.name)));
    return failing.flatMap((shape) => shape.flatMap((field) => (field.texts !== null && !succeeds.has(field.name) ? [field.texts] : [])));
  });
}

// (b) A coded notice that may be absent: `O | null` or `O | undefined`, where O holds one vocabulary field, one required
// sentence, and nothing else that is required.
function noticeRefusal(shape: readonly Field[]): readonly string[] {
  const coded = shape.filter((field) => field.texts !== null);
  const sentences = shape.filter((field) => field.sentence && !field.optional);
  const rest = shape.filter((field) => !(coded.includes(field) || sentences.includes(field)));
  const [code] = coded;
  return code?.texts !== null && code !== undefined && coded.length === 1 && sentences.length === 1 && rest.every((field) => field.optional)
    ? [code.texts]
    : [];
}

function* unionRefusals(world: NativeWorld, members: readonly Type[]): APIRequestGenerator<readonly string[]> {
  const data = yield* all(...members.map(isData));
  const objects = members.filter((_, at) => data[at] === true);
  const shapes = yield* all(...objects.map((member) => fieldsOf(world, member)));
  const [only] = shapes;
  const notice = members.some(isNullish) && shapes.length === 1 && only !== undefined ? noticeRefusal(only) : [];
  return [...discriminatedRefusals(shapes), ...notice];
}

interface Explored {
  /** The refusal fields this step finds, each as its sorted texts joined by {@link TEXT_JOIN}. */
  readonly fields: readonly string[];
  readonly next: readonly Type[];
}

// One step into a sent type: a union's members, a reference's type arguments and an object's properties. A callable
// type is a method, never data. `everyField` holds for a refusal body, where each vocabulary field is a refusal's.
function* explore(world: NativeWorld, type: Type, everyField: boolean): APIRequestGenerator<Explored> {
  if (type.isUnionType()) {
    const members = yield* type.getTypes.gen();
    return { fields: yield* unionRefusals(world, members), next: members };
  }
  if (!(yield* isData(type))) {
    return { fields: [], next: [] };
  }
  const args = type.isTypeReference() ? yield* world.checker.getTypeArguments.gen(type) : [];
  const fields = yield* fieldsOf(world, type);
  return { fields: everyField ? fields.flatMap((field) => field.texts ?? []) : [], next: [...args, ...fields.map((field) => field.type)] };
}

// Every refusal field inside the sent types, breadth first to MAX_DEPTH, each type explored once.
function sentFields(world: NativeWorld, roots: readonly Type[], everyField: boolean): ReadonlySet<string> {
  const seen = new Set<number>();
  const fields = new Set<string>();
  let level = roots;
  for (let depth = 0; depth < MAX_DEPTH && level.length > 0; depth += 1) {
    const fresh = [...new Map(level.filter((type) => !seen.has(type.id)).map((type) => [type.id, type])).values()];
    for (const type of fresh) {
      seen.add(type.id);
    }
    const explored = world.batch(fresh.map((type) => explore(world, type, everyField)));
    for (const field of explored.flatMap((step) => step.fields)) {
      fields.add(field);
    }
    level = explored.flatMap((step) => step.next);
  }
  return fields;
}

// (c) A body sent with a status whose type is client and server error literals only.
function* refusalStatus(world: NativeWorld, status: Node | undefined): APIRequestGenerator<boolean> {
  if (status === undefined) {
    return false;
  }
  const members = yield* constituents(yield* world.checker.getTypeAtLocation.gen(status));
  return members.every((member) => member.isNumberLiteralType() && member.value >= REFUSAL_STATUS.min && member.value <= REFUSAL_STATUS.max);
}

const memberSet = (vocabulary: Vocabulary): string => [...new Set(vocabulary.members.map((member) => member.text))].sort().join(TEXT_JOIN);

interface Gathered {
  readonly vocabularies: Map<string, Vocabulary>;
  /** Every reference to a vocabulary's name or a member's read name, by the asked site's key. */
  readonly references: Map<string, Map<string, Site>>;
  /** Whether each production site that builds a member hands it to a code parameter, by site key. */
  readonly thrown: Map<string, boolean>;
  /** The sends whose value has a refusal field of each literal set, by set. */
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
  ].filter((site) => isProduction(site.file) && home.has(site.file) && !into.thrown.has(siteKey(site)));
  const seeds = codeSeeds(world, sources);
  if (seeds !== null) {
    into.carrierWorlds.push(world.config);
    const argumentsAt = candidates.map((site) => argumentAt(sources, site));
    const asked = argumentsAt.filter((site) => site !== null);
    const answers = codeArguments(world, sources, seeds, asked);
    const coded = new Set(asked.filter((_, at) => answers[at] === true).map(siteKey));
    for (const [at, site] of candidates.entries()) {
      const argument = argumentsAt[at];
      into.thrown.set(siteKey(site), argument !== null && argument !== undefined && coded.has(siteKey(argument)));
    }
  }
  gatherSends(open, into);
}

interface SendCall {
  readonly call: Node;
  readonly name: Node;
  readonly argument: Node;
  readonly status: Node | undefined;
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
      const [argument, status] = node.arguments;
      if (sends.length > 0 && argument !== undefined) {
        calls.push({ call: node, name: node.expression.name, argument, status, sends });
      }
    });
  }
  return calls;
}

function gatherSends(open: UnionWorld, into: Gathered): void {
  const { world } = open;
  const calls = sendCalls(open);
  const symbols = world.symbolsAt(calls.map(({ name }) => name));
  const declared = calls.flatMap(({ call, argument, status, sends }, at) => {
    const paths = (symbols[at]?.declarations ?? []).map((handle) => handle.path);
    const send = sends.find((candidate) => paths.some((path) => path.includes(candidate.module)));
    return send === undefined ? [] : [{ call, argument, status, send }];
  });
  const types = world.batch(declared.map(({ argument, send }) => sentType(world, send, argument)));
  const refusals = world.batch(
    declared.map(({ status, send }) => (send.value === "argument" ? refusalStatus(world, status) : refusalStatus(world, undefined))),
  );
  for (const [at, { call }] of declared.entries()) {
    const type = types[at];
    if (type !== undefined) {
      const where = `${world.siteOf(call).file}:${lineOf(call)}`;
      for (const field of sentFields(world, [type], refusals[at] === true)) {
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
  /** Whether production builds the member: the unions verdict for a tuple's literals, or a read of its constant. */
  readonly produced: boolean;
  readonly handlers: readonly string[];
  readonly clientNamed: boolean;
}

interface Lookups {
  readonly sources: Sources;
  readonly reading: UnionReading;
  readonly refs: (site: Site | null) => readonly Site[];
  readonly thrown: ReadonlyMap<string, boolean>;
}

function judge({ sources, reading, refs, thrown: throwsAt }: Lookups, vocabulary: Vocabulary, member: CodeMember): Judged {
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
  const thrown = producers.filter((site) => throwsAt.get(siteKey(site)) === true);
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
    produced: (tuple !== null && reading.builds(tuple, member.text)) || producers.length > 0,
    handlers: sortedSites(sources, handlers),
    clientNamed: reads.some(({ site }) => inClient(site.file)),
  };
}

function crossings(judged: Judged, returned: boolean, named: boolean): readonly Crossing[] {
  return CROSSINGS.filter((crossing) => {
    switch (crossing) {
      case "reason":
        return judged.throws.length > 0;
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
  const gathered: Gathered = { vocabularies: new Map(), references: new Map(), thrown: new Map(), sentBy: new Map(), carrierWorlds: [] };
  const reading = readUnions(options, (open) => gatherWorld(open, gathered));
  const lookups: Lookups = {
    sources: reading.sources,
    reading,
    refs: (site) => (site === null ? [] : [...(gathered.references.get(siteKey(site))?.values() ?? [])]),
    thrown: gathered.thrown,
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
