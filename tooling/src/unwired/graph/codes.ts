// `pnpm unwired codes`: each error and refusal code of a closed code vocabulary in `packages/contracts`, with the sites that
// throw or build it, where it crosses the wire, and the client branches that name it, read off the graph session's one
// merged program (D357). A vocabulary is one of codes when production hands a member to the code parameter the transport
// reads onto `data.reason`, or when a refusal field of a tRPC procedure's answer or an HTTP route's JSON body is typed by
// it. A member riding an error's detail object or a success answer's field is no code. A code nothing throws, or in a
// returned vocabulary nothing on the server builds, is dead vocabulary; a live code with no client branch reaches the
// user as a generic failure.
//
// - Tuples, literal sites and whether a literal names a tuple's member come from the unions reader (./unions.ts); a
//   reference's role comes from roles.ts, so codes and unions read one literal and one reference the same way.
// - The report keeps the per-world scan's buckets except `disagreements`: the graph is one engine, so no second engine
//   can disagree with it.
import type { ElementAccessExpression, Expression, Node, ParameterDeclaration, SourceFile } from "@typescript/native/ast";
import {
  isArrayLiteralExpression,
  isAsExpression,
  isBinaryExpression,
  isCallExpression,
  isClassDeclaration,
  isConditionalExpression,
  isConstructorDeclaration,
  isElementAccessExpression,
  isFunctionDeclaration,
  isFunctionLikeDeclaration,
  isIdentifier,
  isNewExpression,
  isNonNullExpression,
  isObjectLiteralExpression,
  isParameterDeclaration,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isPropertyDeclaration,
  isSatisfiesExpression,
  isSourceFile,
  isStatement,
  isStringLiteral,
  isTypeAliasDeclaration,
  isVariableDeclaration,
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Type } from "@typescript/native/sync";
import { all, SignatureKind, SymbolFlags, TypeFlags } from "@typescript/native/sync";
import type { DeliberateEntry } from "../deliberate.ts";
import { sortRows } from "../deliberate.ts";
import type { JudgedEntry, JudgedSplit } from "../judged.ts";
import type { NativeWorld } from "../native.ts";
import { constituents, hasFlag } from "../native.ts";
import { isProduction } from "../worlds.ts";
import type { Graph } from "./build.ts";
import type { GraphLog } from "./options.ts";
import type { LiteralRole } from "./roles.ts";
import { sameNode, valueRole, valueUse } from "./roles.ts";
import { productReader } from "./state.ts";
import { boundParameter, declarationsOf, isConstAssertion, nodeKey } from "./union-slots.ts";
import type { UnionLiteral, UnionReading, UnionTuple } from "./unions.ts";
import { lineOf, readUnionsOnGraph } from "./unions.ts";

const CODE_KINDS = ["unthrown", "unhandled"] as const;
/** `unthrown`: nothing throws the code, and in a returned vocabulary nothing builds it either. `unhandled`: a live code
 *  crosses the wire and no client branch names it. */
type CodeKind = (typeof CODE_KINDS)[number];

const CHANNELS = ["thrown", "returned", "framed"] as const;
/** How a vocabulary's codes leave the server. `thrown`: a member is handed to a code parameter. `returned`: a refusal
 *  field of a procedure's answer or a route's JSON body is typed by the vocabulary. `framed`: a refusal field of a frame
 *  a subscription yields down the stream socket is typed by it. */
type Channel = (typeof CHANNELS)[number];

const CROSSINGS = ["reason", "answer", "frame", "client"] as const;
/** Where a code crosses to the client. `reason`: a throw hands it to the code the transport carries on `data.reason`.
 *  `answer`: its vocabulary types a field of a procedure's answer or a route's body. `frame`: it types a refusal field
 *  of a stream socket frame. `client`: client code names it. */
type Crossing = (typeof CROSSINGS)[number];

const CONTRACTS = "packages/contracts/src/";
const CLIENT = "packages/client/src/";

/** The transport function whose `instanceof` tests name the error classes whose code rides `data.reason`. */
const REASON_CARRIER = { file: "packages/server/src/transport/trpc/error-mapping.ts", name: "domainReason" } as const;

/** The library calls that send a value to the client: a tRPC procedure's resolver answers with its return, and a Hono
 *  context's `json` sends its first argument as the body. Each is known by the module that declares the method. */
const SENDS = [
  { module: "/@trpc/server/", methods: ["query", "mutation"], value: "return" },
  { module: "/@trpc/server/", methods: ["subscription"], value: "frames" },
  { module: "/hono/", methods: ["json"], value: "argument" },
] as const;
type Send = (typeof SENDS)[number];

/** The statuses a refusal body is sent with, client and server errors. */
const REFUSAL_STATUS = { min: 400, max: 599 } as const;

// Joins a field's sorted literal texts into one key; a code never holds it.
const TEXT_JOIN = "|";

type BranchRole = LiteralRole | "record-key";
const BRANCH_ROLES: ReadonlySet<BranchRole> = new Set<BranchRole>(["case", "compare", "key", "record-key"]);

/** The collections whose elements a later `has` or `get` tests a code against, and those methods. */
const MEMBERSHIP_COLLECTIONS: ReadonlySet<string> = new Set(["Set", "Map"]);
const MEMBERSHIP_READS: ReadonlySet<string> = new Set(["has", "get"]);

