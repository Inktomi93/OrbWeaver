// The spend ledger's backup reads and restore writes. A restore never updates or deletes a row: it adds an entry only
// while the owner holds fewer entries with the same facts (kind, cost, clock) than the file carries, so a re-upload,
// or a restore onto the box that wrote the file, adds nothing.

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

export async function readOwnedSpendLedger(db: Db, ownerId: UserId): Promise<PortableSpendLedger> {
  const entries = await db
    .select({ kind: spendLedger.kind, costUsd: spendLedger.costUsd, createdAt: spendLedger.createdAt })
    .from(spendLedger)
    .where(eq(spendLedger.ownerId, ownerId))
    .orderBy(asc(spendLedger.createdAt), asc(spendLedger.id));
  return { entries };
}

function factKey(entry: LedgerEntry): string {
  return JSON.stringify([entry.kind, entry.costUsd, entry.createdAt]);
}

/** Restore the entries the owner lacks. Returns how many rows the restore added. */
export async function writeImportedSpendLedger(db: Db, ownerId: UserId, ledger: PortableSpendLedger, idSource: IdSource): Promise<number> {
  const held = new Map<string, number>();
  for (const entry of (await readOwnedSpendLedger(db, ownerId)).entries) {
    held.set(factKey(entry), (held.get(factKey(entry)) ?? 0) + 1);
  }
  // The nth carried copy of a fact lands only while fewer than n are held, so two equal passes in one file both land.
  const seen = new Map<string, number>();
  const missing: LedgerEntry[] = [];
  for (const entry of ledger.entries) {
    const key = factKey(entry);
    const nth = (seen.get(key) ?? 0) + 1;
    seen.set(key, nth);
    if (nth > (held.get(key) ?? 0)) {
      missing.push(entry);
    }
  }
  if (missing.length === 0) {
    return 0;
  }
  const stmts: BatchStmt[] = missing.map((entry) =>
    db
      .insert(spendLedger)
      .values({ id: idSource.typeId(ID_PREFIX.spendLedger), ownerId, kind: entry.kind, costUsd: entry.costUsd, createdAt: entry.createdAt }),
  );
  bumpStatsCanonVersion(stmts, db, ownerId);
  await db.batch(batchMany(stmts));
  return missing.length;
}
