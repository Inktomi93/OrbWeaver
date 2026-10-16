// @subject tooling/src/floor/compiler/drizzle-inventory-extract.ts
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import { SCHEMA_DATA_CATALOG_KEY } from "../../../../tooling/src/floor/code-facts/drizzle-inventory-contract.ts";
import { createSemanticInventory } from "../../../../tooling/src/floor/code-facts/semantic-inventory.ts";
import type { InventoryBuildRequest, InventorySpan, SemanticInventoryOptions } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { drizzleQueryKey } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import {
  latestInventoryGeneration,
  openInventoryDatabase,
  readInventoryGeneration,
} from "../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts";
import { inputsCurrent, inventoryAuthoredFiles } from "../../../../tooling/src/floor/code-facts/semantic-inventory-inputs.ts";
import { readInventoryDrizzleCall, readInventoryInputs } from "../../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts";
import { inventoryReader } from "../../../../tooling/src/floor/code-facts/semantic-inventory-reader.ts";
import { inventoryString } from "../../../../tooling/src/floor/code-facts/semantic-inventory-records.ts";
import { readCompilerPrograms } from "../../../../tooling/src/floor/compiler/compiler-programs.ts";
import { inventoryFileSystem } from "../../../../tooling/src/floor/compiler/semantic-inventory-filesystem.ts";
import { runInventoryPartitionWorker } from "../../../../tooling/src/floor/compiler/semantic-inventory-worker-run.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { scaledBudget } from "../../_load-budget.ts";

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

function span(node: MorphNode): InventorySpan {
  return { file: node.getSourceFile().getFilePath(), start: node.getStart(), end: node.getEnd(), kind: node.getKind() };
}