/** What the codes scan cannot see, printed with every run. */
const CODE_LIMITS: readonly string[] = [
  "A vocabulary is an `as const` string tuple the unions reader reads, or an `as const` object whose every value is a string literal, declared in packages/contracts/src; a code vocabulary declared in a server domain is not read.",
  "A member is thrown only as an argument the resolved signature binds to a code parameter: a constructor parameter of a class domainReason in packages/server/src/transport/trpc/error-mapping.ts tests that is, or is stored into, the property it reads, or a parameter a function hands on, as or inside an argument, to one, followed through every hand-off. A member a parameter defaults to (`refusal: Code = CODES.x`) is handed to that parameter. A function hands a parameter on when an argument is the parameter, or names it and no other parameter of that function (`super(reasonOf(code))`, never `super(tag(code, level))`). A member in an object literal argument (a detail object), a binding thrown later, or a class the transport does not carry is no thrown code.",
  "A member of an object vocabulary is built only by a read of its property (`CODES.x`); a literal that spells its text builds nothing, nor names a branch.",
  "A returned vocabulary types a refusal field: one whose string literals are exactly its members, in a value a tRPC resolver returns or a Hono `json` call sends, followed through unions, type arguments and properties, each type read once. A coded refusal is an object with one vocabulary field, one required string sentence and nothing else required. A refusal field is (a) the code of a coded refusal on the `false` members of an object union split by a boolean literal discriminant, where no `true` member carries a vocabulary field and no `false` member carries a field a `true` member carries; (b) the code of a coded refusal reached as `O | null`, never an optional or `undefined` one; or (c) the one vocabulary field at the top of a `json` body sent with a status typed by 4xx and 5xx literals only. A subscription's frames are read the same way, and also (d): in one object member of a frame union, the one vocabulary field beside one required string sentence, setting aside the tags typed by one string literal, such as `channel` and `type`. Any other field is no code; a hand-written response is not followed.",
  "A client branch is a case label, an equality or membership operand, or a key, written as a literal in the member's vocabulary or as a read of the member's constant; an element of a `new Set([...])` or a key of a `new Map([...])` whose binding any file, its own or one that imports it, tests with `has` or `get`; or an element access, by a value typed by the whole vocabulary, into a table with a property for every member. A literal compared to a value typed `string`, such as `trpcErrorReason(error)`, is no checker link, so it names no branch.",
  "A throw is read only when the merged program holds the error mapping. A client construction never builds a code.",
];

interface CodeMember {
  readonly text: string;
  readonly line: number;
  /** The name production reads the member through, a map property or a named constant; null for a spelled literal. */
  readonly read: Node | null;
}

interface Vocabulary {
  readonly key: string;
  readonly name: string;
  readonly file: string;
  readonly nameNode: Node;
  readonly members: readonly CodeMember[];
  /** The unions reader's tuple, whose literal sites and verdict the member judgement reuses; null for an object vocabulary. */
  readonly tuple: UnionTuple | null;
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
  /** The subscriptions whose frames have a refusal field the vocabulary types, `file:line`. */
  readonly frames: readonly string[];
}

export interface CodesReport {
  /** Every vocabulary read in packages/contracts. */
  readonly scanned: number;
  readonly vocabularies: readonly CodeVocabulary[];
  readonly codes: readonly Code[];
  readonly unwired: readonly CodeFinding[];
  readonly deliberate: readonly (CodeFinding & { readonly reason: string })[];
  /** Rows a board item owns, with the item. */
  readonly judged: JudgedSplit<CodeFinding>["judged"];
  /** Judged entries whose row no longer reports or whose item is no longer open. */
  readonly staleJudged: JudgedSplit<CodeFinding>["staleJudged"];
  readonly limits: readonly string[];
}

/** The rulings a codes run sorts its rows by: the deliberate list, and the judged list read against `root`'s board. */
export interface CodesJudging {
  readonly root: string;
  readonly deliberate: readonly DeliberateEntry[];
  readonly judged?: readonly JudgedEntry[];
}

const inContracts = (file: string): boolean => file.startsWith(CONTRACTS) && isProduction(file);
const inClient = (file: string): boolean => file.startsWith(CLIENT);

// Through parentheses, assertions and a conditional's branch: what a value is handed on as.
const handsOn = (node: Node): boolean =>
  isParenthesizedExpression(node.parent) ||
  isAsExpression(node.parent) ||
  isSatisfiesExpression(node.parent) ||
  isNonNullExpression(node.parent) ||
  (isConditionalExpression(node.parent) && !sameNode(node.parent.condition, node));

// A name that ends `x.name` stands for the access; any other node for itself.
const accessOf = (node: Node): Node => (isPropertyAccessExpression(node.parent) && sameNode(node.parent.name, node) ? node.parent : node);

function handedValue(node: Node): Node {
  let at = accessOf(node);
  while (handsOn(at)) {
    at = at.parent;
  }
  return at;
}

function walk(root: Node, visit: (node: Node) => void): void {
  const step = (node: Node): void => {
    visit(node);
    node.forEachChild(step);
  };
  root.forEachChild(step);
}

/** One codes run: the merged world, the node keys and the files it reads. */
class CodesRun {
  readonly world: NativeWorld;
  readonly sources: readonly { readonly file: string; readonly source: SourceFile }[];

  constructor(world: NativeWorld, graph: Graph) {
    this.world = world;
    this.sources = graph.files.filter(productReader).flatMap((file) => {
      const source = world.source(file);
      return source === undefined ? [] : [{ file, source }];
    });
  }

  key(node: Node): string {
    return nodeKey(node);
  }

  fileOf(node: Node): string {
    return this.world.fileOfSource(node.getSourceFile());
  }

  where(node: Node): string {
    return `${this.fileOf(node)}:${String(lineOf(node))}`;
  }

