// The physical prior CHECK is a snapshot; deriving it from current DDL would erase the upgrade discriminator.
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import type { StatementSync } from "node:sqlite";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { InventoryPartition } from "@orb/tooling/floor/code-facts/semantic-inventory-contract";
import { INVENTORY_FORMAT } from "@orb/tooling/floor/code-facts/semantic-inventory-contract";
import {
  beginInventoryWrite,
  importInventoryPartition,
  openInventoryDatabase,
  publishInventoryGeneration,
  readInventoryGeneration,
} from "@orb/tooling/floor/code-facts/semantic-inventory-database";
import { spawnNiced } from "@orb/tooling/floor/process/proc";
import { SyntaxKind } from "ts-morph";
import { vi } from "vitest";
import {
  readInventoryBrands,
  readInventoryDeclarationOutputs,
  readInventoryInputs,
  readInventoryPairs,
  readInventoryRuntimeExports,
  readInventoryShape,
} from "../../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts";
import { inventoryString, inventoryTextParts, inventoryTextVersion } from "../../../../tooling/src/floor/code-facts/semantic-inventory-records.ts";

const FORMAT4_DDL = `CREATE TABLE inventory_partition(id TEXT PRIMARY KEY, program TEXT NOT NULL, format INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE inventory_generation(id INTEGER PRIMARY KEY, format INTEGER NOT NULL);
CREATE TABLE inventory_member(generation INTEGER NOT NULL REFERENCES inventory_generation(id), program TEXT NOT NULL, partition TEXT NOT NULL REFERENCES inventory_partition(id), PRIMARY KEY(generation,program));
CREATE TABLE inventory_descriptor(partition TEXT NOT NULL REFERENCES inventory_partition(id) PRIMARY KEY,program TEXT NOT NULL,descriptorVersion TEXT NOT NULL,compilerOptionsJson TEXT NOT NULL,workerPid INTEGER) STRICT;
CREATE TABLE inventory_family(partition TEXT NOT NULL REFERENCES inventory_partition(id),ordinal INTEGER NOT NULL,name TEXT NOT NULL CHECK(name IN ('exports','modules','bindings','references','witnesses','cast-relations')),PRIMARY KEY(partition,ordinal),UNIQUE(partition,name)) STRICT;
CREATE TABLE inventory_list(partition TEXT NOT NULL REFERENCES inventory_partition(id),kind TEXT NOT NULL CHECK(kind IN ('configPaths','projectReferences','roots','nativeRoots')),ordinal INTEGER NOT NULL,value TEXT NOT NULL,PRIMARY KEY(partition,kind,ordinal)) STRICT;
CREATE TABLE inventory_input(partition TEXT NOT NULL REFERENCES inventory_partition(id),ordinal INTEGER NOT NULL,path TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('file','directory','exists')),version TEXT NOT NULL,PRIMARY KEY(partition,ordinal)) STRICT;
CREATE TABLE inventory_source(partition TEXT NOT NULL REFERENCES inventory_partition(id),ordinal INTEGER NOT NULL,file TEXT NOT NULL,path TEXT NOT NULL,consumerClass TEXT NOT NULL CHECK(consumerClass IN ('product','tooling','test')),authored INTEGER NOT NULL CHECK(authored IN (0,1)),textVersion TEXT NOT NULL,textLength INTEGER NOT NULL,textParts INTEGER NOT NULL,PRIMARY KEY(partition,ordinal)) STRICT;
CREATE TABLE inventory_text(partition TEXT NOT NULL REFERENCES inventory_partition(id),source INTEGER NOT NULL,ordinal INTEGER NOT NULL,value TEXT NOT NULL CHECK(json_valid(value) AND json_type(value)='text' AND length(value)<=98306),PRIMARY KEY(partition,source,ordinal),FOREIGN KEY(partition,source) REFERENCES inventory_source(partition,ordinal)) STRICT;
CREATE TABLE inventory_span(partition TEXT NOT NULL REFERENCES inventory_partition(id),ordinal INTEGER NOT NULL,file TEXT NOT NULL,start INTEGER NOT NULL,end INTEGER NOT NULL,kind INTEGER NOT NULL,PRIMARY KEY(partition,ordinal),UNIQUE(partition,file,start,end,kind)) STRICT;
CREATE TABLE inventory_fact(partition TEXT NOT NULL REFERENCES inventory_partition(id),kind TEXT NOT NULL CHECK(kind IN ('exports','modules','bindings','witnesses')),ordinal INTEGER NOT NULL,file TEXT,name TEXT,node INTEGER,target TEXT,dynamic INTEGER CHECK(dynamic IN (0,1)),specifier TEXT,PRIMARY KEY(partition,kind,ordinal),FOREIGN KEY(partition,node) REFERENCES inventory_span(partition,ordinal),CHECK((kind='exports' AND file IS NOT NULL AND name IS NOT NULL AND node IS NULL AND target IS NULL AND dynamic IS NULL AND specifier IS NULL) OR (kind='modules' AND file IS NULL AND name IS NULL AND node IS NOT NULL AND dynamic IS NOT NULL) OR (kind='bindings' AND file IS NULL AND name IS NULL AND node IS NOT NULL AND target IS NULL AND dynamic IS NULL AND specifier IS NULL) OR (kind='witnesses' AND file IS NULL AND name IS NOT NULL AND node IS NOT NULL AND target IS NULL AND dynamic IS NULL AND specifier IS NULL))) STRICT;
CREATE TABLE inventory_declaration(partition TEXT NOT NULL REFERENCES inventory_partition(id),kind TEXT NOT NULL,owner INTEGER NOT NULL,role TEXT NOT NULL,ordinal INTEGER NOT NULL,node INTEGER NOT NULL,PRIMARY KEY(partition,kind,owner,role,ordinal),FOREIGN KEY(partition,kind,owner) REFERENCES inventory_fact(partition,kind,ordinal),FOREIGN KEY(partition,node) REFERENCES inventory_span(partition,ordinal),CHECK((kind='bindings' AND role IN ('lexical','origins')) OR (kind IN ('exports','modules','witnesses') AND role='declarations'))) STRICT;
CREATE TABLE inventory_reference(partition TEXT NOT NULL REFERENCES inventory_partition(id),ordinal INTEGER NOT NULL,declaration INTEGER NOT NULL,node INTEGER NOT NULL,consumerClass TEXT NOT NULL CHECK(consumerClass IN ('product','tooling','test')),PRIMARY KEY(partition,ordinal),FOREIGN KEY(partition,declaration) REFERENCES inventory_span(partition,ordinal),FOREIGN KEY(partition,node) REFERENCES inventory_span(partition,ordinal)) STRICT;
CREATE TABLE inventory_cast(partition TEXT NOT NULL REFERENCES inventory_partition(id),ordinal INTEGER NOT NULL,node INTEGER NOT NULL,leftToRight INTEGER CHECK(leftToRight IN (0,1)),rightToLeft INTEGER CHECK(rightToLeft IN (0,1)),leftIsAny INTEGER CHECK(leftIsAny IN (0,1)),rightIsAny INTEGER CHECK(rightIsAny IN (0,1)),reason TEXT,PRIMARY KEY(partition,ordinal),UNIQUE(partition,node),FOREIGN KEY(partition,node) REFERENCES inventory_span(partition,ordinal),CHECK((reason IS NULL AND leftToRight IS NOT NULL AND rightToLeft IS NOT NULL AND leftIsAny IS NOT NULL AND rightIsAny IS NOT NULL) OR (reason='primitive-absent' AND leftToRight IS NULL AND rightToLeft IS NULL AND leftIsAny IS NULL AND rightIsAny IS NULL))) STRICT;`;
const LEGACY_PARTITION = "legacy-four";
const STORAGE_VERSION = "PRAGMA user_version";
const FORMAT5_DDL = `${FORMAT4_DDL.replace("'witnesses','cast-relations'", "'witnesses','cast-relations','id-brands'")}
CREATE TABLE inventory_brand(partition TEXT NOT NULL REFERENCES inventory_partition(id),ordinal INTEGER NOT NULL,node INTEGER NOT NULL,brand TEXT,PRIMARY KEY(partition,ordinal),UNIQUE(partition,node),FOREIGN KEY(partition,node) REFERENCES inventory_span(partition,ordinal)) STRICT;`;

