// schema-read.ts (#945) — the drizzle columns reader's TWO-SIDED contract, made permanent. The founding
// lie: `sqliteTable("x", importedColumns, …)` returned an EMPTY column set, and eight integrity gates
// (asset FK coverage, FK indexing, JSON write parity, lifecycle portability, soft refs, ownerId registry,
// banned shapes, branding) reported ✓ over zero obligations while their schema file scan stayed healthy
// (2026-08-31). An empty column set is the
// silent-green shape, so every composition this reader cannot establish REFUSES instead.
import { Project } from "ts-morph";
import { columnProperties, schemaScan, schemaTables } from "../../../tooling/src/_shared/schema-read.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

const TABLE_FILE = "packages/db/src/schema/x.ts";

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`/repo/${path}`, source);
  }
  return project;
}

function columnsOf(files: Readonly<Record<string, string>>): string[][] {
  const project = projectOf(files);
  return schemaTables(project.getSourceFileOrThrow(`/repo/${TABLE_FILE}`)).map((table) => table.columns.map((column) => column.name));
}

test("an IMPORTED columns object keeps every column, with its own declaring node", () => {
  const project = projectOf({
    "packages/db/src/schema/x-columns.ts": 'export const cols = { id: text("id"), ownerId: text("owner_id") };',
    [TABLE_FILE]: 'import { cols } from "./x-columns.ts";\nexport const t = sqliteTable("t", cols);',
  });
  const [table] = schemaTables(project.getSourceFileOrThrow(`/repo/${TABLE_FILE}`));
  // THE DEFECT: this used to be `[]`, which read to every consuming gate as "this table owes nothing".
  expect(table?.columns.map((column) => column.name)).toEqual(["id", "ownerId"]);
  // Provenance: a finding must land on the column's HOME, not on the table that merely composed it.
  expect(table?.columns[0]?.node.getSourceFile().getFilePath()).toBe("/repo/packages/db/src/schema/x-columns.ts");
});

test("a LOCAL binding and an object SPREAD inside the literal both resolve", () => {
  expect(columnsOf({ [TABLE_FILE]: 'const cols = { id: text("id") };\nexport const t = sqliteTable("t", cols);' })).toEqual([["id"]]);
  expect(columnsOf({ [TABLE_FILE]: 'const base = { ownerId: text("owner_id") };\nexport const t = sqliteTable("t", { ...base, id: text("id") });' })).toEqual([
    ["ownerId", "id"],
  ]);
});

test("a columns object built by a CALL refuses — an unreadable set must never read as an empty one", () => {
  expect(() => columnsOf({ [TABLE_FILE]: 'export const t = sqliteTable("t", buildColumns());' })).toThrow(/unsupported columns expression/u);
});

test("a columns identifier nothing binds refuses", () => {
  expect(() => columnsOf({ [TABLE_FILE]: 'export const t = sqliteTable("t", missingColumns);' })).toThrow(/resolves to no local declaration or named import/u);
});

test("a columns binding cycle refuses instead of recursing", () => {
  expect(() => columnsOf({ [TABLE_FILE]: 'const a = b;\nconst b = a;\nexport const t = sqliteTable("t", a);' })).toThrow(/columns binding cycle/u);
});

test("an ABSENT columns argument is not a refusal — a malformed call stays the consuming gate's fail-closed case", () => {
  expect(columnProperties(undefined)).toEqual([]);
});

test("schemaScan reports the resolved population, so a collapsed denominator is visible on the gate's row", () => {
  const scan = schemaScan(
    projectOf({
      "packages/db/src/schema/x-columns.ts": 'export const cols = { id: text("id"), ownerId: text("owner_id") };',
      [TABLE_FILE]: 'import { cols } from "./x-columns.ts";\nexport const t = sqliteTable("t", cols);',
      "packages/db/src/schema/index.ts": 'export * from "./x.ts";',
    }),
  );
  expect(scan).toEqual({
    unit: "schema table [tables=1 resolvedColumns=2]",
    candidates: 1,
    scanned: 1,
    population: [{ source: "drizzle columns", members: 2 }],
  });
});

