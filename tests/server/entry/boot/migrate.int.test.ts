// entry/boot/migrate — the boot migrate step. Covers: the migrations folder resolves from the @orb/db
// package (not cwd) and exists; the baseline applies on a fresh db + passes the integrity gate (sentinel
// tables across the dependency tiers exist); FK enforcement is left ON afterward; the step is idempotent
// (a second run is a no-op, not an error). Real libSQL :memory: (the .int lane). The @orb/db FK-dance +
// integrity-throw internals are covered by tests/db/client.int.test.ts; this pins the entry wiring.

import { existsSync } from "node:fs";
import { createDb } from "@orb/db";
import { resolveMigrationsFolder, runBootMigrations } from "@orb/server/entry/boot";
import { sql } from "drizzle-orm";
import { expect, test } from "vitest";

const FK_ON = 1;
const SENTINEL_TABLES = ["users", "characters", "chats", "workloads", "presets"];

test("resolveMigrationsFolder points at @orb/db's generated baseline dir", () => {
  const folder = resolveMigrationsFolder();
  expect(folder.endsWith("migrations")).toBe(true);
  expect(existsSync(folder)).toBe(true);
});

test("runBootMigrations applies the baseline on a fresh db + passes the integrity gate", async () => {
  const db = await createDb(":memory:");
  await runBootMigrations({ db, databaseUrl: ":memory:" });
  // Each select throws if the baseline didn't create the table (independent → run together).
  await Promise.all(
    SENTINEL_TABLES.map((table) => db.run(sql.raw(`select count(*) from ${table}`))),
  );
  const row = await db.get<Record<string, number>>(sql`PRAGMA foreign_keys`);
  expect(row?.["foreign_keys"]).toBe(FK_ON);
});

test("runBootMigrations is idempotent — a second run is a no-op, not an error", async () => {
  const db = await createDb(":memory:");
  await runBootMigrations({ db, databaseUrl: ":memory:" });
  await expect(runBootMigrations({ db, databaseUrl: ":memory:" })).resolves.toBeUndefined();
});
