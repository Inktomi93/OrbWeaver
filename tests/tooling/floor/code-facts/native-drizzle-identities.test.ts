// @subject tooling/src/floor/compiler/drizzle-inventory-extract.ts
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import type { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import { vi } from "vitest";
import { assertSchemaColumnRoster, SCHEMA_DATA_CATALOG_KEY } from "../../../../tooling/src/floor/code-facts/drizzle-inventory-contract.ts";
import type { InventoryBuildRequest, InventorySpan, SemanticInventoryOptions } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { drizzleQueryKey, drizzleSchemas } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import {
  latestInventoryGeneration,
  openInventoryDatabase,
  readInventoryGeneration,
} from "../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts";
import { inputVersion } from "../../../../tooling/src/floor/code-facts/semantic-inventory-inputs.ts";
import { acquireInventoryReadLease, readInventoryDrizzleCall } from "../../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts";
import { inventoryReader, ownedInventoryReader } from "../../../../tooling/src/floor/code-facts/semantic-inventory-reader.ts";
import { inventoryString } from "../../../../tooling/src/floor/code-facts/semantic-inventory-records.ts";
import { readInventoryRuntime } from "../../../../tooling/src/floor/code-facts/semantic-inventory-runtime-query.ts";
import { readCompilerPrograms } from "../../../../tooling/src/floor/compiler/compiler-programs.ts";
import { inventoryFileSystem } from "../../../../tooling/src/floor/compiler/semantic-inventory-filesystem.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { runNicedSync } from "../../../../tooling/src/floor/process/proc.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { nativeInventoryFixture } from "../compiler/native-inventory-fixture.ts";
import { copyNativeInventoryImplementation } from "../compiler/native-inventory-tree.ts";

const DB = "packages/db/tsconfig.json";
const SERVER = "packages/server/tsconfig.json";
const ASSETS = "packages/db/src/schema/assets.ts";
const UNRELATED = "packages/db/src/schema/unrelated.ts";
const ENTRY = "packages/server/src/entry.ts";
const PREFIX = "dependency/prefix.ts";
const ASSET_TEXT =
  "import {sqliteTable,text} from 'drizzle-orm/sqlite-core';export const assets=sqliteTable('assets',{id:text('id').primaryKey(),meta:text('meta',{mode:'json'}).$type<{label:string}>().notNull()});";
const UNRELATED_TEXT =
  "import {sqliteTable,text,index} from 'drizzle-orm/sqlite-core';import {assets} from './assets.ts';export const unrelated=sqliteTable('unrelated',{id:text('id').primaryKey(),assetId:text('asset_id').references(()=>assets.id)},table=>[index('unrelated_asset').on(table.assetId)]);";
const ENTRY_TEXT =
  "import type {BaseSQLiteDatabase} from 'drizzle-orm/sqlite-core';import {assets} from '@orb/db';import {held} from '../../../dependency/prefix.ts';declare const db:BaseSQLiteDatabase<'async',void>;export const direct=db.insert(assets);held();";
const inventoryQueries = await import("../../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts");

function span(node: MorphNode): InventorySpan {
  return { file: node.getSourceFile().getFilePath(), start: node.getStart(), end: node.getEnd(), kind: node.getKind() };
}

function setup(
  root: string,
  repoRoot: string,
  entryText = ENTRY_TEXT,
  assetText = ASSET_TEXT,
): {
  readonly options: SemanticInventoryOptions;
  readonly sources: readonly SourceFile[];
  readonly direct: import("ts-morph").CallExpression;
  readonly bound: import("ts-morph").CallExpression;
} {
  const files = {
    [ASSETS]: assetText,
    [UNRELATED]: UNRELATED_TEXT,
    "packages/db/src/index.ts": "export {assets} from './schema/assets.ts';",
    [ENTRY]: entryText,
    [PREFIX]:
      "import type {BaseSQLiteDatabase} from 'drizzle-orm/sqlite-core';import {assets} from '@orb/db';declare const db:BaseSQLiteDatabase<'async',void>;export const held=db.insert.bind(db,assets);",
  };
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write(".gitignore", "node_modules\n.cache\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  const compilerOptions = {
    target: "ES2022",
    module: "ESNext",
    moduleResolution: "Bundler",
    strict: true,
    skipLibCheck: true,
    types: [],
    paths: { "@orb/db": [join(root, "packages/db/src/index.ts")] },
  };
  write("package.json", '{"type":"module"}');
  write("tsconfig.json", JSON.stringify({ compilerOptions, files: Object.keys(files) }));
  write(DB, JSON.stringify({ compilerOptions, files: ["src/schema/assets.ts", "src/schema/unrelated.ts", "src/index.ts"] }));
  write(SERVER, JSON.stringify({ compilerOptions, files: ["src/entry.ts"] }));
  for (const [path, text] of Object.entries(files)) {
    write(path, text);
  }
  execFixtureGit(root, ["init", "-q"]);
  const project = new Project({ useInMemoryFileSystem: true, skipLoadingLibFiles: true });
  for (const [path, text] of Object.entries(files)) {
    project.createSourceFile(join(root, path), text);
  }
  const entry = project.getSourceFileOrThrow(join(root, ENTRY));
  const direct = entry.getVariableDeclarationOrThrow("direct").getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression);
  const bound = entry.getDescendantsOfKind(SyntaxKind.CallExpression).find((call) => call.getExpression().getText() === "held");
  if (bound === undefined) {
    throw new Error("native bound control is missing");
  }
  const sources = [ASSETS, UNRELATED].map((path) => project.getSourceFileOrThrow(join(root, path)));
  return {
    sources,
    direct,
    bound,
    options: {
      root,
      programs: readCompilerPrograms(root).filter(({ id }) => id === DB || id === SERVER),
      families: ["drizzle-identities"],
      schemaQuery: { program: DB, sources: sources.map(span) },
      drizzleQueries: [
        { program: SERVER, query: { node: span(direct), mode: "called-member" } },
        { program: SERVER, query: { node: span(bound), mode: "instance" } },
      ],
    },
  };
}

