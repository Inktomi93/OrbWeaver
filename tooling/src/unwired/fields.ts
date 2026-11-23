// `pnpm unwired fields`: data properties of named object types and zod object schemas that production writes and
// never reads, reads and never writes (an optional field always at its default), or never names at all. A value sent
// out of the process counts as read only where its receiver reads it; each reported row carries a proposed sort.
import type { CallExpression, Identifier, Node, ObjectLiteralExpression, PropertyAssignment } from "@typescript/native/ast";
import {
  isArrayLiteralExpression,
  isArrowFunction,
  isCallExpression,
  isIdentifier,
  isMappedTypeNode,
  isObjectLiteralExpression,
  isParameterDeclaration,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isPropertySignatureDeclaration,
  isSatisfiesExpression,
  isStringLiteral,
  isTypeOperatorNode,
  isTypeReferenceNode,
  isVariableDeclaration,
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Checker, Symbol as NativeSymbol } from "@typescript/native/sync";
import ts from "typescript";
import type { SendDestination } from "./boundaries.ts";
import type { Site, SyntaxRole } from "./classify.ts";
import { isProductionFile, nameAt, roleAt, Sources, siteKey } from "./classify.ts";
import { sortDeliberate } from "./deliberate.ts";
import type { FieldPromise, PromiseField, SortEvidence, Verdict } from "./field-sort.ts";
import { FieldSort, homeAliases, promiseFacts } from "./field-sort.ts";
import type { JudgedSplit } from "./judged.ts";
import { sortJudged } from "./judged.ts";
import type { UnresolvedReason } from "./key-resolver.ts";
import { serviceReferences } from "./language-service.ts";
import type { LiteralEvidence, LiteralStage } from "./literal-hits.ts";
import { literalStage } from "./literal-hits.ts";
import type { FoundReference } from "./native.ts";
import { constituents, declarationKeys, homeFiles, NativeWorld } from "./native.ts";
import type { PropertyFacts, PropertyReferences, Send } from "./occurrences.ts";
import { joinFacts, propertyFacts } from "./occurrences.ts";
import type { SdkSurface } from "./plugin-surface.ts";
import { publishedAt, sdkSurface } from "./plugin-surface.ts";
import type { ScanOptions } from "./scan.ts";
import { scanWorlds, sitesOf } from "./scan.ts";
import { typeMembers } from "./type-members.ts";
import { isProduction } from "./worlds.ts";

const FIELD_KINDS = ["never-read", "never-written", "unreferenced"] as const;
/** `never-read`: production writes it and never reads it. `never-written`: an optional field production reads and
 *  never writes, so every branch on it sees the default. `unreferenced`: production neither reads nor writes it. */
type FieldKind = (typeof FIELD_KINDS)[number];

const FIELD_ORIGINS = ["type", "schema"] as const;
/** `type`: a member of an interface or object type alias. `schema`: a key of a `z.object` schema. */
type FieldOrigin = (typeof FIELD_ORIGINS)[number];

interface UnwiredField {
  readonly key: string;
  readonly file: string;
  readonly line: number;
  readonly home: string;
  readonly member: string;
  readonly origin: FieldOrigin;
  readonly kind: FieldKind;
  /** References from test files, reads and writes together. */
  readonly tests: number;
  /** Up to a few production sites that write or read it, `file:line`. */
  readonly sample: readonly string[];
  /** Serializations and open slots that send its value out with no receiver the scan can follow, `destination file:line`,
   *  then the library, logger or call that takes it when the scan can name one. */
  readonly sent: readonly string[];
  readonly verdict: Verdict;
  readonly evidence: SortEvidence;
  /** The literal search of a row the sort called dead; null for a row it sorted otherwise. */
  readonly literal: LiteralEvidence | null;
}

const RECEIVERS = ["plugin-sdk", "provider"] as const;
/** `plugin-sdk`: the published SDK declares it for guests. `provider`: it rides a provider request body and a doc names it. */
type Receiver = (typeof RECEIVERS)[number];

/** A field no production code reads that a receiver outside the tree reads. */
interface ReceivedField {
  readonly key: string;
  readonly file: string;
  readonly line: number;
  readonly home: string;
  readonly member: string;
  readonly receiver: Receiver;
  /** The SDK declaration that publishes it, or the doc line that names the provider field, `file:line`. */
  readonly cite: string;
}

const PROVIDER: SendDestination = "provider";

export interface FieldsReport {
  readonly scanned: number;
  readonly unwired: readonly UnwiredField[];
  readonly deliberate: readonly (UnwiredField & { readonly reason: string })[];
  /** Rows a board item owns, with the item. */
  readonly judged: JudgedSplit<UnwiredField>["judged"];
  /** Judged entries whose row no longer reports or whose item is no longer open. */
  readonly staleJudged: JudgedSplit<UnwiredField>["staleJudged"];
  /** Schema keys production neither writes nor reads: only a parse of input from outside the tree (a provider response,
   *  a card file) or a payload handed on whole fills them, so the schema only validates them. Reported, never judged. */
  readonly validated: readonly UnwiredField[];
  /** Never-read members of a tRPC mutation's one-member output, such as `{ restarting: true }`: the acknowledgement is
   *  the procedure's whole answer. Reported, never judged. */
  readonly acknowledged: readonly UnwiredField[];
  readonly received: readonly ReceivedField[];
  /** Keys the resolver could not place whose placement could change a reported row, `file:line name reason -> row`: a
   *  read or write of a reported member's name in the role that would credit or clear it. Listed for judgement, never
   *  credited by the name. */
  readonly unresolved: readonly string[];
  /** Every key the resolver could not place, by reason, listed or not. */
  readonly unresolvedByReason: Readonly<Partial<Record<UnresolvedReason, number>>>;
  /** How many reported fields each send destination covers. */
  readonly sentBy: Readonly<Partial<Record<SendDestination, number>>>;
  /** Fields where engine two found a production site in a role engine one lacks, with those sites. Engine one links
   *  what find-references cannot follow, so engine two finding fewer sites is expected and contradicts nothing. */
  readonly disagreements: readonly { readonly key: string; readonly uses: readonly string[] }[];
  /** The literal search over every dead row, or null for a root with no git index. */
  readonly literalStage: LiteralStage | null;
  readonly limits: readonly string[];
}

