// Projection replay carries native observations and canonical declaration anchors, never checker objects.
import type { Node } from "ts-morph";
import type { InventoryTypeProjection } from "./projection-inventory-contract.ts";
import { replayReferenceFact, wireReferenceFact } from "./projection-reference-codec.ts";
import type { InventorySpan } from "./semantic-inventory-contract.ts";
import { typeProjectionWireSchema } from "./semantic-inventory-contract.ts";
import { encodeTypeOriginProjection, replayTypeOriginProjection } from "./type-origin-projection-codec.ts";
import type { NativeTypeProjection, TypeProjectionPlan } from "./type-projection-contract.ts";
import { assertTypeProjectionCoverage, canonicalTypeProjectionPlan } from "./type-projection-contract.ts";

/** Exact facet coverage is checked before encoding; null and false remain delivered native answers. */
export function encodeTypeProjection(facts: NativeTypeProjection, input: TypeProjectionPlan, span: (node: Node) => InventorySpan): InventoryTypeProjection {
  const plan = canonicalTypeProjectionPlan(input);
  assertTypeProjectionCoverage(facts, plan);
  const identity = facts["type-identity"];
  const symbol = facts["type-symbol"];
  return typeProjectionWireSchema.parse({
    plan,
    values: {
      ...(facts["declaration-export"] === undefined ? {} : { "declaration-export": facts["declaration-export"] }),
      ...(facts.origins === undefined ? {} : { origins: encodeTypeOriginProjection(facts.origins, span) }),
      ...(facts["runtime-undefined"] === undefined ? {} : { "runtime-undefined": facts["runtime-undefined"] }),
      ...(facts["string-index"] === undefined ? {} : { "string-index": facts["string-index"] }),
      ...(facts.properties === undefined ? {} : { properties: facts.properties }),
      ...(facts["call-signatures"] === undefined ? {} : { "call-signatures": facts["call-signatures"] }),
      ...(facts.scalar === undefined ? {} : { scalar: facts.scalar }),
      ...(identity === undefined
        ? {}
        : {
            "type-identity": wireReferenceFact(identity, (value) => ({ ...value, node: span(value.node), declarations: value.declarations.map(span) }), span),
          }),
      ...(symbol === undefined ? {} : { "type-symbol": symbol === null ? null : symbol.map(span) }),
    },
  });
}

/** Guarded replay cannot turn missing facet/property coverage into a negative observation. */
export function replayTypeProjection(wire: InventoryTypeProjection, input: TypeProjectionPlan, replay: (span: InventorySpan) => Node): NativeTypeProjection {
  const parsed = typeProjectionWireSchema.parse(wire);
  const plan = canonicalTypeProjectionPlan(input);
  if (JSON.stringify(canonicalTypeProjectionPlan(parsed.plan)) !== JSON.stringify(plan)) {
    throw new Error("native type projection has foreign demand coverage");
  }
  const { values } = parsed;
  const identity = values["type-identity"];
  const symbol = values["type-symbol"];
  const facts: NativeTypeProjection = {
    ...(values["declaration-export"] === undefined ? {} : { "declaration-export": values["declaration-export"] }),
    ...(values.origins === undefined ? {} : { origins: replayTypeOriginProjection(values.origins, replay) }),
    ...(values["runtime-undefined"] === undefined ? {} : { "runtime-undefined": values["runtime-undefined"] }),
    ...(values["string-index"] === undefined ? {} : { "string-index": values["string-index"] }),
    ...(values.properties === undefined ? {} : { properties: values.properties }),
    ...(values["call-signatures"] === undefined ? {} : { "call-signatures": values["call-signatures"] }),
    ...(values.scalar === undefined ? {} : { scalar: values.scalar }),
    ...(identity === undefined
      ? {}
      : {
          "type-identity": replayReferenceFact(
            identity,
            (value) => ({ ...value, node: replay(value.node), declarations: value.declarations.map(replay) }),
            replay,
          ),
        }),
    ...(symbol === undefined ? {} : { "type-symbol": symbol === null ? null : symbol.map(replay) }),
  };
  assertTypeProjectionCoverage(facts, plan);
  return facts;
}
