// domain/refinery/substrate/schema-library — the library-hygiene helpers the schema CRUD verbs share
// (one verb per file; the shared belt lives here, never sideways in a verb). S5 (the OG registry-hygiene
// scar): per-owner CASE-INSENSITIVE name uniqueness — a "MyScorer"/"myscorer" pair is one schema wearing
// two spellings.

import { refinerySchemas } from "@orb/db";
import { DomainOperationError } from "@orb/kit/errors";
import type { RefinerySchemaId, UserId } from "@orb/kit/ids";
import { and, eq, ne } from "drizzle-orm";
import type { RefineryContext } from "../context.ts";

/** The coded refusal for a per-owner duplicate name (the client reads it off the BAD_REQUEST body). */
export const SCHEMA_NAME_TAKEN_REASON = "refinery_schema_name_taken";

export async function assertSchemaNameFree(ctx: RefineryContext, ownerId: UserId, name: string, exceptId?: RefinerySchemaId): Promise<void> {
  const rows = await ctx.db
    .select({ id: refinerySchemas.id, name: refinerySchemas.name })
    .from(refinerySchemas)
    .where(exceptId === undefined ? eq(refinerySchemas.ownerId, ownerId) : and(eq(refinerySchemas.ownerId, ownerId), ne(refinerySchemas.id, exceptId)));
  const wanted = name.toLowerCase();
  if (rows.some((r) => r.name.toLowerCase() === wanted)) {
    throw new DomainOperationError(SCHEMA_NAME_TAKEN_REASON, `You already have a schema named "${name}" — names are unique per library (case-insensitive).`);
  }
}
