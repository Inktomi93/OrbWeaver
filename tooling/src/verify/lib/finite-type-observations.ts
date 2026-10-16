// Exact scalar questions stay with the importing native owner, never the syntax carrier's checker.
import type { Node } from "ts-morph";
import type { InventoryInvocationPlan } from "../../floor/code-facts/semantic-inventory-contract.ts";
import { mapTypeObservationDemand } from "../../floor/code-facts/type-observations-codec.ts";
import type { TypeObservationReader } from "../../floor/code-facts/type-observations-contract.ts";
import { TYPE_OBSERVATION_PROFILE } from "../../floor/code-facts/type-observations-contract.ts";
import { readTypeObservations } from "../../floor/code-facts/type-observations-read.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import { requiredInvocationFact } from "./native-invocation.ts";

const FINITE_TYPE_QUESTIONS = ["node-types", "type-details", "function-exports"] as const;
type Question = (typeof FINITE_TYPE_QUESTIONS)[number];
type Context = Pick<GatePolicyContext, "nativeTypes">;

function plan(node: Node, kind: Question): InventoryInvocationPlan {
  return {
    mode: "types",
    facets: [],
    arguments: [],
    typeObservations: mapTypeObservationDemand(
      { profile: TYPE_OBSERVATION_PROFILE, sources: [node.getSourceFile()], nodes: [], questions: [{ kind, nodes: [node] }] },
      (value) => ({ file: value.getSourceFile().getFilePath().replaceAll("\\", "/"), start: value.getStart(), end: value.getEnd(), kind: value.getKind() }),
    ),
  };
}

/** Nominate only exact role values or factory parameters before the shared native ledger seals. */
export function prepareFiniteTypeObservation(ctx: Context, node: Node, kind: Question): void {
  if (ctx.nativeTypes === undefined) {
    throw new Error("native finite type observations are unavailable");
  }
  ctx.nativeTypes.request({ kind: "invocation-evidence", nodes: [node.getSourceFile()], plan: plan(node, kind) });
}

/** Missing coverage refuses rather than asking the ordinary source for another interpretation. */
export function finiteTypeObservation(ctx: Context, node: Node, kind: Question): TypeObservationReader {
  if (ctx.nativeTypes === undefined) {
    throw new Error("native finite type observations are unavailable");
  }
  const source = node.getSourceFile();
  const evidence = requiredInvocationFact(ctx.nativeTypes.invocationEvidence([source], plan(node, kind)), source);
  if (evidence.typeObservations === undefined) {
    throw new Error("native finite type observations are missing");
  }
  return readTypeObservations(evidence.typeObservations);
}
