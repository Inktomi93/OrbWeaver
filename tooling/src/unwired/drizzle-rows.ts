// Drizzle rows and their columns. A row typed `typeof table.$inferSelect` or `$inferInsert`, `InferSelectModel<typeof
// table>`, a select result, or a `Pick`, `Omit`, `Partial` or project alias over one, has members no declaration backs;
// such a member finds its column through the table the checker ties its row type to. The key resolver's row-column
// step, the hand-offs, the sends and the origin walk all place a row member here.
//
// - A row type is tied to a table only through the types the checker resolves: the table's `$inferSelect`,
//   `$inferInsert` and `_.columns` types are its anchors, and a type is that table's row when the types it is built from
//   (alias arguments, union and intersection members, a mapped type's template and key constraint, an indexed access's
//   object, a `keyof`'s operand, a conditional's check type, an interface's bases) reach an anchor. Member names never
//   tie: a type that spells a table's columns but is built from none of its types is no row, and two tables with the
//   same columns keep their own rows.
// - A type reference's arguments are not walked, so `Row[]` and `Promise<Row>` are not rows; a table's own type is not
//   walked, as a table is not its own row.
// - A conditional is walked to its check type, never its branches: a conditional left deferred inside a mapped type's
//   template (drizzle's `SelectResultField<T[Key]>`) has generic branches that recurse into a deeper indexed access at
//   every level, so a walk through them never runs out of new types, while its check type is the input it was built from.
// - Each world counts the ties made, the types whose member names spell a table's columns but that the checker ties to
//   none (listed with their file), and the walks the depth bound cut, so a real-tree run shows any column read lost.
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
import type { APIRequestGenerator, Symbol as NativeSymbol, NodeHandle, Type } from "@typescript/native/sync";
import { all } from "@typescript/native/sync";
import { tableDefinition } from "./boundaries.ts";
import type { NativeWorld, PropertyName } from "./native.ts";
import { constituents, DEFAULT_LIBRARY, isPropertyName } from "./native.ts";

/** The Drizzle schema directory: every `sqliteTable` definition lives here. */
export const DB_SCHEMA = "packages/db/src/schema/";

