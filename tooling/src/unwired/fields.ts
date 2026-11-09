// `pnpm unwired fields`: data properties of named object types and zod object schemas that production writes and
// never reads, reads and never writes (an optional field always at its default), or never names at all. A value sent
// out of the process counts as read only where its receiver reads it; each reported row carries a proposed sort.
import type { CallExpression, Identifier, Node, ObjectLiteralExpression, PropertyAssignment } from "@typescript/native/ast";
import {
  isArrayLiteralExpression,
  isArrowFunction,
  isCallExpression,
  isIdentifier,
  isObjectLiteralExpression,
  isParameterDeclaration,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isPropertySignatureDeclaration,
  isSatisfiesExpression,
  isStringLiteral,
  isTypeReferenceNode,
  isVariableDeclaration,
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Checker, Symbol as NativeSymbol } from "@typescript/native/sync";
import type { SendDestination } from "./boundaries.ts";
import type { Site, SyntaxRole } from "./classify.ts";
import { isProductionFile, roleAt, Sources, siteKey } from "./classify.ts";
import type { SortEvidence, SortedField, Verdict } from "./field-sort.ts";
import { FieldSort, homeAliases, homeNames } from "./field-sort.ts";
import { serviceReferences } from "./language-service.ts";
import type { LiteralEvidence, LiteralStage } from "./literal-hits.ts";
import { literalStage } from "./literal-hits.ts";
import { constituents, declarationKeys, homeFiles, NativeWorld } from "./native.ts";
import type { PropertyFacts, PropertyReferences, Send } from "./occurrences.ts";
import { joinFacts, propertyFacts } from "./occurrences.ts";
import type { SdkSurface } from "./plugin-surface.ts";
import { publishedAt, sdkSurface } from "./plugin-surface.ts";
import type { ScanOptions } from "./scan.ts";
import { scanWorlds, sitesOf, sortDeliberate } from "./scan.ts";
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
  /** Serializations that send its value out with no receiver the scan can follow, `destination file:line`. */
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
  readonly received: readonly ReceivedField[];
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
  "A computed key built from runtime strings types as string, so it reads or writes no named field.",
  "A type-position read (Registry[K]) is no read; a registry entry needs a value read by name.",
  "A read inside a string (a JSON scenario file, a SQL fragment, a plugin template) is invisible.",
  "JSON.stringify reads every field only where its string is compared, hashed or used as a map key or a *key/*hash binding; elsewhere it is a send with a named destination, and a return or plain binding is 'unclassified'.",
  "A send's receiver outside the tree (an HTTP or wire reader, a log or file reader) is not followed: those rows sort as ask with the destination named.",
  'A value put in an open slot (unknown, or an index signature such as JSONObject or Record<string, unknown>) inside packages/inference/src/backends/ is a provider send with its nested members; it counts as received only where a law, ADR or README line backticks the member as a promise or beside its home or a sibling member. An open slot anywhere else, and an element-access write such as options["k"] = v, is not followed.',
  "nestedValue(value, path) reads every nested member of its value to depth 4, whatever its path names.",
  "c.json sends to the HTTP client; a client read counts only when it is typed by the same declaration.",
  "A Drizzle write flows into the column of the same name; a column counts as read back by a select-row member or a table column read outside the table definition. Raw sql text that names a column is invisible.",
  "A $inferSelect or $inferInsert row member has no declaration; it reads the column of the table whose column names are exactly the row's member names, so a narrowed or widened row type reads nothing.",
  "A value spread or copied into an object that is then serialized is not followed to that serialization.",
  "The plugin SDK surface is matched by home and member name against packages/plugin-sdk/*.d.ts, or by slot path (Home.member, Home.fn() return, Home.fn(n) parameter) where the SDK spells a contract type inline; a renamed home or a slot under another path is missed.",
  "Reader history counts any removed read of a member name one scanned home declares; for a shared name, only a removed read in a file whose parent version names the home, its schema or type twin, or an alias the current tree gives either; a read through an inferred type in a file that never names the home is missed, and a home renamed since is matched only under its current names.",
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
  return subject !== undefined && isTypeReferenceNode(subject) ? subject.typeName : null;
}