  /** Every reference find-references reports for each asked name, the asked node itself left out. */
  references(asked: readonly Node[]): readonly (readonly Node[])[] {
    const { world } = this;
    const groups = world.batch(asked.map((node) => world.referencedSymbolsOf(node)));
    const handles = groups.map((entries) => entries.flatMap(({ references }) => references).filter((handle) => world.fileOf(handle) !== null));
    const nodes = world.batch(handles.flat().map((handle) => handle.resolve.gen()));
    let at = 0;
    return handles.map((list, x) => {
      const own = asked[x];
      const found = nodes
        .slice(at, at + list.length)
        .filter((node): node is Node => node !== undefined && !(own !== undefined && this.key(node) === this.key(own)));
      at += list.length;
      return [...new Map(found.map((node) => [this.key(node), node])).values()];
    });
  }
}

// What a reference to a member's read name does with the value, as a literal there would: null in a type position, a
// declaration or a store.
function readRole(node: Node): LiteralRole | null {
  const use = valueUse(node);
  return use === "type" || use === "define" || use === "store" ? null : valueRole(accessOf(node));
}

// The name a tuple element is read through: a constant, or the property a member access names. A spelled literal has none.
function elementRead(element: Expression): Node | null {
  if (isIdentifier(element)) {
    return element;
  }
  return isPropertyAccessExpression(element) ? element.name : null;
}

const tupleVocabulary = (tuple: UnionTuple): Vocabulary => ({
  key: tuple.key,
  name: tuple.name,
  file: tuple.site.file,
  nameNode: tuple.nameNode,
  members: tuple.members.map((member) => ({ text: member.text, line: member.line, read: elementRead(member.element) })),
  tuple,
});

// `const NAME = { key: "text", ... } as const` with at least one property, every one a string literal.
function objectVocabulary(file: string, node: Node): Vocabulary | null {
  if (!(isVariableDeclaration(node) && isIdentifier(node.name) && node.initializer !== undefined)) {
    return null;
  }
  let value: Node = node.initializer;
  while (isParenthesizedExpression(value) || isSatisfiesExpression(value)) {
    value = value.expression;
  }
  const object = isConstAssertion(value) ? value.expression : null;
  if (object === null || !isObjectLiteralExpression(object) || object.properties.length === 0) {
    return null;
  }
  const members = object.properties.flatMap((property): CodeMember[] =>
    isPropertyAssignment(property) && isIdentifier(property.name) && isStringLiteral(property.initializer)
      ? [{ text: property.initializer.text, line: lineOf(property), read: property.name }]
      : [],
  );
  return members.length === object.properties.length
    ? { key: `${file}:${node.name.text}`, name: node.name.text, file, nameNode: node.name, members, tuple: null }
    : null;
}

function objectVocabularies(run: CodesRun): readonly Vocabulary[] {
  const found: Vocabulary[] = [];
  for (const { file, source } of run.sources.filter(({ file: path }) => inContracts(path))) {
    walk(source, (node) => {
      const vocabulary = objectVocabulary(file, node);
      if (vocabulary !== null) {
        found.push(vocabulary);
      }
    });
  }
  return found;
}

// The argument a value stands as, through parentheses, assertions and a conditional's branch; null for a value that is
// no argument. A property of an object literal argument is no argument: a member riding a detail object is no code.
function argumentAt(node: Node): Node | null {
  const value = handedValue(node);
  const { parent } = value;
  const bound = (isCallExpression(parent) || isNewExpression(parent)) && (parent.arguments ?? []).some((candidate) => sameNode(candidate, value));
  return bound ? value : null;
}

// The parameter a value is the default of, `refusal: Code = CODES.x`; null for any other value. A call that omits the
// argument hands the default to the parameter.
function defaultedParameter(node: Node): ParameterDeclaration | null {
  const value = handedValue(node);
  const { parent } = value;
  return isParameterDeclaration(parent) && sameNode(parent.initializer, value) && isIdentifier(parent.name) ? parent : null;
}

// The classes domainReason tests with `instanceof` and the property names it reads.
function reasonReads(run: CodesRun): { readonly classes: readonly Node[]; readonly properties: readonly Node[] } | null {
  const source = run.world.source(REASON_CARRIER.file);
  if (source === undefined) {
    return null;
  }
  const functions = source.statements.filter((statement) => isFunctionDeclaration(statement) && statement.name?.text === REASON_CARRIER.name);
  if (functions.length === 0) {
    throw new Error(`${REASON_CARRIER.file}: no ${REASON_CARRIER.name} names the classes the transport carries on data.reason`);
  }
  const classes: Node[] = [];
  const properties: Node[] = [];
  const visit = (node: Node): void => {
    if (isBinaryExpression(node) && node.operatorToken.kind === SyntaxKind.InstanceOfKeyword) {
      classes.push(node.right);
    } else if (isPropertyAccessExpression(node)) {
      properties.push(node.name);
    }
    node.forEachChild(visit);
  };
  for (const declaration of functions) {
    visit(declaration);
  }
  return { classes, properties };
}

// A carrier constructor's parameters that are, or are assigned to, a property the code read names.
// `read` holds the keys of the declaration names the code read resolves to; `name` is a carrier class's name.
function carrierParameters(run: CodesRun, name: Node, read: ReadonlySet<string>): readonly ParameterDeclaration[] {
  const carrier = name.parent;
  if (!isClassDeclaration(carrier)) {
    return [];
  }
  const initializer = carrier.members.find(isConstructorDeclaration);
  if (initializer === undefined) {
    return [];
  }
  const parameters = initializer.parameters.filter((parameter) => isIdentifier(parameter.name));
  const readNames = new Set(
    carrier.members.filter(isPropertyDeclaration).flatMap((member) => (read.has(run.key(member.name)) && isIdentifier(member.name) ? [member.name.text] : [])),
  );
  const assigned = new Set<string>();
  const visit = (node: Node): void => {
    if (
      isBinaryExpression(node) &&
      node.operatorToken.kind === SyntaxKind.EqualsToken &&
      isPropertyAccessExpression(node.left) &&
      node.left.expression.kind === SyntaxKind.ThisKeyword &&
      readNames.has(node.left.name.text) &&
      isIdentifier(node.right)
    ) {
      assigned.add(node.right.text);
    }
    node.forEachChild(visit);
  };
  if (initializer.body !== undefined) {
    visit(initializer.body);
  }
  return parameters.filter((parameter) => read.has(run.key(parameter.name)) || (isIdentifier(parameter.name) && assigned.has(parameter.name.text)));
}

