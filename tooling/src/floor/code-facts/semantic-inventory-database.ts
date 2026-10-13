// Immutable partitions are reachable only through a complete committed generation.
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { waitSync } from "../process/sync-sleep.ts";
import type { InventoryPartition } from "./semantic-inventory-contract.ts";
import { INVENTORY_FORMAT, partitionSchema } from "./semantic-inventory-contract.ts";
import { contentVersion } from "./semantic-inventory-inputs.ts";

const partitionRow = z.object({ id: z.string(), payload: z.string() });
const generationRow = z.object({ generation: z.number() });
const memberRow = z.object({ program: z.string(), partition: z.string() });
const SQLITE_BUSY = 5;
const WRITER_RETRY_MS = 50;

/** Open the committed store without racing its initial schema or an active writer. */
export function openInventoryDatabase(path: string): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA busy_timeout=1000; PRAGMA foreign_keys=ON;");
    execWithBusyRetry(db, "PRAGMA journal_mode=WAL;");
    execWithBusyRetry(
      db,
      `
    CREATE TABLE IF NOT EXISTS inventory_partition(id TEXT PRIMARY KEY, program TEXT NOT NULL, format INTEGER NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS inventory_generation(id INTEGER PRIMARY KEY, format INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS inventory_member(generation INTEGER NOT NULL REFERENCES inventory_generation(id), program TEXT NOT NULL, partition TEXT NOT NULL REFERENCES inventory_partition(id), PRIMARY KEY(generation,program));
    `,
    );
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
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

/** Reuse the newest partition for each program, including programs outside the latest demand set. */
export function latestInventoryPartitions(db: DatabaseSync): ReadonlyMap<string, InventoryPartition> {
  const rows = db
    .prepare(`SELECT p.id,p.payload FROM inventory_partition p JOIN inventory_member m ON m.partition=p.id
    WHERE p.format=? AND m.generation=(SELECT MAX(n.generation) FROM inventory_member n WHERE n.program=m.program)`)
    .all(INVENTORY_FORMAT);
  return new Map(
    rows.map((row) => {
      const parsed = partitionRow.parse(row);
      const partition = partitionSchema.parse(JSON.parse(parsed.payload));
      return [partition.program, partition];
    }),
  );
}

/** Write a complete generation inside the caller-owned publication transaction. */
export function publishInventoryGeneration(db: DatabaseSync, partitions: readonly InventoryPartition[]): number {
  const latest = generationRow.parse(db.prepare("SELECT COALESCE(MAX(id),0) AS generation FROM inventory_generation").get()).generation;
  const generation = latest + 1;
  db.prepare("INSERT INTO inventory_generation(id,format) VALUES(?,?)").run(generation, INVENTORY_FORMAT);
  const insert = db.prepare("INSERT OR IGNORE INTO inventory_partition(id,program,format,payload) VALUES(?,?,?,?)");
  const member = db.prepare("INSERT INTO inventory_member(generation,program,partition) VALUES(?,?,?)");
  for (const partition of partitions) {
    const payload = JSON.stringify(partition);
    const id = contentVersion(payload);
    insert.run(id, partition.program, INVENTORY_FORMAT, payload);
    member.run(generation, partition.program, id);
  }
  return generation;
}

/** Read only the immutable partitions selected by one committed generation. */
export function readInventoryGeneration(db: DatabaseSync, generation: number): readonly InventoryPartition[] {
  const members = db
    .prepare("SELECT program,partition FROM inventory_member WHERE generation=? ORDER BY program")
    .all(generation)
    .map((row) => memberRow.parse(row));
  return members.map((member) => {
    const row = partitionRow.parse(db.prepare("SELECT id,payload FROM inventory_partition WHERE id=?").get(member.partition));
    return partitionSchema.parse(JSON.parse(row.payload));
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
    .map((row) => memberRow.parse(row).program);
}
