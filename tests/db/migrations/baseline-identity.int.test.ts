// The baseline migration is never regenerated (.claude/rules/db.md). Every install recorded its identity, drizzle's
// sha256 of the SQL text and the journal's `when`, and boot refuses a database whose record no shipped migration holds.
// The pin below is that recorded identity, so a regenerated or edited baseline fails here before it reaches an install.
// A new schema change adds a numbered migration after it and leaves the baseline row, and this pin, as they are.
// @subject packages/db/src/migrations/0000_baseline.sql
// @subject packages/db/src/client/index.ts

import { createDb, runMigrations } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { ownDb, SHIPPED_MIGRATIONS } from "@orb/testkit/node/composed";
import { sql } from "drizzle-orm";
import { z } from "zod";

const BASELINE_IDENTITY = {
  hash: "524db22323a534dd432e27cc7a11a72a25121318ea0232464bd48e838fa3b501",
  createdAt: 1_791_273_010_540,
} as const;
const appliedRowSchema = z.object({ hash: z.string(), ["created_at"]: z.coerce.number() });

/** The identity the migrator records for each applied migration, oldest first. */
async function recordedIdentities(chainDir: string): Promise<readonly { readonly hash: string; readonly createdAt: number }[]> {
  using owned = ownDb(await createDb(":memory:"));
  await runMigrations(owned.db, chainDir);
  const rows = await owned.db.all(sql`SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at`);
  return rows.map((row) => {
    const parsed = appliedRowSchema.parse(row);
    return { hash: parsed.hash, createdAt: parsed["created_at"] };
  });
}

test("the shipped chain records first the baseline identity every install holds", async () => {
  const [baseline] = await recordedIdentities(SHIPPED_MIGRATIONS);

  expect(baseline).toEqual(BASELINE_IDENTITY);
});
