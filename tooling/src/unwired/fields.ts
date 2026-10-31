// `pnpm unwired fields`: data properties of named object types and zod object schemas that production writes and
// never reads, reads and never writes (an optional field always at its default), or never names at all.
import type { CallExpression, Identifier, Node, ObjectLiteralExpression, PropertyAssignment } from "@typescript/native/ast";
import {
  isCallExpression,
  isIdentifier,
  isObjectLiteralExpression,
  isParameterDeclaration,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isSatisfiesExpression,
  isStringLiteral,
  isTypeReferenceNode,
  isVariableDeclaration,
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Checker, Symbol as NativeSymbol } from "@typescript/native/sync";
import type { Site, SyntaxRole } from "./classify.ts";
import { isProductionFile, roleAt, Sources, siteKey } from "./classify.ts";
import { serviceReferences } from "./language-service.ts";
import { declarationKeys, NativeWorld } from "./native.ts";
import { propertyIndex } from "./occurrences.ts";
import type { ScanOptions } from "./scan.ts";
import { scanWorlds, sitesOf, sortDeliberate } from "./scan.ts";
import { typeMembers } from "./type-members.ts";
import { isProduction } from "./worlds.ts";

export const FIELD_KINDS = ["never-read", "never-written", "unreferenced"] as const;
/** `never-read`: production writes it and never reads it. `never-written`: an optional field production reads and
 *  never writes, so every branch on it sees the default. `unreferenced`: production neither reads nor writes it. */
export type FieldKind = (typeof FIELD_KINDS)[number];

export const FIELD_ORIGINS = ["type", "schema"] as const;
/** `type`: a member of an interface or object type alias. `schema`: a key of a `z.object` schema. */
export type FieldOrigin = (typeof FIELD_ORIGINS)[number];

export interface UnwiredField {
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
  /** Fields engine one judged and engine two contradicted, with what engine two found. */
  readonly disagreements: readonly { readonly key: string; readonly found: FieldKind | "wired" }[];
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
}

// `z.strictObject({...}).strict() satisfies z.ZodType<View>` or `const schema: z.ZodType<View> = ...`: the `View`.
function mirrorOf(call: Node): Node | null {
  let at = call;
  while (
    isParenthesizedExpression(at.parent) ||
    (isPropertyAccessExpression(at.parent) && at.parent.expression === at && isCallExpression(at.parent.parent) && at.parent.parent.expression === at.parent)
  ) {
    at = isParenthesizedExpression(at.parent) ? at.parent : at.parent.parent;
  }
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

function keysOfShape(shape: ObjectLiteralExpression): readonly SchemaKey[] {
  const home = schemaHome(shape);
  const mirror = mirrorOf(shape.parent);
  return shape.properties.flatMap((property) =>
    isPropertyAssignment(property) && (isIdentifier(property.name) || isStringLiteral(property.name)) ? [{ node: property as NamedKey, home, mirror }] : [],
  );
}

// Each mirrored key's own declaration keys and its type member's, or null for a key with no mirror member.
function* mirrored(checker: Checker, key: SchemaKey, mirror: NativeSymbol | undefined): APIRequestGenerator<readonly string[] | null> {
  if (mirror === undefined) {
    return null;
  }
  const member = yield* checker.getPropertyOfType.gen(yield* checker.getDeclaredTypeOfSymbol.gen(mirror), key.node.name.text);
  return member === undefined ? null : declarationKeys(member);
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
  const memberKeys = world.batch(keys.map((key) => mirrored(world.checker, key, key.mirror === null ? undefined : mirrors.get(key.mirror))));
  // A mirrored key and its type member are one field, reported at the member with both sets of sites.
  const joined = new Map<string, { readonly keys: readonly string[]; readonly sites: readonly Site[] }>();
  for (const [at, member] of memberKeys.entries()) {
    const own = symbols[at];
    const key = keys[at];
    for (const memberKey of member ?? []) {
      const seen = joined.get(memberKey) ?? { keys: [], sites: [] };
      joined.set(memberKey, {
        keys: [...seen.keys, ...(own === undefined ? [] : declarationKeys(own))],
        sites: [...seen.sites, ...(key === undefined ? [] : [world.siteOf(key.node.name)])],
      });
    }
  }
  const fromTypes = typeMembers(world)
    .filter((member) => !member.callable)
    .map((member) => ({
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
    if (memberKeys[at] !== null) {
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
      keys: symbol === undefined ? [] : declarationKeys(symbol),
      mirrorSites: [],
    };
    return [field];
  });
  return [...fromTypes, ...fromSchemas];
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

function kindOf(field: FieldDeclaration, roles: Roles): FieldKind | "wired" {
  if (roles.read.length === 0) {
    return roles.write.length === 0 ? "unreferenced" : "never-read";
  }
  return roles.write.length === 0 && field.optional && !field.parameterOwned ? "never-written" : "wired";
}

// Engine two's references for a field and its mirrors, each site once and the field's own names left out.
function mergedSites(names: readonly Site[], second: ReadonlyMap<string, readonly Site[]>): readonly Site[] {
  const own = new Set(names.map(siteKey));
  const merged = new Map(names.flatMap((name) => second.get(siteKey(name)) ?? []).map((site) => [siteKey(site), site]));
  return [...merged.values()].filter((site) => !own.has(siteKey(site)));
}

/** Run both engines over the worlds of `root` for dead data. */
export function scanFields(options: ScanOptions): FieldsReport {
  const { worlds, testWorlds } = scanWorlds(options);
  const sources = new Sources(options.root);
  const tally = new Map<string, Tally>();
  for (const config of [...worlds, ...testWorlds]) {
    using world = NativeWorld.open(options.root, config);
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
    options.log(`${config}: ${fields.length} fields`);
  }
  const judged = [...tally.values()].flatMap(({ field, sites }) => {
    const roles = rolesOf(sources, sites.values());
    const kind = kindOf(field, roles);
    return kind === "wired" ? [] : [{ field, roles, kind }];
  });
  const second = serviceReferences(
    options.root,
    [...worlds, ...testWorlds],
    judged.flatMap(({ field }) => [field.site, ...field.mirrorSites]),
    options.log,
  );
  const findings: UnwiredField[] = [];
  const disagreements: FieldsReport["disagreements"][number][] = [];
  for (const { field, roles, kind } of judged) {
    const confirmed = rolesOf(sources, mergedSites([field.site, ...field.mirrorSites], second));
    const found = kindOf(field, confirmed);
    if (found === kind) {
      const sample = [...roles.write, ...roles.read].slice(0, SAMPLE).map((written) => `${written.file}:${sources.line(written)}`);
      const { key, site, line, home, member, origin } = field;
      findings.push({ key, file: site.file, line, home, member, origin, kind, tests: Math.max(roles.tests, confirmed.tests), sample });
    } else {
      disagreements.push({ key: field.key, found });
    }
  }
  return { scanned: tally.size, ...sortDeliberate(findings, options.deliberate), disagreements };
}
