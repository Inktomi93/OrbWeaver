// The spend ledger's backup reads and restore writes. A restore never updates or deletes a row: it adds an entry only
// while the owner holds fewer entries with the same facts (kind, cost, clock, and a retired row's model, provider and
// notional flag) than the file carries, so a re-upload, or a restore onto the box that wrote the file, adds nothing.

import type { PortableSpendLedger } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import { spendLedger } from "@orb/db";
import type { BatchStmt } from "@orb/db/query";
import { batchMany } from "@orb/db/query";
import type { IdSource, UserId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { asc, eq } from "drizzle-orm";
import { bumpStatsCanonVersion } from "../write/apply-delta.ts";

type LedgerEntry = PortableSpendLedger["entries"][number];
type LedgerFacts = Omit<typeof spendLedger.$inferSelect, "id" | "ownerId">;

export async function readOwnedSpendLedger(db: Db, ownerId: UserId): Promise<PortableSpendLedger> {
  const entries = await db
    .select({
      kind: spendLedger.kind,
      costUsd: spendLedger.costUsd,
      createdAt: spendLedger.createdAt,
      model: spendLedger.model,
      provider: spendLedger.provider,
      notional: spendLedger.notional,
    })
    .from(spendLedger)
    .where(eq(spendLedger.ownerId, ownerId))
    .orderBy(asc(spendLedger.createdAt), asc(spendLedger.id));
  return { entries };
}

// A file written before retired canon existed omits the three columns; they read as the column defaults. A provider
// without a model is never stored, matching the retirement writer.
function factsOf(entry: LedgerEntry): LedgerFacts {
  const model = entry.model ?? null;
  return {
    kind: entry.kind,
    costUsd: entry.costUsd,
    createdAt: entry.createdAt,
    model,
    provider: model === null ? null : (entry.provider ?? null),
    notional: entry.notional ?? false,
  };
}

function factKey(facts: LedgerFacts): string {
  return JSON.stringify([facts.kind, facts.costUsd, facts.createdAt, facts.model, facts.provider, facts.notional]);
}

/** Restore the entries the owner lacks. Returns how many rows the restore added. */
export async function writeImportedSpendLedger(db: Db, ownerId: UserId, ledger: PortableSpendLedger, idSource: IdSource): Promise<number> {
  const held = new Map<string, number>();
  for (const entry of (await readOwnedSpendLedger(db, ownerId)).entries) {
    const key = factKey(factsOf(entry));
    held.set(key, (held.get(key) ?? 0) + 1);
  }
  // The nth carried copy of a fact lands only while fewer than n are held, so two equal passes in one file both land.
  const seen = new Map<string, number>();
  const missing: LedgerFacts[] = [];
  for (const entry of ledger.entries) {
    const facts = factsOf(entry);
    const key = factKey(facts);
    const nth = (seen.get(key) ?? 0) + 1;
    seen.set(key, nth);
    if (nth > (held.get(key) ?? 0)) {
      missing.push(facts);
    }
  }
  if (missing.length === 0) {
    return 0;
  }
  const stmts: BatchStmt[] = missing.map((facts) => db.insert(spendLedger).values({ id: idSource.typeId(ID_PREFIX.spendLedger), ownerId, ...facts }));
  bumpStatsCanonVersion(stmts, db, ownerId);
  await db.batch(batchMany(stmts));
  return missing.length;
}