// ── #1035: every member KIND is answered, none is skipped ───────────────────────────────────────────────
// The founding measurement (v-gates, in-process): an FK written SHORTHAND made `fk-columns-indexed` GREEN
// where the byte-identical inline column RED'd — resolvedColumns 3 -> 2, no refusal anywhere. A member kind
// this reader drops is a whole column's obligations leaving eight gates at once.
test("a SHORTHAND member resolves through its binding, and reports at the binding's own site", () => {
  const project = projectOf({
    [TABLE_FILE]:
      'const id = text("id").primaryKey();\nconst ownerId = text("owner_id").references(() => users.id);\nexport const t = sqliteTable("t", { id, ownerId });',
  });
  const [table] = schemaTables(project.getSourceFileOrThrow(`/repo/${TABLE_FILE}`));
  expect(table?.columns.map((column) => column.name)).toEqual(["id", "ownerId"]);
  // THE DEFECT: this used to be `[]` — both columns dropped, the table owing nothing.
  expect(table?.columns[1]?.text).toContain(".references(");
  expect(table?.columns[1]?.node.getKindName()).toBe("VariableDeclaration");
});

test("a shorthand whose binding nothing declares REFUSES", () => {
  expect(() => columnsOf({ [TABLE_FILE]: 'export const t = sqliteTable("t", { missingColumn });' })).toThrow(
    /shorthand column "missingColumn".*resolves to no local declaration or named import/su,
  );
});

test("a COMPUTED key resolves when it is a string literal, and refuses when it is not", () => {
  expect(columnsOf({ [TABLE_FILE]: 'export const t = sqliteTable("t", { ["owner_id"]: text("owner_id") });' })).toEqual([["owner_id"]]);
  // `getName()` would hand every consumer the literal text `[k]`, a column key that matches nothing.
  expect(() => columnsOf({ [TABLE_FILE]: 'const k = keyFor();\nexport const t = sqliteTable("t", { [k]: text("x") });' })).toThrow(
    /computed column key .* is not a string literal/su,
  );
});

test("any OTHER member kind refuses — a method/accessor member is not a droppable column", () => {
  expect(() => columnsOf({ [TABLE_FILE]: 'export const t = sqliteTable("t", { id: text("id"), extras() { return 1; } });' })).toThrow(
    /unsupported columns member kind MethodDeclaration/u,
  );
  expect(() => columnsOf({ [TABLE_FILE]: 'export const t = sqliteTable("t", { id: text("id"), get late() { return 1; } });' })).toThrow(
    /unsupported columns member kind GetAccessor/u,
  );
});

test("an IMPORTED columns object that resolves to an EMPTY object refuses", () => {
  expect(() =>
    columnsOf({
      "packages/db/src/schema/x-columns.ts": "export const cols = {};",
      [TABLE_FILE]: 'import { cols } from "./x-columns.ts";\nexport const t = sqliteTable("t", cols);',
    }),
  ).toThrow(/resolves to an EMPTY object/u);
});

test("a spread that contributes ZERO columns refuses", () => {
  // An INLINE empty spread. A spread through a BINDING refuses one step earlier, at the hop itself
  // ("resolves to an EMPTY object" — the test above), which is the shape a real schema would take.
  expect(() => columnsOf({ [TABLE_FILE]: 'export const t = sqliteTable("t", { ...{}, id: text("id") });' })).toThrow(/resolved to zero columns/u);
});

test("the columns ride the #946 POPULATION receipt, so an empty set is refused at the entrypoint too", () => {
  const scan = schemaScan(
    projectOf({
      [TABLE_FILE]: 'const ownerId = text("owner_id");\nexport const t = sqliteTable("t", { ownerId });',
      "packages/db/src/schema/index.ts": 'export * from "./x.ts";',
    }),
  );
  expect(scan.population).toEqual([{ source: "drizzle columns", members: 1 }]);
});