const FORMAT6_DDL = FORMAT5_DDL.replace("('file','directory','exists')", "('file','directory','exists','authored')");
const FORMAT7_DDL = `${FORMAT6_DDL.replace("'cast-relations','id-brands'", "'cast-relations','id-brands','runtime-exports'")}
CREATE TABLE inventory_runtime_export(partition TEXT NOT NULL REFERENCES inventory_partition(id),ordinal INTEGER NOT NULL,file TEXT NOT NULL,name TEXT NOT NULL,node INTEGER NOT NULL,callable INTEGER NOT NULL CHECK(callable IN (0,1)),initializerKind INTEGER,initializerCallable INTEGER CHECK(initializerCallable IN (0,1)),PRIMARY KEY(partition,ordinal),FOREIGN KEY(partition,node) REFERENCES inventory_span(partition,ordinal),CHECK((initializerKind IS NULL AND initializerCallable IS NULL) OR (initializerKind IS NOT NULL AND initializerCallable IS NOT NULL))) STRICT;`;
const FORMAT8_DDL = `${FORMAT7_DDL.replace("'id-brands','runtime-exports'", "'id-brands','runtime-exports','shape-catalog','shape-pairs'")
  .replace("'roots','nativeRoots'", "'roots','nativeRoots','available'")
  .replace("workerPid INTEGER)", "workerPid INTEGER,intent TEXT NOT NULL DEFAULT 'facts' CHECK(intent IN ('facts','membership')))")}
CREATE TABLE inventory_shape(partition TEXT NOT NULL REFERENCES inventory_partition(id),ordinal INTEGER NOT NULL,node INTEGER NOT NULL,copyObject INTEGER NOT NULL CHECK(copyObject IN (0,1)),respellObject INTEGER NOT NULL CHECK(respellObject IN (0,1)),PRIMARY KEY(partition,ordinal),UNIQUE(partition,node),FOREIGN KEY(partition,node) REFERENCES inventory_span(partition,ordinal)) STRICT;
CREATE TABLE inventory_shape_field(partition TEXT NOT NULL REFERENCES inventory_partition(id),owner INTEGER NOT NULL,mode TEXT NOT NULL CHECK(mode IN ('copy','respell')),ordinal INTEGER NOT NULL,name TEXT NOT NULL,type TEXT NOT NULL,PRIMARY KEY(partition,owner,mode,ordinal),FOREIGN KEY(partition,owner) REFERENCES inventory_shape(partition,ordinal)) STRICT;
CREATE TABLE inventory_shape_origin(partition TEXT NOT NULL REFERENCES inventory_partition(id),owner INTEGER NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('direct','queries')),ordinal INTEGER NOT NULL,value TEXT NOT NULL,PRIMARY KEY(partition,owner,kind,ordinal),FOREIGN KEY(partition,owner) REFERENCES inventory_shape(partition,ordinal)) STRICT;
CREATE TABLE inventory_pair(partition TEXT NOT NULL REFERENCES inventory_partition(id),ordinal INTEGER NOT NULL,key TEXT NOT NULL,leftNode INTEGER NOT NULL,rightNode INTEGER NOT NULL,leftField TEXT,rightField TEXT,projection TEXT NOT NULL CHECK(projection IN ('mutual','relation')),lenient INTEGER NOT NULL CHECK(lenient IN (0,1)),state TEXT NOT NULL CHECK(state IN ('answer','no-comparable','unavailable')),reason TEXT,a INTEGER CHECK(a IN (0,1)),b INTEGER CHECK(b IN (0,1)),c INTEGER CHECK(c IN (0,1)),d INTEGER CHECK(d IN (0,1)),CHECK((state='answer' AND reason IS NULL AND a IS NOT NULL AND ((projection='mutual' AND b IS NULL AND c IS NULL AND d IS NULL) OR (projection='relation' AND b IS NOT NULL AND c IS NOT NULL AND d IS NOT NULL))) OR (state='no-comparable' AND projection='relation' AND reason IS NULL AND a IS NULL AND b IS NULL AND c IS NULL AND d IS NULL) OR (state='unavailable' AND reason IN ('primitive-absent','node-absent') AND a IS NULL AND b IS NULL AND c IS NULL AND d IS NULL)),PRIMARY KEY(partition,ordinal),UNIQUE(partition,key),FOREIGN KEY(partition,leftNode) REFERENCES inventory_span(partition,ordinal),FOREIGN KEY(partition,rightNode) REFERENCES inventory_span(partition,ordinal)) STRICT;`;
const FORMAT9_DDL = `${FORMAT8_DDL.replace("'shape-catalog','shape-pairs'", "'shape-catalog','shape-pairs','declaration-outputs'")}
CREATE TABLE inventory_declaration_output(partition TEXT NOT NULL REFERENCES inventory_partition(id),ordinal INTEGER NOT NULL,node INTEGER NOT NULL,unknownOutput INTEGER CHECK(unknownOutput IN (0,1)),PRIMARY KEY(partition,ordinal),UNIQUE(partition,node),FOREIGN KEY(partition,node) REFERENCES inventory_span(partition,ordinal)) STRICT;`;