// The code parameters the transport's read starts from, by key; null when the program does not hold the error mapping.
function codeSeeds(run: CodesRun): ReadonlySet<string> | null {
  const reads = reasonReads(run);
  if (reads === null) {
    return null;
  }
  const { classes, properties } = reads;
  const declared = run.world.batch([...classes, ...properties].map((node) => declarationsOf(run.world, node)));
  const read = new Set(
    declared
      .slice(classes.length)
      .flat()
      .map((node) => run.key(node)),
  );
  return new Set(
    declared
      .slice(0, classes.length)
      .flat()
      .flatMap((carrier) => carrierParameters(run, carrier, read))
      .map((parameter) => run.key(parameter)),
  );
}

// The arguments the function declaring `parameter` hands it on in: any call or construction in its body with an
// argument whose value comes from this parameter alone, the parameter itself or inside another call
// (`super(reasonOf(code))`).
function forwardedArguments(run: CodesRun, parameter: ParameterDeclaration): readonly Node[] {
  const owner = parameter.parent;
  if (!(productReader(run.fileOf(parameter)) && isIdentifier(parameter.name) && isFunctionLikeDeclaration(owner)) || owner.body === undefined) {
    return [];
  }
  const own = parameter.name.text;
  const parameters = new Set(owner.parameters.flatMap((candidate) => (isIdentifier(candidate.name) ? [candidate.name.text] : [])));
  const names = (argument: Node): boolean => {
    const named = new Set<string>();
    const visit = (node: Node): void => {
      const member = isPropertyAccessExpression(node.parent) && sameNode(node.parent.name, node);
      if (isIdentifier(node) && !member && parameters.has(node.text)) {
        named.add(node.text);
      }
      node.forEachChild(visit);
    };
    visit(argument);
    return named.size === 1 && named.has(own);
  };
  const forwarded: Node[] = [];
  const visit = (node: Node): void => {
    if (isCallExpression(node) || isNewExpression(node)) {
      forwarded.push(...(node.arguments ?? []).filter(names));
    }
    node.forEachChild(visit);
  };
  visit(owner.body);
  return forwarded;
}

// Whether each argument binds a parameter that reaches a seed, and whether each owned parameter (one a default fills)
// reaches one: a seed, or a parameter its function hands on into an argument that binds one, each argument and each parameter read once.
function codeArguments(
  run: CodesRun,
  seeds: ReadonlySet<string>,
  question: { readonly asked: readonly Node[]; readonly owned: readonly ParameterDeclaration[] },
): { readonly asked: readonly boolean[]; readonly owned: readonly boolean[] } {
  const { asked, owned } = question;
  const bound = new Map<string, string | null>();
  const forwards = new Map<string, readonly Node[]>();
  const handOn = (parameter: ParameterDeclaration): readonly Node[] => {
    const key = run.key(parameter);
    if (seeds.has(key) || forwards.has(key)) {
      return [];
    }
    const handed = forwardedArguments(run, parameter);
    forwards.set(key, handed);
    return handed;
  };
  let pending = [...asked, ...owned.flatMap(handOn)];
  while (pending.length > 0) {
    const fresh = [...new Map(pending.filter((node) => !bound.has(run.key(node))).map((node) => [run.key(node), node])).values()];
    const parameters = run.world.batch(fresh.map((node) => boundParameter(run.world, node)));
    const next: Node[] = [];
    for (const [at, node] of fresh.entries()) {
      const parameter = parameters[at];
      bound.set(run.key(node), parameter === undefined ? null : run.key(parameter));
      if (parameter !== undefined) {
        next.push(...handOn(parameter));
      }
    }
    pending = next;
  }
  const reaches = (parameter: string, seen: ReadonlySet<string>): boolean =>
    seeds.has(parameter) ||
    (!seen.has(parameter) &&
      (forwards.get(parameter) ?? []).some((argument) => {
        const next = bound.get(run.key(argument));
        return next !== undefined && next !== null && reaches(next, new Set([...seen, parameter]));
      }));
  return {
    asked: asked.map((node) => {
      const parameter = bound.get(run.key(node));
      return parameter !== undefined && parameter !== null && reaches(parameter, new Set());
    }),
    owned: owned.map((parameter) => reaches(run.key(parameter), new Set())),
  };
}

