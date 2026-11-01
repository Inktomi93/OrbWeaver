// `pnpm unwired fields`: data properties of named object types and zod object schemas that production writes and
// never reads, reads and never writes (an optional field always at its default), or never names at all.
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
import ts from "typescript";
import type { Site, SyntaxRole } from "./classify.ts";
import { isProductionFile, roleAt, Sources, siteKey } from "./classify.ts";
import type { ServiceWorld } from "./language-service.ts";
import { serviceReferences } from "./language-service.ts";
import { constituents, declarationKeys, hasFlag, NativeWorld } from "./native.ts";
import type { Reflection } from "./occurrences.ts";
import { propertyIndex, REFLECTIVE_CALLS } from "./occurrences.ts";
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
}

export interface FieldsReport {
  readonly scanned: number;
  readonly unwired: readonly UnwiredField[];
  readonly deliberate: readonly (UnwiredField & { readonly reason: string })[];
  /** Fields where engine two found a production site in a role engine one lacks, with those sites. Engine one links
   *  what find-references cannot follow, so engine two finding fewer sites is expected and contradicts nothing. */
  readonly disagreements: readonly { readonly key: string; readonly uses: readonly string[] }[];
}

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
  return [...fromTypes, ...fromSchemas];
}

function serviceReflectionsAt(node: ts.Node): readonly Reflection<ts.Node>[] {
  if (ts.isSpreadAssignment(node) || ts.isJsxSpreadAttribute(node)) {
    return [{ value: node.expression, key: null }];
  }
  if (ts.isElementAccessExpression(node) && !(ts.isStringLiteralLike(node.argumentExpression) || ts.isNumericLiteral(node.argumentExpression))) {
    return [{ value: node.expression, key: node.argumentExpression }];
  }
  if (ts.isForInStatement(node)) {
    return [{ value: node.expression, key: null }];
  }
  if (ts.isCallExpression(node) && REFLECTIVE_CALLS.has(node.expression.getText())) {
    return node.arguments.map((value) => ({ value, key: null }));
  }
  return [];
}

function serviceKeyNames(checker: ts.TypeChecker, key: ts.Node): readonly string[] | null {
  const type = checker.getTypeAtLocation(key);
  const names: string[] = [];
  for (const member of type.isUnion() ? type.types : [type]) {
    if (member.isStringLiteral()) {
      names.push(member.value);
    } else if (hasFlag(member.flags, ts.TypeFlags.String)) {
      return null;
    }
  }
  return names;
}

// A spread into a typed literal reads only the members a library declares on the target; engine one links the rest to
// the target's own members, which find-references cannot follow, so engine two leaves them unread.
function serviceReflectedProperties(checker: ts.TypeChecker, { value, key }: Reflection<ts.Node>): readonly ts.Symbol[] {
  const names = key === null ? null : serviceKeyNames(checker, key);
  const type = checker.getNonNullableType(checker.getTypeAtLocation(value));
  const properties = (type.isUnion() ? type.types : [type]).flatMap((member) =>
    names === null ? checker.getPropertiesOfType(member) : names.flatMap((name) => checker.getPropertyOfType(member, name) ?? []),
  );
  const owner = value.parent.parent;
  const spread =
    (ts.isSpreadAssignment(value.parent) && ts.isObjectLiteralExpression(owner)) || (ts.isJsxSpreadAttribute(value.parent) && ts.isJsxAttributes(owner));
  const target = spread ? checker.getContextualType(owner) : undefined;
  if (target === undefined) {
    return properties;
  }
  const external = (declaration: ts.Declaration): boolean => declaration.getSourceFile().fileName.includes("/node_modules/");
  return properties.filter((property) => checker.getPropertyOfType(target, property.name)?.declarations?.every(external) === true);
}

/** Engine two's view of the reflective reads `propertyIndex` credits in engine one: the sites of the names of the properties read. */
function serviceReflectedReads(world: ServiceWorld): ReadonlySet<string> {
  const found = new Set<string>();
  const visit = (node: ts.Node): void => {
    const properties = serviceReflectionsAt(node).flatMap((reflection) => serviceReflectedProperties(world.checker, reflection));
    for (const declaration of properties.flatMap((property) => property.declarations ?? [])) {
      const name = ts.getNameOfDeclaration(declaration);
      if (name !== undefined) {
        found.add(siteKey(world.siteOf(name)));
      }
    }
    ts.forEachChild(node, visit);
  };
  for (const source of world.program.getSourceFiles()) {
    if (!source.isDeclarationFile && isProduction(world.siteOf(source).file)) {
      visit(source);
    }
  }
  return found;
}

interface Tally {
  readonly field: FieldDeclaration;
  readonly sites: Map<string, Site>;
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

function tallyWorld(tally: Map<string, Tally>, world: NativeWorld): number {
  const fields = declarations(world);
  const index = propertyIndex(world);
  for (const field of fields) {
    const entry = tally.get(field.key) ?? { field, sites: new Map() };
    for (const site of sitesOf(index, field.keys, field.site)) {
      entry.sites.set(siteKey(site), site);
    }
    for (const name of field.mirrorSites) {
      entry.sites.delete(siteKey(name));
    }
    tally.set(field.key, entry);
  }
  return fields.length;
}

/** Run both engines over the worlds of `root` for dead data. */
export function scanFields(options: ScanOptions): FieldsReport {
  const { worlds, testWorlds } = scanWorlds(options);
  const sources = new Sources(options.root);
  const tally = new Map<string, Tally>();
  for (const config of [...worlds, ...testWorlds]) {
    using world = NativeWorld.open(options.root, config);
    options.log(`${config}: ${tallyWorld(tally, world)} fields`);
  }
  const rolled = [...tally.values()].map((entry) => ({ ...entry, roles: rolesOf(sources, entry.sites.values()) }));
  const writtenHomes = new Set(rolled.filter(({ roles }) => roles.write.length > 0).map(({ field }) => homeOf(field)));
  const judged = rolled.flatMap(({ field, roles }) => {
    const kind = kindOf(field, roles, writtenHomes.has(homeOf(field)));
    return kind === "wired" ? [] : [{ field, roles, kind }];
  });
  const reflectedTwo = new Set<string>();
  const asked = judged.flatMap(({ field }) => namesOf(field));
  const second = serviceReferences(options.root, [...worlds, ...testWorlds], asked, {
    log: options.log,
    crossCheck: options.crossCheck,
    visit: (world) => {
      for (const site of serviceReflectedReads(world)) {
        reflectedTwo.add(site);
      }
    },
  });
  const located = (site: Site): string => `${site.file}:${sources.line(site)}`;
  const findings: UnwiredField[] = [];
  const disagreements: FieldsReport["disagreements"][number][] = [];
  for (const { field, roles, kind } of judged) {
    const audit = rolesOf(sources, mergedSites(namesOf(field), second));
    const lacking = [...(roles.read.length === 0 ? audit.read : []), ...(roles.write.length === 0 ? audit.write : [])];
    if (lacking.length > 0) {
      disagreements.push({ key: field.key, uses: lacking.map(located) });
      continue;
    }
    const sample = [...roles.write, ...roles.read].slice(0, SAMPLE).map(located);
    const { key, site, line, home, member, origin } = field;
    findings.push({ key, file: site.file, line, home, member, origin, kind, tests: Math.max(roles.tests, audit.tests), sample });
  }
  return { scanned: tally.size, ...sortDeliberate(findings, options.deliberate), disagreements };
}
