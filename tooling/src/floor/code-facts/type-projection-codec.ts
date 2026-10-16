// Projection replay carries native observations and canonical declaration anchors, never checker objects.
import type { Node } from "ts-morph";
import type { InventoryTypeProjection, InventoryTypeSelections } from "./projection-inventory-contract.ts";
import { typeSelectionsSchema } from "./projection-inventory-contract.ts";
import { replayReferenceFact, wireReferenceFact } from "./projection-reference-codec.ts";
import type { InventorySpan } from "./semantic-inventory-contract.ts";
import { spanSchema, typeProjectionWireSchema } from "./semantic-inventory-contract.ts";
import { encodeTypeOriginProjection, replayTypeOriginProjection } from "./type-origin-projection-codec.ts";
import type { NativeTypeProjection, NativeTypeSelectionPlan, NativeTypeSelections, TypeProjectionPlan } from "./type-projection-contract.ts";
import { assertTypeProjectionCoverage, assertTypeSelectionCoverage, canonicalTypeProjectionPlan } from "./type-projection-contract.ts";

function encodeTypeDeclarationProjection(facts: NativeTypeProjection, span: (node: Node) => InventorySpan): InventoryTypeProjection["values"] {
  return {
    ...(facts["member-declarations"] === undefined
      ? {}
      : {
          "member-declarations": facts["member-declarations"].map((member) => ({
            name: member.name,
            origin: wireReferenceFact(member.origin, (nodes) => nodes.map(span), span),
            raw: member.raw?.map(span) ?? null,
            nonnullable: member.nonnullable?.map(span) ?? null,
          })),
        }),
    ...(facts.lexical === undefined
      ? {}
      : {
          lexical: {
            value: wireReferenceFact(facts.lexical.value, span, span),
            declarations: facts.lexical.declarations?.map(span) ?? null,
            origins: facts.lexical.origins?.map(span) ?? null,
          },
        }),
  };
}

function replayTypeDeclarationProjection(values: InventoryTypeProjection["values"], replay: (span: InventorySpan) => Node): NativeTypeProjection {
  return {
    ...(values["member-declarations"] === undefined
      ? {}
      : {
          "member-declarations": values["member-declarations"].map((member) => ({
            name: member.name,
            origin: replayReferenceFact(member.origin, (nodes) => nodes.map(replay), replay),
            raw: member.raw?.map(replay) ?? null,
            nonnullable: member.nonnullable?.map(replay) ?? null,
          })),
        }),
    ...(values.lexical === undefined
      ? {}
      : {
          lexical: {
            value: replayReferenceFact(values.lexical.value, replay, replay),
            declarations: values.lexical.declarations?.map(replay) ?? null,
            origins: values.lexical.origins?.map(replay) ?? null,
          },
        }),
  };
}

/** Exact facet coverage is checked before encoding; null and false remain delivered native answers. */
export function encodeTypeProjection(facts: NativeTypeProjection, input: TypeProjectionPlan, span: (node: Node) => InventorySpan): InventoryTypeProjection {
  const plan = canonicalTypeProjectionPlan(input);
  assertTypeProjectionCoverage(facts, plan);
  const identity = facts["type-identity"];
  const symbol = facts["type-symbol"];
  return typeProjectionWireSchema.parse({
    plan,
    values: {
      ...encodeTypeDeclarationProjection(facts, span),
      ...(facts.vocabulary === undefined ? {} : { vocabulary: facts.vocabulary }),
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
    ...replayTypeDeclarationProjection(values, replay),
    ...(values.vocabulary === undefined ? {} : { vocabulary: values.vocabulary }),
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

/** Preserve exact selector locations while translating native nodes to captured spans and back. */
export function mapTypeSelectionPlan<From, To>(plan: NativeTypeSelectionPlan<From>, anchor: (value: From) => To): NativeTypeSelectionPlan<To> {
  return {
    selectors: plan.selectors.map((selector) => ({
      base: selector.base.kind === "schema-column" ? selector.base : { ...selector.base, node: anchor(selector.base.node) },
      steps: selector.steps.map((step) => (step.kind === "property" || step.kind === "signature-parameter" ? { ...step, at: anchor(step.at) } : step)),
      displayAt: selector.displayAt === null ? null : anchor(selector.displayAt),
    })),
    relations: plan.relations,
  };
}

/** Persist only native answers and source selectors; the supplying session owns compiler freshness. */
export function encodeTypeSelections(facts: NativeTypeSelections, span: (node: Node) => InventorySpan): InventoryTypeSelections {
  assertTypeSelectionCoverage(facts);
  return typeSelectionsSchema(spanSchema).parse({ ...facts, plan: mapTypeSelectionPlan(facts.plan, span) });
}

/** Exact selector coverage precedes replay; no Type is reconstructed from these observations. */
export function replayTypeSelections(
  wire: InventoryTypeSelections,
  plan: NativeTypeSelectionPlan,
  span: (node: Node) => InventorySpan,
  replay: (span: InventorySpan) => Node,
): NativeTypeSelections {
  const facts = typeSelectionsSchema(spanSchema).parse(wire);
  if (JSON.stringify(facts.plan) !== JSON.stringify(mapTypeSelectionPlan(plan, span))) {
    throw new Error("native Type selection plan is foreign");
  }
  return { ...facts, plan: mapTypeSelectionPlan(facts.plan, replay) };
}
