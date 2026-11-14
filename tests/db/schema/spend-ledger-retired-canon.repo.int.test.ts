// The retired-canon migration rebuilds the ledger table: every row of the earlier kinds keeps its id, owner, kind,
// cost and time, and arrives with no model, no provider and not notional; the rebuilt table then admits retired canon.
// @subject packages/db/src/schema/stats.ts
// @subject packages/db/src/migrations/0015_spend-ledger-retired-canon.sql
import { RETIRED_CANON_KIND, SPEND_LEDGER_KINDS } from "@orb/contracts/stats";
import { assertReferentialIntegrity, createDb, runMigrations, spendLedger } from "@orb/db";
import { isConstraintViolation } from "@orb/db/query";
import { createIdSource, ID_PREFIX } from "@orb/kit/ids";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { migrationsBefore, ownDb, SHIPPED_MIGRATIONS } from "@orb/testkit/node/composed";
import { seedUser } from "@orb/testkit/node/rows";
import { sql } from "drizzle-orm";

const RETIRED_CANON_MIGRATION = "0015_spend-ledger-retired-canon";
const EARLIER_KINDS = SPEND_LEDGER_KINDS.filter((kind) => kind !== RETIRED_CANON_KIND);

test("the retired-canon migration keeps every earlier ledger row as it was, with no model, provider or notional flag", async () => {
  await using previousChain = await migrationsBefore(RETIRED_CANON_MIGRATION);
  using opened = ownDb(await createDb(":memory:"));
  const db = opened.db;
  await runMigrations(db, previousChain.path);
  const ids = createIdSource(createSeededIds().next);
  const owner = await seedUser(db, {}, ids);
  const stored = EARLIER_KINDS.map((kind, index) => ({
    id: ids.typeId(ID_PREFIX.spendLedger),
    ownerId: owner.id,
    kind,
    costUsd: 0.25 * (index + 1),
    createdAt: 1000 * (index + 1),
  }));
  for (const row of stored) {
    await db.run(sql`insert into spend_ledger (id, owner_id, kind, cost_usd, created_at)
      values (${row.id}, ${row.ownerId}, ${row.kind}, ${row.costUsd}, ${row.createdAt})`);
  }
  // Control: the earlier table refuses the new kind, so the CHECK below was widened by this migration.
  await expect(
    db.run(sql`insert into spend_ledger (id, owner_id, kind, cost_usd, created_at)
      values (${ids.typeId(ID_PREFIX.spendLedger)}, ${owner.id}, ${RETIRED_CANON_KIND}, 1, 5000)`),
  ).rejects.toSatisfy((error) => isConstraintViolation(error)?.kind === "check");

  await runMigrations(db, SHIPPED_MIGRATIONS);

  await expect(assertReferentialIntegrity(db)).resolves.toBeUndefined();
  expect(await db.select().from(spendLedger).orderBy(spendLedger.createdAt)).toEqual(
    stored.map((row) => ({ ...row, model: null, provider: null, notional: false })),
  );
  await db.insert(spendLedger).values({ id: ids.typeId(ID_PREFIX.spendLedger), ownerId: owner.id, kind: RETIRED_CANON_KIND, costUsd: 1, createdAt: 5000 });
  expect(await db.select().from(spendLedger)).toHaveLength(stored.length + 1);
});