test("owned schema raw reuse isolates returned values and still checks every source epoch", { timeout: scaledBudget(60_000) }, ({ scratch, repoRoot }) => {
  const fixture = setup(scratch, repoRoot, `${ENTRY_TEXT}\nexport const selected=assets.meta;export const second=assets.id;`);
  const source = fixture.direct.getSourceFile();
  const selected = source.getVariableDeclarationOrThrow("selected").getInitializerOrThrow();
  const second = source.getVariableDeclarationOrThrow("second").getInitializerOrThrow();
  using original = nativeInventoryFixture({
    ...fixture.options,
    families: ["drizzle-identities", "schema-data"],
    schemaDataQuery: { program: DB, sources: fixture.sources.map(span) },
    drizzleQueries: [
      ...(fixture.options.drizzleQueries ?? []),
      ...[selected, second].map((node) => ({ program: SERVER, query: { node: span(node), mode: "column" as const } })),
    ],
  });
  using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
  using lease = acquireInventoryReadLease(db, original.generation, readInventoryGeneration(db, original.generation));
  using reader = ownedInventoryReader(scratch, original.generation, lease, { db, dispose: () => undefined });
  const identities = vi.spyOn(inventoryQueries, "readInventorySchemaIdentity");
  const full = vi.spyOn(inventoryQueries, "readInventorySchemaData");
  try {
    const first = reader.drizzleEvidence(selected, SERVER, "column");
    reader.drizzleEvidence(second, SERVER, "column");
    reader.drizzleEvidence(selected, SERVER, "column");
    expect(identities).toHaveBeenCalledTimes(1);
    expect(full).toHaveBeenCalledTimes(1);
    if (first.mode !== "column" || first.column.kind !== "resolved") {
      throw new Error("native selected column is unavailable");
    }
    Object.assign(first.column.value.table, { key: "poisoned" });
    const identity = reader.schemaIdentity(fixture.sources, DB);
    const table = identity.status === "ready" ? identity.value.tables[0] : undefined;
    if (table === undefined) {
      throw new Error("native identity table is unavailable");
    }
    Object.assign(table.identity, { key: "poisoned" });
    const projected = reader.schemaData(fixture.sources, DB);
    const column = projected.status === "ready" ? projected.value.tables[0]?.columns[0] : undefined;
    if (column === undefined) {
      throw new Error("native projected column is unavailable");
    }
    Object.assign(column.identity, { key: "poisoned" });
    expect(reader.drizzleEvidence(selected, SERVER, "column")).toMatchObject({
      mode: "column",
      column: { kind: "resolved", value: { key: `${ASSETS}#assets.meta`, table: { key: `${ASSETS}#assets` } } },
    });
    expect(reader.schemaIdentity(fixture.sources, DB)).toMatchObject({
      status: "ready",
      value: { tables: [expect.objectContaining({ identity: expect.objectContaining({ key: `${ASSETS}#assets` }) }), expect.anything()] },
    });
    expect(identities).toHaveBeenCalledTimes(1);
    expect(full).toHaveBeenCalledTimes(1);
    const unrelated = fixture.sources[1];
    if (unrelated === undefined) {
      throw new Error("native unrelated schema source is unavailable");
    }
    unrelated.replaceWithText(`${UNRELATED_TEXT}\n`);
    expect(() => reader.drizzleEvidence(selected, SERVER, "column")).toThrow("source/epoch");
    unrelated.replaceWithText(UNRELATED_TEXT);
    expect(reader.drizzleEvidence(selected, SERVER, "column")).toMatchObject({ mode: "column", column: { kind: "resolved" } });
  } finally {
    identities.mockRestore();
    full.mockRestore();
  }
});

test("released owned lease refuses warm schema evidence while its connection remains open", { timeout: scaledBudget(60_000) }, ({ scratch, repoRoot }) => {
  const fixture = setup(scratch, repoRoot);
  using original = nativeInventoryFixture(fixture.options);
  using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
  using lease = acquireInventoryReadLease(db, original.generation, readInventoryGeneration(db, original.generation));
  using reader = ownedInventoryReader(scratch, original.generation, lease, { db, dispose: () => undefined });
  expect(reader.drizzleEvidence(fixture.direct, SERVER, "called-member")).toMatchObject({ mode: "called-member", table: { kind: "resolved" } });
  lease[Symbol.dispose]();
  expect(db.isOpen).toBe(true);
  expect(() => reader.drizzleEvidence(fixture.direct, SERVER, "called-member")).toThrow("lease has been released");
});

