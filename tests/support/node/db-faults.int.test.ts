// @subject tests/support/node/db-faults.ts

import type { LibSqlWrap } from "@orb/db";
import { sql } from "drizzle-orm";
import { integer, sqliteTable } from "drizzle-orm/sqlite-core";
import type { OwnedDb } from "./db.ts";
import { freshDb } from "./db.ts";
import { plantTrigger, refuseWrites } from "./db-faults.ts";
import { expect, test } from "./fixtures.ts";

const probe = sqliteTable("fault_probe", { id: integer("id") });

const SHADOW_TABLE = sql`CREATE TABLE fault_shadow (id integer)`;

async function scratch(shadow = SHADOW_TABLE, wrap?: LibSqlWrap): Promise<OwnedDb> {
  using construction = new DisposableStack();
  // biome-ignore lint/nursery/useDisposables: construction.use registers disposal; construction.move transfers it to the caller's using.
  const owned = construction.use(await freshDb(wrap));
  await owned.db.run(sql`CREATE TABLE fault_probe (id integer)`);
  await owned.db.run(shadow);
  construction.move();
  return owned;
}

const shadowIds = async (db: OwnedDb["db"]): Promise<readonly number[]> =>
  (await db.all<{ id: number }>(sql`SELECT id FROM fault_shadow ORDER BY id`)).map((row) => row.id);

function capturedClient(): { readonly wrap: LibSqlWrap; readonly closed: () => boolean } {
  const opened: { client?: Parameters<LibSqlWrap>[0] } = {};
  return {
    wrap: (client): Parameters<LibSqlWrap>[0] => {
      opened.client = client;
      return client;
    },
    closed: (): boolean => opened.client?.closed === true,
  };
}

test("a scratch database closes at scope exit, and a setup that fails closes it before the caller holds it", async () => {
  const kept = capturedClient();
  {
    using owned = await scratch(SHADOW_TABLE, kept.wrap);
    await owned.db.run(sql`INSERT INTO fault_shadow (id) VALUES (1)`);
    expect(kept.closed()).toBe(false);
  }
  expect(kept.closed()).toBe(true);

  const refused = capturedClient();
  await expect(scratch(sql`CREATE TABLE fault_probe (id integer)`, refused.wrap)).rejects.toMatchObject({
    cause: expect.objectContaining({ message: expect.stringContaining("already exists") }),
  });
  expect(refused.closed()).toBe(true);
});

test("a planted trigger runs its body around a write until lifted, and the write itself still lands", async () => {
  using owned = await scratch();
  const db = owned.db;
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
  using owned = await scratch();
  const db = owned.db;
  await using fault = await refuseWrites(db, { table: probe, event: "INSERT", message: "probe writes are refused" });
  await expect(db.run(sql`INSERT INTO fault_probe (id) VALUES (1)`)).rejects.toMatchObject({
    cause: expect.objectContaining({ message: expect.stringContaining("probe writes are refused") }),
  });
  expect(await db.all(sql`SELECT id FROM fault_probe`)).toEqual([]);

  await fault.lift();
  await db.run(sql`INSERT INTO fault_probe (id) VALUES (1)`);
  expect(await db.all(sql`SELECT id FROM fault_probe`)).toHaveLength(1);
});