function setup(
  root: string,
  repoRoot: string,
): {
  readonly options: SemanticInventoryOptions;
  readonly sources: readonly SourceFile[];
  readonly direct: import("ts-morph").CallExpression;
  readonly bound: import("ts-morph").CallExpression;
} {
  const files = {
    [ASSETS]: ASSET_TEXT,
    [UNRELATED]: UNRELATED_TEXT,
    "packages/db/src/index.ts": "export {assets} from './schema/assets.ts';",
    [ENTRY]: ENTRY_TEXT,
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

test(
  "atomic native catalog retains the complete roster without expanding consumer roots and closes dependency-bound arguments",
  ({ scratch, repoRoot }) => {
    const fixture = setup(scratch, repoRoot);
    const workers: string[] = [];
    const requests: InventoryBuildRequest[] = [];
    using inventory = createSemanticInventory({
      ...fixture.options,
      buildPartition: (request) => {
        workers.push(request.descriptor.id);
        requests.push(request);
        runInventoryPartitionWorker(request);
      },
    });
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
    using same = createSemanticInventory({
      ...fixture.options,
      buildPartition: () => {
        throw new Error("unchanged native Drizzle demand rebuilt");
      },
    });
    expect(same.generation).toBe(inventory.generation);
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    const partitions = readInventoryGeneration(db, inventory.generation);
    const consumer = partitions.find(({ program }) => program === SERVER);
    expect(consumer?.available).not.toContain(join(scratch, UNRELATED));
    expect(consumer?.nativeRoots).toEqual([join(scratch, ENTRY)]);
    expect(() =>
      createSemanticInventory({
        ...fixture.options,
        drizzleQueries: [...(fixture.options.drizzleQueries ?? []), { program: SERVER, query: { node: span(fixture.direct), mode: "instance" } }],
        buildPartition: () => {
          throw new Error("failed native Drizzle worker");
        },
      }),
    ).toThrow("failed native Drizzle worker");
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
    using original = createSemanticInventory(fixture.options);
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
    using previous = createSemanticInventory(fixture.options);
    using observer = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    for (const cut of ["graph", "catalog-input"] as const) {
      try {
        expect(() =>
          createSemanticInventory({
            ...fixture.options,
            drizzleQueries: [...(fixture.options.drizzleQueries ?? []), { program: SERVER, query: { node: span(fixture.direct), mode: "instance" } }],
            buildPartition: (request) => {
              runInventoryPartitionWorker(request);
              if (request.descriptor.id !== SERVER) {
                throw new Error("unchanged native catalog unexpectedly rebuilt");
              }
              if (cut === "catalog-input") {
                writeFileSync(join(scratch, UNRELATED), UNRELATED_TEXT.replace("'unrelated'", "'different'"));
                return;
              }
              using staging = openInventoryDatabase(request.destination);
              const partition = readInventoryGeneration(staging, latestInventoryGeneration(staging))[0];
              if (partition === undefined) {
                throw new Error("native consumer staging partition is missing");
              }
              staging
                .prepare(
                  "DELETE FROM inventory_drizzle_atom WHERE partition=? AND owner=(SELECT MAX(ordinal) FROM inventory_drizzle_evidence WHERE partition=?) AND ordinal=(SELECT MAX(ordinal) FROM inventory_drizzle_atom WHERE partition=? AND owner=(SELECT MAX(ordinal) FROM inventory_drizzle_evidence WHERE partition=?))",
                )
                .run(partition.id, partition.id, partition.id, partition.id);
            },
          }),
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
    using missing = createSemanticInventory({ ...base, schemaQuery: { program: DB, sources: [] } });
    expect(missing.schemaIdentity([], DB)).toMatchObject({ status: "missing", receipt: { paths: [], members: 0 } });
    const source = fixture.direct.getProject().getSourceFileOrThrow(join(scratch, "packages/db/src/index.ts"));
    using empty = createSemanticInventory({ ...base, schemaQuery: { program: DB, sources: [span(source)] } });
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
    using inventory = createSemanticInventory({
      ...fixture.options,
      shapePlan: { sources: [source], prepare: () => [pair] },
      buildPartition: (request) => {
        requests.push(request);
        runInventoryPartitionWorker(request);
      },
    });
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
    using old = createSemanticInventory(fixture.options);
    const original = old.schemaIdentity(fixture.sources, DB);
    const fileSystem = inventoryFileSystem(new Project({ skipAddingFilesFromTsConfig: true }).getFileSystem(), {
      root: scratch,
      files: [{ path: join(scratch, UNRELATED), text: UNRELATED_TEXT.replace(".on(table.assetId)", "") }],
      deleted: [],
    });
    const overlaySyntax = new Project({ useInMemoryFileSystem: true, skipLoadingLibFiles: true });
    const overlaySources = [ASSETS, UNRELATED].map((path) => overlaySyntax.createSourceFile(join(scratch, path), fileSystem.readFileSync(join(scratch, path))));
    using overlay = createSemanticInventory({
      ...fixture.options,
      schemaQuery: { program: DB, sources: overlaySources.map(span) },
      overlay: { addedPaths: [], deletedPaths: [] },
      fileSystem,
    });
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
    using next = createSemanticInventory({
      ...fixture.options,
      buildPartition: (request) => {
        workers.push(request.descriptor.id);
        runInventoryPartitionWorker(request);
      },
    });
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
    const context = projectCtx(scratch);
    const source = context.project.getSourceFileOrThrow(join(scratch, ENTRY));
    const call = source.getVariableDeclarationOrThrow("direct").getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression);
    const sources = [ASSETS, UNRELATED].map((path) => context.project.getSourceFileOrThrow(join(scratch, path)));
    using facts = context.nativeTypeFacts?.();
    if (facts === undefined) {
      throw new Error("native Drizzle session is missing");
    }
    facts.request("schema", { kind: "schema-identities", nodes: sources });
    facts.request("writer", { kind: "drizzle-identities", nodes: [call], mode: "called-member" });
    expect(() => facts.drizzleEvidence("writer", [call], "called-member")).toThrow("must be sealed");
    facts.seal(new Set(["schema", "writer"]));
    expect(facts.drizzleEvidence("writer", [call], "called-member").get(call)).toMatchObject({ mode: "called-member", table: { kind: "resolved" } });
    expect(() => facts.drizzleEvidence("writer", [call], "instance")).toThrow("not registered by this owner");
    expect(() => facts.drizzleEvidence("other", [call], "called-member")).toThrow("not registered by this owner");
    expect(() => facts.schemaIdentity("schema", sources.slice(0, 1))).toThrow("roster is incomplete");
    expect(() => facts.request("writer", { kind: "drizzle-identities", nodes: [call], mode: "instance" })).toThrow("registration is sealed");
    facts[Symbol.dispose]();
    expect(() => facts.drizzleEvidence("writer", [call], "called-member")).toThrow("disposed");
  },
  scaledBudget(60_000),
);

test(
  "Drizzle-only implementation inputs refuse changed canonical schema and invocation helpers",
  ({ scratch, repoRoot }) => {
    const fixture = setup(scratch, repoRoot);
    using inventory = createSemanticInventory(fixture.options);
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
    const authored = inventoryAuthoredFiles(scratch);
    const fileSystem = new Project({ skipAddingFilesFromTsConfig: true }).getFileSystem();
    const partitions = readInventoryGeneration(db, inventory.generation);
    expect(partitions.map(({ program }) => program)).toEqual([DB, SERVER]);
    for (const partition of partitions) {
      const inputs = [...readInventoryInputs(db, partition.id)];
      expect.soft(dependencies.filter((path) => inputs.some((input) => input.kind === "file" && input.path === path))).toEqual(dependencies);
      expect(inputsCurrent(inputs, { authored })).toBe(true);
      for (const path of dependencies) {
        const changed = inventoryFileSystem(fileSystem, { root: scratch, files: [{ path, text: readFileSync(path, "utf8") + "\n" }], deleted: [] });
        expect.soft(inputsCurrent(inputs, { authored, fileSystem: changed }), path).toBe(false);
      }
    }
  },
  scaledBudget(60_000),
);

test(
  "full schema data shares the atomic identity/consumer cohort without widening defaults",
  ({ scratch, repoRoot }) => {
    const fixture = setup(scratch, repoRoot);
    using identity = createSemanticInventory(fixture.options);
    expect(() => identity.schemaData(fixture.sources, DB)).toThrow("schema-data");
    const options = {
      ...fixture.options,
      families: ["drizzle-identities", "schema-data"] as const,
      schemaDataQuery: { program: DB, sources: fixture.sources.map(span) },
    };
    const requests: InventoryBuildRequest[] = [];
    using full = createSemanticInventory({
      ...options,
      buildPartition: (request) => {
        requests.push(request);
        runInventoryPartitionWorker(request);
      },
    });
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
    using reuse = createSemanticInventory({
      ...options,
      buildPartition: () => {
        throw new Error("complete full schema demand rebuilt");
      },
    });
    expect(reuse.generation).toBe(full.generation);
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    expect(() =>
      createSemanticInventory({
        ...options,
        schemaDataQuery: { program: DB, sources: fixture.sources.slice(0, 1).map(span) },
        buildPartition: () => {
          throw new Error("changed full schema demand worker");
        },
      }),
    ).toThrow("changed full schema demand worker");
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
    using inventory = createSemanticInventory(options);
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
    const inputs = [...readInventoryInputs(db, catalog.id)];
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
    const authored = inventoryAuthoredFiles(scratch);
    for (const path of helpers) {
      expect(
        inputs.some((input) => input.kind === "file" && input.path === path),
        path,
      ).toBe(true);
      const fileSystem = inventoryFileSystem(new Project({ skipAddingFilesFromTsConfig: true }).getFileSystem(), {
        root: scratch,
        files: [{ path, text: readFileSync(path, "utf8") + "\n" }],
        deleted: [],
      });
      expect(inputsCurrent(inputs, { authored, fileSystem }), path).toBe(false);
    }
  },
  scaledBudget(60_000),
);

test(
  "full schema data preserves explicit empty/missing and current overlays with pinned previous data",
  ({ scratch, repoRoot }) => {
    const fixture = setup(scratch, repoRoot);
    const options = dataOptions(fixture);
    using missing = createSemanticInventory({ ...options, schemaDataQuery: { program: DB, sources: [] } });
    expect(missing.schemaData([], DB)).toMatchObject({ status: "missing", receipt: { members: 0 } });
    const index = fixture.direct.getProject().getSourceFileOrThrow(join(scratch, "packages/db/src/index.ts"));
    using empty = createSemanticInventory({ ...options, schemaDataQuery: { program: DB, sources: [span(index)] } });
    expect(empty.schemaData([index], DB)).toMatchObject({ status: "empty", receipt: { members: 0 } });
    using old = createSemanticInventory({ ...options, schemaDataQuery: { program: DB, sources: fixture.sources.map(span) } });
    const before = old.schemaData(fixture.sources, DB);
    const text = UNRELATED_TEXT.replace(".on(table.assetId)", "");
    const fileSystem = inventoryFileSystem(new Project({ skipAddingFilesFromTsConfig: true }).getFileSystem(), {
      root: scratch,
      files: [{ path: join(scratch, UNRELATED), text }],
      deleted: [],
    });
    const project = new Project({ useInMemoryFileSystem: true, skipLoadingLibFiles: true });
    const sources = [ASSETS, UNRELATED].map((path) => project.createSourceFile(join(scratch, path), fileSystem.readFileSync(join(scratch, path))));
    using overlay = createSemanticInventory({
      ...options,
      schemaDataQuery: { program: DB, sources: sources.map(span) },
      overlay: { addedPaths: [], deletedPaths: [] },
      fileSystem,
    });
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