/** What the fields scan cannot see, printed with every run. */
const FIELD_LIMITS: readonly string[] = [
  "A computed key built from runtime strings types as string, so it reads or writes no named field. A spread of a value whose type builds its keys, such as Record<keyof X, V> or a template-literal key type, writes none of them: only a literal key that built the value names a written member, and a literal key on a member no declaration backs is unresolved.",
  "A string key counts only in a key slot the key resolver reads (tooling/src/unwired/key-resolver.ts): a computed literal key, a slot declared keyof X, a generic call slot keyof T bound by an argument, or a TanStack Form path walked segment by segment. A template-literal form path (a path with an interpolated index) and a field list typed string[] (MiniSearch's own options) name no member.",
  "A key the resolver cannot place credits no field by its name. It is counted by reason (untyped, absent, synthetic, no-holder, path), and listed in unresolved only when it spells a reported row's member in the role that row lacks (a read for never-read, a write for never-written, either for unreferenced) on a holder that could be the row's home: any for untyped and no-holder, one whose declared members share the row's file for synthetic, never for absent and path.",
  "A type-position read (Registry[K]) is no read; a registry entry needs a value read by name.",
  "A read inside a string (a JSON scenario file, a SQL fragment, a plugin template) is invisible.",
  "JSON.stringify reads every field only where its string is compared, hashed or used as a map key or a *key/*hash binding; elsewhere it is a send with a named destination, and a return or plain binding is 'unclassified'.",
  "A send's receiver outside the tree (an HTTP or wire reader, a log or file reader) is not followed: those rows sort as ask with the destination named.",
  "A typed value handed into an open slot (unknown, object, a type parameter bounded by one, or an index signature such as JSONObject or Record<string, unknown>) sends the members the slot does not name, with their nested members; an open literal key's value and a spread into an open literal send all of theirs. The scan follows the value up through literals and wrappers to the call it is an argument of: JSON.stringify gives its destination, an in-tree callee with a body is followed through that parameter's uses (three helpers deep), a library callee is a dependency send naming the package (an AI SDK package is provider, a logger is log; a slot typed unknown, such as a schema parse or a React dependency list, and a drizzle-orm call send nothing), and a bodyless callee is log when its name, its receiver or its receiver's type names a logger. A value returned or bound is not followed, and an element-access write such as options[\"k\"] = v is not seen here.",
  "Inside packages/inference/src/backends/ a value with no other destination is a provider send only when it reaches a request: the arguments of an AI SDK doStream, doGenerate or doEmbed call and a fetch body, chased back through bindings and the keyed writes into them (out[k] = v, out.k = v, in the binding's block), a parameter to its callers' arguments, a callee to its returns and a function value to its results. A function with a Fetch Response parameter is never entered, and a parsed response reaches none of them unless it is put into a later request. A provider send counts as received only where a law, ADR or README line backticks the member as a promise or beside its home or a sibling member; a member a string-index slot names flows into that member and gets no send of its own, so a parsed key whose slot member is sent stays unreferenced.",
  "An as assertion of a parameter whose type a library declares sends the asserted type's members to that library, which hands the object in and reads it back; an as assertion of a returned closure's unknown parameter is an unclassified send to the caller of the factory. An interface inside declare module \"pkg\" sends its members to pkg at type level. A dependency send is always ask, never received.",
  'A literal-key element read with no declaration, row["k"], reads the members named k at any depth of every typed value handed in the same file into a string-indexed slot of the receiver\'s type; it cannot tell two values handed into one such type apart.',
  "nestedValue(value, path) reads every nested member of its value to depth 4, whatever its path names.",
  "c.json sends to the HTTP client; a client read counts only when it is typed by the same declaration.",
  "A Drizzle write flows into the column of the same name; a column counts as read back by a select-row member or a table column read outside the table definition. Raw sql text that names a column is invisible.",
  "A $inferSelect or $inferInsert row member has no declaration; it reads the column of the table whose column names are exactly the row's member names, so a narrowed or widened row type reads nothing.",
  "A value spread or copied into an object that is then serialized is not followed to that serialization.",
  "The plugin SDK surface is matched by home and member name against packages/plugin-sdk/*.d.ts, or by slot path (Home.member, Home.fn() return, Home.fn(n) parameter) where the SDK spells a contract type inline; a renamed home or a slot under another path is missed.",
  "Reader history counts any removed read of a member name one scanned home declares; for a shared name, only a removed read in a file whose parent version names the home, its schema or type twin, or an alias the current tree gives either; a read through an inferred type in a file that never names the home is missed, and a home renamed since is matched only under its current names.",
  "A key of a `base.extend({ key })` literal that the base schema's shape also holds is the base key: its reads and writes count for the base. A key only the extend adds is no field of its own.",
  "A schema whose parsed value production types by another declaration, through a parse function's return type or a refine predicate and with no `satisfies z.ZodType<T>` link, keeps its own keys: the reads land on the other declaration's members, so the keys report in validated.",
  "A schema that only validates a value production reads through another type, such as a dependency's message type or a payload handed on whole to a provider, keeps keys no production code names: they report in validated.",
  "A local type for a value a library or the platform reads (a syntax-tree node, a canvas, a module augmentation) reports the members only the library reads.",
  "A twin interface restated beside its home (a module-local copy with the home's name and members) splits reads from writes: the home reports what only the twin reads.",
  "A value a library hands back to the tree, such as a persisted store's state read through an untyped merge, is not followed: its members report never-read.",
  "The literal stage matches a dead row's member name as a whole word in every tracked file and cannot tell two fields of one name apart: any code, string, data-key, other-file or test type hit outside the row's own known sites (its declarations and every production site the scan recorded, by exact offset) moves the row to ask. Comment, TSDoc, doc and data-value hits are stale mentions and keep it dead. A never-written row lists its write-position hits as candidate writers. Gitignored and generated-but-untracked files are not searched.",
  "A promise is a backticked Home.member under any of the home's names, a distinctive bare member that one scanned home declares (a schema and its type twin or alias count as one home), a settings field itself, or a field a flow from a settings field fills; a settings field of the same name that no flow connects sorts the row as ask.",
];

