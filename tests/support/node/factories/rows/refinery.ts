// Refinery rows a production run left, read behind the rows door for persistence-tier and corpus captures.

import type { Db } from "@orb/db";
import { refineryRuns, refinerySchemas, refinerySessions } from "@orb/db";
import type { RefineryService } from "@orb/server/domain/refinery";
import { eq } from "drizzle-orm";
import type { ServerProducerRoot } from "../../server.ts";
import type { RefineryRunRow, RefinerySchemaRow, RefinerySessionRow } from "../refinery.ts";

/** Capture a model-produced run by the identity the actual stage operation returned. */
export async function seedRefineryRunRows(root: ServerProducerRoot, params: Parameters<RefineryService["runStage"]>[0]): Promise<RefineryRunRow> {
  const db = root.db;
  const runStage = root.services.refinery.runStage;
  const view = await runStage(params);
  return await captureRefineryRun(db, view.id);
}

export async function seedRefinerySessionRows(root: ServerProducerRoot, params: Parameters<RefineryService["startSession"]>[0]): Promise<RefinerySessionRow> {
  const db = root.db;
  const startSession = root.services.refinery.startSession;
  const view = await startSession(params);
  const row = await db.select().from(refinerySessions).where(eq(refinerySessions.id, view.id)).get();
  if (row === undefined) {
    throw new Error("production refinery session start left no canonical row");
  }
  return row;
}

export async function seedRefinerySchemaRows(root: ServerProducerRoot, params: Parameters<RefineryService["createSchema"]>[0]): Promise<RefinerySchemaRow> {
  const db = root.db;
  const createSchema = root.services.refinery.createSchema;
  const view = await createSchema(params);
  const row = await db.select().from(refinerySchemas).where(eq(refinerySchemas.id, view.id)).get();
  if (row === undefined) {
    throw new Error("production refinery schema save left no canonical row");
  }
  return row;
}

/** This is the genuine hand-authored arm, not evidence that a model ran or reported usage. */
export async function seedManualRefineryRunRows(
  root: ServerProducerRoot,
  params: Parameters<RefineryService["submitManualRewrite"]>[0],
): Promise<RefineryRunRow> {
  const db = root.db;
  const submitManualRewrite = root.services.refinery.submitManualRewrite;
  const view = await submitManualRewrite(params);
  return await captureRefineryRun(db, view.id);
}

async function captureRefineryRun(db: Db, runId: RefineryRunRow["id"]): Promise<RefineryRunRow> {
  const row = await db.select().from(refineryRuns).where(eq(refineryRuns.id, runId)).get();
  if (row === undefined) {
    throw new Error("production refinery operation left no canonical run row");
  }
  return row;
}