function legacyRows(db: DatabaseSync): ReturnType<StatementSync["all"]>[] {
  return [
    db.prepare("SELECT * FROM inventory_partition WHERE id=?").all(LEGACY_PARTITION),
    db.prepare("SELECT * FROM inventory_generation WHERE id=1").all(),
    db.prepare("SELECT * FROM inventory_member WHERE generation=1").all(),
    db.prepare("SELECT partition,program,descriptorVersion,compilerOptionsJson,workerPid FROM inventory_descriptor WHERE partition=?").all(LEGACY_PARTITION),
    db.prepare("SELECT * FROM inventory_family WHERE partition=? ORDER BY ordinal").all(LEGACY_PARTITION),
    db.prepare("SELECT * FROM inventory_input WHERE partition=? ORDER BY ordinal").all(LEGACY_PARTITION),
    db.prepare("SELECT * FROM inventory_source WHERE partition=? ORDER BY ordinal").all(LEGACY_PARTITION),
    db.prepare("SELECT * FROM inventory_text WHERE partition=? ORDER BY source,ordinal").all(LEGACY_PARTITION),
  ];
}

function createPriorStorage(path: string, version: 0 | 1 | 2 | 3 | 4 | 5): ReturnType<typeof legacyRows> {
  mkdirSync(dirname(path), { recursive: true });
  using db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
  db.exec(([FORMAT4_DDL, FORMAT5_DDL, FORMAT6_DDL, FORMAT7_DDL, FORMAT8_DDL, FORMAT9_DDL] as const)[version]);
  db.exec(`PRAGMA user_version=${String(version)}`);
  const program = inventoryString("tsconfig.legacy.json");
  const file = inventoryString("/fixture/legacy.ts");
  const text = "export const legacy=1;";
  db.prepare("INSERT INTO inventory_partition(id,program,format,payload) VALUES(?,?,?,?)").run(LEGACY_PARTITION, program, 4 + version, "retained payload");
  db.prepare("INSERT INTO inventory_generation(id,format) VALUES(1,?)").run(4 + version);
  db.prepare("INSERT INTO inventory_member(generation,program,partition) VALUES(1,?,?)").run(program, LEGACY_PARTITION);
  db.prepare("INSERT INTO inventory_descriptor(partition,program,descriptorVersion,compilerOptionsJson,workerPid) VALUES(?,?,?,?,NULL)").run(
    LEGACY_PARTITION,
    program,
    inventoryString("legacy-version"),
    inventoryString("{}"),
  );
  db.prepare("INSERT INTO inventory_family(partition,ordinal,name) VALUES(?,0,'exports'),(?,1,'cast-relations')").run(LEGACY_PARTITION, LEGACY_PARTITION);
  db.prepare("INSERT INTO inventory_input(partition,ordinal,path,kind,version) VALUES(?,3,?,'file',?),(?,7,?,'exists',?)").run(
    LEGACY_PARTITION,
    file,
    inventoryString("old-file-version"),
    LEGACY_PARTITION,
    inventoryString("/fixture/negative\ud800"),
    inventoryString("false"),
  );
  db.prepare(
    "INSERT INTO inventory_source(partition,ordinal,file,path,consumerClass,authored,textVersion,textLength,textParts) VALUES(?,0,?,?,'product',1,?,?,1)",
  ).run(LEGACY_PARTITION, file, file, inventoryTextVersion(inventoryTextParts(text)), text.length);
  db.prepare("INSERT INTO inventory_text(partition,source,ordinal,value) VALUES(?,0,0,?)").run(LEGACY_PARTITION, inventoryString(text));
  return legacyRows(db);
}

