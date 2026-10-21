// Immutable partitions are reachable only through a complete committed generation.
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { waitSync } from "../process/sync-sleep.ts";
import type { InventoryFamily, InventoryPartition, StoredInventoryPartition } from "./semantic-inventory-contract.ts";
import { INVENTORY_FORMAT, INVENTORY_LISTS, INVENTORY_RECORD_TABLES, INVENTORY_REFERENCE_MODES, storedPartitionSchema } from "./semantic-inventory-contract.ts";
import {
  inventoryInputStatColumn,
  inventoryRecordTables,
  inventoryString,
  inventoryStringSchema,
  visitInventoryRecords,
} from "./semantic-inventory-records.ts";

const storageVersionRow = z.object({ ["user_version"]: z.number().int() });
// Partition format describes facts; this marker owns physical constraints.
const STORAGE_SCHEMA_VERSION = 17;
const SHAPE_FIELD_SCHEMA_VERSION = 16;
const REFERENCE_NAME_SCHEMA_VERSION = 15;
const RUNTIME_SCHEMA_VERSION = 14;
const REFERENCE_SCHEMA_VERSION = 13;
const SOURCE_INDEX_SCHEMA_VERSION = 12;
const EXPORT_SCHEMA_VERSION = 11;
const INVOCATION_SCHEMA_VERSION = 10;
const GLOBAL_SCHEMA_VERSION = 9;
const COMPUTED_SCHEMA_VERSION = 8;
const CALLABLE_SCHEMA_VERSION = 7;
const MEMBER_ORIGIN_SCHEMA_VERSION = 6;
const DECLARATION_OUTPUT_SCHEMA_VERSION = 5;
const SHAPE_SCHEMA_VERSION = 4;
const RUNTIME_EXPORT_SCHEMA_VERSION = 3;
const SOURCE_FILE_INDEX = "inventory_source_file";
const LIST_VALUE_INDEX = "inventory_list_value";
const INPUT_VERSION_INDEX = "inventory_input_version";

const generationRow = z.object({ generation: z.number() });
const memberRow = z.object({ program: inventoryStringSchema, partition: z.string() });
const stringRow = z.object({ value: inventoryStringSchema });
const descriptorRow = z.object({
  id: z.string(),
  format: z.literal(INVENTORY_FORMAT),
  program: inventoryStringSchema,
  descriptorVersion: inventoryStringSchema,
  compilerOptionsJson: inventoryStringSchema,
  workerPid: z.number().int().nullable(),
  intent: z.enum(["facts", "membership"]),
  referenceMode: z.enum(INVENTORY_REFERENCE_MODES),
});
const SQLITE_BUSY = 5;
const WRITER_RETRY_MS = 50;

