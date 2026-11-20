// The spend-ledger migration carries every compaction pass over as a `compaction` row under its stored id, and the
// ledger then admits each kind of the contracts tuple and refuses any other.
// @subject packages/db/src/schema/stats.ts
// @subject packages/db/src/migrations/0012_spend-ledger.sql
import { SPEND_LEDGER_KINDS } from "@orb/contracts/stats";
import { assertReferentialIntegrity, createDb, runMigrations, spendLedger } from "@orb/db";
import { isConstraintViolation } from "@orb/db/query";
import { createIdSource, ID_PREFIX } from "@orb/kit/ids";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { migrationsBefore, ownDb, SHIPPED_MIGRATIONS } from "@orb/testkit/node/composed";
import { seedUser } from "@orb/testkit/node/rows";
import { sql } from "drizzle-orm";

const SPEND_LEDGER_MIGRATION = "0012_spend-ledger";

test("the spend-ledger migration keeps every compaction pass as a compaction row under its id, and the ledger admits only its kinds", async () => {
  await using previousChain = await migrationsBefore(SPEND_LEDGER_MIGRATION);
  using opened = ownDb(await createDb(":memory:"));
  const db = opened.db;
  await runMigrations(db, previousChain.path);
  const ids = createIdSource(createSeededIds().next);
  const owner = await seedUser(db, {}, ids);
  // Rows the compaction ledger held carry its own id prefix.
  const [first, second] = [ids.typeId(ID_PREFIX.spendLedger), ids.typeId(ID_PREFIX.spendLedger)].map((id) => id.replace("spend_ledger_", "compaction_spend_"));
  await db.run(sql`insert into compaction_spend (id, owner_id, cost_usd, created_at) values
    (${first}, ${owner.id}, 0.25, 1000),
    (${second}, ${owner.id}, 0.5, 2000)`);

  await runMigrations(db, SHIPPED_MIGRATIONS);

  await expect(assertReferentialIntegrity(db)).resolves.toBeUndefined();
  expect(await db.select().from(spendLedger).orderBy(spendLedger.createdAt)).toEqual([
    { id: first, ownerId: owner.id, kind: "compaction", costUsd: 0.25, createdAt: 1000, model: null, provider: null, notional: false },
    { id: second, ownerId: owner.id, kind: "compaction", costUsd: 0.5, createdAt: 2000, model: null, provider: null, notional: false },
  ]);
  for (const kind of SPEND_LEDGER_KINDS) {
    await db.insert(spendLedger).values({ id: ids.typeId(ID_PREFIX.spendLedger), ownerId: owner.id, kind, costUsd: 1, createdAt: 3000 });
  }
  await expect(
    db.run(
      sql`insert into spend_ledger (id, owner_id, kind, cost_usd, created_at) values (${ids.typeId(ID_PREFIX.spendLedger)}, ${owner.id}, 'not-a-kind', 1, 4000)`,
    ),
  ).rejects.toSatisfy((error) => isConstraintViolation(error)?.kind === "check");
});