const SAMPLE = 3;
const ZOD_OBJECTS: ReadonlySet<string> = new Set(["object", "strictObject", "looseObject"]);
const ZOD_OPTIONAL: ReadonlySet<string> = new Set(["optional", "nullish", "default", "prefault", "catch"]);

interface FieldDeclaration {
  readonly key: string;
  readonly site: Site;
  readonly line: number;
  readonly home: string;
  readonly member: string;
  readonly origin: FieldOrigin;
  readonly optional: boolean;
  /** A component's props or a function's options: the params scan owns its unwritten optional members. */
  readonly parameterOwned: boolean;
  readonly keys: readonly string[];
  /** The names of the schema keys that mirror this member, which engine two asks about as well. */
  readonly mirrorSites: readonly Site[];
}

const isZodObject = (node: CallExpression): boolean =>
  isPropertyAccessExpression(node.expression) &&
  ZOD_OBJECTS.has(node.expression.name.text) &&
  isIdentifier(node.expression.expression) &&
  node.expression.expression.text === "z";

// `z.string().optional()`: a method named for an optional or defaulted key anywhere on the initializer's call chain.
function isOptionalSchema(node: Node): boolean {
  for (let at: Node = node; isCallExpression(at) && isPropertyAccessExpression(at.expression); at = at.expression.expression) {
    if (ZOD_OPTIONAL.has(at.expression.name.text)) {
      return true;
    }
  }
  return false;
}

// The variable a schema is bound to, then each key on the way down to the nested schema.
function schemaHome(literal: ObjectLiteralExpression): string {
  const path: string[] = [];
  for (let at: Node = literal.parent; at.kind !== SyntaxKind.SourceFile; at = at.parent) {
    if (isPropertyAssignment(at) && isIdentifier(at.name)) {
      path.unshift(at.name.text);
    }
    if (isVariableDeclaration(at) && isIdentifier(at.name)) {
      path.unshift(at.name.text);
      break;
    }
  }
  return path.join(".") || "<schema>";
}

type NamedKey = PropertyAssignment & { readonly name: Identifier };

interface SchemaKey {
  readonly node: NamedKey;
  readonly home: string;
  /** The type the schema is checked against, whose member is the key's home. */
  readonly mirror: Node | null;
  /** The schema is one option of a checked union, so its mirror is the union member with the same keys. */
  readonly option: boolean;
  /** Every key name of the schema the key sits in. */
  readonly names: readonly string[];
}

const ZOD_UNIONS: ReadonlySet<string> = new Set(["union", "discriminatedUnion"]);

// The `z.lazy(() => schema)` call whose arrow body is `node`, if any.
function lazyAround(node: Node): Node | null {
  const arrow = node.parent;
  const call = arrow.parent;
  return isArrowFunction(arrow) &&
    arrow.body === node &&
    isCallExpression(call) &&
    isPropertyAccessExpression(call.expression) &&
    call.expression.name.text === "lazy"
    ? call
    : null;
}

// The outermost expression a schema call is, through parentheses, chained methods such as `.strict()` and `z.lazy`.
function chainTop(call: Node): Node {
  let at = call;
  for (;;) {
    const { parent } = at;
    if (isParenthesizedExpression(parent)) {
      at = parent;
    } else if (isPropertyAccessExpression(parent) && parent.expression === at && isCallExpression(parent.parent) && parent.parent.expression === parent) {
      at = parent.parent;
    } else {
      const lazy = lazyAround(at);
      if (lazy === null) {
        return at;
      }
      at = lazy;
    }
  }
}

// `z.strictObject({...}).strict() satisfies z.ZodType<View>` or `const schema: z.ZodType<View> = ...`: the `View`.
function checkedType(call: Node): Node | null {
  const at = chainTop(call);
  const { parent } = at;
  let checked: Node | undefined;
  if (isSatisfiesExpression(parent)) {
    checked = parent.type;
  } else if (isVariableDeclaration(parent) && parent.initializer === at) {
    checked = parent.type;
  }
  const [subject] = checked !== undefined && isTypeReferenceNode(checked) ? (checked.typeArguments ?? []) : [];
  const mirror = subject === undefined ? undefined : (keyedOver(subject) ?? subject);
  return mirror !== undefined && isTypeReferenceNode(mirror) ? mirror.typeName : null;
}

// The type a mapped type re-keys, `{ [K in keyof T]?: T[K] }`: a schema checked against it mirrors `T`'s members.
function keyedOver(node: Node): Node | undefined {
  const constraint = isMappedTypeNode(node) ? node.typeParameter.constraint : undefined;
  return constraint !== undefined && isTypeOperatorNode(constraint) && constraint.operator === SyntaxKind.KeyOfKeyword ? constraint.type : undefined;
}

// The checked type of a schema, or of the `z.union([...])` or `z.discriminatedUnion(key, [...])` it is an option of.
function mirrorOf(call: Node): { readonly mirror: Node | null; readonly option: boolean } {
  const list = chainTop(call).parent;
  const union = list.parent;
  const isOption =
    isArrayLiteralExpression(list) && isCallExpression(union) && isPropertyAccessExpression(union.expression) && ZOD_UNIONS.has(union.expression.name.text);
  return isOption ? { mirror: checkedType(union), option: true } : { mirror: checkedType(call), option: false };
}