/** Keep legacy committed generations intact; new facts use normalized rows, never the legacy payload column. */
export function openInventoryDatabase(path: string): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA busy_timeout=1000; PRAGMA foreign_keys=ON;");
    execWithBusyRetry(db, "PRAGMA journal_mode=WAL;");
    initializeStorageSchema(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function storageSchemaVersion(db: DatabaseSync): number {
  const version = storageVersionRow.parse(db.prepare("PRAGMA user_version").get()).user_version;
  if (
    version !== 0 &&
    version !== 1 &&
    version !== 2 &&
    version !== RUNTIME_EXPORT_SCHEMA_VERSION &&
    version !== SHAPE_SCHEMA_VERSION &&
    version !== DECLARATION_OUTPUT_SCHEMA_VERSION &&
    version !== MEMBER_ORIGIN_SCHEMA_VERSION &&
    version !== CALLABLE_SCHEMA_VERSION &&
    version !== COMPUTED_SCHEMA_VERSION &&
    version !== GLOBAL_SCHEMA_VERSION &&
    version !== INVOCATION_SCHEMA_VERSION &&
    version !== EXPORT_SCHEMA_VERSION &&
    version !== SOURCE_INDEX_SCHEMA_VERSION &&
    version !== REFERENCE_SCHEMA_VERSION &&
    version !== RUNTIME_SCHEMA_VERSION &&
    version !== REFERENCE_NAME_SCHEMA_VERSION &&
    version !== SHAPE_FIELD_SCHEMA_VERSION &&
    version !== STORAGE_SCHEMA_VERSION
  ) {
    throw new Error(`unsupported native inventory storage schema: ${String(version)}`);
  }
  return version;
}

function storageSchemaReady(db: DatabaseSync): boolean {
  return (
    storageSchemaVersion(db) === STORAGE_SCHEMA_VERSION &&
    db.prepare("SELECT name FROM sqlite_schema WHERE type='index' AND name=?").get(SOURCE_FILE_INDEX) !== undefined &&
    db.prepare("SELECT name FROM sqlite_schema WHERE type='index' AND name=?").get(LIST_VALUE_INDEX) !== undefined &&
    db.prepare("SELECT name FROM sqlite_schema WHERE type='index' AND name=?").get(INPUT_VERSION_INDEX) !== undefined
  );
}

function upgradeRuntimeStorage(db: DatabaseSync, version: number): void {
  if (version < RUNTIME_SCHEMA_VERSION) {
    for (const table of ["runtimeHeader", "runtimeSource", "runtimeResolution"] as const) {
      db.exec(`CREATE TABLE IF NOT EXISTS ${inventoryRecordTables[table].name}(${inventoryRecordTables[table].definition}) STRICT;`);
    }
  }
}

function initializeStorageSchema(db: DatabaseSync): void {
  // Ready readers do not wait for another writer; older current stores add missing lookup indexes once below.
  if (storageSchemaReady(db)) {
    return;
  }
  beginInventoryWrite(db);
  try {
    // A competing opener may have completed the bootstrap while this connection waited.
    const version = storageSchemaVersion(db);
    const inputExists = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name='inventory_input'").get() !== undefined;
    if (version === 0) {
      const familyExists = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name='inventory_family'").get() !== undefined;
      execWithBusyRetry(
        db,
        `
        CREATE TABLE IF NOT EXISTS inventory_partition(id TEXT PRIMARY KEY, program TEXT NOT NULL, format INTEGER NOT NULL, payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS inventory_generation(id INTEGER PRIMARY KEY, format INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS inventory_member(generation INTEGER NOT NULL REFERENCES inventory_generation(id), program TEXT NOT NULL, partition TEXT NOT NULL REFERENCES inventory_partition(id), PRIMARY KEY(generation,program));
        ${INVENTORY_RECORD_TABLES.map((table) => `CREATE TABLE IF NOT EXISTS ${inventoryRecordTables[table].name}(${inventoryRecordTables[table].definition}) STRICT;`).join("\n")}
        CREATE INDEX IF NOT EXISTS inventory_fact_file ON inventory_fact(partition,kind,file,ordinal);
        CREATE INDEX IF NOT EXISTS inventory_fact_node ON inventory_fact(partition,kind,node,ordinal);
        CREATE INDEX IF NOT EXISTS inventory_reference_origin ON inventory_reference(partition,declaration,ordinal);
      `,
      );
      if (familyExists) {
        db.exec(`CREATE TABLE inventory_family_upgrade(${inventoryRecordTables.family.definition}) STRICT;`);
        db.exec("INSERT INTO inventory_family_upgrade(partition,ordinal,name) SELECT partition,ordinal,name FROM inventory_family;");
        db.exec("DROP TABLE inventory_family;");
        db.exec("ALTER TABLE inventory_family_upgrade RENAME TO inventory_family;");
      }
    }
    if (version < 2 && inputExists) {
      db.exec(`CREATE TABLE inventory_input_upgrade(${inventoryRecordTables.input.definition}) STRICT;`);
      db.exec("INSERT INTO inventory_input_upgrade(partition,ordinal,path,kind,version) SELECT partition,ordinal,path,kind,version FROM inventory_input;");
      db.exec("DROP TABLE inventory_input;");
      db.exec("ALTER TABLE inventory_input_upgrade RENAME TO inventory_input;");
    }
    if (version > 0 && version < REFERENCE_SCHEMA_VERSION) {
      for (const table of [
        "memberOrigin",
        "memberDeclaration",
        "callableDeclaration",
        "callableTrace",
        "computedName",
        "computedTrace",
        "globalOrigin",
        "globalDeclaration",
        "globalMember",
        "globalBinding",
        "invocationEvidence",
        "invocationAtom",
        "invocationSource",
        "exportDeclaration",
        "exportDeclarationNode",
        "drizzleEvidence",
        "drizzleAtom",
      ] as const) {
        db.exec(`CREATE TABLE IF NOT EXISTS ${inventoryRecordTables[table].name}(${inventoryRecordTables[table].definition}) STRICT;`);
      }
      db.exec(`CREATE TABLE IF NOT EXISTS inventory_declaration_output(${inventoryRecordTables.declarationOutput.definition}) STRICT;`);
      db.exec(`CREATE TABLE IF NOT EXISTS inventory_runtime_export(${inventoryRecordTables.runtimeExport.definition}) STRICT;`);
      db.exec(`CREATE TABLE inventory_family_upgrade(${inventoryRecordTables.family.definition}) STRICT;`);
      db.exec("INSERT INTO inventory_family_upgrade(partition,ordinal,name) SELECT partition,ordinal,name FROM inventory_family;");
      db.exec("DROP TABLE inventory_family;");
      db.exec("ALTER TABLE inventory_family_upgrade RENAME TO inventory_family;");
    }
    if (version < SHAPE_SCHEMA_VERSION) {
      upgradeShapeStorage(db);
    }
    upgradeReferenceStorage(db, version);
    upgradeRuntimeStorage(db, version);
    upgradeReferenceNameStorage(db, version);
    upgradeShapeFieldStorage(db, version);
    upgradeInputStatStorage(db);
    // Closed invocation coverage repeatedly looks up one source; the ordinal primary key only narrows
    // the partition. Nonunique lookup preserves the reader's existing duplicate-ownership refusal.
    db.exec(`CREATE INDEX IF NOT EXISTS ${SOURCE_FILE_INDEX} ON inventory_source(partition,file);`);
    // Membership reads need value equality, while ordered lists retain their ordinal primary key.
    db.exec(`CREATE INDEX IF NOT EXISTS ${LIST_VALUE_INDEX} ON inventory_list(partition,kind,value);`);
    // Stat refresh selects one versioned input, not every ordinal in its partition.
    db.exec(`CREATE INDEX IF NOT EXISTS ${INPUT_VERSION_INDEX} ON inventory_input(partition,path,kind,version);`);
    if (version < STORAGE_SCHEMA_VERSION) {
      db.exec(`PRAGMA user_version=${String(STORAGE_SCHEMA_VERSION)};`);
    }
    db.exec("COMMIT");
  } catch (error) {
    if (db.isTransaction) {
      db.exec("ROLLBACK");
    }
    throw error;
  }
}

function upgradeInputStatStorage(db: DatabaseSync): void {
  if (
    !db
      .prepare("PRAGMA table_info(inventory_input)")
      .all()
      .some((row) => row["name"] === "stat")
  ) {
    db.exec(`ALTER TABLE inventory_input ADD COLUMN ${inventoryInputStatColumn};`);
  }
}

function upgradeReferenceStorage(db: DatabaseSync, version: number): void {
  if (version < REFERENCE_SCHEMA_VERSION) {
    db.exec(`CREATE TABLE IF NOT EXISTS inventory_reference_query(${inventoryRecordTables.referenceQuery.definition}) STRICT;`);
    db.exec(`CREATE TABLE IF NOT EXISTS inventory_reference_query_node(${inventoryRecordTables.referenceQueryNode.definition}) STRICT;`);
    if (
      !db
        .prepare("PRAGMA table_info(inventory_descriptor)")
        .all()
        .some((row) => row["name"] === "referenceMode")
    ) {
      db.exec("ALTER TABLE inventory_descriptor ADD COLUMN referenceMode TEXT NOT NULL DEFAULT 'complete' CHECK(referenceMode IN ('complete','closed'));");
    }
  }
}

function upgradeReferenceNameStorage(db: DatabaseSync, version: number): void {
  if (version < REFERENCE_NAME_SCHEMA_VERSION) {
    db.exec(`CREATE TABLE IF NOT EXISTS ${inventoryRecordTables.referenceName.name}(${inventoryRecordTables.referenceName.definition}) STRICT;`);
    // Name lookups replay a declaration's rows; the declaration side is reached through inventory_reference_origin.
    db.exec("CREATE INDEX IF NOT EXISTS inventory_reference_name_lookup ON inventory_reference_name(partition,name);");
  }
}

// Field rows are a rebuildable cache of the current format only; older generations are unreachable by format,
// so the rows are dropped with the printed-type column instead of being copied.
function upgradeShapeFieldStorage(db: DatabaseSync, version: number): void {
  if (version > 0 && version < SHAPE_FIELD_SCHEMA_VERSION) {
    db.exec(`DROP TABLE IF EXISTS ${inventoryRecordTables.shapeField.name};`);
    db.exec(`CREATE TABLE ${inventoryRecordTables.shapeField.name}(${inventoryRecordTables.shapeField.definition}) STRICT;`);
  }
}

function upgradeShapeStorage(db: DatabaseSync): void {
  for (const table of ["shape", "shapeField", "shapeOrigin", "pair"] as const) {
    db.exec(`CREATE TABLE IF NOT EXISTS ${inventoryRecordTables[table].name}(${inventoryRecordTables[table].definition}) STRICT;`);
  }
  if (
    !db
      .prepare("PRAGMA table_info(inventory_descriptor)")
      .all()
      .some((row) => row["name"] === "intent")
  ) {
    db.exec("ALTER TABLE inventory_descriptor ADD COLUMN intent TEXT NOT NULL DEFAULT 'facts' CHECK(intent IN ('facts','membership'));");
  }
  db.exec(`CREATE TABLE inventory_list_upgrade(${inventoryRecordTables.list.definition}) STRICT;`);
  db.exec("INSERT INTO inventory_list_upgrade(partition,kind,ordinal,value) SELECT partition,kind,ordinal,value FROM inventory_list;");
  db.exec("DROP TABLE inventory_list;");
  db.exec("ALTER TABLE inventory_list_upgrade RENAME TO inventory_list;");
  db.exec("CREATE INDEX IF NOT EXISTS inventory_runtime_export_file ON inventory_runtime_export(partition,file,ordinal);");
}

/** Wait for the active writer; SQLite releases its lock even when its process fails. */
export function beginInventoryWrite(db: DatabaseSync): void {
  execWithBusyRetry(db, "BEGIN IMMEDIATE");
}

function execWithBusyRetry(db: DatabaseSync, sql: string): void {
  for (;;) {
    try {
      db.exec(sql);
      return;
    } catch (error) {
      if (!(error instanceof Error && "errcode" in error && error.errcode === SQLITE_BUSY)) {
        throw error;
      }
      waitSync(WRITER_RETRY_MS);
    }
  }
}

function readPartition(db: DatabaseSync, id: string): StoredInventoryPartition {
  const row = descriptorRow.parse(
    db
      .prepare(
        "SELECT p.id,p.format,d.program,d.descriptorVersion,d.compilerOptionsJson,d.workerPid,d.intent,d.referenceMode FROM inventory_partition p JOIN inventory_descriptor d ON d.partition=p.id WHERE p.id=?",
      )
      .get(id),
  );
  const lists = Object.fromEntries(
    INVENTORY_LISTS.map((kind) => [
      kind,
      db
        .prepare("SELECT value FROM inventory_list WHERE partition=? AND kind=? ORDER BY ordinal")
        .all(id, kind)
        .map((value) => stringRow.parse(value).value),
    ]),
  );
  const { workerPid, ...metadata } = row;
  const families = db
    .prepare("SELECT name FROM inventory_family WHERE partition=? ORDER BY ordinal")
    .all(id)
    .map((family) => family["name"]);
  return storedPartitionSchema.parse({ ...metadata, ...lists, families, ...(workerPid === null ? {} : { workerPid }) });
}

/** Return identities and native metadata only; facts stay indexed in SQLite. */
export function latestInventoryPartitions(db: DatabaseSync, families?: readonly InventoryFamily[]): ReadonlyMap<string, StoredInventoryPartition> {
  const rows = db
    .prepare(
      "SELECT p.program,p.id AS partition FROM inventory_partition p JOIN inventory_member m ON m.partition=p.id WHERE p.format=? ORDER BY m.generation DESC",
    )
    .all(INVENTORY_FORMAT);
  const found = new Map<string, StoredInventoryPartition>();
  for (const value of rows) {
    const row = memberRow.parse(value);
    if (found.has(row.program)) {
      continue;
    }
    const partition = readPartition(db, row.partition);
    if (families?.some((family) => !partition.families.includes(family)) === true) {
      continue;
    }
    found.set(row.program, partition);
  }
  return found;
}

function storePartition(db: DatabaseSync, partition: InventoryPartition): string {
  const hash = createHash("sha256").update(`inventory:${String(INVENTORY_FORMAT)}\n`);
  // Stat observations accelerate validation; refreshing them must not change a content-derived partition identity.
  visitInventoryRecords(partition, (record) => {
    const values = record.table === "input" ? record.values.slice(0, -1) : record.values;
    hash.update(JSON.stringify([record.table, ...values])).update("\n");
  });
  const id = hash.digest("hex");
  const inserted = db
    .prepare("INSERT OR IGNORE INTO inventory_partition(id,program,format,payload) VALUES(?,?,?,'')")
    .run(id, inventoryString(partition.program), INVENTORY_FORMAT);
  if (inserted.changes === 0) {
    return id;
  }
  const statements = new Map(
    INVENTORY_RECORD_TABLES.map((table) => {
      const columns = inventoryRecordTables[table].columns;
      return [
        table,
        db.prepare(
          `INSERT INTO ${inventoryRecordTables[table].name}(partition,${columns}) VALUES(${Array.from({ length: columns.split(",").length + 1 }, () => "?").join(",")})`,
        ),
      ];
    }),
  );
  visitInventoryRecords(partition, (record) => {
    const statement = statements.get(record.table);
    if (statement === undefined) {
      throw new Error(`native inventory record table missing: ${record.table}`);
    }
    statement.run(id, ...record.values);
  });
  return id;
}

/** Both exited-worker records and already stored identities use the same atomic generation publisher. */
export function publishInventoryGeneration(db: DatabaseSync, partitions: readonly (InventoryPartition | StoredInventoryPartition)[]): number {
  const latest = generationRow.parse(db.prepare("SELECT COALESCE(MAX(id),0) AS generation FROM inventory_generation").get()).generation;
  const generation = latest + 1;
  db.prepare("INSERT INTO inventory_generation(id,format) VALUES(?,?)").run(generation, INVENTORY_FORMAT);
  const member = db.prepare("INSERT INTO inventory_member(generation,program,partition) VALUES(?,?,?)");
  for (const partition of partitions) {
    const id = "id" in partition ? partition.id : storePartition(db, partition);
    member.run(generation, inventoryString(partition.program), id);
  }
  return generation;
}

/** Stream exited-worker rows under the parent's writer transaction without a whole-payload decode. */
export function importInventoryPartition(db: DatabaseSync, path: string, id: string): void {
  if (db.prepare("SELECT id FROM inventory_partition WHERE id=?").get(id) !== undefined) {
    return;
  }
  using staging = openInventoryDatabase(path);
  const partition = readPartition(staging, id);
  db.prepare("INSERT INTO inventory_partition(id,program,format,payload) VALUES(?,?,?,'')").run(id, inventoryString(partition.program), INVENTORY_FORMAT);
  for (const table of INVENTORY_RECORD_TABLES) {
    const { name, columns } = inventoryRecordTables[table];
    const names = columns.split(",");
    const insert = db.prepare(`INSERT INTO ${name}(partition,${columns}) VALUES(${Array.from({ length: names.length + 1 }, () => "?").join(",")})`);
    for (const row of staging.prepare(`SELECT ${columns} FROM ${name} WHERE partition=?`).iterate(id)) {
      const values = names.map((column) => {
        const value = row[column];
        if (value === undefined) {
          throw new Error(`native inventory missing record column: ${name}.${column}`);
        }
        return value;
      });
      insert.run(id, ...values);
    }
  }
}

/** Read pinned identities, never concatenate or parse a complete partition payload. */
export function readInventoryGeneration(db: DatabaseSync, generation: number): readonly StoredInventoryPartition[] {
  return db
    .prepare("SELECT program,partition FROM inventory_member WHERE generation=? ORDER BY program")
    .all(generation)
    .map((value) => {
      const member = memberRow.parse(value);
      const partition = readPartition(db, member.partition);
      if (member.program !== partition.program) {
        throw new Error("native inventory generation member program differs from its partition");
      }
      return partition;
    })
    .toSorted((a, b) => {
      if (a.program === b.program) {
        return 0;
      }
      return a.program < b.program ? -1 : 1;
    });
}

/** Select the committed generation for the current extraction format. */
export function latestInventoryGeneration(db: DatabaseSync): number {
  return generationRow.parse(db.prepare("SELECT COALESCE(MAX(id),0) AS generation FROM inventory_generation WHERE format=?").get(INVENTORY_FORMAT)).generation;
}

/** A demand set must match its generation before an unchanged request can reuse the generation. */
export function inventoryGenerationPrograms(db: DatabaseSync, generation: number): readonly string[] {
  return db
    .prepare("SELECT program,partition FROM inventory_member WHERE generation=? ORDER BY program")
    .all(generation)
    .map((row) => memberRow.parse(row).program)
    .toSorted();
}