// The checked type of a schema, or of the `z.union([...])` or `z.discriminatedUnion(key, [...])` it is an option of.
function mirrorOf(call: Node): { readonly mirror: Node | null; readonly option: boolean } {
  const list = chainTop(call).parent;
  const union = list.parent;
  const isOption =
    isArrayLiteralExpression(list) && isCallExpression(union) && isPropertyAccessExpression(union.expression) && ZOD_UNIONS.has(union.expression.name.text);
  return isOption ? { mirror: checkedType(union), option: true } : { mirror: checkedType(call), option: false };
}

function keysOfShape(shape: ObjectLiteralExpression): readonly SchemaKey[] {
  const home = schemaHome(shape);
  const { mirror, option } = mirrorOf(shape.parent);
  const named = shape.properties.flatMap((property) =>
    isPropertyAssignment(property) && (isIdentifier(property.name) || isStringLiteral(property.name)) ? [property as NamedKey] : [],
  );
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

function declarations(world: NativeWorld): readonly FieldDeclaration[] {
  const owned = parameterHomes(world);
  const keys = schemaKeys(world);
  const symbols = world.symbolsAt(keys.map(({ node }) => node.name));
  const mirrorNodes = keys.flatMap(({ mirror }) => (mirror === null ? [] : [mirror]));
  const mirrors = new Map(world.symbolsAt(mirrorNodes).map((symbol, at) => [mirrorNodes[at], symbol]));
  const members = world.batch(keys.map((key) => mirrored(world.checker, key, key.mirror === null ? undefined : mirrors.get(key.mirror))));
  const memberSites = world.batch(members.map((member) => declarationSites(world, member)));
  const types = typeMembers(world).filter((member) => !member.callable);
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
  return uniquelyKeyed([...fromTypes, ...fromSchemas]);
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

interface Roles {
  readonly read: readonly Site[];
  readonly write: readonly Site[];
  readonly tests: number;
}

function rolesOf(sources: Sources, sites: Iterable<Site>): Roles {
  const read: Site[] = [];
  const write: Site[] = [];
  let tests = 0;
  for (const site of sites) {
    const role: SyntaxRole = roleAt(sources.get(site.file), site.position);
    if (role === "type") {
      continue;
    }
    if (!isProductionFile(site.file)) {
      tests++;
    } else if (role === "read") {
      read.push(site);
    } else {
      write.push(site);
    }
  }
  return { read, write, tests };
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
function mergedSites(names: readonly Site[], second: ReadonlyMap<string, readonly Site[]>): readonly Site[] {
  const own = new Set(names.map(siteKey));
  const merged = new Map(names.flatMap((name) => second.get(siteKey(name)) ?? []).map((site) => [siteKey(site), site]));
  return [...merged.values()].filter((site) => !own.has(siteKey(site)));
}

const namesOf = (field: FieldDeclaration): readonly Site[] => [field.site, ...field.mirrorSites];

function tallyWorld(tally: Map<string, Tally>, declared: Set<string>, world: NativeWorld): number {
  const fields = declarations(world);
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
      entry.sends.set(`${send.destination} ${siteKey(send.site)}`, send);
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

// A settings field promises its feature to whoever sets it. A flow carries that promise into each field it fills, so a
// knob mirrored into a carrier stays promised without a name match.
const SETTINGS_HOMES = "packages/contracts/src/settings/";

interface SettingPromises {
  /** Each settings field, and each field a flow from one fills, to that setting's `file:line`. */
  readonly fed: ReadonlyMap<string, string>;
  /** The first settings field of each member name, `file:line`. */
  readonly named: ReadonlyMap<string, string>;
}

// Every declaration key a value starting at `keys` reaches through flows, however many hops.
function carriedFrom(keys: Iterable<string>, carriesInto: ReadonlyMap<string, ReadonlySet<string>>): ReadonlySet<string> {
  const seen = new Set(keys);
  const queue = [...seen];
  for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
    for (const into of [...(carriesInto.get(next) ?? [])].filter((key) => !seen.has(key))) {
      seen.add(into);
      queue.push(into);
    }
  }
  return seen;
}

function settingPromises(rolled: readonly Tally[], carriesInto: ReadonlyMap<string, ReadonlySet<string>>): SettingPromises {
  const owner = new Map(rolled.flatMap(({ field, keys }) => [...keys].map((key) => [key, field.key] as const)));
  const fed = new Map<string, string>();
  const named = new Map<string, string>();
  for (const { field, keys } of rolled.filter((entry) => entry.field.site.file.startsWith(SETTINGS_HOMES))) {
    const at = `${field.site.file}:${String(field.line)}`;
    named.set(field.member, named.get(field.member) ?? at);
    for (const filled of [field.key, ...[...carriedFrom(keys, carriesInto)].flatMap((key) => owner.get(key) ?? [])]) {
      fed.set(filled, fed.get(filled) ?? at);
    }
  }
  return { fed, named };
}

// One concept per home: a schema and its type twin, or a home and an alias the tree gives it, are one home even in two
// files. Unrelated homes of one name in two files stay apart. Each home maps to the first home of its concept.
function conceptsOf(fields: readonly FieldDeclaration[], aliases: ReadonlyMap<string, ReadonlySet<string>>): ReadonlyMap<string, string> {
  const byHome = new Map<string, string[]>();
  for (const field of fields) {
    const list = byHome.get(field.home) ?? [];
    list.push(homeOf(field));
    byHome.set(field.home, list);
  }
  const root = new Map<string, string>();
  const find = (home: string): string => {
    const up = root.get(home) ?? home;
    return up === home ? home : find(up);
  };
  for (const field of fields) {
    const [head, ...rest] = field.home.split(".");
    const twins = homeNames(field.home, aliases)
      .filter((name) => name !== head)
      .flatMap((name) => byHome.get([name, ...rest].join(".")) ?? []);
    for (const twin of twins) {
      const [a, b] = [find(homeOf(field)), find(twin)].sort();
      if (a !== undefined && b !== undefined && a !== b) {
        root.set(b, a);
      }
    }
  }
  return new Map(fields.map((field) => [homeOf(field), find(homeOf(field))]));
}

// What the sort's promise test needs about a field from the whole scan: whether one home alone declares its member
// name, the other members of its home, the setting that feeds it, and a same-named setting no flow connects.
function promiseFacts(
  rolled: readonly Tally[],
  carriesInto: ReadonlyMap<string, ReadonlySet<string>>,
  aliases: ReadonlyMap<string, ReadonlySet<string>>,
): (field: FieldDeclaration) => Pick<SortedField, "onlyHome" | "setting" | "namedSetting"> & { readonly siblings: readonly string[] } {
  const concepts = conceptsOf(
    rolled.map(({ field }) => field),
    aliases,
  );
  const conceptOf = (field: FieldDeclaration): string => concepts.get(homeOf(field)) ?? homeOf(field);
  const homes = new Map<string, Set<string>>();
  const members = new Map<string, Set<string>>();
  for (const { field } of rolled) {
    homes.set(field.member, (homes.get(field.member) ?? new Set()).add(conceptOf(field)));
    members.set(conceptOf(field), (members.get(conceptOf(field)) ?? new Set()).add(field.member));
  }
  const { fed, named } = settingPromises(rolled, carriesInto);
  return (field) => ({
    onlyHome: homes.get(field.member)?.size === 1,
    siblings: [...(members.get(conceptOf(field)) ?? [])].filter((member) => member !== field.member),
    setting: fed.get(field.key) ?? null,
    namedSetting: named.get(field.member) ?? null,
  });
}

// A reported row before the literal stage, with what the stage needs about it.
type Finding = Omit<UnwiredField, "literal"> & { readonly known: readonly string[]; readonly neverWritten: boolean };

const offsetOf = (site: Site): string => `${site.file}:${String(site.position)}`;

// The receiver outside the tree that reads a field: the SDK publishing it, or a provider body a doc names it in.
function receiverOf(
  { surface, sorter }: { readonly surface: SdkSurface; readonly sorter: FieldSort },
  row: { readonly field: FieldDeclaration; readonly kind: FieldKind; readonly sends: readonly Send[] },
  promised: ReturnType<ReturnType<typeof promiseFacts>>,
): Pick<ReceivedField, "receiver" | "cite"> | null {
  const { field, kind, sends } = row;
  const { key, site, home, member } = field;
  const cite = kind === "never-written" ? null : publishedAt(surface, { file: site.file, home, member });
  if (cite !== null) {
    return { receiver: "plugin-sdk", cite };
  }
  const provider = sends.some((send) => send.destination === PROVIDER) ? sorter.providerCite({ key, home, member, ...promised }) : null;
  return provider === null ? null : { receiver: "provider", cite: provider };
}

// The literal stage over the reported rows, with its search inputs dropped from the report.
function staging(
  root: string,
  sources: Sources,
  findings: readonly Finding[],
  control: FieldDeclaration | undefined,
): { readonly rows: readonly UnwiredField[]; readonly stage: LiteralStage | null } {
  const staged =
    control === undefined
      ? { rows: findings.map((finding) => ({ ...finding, literal: null })), stage: null }
      : literalStage(root, sources, findings, { key: control.key, member: control.member, known: namesOf(control).map(offsetOf) });
  return { rows: staged.rows.map(({ known: _known, neverWritten: _neverWritten, ...row }) => row), stage: staged.stage };
}

/** Run both engines over the worlds of `root` for dead data. */
export function scanFields(options: ScanOptions): FieldsReport {
  const { worlds, testWorlds } = scanWorlds(options);
  const sources = new Sources(options.root);
  const tally = new Map<string, Tally>();
  const declared = new Set<string>();
  const configs = [...worlds, ...testWorlds];
  const homes = homeFiles(configs, NativeWorld.fileLists(options.root, configs));
  const facts: PropertyFacts[] = [];
  for (const config of configs) {
    using world = NativeWorld.open(options.root, config);
    options.log(`${config}: ${tallyWorld(tally, declared, world)} fields`);
    facts.push(propertyFacts(world, homes.get(config)));
  }
  const references = joinFacts(facts);
  tallySites(tally, declared, references);
  const rolled = [...tally.values()].map((entry) => ({ ...entry, roles: rolesOf(sources, entry.sites.values()) }));
  const writtenHomes = new Set(rolled.filter(({ direct }) => rolesOf(sources, direct.values()).write.length > 0).map(({ field }) => homeOf(field)));
  const judged = rolled.flatMap(({ field, roles, sends }) => {
    const kind = kindOf(field, roles, writtenHomes.has(homeOf(field)));
    return kind === "wired" ? [] : [{ field, roles, kind, sends: [...sends.values()] }];
  });
  const reported = new Set(judged.map(({ field }) => field.key));
  const wiredHomes = new Set(rolled.filter(({ field }) => !reported.has(field.key)).map(({ field }) => homeOf(field)));
  const asked = judged.flatMap(({ field }) => namesOf(field));
  const second = serviceReferences(options.root, [...worlds, ...testWorlds], asked, { log: options.log, crossCheck: options.crossCheck });
  const located = (site: Site): string => `${site.file}:${sources.line(site)}`;
  const surface = sdkSurface(options.root);
  const aliases = homeAliases(options.root);
  const promiseOf = promiseFacts(rolled, references.carriesInto, aliases);
  const sorter = new FieldSort(
    options.root,
    sources,
    judged.map(({ field }) => ({ key: field.key, home: field.home, member: field.member, onlyHome: promiseOf(field).onlyHome })),
    aliases,
  );
  const findings: Finding[] = [];
  const received: ReceivedField[] = [];
  const disagreements: FieldsReport["disagreements"][number][] = [];
  for (const { field, roles, kind, sends } of judged) {
    // A read that only copies a value into a stored column is a hand-off, which engine one followed to the column.
    const audit = rolesOf(
      sources,
      mergedSites(namesOf(field), second).filter((reference) => !references.copied.has(siteKey(reference))),
    );
    const lacking = [...(roles.read.length === 0 ? audit.read : []), ...(roles.write.length === 0 ? audit.write : [])];
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
    const sent = sends.map((send) => `${send.destination} ${located(send.site)}`);
    const { verdict, evidence } = sorter.sort({ key, home, member, writes: roles.write, siblingsUsed: wiredHomes.has(homeOf(field)), sent, ...promised });
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
  const staged = staging(options.root, sources, findings, control);
  return {
    scanned: tally.size,
    ...sortDeliberate(staged.rows, options.deliberate),
    received,
    sentBy: sentCounts(staged.rows),
    disagreements,
    literalStage: staged.stage,
    limits: FIELD_LIMITS,
  };
}