const namedKeys = (shape: ObjectLiteralExpression): readonly NamedKey[] =>
  shape.properties.flatMap((property) =>
    isPropertyAssignment(property) && (isIdentifier(property.name) || isStringLiteral(property.name)) ? [property as NamedKey] : [],
  );

function keysOfShape(shape: ObjectLiteralExpression): readonly SchemaKey[] {
  const home = schemaHome(shape);
  const { mirror, option } = mirrorOf(shape.parent);
  const named = namedKeys(shape);
  const names = named.map((node) => node.name.text);
  return named.map((node) => ({ node, home, mirror, option, names }));
}

const sameNames = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((name) => b.includes(name));

// A mirrored key's type member: the checked type's property of that name, or for a union option the property of the
// union member whose keys are the option's keys. Undefined for a key with no mirror member.
function* mirrored(checker: Checker, key: SchemaKey, mirror: NativeSymbol | undefined): APIRequestGenerator<NativeSymbol | undefined> {
  if (mirror === undefined) {
    return undefined;
  }
  const declared = yield* checker.getDeclaredTypeOfSymbol.gen(mirror);
  if (!key.option) {
    return yield* checker.getPropertyOfType.gen(declared, key.node.name.text);
  }
  for (const member of yield* constituents(declared)) {
    const names = (yield* checker.getPropertiesOfType.gen(member)).map((property) => property.name);
    if (sameNames(names, key.names)) {
      return yield* checker.getPropertyOfType.gen(member, key.node.name.text);
    }
  }
  return undefined;
}

// The sites of the names a mirror member is declared with: type literal members in the tree.
function* declarationSites(world: NativeWorld, symbol: NativeSymbol | undefined): APIRequestGenerator<readonly Site[]> {
  const sites: Site[] = [];
  for (const handle of (symbol?.declarations ?? []).filter((candidate) => world.fileOf(candidate) !== null)) {
    const node = yield* handle.resolve.gen();
    if (node !== undefined && isPropertySignatureDeclaration(node)) {
      sites.push(world.siteOf(node.name));
    }
  }
  return sites;
}

function schemaKeys(world: NativeWorld): readonly SchemaKey[] {
  const found: SchemaKey[] = [];
  for (const file of world.files.filter((source) => isProduction(world.siteOf(source).file))) {
    const visit = (node: Node): void => {
      const [shape] = isCallExpression(node) && isZodObject(node) ? node.arguments : [];
      if (shape !== undefined && isObjectLiteralExpression(shape)) {
        found.push(...keysOfShape(shape));
      }
      node.forEachChild(visit);
    };
    file.forEachChild(visit);
  }
  return found;
}

const ZOD_EXTEND = "extend";
const ZOD_SHAPE = "shape";

// A key of a `base.extend({ ... })` literal, with the schema it extends. An extended schema checked against a type of
// its own (`satisfies z.ZodType<Other>`) is another shape, so its keys mirror that type and re-declare nothing.
interface ExtendKey {
  readonly node: NamedKey;
  readonly base: Node;
}

function extendKeys(world: NativeWorld): readonly ExtendKey[] {
  const found: ExtendKey[] = [];
  for (const file of world.files.filter((source) => isProduction(world.siteOf(source).file))) {
    const visit = (node: Node): void => {
      const [shape] = isCallExpression(node) ? node.arguments : [];
      const callee = isCallExpression(node) ? node.expression : undefined;
      if (
        callee !== undefined &&
        isPropertyAccessExpression(callee) &&
        callee.name.text === ZOD_EXTEND &&
        shape !== undefined &&
        isObjectLiteralExpression(shape) &&
        checkedType(node) === null
      ) {
        found.push(...namedKeys(shape).map((key) => ({ node: key, base: callee.expression })));
      }
      node.forEachChild(visit);
    };
    file.forEachChild(visit);
  }
  return found;
}

// The base key an extend key re-declares: the extended schema's `shape` property of the same name, if it has one.
function* overriddenKey(checker: Checker, key: ExtendKey): APIRequestGenerator<NativeSymbol | undefined> {
  const type = yield* checker.getTypeAtLocation.gen(key.base);
  const shape = yield* checker.getPropertyOfType.gen(type, ZOD_SHAPE);
  const shapeType = shape === undefined ? undefined : yield* checker.getTypeOfSymbol.gen(shape);
  return shapeType === undefined ? undefined : yield* checker.getPropertyOfType.gen(shapeType, key.node.name.text);
}

// Each base key's declaration keys to the keys of the extend keys that re-declare it. An unchecked override is the same
// wire field under a stricter schema, as the server's role codecs re-declare a contract key, so its reads and writes are
// the base's.
function overrides(world: NativeWorld): ReadonlyMap<string, readonly string[]> {
  const keys = extendKeys(world);
  const own = world.symbolsAt(keys.map(({ node }) => node.name));
  const bases = world.batch(keys.map((key) => overriddenKey(world.checker, key)));
  const found = new Map<string, string[]>();
  for (const [at, base] of bases.entries()) {
    const symbol = own[at];
    if (base === undefined || symbol === undefined) {
      continue;
    }
    for (const baseKey of declarationKeys(base)) {
      found.set(baseKey, [...(found.get(baseKey) ?? []), ...declarationKeys(symbol)]);
    }
  }
  return found;
}

const TRPC_OUTPUT = "output";
const TRPC_MUTATION = "mutation";

