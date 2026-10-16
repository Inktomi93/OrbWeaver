// Role comparisons nominate syntax first; strings, computed names and axes retain one native snapshot.
import type { BinaryExpression, Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import type { InventoryInvocationPlan } from "../../floor/code-facts/semantic-inventory-contract.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import type { RoleComparisonServices } from "../contract/role-vocabulary.ts";
import { prepareFiniteTypeObservation } from "./finite-type-observations.ts";
import { requiredInvocationFact } from "./native-invocation.ts";

const STRING_PLAN: InventoryInvocationPlan = { mode: "value", facets: ["string"], arguments: [] };
type Context = Pick<GatePolicyContext, "nativeTypes">;

/** Additional field keys keep computed authority sinks inside the same prepared comparison. */
export function prepareNativeRoleComparison(ctx: Context, node: BinaryExpression, keys: readonly MorphNode[] = []): void {
  const native = ctx.nativeTypes;
  if (native === undefined) {
    throw new Error("native role comparison context is unavailable");
  }
  const operands = [node.getLeft(), node.getRight()];
  for (const operand of operands) {
    prepareFiniteTypeObservation(ctx, operand, "node-types");
  }
  const strings = [...operands, ...keys.map((key) => (Node.isComputedPropertyName(key) ? key.getExpression() : key))];
  native.request({ kind: "invocation-evidence", nodes: strings, plan: STRING_PLAN });
  const computed = strings.flatMap((value) => (Node.isElementAccessExpression(value) ? (value.getArgumentExpression() ?? []) : []));
  if (computed.length > 0) {
    native.request({ kind: "computed-names", nodes: computed });
  }
}

/** No missing name or scalar answer can fall back to the ordinary binding resolver. */
export function nativeRoleComparisonServices(ctx: Context): RoleComparisonServices {
  const native = ctx.nativeTypes;
  if (native === undefined) {
    throw new Error("native role comparison context is unavailable");
  }
  return {
    string: (node) => requiredInvocationFact(requiredInvocationFact(native.invocationEvidence([node], STRING_PLAN), node).strings, node),
    computedName: (node) => requiredInvocationFact(native.computedNames([node]), node),
  };
}
