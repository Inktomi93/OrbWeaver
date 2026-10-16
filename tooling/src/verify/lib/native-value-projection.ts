// Policies/providers register finite data demands during dispatch and read only their sealed native answers.
import type { Node } from "ts-morph";
import type { NativeAuthoredValueProjection } from "../../floor/code-facts/authored-value-projection.ts";
import type { IndexedCallParameters } from "../../floor/code-facts/drizzle-column-read-contract.ts";
import type { DrizzleWrite } from "../../floor/code-facts/drizzle-columns.ts";
import type { InventoryInvocationPlan } from "../../floor/code-facts/semantic-inventory-contract.ts";
import type { NativeTypeProjection, TypeProjectionPlan } from "../../floor/code-facts/type-projection-contract.ts";
import { canonicalTypeProjectionPlan, typeProjectionFacet } from "../../floor/code-facts/type-projection-contract.ts";
import type { NativeColumnObservation, ProjectedStoredValueShape, ValueObservationFacet } from "../../floor/code-facts/value-observation-contract.ts";
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

const COLUMN_ROW_PLAN: InventoryInvocationPlan = {
  mode: "value",
  facets: ["row-column", "type-projection"],
  arguments: [],
  typeProjection: { facets: ["vocabulary"], properties: [] },
};
type ObservationFacet = Exclude<ValueObservationFacet, "row-column">;
function observationPlan(facet: ObservationFacet): InventoryInvocationPlan {
  return { mode: "value", facets: [facet], arguments: [] };
}
/** Register the exact canonical observation rather than evaluating syntax-carrier meaning. */
export function prepareNativeValueObservation(ctx: ProjectionContext, node: Node, facet: ObservationFacet): void {
  native(ctx).request({ kind: "invocation-evidence", nodes: [node], plan: observationPlan(facet) });
}
/** Column vocabulary and canonical row occurrence are captured under one exact native query. */
export function prepareNativeColumnRow(ctx: ProjectionContext, node: Node): void {
  native(ctx).request({ kind: "invocation-evidence", nodes: [node], plan: COLUMN_ROW_PLAN });
}
/** Native semantic refusal is data until the consumer reaches its original row-provenance branch. */
export function nativeColumnRow(ctx: ProjectionContext, node: Node): NativeColumnObservation {
  const evidence = requiredInvocationFact(native(ctx).invocationEvidence([node], COLUMN_ROW_PLAN), node);
  return {
    vocabulary: typeProjectionFacet(requiredInvocationFact(evidence.typeProjections, node), "vocabulary"),
    origin: requiredInvocationFact(evidence.columnRows, node),
  };
}
/** Full stored-value tree, with no policy hop reduction in the native producer. */
export function nativeStoredValue(ctx: ProjectionContext, node: Node): ProjectedStoredValueShape {
  const evidence = requiredInvocationFact(native(ctx).invocationEvidence([node], observationPlan("stored-value")), node);
  return requiredInvocationFact(evidence.storedValues, node);
}
/** Legitimate non-write absence and canonical unresolved write facts remain distinct. */
export function nativeDrizzleWrite(
  ctx: ProjectionContext,
  node: Node,
): import("../../floor/code-facts/reference-fact-contract.ts").ReferenceFact<DrizzleWrite | null> {
  const evidence = requiredInvocationFact(native(ctx).invocationEvidence([node], observationPlan("drizzle-write")), node);
  return requiredInvocationFact(evidence.drizzleWrites, node);
}
/** Arbitrary formal indices and helper-body indexing nodes retain native binding identity. */
export function nativeIndexedParameters(ctx: ProjectionContext, node: Node): readonly IndexedCallParameters[] {
  const evidence = requiredInvocationFact(native(ctx).invocationEvidence([node], observationPlan("indexed-parameters")), node);
  return requiredInvocationFact(evidence.indexedParameters, node);
}