// The schema a `.output(schema)` names on a procedure chain that a later `.mutation(...)` ends: the mutation's answer.
function mutationOutputs(world: NativeWorld): readonly Node[] {
  const outputs: Node[] = [];
  for (const file of world.files.filter((source) => isProduction(world.siteOf(source).file))) {
    const visit = (node: Node): void => {
      const [schema] = isCallExpression(node) && isPropertyAccessExpression(node.expression) && node.expression.name.text === TRPC_OUTPUT ? node.arguments : [];
      let at: Node = node;
      while (schema !== undefined && isPropertyAccessExpression(at.parent) && at.parent.expression === at && isCallExpression(at.parent.parent)) {
        if (at.parent.name.text === TRPC_MUTATION) {
          outputs.push(schema);
          break;
        }
        at = at.parent.parent;
      }
      node.forEachChild(visit);
    };
    file.forEachChild(visit);
  }
  return outputs;
}

// The declaration key of the one key of each one-key mutation output schema, read off the schema's `shape`.
function acknowledgementKeys(world: NativeWorld): readonly string[] {
  const { checker } = world;
  const keys = world.batch(
    mutationOutputs(world).map(function* (schema): APIRequestGenerator<readonly string[]> {
      const shape = yield* checker.getPropertyOfType.gen(yield* checker.getTypeAtLocation.gen(schema), ZOD_SHAPE);
      const members = shape === undefined ? [] : yield* checker.getPropertiesOfType.gen(yield* checker.getTypeOfSymbol.gen(shape));
      return members.length === 1 ? members.flatMap(declarationKeys) : [];
    }),
  );
  return keys.flat();
}

// The declaration keys of every named type a production parameter is annotated with.
function parameterHomes(world: NativeWorld): ReadonlySet<string> {
  const names: Node[] = [];
  for (const file of world.files.filter((source) => isProduction(world.siteOf(source).file))) {
    const visit = (node: Node): void => {
      if (isParameterDeclaration(node) && node.type !== undefined && isTypeReferenceNode(node.type)) {
        names.push(node.type.typeName);
      }
      node.forEachChild(visit);
    };
    file.forEachChild(visit);
  }
  return new Set(world.symbolsAt(names).flatMap((symbol) => (symbol === undefined ? [] : declarationKeys(symbol))));
}

export function fieldDeclarations(world: NativeWorld, includeCallables = false): readonly FieldDeclaration[] {
  const owned = parameterHomes(world);
  const keys = schemaKeys(world);
  const symbols = world.symbolsAt(keys.map(({ node }) => node.name));
  const mirrorNodes = keys.flatMap(({ mirror }) => (mirror === null ? [] : [mirror]));
  const mirrors = new Map(world.symbolsAt(mirrorNodes).map((symbol, at) => [mirrorNodes[at], symbol]));
  const members = world.batch(keys.map((key) => mirrored(world.checker, key, key.mirror === null ? undefined : mirrors.get(key.mirror))));
  const memberSites = world.batch(members.map((member) => declarationSites(world, member)));
  const types = typeMembers(world).filter((member) => includeCallables || !member.callable);
  const typeKeys = new Set(types.flatMap((member) => member.keys));
  // A mirrored key and its named type's member are one field, reported at the member with both sets of sites. A key
  // whose member sits in an anonymous union member stays a schema field that the member's references also reach.
  const joined = new Map<string, { readonly keys: readonly string[]; readonly sites: readonly Site[] }>();
  for (const [at, member] of members.entries()) {
    const own = symbols[at];
    const key = keys[at];
    for (const memberKey of (member === undefined ? [] : declarationKeys(member)).filter((candidate) => typeKeys.has(candidate))) {
      const seen = joined.get(memberKey) ?? { keys: [], sites: [] };
      joined.set(memberKey, {
        keys: [...seen.keys, ...(own === undefined ? [] : declarationKeys(own))],
        sites: [...seen.sites, ...(key === undefined ? [] : [world.siteOf(key.node.name)])],
      });
    }
  }
  const fromTypes = types.map((member) => ({
    key: `${member.site.file}:${member.home}.${member.member}`,
    site: member.site,
    line: member.line,
    home: member.home,
    member: member.member,
    origin: "type" as const,
    optional: member.optional,
    parameterOwned: member.homeKeys.some((key) => owned.has(key)),
    keys: [...member.keys, ...member.keys.flatMap((key) => joined.get(key)?.keys ?? [])],
    mirrorSites: member.keys.flatMap((key) => joined.get(key)?.sites ?? []),
  }));
  const fromSchemas = keys.flatMap(({ node, home }, at) => {
    const site = world.siteOf(node.name);
    const symbol = symbols[at];
    const member = members[at];
    const memberKeys = member === undefined ? [] : declarationKeys(member);
    if (memberKeys.some((key) => typeKeys.has(key))) {
      return [];
    }
    const field: FieldDeclaration = {
      key: `${site.file}:${home}.${node.name.text}`,
      site,
      line: node.getSourceFile().getLineAndCharacterOfPosition(site.position).line + 1,
      home,
      member: node.name.text,
      origin: "schema" as const,
      optional: isOptionalSchema(node.initializer),
      parameterOwned: false,
      keys: [...(symbol === undefined ? [] : declarationKeys(symbol)), ...memberKeys],
      mirrorSites: memberSites[at] ?? [],
    };
    return [field];
  });
  const overridden = overrides(world);
  const withOverrides = [...fromTypes, ...fromSchemas].map((field) => ({
    ...field,
    keys: [...field.keys, ...field.keys.flatMap((key) => overridden.get(key) ?? [])],
  }));
  return uniquelyKeyed(withOverrides);
}

// Union options name one key under one home, and each is its own field with its own sites. Declarations walk in source
// order, so every world numbers them alike and the first keeps the bare key.
function uniquelyKeyed(fields: readonly FieldDeclaration[]): readonly FieldDeclaration[] {
  const seen = new Map<string, number>();
  return fields.map((field) => {
    const nth = (seen.get(field.key) ?? 0) + 1;
    seen.set(field.key, nth);
    return nth === 1 ? field : { ...field, key: `${field.key}#${nth}` };
  });
}