test(
  "native column evidence retains canonical selected columns, unknowns and old call modes under one complete catalog",
  ({ scratch, repoRoot }) => {
    const fixture = setup(
      scratch,
      repoRoot,
      `${ENTRY_TEXT}\nexport const selected=assets.meta;export const unknown=({meta:'foreign'}).meta;`,
      `${ASSET_TEXT}\nexport const local=assets.meta;`,
    );
    const source = fixture.direct.getSourceFile();
    const selected = source.getVariableDeclarationOrThrow("selected").getInitializerOrThrow();
    const unknown = source.getVariableDeclarationOrThrow("unknown").getInitializerOrThrow();
    const local = fixture.sources[0]?.getVariableDeclarationOrThrow("local").getInitializerOrThrow();
    if (local === undefined) {
      throw new Error("native local column fixture is missing");
    }
    const options: SemanticInventoryOptions = {
      ...fixture.options,
      families: ["drizzle-identities", "schema-data"],
      schemaDataQuery: { program: DB, sources: fixture.sources.map(span) },
      drizzleQueries: [
        ...(fixture.options.drizzleQueries ?? []),
        ...[selected, unknown].map((node) => ({ program: SERVER, query: { node: span(node), mode: "column" as const } })),
        { program: DB, query: { node: span(local), mode: "column" } },
      ],
    };
    const requests: InventoryBuildRequest[] = [];
    using original = nativeInventoryFixture(options, { requests });
    const column = original.drizzleEvidence(selected, SERVER, "column");
    expect(column).toMatchObject({
      mode: "column",
      column: { kind: "resolved", value: { key: `${ASSETS}#assets.meta`, propertyName: "meta", table: { key: `${ASSETS}#assets` } } },
    });
    expect(original.drizzleEvidence(unknown, SERVER, "column")).toMatchObject({ mode: "column", column: { kind: "unresolved" } });
    expect(original.drizzleEvidence(local, DB, "column")).toMatchObject({
      mode: "column",
      column: { kind: "resolved", value: { key: `${ASSETS}#assets.meta` } },
    });
    expect(original.drizzleEvidence(fixture.direct, SERVER, "called-member")).toMatchObject({ mode: "called-member", table: { kind: "resolved" } });
    expect(original.drizzleEvidence(fixture.bound, SERVER, "instance")).toMatchObject({ mode: "instance", invocation: { kind: "resolved" } });
    const request = requests.find(({ descriptor }) => descriptor.id === SERVER);
    expect(request?.schemaDependency?.columns?.map(({ key }) => key)).toEqual([
      `${ASSETS}#assets.id`,
      `${ASSETS}#assets.meta`,
      `${UNRELATED}#unrelated.id`,
      `${UNRELATED}#unrelated.assetId`,
    ]);
    const dependency = request?.schemaDependency;
    const roster = dependency?.columns;
    if (dependency === undefined || roster === undefined) {
      throw new Error("native column dependency was not captured");
    }
    expect(() => assertSchemaColumnRoster(dependency.catalog, roster.slice(1))).toThrow("incomplete or foreign");
    expect(() =>
      assertSchemaColumnRoster(
        dependency.catalog,
        roster.map((value) => ({ ...value, key: `foreign.${value.key}` })),
      ),
    ).toThrow("incomplete or foreign");
    expect(request?.descriptor.files).toEqual([ENTRY]);
    expect(() => original.drizzleEvidence(selected, SERVER, "instance")).toThrow("not a call");
    expect(() => original.drizzleEvidence(selected, "foreign", "column")).toThrow("partition is unavailable");
    const warmWorkers: string[] = [];
    using same = nativeInventoryFixture(options, { workers: warmWorkers });
    expect(warmWorkers).toEqual([]);
    expect(same.generation).toBe(original.generation);
    expect(same.drizzleEvidence(selected, SERVER, "column")).toMatchObject({ mode: "column", column: { kind: "resolved" } });
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    const partitions = readInventoryGeneration(db, original.generation);
    const consumer = partitions.find(({ program }) => program === SERVER);
    const catalog = partitions.find(({ program }) => program === DB);
    if (consumer === undefined || catalog === undefined) {
      throw new Error("native column partitions are missing");
    }
    expect(readInventoryDrizzleCall(db, catalog.id, { node: span(local), mode: "column" }).basis).toBeNull();
    const oldCall = readInventoryDrizzleCall(db, consumer.id, { node: span(fixture.direct), mode: "called-member" });
    expect(drizzleSchemas.call.safeParse({ ...oldCall, basis: null }).success).toBe(false);
    using reader = inventoryReader(scratch, original.generation, partitions, {
      db,
      dispose: () => {
        /* The test owns this connection. */
      },
    });
    const owner = inventoryString(drizzleQueryKey({ node: span(selected), mode: "column" }));
    const cuts: readonly { readonly message: string; readonly mutate: (db: DatabaseSync) => void }[] = [
      {
        message: "no captured catalog identity",
        mutate: (connection) => {
          connection
            .prepare(
              "UPDATE inventory_drizzle_atom SET text=? WHERE partition=? AND key=? AND owner=(SELECT ordinal FROM inventory_drizzle_evidence WHERE partition=? AND key=?)",
            )
            .run(inventoryString("foreign.column"), consumer.id, inventoryString("value"), consumer.id, owner);
        },
      },
      {
        message: "outside the pinned generation",
        mutate: (connection) => {
          connection
            .prepare(
              "UPDATE inventory_drizzle_atom SET text=? WHERE partition=? AND key=? AND owner=(SELECT ordinal FROM inventory_drizzle_evidence WHERE partition=? AND key=?)",
            )
            .run(inventoryString("foreign"), consumer.id, inventoryString("partition"), consumer.id, owner);
        },
      },
      {
        message: "fact graph is incomplete",
        mutate: (connection) => {
          connection
            .prepare(
              "DELETE FROM inventory_drizzle_atom WHERE partition=? AND owner=(SELECT ordinal FROM inventory_drizzle_evidence WHERE partition=? AND key=?)",
            )
            .run(catalog.id, catalog.id, inventoryString(SCHEMA_DATA_CATALOG_KEY));
        },
      },
    ];
    for (const cut of cuts) {
      db.exec("BEGIN IMMEDIATE; PRAGMA defer_foreign_keys=ON;");
      try {
        cut.mutate(db);
        expect(() => reader.drizzleEvidence(selected, SERVER, "column")).toThrow(cut.message);
      } finally {
        db.exec("ROLLBACK");
      }
    }
    expect(reader.drizzleEvidence(selected, SERVER, "column")).toMatchObject({
      mode: "column",
      column: { kind: "resolved", value: { key: `${ASSETS}#assets.meta` } },
    });
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  },
  scaledBudget(60_000),
);

