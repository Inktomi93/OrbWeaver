// @subject packages/db/src/schema/workloads.ts
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertReferentialIntegrity, closeDb, createDb, runMigrations, users, workloads } from "@orb/db";
import { createIdSource, ID_PREFIX } from "@orb/kit/ids";
import { jsonValueSchema } from "@orb/kit/json";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { SHIPPED_MIGRATIONS, seedUser } from "@orb/testkit/node/composed";
import { eq, sql } from "drizzle-orm";

const FUNDER_MIGRATION = "0003_workload-funder";

test("the forward migration retains history, recovers only owned funding, and clears deleted funding", async () => {
  await using lifetime = new AsyncDisposableStack();
  const previousChain = await mkdtemp(join(tmpdir(), "workload-funding-chain-"));
  lifetime.defer(() => rm(previousChain, { recursive: true, force: true }));
  await cp(SHIPPED_MIGRATIONS, previousChain, { recursive: true });
  const journalPath = join(previousChain, "meta", "_journal.json");
  const journal = jsonValueSchema.parse(JSON.parse(await readFile(journalPath, "utf8")));
  if (journal === null || typeof journal !== "object" || Array.isArray(journal) || !Array.isArray(journal["entries"])) {
    throw new Error("shipped migration journal has no entries");
  }
  const entries = journal["entries"];
  const fundingIndex = entries.findIndex((entry) => entry !== null && typeof entry === "object" && !Array.isArray(entry) && entry["tag"] === FUNDER_MIGRATION);
  if (fundingIndex < 1) {
    throw new Error("funding migration has no preceding chain");
  }
  await writeFile(journalPath, JSON.stringify({ ...journal, entries: entries.slice(0, fundingIndex) }));
  const db = await createDb(":memory:");
  lifetime.defer(() => closeDb(db));
  await runMigrations(db, previousChain);
  const ids = createIdSource(createSeededIds().next);
  const owner = await seedUser(db, {}, ids);
  const deleted = await seedUser(db, {}, ids);
  const ownedId = ids.typeId(ID_PREFIX.workload);
  const systemId = ids.typeId(ID_PREFIX.workload);
  const orphanId = ids.typeId(ID_PREFIX.workload);
  // Database-subject input uses the preceding schema's actual defaults and FK behavior.
  await db.run(sql`insert into workloads (id, kind, owner_id, admission_system, status, mode) values
    (${ownedId}, 'assets-backfill', ${owner.id}, 0, 'succeeded', 'singular'),
    (${systemId}, 'distill-characters', null, 1, 'queued', 'bulk'),
    (${orphanId}, 'assets-backfill', ${deleted.id}, 0, 'failed', 'singular')`);
  await db.delete(users).where(eq(users.id, deleted.id));
  await runMigrations(db, SHIPPED_MIGRATIONS);
  await expect(assertReferentialIntegrity(db)).resolves.toBeUndefined();
  const rows = await db
    .select({ id: workloads.id, ownerId: workloads.ownerId, funderUserId: workloads.funderUserId, admissionSystem: workloads.admissionSystem })
    .from(workloads)
    .orderBy(workloads.id);
  expect(rows).toEqual([
    { id: ownedId, ownerId: owner.id, funderUserId: owner.id, admissionSystem: false },
    { id: systemId, ownerId: null, funderUserId: null, admissionSystem: true },
    { id: orphanId, ownerId: null, funderUserId: null, admissionSystem: false },
  ]);
  expect(await db.all(sql`select "from", on_delete as onDelete from pragma_foreign_key_list('workloads') where "from" = 'funder_user_id'`)).toEqual([
    { from: "funder_user_id", onDelete: "SET NULL" },
  ]);
  expect(await db.all(sql`select name from pragma_index_info('workloads_funder_idx') order by seqno`)).toEqual([{ name: "funder_user_id" }]);
  // A vanished user is deliberate invalid boundary input, not a normal fixture state.
  await expect(db.update(workloads).set({ funderUserId: deleted.id }).where(eq(workloads.id, systemId))).rejects.toThrow();
  await db.delete(users).where(eq(users.id, owner.id));
  expect(await db.select({ ownerId: workloads.ownerId, funderUserId: workloads.funderUserId }).from(workloads).where(eq(workloads.id, ownedId))).toEqual([
    { ownerId: null, funderUserId: null },
  ]);
  await expect(assertReferentialIntegrity(db)).resolves.toBeUndefined();
});
