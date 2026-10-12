// Readers for the stage identity a bound run persists (the band table's db provenance, a session row's
// bound stage): field-by-field, null on anything off-grammar. One grammar for the table and the session row.
import type { StageBoundIdentity, StageDbProvenance } from "../contract/stage.ts";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The `--stage-db` clone flag rides with the other fields: a reader that drops it turns a clone into a
 *  dev-db copy. */
export function parseStageDbProvenance(value: unknown): StageDbProvenance | null {
  if (!isRecord(value)) {
    return null;
  }
  const { copiedFrom, copiedAt, devDbMtimeAtCopy, cloned } = value;
  if (!(typeof copiedFrom === "string" && typeof copiedAt === "string" && typeof devDbMtimeAtCopy === "string")) {
    return null;
  }
  return { copiedFrom, copiedAt, devDbMtimeAtCopy, ...(cloned === true ? { cloned } : {}) };
}

export function parseStageBoundIdentity(value: unknown): StageBoundIdentity | null {
  if (!isRecord(value)) {
    return null;
  }
  const { sha, dir, startedAt, dbProvenance } = value;
  if (typeof sha !== "string" || typeof dir !== "string" || typeof startedAt !== "string") {
    return null;
  }
  const provenance = dbProvenance === null ? null : parseStageDbProvenance(dbProvenance);
  return dbProvenance !== null && provenance === null ? null : { sha, dir, startedAt, dbProvenance: provenance };
}