function brandPartition(program: string): InventoryPartition {
  const file = "/fixture/packages/kit/src/ids/index.ts";
  const text = 'declare const brand:unique symbol; export type Current=string & {readonly [brand]:"chat"};';
  return {
    intent: "facts",
    available: [file],
    shapes: [{ node: { file, start: 0, end: text.length, kind: SyntaxKind.SourceFile }, copy: [], respell: [], direct: ["origin"], queries: [] }],
    pairs: [
      {
        query: {
          left: { file, start: 0, end: text.length, kind: SyntaxKind.SourceFile },
          right: { file, start: 0, end: text.length, kind: SyntaxKind.SourceFile },
          leftField: null,
          rightField: null,
          projection: "mutual",
          lenient: false,
        },
        result: { kind: "answer", values: [true] },
      },
    ],
    format: INVENTORY_FORMAT,
    families: ["id-brands", "runtime-exports", "shape-catalog", "shape-pairs", "declaration-outputs", "type-member-origins"],
    program,
    descriptorVersion: "current-version",
    compilerOptionsJson: "{}",
    configPaths: [],
    projectReferences: [],
    roots: [file],
    nativeRoots: [file],
    inputs: [
      { path: file, kind: "authored", version: "true" },
      { path: `${file}.external`, kind: "authored", version: "false" },
    ],
    sources: [{ file, path: file, text, consumerClass: "product", authored: true }],
    brands: [{ node: { file, start: text.indexOf("string &"), end: text.length - 1, kind: SyntaxKind.IntersectionType }, brand: '"chat"' }],
    memberOrigins: [],
    declarationOutputs: [{ node: { file, start: 0, end: text.length, kind: SyntaxKind.SourceFile }, unknown: false }],
    runtimeExports: [
      {
        file,
        name: "Current",
        declaration: { file, start: text.indexOf("export type"), end: text.length, kind: SyntaxKind.TypeAliasDeclaration },
        callable: false,
        initializer: null,
      },
    ],
    exports: [],
    modules: [],
    bindings: [],
    references: [],
    witnesses: [],
    casts: [],
  };
}