interface Tally {
  readonly field: FieldDeclaration;
  /** Every declaration key any world gave the field. */
  readonly keys: Set<string>;
  readonly sites: Map<string, Site>;
  /** The sites that name the field and the writes carried into it. A link-borne write proves nothing about who fills its home. */
  readonly direct: Map<string, Site>;
  /** Serializations that send the field out, by destination and site. */
  readonly sends: Map<string, Send>;
}

// A member's production reads and writes, and how many test sites name it.
interface Roles {
  readonly read: readonly Site[];
  readonly write: readonly Site[];
  readonly tests: number;
}

type SiteFacts = Pick<PropertyReferences, "written" | "readWritten" | "keyed">;

// A write is engine one's, read on the 7.1 tree by the one site-role reader, which also says when the same occurrence
// reads (a used bump); classify.ts roleAt splits the rest into a read and a type position, which that reader does not judge.
function rolesOfSite(sources: Sources, site: Site, { written, readWritten, keyed }: SiteFacts): readonly SyntaxRole[] {
  const key = siteKey(site);
  if (written.has(key)) {
    return readWritten.has(key) ? ["read", "write"] : ["write"];
  }
  return [keyed.get(key) ?? roleAt(sources.get(site.file), site.position)];
}

// Split sites by role. `written`: sites that store into the member, including a library's write the syntax reads
// (a paged query filling its cursor); `readWritten`: the written sites that read it too, which count as both.
// `keyed`: the role of a string key outside a property position, such as a form field path, which syntax types as none.
function rolesOf(sources: Sources, sites: Iterable<Site>, facts: SiteFacts): Roles {
  const read: Site[] = [];
  const write: Site[] = [];
  let tests = 0;
  for (const site of sites) {
    const roles = rolesOfSite(sources, site, facts).filter((role) => role !== "type");
    if (roles.length === 0) {
      continue;
    }
    if (!isProductionFile(site.file)) {
      tests++;
      continue;
    }
    for (const role of roles) {
      (role === "read" ? read : write).push(site);
    }
  }
  return { read, write, tests };
}

// The role that would change a reported row's verdict, by its kind.
const DECIDING_ROLES: Readonly<Record<FieldKind, readonly SyntaxRole[]>> = {
  "never-read": ["read"],
  "never-written": ["write"],
  unreferenced: ["read", "write"],
};

// Whether a key with this reason could land on a reported row's home if a step placed it. An absent key's closed holder
// has no member of that name, and a form path names none; an untyped or holderless key could be any home; a synthetic
// key could be a home whose file declares its holder's other members.
const MIGHT_LAND: Readonly<Record<UnresolvedReason, (row: UnwiredField, holderFiles: readonly string[]) => boolean>> = {
  absent: () => false,
  path: () => false,
  untyped: () => true,
  "no-holder": () => true,
  synthetic: (row, holderFiles) => holderFiles.includes(row.file),
};

// The unplaced keys that could change a reported row: the row's member name, in the role its kind lacks, on a holder
// that could be its home. The name only picks what a person reads next; it credits nothing.
function deciding(sources: Sources, references: PropertyReferences, rows: readonly UnwiredField[]): readonly string[] {
  const byName = Map.groupBy(rows, (row) => row.member.split(".").at(-1) ?? row.member);
  return references.unresolved.flatMap(({ site, name, reason, holderFiles }) => {
    const roles = rolesOfSite(sources, site, references);
    const decided = (byName.get(name) ?? []).filter(
      (row) => roles.some((role) => DECIDING_ROLES[row.kind].includes(role)) && MIGHT_LAND[reason](row, holderFiles),
    );
    return decided.length === 0
      ? []
      : [`${site.file}:${sources.line(site)} ${name} ${reason} -> ${decided.map((row) => `${row.home}.${row.member}`).join(",")}`];
  });
}

// `homeWritten`: production writes some field of the home. A home no production code writes gets its value from outside
// the tree (a host object cast from `globalThis`, a parse of external input), so its optional fields are never a default
// the tree chose.
function kindOf(field: FieldDeclaration, roles: Roles, homeWritten: boolean): FieldKind | "wired" {
  if (roles.read.length === 0) {
    return roles.write.length === 0 ? "unreferenced" : "never-read";
  }
  return roles.write.length === 0 && field.optional && !field.parameterOwned && homeWritten ? "never-written" : "wired";
}

const homeOf = (field: FieldDeclaration): string => `${field.site.file}:${field.home}`;

// Engine two's references for a field and its mirrors, each site once and the field's own names left out.
function mergedSites(names: readonly Site[], second: ReadonlyMap<string, readonly FoundReference[]>): readonly FoundReference[] {
  const own = new Set(names.map(siteKey));
  const merged = new Map(names.flatMap((name) => second.get(siteKey(name)) ?? []).map((site) => [siteKey(site), site]));
  return [...merged.values()].filter((site) => !own.has(siteKey(site)));
}

const namesOf = (field: FieldDeclaration): readonly Site[] => [field.site, ...field.mirrorSites];

function tallyWorld(tally: Map<string, Tally>, declared: Set<string>, world: NativeWorld): number {
  const fields = fieldDeclarations(world);
  for (const field of fields) {
    const entry = tally.get(field.key) ?? { field, keys: new Set(), sites: new Map(), direct: new Map(), sends: new Map() };
    for (const key of field.keys) {
      entry.keys.add(key);
    }
    for (const name of namesOf(field)) {
      declared.add(siteKey(name));
    }
    tally.set(field.key, entry);
  }
  return fields.length;
}

