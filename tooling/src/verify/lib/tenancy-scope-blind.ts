// The shared blind-derivation arm for the three owner-scoped-* gates, extracted from tenancy-scope.ts.
import type { GatePolicyContext } from "../contract/policy.ts";
import type { ReadySchemaFact, SchemaModel } from "../contract/schema-fact.ts";

const SCHEMA_BARREL = "packages/db/src/schema/index.ts";

/** The shared "blind derivation" arm all three owner-scoped-* gates carry: an empty (a)-class set means the
 *  schema shape or the registry moved and the gate now matches nothing, which would otherwise report ✓
 *  forever. Guarded on the real schema barrel actually being in the loaded population, exactly like
 *  `own-tables-only`'s real-tree anchor — a conformance mini-project carries neither the full schema nor the
 *  full server tree, and would "prove" the derivation blind. */
export function reportBlindWhenEmpty(
  ctx: GatePolicyContext,
  schemaFact: ReadySchemaFact<SchemaModel>,
  ownerTableIdents: ReadonlySet<string>,
  message: string,
): void {
  if (!schemaFact.receipt.paths.includes(SCHEMA_BARREL) || ownerTableIdents.size > 0) {
    return;
  }
  const anchor = ctx.files[0];
  if (anchor === undefined) {
    throw new Error("owner-scoped gate received an empty effective population");
  }
  ctx.report.file(ctx.relativePath(anchor), { message });
}