function familyDdl(db: DatabaseSync): ReturnType<StatementSync["get"]> {
  return db.prepare("SELECT sql FROM sqlite_schema WHERE name='inventory_family'").get();
}

function inputDdl(db: DatabaseSync): ReturnType<StatementSync["get"]> {
  return db.prepare("SELECT sql FROM sqlite_schema WHERE name='inventory_input'").get();
}

test.for([0, 1, 2, 3, 4, 5] as const)(
  "physical schema %s accepts current authored inputs and brands while old reader snapshots and identities survive",
  (version, { scratch }) => {
    const path = join(scratch, "old.sqlite");
    const before = createPriorStorage(path, version);
    const facts = brandPartition("tsconfig.direct.json");
    using fresh = openInventoryDatabase(join(scratch, "fresh.sqlite"));
    beginInventoryWrite(fresh);
    const freshGeneration = publishInventoryGeneration(fresh, [facts]);
    fresh.exec("COMMIT");
    const freshId = readInventoryGeneration(fresh, freshGeneration)[0]?.id;
    expect(freshId).toBeDefined();
    using pinned = new DatabaseSync(path, { readOnly: true });
    pinned.exec("BEGIN");
    const oldDdl = familyDdl(pinned);
    const oldInputDdl = inputDdl(pinned);
    expect(legacyRows(pinned)).toEqual(before);
    using current = openInventoryDatabase(path);
    try {
      beginInventoryWrite(current);
      const generation = publishInventoryGeneration(current, [facts]);
      current.exec("COMMIT");
      const direct = readInventoryGeneration(current, generation)[0];
      expect(direct?.id).toBe(freshId);
      expect(current.prepare(STORAGE_VERSION).get()).toEqual({ ["user_version"]: 6 });
      expect(legacyRows(current)).toEqual(before);
      expect(legacyRows(pinned)).toEqual(before);
      expect(familyDdl(pinned)).toEqual(oldDdl);
      expect(inputDdl(pinned)).toEqual(oldInputDdl);
      expect(pinned.prepare("SELECT id,format FROM inventory_generation ORDER BY id").all()).toEqual([{ id: 1, format: 4 + version }]);
      const stagePath = join(scratch, "stage.sqlite");
      using staging = openInventoryDatabase(stagePath);
      beginInventoryWrite(staging);
      const stageGeneration = publishInventoryGeneration(staging, [brandPartition("tsconfig.imported.json")]);
      staging.exec("COMMIT");
      const imported = readInventoryGeneration(staging, stageGeneration)[0];
      if (imported === undefined) {
        throw new Error("missing staged brand partition");
      }
      expect(imported.id).not.toBe(freshId);
      beginInventoryWrite(current);
      const execute = DatabaseSync.prototype.exec;
      const readerLock = vi.spyOn(DatabaseSync.prototype, "exec").mockImplementation(function (this: DatabaseSync, sql: string): void {
        if (sql === "BEGIN IMMEDIATE") {
          throw new Error("current-schema reader attempted a writer lock");
        }
        execute.call(this, sql);
      });
      try {
        using reader = openInventoryDatabase(path);
        expect(legacyRows(reader)).toEqual(before);
        expect(reader.prepare(STORAGE_VERSION).get()).toEqual({ ["user_version"]: 6 });
      } finally {
        readerLock.mockRestore();
      }
      importInventoryPartition(current, stagePath, imported.id);
      const importedGeneration = publishInventoryGeneration(current, [imported]);
      current.exec("COMMIT");
      expect(readInventoryGeneration(current, importedGeneration)[0]?.id).toBe(imported.id);
      expect([...readInventoryBrands(current, imported.id)].map(({ brand }) => brand)).toEqual(['"chat"']);
      expect([...readInventoryInputs(current, imported.id)]).toEqual(facts.inputs);
      const output = facts.declarationOutputs[0];
      if (output === undefined) {
        throw new Error("missing fixture declaration output");
      }
      expect([...readInventoryDeclarationOutputs(current, imported.id, output.node)]).toEqual(facts.declarationOutputs);
      expect([...readInventoryRuntimeExports(current, imported.id, facts.roots[0] ?? "")]).toEqual(facts.runtimeExports);
      expect([...readInventoryPairs(current, imported.id)]).toEqual(facts.pairs);
      const shape = facts.shapes[0];
      if (shape === undefined) {
        throw new Error("missing fixture shape");
      }
      expect(readInventoryShape(current, imported.id, shape.node)).toEqual(shape);
      expect(current.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      expect(legacyRows(current)).toEqual(before);
      expect(pinned.prepare("SELECT id,format FROM inventory_generation ORDER BY id").all()).toEqual([{ id: 1, format: 4 + version }]);
      pinned.exec("COMMIT");
      expect(pinned.prepare("SELECT id,format FROM inventory_generation ORDER BY id").all()).toEqual([
        { id: 1, format: 4 + version },
        { id: 2, format: INVENTORY_FORMAT },
        { id: 3, format: INVENTORY_FORMAT },
      ]);
      using reopened = openInventoryDatabase(path);
      expect(familyDdl(reopened)).toEqual(familyDdl(current));
      expect(inputDdl(reopened)).toEqual(inputDdl(current));
      expect(legacyRows(reopened)).toEqual(before);
      expect(reopened.prepare("SELECT name FROM sqlite_schema WHERE name IN ('inventory_family_upgrade','inventory_input_upgrade')").all()).toEqual([]);
    } finally {
      if (current.isTransaction) {
        current.exec("ROLLBACK");
      }
      if (pinned.isTransaction) {
        pinned.exec("ROLLBACK");
      }
    }
  },
);

test.for([
  { version: 0, table: "family" },
  { version: 0, table: "input" },
  { version: 1, table: "input" },
  { version: 2, table: "family" },
  { version: 3, table: "list" },
  { version: 4, table: "family" },
  { version: 5, table: "family" },
] as const)("post-drop failure rolls back physical schema and rows: %j", ({ version, table }, { scratch }) => {
  const path = join(scratch, "rollback.sqlite");
  const before = createPriorStorage(path, version);
  using observer = new DatabaseSync(path, { readOnly: true });
  const oldDdl = familyDdl(observer);
  const oldInputDdl = inputDdl(observer);
  const oldTables = observer.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all();
  const execute = DatabaseSync.prototype.exec;
  let dropped = false;
  const rename = vi.spyOn(DatabaseSync.prototype, "exec").mockImplementation(function (this: DatabaseSync, sql: string): void {
    if (sql.startsWith(`ALTER TABLE inventory_${table}_upgrade RENAME`)) {
      dropped = this.prepare("SELECT name FROM sqlite_schema WHERE name=?").get(`inventory_${table}`) === undefined;
      throw new Error("post-drop rename failure");
    }
    execute.call(this, sql);
  });
  try {
    expect(() => openInventoryDatabase(path)).toThrow("post-drop rename failure");
  } finally {
    rename.mockRestore();
  }
  expect(dropped).toBe(true);
  expect(legacyRows(observer)).toEqual(before);
  expect(familyDdl(observer)).toEqual(oldDdl);
  expect(inputDdl(observer)).toEqual(oldInputDdl);
  expect(observer.prepare(STORAGE_VERSION).get()).toEqual({ ["user_version"]: version });
  expect(observer.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all()).toEqual(oldTables);
  expect(observer.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  using retried = openInventoryDatabase(path);
  expect(retried.prepare(STORAGE_VERSION).get()).toEqual({ ["user_version"]: 6 });
  expect(legacyRows(retried)).toEqual(before);
});

test.for([0, 1, 2, 3, 4, 5] as const)("competing physical upgrades preserve schema %s rows and converge", async (version, { scratch }) => {
  const path = join(scratch, "racing.sqlite");
  const before = createPriorStorage(path, version);
  const module = import.meta.resolve("@orb/tooling/floor/code-facts/semantic-inventory-database");
  const script = `import {openInventoryDatabase} from ${JSON.stringify(module)}; using db=openInventoryDatabase(${JSON.stringify(path)}); console.log(JSON.stringify(db.prepare("PRAGMA user_version").get()));`;
  const results = await Promise.all([
    spawnNiced(process.execPath, ["--input-type=module", "-e", script], { cwd: scratch }),
    spawnNiced(process.execPath, ["--input-type=module", "-e", script], { cwd: scratch }),
  ]);
  expect(
    results.map(({ code }) => code),
    JSON.stringify(results),
  ).toEqual([0, 0]);
  expect(results.map(({ stdout }) => JSON.parse(stdout))).toEqual([{ ["user_version"]: 6 }, { ["user_version"]: 6 }]);
  using db = openInventoryDatabase(path);
  expect(legacyRows(db)).toEqual(before);
  expect(db.prepare("SELECT name FROM sqlite_schema WHERE name IN ('inventory_family_upgrade','inventory_input_upgrade')").all()).toEqual([]);
});

test("an unsupported future physical schema is refused rather than downgraded", ({ scratch }) => {
  const path = join(scratch, "future.sqlite");
  const before = createPriorStorage(path, 0);
  using db = new DatabaseSync(path);
  db.exec("PRAGMA user_version=7");
  const oldDdl = familyDdl(db);
  expect(() => openInventoryDatabase(path)).toThrow("unsupported native inventory storage schema: 7");
  expect(db.prepare(STORAGE_VERSION).get()).toEqual({ ["user_version"]: 7 });
  expect(familyDdl(db)).toEqual(oldDdl);
  expect(legacyRows(db)).toEqual(before);
});