// A schema key names a field; it writes no value, and a flow out of its schema must not carry it as one.
function tallySites(tally: ReadonlyMap<string, Tally>, declared: ReadonlySet<string>, { index, direct, sends }: PropertyReferences): void {
  const keep = (into: Map<string, Site>, sites: readonly Site[]): void => {
    for (const site of sites) {
      const key = siteKey(site);
      if (!declared.has(key)) {
        into.set(key, site);
      }
    }
  };
  for (const entry of tally.values()) {
    keep(entry.sites, sitesOf(index, [...entry.keys], entry.field.site));
    keep(entry.direct, sitesOf(direct, [...entry.keys], entry.field.site));
    // A test that serializes a value sends nothing out of the product.
    for (const send of [...entry.keys].flatMap((key) => sends.get(key) ?? []).filter((sent) => isProductionFile(sent.site.file))) {
      entry.sends.set(`${send.destination} ${siteKey(send.site)} ${send.receiver ?? ""}`, send);
    }
  }
}

function sentCounts(findings: readonly UnwiredField[]): FieldsReport["sentBy"] {
  const counts: Partial<Record<SendDestination, number>> = {};
  for (const finding of findings) {
    for (const destination of new Set(finding.sent.map((sent) => sent.split(" ")[0] as SendDestination))) {
      counts[destination] = (counts[destination] ?? 0) + 1;
    }
  }
  return counts;
}

// A TypeScript 6 write site's value, as the sort's hand-authored test reads it: a key's initializer through `as` and
// `satisfies`, or a JSX attribute's string. The graph's member rows read the same from the 7.1 tree (graph/judge.ts).
function isHandWritten(sources: Sources, site: Site): boolean {
  const parent = nameAt(sources.get(site.file), site.position)?.parent;
  let value: ts.Node | undefined;
  if (parent !== undefined && (ts.isPropertyAssignment(parent) || ts.isJsxAttribute(parent))) {
    value = parent.initializer;
  }
  while (value !== undefined && (ts.isAsExpression(value) || ts.isSatisfiesExpression(value) || ts.isParenthesizedExpression(value))) {
    value = value.expression;
  }
  return value !== undefined && isLiteralTs(value);
}

const isLiteralTs = (node: ts.Node): boolean =>
  ts.isStringLiteralLike(node) ||
  ts.isNumericLiteral(node) ||
  ts.isObjectLiteralExpression(node) ||
  ts.isArrayLiteralExpression(node) ||
  ts.isTemplateExpression(node) ||
  node.kind === ts.SyntaxKind.TrueKeyword ||
  node.kind === ts.SyntaxKind.FalseKeyword;

const asPromise = (field: FieldDeclaration, keys: Iterable<string> = []): PromiseField => ({
  key: field.key,
  file: field.site.file,
  line: field.line,
  home: field.home,
  member: field.member,
  keys,
});

// A reported row before the literal stage, with what the stage needs about it.
type Finding = Omit<UnwiredField, "literal"> & { readonly known: readonly string[]; readonly neverWritten: boolean };

const offsetOf = (site: Site): string => `${site.file}:${String(site.position)}`;

// The receiver outside the tree that reads a field: the SDK publishing it, or a provider body a doc names it in.
function receiverOf(
  { surface, sorter }: { readonly surface: SdkSurface; readonly sorter: FieldSort },
  row: { readonly field: FieldDeclaration; readonly kind: FieldKind; readonly sends: readonly Send[] },
  promised: FieldPromise,
): Pick<ReceivedField, "receiver" | "cite"> | null {
  const { field, kind, sends } = row;
  const { key, site, home, member } = field;
  // A never-written field's question is its writer, which no outside reader answers.
  if (kind === "never-written") {
    return null;
  }
  const cite = publishedAt(surface, { file: site.file, home, member });
  if (cite !== null) {
    return { receiver: "plugin-sdk", cite };
  }
  const provider = sends.some((send) => send.destination === PROVIDER) ? sorter.providerCite({ key, home, member, ...promised }) : null;
  return provider === null ? null : { receiver: "provider", cite: provider };
}

// The literal stage over the reported rows, with its search inputs dropped from the report. Until fields runs on the
// graph program, the first world's program reads the files it holds and parses the rest alone.
function staging(
  root: string,
  configs: readonly string[],
  findings: readonly Finding[],
  control: FieldDeclaration | undefined,
): { readonly rows: readonly UnwiredField[]; readonly stage: LiteralStage | null } {
  const [config] = configs;
  if (control === undefined || config === undefined) {
    return { rows: findings.map(({ known: _known, neverWritten: _neverWritten, ...row }) => ({ ...row, literal: null })), stage: null };
  }
  using world = NativeWorld.open(root, config);
  const staged = literalStage(root, world, findings, { key: control.key, member: control.member, known: namesOf(control).map(offsetOf) });
  return { rows: staged.rows.map(({ known: _known, neverWritten: _neverWritten, ...row }) => row), stage: staged.stage };
}

const MS_PER_SECOND = 1000;
const seconds = (startedMs: number): string => `${((performance.now() - startedMs) / MS_PER_SECOND).toFixed(1)}s`;