/** One Drizzle table definition: the name its table is bound to and its column keys, each the column's declaration. */
export interface SchemaTable {
  readonly binding: string;
  /** The `sqliteTable(…)` call: its type is the table's. */
  readonly definition: CallExpression;
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
        definition: definition.call,
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

/** A schema table a row type can be tied to: its binding and each column's symbols by name. */
export interface RowTable {
  readonly binding: string;
  readonly columns: ReadonlyMap<string, readonly NativeSymbol[]>;
}

/** The profile counters the row ties add to a build's counts. */
export const ROW_COUNTS = {
  tied: "row ties",
  refused: "row ties refused: member names spell a table's columns, the checker ties no table",
  cut: "row tie walks cut by the depth bound",
} as const;

/** What a world's row ties counted since they were last taken, and each refused tie as `file\ttype`. */
export interface RowTally {
  readonly counts: ReadonlyMap<string, number>;
  readonly refusals: readonly string[];
}

// Drizzle's table members whose types anchor a row: the select and insert rows, and the column map under `_`.
const SELECT_ROW = "$inferSelect";
const INSERT_ROW = "$inferInsert";
const TABLE_META = "_";
const TABLE_COLUMNS = "columns";

// The deepest real-drizzle row reaches its anchor at level 9 (`Pick<InferSelectModel<typeof t>, "k"> & {…}`), and the
// deepest non-row closure in the server and client worlds (a `z.infer` over a nested zod schema) ends by level 32. The
// bound stops only a walk that keeps minting new types, which the cut counter shows.
const ROW_DEPTH = 32;

// A settled tie: the tables, and whether the bound cut the walk (a cut answer never prunes another walk).
interface Tie {
  readonly tables: readonly RowTable[];
  readonly cut: boolean;
}

// One world's tables, the anchor types that tie a row to each, and the ties settled so far.
interface Rows {
  readonly tables: readonly RowTable[];
  readonly anchors: ReadonlyMap<number, readonly RowTable[]>;
  readonly tableTypes: ReadonlySet<number>;
  // Each table's sorted column names, read only to count a tie the names would make and the checker refuses.
  readonly spellings: ReadonlySet<string>;
  readonly ties: Map<number, Tie>;
  readonly counts: Map<string, number>;
  readonly refusals: string[];
}

const spellingOf = (names: Iterable<string>): string => [...names].toSorted().join(",");

// One rows record per world: the resolver, the hand-offs and the sends all ask it.
const ROWS = new WeakMap<NativeWorld, Rows>();

function* listOf(request: APIRequestGenerator<readonly Type[] | undefined>): APIRequestGenerator<readonly Type[]> {
  return (yield* request) ?? [];
}

function* oneOf(request: APIRequestGenerator<Type | undefined>): APIRequestGenerator<readonly Type[]> {
  const type = yield* request;
  return type === undefined ? [] : [type];
}

// The types a type is built from that keep it a row: every relation is asked in one round.
function* builtFrom(type: Type): APIRequestGenerator<readonly Type[]> {
  const asks: APIRequestGenerator<readonly Type[]>[] = [type.getAliasTypeArguments.gen()];
  if (type.isUnionType() || type.isIntersectionType()) {
    asks.push(listOf(type.getTypes.gen()));
  }
  if (type.isMappedType()) {
    asks.push(oneOf(type.getTemplateType.gen()), oneOf(type.getConstraintType.gen()));
  }
  if (type.isIndexedAccessType()) {
    asks.push(oneOf(type.getObjectType.gen()));
  }
  if (type.isIndexType()) {
    asks.push(oneOf(type.getTarget.gen()));
  }
  if (type.isConditionalType()) {
    asks.push(oneOf(type.getCheckType.gen()));
  }
  if (type.isClassOrInterface()) {
    asks.push(listOf(type.getBaseTypes.gen()));
  }
  return (yield* all(...asks)).flat();
}

// The tables, column symbols and anchors are asked through yield, so a hand-off or a send that first needs them mid-walk
// asks within its own round instead of running a batch inside it.
function* rowsOf(world: NativeWorld): APIRequestGenerator<Rows> {
  const known = ROWS.get(world);
  if (known !== undefined) {
    return known;
  }
  const { checker } = world;
  const definitions = schemaTables(world);
  const names = definitions.flatMap(({ columns }) => columns);
  const [found, tableTypes] =
    definitions.length === 0
      ? [[], []]
      : yield* all(checker.getSymbolAtLocation.gen(names), checker.getTypeAtLocation.gen(definitions.map(({ definition }) => definition)));
  const symbols = new Map(names.map((name, at) => [name, found[at]] as const));
  const tables = definitions.map(
    ({ binding, columns }): RowTable => ({
      binding,
      columns: new Map(
        columns.map((name) => {
          const symbol = symbols.get(name);
          return [name.text, symbol === undefined ? [] : [symbol]];
        }),
      ),
    }),
  );
  const members = yield* all(
    ...tableTypes.map(function* (table): APIRequestGenerator<readonly (Type | undefined)[]> {
      const [select, insert, meta] = yield* all(
        checker.getTypeOfPropertyOfType.gen(table, SELECT_ROW),
        checker.getTypeOfPropertyOfType.gen(table, INSERT_ROW),
        checker.getTypeOfPropertyOfType.gen(table, TABLE_META),
      );
      return [select, insert, meta === undefined ? undefined : yield* checker.getTypeOfPropertyOfType.gen(meta, TABLE_COLUMNS)];
    }),
  );
  const anchors = new Map<number, RowTable[]>();
  for (const [at, table] of tables.entries()) {
    for (const anchor of members[at] ?? []) {
      if (anchor !== undefined) {
        anchors.set(anchor.id, [...(anchors.get(anchor.id) ?? []), table]);
      }
    }
  }
  // walks in one round can each read the tables before one settles them; the first record settled is the world's
  const raced = ROWS.get(world);
  if (raced !== undefined) {
    return raced;
  }
  const rows: Rows = {
    tables,
    anchors,
    tableTypes: new Set(tableTypes.map(({ id }) => id)),
    spellings: new Set(tables.map(({ columns }) => spellingOf(columns.keys()))),
    ties: new Map(),
    counts: new Map(),
    refusals: [],
  };
  ROWS.set(world, rows);
  return rows;
}

/** Settle the world's tables and anchors outside any walk, so the walks' generators read a settled record. */
export function rowTables(world: NativeWorld): readonly RowTable[] {
  const known = ROWS.get(world);
  if (known !== undefined) {
    return known.tables;
  }
  const [rows] = world.batch([rowsOf(world)]);
  return rows?.tables ?? [];
}

// What one type on a walk's level answers: an anchor's tables; a type another walk settled, its tables (none when its
// whole walk reached none); a table's own type, nothing; any other type, null, as it is walked on.
function answered(rows: Rows, start: Type, type: Type): readonly RowTable[] | null {
  const anchored = rows.anchors.get(type.id);
  if (anchored !== undefined) {
    return anchored;
  }
  const settled = type.id === start.id ? undefined : rows.ties.get(type.id);
  if (settled !== undefined && (settled.tables.length > 0 || !settled.cut)) {
    return settled.tables;
  }
  return rows.tableTypes.has(type.id) ? [] : null;
}

// Walk what a type is built from, level by level, to the anchors it reaches.
function* walkTie(rows: Rows, start: Type): APIRequestGenerator<Tie> {
  const tied = new Set<RowTable>();
  const seen = new Set<number>([start.id]);
  let level: readonly Type[] = [start];
  for (let depth = 0; level.length > 0; depth++) {
    if (depth > ROW_DEPTH) {
      return { tables: [...tied], cut: tied.size === 0 };
    }
    const open: Type[] = [];
    for (const type of level) {
      const tables = answered(rows, start, type);
      if (tables === null) {
        open.push(type);
      }
      for (const table of tables ?? []) {
        tied.add(table);
      }
    }
    const next = (yield* all(...open.map((type) => builtFrom(type)))).flat();
    level = next.filter((type) => {
      const fresh = !seen.has(type.id);
      seen.add(type.id);
      return fresh;
    });
  }
  return { tables: [...tied], cut: false };
}

const NO_DECLARATION = "(no declaration)";

// A refused type's place: the tree's own file, else the package that declares it, else the compiler's own library.
function* whereDeclared(world: NativeWorld, handle: NodeHandle): APIRequestGenerator<string> {
  return world.fileOf(handle) ?? (yield* world.packageOf(handle)) ?? DEFAULT_LIBRARY;
}

const bump = (rows: Rows, name: string): void => {
  rows.counts.set(name, (rows.counts.get(name) ?? 0) + 1);
};

/** The tables the checker ties a row type to: none for any type that is not a Drizzle row. */
export function* rowTablesOf(world: NativeWorld, type: Type): APIRequestGenerator<readonly RowTable[]> {
  const rows = yield* rowsOf(world);
  const known = rows.ties.get(type.id);
  if (known !== undefined || rows.tables.length === 0) {
    return known?.tables ?? [];
  }
  const tie = rows.tableTypes.has(type.id) ? { tables: [], cut: false } : yield* walkTie(rows, type);
  // two walks of one type can run in one round; the first to settle counts it
  if (rows.ties.has(type.id)) {
    return tie.tables;
  }
  rows.ties.set(type.id, tie);
  if (tie.tables.length > 0) {
    bump(rows, ROW_COUNTS.tied);
    return tie.tables;
  }
  if (tie.cut) {
    bump(rows, ROW_COUNTS.cut);
  }
  const properties = yield* world.checker.getPropertiesOfType.gen(type);
  if (rows.spellings.has(spellingOf(properties.map(({ name }) => name)))) {
    bump(rows, ROW_COUNTS.refused);
    const owner = (yield* type.getAliasSymbol.gen()) ?? (yield* type.getSymbol.gen());
    const [declaration] = owner?.declarations ?? [];
    rows.refusals.push(
      `${declaration === undefined ? NO_DECLARATION : yield* whereDeclared(world, declaration)}\t${yield* world.checker.typeToString.gen(type)}`,
    );
  }
  return tie.tables;
}

/** The world's row counts and refusals since they were last taken, cleared as they are taken. */
export function takeRowTally(world: NativeWorld): RowTally {
  const rows = ROWS.get(world);
  if (rows === undefined) {
    return { counts: new Map(), refusals: [] };
  }
  const tally = { counts: new Map(rows.counts), refusals: [...rows.refusals] };
  rows.counts.clear();
  rows.refusals.length = 0;
  return tally;
}

/** The columns a declaration-less member named `name` of a Drizzle row type `holder` stands for; empty for any other
 *  holder. A hand-off or a send of a whole row carries its members by this step. */
export function* rowColumns(world: NativeWorld, holder: Type, name: string): APIRequestGenerator<readonly NativeSymbol[]> {
  const members = yield* constituents(holder);
  const tables = new Set((yield* all(...members.map((member) => rowTablesOf(world, member)))).flat());
  return [...tables].flatMap(({ columns }) => columns.get(name) ?? []);
}
