import { canFund } from "@orb/contracts/inference";
import { schemaPlanReasonOf } from "@orb/contracts/refinery";
import { NoConnectionError, structuredFitFor } from "@orb/inference";
import type { ResolveStructuredBinding, SchemaPlanDeps, StructuredBindingDeps } from "../contract/planning.ts";
import type { RefineryContext } from "../contract/service.ts";

/** The owner's bound `structured` row as the resolver folds it, before the background-work check. It reads only the
 *  server facts already cached: the editor asks on every settled draft, and a dead endpoint must not be dialed each time. */
export function createResolveStructuredBinding(deps: StructuredBindingDeps): ResolveStructuredBinding {
  return async (ownerId) => {
    try {
      return (await deps.resolve({ task: "structured", principal: await deps.principalOf(ownerId), cachedFacts: true })).resolved;
    } catch (error) {
      if (error instanceof NoConnectionError) {
        return null;
      }
      throw error;
    }
  };
}

/** The refinery editor's plan preview: every refinery pass is `structured` background work on the owner's own
 *  binding, so that connection's consent and its plan for the projected draft are the answer. */
export function createPlanSchema(deps: SchemaPlanDeps): RefineryContext["planSchema"] {
  return async (ownerId, schema) => {
    const connection = await deps.resolveStructuredBinding(ownerId);
    if (connection === null) {
      return { outcome: "unbound" };
    }
    if (!canFund(connection, "structured")) {
      return { outcome: "background-refused", model: connection.model };
    }
    const params = await deps.resolveUtilityPresetParams(ownerId);
    const preview = structuredFitFor(connection, { name: "refinery_schema_preview", schema }, params ?? {});
    if (preview.ok) {
      return { outcome: "sends", model: connection.model, carrier: preview.native ? "native" : "tool" };
    }
    // No vehicle is a fact about the model, not the schema, so the author is not sent to rewrite the shape.
    if (preview.violations.some((violation) => violation.kind === "no-vehicle")) {
      return { outcome: "no-structured", model: connection.model };
    }
    return { outcome: "refused", model: connection.model, reasons: preview.violations.map(schemaPlanReasonOf) };
  };
}
