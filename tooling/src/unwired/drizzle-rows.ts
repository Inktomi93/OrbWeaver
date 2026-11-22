// Drizzle rows and their columns. A row typed `typeof table.$inferSelect` or `$inferInsert`, or returned by a select
// with no column list, has members no declaration backs; its member names are exactly its table's column names, the
// whole set and not one name, which is how such a member finds its column. The key resolver's row-column step, the
// hand-offs and the sends all place a row member here.
import type { CallExpression, Node } from "@typescript/native/ast";
import {
  isArrayLiteralExpression,
  isCallExpression,
  isIdentifier,
  isObjectLiteralExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isVariableDeclaration,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Symbol as NativeSymbol, Type } from "@typescript/native/sync";
import { all } from "@typescript/native/sync";
import { tableDefinition } from "./boundaries.ts";
import type { NativeWorld, PropertyName } from "./native.ts";
import { constituents, isPropertyName } from "./native.ts";

/** The Drizzle schema directory: every `sqliteTable` definition lives here. */
export const DB_SCHEMA = "packages/db/src/schema/";

/** One Drizzle table definition: the name its table is bound to and its column keys, each the column's declaration. */
export interface SchemaTable {
  readonly binding: string;
  readonly columns: readonly PropertyName[];
  /** The columns its primary key names: a column built with `.primaryKey()`, or one a `primaryKey({ columns })` lists. */
  readonly primaryKeys: ReadonlySet<string>;
}

const PRIMARY_KEY = "primaryKey";

// A column builder chain that calls `.primaryKey()`: `text("id").$type<Id>().primaryKey()`.
function buildsPrimaryKey(node: Node | undefined): boolean {
  let at = node;
  while (at !== undefined && isCallExpression(at) && isPropertyAccessExpression(at.expression)) {
    if (at.expression.name.text === PRIMARY_KEY) {
      return true;
    }
    at = at.expression.expression;
  }
  return false;
}

// The columns each `primaryKey({ columns: [t.a, t.b] })` in a table's extra callback names.
function compositeKeys(definition: CallExpression): readonly string[] {
  const names: string[] = [];
  const visit = (node: Node): void => {
    if (isCallExpression(node) && isIdentifier(node.expression) && node.expression.text === PRIMARY_KEY) {
      const [options] = node.arguments;
      const listed =
        options !== undefined && isObjectLiteralExpression(options)
          ? options.properties.find((property) => isPropertyAssignment(property) && isIdentifier(property.name) && property.name.text === "columns")
          : undefined;
      const columns = listed !== undefined && isPropertyAssignment(listed) && isArrayLiteralExpression(listed.initializer) ? listed.initializer.elements : [];
      names.push(...columns.flatMap((column) => (isPropertyAccessExpression(column) ? [column.name.text] : [])));
    }
    node.forEachChild(visit);
  };
  const extra = definition.arguments[2];
  if (extra !== undefined) {
    visit(extra);
  }
  return names;
}

/** Every table defined in the schema files of `world` that `files` admits. */
export function schemaTables(world: NativeWorld, files: (file: string) => boolean = () => true): readonly SchemaTable[] {
  const tables: SchemaTable[] = [];
  const visit = (node: Node): void => {
    const definition = tableDefinition(node);
    if (definition !== null) {
      const { parent } = definition.call;
      const binding = isVariableDeclaration(parent) && isIdentifier(parent.name) ? parent.name.text : (definition.call.arguments[0]?.getText() ?? "");
      const assignments = definition.columns.properties.filter(isPropertyAssignment);
      tables.push({
        binding,
        columns: assignments.flatMap((column) => (isPropertyName(column.name) ? [column.name] : [])),
        primaryKeys: new Set([
          ...assignments.flatMap((column) => (isPropertyName(column.name) && buildsPrimaryKey(column.initializer) ? [column.name.text] : [])),
          ...compositeKeys(definition.call),
        ]),
      });
    }
    node.forEachChild(visit);
  };
  for (const file of world.files.filter((source) => world.siteOf(source).file.startsWith(DB_SCHEMA) && files(world.siteOf(source).file))) {
    file.forEachChild(visit);
  }
  return tables;
}

// Each table's columns by name, keyed by the table's sorted column names.
type TablesBySignature = ReadonlyMap<string, ReadonlyMap<string, readonly NativeSymbol[]>>;

/** A row's signature: its member names, sorted. A row type and its table share one. */
export const signatureOf = (names: Iterable<string>): string => [...names].toSorted().join(",");

// One signature map per world: the resolver, the hand-offs and the sends all ask it.
const TABLES = new WeakMap<NativeWorld, TablesBySignature>();

/** Each table's column symbols by name, keyed by the table's {@link signatureOf}. */
export function rowColumnsBySignature(world: NativeWorld): TablesBySignature {
  const known = TABLES.get(world);
  if (known !== undefined) {
    return known;
  }
  const tables = schemaTables(world).map(({ columns }) => columns);
  const names = tables.flat();
  const symbols = new Map(world.symbolsAt(names).map((symbol, at) => [names[at], symbol] as const));
  // Two tables with the same column names cannot be told apart by a row type, so such a member reads both.
  const bySignature = new Map<string, Map<string, NativeSymbol[]>>();
  for (const columns of tables) {
    const signature = signatureOf(columns.map((name) => name.text));
    const merged = bySignature.get(signature) ?? new Map<string, NativeSymbol[]>();
    for (const name of columns) {
      const symbol = symbols.get(name);
      merged.set(name.text, [...(merged.get(name.text) ?? []), ...(symbol === undefined ? [] : [symbol])]);
    }
    bySignature.set(signature, merged);
  }
  TABLES.set(world, bySignature);
  return bySignature;
}

/** The columns a declaration-less member named `name` of a Drizzle row type `holder` stands for; empty for any other
 *  holder. A hand-off or a send of a whole row carries its members by this step. */
export function* rowColumns(world: NativeWorld, holder: Type, name: string): APIRequestGenerator<readonly NativeSymbol[]> {
  const tables = rowColumnsBySignature(world);
  if (tables.size === 0) {
    return [];
  }
  const members = yield* constituents(holder);
  const named = yield* all(...members.map((member) => world.checker.getPropertiesOfType.gen(member)));
  return named.flatMap((properties) => tables.get(signatureOf(properties.map((property) => property.name)))?.get(name) ?? []);
}