test(
  "atomic native catalog retains the complete roster without expanding consumer roots and closes dependency-bound arguments",
  ({ scratch, repoRoot }) => {
    const fixture = setup(scratch, repoRoot);
    const workers: string[] = [];
    const requests: InventoryBuildRequest[] = [];
    using inventory = nativeInventoryFixture(fixture.options, { workers, requests });
    expect(workers).toEqual([DB, SERVER]);
    const consumerRequest = requests.find(({ descriptor }) => descriptor.id === SERVER);
    expect(consumerRequest?.descriptor.files).toEqual([ENTRY]);
    expect(consumerRequest?.schemaDependency?.program).toBe(DB);
    expect(consumerRequest?.schemaDependency?.catalog.sources.map(({ path }) => path)).toEqual([ASSETS, UNRELATED]);
    expect(inventory.schemaIdentity(fixture.sources, DB)).toMatchObject({
      status: "ready",
      receipt: { paths: [ASSETS, UNRELATED], tables: 2, columns: 4, foreignKeys: 1, indexes: 1, jsonColumns: 1, openJsonColumns: 0, members: 8 },
    });
    const direct = inventory.drizzleEvidence(fixture.direct, SERVER, "called-member");
    expect(direct.mode === "called-member" ? direct.table : undefined).toMatchObject({ kind: "resolved", value: { sqlName: "assets" } });
    const bound = inventory.drizzleEvidence(fixture.bound, SERVER, "instance");
    expect(bound.mode === "instance" ? bound.table?.node.getSourceFile().getFilePath() : undefined).toBe(join(scratch, PREFIX));
    expect(bound.mode === "instance" ? bound.table?.references.map((ref) => ref.kind) : undefined).toEqual(["table"]);
    expect(() => inventory.drizzleEvidence(fixture.direct, SERVER, "instance")).toThrow("no captured fact graph");
    expect(() => inventory.drizzleEvidence(fixture.direct, "foreign", "called-member")).toThrow("partition is unavailable");
    expect(() => inventory.schemaIdentity(fixture.sources.slice(0, 1), DB)).toThrow("source demand is incomplete");
    const warmWorkers: string[] = [];
    using same = nativeInventoryFixture(fixture.options, { workers: warmWorkers });
    expect(warmWorkers).toEqual([]);
    expect(same.generation).toBe(inventory.generation);
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    const partitions = readInventoryGeneration(db, inventory.generation);
    const consumer = partitions.find(({ program }) => program === SERVER);
    expect(consumer?.available).not.toContain(join(scratch, UNRELATED));
    expect(consumer?.nativeRoots).toEqual([join(scratch, ENTRY)]);
    expect(() =>
      nativeInventoryFixture(
        {
          ...fixture.options,
          drizzleQueries: [...(fixture.options.drizzleQueries ?? []), { program: SERVER, query: { node: span(fixture.direct), mode: "instance" } }],
        },
        { failWorker: true },
      ),
    ).toThrow("injected native worker exit");
    expect(latestInventoryGeneration(db)).toBe(inventory.generation);
    expect(inventory.drizzleEvidence(fixture.direct, SERVER, "called-member")).toMatchObject({ mode: "called-member", table: { kind: "resolved" } });
    inventory[Symbol.dispose]();
    expect(() => inventory.drizzleEvidence(fixture.direct, SERVER, "called-member")).toThrow("disposed");
  },
  scaledBudget(60_000),
);

test(
  "native Drizzle graph, source and catalog-link corruption refuses on the reader's real connection",
  ({ scratch, repoRoot }) => {
    const fixture = setup(scratch, repoRoot);
    using original = nativeInventoryFixture(fixture.options);
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    const partitions = readInventoryGeneration(db, original.generation);
    const consumer = partitions.find(({ program }) => program === SERVER);
    const catalog = partitions.find(({ program }) => program === DB);
    if (consumer === undefined || catalog === undefined) {
      throw new Error("native Drizzle partitions are missing");
    }
    using reader = inventoryReader(scratch, original.generation, partitions, {
      db,
      dispose: () => {
        /* The enclosing test owns this connection. */
      },
    });
    const cuts: readonly { readonly message: string; readonly mutate: (db: DatabaseSync) => void }[] = [
      {
        message: "fact graph is incomplete",
        mutate: (connection) => {
          connection
            .prepare(
              "DELETE FROM inventory_drizzle_atom WHERE partition=? AND owner=(SELECT ordinal FROM inventory_drizzle_evidence WHERE partition=? AND key=?)",
            )
            .run(consumer.id, consumer.id, inventoryString(drizzleQueryKey({ node: span(fixture.direct), mode: "called-member" })));
        },
      },
      {
        message: "outside its captured source closure",
        mutate: (connection) => {
          connection
            .prepare("DELETE FROM inventory_list WHERE partition=? AND kind='available' AND value=?")
            .run(consumer.id, inventoryString(join(scratch, ENTRY)));
        },
      },
      {
        message: "outside the pinned generation",
        mutate: (connection) => {
          connection
            .prepare("UPDATE inventory_drizzle_atom SET text=? WHERE partition=? AND key=?")
            .run(inventoryString("foreign"), consumer.id, inventoryString("partition"));
        },
      },
      {
        message: "source ownership is unavailable",
        mutate: (connection) => {
          connection
            .prepare("DELETE FROM inventory_text WHERE partition=? AND source IN (SELECT ordinal FROM inventory_source WHERE partition=? AND file=?)")
            .run(catalog.id, catalog.id, inventoryString(join(scratch, UNRELATED)));
          connection.prepare("DELETE FROM inventory_source WHERE partition=? AND file=?").run(catalog.id, inventoryString(join(scratch, UNRELATED)));
        },
      },
    ];
    for (const cut of cuts) {
      db.exec("BEGIN IMMEDIATE; PRAGMA defer_foreign_keys=ON;");
      try {
        cut.mutate(db);
        expect(() => reader.drizzleEvidence(fixture.direct, SERVER, "called-member")).toThrow(cut.message);
      } finally {
        db.exec("ROLLBACK");
      }
    }
    expect(reader.drizzleEvidence(fixture.direct, SERVER, "called-member")).toMatchObject({ mode: "called-member", table: { kind: "resolved" } });
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  },
  scaledBudget(60_000),
);