/** Run both engines over the worlds of `root` for dead data. */
export function scanFields(options: ScanOptions): FieldsReport {
  const { worlds, testWorlds } = scanWorlds(options);
  const sources = new Sources(options.root);
  const tally = new Map<string, Tally>();
  const declared = new Set<string>();
  const configs = [...worlds, ...testWorlds];
  const lists = NativeWorld.fileLists(options.root, configs);
  const homes = homeFiles(configs, lists);
  const facts: PropertyFacts[] = [];
  const acknowledgements = new Set<string>();
  for (const config of configs) {
    const started = performance.now();
    using world = NativeWorld.open(options.root, config);
    const count = tallyWorld(tally, declared, world);
    for (const key of acknowledgementKeys(world)) {
      acknowledgements.add(key);
    }
    facts.push(propertyFacts(world, homes.get(config)));
    options.log(`${config}: ${count} fields in ${seconds(started)}`);
  }
  const references = joinFacts(facts);
  tallySites(tally, declared, references);
  const rolled = [...tally.values()].map((entry) => ({ ...entry, roles: rolesOf(sources, entry.sites.values(), references) }));
  // A key that overrides a spread copy writes its member, but the home's value still arrives with the copy.
  const builds = (sites: Iterable<Site>): Site[] => [...sites].filter((site) => !references.overrides.has(siteKey(site)));
  const writtenHomes = new Set(
    rolled.filter(({ direct }) => rolesOf(sources, builds(direct.values()), references).write.length > 0).map(({ field }) => homeOf(field)),
  );
  const judged = rolled.flatMap(({ field, roles, sends }) => {
    const kind = kindOf(field, roles, writtenHomes.has(homeOf(field)));
    return kind === "wired" ? [] : [{ field, roles, kind, sends: [...sends.values()] }];
  });
  const reported = new Set(judged.map(({ field }) => field.key));
  const wiredHomes = new Set(rolled.filter(({ field }) => !reported.has(field.key)).map(({ field }) => homeOf(field)));
  const asked = judged.flatMap(({ field }) => namesOf(field));
  const second = serviceReferences(options.root, configs, asked, { log: options.log, crossCheck: options.crossCheck, lists });
  const located = (site: Site): string => `${site.file}:${sources.line(site)}`;
  const surface = sdkSurface(options.root);
  const aliases = homeAliases(options.root);
  const promises = promiseFacts(
    rolled.map(({ field, keys }) => asPromise(field, keys)),
    references.carriesInto,
    aliases,
  );
  const promiseOf = (field: FieldDeclaration): FieldPromise => promises(asPromise(field));
  const sorter = new FieldSort(
    options.root,
    judged.map(({ field }) => ({ key: field.key, home: field.home, member: field.member, onlyHome: promiseOf(field).onlyHome })),
    aliases,
  );
  const findings: Finding[] = [];
  const received: ReceivedField[] = [];
  const disagreements: FieldsReport["disagreements"][number][] = [];
  for (const { field, roles, kind, sends } of judged) {
    // A read that only copies a value into a stored column is a hand-off, which engine one followed to the column.
    const sites = mergedSites(namesOf(field), second).filter((reference) => !references.copied.has(siteKey(reference)));
    const audit = rolesOf(sources, sites, references);
    // A write through a base or sibling member builds that type's value, which reaches this field only through a flow
    // engine one follows; a read through a base type may read this field's value, so it stays in the audit.
    const relatives = new Set(sites.filter((reference) => reference.relative).map(siteKey));
    const writes = audit.write.filter((write) => !relatives.has(siteKey(write)));
    const lacking = [...(roles.read.length === 0 ? audit.read : []), ...(roles.write.length === 0 ? writes : [])];
    if (lacking.length > 0) {
      disagreements.push({ key: field.key, uses: lacking.map(located) });
      continue;
    }
    const { key, site, line, home, member, origin } = field;
    const promised = promiseOf(field);
    const receivedAt = receiverOf({ surface, sorter }, { field, kind, sends }, promised);
    if (receivedAt !== null) {
      received.push({ key, file: site.file, line, home, member, ...receivedAt });
      continue;
    }
    const sample = [...roles.write, ...roles.read].slice(0, SAMPLE).map(located);
    const sent = sends.map((send) => [send.destination, located(send.site), ...(send.receiver === null ? [] : [send.receiver])].join(" "));
    const handAuthored = roles.write.some((write) => isHandWritten(sources, write));
    const { verdict, evidence } = sorter.sort({ key, home, member, handAuthored, siblingsUsed: wiredHomes.has(homeOf(field)), sent, ...promised });
    const tests = Math.max(roles.tests, audit.tests);
    const known = [...namesOf(field), ...roles.read, ...roles.write].map(offsetOf);
    findings.push({
      key,
      file: site.file,
      line,
      home,
      member,
      origin,
      kind,
      tests,
      sample,
      sent,
      verdict,
      evidence,
      known,
      neverWritten: kind === "never-written",
    });
  }
  const control = rolled
    .filter(({ field }) => !reported.has(field.key) && isProduction(field.site.file))
    .sort((a, b) => a.field.key.localeCompare(b.field.key))[0]?.field;
  const stagedAt = performance.now();
  const staged = staging(options.root, configs, findings, control);
  options.log(`literal stage: ${seconds(stagedAt)}`);
  const acknowledged = new Set(rolled.filter(({ keys }) => [...keys].some((key) => acknowledgements.has(key))).map(({ field }) => field.key));
  const ruling = (row: UnwiredField): "validated" | "acknowledged" | null => {
    if (row.origin === "schema" && row.kind === "unreferenced") {
      return "validated";
    }
    return row.kind === "never-read" && acknowledged.has(row.key) ? "acknowledged" : null;
  };
  const sorted = sortDeliberate(staged.rows, options.deliberate);
  const split = sortJudged(
    sorted.unwired.filter((row) => ruling(row) === null),
    options,
  );
  return {
    scanned: tally.size,
    ...split,
    deliberate: sorted.deliberate,
    validated: sorted.unwired.filter((row) => ruling(row) === "validated"),
    acknowledged: sorted.unwired.filter((row) => ruling(row) === "acknowledged"),
    received,
    unresolved: deciding(sources, references, staged.rows),
    unresolvedByReason: Object.fromEntries(
      Map.groupBy(references.unresolved, ({ reason }) => reason)
        .entries()
        .map(([reason, keys]) => [reason, keys.length]),
    ),
    sentBy: sentCounts(staged.rows),
    disagreements,
    literalStage: staged.stage,
    limits: FIELD_LIMITS,
  };
}
