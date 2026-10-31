// @subject tests/support/node/db-faults.ts

import { sql } from "drizzle-orm";
import { integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { freshDb } from "./db.ts";
import { plantTrigger, refuseWrites } from "./db-faults.ts";
import { expect, test } from "./fixtures.ts";

const probe = sqliteTable("fault_probe", { id: integer("id") });

async function scratch(): Promise<Awaited<ReturnType<typeof freshDb>>> {
  const db = await freshDb();
  await db.run(sql`CREATE TABLE fault_probe (id integer)`);
  await db.run(sql`CREATE TABLE fault_shadow (id integer)`);
  return db;
}

const shadowIds = async (db: Awaited<ReturnType<typeof freshDb>>): Promise<readonly number[]> =>
  (await db.all<{ id: number }>(sql`SELECT id FROM fault_shadow ORDER BY id`)).map((row) => row.id);

test("a planted trigger runs its body around a write until lifted, and the write itself still lands", async () => {
  const db = await scratch();
  await using fault = await plantTrigger(db, {
    table: probe,
    event: "INSERT",
    timing: "AFTER",
    name: "plant_probe_shadow",
    body: "INSERT INTO fault_shadow (id) VALUES (NEW.id);",
  });
  await db.run(sql`INSERT INTO fault_probe (id) VALUES (1)`);
  expect(await shadowIds(db)).toEqual([1]);

  await fault.lift();
  await db.run(sql`INSERT INTO fault_probe (id) VALUES (2)`);
  expect(await shadowIds(db)).toEqual([1]);
  expect((await db.all<{ id: number }>(sql`SELECT id FROM fault_probe ORDER BY id`)).map((row) => row.id)).toEqual([1, 2]);
});

test("a write refusal aborts the matching statement with its message, only while armed", async () => {
  const db = await scratch();
  await using fault = await refuseWrites(db, { table: probe, event: "INSERT", message: "probe writes are refused" });
  await expect(db.run(sql`INSERT INTO fault_probe (id) VALUES (1)`)).rejects.toMatchObject({
    cause: expect.objectContaining({ message: expect.stringContaining("probe writes are refused") }),
  });
  expect(await db.all(sql`SELECT id FROM fault_probe`)).toEqual([]);

  await fault.lift();
  await db.run(sql`INSERT INTO fault_probe (id) VALUES (1)`);
  expect(await db.all(sql`SELECT id FROM fault_probe`)).toHaveLength(1);
});