test(
  "partial consumer graphs and a catalog-only input race cannot publish over a pinned native generation",
  ({ scratch, repoRoot }) => {
    const fixture = setup(scratch, repoRoot);
    using previous = nativeInventoryFixture(fixture.options);
    using observer = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    for (const cut of ["graph", "catalog-input"] as const) {
      try {
        expect(() =>
          nativeInventoryFixture(
            {
              ...fixture.options,
              drizzleQueries: [...(fixture.options.drizzleQueries ?? []), { program: SERVER, query: { node: span(fixture.direct), mode: "instance" } }],
            },
            { fault: cut === "graph" ? "drizzle-consumer-tail" : "drizzle-catalog-input" },
          ),
        ).toThrow(cut === "graph" ? "fact graph is incomplete" : "catalog inputs changed before consumer acceptance");
      } finally {
        writeFileSync(join(scratch, UNRELATED), UNRELATED_TEXT);
      }
      expect(latestInventoryGeneration(observer)).toBe(previous.generation);
      expect(previous.drizzleEvidence(fixture.direct, SERVER, "called-member")).toMatchObject({ mode: "called-member", table: { kind: "resolved" } });
    }
  },
  scaledBudget(60_000),
);

test(
  "native catalog records explicit missing and empty source demands without manufacturing a ready schema",
  ({ scratch, repoRoot }) => {
    const fixture = setup(scratch, repoRoot);
    const base = { ...fixture.options, programs: (fixture.options.programs ?? []).filter(({ id }) => id === DB), drizzleQueries: [] };
    using missing = nativeInventoryFixture({ ...base, schemaQuery: { program: DB, sources: [] } });
    expect(missing.schemaIdentity([], DB)).toMatchObject({ status: "missing", receipt: { paths: [], members: 0 } });
    const source = fixture.direct.getProject().getSourceFileOrThrow(join(scratch, "packages/db/src/index.ts"));
    using empty = nativeInventoryFixture({ ...base, schemaQuery: { program: DB, sources: [span(source)] } });
    expect(empty.schemaIdentity([source], DB)).toMatchObject({ status: "empty", receipt: { paths: ["packages/db/src/index.ts"], members: 0 } });
  },
  scaledBudget(60_000),
);

test(
  "existing shape demand and native schema consumers publish the final catalog partition in one generation",
  ({ scratch, repoRoot }) => {
    const fixture = setup(scratch, repoRoot);
    const source = fixture.sources[0];
    if (source === undefined) {
      throw new Error("native mixed-cohort source is missing");
    }
    const name = source.getVariableDeclarationOrThrow("assets").getNameNode();
    const pair = { left: span(name), right: span(name), leftField: null, rightField: null, projection: "mutual" as const, lenient: false };
    const requests: InventoryBuildRequest[] = [];
    using inventory = nativeInventoryFixture(fixture.options, { shapeQueries: [pair], shapeSources: [source.getFilePath()], requests });
    expect(inventory.shapePair(pair).find(({ program }) => program === DB)?.result).toEqual({ kind: "answer", values: [true] });
    expect(requests.filter((request) => request.descriptor.id === DB && (request.shapeQueries?.length ?? 0) > 0)).toHaveLength(1);
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    const partitions = readInventoryGeneration(db, inventory.generation);
    const consumer = partitions.find(({ program }) => program === SERVER);
    const catalog = partitions.find(({ program }) => program === DB);
    if (consumer === undefined || catalog === undefined) {
      throw new Error("native mixed cohort is incomplete");
    }
    expect(readInventoryDrizzleCall(db, consumer.id, { node: span(fixture.direct), mode: "called-member" }).basis).toEqual({
      program: DB,
      partition: catalog.id,
    });
    expect(inventory.drizzleEvidence(fixture.bound, SERVER, "instance")).toMatchObject({ mode: "instance", table: { references: [{ kind: "table" }] } });
  },
  scaledBudget(60_000),
);

