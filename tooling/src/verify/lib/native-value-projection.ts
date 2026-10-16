// Policies/providers register finite data demands during dispatch and read only their sealed native answers.
import type { Node } from "ts-morph";
import type { NativeAuthoredValueProjection } from "../../floor/code-facts/authored-value-projection.ts";
import type { InventoryInvocationPlan } from "../../floor/code-facts/semantic-inventory-contract.ts";
import type { NativeTypeProjection, TypeProjectionPlan } from "../../floor/code-facts/type-projection-contract.ts";
import { canonicalTypeProjectionPlan } from "../../floor/code-facts/type-projection-contract.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import { requiredInvocationFact } from "./native-invocation.ts";

type ProjectionContext = Pick<GatePolicyContext, "nativeTypes">;
const AUTHORED_PLAN: InventoryInvocationPlan = { mode: "value", facets: ["authored-value"], arguments: [] };
function typePlan(plan: TypeProjectionPlan): InventoryInvocationPlan {
  return { mode: "value", facets: ["type-projection"], arguments: [], typeProjection: canonicalTypeProjectionPlan(plan) };
}
function native(ctx: ProjectionContext): NonNullable<ProjectionContext["nativeTypes"]> {
  if (ctx.nativeTypes === undefined) {
    throw new Error("native value projection context is unavailable");
  }
  return ctx.nativeTypes;
}

/** Register exact primitive/origin facets before the shared request ledger seals. */
export function prepareNativeTypeProjection(ctx: ProjectionContext, node: Node, plan: TypeProjectionPlan): void {
  native(ctx).request({ kind: "invocation-evidence", nodes: [node], plan: typePlan(plan) });
}
/** Missing projection coverage is a refusal, not a negative native answer. */
export function nativeTypeProjection(ctx: ProjectionContext, node: Node, plan: TypeProjectionPlan): NativeTypeProjection {
  const evidence = requiredInvocationFact(native(ctx).invocationEvidence([node], typePlan(plan)), node);
  return requiredInvocationFact(evidence.typeProjections, node);
}
/** Registry candidate values require independent field readability and composite provenance. */
export function prepareNativeAuthoredValue(ctx: ProjectionContext, node: Node): void {
  native(ctx).request({ kind: "invocation-evidence", nodes: [node], plan: AUTHORED_PLAN });
}
/** Read the complete captured pair without consulting the ordinary syntax checker. */
export function nativeAuthoredValue(ctx: ProjectionContext, node: Node): NativeAuthoredValueProjection {
  const evidence = requiredInvocationFact(native(ctx).invocationEvidence([node], AUTHORED_PLAN), node);
  return requiredInvocationFact(evidence.authoredValues, node);
}
