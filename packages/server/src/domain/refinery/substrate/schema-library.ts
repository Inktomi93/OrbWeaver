// domain/refinery/substrate/schema-library — the library-hygiene helpers the schema CRUD verbs share
// (one verb per file; the shared belt lives here, never sideways in a verb). S5 (the OG registry-hygiene
// scar): per-owner CASE-INSENSITIVE name uniqueness — a "MyScorer"/"myscorer" pair is one schema wearing
// two spellings.

import type { RefinerySchemaDocument } from "@orb/contracts/refinery";
import { refinerySchemaDocumentSchema } from "@orb/contracts/refinery";
import { DomainOperationError } from "@orb/kit/errors";

/** The coded refusal for a per-owner duplicate name (the client reads it off the BAD_REQUEST body). */
const SCHEMA_NAME_TAKEN_REASON = "refinery_schema_name_taken";

export function schemaNameTakenError(name: string): DomainOperationError {
  return new DomainOperationError(SCHEMA_NAME_TAKEN_REASON, `You already have a schema named "${name}" — names are unique per library (case-insensitive).`);
}

/** The coded refusal for a patch written from a STALE read: the row moved between this caller's
 *  load and its write, so applying the merged document would silently drop the other writer's fields. */
const SCHEMA_STALE_PATCH_REASON = "refinery_schema_stale_patch";

export function schemaStalePatchError(): DomainOperationError {
  return new DomainOperationError(
    SCHEMA_STALE_PATCH_REASON,
    "This schema changed while you were editing it — reload it and re-apply your change so the other edit is not lost.",
  );
}

/** The coded refusal for a document the authoring belt refuses; its message holds one sentence per line. */
const SCHEMA_REFUSED_REASON = "refinery_schema_refused";

/** Run the authoring belt over a whole document. A refusal is a typed answer, one sentence per issue, never an
 *  unclassified fault. */
export function parseSchemaDocument(raw: unknown): RefinerySchemaDocument {
  const parsed = refinerySchemaDocumentSchema.safeParse(raw);
  if (!parsed.success) {
    throw new DomainOperationError(SCHEMA_REFUSED_REASON, parsed.error.issues.map((issue) => issue.message).join("\n"));
  }
  return parsed.data;
}