test(
  "catalog-only overlay changes rebuild the consumer atomically while old native readers remain pinned",
  ({ scratch, repoRoot }) => {
    const fixture = setup(scratch, repoRoot);
    using old = nativeInventoryFixture(fixture.options);
    const original = old.schemaIdentity(fixture.sources, DB);
    const fileSystem = inventoryFileSystem(new Project({ skipAddingFilesFromTsConfig: true }).getFileSystem(), {
      root: scratch,
      files: [{ path: join(scratch, UNRELATED), text: UNRELATED_TEXT.replace(".on(table.assetId)", "") }],
      deleted: [],
    });
    const overlaySyntax = new Project({ useInMemoryFileSystem: true, skipLoadingLibFiles: true });
    const overlaySources = [ASSETS, UNRELATED].map((path) => overlaySyntax.createSourceFile(join(scratch, path), fileSystem.readFileSync(join(scratch, path))));
    using overlay = nativeInventoryFixture(
      {
        ...fixture.options,
        schemaQuery: { program: DB, sources: overlaySources.map(span) },
      },
      { projection: { root: scratch, files: [{ path: join(scratch, UNRELATED), text: fileSystem.readFileSync(join(scratch, UNRELATED)) }], deleted: [] } },
    );
    expect(overlay.schemaIdentity(overlaySources, DB)).toMatchObject({ status: "unresolved", receipt: { tables: 0, paths: [ASSETS, UNRELATED] } });
    expect(() => overlay.drizzleEvidence(fixture.direct, SERVER, "called-member")).toThrow("schema identity replay source/epoch is stale");
    const overlayEntry = overlay.sourceCorpus().getSourceFile(join(scratch, ENTRY));
    if (overlayEntry === undefined) {
      throw new Error("native overlay entry source is missing");
    }
    const overlayCall = overlayEntry.getVariableDeclarationOrThrow("direct").getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression);
    expect(overlay.drizzleEvidence(overlayCall, SERVER, "called-member")).toMatchObject({ mode: "called-member", table: { kind: "unresolved" } });
    expect(readFileSync(join(scratch, UNRELATED), "utf8")).toBe(UNRELATED_TEXT);
    writeFileSync(join(scratch, UNRELATED), UNRELATED_TEXT.replace("'unrelated'", "'different'"));
    const workers: string[] = [];
    using next = nativeInventoryFixture(fixture.options, { workers });
    expect(workers).toEqual([DB, SERVER]);
    expect(next.generation).toBeGreaterThan(old.generation);
    const nextSources = [ASSETS, UNRELATED].map((path) => {
      const source = next.sourceCorpus().getSourceFile(join(scratch, path));
      if (source === undefined) {
        throw new Error("native replacement schema source is missing");
      }
      return source;
    });
    expect(next.schemaIdentity(nextSources, DB)).toMatchObject({
      status: "ready",
      value: { tables: [expect.objectContaining({ sqlName: "assets" }), expect.objectContaining({ sqlName: "different" })] },
    });
    expect(old.schemaIdentity(fixture.sources, DB)).toEqual(original);
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    const partitions = readInventoryGeneration(db, next.generation);
    const consumer = partitions.find(({ program }) => program === SERVER);
    const catalog = partitions.find(({ program }) => program === DB);
    if (consumer === undefined || catalog === undefined) {
      throw new Error("native replacement cohort is missing");
    }
    expect(readInventoryDrizzleCall(db, consumer.id, { node: span(fixture.direct), mode: "called-member" }).basis).toEqual({
      program: DB,
      partition: catalog.id,
    });
    const stale = fixture.direct.getSourceFile();
    stale.replaceWithText(ENTRY_TEXT.replace("direct=", "staled="));
    const staleCall = stale.getVariableDeclarationOrThrow("staled").getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression);
    expect(() => old.drizzleEvidence(staleCall, SERVER, "called-member")).toThrow("source/epoch");
  },
  scaledBudget(90_000),
);

test(
  "native Drizzle session keeps exact modes, complete roster and owner coverage sealed",
  ({ scratch, repoRoot }) => {
    setup(scratch, repoRoot);
    const implementation = copyNativeInventoryImplementation(join(scratch, ".cache"), repoRoot);
    const entry = fileURLToPath(new URL("../compiler/native-inventory-adapter-cases.ts", import.meta.url));
    const bootstrap = join(implementation, "tooling/src/floor/compiler/semantic-inventory-runtime.ts");
    const result = join(scratch, "drizzle-session.json");
    const completed = runNicedSync(process.execPath, ["--import", bootstrap, entry, "drizzle-session", implementation, scratch, result]);
    expect(completed.status, completed.stderr).toBe(0);
    expect(JSON.parse(readFileSync(result, "utf8"))).toMatchObject({
      mode: "drizzle-session",
      beforeSeal: expect.stringContaining("must be sealed"),
      calledMember: true,
      resolvedTable: true,
      wrongMode: expect.stringContaining("not registered by this owner"),
      wrongOwner: expect.stringContaining("not registered by this owner"),
      incompleteRoster: expect.stringContaining("roster is incomplete"),
      registration: expect.stringContaining("registration is sealed"),
      disposed: expect.stringContaining("disposed"),
    });
  },
  scaledBudget(60_000),
);

test(
  "Drizzle-only implementation receipts retain actual canonical schema and invocation helpers",
  ({ scratch, repoRoot }) => {
    const fixture = setup(scratch, repoRoot);
    using inventory = nativeInventoryFixture(fixture.options);
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    const dependencies = [
      "projection-reference-codec.ts",
      "static-authored-value.ts",
      "id-brand.ts",
      "type-member-origin.ts",
      "value-carrier.ts",
      "value-carrier-native.ts",
      "call-returns.ts",
    ].map((name) => fileURLToPath(new URL(`../../../../tooling/src/floor/code-facts/${name}`, import.meta.url)));
    const partitions = readInventoryGeneration(db, inventory.generation);
    expect(partitions.map(({ program }) => program)).toEqual([DB, SERVER]);
    for (const partition of partitions) {
      const runtime = readInventoryRuntime(db, partition.id, "worker");
      expect
        .soft(dependencies.filter((path) => runtime.sources.some((source) => source.path === path && source.version === inputVersion(path, "file"))))
        .toEqual(dependencies);
    }
  },
  scaledBudget(60_000),
);

