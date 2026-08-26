// domain/refinery/substrate/schema-library — the library-hygiene helpers the schema CRUD verbs share
// (one verb per file; the shared belt lives here, never sideways in a verb). S5 (the OG registry-hygiene
// scar): per-owner CASE-INSENSITIVE name uniqueness — a "MyScorer"/"myscorer" pair is one schema wearing
// two spellings.

import { DomainOperationError } from "@orb/kit/errors";

/** The coded refusal for a per-owner duplicate name (the client reads it off the BAD_REQUEST body). */
export const SCHEMA_NAME_TAKEN_REASON = "refinery_schema_name_taken";

export function schemaNameTakenError(name: string): DomainOperationError {
  return new DomainOperationError(SCHEMA_NAME_TAKEN_REASON, `You already have a schema named "${name}" — names are unique per library (case-insensitive).`);
}
