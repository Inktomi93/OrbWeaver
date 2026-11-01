// @subject packages/db/src/schema/workloads.ts
import { assertReferentialIntegrity, closeDb, createDb, runMigrations, workloadSchedules, workloads } from "@orb/db";
import { isConstraintViolation } from "@orb/db/query";
import { createIdSource, ID_PREFIX } from "@orb/kit/ids";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { migrationsBefore, SHIPPED_MIGRATIONS } from "@orb/testkit/node/composed";
import { seedUser } from "@orb/testkit/node/rows";
import { sql } from "drizzle-orm";

const REBUILD_KIND_MIGRATION = "0009_assets-rebuild-index-kind-checks";
const REBUILD_KIND = "assets-rebuild-index";

test("the kind migration keeps every stored workload and schedule, and admits the rebuild kind in both tables", async () => {
  await using previousChain = await migrationsBefore(REBUILD_KIND_MIGRATION);
  await using lifetime = new AsyncDisposableStack();
  const db = await createDb(":memory:");
  lifetime.defer(() => closeDb(db));
  await runMigrations(db, previousChain.path);
  const ids = createIdSource(createSeededIds().next);
  const owner = await seedUser(db, {}, ids);
  const finishedId = ids.typeId(ID_PREFIX.workload);
  const activeId = ids.typeId(ID_PREFIX.workload);
  const scheduleId = ids.typeId(ID_PREFIX.workloadSchedule);
  // Database-subject input uses the preceding schema's actual defaults and CHECKs.
  await db.run(sql`insert into workloads (id, kind, owner_id, funder_user_id, admission_system, status, mode) values
    (${finishedId}, 'assets-gc', ${owner.id}, ${owner.id}, 0, 'succeeded', 'bulk'),
    (${activeId}, 'assets-fsck', ${owner.id}, ${owner.id}, 0, 'running', 'bulk')`);
  await db.run(sql`insert into workload_schedules (id, owner_id, kind, mode, cadence, next_run_at) values
    (${scheduleId}, ${owner.id}, 'assets-gc', 'bulk', 'weekly', 1000)`);
  const stored = async (): Promise<readonly unknown[]> => [
    await db.select().from(workloads).orderBy(workloads.id),
    await db.select().from(workloadSchedules).orderBy(workloadSchedules.id),
  ];
  const before = await stored();
  await expect(
    db.run(sql`insert into workload_schedules (id, owner_id, kind, mode, cadence, next_run_at) values
      (${ids.typeId(ID_PREFIX.workloadSchedule)}, ${owner.id}, ${REBUILD_KIND}, 'bulk', 'weekly', 1000)`),
  ).rejects.toSatisfy((error) => isConstraintViolation(error)?.kind === "check");

  await runMigrations(db, SHIPPED_MIGRATIONS);

  await expect(assertReferentialIntegrity(db)).resolves.toBeUndefined();
  expect(await stored()).toEqual(before);
  const rebuildId = ids.typeId(ID_PREFIX.workload);
  await db.run(sql`insert into workloads (id, kind, owner_id, funder_user_id, admission_system, status, mode, admission_key) values
    (${rebuildId}, ${REBUILD_KIND}, ${owner.id}, ${owner.id}, 0, 'queued', 'bulk', 'none')`);
  await db.run(sql`insert into workload_schedules (id, owner_id, kind, mode, cadence, next_run_at) values
    (${ids.typeId(ID_PREFIX.workloadSchedule)}, ${owner.id}, ${REBUILD_KIND}, 'bulk', 'weekly', 1000)`);
  // The single-active bulk lock survived the table rebuild: a second active run of the kind is refused.
  await expect(
    db.run(sql`insert into workloads (id, kind, owner_id, funder_user_id, admission_system, status, mode, admission_key) values
      (${ids.typeId(ID_PREFIX.workload)}, ${REBUILD_KIND}, ${owner.id}, ${owner.id}, 0, 'running', 'bulk', 'none')`),
  ).rejects.toSatisfy((error) => isConstraintViolation(error)?.kind === "unique");
  await expect(db.run(sql`insert into workloads (id, kind, mode) values (${ids.typeId(ID_PREFIX.workload)}, 'not-a-kind', 'bulk')`)).rejects.toSatisfy(
    (error) => isConstraintViolation(error)?.kind === "check",
  );
});