test(
  "full schema data shares the atomic identity/consumer cohort without widening defaults",
  ({ scratch, repoRoot }) => {
    const fixture = setup(scratch, repoRoot);
    using identity = nativeInventoryFixture(fixture.options);
    expect(() => identity.schemaData(fixture.sources, DB)).toThrow("schema-data");
    const options = {
      ...fixture.options,
      families: ["drizzle-identities", "schema-data"] as const,
      schemaDataQuery: { program: DB, sources: fixture.sources.map(span) },
    };
    const requests: InventoryBuildRequest[] = [];
    using full = nativeInventoryFixture(options, { requests });
    expect(requests.map(({ descriptor }) => descriptor.id)).toEqual([DB, SERVER]);
    expect(requests[0]?.schemaDataSources).toEqual(fixture.sources.map(span));
    expect(requests[1]?.schemaDataSources).toBeUndefined();
    const data = full.schemaData(fixture.sources, DB);
    expect(data).toMatchObject({ status: "ready", receipt: { tables: 2, columns: 4, foreignKeys: 1, indexes: 1, jsonColumns: 1 } });
    if (data.status !== "ready") {
      throw new Error("complete native full schema is unavailable");
    }
    expect(data.value.tables[0]?.columns[1]).toMatchObject({
      identity: { propertyName: "meta" },
      notNull: true,
      json: { shape: { kind: "closed", keys: ["label"] } },
    });
    expect(data.value.tables[0]?.columns[1]?.typeOverride).not.toHaveProperty("type");
    expect(full.schemaIdentity(fixture.sources, DB)).toEqual(identity.schemaIdentity(fixture.sources, DB));
    expect(full.drizzleEvidence(fixture.bound, SERVER, "instance")).toMatchObject({ mode: "instance", table: { references: [{ kind: "table" }] } });
    expect(() => full.schemaData(fixture.sources.slice(0, 1), DB)).toThrow("source demand is incomplete");
    expect(() => full.schemaData(fixture.sources, SERVER)).toThrow("native typed source/epoch");
    const warmWorkers: string[] = [];
    using reuse = nativeInventoryFixture(options, { workers: warmWorkers });
    expect(warmWorkers).toEqual([]);
    expect(reuse.generation).toBe(full.generation);
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    expect(() =>
      nativeInventoryFixture(
        {
          ...options,
          schemaDataQuery: { program: DB, sources: fixture.sources.slice(0, 1).map(span) },
        },
        { failWorker: true },
      ),
    ).toThrow("injected native worker exit");
    expect(latestInventoryGeneration(db)).toBe(full.generation);
    expect(identity.schemaIdentity(fixture.sources, DB)).toMatchObject({ status: "ready" });
    full[Symbol.dispose]();
    expect(() => full.schemaData(fixture.sources, DB)).toThrow("disposed");
  },
  scaledBudget(90_000),
);

test(
  "full schema data corruption refuses exact graph and captured source evidence",
  ({ scratch, repoRoot }) => {
    const fixture = setup(scratch, repoRoot);
    const options = dataOptions(fixture);
    using inventory = nativeInventoryFixture(options);
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    const partitions = readInventoryGeneration(db, inventory.generation);
    const catalog = partitions[0];
    if (catalog === undefined) {
      throw new Error("full schema partition missing");
    }
    using reader = inventoryReader(scratch, inventory.generation, partitions, {
      db,
      dispose: () => {
        /* The enclosing test owns this connection. */
      },
    });
    const cuts: readonly { readonly mutate: () => void; readonly message: string }[] = [
      {
        message: "no captured fact graph",
        mutate: () => {
          db.prepare("DELETE FROM inventory_drizzle_atom WHERE partition=?").run(catalog.id);
          db.prepare("DELETE FROM inventory_drizzle_evidence WHERE partition=? AND key=?").run(catalog.id, inventoryString(SCHEMA_DATA_CATALOG_KEY));
        },
      },
      {
        message: "fact graph is incomplete",
        mutate: () => {
          db.prepare(
            "DELETE FROM inventory_drizzle_atom WHERE partition=? AND ordinal=(SELECT MAX(ordinal) FROM inventory_drizzle_atom WHERE partition=?)",
          ).run(catalog.id, catalog.id);
        },
      },
      {
        message: "source ownership is unavailable",
        mutate: () => {
          db.prepare("DELETE FROM inventory_text WHERE partition=? AND source IN (SELECT ordinal FROM inventory_source WHERE partition=? AND file=?)").run(
            catalog.id,
            catalog.id,
            inventoryString(join(scratch, UNRELATED)),
          );
          db.prepare("DELETE FROM inventory_source WHERE partition=? AND file=?").run(catalog.id, inventoryString(join(scratch, UNRELATED)));
        },
      },
    ];
    for (const cut of cuts) {
      db.exec("BEGIN IMMEDIATE; PRAGMA defer_foreign_keys=ON;");
      try {
        cut.mutate();
        expect(() => reader.schemaData(fixture.sources, DB)).toThrow(cut.message);
      } finally {
        db.exec("ROLLBACK");
      }
    }
    expect(reader.schemaData(fixture.sources, DB)).toMatchObject({ status: "ready" });
    const runtime = readInventoryRuntime(db, catalog.id, "worker");
    const helpers = [
      "schema-projection.ts",
      "schema-projection-contract.ts",
      "schema-projection-inventory-contract.ts",
      "schema-projection-replay.ts",
      "static-authored-value.ts",
      "id-brand.ts",
      "type-member-origin.ts",
    ].map((name) => fileURLToPath(new URL(`../../../../tooling/src/floor/code-facts/${name}`, import.meta.url)));
    helpers.push(fileURLToPath(new URL("../../../../tooling/src/floor/compiler/schema-projection-encode.ts", import.meta.url)));
    for (const path of helpers) {
      expect(
        runtime.sources.some((source) => source.path === path && source.version === inputVersion(path, "file")),
        path,
      ).toBe(true);
    }
  },
  scaledBudget(60_000),
);

