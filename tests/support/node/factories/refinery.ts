// Refinery owns the card anchor, schema save belt and manual-run provenance; capture its real rows.
import type { Db } from "@orb/db";
import { refineryRuns, refinerySchemas, refinerySessions } from "@orb/db";
import type { RefineryService } from "@orb/server/domain/refinery";
import { eq } from "drizzle-orm";

export type RefinerySessionRow = typeof refinerySessions.$inferSelect;
export type RefinerySchemaRow = typeof refinerySchemas.$inferSelect;
export type RefineryRunRow = typeof refineryRuns.$inferSelect;

export async function seedRefinerySession(
  db: Db,
  startSession: RefineryService["startSession"],
  params: Parameters<RefineryService["startSession"]>[0],
): Promise<RefinerySessionRow> {
  const view = await startSession(params);
  const row = await db.select().from(refinerySessions).where(eq(refinerySessions.id, view.id)).get();
  if (row === undefined) {
    throw new Error("production refinery session start left no canonical row");
  }
  return row;
}

export async function seedRefinerySchema(
  db: Db,
  createSchema: RefineryService["createSchema"],
  params: Parameters<RefineryService["createSchema"]>[0],
): Promise<RefinerySchemaRow> {
  const view = await createSchema(params);
  const row = await db.select().from(refinerySchemas).where(eq(refinerySchemas.id, view.id)).get();
  if (row === undefined) {
    throw new Error("production refinery schema save left no canonical row");
  }
  return row;
}

/** This is the genuine hand-authored arm, not evidence that a model ran or reported usage. */
export async function seedManualRefineryRun(
  db: Db,
  submitManualRewrite: RefineryService["submitManualRewrite"],
  params: Parameters<RefineryService["submitManualRewrite"]>[0],
): Promise<RefineryRunRow> {
  const view = await submitManualRewrite(params);
  const row = await db.select().from(refineryRuns).where(eq(refineryRuns.id, view.id)).get();
  if (row === undefined) {
    throw new Error("production manual refinery rewrite left no canonical run row");
  }
  return row;
}
