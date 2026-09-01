// schema-read.ts (#945) — the drizzle columns reader's TWO-SIDED contract, made permanent. The founding
// lie: `sqliteTable("x", importedColumns, …)` returned an EMPTY column set, and eight integrity gates
// (asset FK coverage, FK indexing, JSON write parity, lifecycle portability, soft refs, ownerId registry,
// banned shapes, branding) reported ✓ over zero obligations while their schema file scan stayed healthy
// (docs/reviews/stickler/2026-08-31-gate-member-discovery-rehome-audit.md). An empty column set is the
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
  expect(scan).toEqual({ unit: "schema table [tables=1 resolvedColumns=2]", candidates: 1, scanned: 1 });
});