test(
  "full schema data preserves explicit empty/missing and current overlays with pinned previous data",
  ({ scratch, repoRoot }) => {
    const fixture = setup(scratch, repoRoot);
    const options = dataOptions(fixture);
    using missing = nativeInventoryFixture({ ...options, schemaDataQuery: { program: DB, sources: [] } });
    expect(missing.schemaData([], DB)).toMatchObject({ status: "missing", receipt: { members: 0 } });
    const index = fixture.direct.getProject().getSourceFileOrThrow(join(scratch, "packages/db/src/index.ts"));
    using empty = nativeInventoryFixture({ ...options, schemaDataQuery: { program: DB, sources: [span(index)] } });
    expect(empty.schemaData([index], DB)).toMatchObject({ status: "empty", receipt: { members: 0 } });
    using old = nativeInventoryFixture({ ...options, schemaDataQuery: { program: DB, sources: fixture.sources.map(span) } });
    const before = old.schemaData(fixture.sources, DB);
    const text = UNRELATED_TEXT.replace(".on(table.assetId)", "");
    const fileSystem = inventoryFileSystem(new Project({ skipAddingFilesFromTsConfig: true }).getFileSystem(), {
      root: scratch,
      files: [{ path: join(scratch, UNRELATED), text }],
      deleted: [],
    });
    const project = new Project({ useInMemoryFileSystem: true, skipLoadingLibFiles: true });
    const sources = [ASSETS, UNRELATED].map((path) => project.createSourceFile(join(scratch, path), fileSystem.readFileSync(join(scratch, path))));
    using overlay = nativeInventoryFixture(
      {
        ...options,
        schemaDataQuery: { program: DB, sources: sources.map(span) },
      },
      { projection: { root: scratch, files: [{ path: join(scratch, UNRELATED), text: fileSystem.readFileSync(join(scratch, UNRELATED)) }], deleted: [] } },
    );
    expect(overlay.schemaData(sources, DB)).toMatchObject({ status: "unresolved" });
    expect(() => overlay.schemaData(fixture.sources, DB)).toThrow("native typed source/epoch");
    expect(old.schemaData(fixture.sources, DB)).toEqual(before);
    expect(readFileSync(join(scratch, UNRELATED), "utf8")).toBe(UNRELATED_TEXT);
    const changed = fixture.sources[0];
    if (changed === undefined) {
      throw new Error("stale source missing");
    }
    changed.replaceWithText(ASSET_TEXT + "\n");
    expect(() => old.schemaData(fixture.sources, DB)).toThrow("source/epoch");
  },
  scaledBudget(90_000),
);

function dataOptions(fixture: ReturnType<typeof setup>): SemanticInventoryOptions {
  const { schemaQuery: _identity, drizzleQueries: _calls, ...options } = fixture.options;
  return {
    ...options,
    programs: (options.programs ?? []).filter(({ id }) => id === DB),
    families: ["schema-data"],
    schemaDataQuery: { program: DB, sources: fixture.sources.map(span) },
  };
}

test(
  "selected-Type schema vocabulary has exact opt-in demand, pinned default views and atomic corrupt-worker refusal",
  ({ scratch, repoRoot }) => {
    const fixture = setup(scratch, repoRoot);
    const options = dataOptions(fixture);
    using ordinary = nativeInventoryFixture(options);
    const before = ordinary.schemaData(fixture.sources, DB);
    expect(() => ordinary.schemaData(fixture.sources, DB, { typeVocabulary: true })).toThrow("vocabulary was not captured");
    const projection = { typeVocabulary: true } as const;
    const projected = { ...options, schemaDataQuery: { program: DB, sources: fixture.sources.map(span), projection } };
    const requests: InventoryBuildRequest[] = [];
    using full = nativeInventoryFixture(projected, { requests });
    expect(requests.map((request) => request.schemaDataProjection)).toEqual([projection]);
    expect(full.schemaData(fixture.sources, DB)).toEqual(before);
    const selected = full.schemaData(fixture.sources, DB, projection);
    if (selected.status !== "ready") {
      throw new Error("selected vocabulary catalog unavailable");
    }
    expect(selected.value.tables[0]?.columns[1]?.typeOverride?.vocabulary).toMatchObject({
      properties: ["label"],
      arms: [{ properties: ["label"], stringIndex: false }],
    });
    const warmWorkers: string[] = [];
    using reused = nativeInventoryFixture(projected, { workers: warmWorkers });
    expect(warmWorkers).toEqual([]);
    expect(reused.generation).toBe(full.generation);
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    expect(() =>
      nativeInventoryFixture(
        {
          ...options,
        },
        { failWorker: true },
      ),
    ).toThrow("injected native worker exit");
    expect(latestInventoryGeneration(db)).toBe(full.generation);
    expect(() =>
      nativeInventoryFixture(
        {
          ...projected,
          schemaDataQuery: { program: DB, sources: fixture.sources.slice(0, 1).map(span), projection },
        },
        { fault: "schema-graph-tail" },
      ),
    ).toThrow("fact graph is incomplete");
    expect(latestInventoryGeneration(db)).toBe(full.generation);
    expect(ordinary.schemaData(fixture.sources, DB)).toEqual(before);
    expect(full.schemaData(fixture.sources, DB, projection)).toEqual(selected);
  },
  scaledBudget(60_000),
);
