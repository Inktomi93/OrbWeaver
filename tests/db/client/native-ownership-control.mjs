import assert from "node:assert/strict";
import { mkdirSync, readdirSync, readlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { closeDb, createDb, detachWal, preCloseHousekeeping, runMigrations } from "@orb/db";
import { sql } from "drizzle-orm";

await test("native disposal on the installed graph", async () => {
  // Resolve the public transitive driver from its actual owner, without a second test-only dependency.
  const dbRequire = createRequire(import.meta.resolve("@orb/db"));
  const clientRequire = createRequire(dbRequire.resolve("@libsql/client"));
  const Database = clientRequire("libsql");
  const root = process.argv[2];
  assert.ok(root);
  const retained = [];
  const keep = (value) => {
    retained.push(value);
    return value;
  };
  const url = (path) => pathToFileURL(path).href;

  function assertReleased(ownedDirectory) {
    if (process.platform !== "linux") {
      return;
    }
    const held = readdirSync("/proc/self/fd").flatMap((fd) => {
      try {
        const path = readlinkSync(`/proc/self/fd/${fd}`);
        return path.startsWith(`${ownedDirectory}/`) ? [path] : [];
      } catch (error) {
        if (error.code === "ENOENT") {
          return [];
        }
        throw error;
      }
    });
    assert.deepEqual(held, [], "close retained owned native file descriptors");
  }

  function directory(name) {
    const path = join(root, name);
    mkdirSync(path);
    return path;
  }

  async function reopen(path, expectedCount) {
    const db = await createDb(url(path));
    try {
      assert.equal((await db.get(sql`SELECT count(*) AS n FROM probe`)).n, expectedCount);
      assert.equal((await detachWal(db)).sole, true);
    } finally {
      closeDb(db);
    }
  }

  const rawDirectory = directory("raw");
  const rawPath = join(rawDirectory, "source.db");
  const raw = keep(new Database(rawPath));
  assert.equal(raw.open, true);
  raw.exec("PRAGMA journal_mode=WAL; CREATE TABLE probe(value INTEGER UNIQUE); INSERT INTO probe VALUES(1),(2)");
  const write = keep(raw.prepare("INSERT INTO probe VALUES(?)"));
  write.run(3);
  assert.throws(() => write.run(3), { code: "SQLITE_CONSTRAINT_UNIQUE" });
  const read = keep(raw.prepare("SELECT value FROM probe ORDER BY value"));
  const records = keep(read.all());
  const iterator = keep(read.iterate());
  const record = keep(iterator.next().value);
  assert.equal(record.value, 1);
  raw.close();
  assert.equal(raw.open, false);
  assert.ok(retained.includes(read) && retained.includes(iterator));
  assertReleased(rawDirectory);
  assert.throws(() => read.all(), /not open/u);
  assert.throws(() => iterator.next(), /not open/u);
  assert.equal(record.value, 1);
  assert.deepEqual(records, [{ value: 1 }, { value: 2 }, { value: 3 }]);
  raw.close();
  await reopen(rawPath, 3);
  assertReleased(rawDirectory);

  const migrationDirectory = directory("migration");
  const migrationPath = join(migrationDirectory, "source.db");
  const migrated = keep(await createDb(url(migrationPath)));
  await runMigrations(migrated, fileURLToPath(new URL("../../../packages/db/src/migrations/", import.meta.url)));
  assert.ok((await migrated.get(sql`SELECT count(*) AS n FROM __drizzle_migrations`)).n > 0);
  assert.equal((await migrated.get(sql`PRAGMA foreign_keys`)).foreign_keys, 1);
  await migrated.run(sql`CREATE TABLE probe(value INTEGER)`);
  await migrated.run(sql`INSERT INTO probe VALUES(37)`);
  await preCloseHousekeeping(migrated);
  assertReleased(migrationDirectory);
  await reopen(migrationPath, 1);
  assertReleased(migrationDirectory);

  const failedDirectory = directory("failed-migration");
  const failedFolder = join(failedDirectory, "input");
  mkdirSync(join(failedFolder, "meta"), { recursive: true });
  writeFileSync(join(failedFolder, "meta", "_journal.json"), JSON.stringify({ entries: [{ when: 1, tag: "0000_probe", breakpoints: true }] }));
  writeFileSync(join(failedFolder, "0000_probe.sql"), "CREATE TABLE rolled_back(value INTEGER);--> statement-breakpoint\nINSERT INTO missing_table VALUES(1)");
  const failed = keep(await createDb(url(join(failedDirectory, "source.db"))));
  await assert.rejects(runMigrations(failed, failedFolder), /missing_table/u);
  assert.equal((await failed.get(sql`SELECT count(*) AS n FROM sqlite_master WHERE name='rolled_back'`)).n, 0);
  assert.equal((await failed.get(sql`PRAGMA foreign_keys`)).foreign_keys, 1);
  closeDb(failed);
  assertReleased(failedDirectory);

  for (const mode of ["commit", "rollback", "close-held"]) {
    const transactionDirectory = directory(`transaction-${mode}`);
    const path = join(transactionDirectory, "source.db");
    let client;
    const db = keep(
      await createDb(url(path), (base) => {
        client = keep(base);
        return base;
      }),
    );
    await db.run(sql`CREATE TABLE probe(value INTEGER UNIQUE)`);
    const transaction = keep(await client.transaction("write"));
    await transaction.execute("INSERT INTO probe VALUES(1)");
    if (mode === "commit") {
      await transaction.commit();
    } else if (mode === "rollback") {
      await transaction.rollback();
    }
    closeDb(db);
    assertReleased(transactionDirectory);
    await assert.rejects(transaction.execute("SELECT 1"), /closed/u);
    await reopen(path, mode === "commit" ? 1 : 0);
    assertReleased(transactionDirectory);
  }

  const sqlDirectory = directory("sql");
  let sqlClient;
  const db = keep(
    await createDb(url(join(sqlDirectory, "source.db")), (base) => {
      sqlClient = keep(base);
      return base;
    }),
  );
  await db.run(sql`CREATE TABLE parent(id INTEGER PRIMARY KEY)`);
  await db.run(sql`CREATE TABLE child(parent_id INTEGER REFERENCES parent(id))`);
  await assert.rejects(db.run(sql`INSERT INTO child VALUES(7)`), (error) => error.cause?.extendedCode === "SQLITE_CONSTRAINT_FOREIGNKEY");
  await db.run(sql`INSERT INTO parent VALUES(7)`);
  await db.run(sql`INSERT INTO child VALUES(7)`);
  assert.equal((await db.get(sql`SELECT parent_id AS value FROM child`)).value, 7);
  await db.run(sql`CREATE TABLE probe(value INTEGER UNIQUE)`);
  await assert.rejects(sqlClient.batch(["INSERT INTO probe VALUES(1)", "INSERT INTO probe VALUES(1)"]), { code: "SQLITE_CONSTRAINT" });
  assert.equal((await db.get(sql`SELECT count(*) AS n FROM probe`)).n, 0);
  const values = keep(
    await db.get(sql`SELECT vector32('[1,0,0]') AS vector, vector_distance_cos(vector32('[1,0,0]'),vector32('[1,0,0]')) AS distance, x'001122FF' AS bytes`),
  );
  assert.equal(values.distance, 0);
  assert.equal(values.vector.byteLength, 12);
  assert.equal(Buffer.from(values.bytes).toString("hex"), "001122ff");
  closeDb(db);
  assertReleased(sqlDirectory);
  assert.equal(Buffer.from(values.bytes).toString("hex"), "001122ff");

  const failureDirectory = directory("initialization");
  for (const stage of ["wrap", "execute"]) {
    const failure = new Error("owned initialization failure");
    let client;
    await assert.rejects(
      createDb(url(join(failureDirectory, `${stage}.db`)), (base) => {
        client = keep(base);
        if (stage === "wrap") {
          throw failure;
        }
        return new Proxy(base, {
          get(target, key) {
            const value = Reflect.get(target, key, target);
            if (key === "execute") {
              return () => Promise.reject(failure);
            }
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
      }),
      (error) => error === failure,
    );
    assert.equal(client.closed, true);
    assertReleased(failureDirectory);
  }

  const housekeepingDirectory = directory("housekeeping-failure");
  const failure = new Error("owned housekeeping failure");
  let housekeepingClient;
  const housekeeping = keep(
    await createDb(url(join(housekeepingDirectory, "source.db")), (base) => {
      housekeepingClient = keep(base);
      return new Proxy(base, {
        get(target, key) {
          const value = Reflect.get(target, key, target);
          if (key === "execute") {
            return (statement, ...args) =>
              (typeof statement === "string" ? statement : statement.sql) === "ANALYZE" ? Promise.reject(failure) : value.call(target, statement, ...args);
          }
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    }),
  );
  await housekeeping.run(sql`CREATE TABLE probe(value INTEGER)`);
  await assert.rejects(preCloseHousekeeping(housekeeping), (error) => error.cause === failure);
  assert.equal(housekeepingClient.closed, true);
  assertReleased(housekeepingDirectory);
  console.log(`native ownership controls passed; retained=${retained.length}; fdObservation=${process.platform === "linux"}`);
});