// Whether each production site that builds a member hands it to a code parameter, by key; null without the mapping.
function thrownSites(run: CodesRun, candidates: readonly Node[]): ReadonlyMap<string, boolean> | null {
  const seeds = codeSeeds(run);
  if (seeds === null) {
    return null;
  }
  const argumentsAt = candidates.map(argumentAt);
  const defaultsOf = candidates.map(defaultedParameter);
  const asked = argumentsAt.filter((node) => node !== null);
  const owned = defaultsOf.filter((node) => node !== null);
  const answers = codeArguments(run, seeds, { asked, owned });
  const coded = new Set(
    [...asked.filter((_, at) => answers.asked[at] === true), ...owned.filter((_, at) => answers.owned[at] === true)].map((node) => run.key(node)),
  );
  return new Map(
    candidates.map((node, at) => {
      const reached = argumentsAt[at] ?? defaultsOf[at] ?? null;
      return [run.key(node), reached !== null && coded.has(run.key(reached))];
    }),
  );
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

const isNull = (type: Type): boolean => hasFlag(type.flags, TypeFlags.Null);
const isUndefined = (type: Type): boolean => hasFlag(type.flags, TypeFlags.Undefined);
const isNullish = (type: Type): boolean => isUndefined(type) || isNull(type);

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

// An object, or an intersection of objects such as a frame's shared tags joined to its variant; a branded primitive is
// no data.
function* isData(type: Type): APIRequestGenerator<boolean> {
  const objects = type.isIntersectionType() ? (yield* type.getTypes.gen()).every((member) => member.isObjectType()) : type.isObjectType();
  return objects && (yield* type.getCallSignatures.gen()).length === 0;
}

// A coded refusal: one vocabulary field, one required sentence, and nothing else required. Its code's texts, else null.
function codedRefusal(shape: readonly Field[]): string | null {
  const coded = shape.filter((field) => field.texts !== null);
  const sentences = shape.filter((field) => field.sentence && !field.optional);
  const rest = shape.filter((field) => !(coded.includes(field) || sentences.includes(field)));
  const [code] = coded;
  return coded.length === 1 && sentences.length === 1 && rest.every((field) => field.optional) ? (code?.texts ?? null) : null;
}

// (a) A union of objects split by a boolean literal discriminant into success and refusal members: no `true` member
// carries a vocabulary field, no `false` member carries a field a `true` member carries, and each `false` member is a
// coded refusal once the discriminant is set aside.
function discriminatedRefusals(shapes: readonly (readonly Field[])[]): readonly string[] {
  if (shapes.length < 2) {
    return [];
  }
  const fieldOf = (shape: readonly Field[], name: string): Field | undefined => shape.find((field) => field.name === name);
  const discriminants = (shapes[0] ?? [])
    .filter((field) => shapes.every((shape) => (fieldOf(shape, field.name)?.flag ?? null) !== null))
    .map((field) => field.name);
  return discriminants.flatMap((name) => {
    const failing = shapes.filter((shape) => fieldOf(shape, name)?.flag === false).map((shape) => shape.filter((field) => field.name !== name));
    const passing = shapes.filter((shape) => fieldOf(shape, name)?.flag === true).map((shape) => shape.filter((field) => field.name !== name));
    const succeeds = new Set(passing.flatMap((shape) => shape.map((field) => field.name)));
    const split =
      failing.length > 0 &&
      passing.length > 0 &&
      passing.every((shape) => shape.every((field) => field.texts === null)) &&
      failing.every((shape) => shape.every((field) => !succeeds.has(field.name)));
    return split ? failing.flatMap((shape) => codedRefusal(shape) ?? []) : [];
  });
}

// (d) In a union of frames a subscription yields, a member's one vocabulary field beside one required sentence, once its
// tags are set aside: a field typed by one string literal routes the frame (`channel`, `type`) and is no code.
function frameRefusals(shapes: readonly (readonly Field[])[]): readonly string[] {
  return shapes.flatMap((shape) => {
    const tagged = shape.filter((field) => !(field.texts !== null && !field.texts.includes(TEXT_JOIN)));
    const coded = tagged.filter((field) => field.texts !== null);
    const sentences = tagged.filter((field) => field.sentence && !field.optional);
    const [code] = coded;
    return coded.length === 1 && sentences.length === 1 && code?.texts !== null && code?.texts !== undefined ? [code.texts] : [];
  });
}

/** The refusal fields one step finds, each as its sorted texts joined by {@link TEXT_JOIN}: in an answer or body, and in
 *  a frame. */
interface Refusals {
  readonly fields: readonly string[];
  readonly frames: readonly string[];
}

function* unionRefusals(world: NativeWorld, members: readonly Type[], framed: boolean): APIRequestGenerator<Refusals> {
  const data = yield* all(...members.map(isData));
  const objects = members.filter((_, at) => data[at] === true);
  const shapes = yield* all(...objects.map((member) => fieldsOf(world, member)));
  const [only] = shapes;
  // (b) A coded refusal that is explicitly `| null`; an optional or `undefined` object is a config block, not a notice.
  const nullable = members.some(isNull) && !members.some(isUndefined) && shapes.length === 1 && only !== undefined;
  const notice = nullable ? codedRefusal(only) : null;
  return { fields: [...discriminatedRefusals(shapes), ...(notice === null ? [] : [notice])], frames: framed ? frameRefusals(shapes) : [] };
}

interface Explored extends Refusals {
  readonly next: readonly Type[];
}

const NO_REFUSALS: Refusals = { fields: [], frames: [] };

// One step into a sent type: a union's members, a reference's type arguments and an object's properties. A callable
// type is a method, never data.
function* explore(world: NativeWorld, type: Type, framed: boolean): APIRequestGenerator<Explored> {
  if (type.isUnionType()) {
    const members = yield* type.getTypes.gen();
    return { ...(yield* unionRefusals(world, members, framed)), next: members };
  }
  if (!(yield* isData(type))) {
    return { ...NO_REFUSALS, next: [] };
  }
  const args = type.isTypeReference() ? yield* world.checker.getTypeArguments.gen(type) : [];
  const fields = yield* fieldsOf(world, type);
  return { ...NO_REFUSALS, next: [...args, ...fields.map((field) => field.type)] };
}

// Every refusal field inside the sent types, breadth first, each type explored once, so a recursive type ends the walk. `framed` reads the
// sent types as a subscription's frames too.
function sentFields(
  world: NativeWorld,
  roots: readonly Type[],
  framed: boolean,
): { readonly fields: ReadonlySet<string>; readonly frames: ReadonlySet<string> } {
  const seen = new Set<number>();
  const fields = new Set<string>();
  const frames = new Set<string>();
  let level = roots;
  while (level.length > 0) {
    const fresh = [...new Map(level.filter((type) => !seen.has(type.id)).map((type) => [type.id, type])).values()];
    for (const type of fresh) {
      seen.add(type.id);
    }
    const explored = world.batch(fresh.map((type) => explore(world, type, framed)));
    for (const step of explored) {
      for (const field of step.fields) {
        fields.add(field);
      }
      for (const field of step.frames) {
        frames.add(field);
      }
    }
    level = explored.flatMap((step) => step.next);
  }
  return { fields, frames };
}

// (c) The one vocabulary field at the top of a body sent with a status whose type is client and server error literals
// only; a body with two vocabulary fields names no single code.
function* refusalBody(world: NativeWorld, body: Type | undefined, status: Node | undefined): APIRequestGenerator<string | null> {
  if (status === undefined || body === undefined) {
    return null;
  }
  const members = yield* constituents(yield* world.checker.getTypeAtLocation.gen(status));
  const refused = members.every((member) => member.isNumberLiteralType() && member.value >= REFUSAL_STATUS.min && member.value <= REFUSAL_STATUS.max);
  const coded = refused && (yield* isData(body)) ? (yield* fieldsOf(world, body)).filter((field) => field.texts !== null) : [];
  const [code] = coded;
  return coded.length === 1 ? (code?.texts ?? null) : null;
}

interface SendCall {
  readonly call: Node;
  readonly name: Node;
  readonly argument: Node;
  readonly status: Node | undefined;
  readonly sends: readonly Send[];
}

function sendCalls(run: CodesRun): readonly SendCall[] {
  const calls: SendCall[] = [];
  for (const { source } of run.sources) {
    walk(source, (node) => {
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

function addSends(by: Map<string, Set<string>>, fields: Iterable<string>, where: string): void {
  for (const field of fields) {
    by.set(field, (by.get(field) ?? new Set<string>()).add(where));
  }
}

/** The sends and subscriptions whose value has a refusal field of each literal set, by set. */
interface Sends {
  readonly sentBy: ReadonlyMap<string, ReadonlySet<string>>;
  readonly framedBy: ReadonlyMap<string, ReadonlySet<string>>;
}

function gatherSends(run: CodesRun): Sends {
  const { world } = run;
  const calls = sendCalls(run);
  const symbols = world.symbolsAt(calls.map(({ name }) => name));
  const declared = calls.flatMap(({ call, argument, status, sends }, at) => {
    const paths = (symbols[at]?.declarations ?? []).map((handle) => handle.path);
    const send = sends.find((candidate) => paths.some((path) => path.includes(candidate.module)));
    return send === undefined ? [] : [{ call, argument, status, send }];
  });
  const types = world.batch(declared.map(({ argument, send }) => sentType(world, send, argument)));
  const bodies = world.batch(declared.map(({ status, send }, at) => refusalBody(world, types[at], send.value === "argument" ? status : undefined)));
  const sentBy = new Map<string, Set<string>>();
  const framedBy = new Map<string, Set<string>>();
  for (const [at, { call, send }] of declared.entries()) {
    const type = types[at];
    if (type !== undefined) {
      const where = run.where(call);
      const body = bodies[at];
      const found = sentFields(world, [type], send.value === "frames");
      addSends(sentBy, [...found.fields, ...(body === null || body === undefined ? [] : [body])], where);
      addSends(framedBy, found.frames, where);
    }
  }
  return { sentBy, framedBy };
}

// An element access by a value typed by a whole vocabulary into a table with a property for every member: the access
// branches on each code. The index's texts, when the table is complete.
function* completeLookup(world: NativeWorld, access: ElementAccessExpression): APIRequestGenerator<string | null> {
  const { checker } = world;
  const texts = yield* fieldTexts(yield* checker.getTypeAtLocation.gen(access.argumentExpression));
  if (texts === null) {
    return null;
  }
  const table = yield* checker.getTypeAtLocation.gen(access.expression);
  const present = yield* all(...texts.split(TEXT_JOIN).map((text) => checker.getPropertyOfType.gen(table, text)));
  return present.every((property) => property !== undefined) ? texts : null;
}

// The client element accesses into a complete table, `file:line`, by the index's literal set.
function gatherLookups(run: CodesRun): ReadonlyMap<string, readonly string[]> {
  const accesses: ElementAccessExpression[] = [];
  for (const { source } of run.sources.filter(({ file }) => inClient(file))) {
    walk(source, (node) => {
      if (isElementAccessExpression(node)) {
        accesses.push(node);
      }
    });
  }
  const tables = run.world.batch(accesses.map((access) => completeLookup(run.world, access)));
  const lookups = new Map<string, string[]>();
  for (const [at, access] of accesses.entries()) {
    const texts = tables[at];
    if (texts !== null && texts !== undefined) {
      lookups.set(texts, [...(lookups.get(texts) ?? []), run.where(access)]);
    }
  }
  return lookups;
}

// The binding a member read is collected under: an element of `new Set([...])` or the key of an entry of
// `new Map([[key, value], ...])`, assigned to a name. Null for any other read.
function membershipBinding(node: Node): Node | null {
  const value = handedValue(node);
  const entry = isArrayLiteralExpression(value.parent) && isArrayLiteralExpression(value.parent.parent) && sameNode(value.parent.elements[0], value);
  const list = entry ? value.parent.parent : value.parent;
  const made = list.parent;
  const collected =
    isArrayLiteralExpression(list) &&
    isNewExpression(made) &&
    isIdentifier(made.expression) &&
    MEMBERSHIP_COLLECTIONS.has(made.expression.text) &&
    sameNode(made.arguments?.[0], list);
  if (!collected) {
    return null;
  }
  let bound: Node = made;
  while (handsOn(bound)) {
    bound = bound.parent;
  }
  const declaration = bound.parent;
  return isVariableDeclaration(declaration) && sameNode(declaration.initializer, bound) && isIdentifier(declaration.name) ? declaration.name : null;
}

// A reference to a collection's binding that calls `has` or `get` on it.
function testsMembership(node: Node): boolean {
  const access = node.parent;
  return (
    isPropertyAccessExpression(access) &&
    sameNode(access.expression, node) &&
    MEMBERSHIP_READS.has(access.name.text) &&
    isCallExpression(access.parent) &&
    sameNode(access.parent.expression, access)
  );
}

// The client member reads collected into a Set or Map whose binding some file, its own or one that imports it, tests
// with `has` or `get`, by key.
function gatherMemberships(run: CodesRun, reads: readonly Node[]): ReadonlySet<string> {
  const collected = reads.flatMap((node) => {
    const binding = inClient(run.fileOf(node)) && readRole(node) === "construct" ? membershipBinding(node) : null;
    return binding === null ? [] : [{ node, binding }];
  });
  const references = run.references(collected.map(({ binding }) => binding));
  return new Set(collected.filter((_, at) => (references[at] ?? []).some(testsMembership)).map(({ node }) => run.key(node)));
}

// The type alias a reference to a vocabulary sits in, by its name: `type Code = (typeof CODES)[number]`.
function aliasAt(node: Node): Node | null {
  for (let at: Node = node; !isSourceFile(at); at = at.parent) {
    if (isTypeAliasDeclaration(at)) {
      return at.name;
    }
    if (isStatement(at)) {
      return null;
    }
  }
  return null;
}

// Each vocabulary's references by its key: through its own name and through each type alias spelled from it, which is
// how client code usually takes a code's type.
function vocabularyReferences(run: CodesRun, vocabularies: readonly Vocabulary[]): ReadonlyMap<string, readonly Node[]> {
  const own = run.references(vocabularies.map(({ nameNode }) => nameNode));
  const aliases = own.map((found) => found.flatMap((node) => aliasAt(node) ?? []));
  const viaAliases = run.references(aliases.flat());
  let next = 0;
  return new Map(
    vocabularies.map((vocabulary, at) => {
      const spelled = (aliases[at] ?? []).flatMap(() => viaAliases[next++] ?? []);
      return [vocabulary.key, [...(own[at] ?? []), ...spelled]];
    }),
  );
}

const memberSet = (vocabulary: Vocabulary): string => [...new Set(vocabulary.members.map((member) => member.text))].sort().join(TEXT_JOIN);

/** What judging a member reads, gathered once for the run. */
interface Gathered {
  readonly reading: UnionReading;
  readonly vocabularyRefs: ReadonlyMap<string, readonly Node[]>;
  /** The references to each member's read name, by the read's key. */
  readonly memberRefs: ReadonlyMap<string, readonly Node[]>;
  readonly thrown: ReadonlyMap<string, boolean>;
  readonly lookups: ReadonlyMap<string, readonly string[]>;
  readonly memberships: ReadonlySet<string>;
}

interface Judged {
  readonly throws: readonly string[];
  readonly builds: readonly string[];
  /** Whether server production builds the member: a literal in its vocabulary's slot, or a read of its constant. */
  readonly produced: boolean;
  readonly handlers: readonly string[];
  readonly clientNamed: boolean;
}

const sortedWhere = (run: CodesRun, nodes: readonly Node[]): readonly string[] => [...new Set(nodes.map((node) => run.where(node)))].sort();

function judge(run: CodesRun, gathered: Gathered, vocabulary: Vocabulary, member: CodeMember): Judged {
  const { tuple } = vocabulary;
  const { reading } = gathered;
  const literals: readonly UnionLiteral[] =
    tuple === null ? [] : reading.literals.filter((literal) => literal.text === member.text && reading.names(literal, tuple));
  const reads = (member.read === null ? [] : (gathered.memberRefs.get(run.key(member.read)) ?? [])).map((node) => ({ node, role: readRole(node) }));
  const server = (node: Node): boolean => productReader(run.fileOf(node)) && !inClient(run.fileOf(node));
  const client = (node: Node): boolean => inClient(run.fileOf(node));
  const producers = [
    ...literals.filter((literal) => literal.role === "construct").map((literal) => literal.node),
    ...reads.filter(({ role }) => role === "construct").map(({ node }) => node),
  ].filter(server);
  const thrown = producers.filter((node) => gathered.thrown.get(run.key(node)) === true);
  const handlers = [
    ...literals.filter((literal) => BRANCH_ROLES.has(literal.role)).map((literal) => literal.node),
    ...reads.filter(({ role }) => role !== null && BRANCH_ROLES.has(role)).map(({ node }) => node),
    ...reads.filter(({ node, role }) => role === "construct" && gathered.memberships.has(run.key(node))).map(({ node }) => node),
  ].filter(client);
  const lookups = gathered.lookups.get(memberSet(vocabulary)) ?? [];
  return {
    throws: sortedWhere(run, thrown),
    builds: sortedWhere(
      run,
      producers.filter((node) => !thrown.includes(node)),
    ),
    produced: producers.length > 0,
    handlers: [...new Set([...sortedWhere(run, handlers), ...lookups])].sort(),
    clientNamed: reads.some(({ node }) => client(node)),
  };
}

/** Where a vocabulary's codes are sent outward: answers and bodies, and subscription frames, each `file:line`. */
interface Sent {
  readonly sends: readonly string[];
  readonly frames: readonly string[];
}

function assertNever(value: never): never {
  throw new Error(`codes: unhandled value ${JSON.stringify(value)}`);
}

function crossings(judged: Judged, sent: Sent, named: boolean): readonly Crossing[] {
  return CROSSINGS.filter((crossing) => {
    switch (crossing) {
      case "reason":
        return judged.throws.length > 0;
      case "answer":
        return sent.sends.length > 0;
      case "frame":
        return sent.frames.length > 0;
      case "client":
        return named || judged.clientNamed;
      default:
        return assertNever(crossing);
    }
  });
}

function channelOpen(channel: Channel, thrown: boolean, sent: Sent): boolean {
  switch (channel) {
    case "thrown":
      return thrown;
    case "returned":
      return sent.sends.length > 0;
    case "framed":
      return sent.frames.length > 0;
    default:
      return assertNever(channel);
  }
}

// A code vocabulary's codes and findings; null for a vocabulary nothing throws and no send returns or frames. A
// returned or framed code is built by a server site that builds it, or by a server site that enumerates its tuple and
// so can hand on any member, as the socket narrows a classified error's code onto STREAM_ERROR_CODES.
function judgeVocabulary(
  run: CodesRun,
  gathered: Gathered,
  vocabulary: Vocabulary,
  sent: Sent,
): { readonly vocabulary: CodeVocabulary; readonly codes: readonly Code[]; readonly findings: readonly CodeFinding[] } | null {
  const members = vocabulary.members.map((member) => ({ member, judged: judge(run, gathered, vocabulary, member) }));
  const thrown = members.some(({ judged }) => judged.throws.length > 0);
  const channels = CHANNELS.filter((channel) => channelOpen(channel, thrown, sent));
  if (channels.length === 0) {
    return null;
  }
  const references = gathered.vocabularyRefs.get(vocabulary.key) ?? [];
  const named = references.some((node) => inClient(run.fileOf(node)));
  const enumerated =
    vocabulary.tuple !== null && gathered.reading.enumerates(references.filter((node) => !(inClient(run.fileOf(node)) || inContracts(run.fileOf(node)))));
  const outward = sent.sends.length > 0 || sent.frames.length > 0;
  const codes: Code[] = [];
  const findings: CodeFinding[] = [];
  for (const { member, judged } of members) {
    const crosses = crossings(judged, sent, named);
    const live = judged.throws.length > 0 || (outward && (judged.produced || enumerated));
    const row = { key: `${vocabulary.key}.${member.text}`, file: vocabulary.file, line: member.line, home: vocabulary.name, member: member.text };
    codes.push({ ...row, throws: judged.throws, builds: judged.builds, crosses, handlers: judged.handlers });
    if (!live) {
      findings.push({ ...row, kind: "unthrown" });
    } else if (judged.handlers.length === 0) {
      findings.push({ ...row, kind: "unhandled" });
    }
  }
  return { vocabulary: { key: vocabulary.key, channels, ...sent }, codes, findings };
}

/** The codes of the closed code vocabularies in packages/contracts, read off a built graph and its world. */
export function codesPass(graph: Graph, world: NativeWorld, judging: CodesJudging, log: GraphLog): CodesReport {
  const run = new CodesRun(world, graph);
  const reading = readUnionsOnGraph(world, log);
  const vocabularies = [...reading.tuples.filter((tuple) => inContracts(tuple.site.file)).map(tupleVocabulary), ...objectVocabularies(run)];
  const asked = vocabularies.flatMap(({ members }) => members.flatMap(({ read }) => (read === null ? [] : [read])));
  const found = run.references(asked);
  const memberRefs = new Map(asked.map((node, at) => [run.key(node), found[at] ?? []]));
  const reads = found.flat();
  const texts = new Set(vocabularies.flatMap(({ members }) => members.map(({ text }) => text)));
  const candidates = [
    ...reading.literals.filter((literal) => literal.role === "construct" && literal.holds && texts.has(literal.text)).map((literal) => literal.node),
    ...reads.filter((node) => readRole(node) === "construct"),
  ].filter((node) => productReader(run.fileOf(node)));
  const thrown = thrownSites(run, [...new Map(candidates.map((node) => [run.key(node), node])).values()]);
  const { sentBy, framedBy } = gatherSends(run);
  const gathered: Gathered = {
    reading,
    vocabularyRefs: vocabularyReferences(run, vocabularies),
    memberRefs,
    thrown: thrown ?? new Map<string, boolean>(),
    lookups: gatherLookups(run),
    memberships: gatherMemberships(run, reads),
  };
  const judged = vocabularies
    .toSorted((a, b) => a.key.localeCompare(b.key))
    .flatMap((vocabulary) => {
      const sites = (by: ReadonlyMap<string, ReadonlySet<string>>): readonly string[] => [...(by.get(memberSet(vocabulary)) ?? [])].sort();
      return judgeVocabulary(run, gathered, vocabulary, { sends: sites(sentBy), frames: sites(framedBy) }) ?? [];
    });
  const findings = judged.flatMap((entry) => entry.findings);
  log(`codes: vocabularies=${String(vocabularies.length)} code vocabularies=${String(judged.length)} reason carrier ${thrown === null ? "absent" : "read"}`);
  return {
    scanned: vocabularies.length,
    vocabularies: judged.map(({ vocabulary }) => vocabulary),
    codes: judged.flatMap((entry) => entry.codes),
    ...sortRows(findings, judging),
    limits: CODE_LIMITS,
  };
}
