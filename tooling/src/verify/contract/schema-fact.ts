// Verify consumes canonical floor schema data and owns the receipt that authorizes policy judgment.

import type { ReadySchemaFact, SchemaFact } from "../../floor/code-facts/schema-model-contract.ts";
import type { GatePolicyContext } from "./policy.ts";

export type {
  ReadySchemaFact,
  SchemaColumn,
  SchemaColumnIdentity,
  SchemaFact,
  SchemaFactStatus,
  SchemaForeignKey,
  SchemaModel,
  SchemaQuery,
  SchemaTable,
} from "../../floor/code-facts/schema-model-contract.ts";

/** Consumer-side proof that the shared schema denominator was complete before a policy judged it. */
export function recordReadySchemaFact<T>(context: GatePolicyContext, fact: SchemaFact<T>): asserts fact is ReadySchemaFact<T> {
  if (fact.status !== "ready") {
    throw new Error(`drizzle schema fact ${fact.status}: ${fact.reason}`);
  }
  context.receipt({ kind: "population", source: fact.receipt.source, members: fact.receipt.members });
}
